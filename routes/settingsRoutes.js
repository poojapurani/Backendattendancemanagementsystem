const express = require("express");
const router = express.Router();
const { getBreakLimits, setBreakLimits } = require("../controllers/settingsController");
const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

// ----------------------
// Get current break limits
// ----------------------
router.get("/break-limits", verifyToken, verifyAdmin, getBreakLimits);

// ----------------------
// Set or update break limits
// ----------------------
router.put("/break-limits", verifyToken, verifyAdmin, setBreakLimits);

module.exports = router;
