const Attendance = require("../models/Attendance");
const User = require("../models/User");
const sequelize = require("../config/db"); // ✅ Add this line
const { Op, fn, col } = require("sequelize");

// ✅ Get User Dashboard (Individual View)
exports.getUserDashboard = async (req, res) => {
  try {
    const { userId } = req.params;

    const history = await Attendance.findAll({
      where: { user_id: userId },
      order: [["date", "DESC"]],
    });

    res.status(200).json({
      message: "✅ User Dashboard Fetched Successfully",
      totalDays: history.length,
      records: history,
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Admin Overview Dashboard (All Users)
// ✅ Admin Overview Dashboard (All Users)
exports.getAdminOverview = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Count all employees except Admin (case-insensitive)
    const totalEmployees = await User.count({
      where: { role: { [Op.ne]: "Admin" } }
    });

    // Count how many marked attendance today
    const presentToday = await Attendance.count({
      where: { date: today }
    });

    // Calculate absent
    let absentToday = totalEmployees - presentToday;
    if (absentToday < 0) absentToday = 0;

    res.status(200).json({
      message: "✅ Admin Overview Fetched Successfully",
      totalEmployees,
      presentToday,
      absentToday
    });

  } catch (error) {
    console.error("Admin Overview Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


// periodType: "weekly" or "monthly"
// periodType: "daily", "weekly", "monthly"
exports.getAdminReport = async (req, res) => {
  try {
    const { periodType } = req.query; // ?periodType=daily|weekly|monthly
    const today = new Date();

    let startDate;
    let endDate = today;

    if (periodType === "daily") {
      startDate = today;
    } else if (periodType === "weekly") {
      const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      startDate = new Date(today);
      startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1)); // Monday of current week
    } else if (periodType === "monthly") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1); // first day of month
    } else {
      return res.status(400).json({ message: "Invalid periodType. Use daily, weekly, or monthly." });
    }

    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];

    // Fetch all employees except Admin
    const users = await User.findAll({
      where: { role: { [Op.ne]: "Admin" } },
      attributes: ["id", "emp_id", "department"]
    });

    const report = [];

    for (const user of users) {
      const records = await Attendance.findAll({
        where: {
          user_id: user.id,
          date: { [Op.between]: [start, end] }
        }
      });

      const presentCount = records.filter(r => r.status !== "absent").length;
      const absentCount = (records.length ? records.length : 0) - presentCount;

      // Sum working hours
      let totalWorkingHours = "00:00:00";
      if (records.length > 0) {
        let totalSeconds = 0;
        records.forEach(r => {
          if (r.working_hours) {
            const [h, m, s] = r.working_hours.split(":").map(Number);
            totalSeconds += h * 3600 + m * 60 + s;
          }
        });
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        totalWorkingHours = `${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;
      }

      report.push({
        emp_id: user.emp_id,
        department: user.department,
        presentCount,
        absentCount: absentCount < 0 ? 0 : absentCount,
        totalWorkingHours
      });
    }

    res.status(200).json({
      message: `✅ Admin ${periodType} Report Fetched Successfully`,
      startDate: start,
      endDate: end,
      report
    });

  } catch (error) {
    console.error("Admin Report Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

