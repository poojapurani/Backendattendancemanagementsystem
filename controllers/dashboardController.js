const Attendance = require("../models/Attendance");
const User = require("../models/User");

// ✅ Get User Dashboard (Individual View)
exports.getUserDashboard = (req, res) => {
  try {
    const { userId } = req.params;

    Attendance.getHistory(userId, (err, history) => {
      if (err) return res.status(500).json({ message: "Error fetching user dashboard" });

      res.status(200).json({
        message: "✅ User Dashboard Fetched Successfully",
        totalDays: history.length,
        records: history,
      });
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin Overview Dashboard (All Users)
exports.getAdminOverview = (req, res) => {
  try {
    Attendance.getAll((err, attendanceData) => {
      if (err) return res.status(500).json({ message: "Error fetching admin overview" });

      User.getAll((err, users) => {
        if (err) return res.status(500).json({ message: "Error fetching user list" });

        res.status(200).json({
          message: "✅ Admin Overview Fetched Successfully",
          totalUsers: users.length,
          totalAttendanceRecords: attendanceData.length,
          users,
          attendanceData,
        });
      });
    });
  } catch (error) {
    console.error("Admin Overview Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
