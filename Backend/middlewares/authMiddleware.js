const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * ✅ Verify JWT Token Middleware
 * - Checks for token in Authorization header
 * - Decodes and attaches user data to req.user
 */
exports.verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach decoded user info (id, emp_id, role) to req.user
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
  if (req.user && req.user.role && req.user.role.toLowerCase() === "admin") {
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

