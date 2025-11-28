// utils/sessionManager.js
const Session = require("../models/Session");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// ------------------ JWT Access Token ------------------
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, emp_id: user.emp_id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "15m" }
  );
  console.log("ACCESS_TOKEN_SECRET:", process.env.ACCESS_TOKEN_SECRET);

}

exports.createSession = async (user, req, res, extra = {}) => {
  try {
    const refresh_token = crypto.randomBytes(64).toString("hex");
    const refresh_hash = crypto.createHash("sha256").update(refresh_token).digest("hex");

    const access_token = generateAccessToken(user);

    await Session.create({
      user_id: user.id,
      refresh_token_hash: refresh_hash,
      access_token,
      device_info: {
        ua: req.headers["user-agent"],
        ip: req.ip,
      },
      refresh_expires_at: new Date(Date.now() + 30 * 60 * 1000),
      max_expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      ...extra
    });

    res.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 30 * 60 * 1000,
    });
    

    return { access_token, refresh_token };
  } catch (err) {
    console.error("Session creation failed:", err);
    throw new Error("Failed to create session");
  }
};

// Expose JWT generator
exports.generateAccessToken = generateAccessToken;
