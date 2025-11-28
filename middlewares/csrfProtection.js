// const crypto = require("crypto");

// // In-memory store for tokens (for production, use DB or Redis)
// const csrfTokens = new Map();

// function generateCsrfToken(sessionId) {
//   const token = crypto.randomBytes(32).toString("hex");
//   csrfTokens.set(sessionId, token);
//   return token;
// }

// function verifyCsrfToken(req, res, next) {
//   const tokenFromHeader = req.headers["x-csrf-token"];
//   const sessionId = req.cookies.session_id; // or your session identifier

//   if (!sessionId || !csrfTokens.has(sessionId)) {
//     return res.status(403).json({ message: "CSRF token missing or invalid" });
//   }

//   const validToken = csrfTokens.get(sessionId);

//   if (tokenFromHeader !== validToken) {
//     return res.status(403).json({ message: "Invalid CSRF token" });
//   }

//   next();
// }

// module.exports = { generateCsrfToken, verifyCsrfToken };
