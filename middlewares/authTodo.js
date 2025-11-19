const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access denied. No token provided." });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
