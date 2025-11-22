const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendanceController");
const dashboardController = require("../controllers/dashboardController"); // ✅ ADD THIS
//const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");
const { verifyToken, verifyAdmin, verifyUser } = require("../middlewares/authMiddleware");

// User routes
router.post("/punchin", verifyToken, verifyUser, attendanceController.punchIn);
router.put("/punchout", verifyToken, verifyUser, attendanceController.punchOut);
//user report for a specific user daily, weekly, monthly
router.get("/history", verifyToken, verifyUser, attendanceController.getHistory);
router.post("/work-start", verifyToken, verifyUser, attendanceController.startWork);
router.post("/work-end", verifyToken, verifyUser, attendanceController.endWork);

router.get("/daily-log", verifyToken, verifyUser, attendanceController.getDailyLog);

router.get("/today-status", verifyToken, attendanceController.getTodayAttendanceStatus);
router.put("/key-learning", verifyToken, verifyUser, attendanceController.updateKeyLearning);
router.get("/key-learning", verifyToken, verifyUser, attendanceController.getTodayKeyLearning);

// Break & Lunch routes (User only)
router.put("/break/start", verifyToken, verifyUser, attendanceController.startBreak);
router.put("/break/end", verifyToken, verifyUser, attendanceController.endBreak);
router.put("/lunch/start", verifyToken, verifyUser, attendanceController.startLunch);
router.put("/lunch/end", verifyToken, verifyUser, attendanceController.endLunch);



// Admin routes
//user report according to emp id, daily, weekly, monthly
router.get("/report/:empId",verifyToken,verifyAdmin,attendanceController.getAttendanceReport); //http://localhost:5000/api/attendance/report/EMP002?periodType=daily

// Get all attendance records - Admin only
router.get("/all", verifyToken, verifyAdmin, attendanceController.getAllAttendance);

// Get attendance by user and date - Admin only
router.get("/:emp_id/:date", verifyToken, verifyAdmin, attendanceController.getByUserAndDate);

// Admin Attendance Management

// Edit or Delete attendance by emp_id and date
router.put("/admin/:emp_id/:date", verifyToken,verifyAdmin,attendanceController.editAttendance);
// router.delete("/admin/:userId/:date", verifyToken, verifyAdmin, attendanceController.deleteAttendance);

router.post("/admin/add-attendance", verifyToken, verifyAdmin, attendanceController.adminAddAttendance);

module.exports = router;
