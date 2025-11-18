const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();

exports.isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Access denied" });
  next();
};
