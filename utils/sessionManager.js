// utils/sessionManager.js
const Session = require("../models/Session");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function hashWithSalt(token, salt) {
  return crypto.createHash("sha256").update(token + salt).digest("hex");
}

// ------------------ JWT Access Token ------------------
function generateAccessToken(user, jti, session_id,permissions = []) {
  const payload = {
    id: user.id,
    emp_id: user.emp_id,
    role: user.role,
    permissions,
    session_id,
    jti,
    issued_at: Date.now(),
  };

  const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });

  return token
}


async function createSession(user, req, res, extra = {}) {
  const session_id = crypto.randomBytes(32).toString("hex");
  const jti = crypto.randomBytes(16).toString("hex");

// Refresh token (plaintext sent to cookie)
  const refresh_token = crypto.randomBytes(64).toString("hex");

  // Per-session salt
  const salt = crypto.randomBytes(32).toString("hex");

  // Store hash = sha256(refresh_token + salt)
  const refresh_hash = hashWithSalt(refresh_token, salt);

  const permissions = extra.permissions || [];

  const access_token = generateAccessToken(user, jti, session_id, permissions);

  await Session.create({
    session_id,
    access_jti: jti,
    user_id: user.id,
    refresh_token_hash: refresh_hash,
    refresh_token_salt: salt,
    access_token,
    refresh_expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30 mins
    max_expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    device_info: {
      ua: req.headers["user-agent"],
      ip: req.ip,
    },
    ...extra
  });

  res.cookie("refresh_token", refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 60 * 1000,
  });

  return { access_token, refresh_token };
};


module.exports = {
  hashWithSalt,
  generateAccessToken,
  createSession
};
