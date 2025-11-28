const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
require("dotenv").config();
const { Sequelize, Op, fn, col, where } = require("sequelize");
const Todo = require("../models/Todo");
const IdentityCard = require("../models/IdentityCard");
const WorkSession = require("../models/WorkSession");
const timeSlots = require("../utils/timeSlots");
const PermissionPreset = require("../models/PermissionPreset");
const Permissions = require("../models/Permissions");
const { getLoginDelay, checkLoginRateLimit, handleFailedLogin, resetLoginAttempts } = require("../utils/loginRateLimit");
const { generateRefreshToken, hashToken, } = require("../utils/token");
const { getRefreshExpiry, getMaxExpiry } = require("../utils/sessionExpiry");
const { createSession, generateAccessToken  } = require("../utils/sessionManager");
const Session = require("../models/Session");
const crypto = require("crypto");
const { generateCsrfToken } = require("../middlewares/csrfProtection"); 



// ----------------------------------------
// HELPER: hash refresh token (top)
// ----------------------------------------
// function hashToken(token) {
//   return crypto.createHash("sha256").update(token).digest("hex");
// }

exports.logout = async (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(400).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    // ⛔ Add token to blacklist (optional, if you implement it)
    await BlacklistToken.create({ token });

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Server error during logout" });
  }
};

/*----------------------------------------------------
    ADMIN REGISTERS FIRST ADMIN ONLY ONCE
----------------------------------------------------*/
exports.initialAdminRegister = async (req, res) => {
  try {
    let { name, user_id, emp_id, password } = req.body;

    name = name.trim();
    user_id = user_id.trim();
    emp_id = emp_id.trim();

    const role = "admin";

    const existingAdmin = await User.findOne({ where: { role } });
    if (existingAdmin) {
      return res.status(403).json({ message: "Admin already exists!" });
    }

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      name,
      emp_id,
      user_id,
      password: hashed,
      role,
    });

    res.status(201).json({ message: "Admin created successfully!" });
  } catch (error) {
    console.error("Error in initialAdminRegister:", error);
    res.status(500).json({ error: error.message });
  }
};

/*----------------------------------------------------
    ADMIN REGISTERS EMPLOYEE
----------------------------------------------------*/

function incrementSerial(serial) {
  const chars = [
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    ...'abcdefghijklmnopqrstuvwxyz',
    ...'123456789'
  ];
  const base = chars.length;

  let num = 0;
  for (let i = 0; i < serial.length; i++) {
    num = num * base + chars.indexOf(serial[i]);
  }

  num++;

  let newSerial = "";
  for (let i = 0; i < 4; i++) {
    newSerial = chars[num % base] + newSerial;
    num = Math.floor(num / base);
  }

  return newSerial;
}

exports.register = async (req, res) => {
  try {
    const {
      name, user_id, password, role, department,
      member_type, team_name, status,
      birthdate, primary_contact, contacts,
      address_line1, address_line2, city, state, country,
      pin_code, profile_pic, slot_id
    } = req.body;

    // -----------------------------------------
    // 1️⃣ BASIC REQUIRED FIELD VALIDATION
    // -----------------------------------------
    if (!name || !user_id || !password || !member_type || !team_name || !address_line1 || !pin_code) {
      return res.status(400).json({ message: "Required fields missing!" });
    }

    // -----------------------------------------
    // 2️⃣ PASSWORD VALIDATION
    // -----------------------------------------
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@_])[A-Za-z\d@_]{8}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be EXACTLY 8 characters with proper rules"
      });
    }

    // -----------------------------------------
    // 3️⃣ **PERMISSION VALIDATION**
    // -----------------------------------------
    let manualPermissions = req.body.permission_ids;

    // Case 1: undefined → missing from request
    if (manualPermissions === undefined) {
      return res.status(400).json({ message: "permission_ids is required" });
    }

    // Case 2: If sent as comma-separated string → "1,2,3"
    if (typeof manualPermissions === "string") {
      try {
        // If JSON string "[1,2,3]"
        const parsed = JSON.parse(manualPermissions);
        manualPermissions = parsed;
      } catch {
        // If normal CSV "1,2,3"
        manualPermissions = manualPermissions
          .split(",")
          .map(v => v.trim());
      }
    }

    // Case 3: If single number
    if (typeof manualPermissions === "number") {
      manualPermissions = [manualPermissions];
    }

    // Case 4: Must be array now
    if (!Array.isArray(manualPermissions)) {
      return res.status(400).json({ message: "permission_ids must be an array" });
    }

    // Convert all to numbers
    manualPermissions = manualPermissions.map(id => Number(id)).filter(id => !isNaN(id));

    // Remove duplicates
    manualPermissions = [...new Set(manualPermissions)];

    // Empty array → not allowed
    if (manualPermissions.length === 0) {
      return res.status(400).json({ message: "No permissions assigned" });
    }

    // Validate permissions in one query
    const validPermissions = await Permissions.findAll({
      where: { id: manualPermissions },
      attributes: ["id"]
    });

    const validIds = validPermissions.map(p => p.id);

    if (validIds.length !== manualPermissions.length) {
      const invalidIds = manualPermissions.filter(id => !validIds.includes(id));
      return res.status(400).json({
        message: "Some permissions are invalid",
        invalid_ids: invalidIds
      });
    }


    // ---------------------------------------------------------
    // Permission validation PASSED → Proceed further
    // ---------------------------------------------------------

    // -----------------------------------------
    // 4️⃣ EMP_ID GENERATION
    // -----------------------------------------
    const joining_date = req.body.joining_date
      ? req.body.joining_date
      : new Date().toISOString().split("T")[0];

    const teamCodes = { shdpixel: "01", metamatrix: "02", aibams: "03" };
    const normalizedTeam = team_name.toLowerCase();
    const year = joining_date.split("-")[0];

    const lastUser = await User.findOne({
      where: {
        member_type,
        team_name: normalizedTeam,
        emp_id: { [Op.like]: `${member_type}${teamCodes[normalizedTeam]}${year}%` }
      },
      order: [["id", "DESC"]],
    });

    let serial = "AAAA";
    if (lastUser && lastUser.emp_id) {
      const lastSerial = lastUser.emp_id.slice(-4);
      serial = incrementSerial(lastSerial);
    }

    const emp_id = `${member_type}${teamCodes[normalizedTeam]}${year}${serial}`;

    // -----------------------------------------
    // 5️⃣ DUPLICATE EMAIL CHECK
    // -----------------------------------------
    const existing = await User.findOne({ where: { user_id } });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    // -----------------------------------------
    // 6️⃣ HASH PASSWORD & SLOT VALIDATION
    // -----------------------------------------
    const hashedPassword = await bcrypt.hash(password.trim(), 12);

    const slot = timeSlots[slot_id];
    if (!slot) return res.status(400).json({ message: "Invalid slot_id" });

    // -----------------------------------------
    // 7️⃣ CREATE USER (SAFE - After permission validation)
    // -----------------------------------------
    const newUser = await User.create({
      emp_id,
      name,
      user_id,
      password: hashedPassword,
      role: role || "User",
      department,
      joining_date,
      status: status || "active",
      birthdate,
      primary_contact,
      contacts,
      slot: slot,
      member_type,
      team_name,
      address_line1,
      address_line2,
      city: city || "Vadodara",
      state: state || "Gujarat",
      country: country || "India",
      pin_code,
      profile_pic,
      permission_ids: manualPermissions
    });

    // -----------------------------------------
    // 8️⃣ CREATE IDENTITY CARD
    // -----------------------------------------
    await IdentityCard.create({
      user_id: newUser.id,
      emp_id: newUser.emp_id,
      display_user: {
        name: newUser.name,
        user_id: newUser.user_id,
        department: newUser.department,
        member_type: newUser.member_type,
        team_name: newUser.team_name,
        joining_date: newUser.joining_date,
        previous_emp_ids: "",
        permissions: manualPermissions
      },
      permission_ids: manualPermissions
    });

    // -----------------------------------------
    // 9️⃣ CREATE WORK SESSION
    // -----------------------------------------
    await WorkSession.create({
      emp_id,
      name: newUser.name,
      start_time: slot.start_time,
      end_time: slot.end_time
    });

    // -----------------------------------------
    // 🔟 SUCCESS RESPONSE
    // -----------------------------------------
    res.status(201).json({
      message: "User registered successfully",
      emp_id_generated: emp_id,
      user: newUser
    });

  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
};

/*----------------------------------------------------
    LOGIN (ADMIN & EMPLOYEE)
----------------------------------------------------*/
exports.login = async (req, res) => {
  try {
    let { emp_id, password } = req.body;

    if (!emp_id || !password) {
      return res.status(400).json({ message: "Please provide emp_id and password" });
    }

    emp_id = emp_id.trim();

    // ----------------------------------------------------------
    // 1️⃣ CHECK IF ADMIN LOGIN (directly from users table)
    // ----------------------------------------------------------
    let adminUser = await User.findOne({ where: { emp_id } });

    if (adminUser && adminUser.role === "Admin") {
      const isMatch = await bcrypt.compare(password.trim(), adminUser.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Incorrect password" });
      }

      // Create session for Admin (permissions = "*")
      const { access_token, refresh_token } = await createSession(
        adminUser,
        req,
        res,
        { permissions: ["*"] }
      );

      //const csrfToken = generateCsrfToken(refresh_token);

      return res.status(200).json({
        message: "Admin login successful",
        // access_token,
        // refresh_token,
        user: {
          id: adminUser.id,
          name: adminUser.name,
          emp_id: adminUser.emp_id,
          role: adminUser.role,
          department: adminUser.department,
          permissions: ["*"],
        },
        //csrfToken
      });
    }

    // ----------------------------------------------------------
    // 2️⃣ NORMAL USER LOGIN — first validate emp_id from Identity Card
    // ----------------------------------------------------------
    const identity = await IdentityCard.findOne({ where: { emp_id } });
    if (!identity) {
      return res.status(400).json({ message: "Invalid emp_id" });
    }

    const user_id = identity.user_id;

    // 3️⃣ Rate-limit check for normal users
    const limit = await checkLoginRateLimit(emp_id, user_id);
    if (!limit.allowed) {
      return res.status(429).json({
        message: "Too many failed attempts. Try again later.",
        retry_after_seconds: limit.wait
      });
    }

    // 4️⃣ Fetch actual user from users table
    const user = await User.findByPk(user_id);
    if (!user) {
      await handleFailedLogin(user_id);
      return res.status(400).json({ message: "User not found" });
    }

    if (user.status === "deactivated") {
      return res.status(403).json({ message: "Your account is deactivated." });
    }

    // 5️⃣ Password verify from users table
    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      await handleFailedLogin(user_id);
      return res.status(400).json({ message: "Incorrect password" });
    }

    await resetLoginAttempts(user_id);

    // 6️⃣ Parse permissions from identity.display_user
    let displayUser = identity.display_user;
    if (typeof displayUser === "string") {
      displayUser = JSON.parse(displayUser);
    }

    const permissions = Array.isArray(displayUser.permissions)
      ? displayUser.permissions
      : [];

    // 7️⃣ Create Session
    const { access_token, refresh_token } = await createSession(
      user,
      req,
      res,
      { permissions }
    );

    //const csrfToken = generateCsrfToken(refresh_token);

    return res.status(200).json({
      message: "Login successful",
      // access_token,
      // refresh_token,
      user: {
        id: user.id,
        name: user.name,
        emp_id: identity.emp_id,
        role: user.role,
        department: user.department,
        permissions,
        displayUser
      },
     // csrfToken
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/*----------------------------------------------------*/


// exports.login = async (req, res) => {
//   try {
//     let { emp_id, password } = req.body;

//     if (!emp_id || !password) {
//       return res.status(400).json({ message: "Please provide emp_id and password" });
//     }

//     emp_id = emp_id.trim();

//     // 1️⃣ CHECK IF ADMIN LOGIN
//     let user = await User.findOne({ where: { emp_id } });

//     if (user && user.role === "Admin") {
//       // ADMIN --> validate directly from USER table

//       const isMatch = await bcrypt.compare(password.trim(), user.password);

//       if (!isMatch) {
//         return res.status(400).json({ message: "Incorrect password" });
//       }

//       // req.session.user = {
//       //   id: user.id,
//       //   emp_id: user.emp_id,
//       //   name: user.name,
//       //   user_id: user.user_id,
//       //   role: user.role,
//       //   department: user.department,
//       // };

//       // Issue JWT for admin
//       const token = jwt.sign(
//         {
//           id: user.id,
//           emp_id: user.emp_id,
//           name: user.name,
//           user_id: user.user_id,
//           role: user.role,
//           department: user.department,
//           joining_date: user.joining_date,
//           permissions: ["*"],
//         },
//         process.env.JWT_SECRET,
//         { expiresIn: "1h" }
//       );

//       return res.status(200).json({
//         message: "Admin login successful",
//         token,
//         user,
//       });
//     }

//     // 2️⃣ NORMAL USER LOGIN - Fetch emp_id from IdentityCard
//     const identity = await IdentityCard.findOne({ where: { emp_id } });

//     if (!identity) {
//       return res.status(400).json({ message: "Invalid emp_id" });
//     }

//     let displayUser = identity.display_user;
//     if (typeof displayUser === "string") {
//       displayUser = JSON.parse(displayUser);
//     }

//     let permissions = Array.isArray(displayUser.permissions) ? displayUser.permissions : [];

//     if (identity && identity.display_user && Array.isArray(identity.display_user.permissions)) {
//       permissions = identity.display_user.permissions;
//     }

//     // Now fetch user using identity.user_id (FK)
//     user = await User.findOne({ where: { id: identity.user_id } });

//     if (!user) {
//       return res.status(400).json({ message: "User not found for this Identity Card" });
//     }

//     if (user.status === "deactivated") {
//       return res.status(403).json({ message: "Your account is deactivated." });
//     }

//     // Compare password from User table
//     const isMatch = await bcrypt.compare(password.trim(), user.password);

//     if (!isMatch) {
//       return res.status(400).json({ message: "Incorrect password" });
//     }

//     if (!user.role || user.role.trim() === "") {
//       user.role = "User";
//     }


//     // req.session.user = {
//     //   id: user.id,
//     //   emp_id: identity.emp_id,
//     //   name: user.name,
//     //   user_id: user.user_id,
//     //   role: user.role,
//     //   department: user.department,
//     //  // permissions: permissions,
//     // };
//     // Generate JWT
//     const token = jwt.sign(
//       {
//         id: user.id,
//         emp_id: identity.emp_id,   // emp_id from identity card
//         name: user.name,
//         user_id: user.user_id,
//         role: user.role,
//         department: user.department,
//         joining_date: user.joining_date,
//         permissions: permissions
//       },
//       process.env.JWT_SECRET,
//       { expiresIn: "1h" }
//     );

//     return res.status(200).json({
//       message: "Login successful",
//       token,
//       user,
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };



exports.refreshAccessToken = async (req, res) => {
  try {
    const refresh_token = req.cookies.refresh_token;

    if (!refresh_token) {
      return res.status(401).json({ message: "No refresh token provided" });
    }

    const refresh_hash = crypto
      .createHash("sha256")
      .update(refresh_token)
      .digest("hex");

    const session = await Session.findOne({ where: { refresh_token_hash: refresh_hash, revoked: false } });

    if (!session) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    if (new Date() > session.refresh_expires_at) {
      return res.status(401).json({ message: "Refresh token expired" });
    }

    // Fetch user
    const user = await session.getUser();
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Generate a new JWT access token
    const new_access_token = generateAccessToken(user);

    // Update last used time
    session.last_used_at = new Date();
    await session.save();

    return res.json({
      access_token: new_access_token
    });

  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};


// exports.refresh = async (req, res) => {
//   try {
//     const refresh = req.cookies.refresh_token;
//     if (!refresh) return res.status(401).json({ message: "No refresh token" });

//     const hash = hashToken(refresh);

//     // 1️⃣ Find valid session
//     const oldSession = await Session.findOne({
//       where: { refresh_token_hash: hash, revoked: false }
//     });

//     if (!oldSession) {
//       return res.status(403).json({ message: "Invalid refresh token" });
//     }

//     // 2️⃣ Expiry checks
//     const now = new Date();

//     if (now > oldSession.refresh_expires_at) {
//       oldSession.revoked = true;
//       oldSession.revoked_reason = "Refresh expired";
//       await oldSession.save();
//       return res.status(403).json({ message: "Refresh expired" }); 
//     }

//     if (now > oldSession.max_expires_at) {
//       oldSession.revoked = true;
//       oldSession.revoked_reason = "Max session expired (2 days)";
//       await oldSession.save();
//       return res.status(403).json({ message: "Full session lifetime ended" });
//     }

//     // 3️⃣ HIJACK CHECK (IP mismatch)
//     if (oldSession.device_info && oldSession.device_info.ip !== req.ip) {
//       oldSession.revoked = true;
//       oldSession.revoked_reason = "Session hijack detected";
//       await oldSession.save();

//       res.clearCookie("refresh_token");
//       return res.status(403).json({ message: "Session revoked: hijack detected" });
//     }

//     // 4️⃣ ROTATE TOKEN  → Create NEW session row
//     const newRefresh = generateRefreshToken();
//     const newHash = hashToken(newRefresh);
//     const newAccess = generateAccessToken();

//     const newSession = await Session.create({
//       user_id: oldSession.user_id,
//       refresh_token_hash: newHash,
//       access_token: newAccess,
//       device_info: oldSession.device_info,
//       issued_at: new Date(),
//       refresh_expires_at: getRefreshExpiry(), // +30m
//       max_expires_at: oldSession.max_expires_at,
//       rotated_from: oldSession.id
//     });

//     // Link the old session forward
//     oldSession.rotated_to = newSession.id;
//     oldSession.revoked = true;
//     oldSession.revoked_reason = "Rotated";
//     await oldSession.save();

//     // 5️⃣ Send rotated refresh token in cookie
//     res.cookie("refresh_token", newRefresh, {
//       httpOnly: true,
//       secure: true,
//       sameSite: null,
//       maxAge: 30 * 60 * 1000 // 30m
//     });

//     return res.json({ access_token: newAccess });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Internal error" });
//   }
// };



// 📌 Get Today's Attendance Status for a User
// exports.getTodayAttendanceStatus = async (req, res) => {
//   try {
//     // emp_id from token — NOT from request params
//     const emp_id = req.user.emp_id;

//     if (!emp_id) {
//       return res.status(400).json({ message: "emp_id missing from token" });
//     }

//     // Find Employee
//     const user = await User.findOne({ where: { emp_id } });
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Get today's date
//     const today = new Date().toISOString().split("T")[0];

//     // Fetch today's attendance
//     const attendance = await Attendance.findOne({
//       where: { emp_id, date: today }
//     });

//     const attendanceStatus = {
//       punched_in: attendance?.time_in ? true : false,
//       punched_out: attendance?.time_out ? true : false,
//       status: attendance?.status || "not set",
//       time_in: attendance?.time_in || null,
//       time_out: attendance?.time_out || null,
//       working_hours: attendance?.working_hours || "00:00:00"
//     };

//     res.json({
//       emp_id,
//       date: today,
//       attendanceStatus
//     });

//   } catch (err) {
//     console.error("Attendance Status Error:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

/*----------------------------------------------------
    GET ALL USERS (ADMIN)
----------------------------------------------------*/
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        role: { [Op.ne]: "admin" }
      },
      include: [
        {
          model: IdentityCard,
          as: 'identityCard',   // ✅ must match your association alias
          attributes: ['emp_id']
        }
      ],
    });

    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({
      message: "Error fetching users",
      error: err.message
    });
  }
};



/*---------------------------------------------------------
    FUNCTION: CREATE NEW USER WHEN INT → EMP
---------------------------------------------------------*/
// ==========================================
// 🔥 API: Convert Intern → Employee
// POST /users/convert-intern/:emp_id
// ==========================================
exports.convertInternToEmployee = async (req, res) => {
  try {
    const empId = req.params.emp_id;

    // 1️⃣ Fetch identity card by emp_id
    const identity = await IdentityCard.findOne({
      where: { emp_id: empId },
      include: [{
        model: User,
        as: "user"   // ⭐ MUST MATCH ASSOCIATION ALIAS
      }]
    });

    if (!identity) {
      return res.status(404).json({ message: "Intern not found" });
    }

    const oldUser = identity.user;

    // 2️⃣ Check member_type
    if (oldUser.member_type !== "INT") {
      return res.status(400).json({ message: "This user is not an intern" });
    }

    // 3️⃣ Convert to Employee (existing convertUser logic)
    await convertUser(oldUser, "EMP", req, res);

    // 4️⃣ Fetch the newly created employee
    const newUser = await User.findOne({
      where: { user_id: oldUser.user_id, member_type: "EMP" },
      order: [["id", "DESC"]]
    });

    if (!newUser) {
      return res.status(500).json({ message: "Employee conversion failed" });
    }

    // 5️⃣ Update additional fields (including member_type or team_name change)
    await normalUpdateUser(newUser, req, res);

  } catch (err) {
    console.error("Error in conversion:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// ==========================================
// 🔧 Helper Function (your logic here)
// ==========================================
async function convertUser(oldUser, newType, req, res) {
  try {
    const body = req.body || {};
    const { name, user_id, department, team_name, joining_date, password } = body;

    // -----------------------------
    // fetch identity card of old user
    // -----------------------------
    const oldIdentity = await IdentityCard.findOne({
      where: { userId: oldUser.id }
    });

    if (!oldIdentity) {
      return res.status(400).json({ message: "Identity card missing for user" });
    }

    const oldEmpId = oldIdentity.emp_id; // fetched from identity card

    // -----------------------------
    // TEAM CODES
    // -----------------------------
    const teamCodes = {
      shdpixel: "01",
      metamatrix: "02",
      aibams: "03",
    };

    const finalTeamName = (team_name || oldUser.team_name).toLowerCase();
    const teamCode = teamCodes[finalTeamName];
    if (!teamCode)
      return res.status(400).json({ message: "Invalid team_name" });

    // -----------------------------
    // YEAR from joining date
    // -----------------------------
    const finalJoiningDate =
      joining_date || oldUser.joining_date || new Date().toISOString().split("T")[0];

    const fullYear = finalJoiningDate.split("-")[0];

    // -----------------------------
    // FIND LAST IDENTITY CARD
    // -----------------------------
    const lastIdentity = await IdentityCard.findOne({
      where: {
        emp_id: { [Op.like]: `${newType}${teamCode}${fullYear}%` }
      },
      order: [["id", "DESC"]],
    });

    let serial = "AAAA";
    if (lastIdentity) {
      const lastSerial = lastIdentity.emp_id.slice(-4);
      serial = incrementSerial(lastSerial);
    }

    const newEmpId = `${newType}${teamCode}${fullYear}${serial}`;

    // -----------------------------
    // PASSWORD HASHING
    // -----------------------------
    let hashedPassword = oldUser.password;
    if (password && password.trim() !== "") {
      hashedPassword = await bcrypt.hash(password.trim(), 12);
    }
    const oldDisplay = typeof oldIdentity.display_user === "string"
      ? JSON.parse(oldIdentity.display_user)
      : oldIdentity.display_user || {};

    const oldPrevIds = oldDisplay.previous_emp_ids || [];
    const prevIdsArray = Array.isArray(oldPrevIds)
      ? [...oldPrevIds]
      : oldPrevIds.toString().split(",").filter(Boolean);

    prevIdsArray.push(oldEmpId);
    // -----------------------------
    // CREATE NEW USER
    // -----------------------------
    const newUser = await User.create({
      name: name || oldUser.name,
      user_id: user_id || oldUser.user_id,
      password: hashedPassword,
      role: "User",
      department: department || oldUser.department,
      member_type: newType,
      team_name: finalTeamName,
      joining_date: finalJoiningDate,
      status: "active",
      emp_id: newEmpId,
      address_line1: oldUser.address_line1,    // inherit from old user
      pin_code: oldUser.pin_code,              // inherit from old user
      slot: oldUser.slot,
      previous_emp_ids: oldUser.previous_emp_ids
        ? oldUser.previous_emp_ids + "," + oldEmpId
        : oldEmpId
    });

    // -----------------------------
    // CREATE NEW IDENTITY CARD
    // -----------------------------
    await IdentityCard.create({
      emp_id: newEmpId,
      user_id: newUser.id,
      display_user: {
        name: newUser.name,
        user_id: newUser.user_id,
        department: newUser.department,
        member_type: newUser.member_type,
        team_name: newUser.team_name,
        joining_date: newUser.joining_date,
        previous_emp_ids: prevIdsArray,
      }
    });

    // -----------------------------
    // MIGRATE TODO
    // -----------------------------
    await Todo.update(
      { emp_id: newEmpId },
      { where: { emp_id: oldEmpId } }
    );

    // -----------------------------
    // MIGRATE ATTENDANCE
    // -----------------------------
    const oldAttendance = await Attendance.findAll({
      where: { emp_id: oldEmpId }
    });

    for (const rec of oldAttendance) {
      const exists = await Attendance.findOne({
        where: { emp_id: newEmpId, date: rec.date }
      });

      if (!exists) {
        await Attendance.create({
          emp_id: newEmpId,
          date: rec.date,
          time_in: rec.time_in,
          time_out: rec.time_out,
          working_hours: rec.working_hours,
          status: rec.status,
          break_start: rec.break_start,
          break_end: rec.break_end,
          lunch_start: rec.lunch_start,
          lunch_end: rec.lunch_end,
          work_start: rec.work_start,
          work_end: rec.work_end,
          work_duration: rec.work_duration,
          key_learning: rec.key_learning,
          office_hours: rec.office_hours,
        });
      }
    }

    // -----------------------------
    // DEACTIVATE OLD USER
    // -----------------------------
    await oldUser.update({ status: "deactivated" });

    return res.status(200).json({
      message: `Converted to ${newType}`,
      new_emp_id: newEmpId,
      old_emp_id: oldEmpId,
      new_user_id: newUser.id
    });

  } catch (err) {
    console.error("Conversion Error:", err);
    return res.status(500).json({
      message: "Conversion failed",
      error: err.message,
    });
  }
}


/*---------------------------------------------------------
    NORMAL UPDATE FUNCTION (no INT → EMP)
---------------------------------------------------------*/
async function normalUpdateUser(user, req, res) {
  try {
    const {
      name, user_id, role, department, member_type,
      team_name, joining_date, password, slot_id, birthdate,
      primary_contact,
      contacts,
      address_line1,
      address_line2,
      city,
      state,
      country,
      pin_code,
      profile_pic
    } = req.body;

    const updatePayload = {
      name: name || user.name,
      user_id: user_id || user.user_id,
      role: role || user.role,
      department: department || user.department,
      member_type: member_type || user.member_type,
      team_name: team_name || user.team_name,
      joining_date: joining_date || user.joining_date,
      birthdate: birthdate || user.birthdate,
      primary_contact: primary_contact || user.primary_contact,
      contacts: contacts || user.contacts,
      address_line1: address_line1 || user.address_line1,
      address_line2: address_line2 || user.address_line2,
      city: city || user.city,
      state: state || user.state,
      country: country || user.country,
      pin_code: pin_code || user.pin_code,
      profile_pic: profile_pic || user.profile_pic
    };

    // ⭐ If slot_id is given, update slot
    if (slot_id) {
      const slot = timeSlots[slot_id];
      if (!slot) {
        return res.status(400).json({ message: "Invalid slot_id" });
      }
      updatePayload.slot = slot;   // stores JSON {start_time, end_time}
    }

    // 🔑 Update password
    if (password && password.trim() !== "") {
      updatePayload.password = await bcrypt.hash(password.trim(), 12);
    }

    await user.update(updatePayload);

    return res.status(200).json({
      message: "User updated successfully",
      updated_data: updatePayload,
    });

  } catch (err) {
    console.error("Normal Update Error:", err);
    res.status(500).json({ message: "Error", error: err.message });
  }
}

/*----------------------------------------------------
    UPDATE USER (ADMIN)
----------------------------------------------------*/
exports.updateUserByEmpId = async (req, res) => {
  try {
    const { empId } = req.params;
    const { name, user_id, role, department, member_type, team_name, joining_date, password, slot_id } = req.body;

    // 1️⃣ Find IdentityCard by emp_id
    const identity = await IdentityCard.findOne({
      where: { emp_id: empId }
    });

    if (!identity) {
      return res.status(404).json({ message: "Identity Card not found for this EMP ID" });
    }

    // 2️⃣ Get user_id from IdentityCard
    const userId = identity.user_id;

    // 3️⃣ Find User using user_id
    const oldUser = await User.findOne({
      where: { id: userId }
    });

    if (!oldUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 4️⃣ NORMAL USER UPDATE (Use your existing update logic)
    return await normalUpdateUser(oldUser, req, res);

  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: "Error updating user", error: err.message });
  }
};



/*----------------------------------------------------
    DELETE USER + ATTENDANCE (ADMIN)
----------------------------------------------------*/
exports.deleteUser = async (req, res) => {
  try {
    const { emp_id } = req.params;

    const user = await User.findOne({ where: { emp_id } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is already deactivated
    if (user.status === "deactivated") {
      return res.status(400).json({
        message: "User is already deactivated",
        emp_id: user.emp_id,
        status: user.status
      });
    }

    // Deactivate the user instead of deleting
    const updatedUser = await user.update({ status: "deactivated" });

    res.status(200).json({
      message: "User deactivated successfully! No data deleted.",
      emp_id: updatedUser.emp_id,
      status: updatedUser.status,
      deactivatedAt: new Date()  // optional: timestamp of deactivation
    });

  } catch (err) {
    res.status(500).json({
      message: "Error deactivating user",
      error: err.message
    });
  }
};
