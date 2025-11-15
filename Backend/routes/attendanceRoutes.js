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

// Admin routes
//user report according to emp id, daily, weekly, monthly
router.get(
  "/report/:empId",
  verifyToken,
  verifyAdmin,
  attendanceController.getAttendanceReport
);

// Get all attendance records - Admin only
router.get("/all", verifyToken, verifyAdmin, attendanceController.getAllAttendance);

// Get attendance by user and date - Admin only
router.get("/:emp_id/:date", verifyToken, verifyAdmin, attendanceController.getByUserAndDate);
// router.get(
//   "/report/:emp_id",
//   verifyToken,
//   verifyAdmin,
//   attendanceController.getUserPeriodReport
// );




// Admin Attendance Management

// Edit or Delete attendance by emp_id and date
router.put(
  "/admin/:emp_id/:date",   // <-- using emp_id and date in URL
  verifyToken,
  verifyAdmin,
  attendanceController.editAttendance
);
router.delete("/admin/:userId/:date", verifyToken, verifyAdmin, attendanceController.deleteAttendance);

// router.post("/admin/add-attendance", verifyToken, verifyAdmin, adminAddAttendance);
router.post("/admin/add-attendance", verifyToken, verifyAdmin, attendanceController.adminAddAttendance);


module.exports = router;
