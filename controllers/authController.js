const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
require("dotenv").config();
const { pool } = require("../config/db");
const sequelize = require("../config/db");

/**
 *  Admin registers new employee/intern
 * Endpoint: POST /api/auth/register
 * Access: Admin only
 */

exports.initialAdminRegister = async (req, res) => {
  try {
    console.log("Data", req.body);
    let { name, user_id, emp_id, password } = req.body;

    // Trim values
    name = name.trim();
    user_id = user_id.trim();
    emp_id = emp_id.trim();
    const role = "admin";

    // Check if an admin already exists
    const existingAdmin = await User.findOne({ where: { role } });
    if (existingAdmin) {
      return res.status(403).json({ message: "Admin already exists!" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create admin user
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

exports.register = async (req, res) => {
  try {
    console.log("Register Request Body:", req.body);

    let { emp_id, name, user_id, password, department } = req.body;

    // ✅ Trim inputs
    emp_id = emp_id?.trim();
    name = name?.trim();
    user_id = user_id?.trim();
    department = department ? department.trim() : null;

    // ✅ 1️⃣ Get the user info from the verified token
    const tokenUserId = req.user?.user_id; // user_id from token
    if (!tokenUserId) {
      return res.status(401).json({ message: "Unauthorized. Token missing or invalid." });
    }

    // ✅ 2️⃣ Verify that the token user exists and is an Admin
    const adminUser = await User.findOne({ where: { user_id: tokenUserId } });
    if (!adminUser) {
      return res.status(403).json({ message: "Access denied. User not found in database." });
    }

    if (adminUser.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Access denied. Only admins can register new users." });
    }

    // ✅ 3️⃣ Check if the new user already exists
    const existingUser = await User.findOne({ where: { user_id } });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // ✅ 4️⃣ Hash password and create user
    const hashedPassword = await bcrypt.hash(password.trim(), 12);

    const newUser = await User.create({
      emp_id,
      name,
      user_id,
      password: hashedPassword,
      role: "Employee", // or "Employee", depending on your structure
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



/**
 * 🔑 Login (Admin / User)
 * Endpoint: POST /api/auth/login
 * Access: Public
 */
exports.login = async (req, res) => {
  try {
    let { emp_id, password } = req.body;

    if (!emp_id || !password) {
      return res.status(400).json({ message: "Please provide emp_id and password" });
    }

    // Trim inputs
    emp_id = emp_id.trim();
    password = password.trim();

    // Find user by emp_id (string)
    const user = await User.findOne({ where: { emp_id } });

    if (!user) {
      return res.status(400).json({ message: "Invalid emp_id or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid emp_id or password" });
    }


    // console.log("env ", process.env.JWT_SECRET);
    // Generate JWT
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
    // console.log("token", token);
    res.status(200).json({ message: "Login successful", token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
};




exports.getAllUsers = (req, res) => {
  User.getAll((err, results) => {
    if (err) return res.status(500).json({ message: "Error fetching users" });
    res.status(200).json(results);
  });
};

// 👑 Admin: Update user
exports.updateUser = (req, res) => {
  const { id } = req.params;
  const { name, user_id, role } = req.body;

  User.update(id, { name, user_id, role }, (err) => {
    if (err) return res.status(500).json({ message: "Error updating user" });
    res.status(200).json({ message: "User updated successfully!" });
  });
};

// 👑 Admin: Delete user
// In userController.js
exports.deleteUser = (req, res) => {
  const { id } = req.params;

  // First delete attendance records
  const deleteAttendanceSql = "DELETE FROM attendance WHERE user_id = ?";
  pool.query(deleteAttendanceSql, [id], (err) => {
    if (err) return res.status(500).json({ message: "Error deleting attendance" });

    // Then delete the user
    const deleteUserSql = "DELETE FROM users WHERE id = ?";
    pool.query(deleteUserSql, [id], (err) => {
      if (err) return res.status(500).json({ message: "Error deleting user" });
      res.status(200).json({ message: "User deleted successfully" });
    });
  });
};

