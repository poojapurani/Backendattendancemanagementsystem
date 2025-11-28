const crypto = require("crypto");

exports.generateAccessToken = () => crypto.randomBytes(32).toString("hex");
exports.generateRefreshToken = () => crypto.randomBytes(64).toString("hex");
exports.hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
