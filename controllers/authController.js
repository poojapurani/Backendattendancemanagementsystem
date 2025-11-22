const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
require("dotenv").config();
const { Op, fn, col, where } = require("sequelize");

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
exports.register = async (req, res) => {
  try {
    const { name, user_id, password, department, member_type, team_name } = req.body;

    // Validate required fields
    if (!name || !user_id || !password || !member_type || !team_name) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const joining_date = req.body.joining_date 
      ? req.body.joining_date 
      : new Date().toISOString().split("T")[0];

    // TEAM CODE MAP
    const teamCodes = {
      shdpixel: "01",
      metamatrix: "02",
      aibams: "03",
    };

    // 1️⃣ Extract year last 2 digits
    const year = joining_date.split("-")[0].slice(2); // "2025" → "25"

    // 2️⃣ Find last serial no
    const lastUser = await User.findOne({
      where: { member_type, team_name },
      order: [["id", "DESC"]],
    });

    let serial = 1;

    if (lastUser && lastUser.emp_id) {
      const lastSerial = lastUser.emp_id.slice(-3); // last 3 digits
      serial = parseInt(lastSerial) + 1;
    }

    const serialStr = String(serial).padStart(3, "0"); // 001, 002, 003

    // 3️⃣ Final emp_id generation
    const emp_id = `${member_type}${teamCodes[team_name.toLowerCase()]}${year}${serialStr}`;

    // Check existing user
    const existing = await User.findOne({ where: { user_id } });
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 4️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password.trim(), 12);

    const newUser = await User.create({
      emp_id,
      name,
      user_id,
      password: hashedPassword,
      role: "User",
      department,
      member_type,
      team_name,
      joining_date,
    });

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

    const user = await User.findOne({ where: { emp_id: emp_id.trim() } });

    // const fetchIds = [
    //   user.emp_id,
    //   ...(user.previous_emp_ids || [])
    // ];

    //  emp_id incorrect
    if (!user) {
      return res.status(400).json({ message: "Invalid emp_id" });
    }
    
    
    if (user.status === "deactivated") {
      return res.status(403).json({
        message: "Your account is deactivated."
      });
    }


    const isMatch = await bcrypt.compare(password.trim(), user.password);

    //  password incorrect
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    if (!user.role || user.role.trim() === "") {
      user.role = "User";  
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        emp_id: user.emp_id,
        name: user.name,
        user_id: user.user_id,
        role: user.role,
        department: user.department,
        joining_date: user.joining_date,
        // status: user.status,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
};

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
      where: where(
        fn("LOWER", col("role")),
        { [Op.ne]: "admin" }   // case-insensitive check
      )
    });

    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err.message });
  }
};


/*---------------------------------------------------------
    FUNCTION: CREATE NEW USER WHEN INT → EMP
---------------------------------------------------------*/
async function createNewEmployeeFromIntern(oldUser, req, res) {
  try {
    const { name, user_id, department, team_name, joining_date, password } = req.body;

    const teamCodes = {
      shdpixel: "01",
      metamatrix: "02",
      aibams: "03",
    };

    const finalTeamName = (team_name || oldUser.team_name).toLowerCase();
    const teamCode = teamCodes[finalTeamName];
    if (!teamCode) {
      return res.status(400).json({ message: "Invalid team_name" });
    }

    // Extract old year digits: INT010325001 → 25
    const yearDigits = oldUser.emp_id.slice(5, 7);

    // Find last EMP serial for this team + year
    const lastUser = await User.findOne({
      where: { emp_id: { [Op.like]: `EMP${teamCode}${yearDigits}%` } },
      order: [["emp_id", "DESC"]],
    });

    let newSerial = "001";
    if (lastUser) {
      const lastSerial = parseInt(lastUser.emp_id.slice(-3));
      newSerial = String(lastSerial + 1).padStart(3, "0");
    }

    const newEmpId = `EMP${teamCode}${yearDigits}${newSerial}`;

    // Add old emp_id to previous_emp_ids
    const prevIds = oldUser.previous_emp_ids
      ? oldUser.previous_emp_ids.split(",")
      : [];

    if (!prevIds.includes(oldUser.emp_id)) {
      prevIds.push(oldUser.emp_id);
    }

    // Hash password if needed
    let hashed = oldUser.password;
    if (password && password.trim() !== "") {
      hashed = await bcrypt.hash(password.trim(), 12);
    }

    // Create NEW USER
    const newUser = await User.create({
      emp_id: newEmpId,
      name: name || oldUser.name,
      user_id: user_id || oldUser.user_id,
      password: hashed,
      role: "User",
      department: department || oldUser.department,
      member_type: "EMP",
      team_name: finalTeamName,
      joining_date: joining_date || oldUser.joining_date,
      previous_emp_ids: prevIds.join(","),
    });

    // OPTIONAL: deactivate intern
    await oldUser.update({ status: "deactivated" });

    return res.status(201).json({
      message: "INT upgraded to EMP - new user created successfully",
      new_emp_id: newEmpId,
      new_user: newUser,
      old_user_status: "deactivated",
    });

  } catch (err) {
    console.error("INT → EMP Error:", err);
    res.status(500).json({ message: "Failed to upgrade user", error: err.message });
  }
}


/*---------------------------------------------------------
    NORMAL UPDATE FUNCTION (no INT → EMP)
---------------------------------------------------------*/
async function normalUpdateUser(user, req, res) {
  try {
    const { name, user_id, role, department, member_type, team_name, joining_date, password } = req.body;

    const updatePayload = {
      name: name || user.name,
      user_id: user_id || user.user_id,
      role: role || user.role,
      department: department || user.department,
      member_type: member_type || user.member_type,
      team_name: team_name || user.team_name,
      joining_date: joining_date || user.joining_date,
    };

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
    const { name, user_id, role, department, member_type, team_name, joining_date, password } = req.body;

    // 1) Fetch OLD USER
    const oldUser = await User.findOne({ where: { emp_id: empId } });

    if (!oldUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldEmpId = oldUser.emp_id;
    const oldMemberType = oldUser.member_type.toUpperCase();
    const newMemberType = (member_type || oldMemberType).toUpperCase();

    // ❗ Only create NEW user when INT → EMP
    if (oldMemberType === "INT" && newMemberType === "EMP") {
      return await createNewEmployeeFromIntern(oldUser, req, res);
    }

    // If no INT → EMP, perform normal update
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
        message: "User is already deactivated"
      });
    }

    // Deactivate the user instead of deleting
    await user.update({ status: "deactivated" });

    res.status(200).json({
      message: "User deactivated successfully! No data deleted."
    });

  } catch (err) {
    res.status(500).json({
      message: "Error deactivating user",
      error: err.message
    });
  }
};
