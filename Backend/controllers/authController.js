const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
require("dotenv").config();

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
    ADMIN REGISTERS EMPLOYEE/INTERN
----------------------------------------------------*/
exports.register = async (req, res) => {
  try {
    let { emp_id, name, user_id, password, department } = req.body;

    emp_id = emp_id?.trim();
    name = name?.trim();
    user_id = user_id?.trim();
    department = department ? department.trim() : null;

    const tokenUserId = req.user?.user_id;
    if (!tokenUserId) {
      return res.status(401).json({ message: "Unauthorized. Token missing or invalid." });
    }

    const adminUser = await User.findOne({ where: { user_id: tokenUserId } });
    if (!adminUser || adminUser.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Access denied. Only admins can register new users." });
    }

    const existingUser = await User.findOne({ where: { user_id } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 12);
    const role = "User";
    const newUser = await User.create({
      emp_id,
      name,
      user_id,
      password: hashedPassword,
      role,
      department,
    });

    res.status(201).json({
      message: "User registered successfully",
      user: newUser,
      registeredBy: adminUser.user_id,
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

    if (!user) {
      return res.status(400).json({ message: "Invalid emp_id or password" });
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid emp_id or password" });
    }
    if (!user.role || user.role.trim() === "") {
      user.role = "User";   // fallback so login never returns empty role
    }
    const token = jwt.sign(
      {
        id: user.id,
        emp_id: user.emp_id,
        name: user.name,
        user_id: user.user_id,
        role: user.role,
        department: user.department,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(200).json({ message: "Login successful", token, user });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
};


/*----------------------------------------------------
    GET ALL USERS (ADMIN)
----------------------------------------------------*/
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users", error: err.message });
  }
};


/*----------------------------------------------------
    UPDATE USER (ADMIN)
----------------------------------------------------*/
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, user_id, role } = req.body;

    await User.update(
      { name, user_id, role },
      { where: { id } }
    );

    res.status(200).json({ message: "User updated successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error updating user", error: err.message });
  }
};


/*----------------------------------------------------
    DELETE USER + ATTENDANCE (ADMIN)
----------------------------------------------------*/
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await Attendance.destroy({ where: { user_id: id } });
    await User.destroy({ where: { id } });

    res.status(200).json({ message: "User deleted successfully!" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user", error: err.message });
  }
};
