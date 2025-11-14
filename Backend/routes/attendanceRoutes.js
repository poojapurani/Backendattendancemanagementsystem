const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const dashboardController = require("../controllers/dashboardController"); // ✅ ADD THIS

const { verifyToken, verifyAdmin, verifyUser } = require("../middlewares/authMiddleware");

// User routes
router.post("/punchin", verifyToken, verifyUser, attendanceController.punchIn);
router.put("/punchout", verifyToken, verifyUser, attendanceController.punchOut);
router.get("/history", verifyToken, verifyUser, attendanceController.getHistory);

// Admin routes
router.get("/all", verifyToken, verifyAdmin, attendanceController.getAllAttendance);
router.get("/:userId/:date", verifyToken, verifyAdmin, attendanceController.getByUserAndDate);

// Admin Attendance Management

router.put("/admin/:userId/:date", verifyToken, verifyAdmin, attendanceController.editAttendance);
router.delete("/admin/:userId/:date", verifyToken, verifyAdmin, attendanceController.deleteAttendance);



module.exports = router;
