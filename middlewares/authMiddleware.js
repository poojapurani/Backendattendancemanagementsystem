const jwt = require("jsonwebtoken");
require("dotenv").config();
const Attendance = require("../models/Attendance");
const Session = require("../models/Session");

/**
 * ✅ Verify JWT Token Middleware
 * - Checks for token in Authorization header
 * - Decodes and attaches user data to req.user
 */
exports.verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Check session DB for hijack / revoked / rotation
    const session = await Session.findOne({
      where: {
        user_id: decoded.id,
        access_token: token,
        revoked: false
      }
    });

    if (!session) {
      return res.status(403).json({ message: "Invalid or revoked token." });
    }

    // ✅ Optional: check max session expiry
    if (new Date() > session.max_expires_at) {
      session.revoked = true;
      session.revoked_reason = "Session expired (max)";
      await session.save();
      return res.status(403).json({ message: "Session expired." });
    } 

    // Attach user info from JWT
    req.user = {
      id: decoded.id,
      emp_id: decoded.emp_id,
      role: decoded.role,
      user_id: decoded.user_id,
      name: decoded.name,
      permissions: decoded.permissions || [],
      session_id: session.id
    };

    next();

  } catch (err) {
    console.error("JWT verification error:", err);
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


exports.requireMissedPunchoutRemark = async (req, res, next) => {
  try {
    // Allow missed-punchout API to bypass validation
    if (req.path === "/missed-punchout") {
      return next();
    }

    const emp_id = req.user.emp_id;

    const missed = await Attendance.findOne({
      where: { emp_id, missed_punchout: true }
    });

    if (missed) {
      return res.status(403).json({
        isPunchOutPending: true,   // ⭐ NEW FIELD for frontend
        message: "You have a missed punch-out from previous day. Provide reason & time to continue.",
        date: missed.date
      });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Middleware error" });
  }
};


