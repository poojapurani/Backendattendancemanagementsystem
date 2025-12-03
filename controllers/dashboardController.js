const Attendance = require("../models/Attendance");
const User = require("../models/User");
const sequelize = require("../config/db");
const { Op, fn, col } = require("sequelize");
const { calculateAttendanceDurations } = require('./attendanceController'); // adjust path if needed

const IdentityCard = require("../models/IdentityCard");


// ✅ Get User Dashboard (Individual View)
exports.getUserDashboard = async (req, res) => {
  try {
    const { empId } = req.params;   // <--- FIX

    const history = await Attendance.findAll({
      where: { emp_id: empId },     // <--- FIX
      order: [["date", "DESC"]],
    });

    res.status(200).json({
      message: "User Dashboard Fetched Successfully",
      totalDays: history.length,
      records: history,
    });

  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

function getISTDate() {
  return new Date().toLocaleString("en-CA", {
    timeZone: "Asia/Kolkata"
  }).split(",")[0];   // returns YYYY-MM-DD
}



// ✅ Admin Overview Dashboard
exports.getAdminOverview = async (req, res) => {
  try {
    const today = getISTDate()
    // Total employees except admin
    const totalEmployees = await User.count({
      where: { role: { [Op.ne]: "Admin" } }
    });

    // Count employees who have punched in (any status except absent)
    const presentToday = await Attendance.count({
      where: {
        date: today,
        status: {
          [Op.ne]: "absent"   // not counting 'absent'
        }
      }
    });

    // Count employees marked ABSENT
    const absentToday = await Attendance.count({
      where: {
        date: today,
        status: "absent"
      }
    });

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


function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function getISTDateObject() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
}


// ✅ Admin Report: daily, weekly, monthly
// exports.getAdminReport = async (req, res) => {
//   try {
//     const { periodType } = req.query;
//     const today = getISTDateObject();

//     let startDate;
//     let endDate = today;

//     if (periodType === "daily") {
//       startDate = today;
//     } else if (periodType === "weekly") {
//       const day = today.getDay();
//       startDate = new Date(today);
//       startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
//     } else if (periodType === "monthly") {
//       // FIXED: Start of month without timezone shift
//       startDate = new Date(today.getFullYear(), today.getMonth(), 1);

//     } else {
//       return res.status(400).json({ message: "Invalid periodType. Use daily, weekly, or monthly." });
//     }

//     const start = formatDate(startDate);
//     const end = formatDate(endDate);

//     // Fetch all employees except Admin
//     const users = await User.findAll({
//       where: { role: { [Op.ne]: "Admin" } },
//       attributes: ["emp_id", "department"]
//     });

//     const report = [];

//     for (const user of users) {
//       const records = await Attendance.findAll({
//         where: {
//           emp_id: user.emp_id,       
//           date: { [Op.between]: [start, end] }
//         }
//       });

//       // const presentCount = records.filter(r => r.status !== "absent").length;
//       const presentCount = records.filter(r =>r.status === "present" ||r.status === "late" ||r.status === "half-day").length;

//       const absentCount = (records.length - presentCount) < 0 ? 0 : (records.length - presentCount);

//       // Sum working hours
//       let totalWorkingHours = "00:00:00";

//       if (records.length > 0) {
//         let totalSeconds = 0;

//         records.forEach(r => {
//           if (r.working_hours) {
//             const [h, m, s] = r.working_hours.split(":").map(Number);
//             totalSeconds += h * 3600 + m * 60 + s;
//           }
//         });

//         const hours = Math.floor(totalSeconds / 3600);
//         const minutes = Math.floor((totalSeconds % 3600) / 60);
//         const seconds = totalSeconds % 60;

//         totalWorkingHours =
//           `${hours.toString().padStart(2, "0")}:` +
//           `${minutes.toString().padStart(2, "0")}:` +
//           `${seconds.toString().padStart(2, "0")}`;
//       }

//       report.push({
//         emp_id: user.emp_id,

//         department: user.department,
//         presentCount,
//         absentCount,
//         totalWorkingHours
//       });
//     }

//     res.status(200).json({
//       message: `✅ Admin ${periodType} Report Fetched Successfully`,
//       startDate: start,
//       endDate: end,
//       report
//     });

//   } catch (error) {
//     console.error("Admin Report Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };



exports.getAdminReport = async (req, res) => {
  try {
    const { periodType } = req.query;
    const today = getISTDateObject();

    let startDate;
    let endDate = today;

    if (periodType === "daily") {
      startDate = today;
    } else if (periodType === "weekly") {
      const day = today.getDay();
      startDate = new Date(today);
      startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    } else if (periodType === "monthly") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      return res.status(400).json({ message: "Invalid periodType. Use daily, weekly, or monthly." });
    }

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    // Fetch all users from IdentityCard table who are not Admin
    const identityCards = await IdentityCard.findAll({
      include: [
        {
          model: User,
          as: "user", // ⚠ must match association alias
          attributes: ["role", "department"],
          required: true,
        },
      ],
      where: {
        deleted_at: null,
      },
    });

    const report = [];

    for (const card of identityCards) {
      // Skip Admins
      if (card.user.role === "Admin") continue;

      const records = await Attendance.findAll({
        where: {
          emp_id: card.emp_id,
          date: { [Op.between]: [start, end] },
        },
      });

      const presentCount = records.filter(
        (r) => r.status === "present" || r.status === "late" || r.status === "half-day"
      ).length;
      const absentCount = Math.max(records.length - presentCount, 0);

      // ---------- NEW WORKING HOURS CALC USING EXISTING FUNCTION ----------
      let totalWorkingHours = 0;

      records.forEach((r) => {
        const cal = calculateAttendanceDurations(r); // your function

        if (cal && cal.working_hours) {
          const [h, m, s] = cal.working_hours.split(":").map(Number);
          totalWorkingHours += h * 3600 + m * 60 + s;
        }
      });

      // convert seconds → HH:MM:SS
      const th = String(Math.floor(totalWorkingHours / 3600)).padStart(2, "0");
      const tm = String(Math.floor((totalWorkingHours % 3600) / 60)).padStart(2, "0");
      const ts = String(totalWorkingHours % 60).padStart(2, "0");

      totalWorkingHours = `${th}:${tm}:${ts}`;

      // Parse display_user JSON safely
      let displayUser = {};
      try {
        displayUser = card.display_user ? JSON.parse(card.display_user) : {};
      } catch (e) {
        displayUser = {};
      }


      report.push({
        emp_id: card.emp_id,
        name: displayUser.name || "N/A",
        department: displayUser.department || "N/A",
        presentCount,
        absentCount,
        totalWorkingHours,
      });
    }

    res.status(200).json({
      message: `✅ Admin ${periodType} Report Fetched Successfully`,
      startDate: start,
      endDate: end,
      report,
    });
  } catch (error) {
    console.error("Admin Report Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

