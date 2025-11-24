const jwt = require("jsonwebtoken");
require("dotenv").config();
const Attendance = require("../models/Attendance");


/**
 * ✅ Verify JWT Token Middleware
 * - Checks for token in Authorization header
 * - Decodes and attaches user data to req.user
 */
exports.verifyToken = (req, res, next) => {
  // console.log("verifyToken running");
  const authHeader = req.headers.authorization;
  // console.log("Auth Header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("Decoded JWT:", decoded);

    req.user = {
      id: decoded.id,
      emp_id: decoded.emp_id,
      role: decoded.role,
      user_id: decoded.user_id,
      name: decoded.name
    };

    next();
  } catch (err) {
    console.error("JWT Verification Error:", err);
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};


/**
 * ✅ Admin Only Middleware
 * - Ensures only admins can access specific routes
 */
exports.verifyAdmin = (req, res, next) => {
  // console.log("verifyAdmin running, req.user:", req.user);
  if (req.user && req.user.role && req.user.role.toLowerCase() === "admin") {
    // console.log("verifyAdmin passed");
    return next();
  }
  return res.status(403).json({ message: "Access denied. Admins only." });
};


exports.verifyUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized." });
  }

  const role = req.user.role.toLowerCase();

  if (role === "user") {
    return next();
  }

  return res.status(403).json({ message: "Access denied. User only route." });
};


exports.requireMissedPunchoutRemark= async (req, res, next) => {
  try {
    const emp_id = req.user.emp_id;

    const pending = await Attendance.findOne({
      where: {
        emp_id,
        missed_punchout: true,
      },
    });

    if (pending) {
      return res.status(403).json({
        message: "You have a missed punch-out from previous day. Provide reason & time to continue.",
        sr_no: pending.id,
        date: pending.date
      });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", err });
  }
};

