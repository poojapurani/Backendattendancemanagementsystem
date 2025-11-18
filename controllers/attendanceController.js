const Attendance = require("../models/Attendance");
const User = require("../models/User");
// Punch In
const { Op } = require("sequelize");

function formatLateMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min late`;
  } else if (minutes === 0) {
    return `${hours} hr late`;
  } else {
    return `${hours} hr ${minutes} min late`;
  }
}

// Punch In
exports.punchIn = async (req, res) => {
  try {
    // const userId = req.user.id;
    const emp_id = req.user.emp_id;

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

    const reportingTime = new Date(`${today}T09:30:00`);
    const halfDayCut = new Date(`${today}T13:30:00`);
    const absentCut = new Date(`${today}T19:00:00`);

    // Already punched in?
    const already = await Attendance.findOne({
      where: { emp_id, date: today }
    });

    if (already) {
      return res.status(400).json({ message: "Already punched in today", success: false });
    }

    // Block after 2 PM = absent
    
    // Strict ABSENT Rule
    if (now > absentCut) {
      await Attendance.create({
        emp_id,
        date: today,
        time_in: null,
        status: "absent"
      });

      return res.status(400).json({
        message: "You are marked absent today (Login allowed only before 2 PM)",
        success: false
      });
    }

   

    const punchInTime = new Date(`${today}T${currentTime}`);
    let status = "present";
    let late_by = null;
    let lateMinutes = 0;

    // Late login
    if (punchInTime > reportingTime) {
      const diffMs = punchInTime - reportingTime;
      const diffMin = Math.floor(diffMs / (1000 * 60));
      late_by = formatLateMinutes(diffMin);
      status = "Late";
    }

    // If login after 1:30 → half day
    if (now > halfDayCut) {
      status = "half-day";
    }

    const record = await Attendance.create({
      // user_id: userId,
      emp_id,
      date: today,
      time_in: currentTime,
      status
    });


    res.json({
      message: "Punch-in recorded",
      success: true,
      // status,
      // late_by: lateMinutes > 0 ? `${lateMinutes} min late` : "On time",
      attendance: record
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error", success: false });
  }
};



// Punch Out
exports.punchOut = async (req, res) => {
  try {
    // const user_id = req.user.id;
    emp_id = req.user.emp_id;
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);

    const halfDayCut = new Date(`${today}T13:30:00`);
    const reportingTime = new Date(`${today}T09:30:00`);

    const record = await Attendance.findOne({
      where: { emp_id, date: today }
    });

    if (!record) {
      return res.status(400).json({ message: "You have not punched in today!" });
    }

    if (record.time_out) {
      return res.status(400).json({ message: "Already punched out today!" });
    }

    // Working hours calculation
    const timeIn = new Date(`${today}T${record.time_in}`);
    const diffMs = now - timeIn;

    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    const working_hours = `${hours.toString().padStart(2, "0")}:${minutes.toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    let finalStatus = record.status;

    // HALF-DAY CONDITIONS:
    if (now <= halfDayCut) {
      finalStatus = "half-day";
    }

    if (timeIn >= halfDayCut) {
      finalStatus = "half-day"; // logged in after 1:30
    }

    await record.update({
      time_out: currentTime,
      working_hours,
      status: finalStatus
    });

    res.json({
      message: "Punch-out recorded",
      time_in: record.time_in,
      time_out: currentTime,
      working_hours,
      status: finalStatus
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};



// Get logged-in user's history

function getDatesArray(start, end) {
  const arr = [];
  const dt = new Date(start);

  while (dt <= end) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }

  return arr;
}

// function groupByWeek(records) {
//   const weeks = {};
//   records.forEach(r => {
//     const weekNumber = getWeekNumber(new Date(r.date));
//     if (!weeks[weekNumber]) weeks[weekNumber] = [];
//     weeks[weekNumber].push(r);
//   });

//   return Object.keys(weeks).map(week => ({
//     week,
//     records: weeks[week]
//   }));
// }

// function getWeekNumber(d) {
//   d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
//   const dayNum = d.getUTCDay() || 7;
//   d.setUTCDate(d.getUTCDate() + 4 - dayNum);
//   const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
//   return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
// }

// function groupByMonth(records) {
//   const months = {};

//   records.forEach(r => {
//     const monthKey = r.date.substring(0, 7); // YYYY-MM
//     if (!months[monthKey]) months[monthKey] = [];
//     months[monthKey].push(r);
//   });

//   return Object.keys(months).map(month => ({
//     month,
//     records: months[month]
//   }));
// }



function secondsToHHMMSS(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

exports.getHistory = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const period = req.query.period || req.query.periodType || "daily";

    // Fetch user
    const user = await User.findOne({
      where: { emp_id },
      attributes: ["emp_id", "joining_date", "name"]
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const joiningDate = new Date(user.joining_date);
    const joiningStr = joiningDate.toISOString().split("T")[0];

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayStr = today.toISOString().split("T")[0];

    // Fetch DB attendance
    const dbRecords = await Attendance.findAll({
      where: {
        emp_id,
        date: { [Op.between]: [joiningStr, todayStr] }
      },
      order: [["date", "ASC"]]
    });

    const map = {};
    dbRecords.forEach(r => (map[r.date] = r));

    // Build continuous date range from joining → today
    const dates = [];
    let cur = new Date(joiningDate);
    while (cur <= today) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    let totalSeconds = 0;

    // Build normalized row list
    const allFormatted = dates.map(d => {
      const dateStr = d.toISOString().split("T")[0];
      const r = map[dateStr];

      let status = "absent";
      let time_in = null;
      let time_out = null;
      let working_hours = "00:00:00";
      let isPresent = false;

      // NOT SET RULE
      // If punch starts on a later date, earlier dates = NOT SET
      if (!r) {
        const firstPunch = Object.keys(map)[0];
        if (dateStr >= joiningStr && (!firstPunch || dateStr < firstPunch)) {
          return {
            date: dateStr,
            time_in: null,
            time_out: null,
            working_hours: "00:00:00",
            status: "not set",
            isPresent: "not set"
          };
        }
      }

      if (r) {
        status = r.status;

        const normalized = (status || "").trim().toLowerCase();

        if (normalized === "not set") {
          isPresent = "not set";     // Do NOT treat as present or absent
        }
        else if (["present", "late", "half-day"].includes(normalized)) {
          isPresent = true;          // Only these count as present
        }
        else {
          isPresent = false;         // Only real absents count as absent
        }



        time_in = r.time_in;
        time_out = r.time_out;
        working_hours = r.working_hours || "00:00:00";

        const [h, m, s] = working_hours.split(":").map(Number);
        totalSeconds += h * 3600 + m * 60 + s;
      }


      return { date: dateStr, time_in, time_out, working_hours, status, isPresent };
    });

    // Average WH
    const avg = totalSeconds
      ? secondsToHHMMSS(Math.floor(totalSeconds / allFormatted.length))
      : "00:00:00";

    // ================== PERIOD FILTER =================== //
    let finalRecords = [];
    let startStr;

    // ---------- DAILY ---------- //
    if (period === "daily") {
      finalRecords = allFormatted.filter(r => r.date === todayStr);
      startStr = todayStr;

      // ---------- WEEKLY ---------- //
    } else if (period === "weekly") {
      const day = today.getDay(); // Monday = 1

      // If today is Monday → only show Monday
      if (day === 1) {
        startStr = todayStr;
      } else {
        // week starts Monday
        const start = new Date(today);
        const diff = (day + 6) % 7; // convert Sun(0)→6
        start.setDate(today.getDate() - diff);
        startStr = start.toISOString().split("T")[0];
      }

      finalRecords = allFormatted.filter(r => r.date >= startStr && r.date <= todayStr);

      // ---------- MONTHLY ---------- //
    } else if (period === "monthly") {
      const isFirstMonth =
        today.getFullYear() === joiningDate.getFullYear() &&
        today.getMonth() === joiningDate.getMonth();

      if (isFirstMonth) {
        startStr = formatDate(joiningDate);
      } else {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        startStr = formatDate(start);   // <-- FIXED HERE
      }

      finalRecords = allFormatted.filter(r => r.date >= startStr && r.date <= todayStr);
    }


    const startDate = startStr;
    const endDate = todayStr;

    return res.json({
      emp_id: user.emp_id,
      name: user.name,
      joining_date: joiningStr,
      startDate,
      endDate,
      periodType: period,
      records: finalRecords,
      averageWorkingHours: avg
    });

  } catch (err) {
    console.error("History Error:", err);
    return res.status(500).json({ message: err.message });
  }
};




// Admin: Get all attendance
exports.getAllAttendance = async (req, res) => {
  try {
    const results = await Attendance.findAll({
      include: [{ model: User, attributes: ['name', 'emp_id'] }],
      order: [['date', 'DESC']]
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Admin: Get specific user's attendance by date
exports.getByUserAndDate = async (req, res) => {
  const { emp_id, date } = req.params;

  try {
    const results = await Attendance.findAll({
      where: { emp_id, date },
      // include: [{ model: User, attributes: ['name', 'emp_id'] }],
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Admin: Edit attendance
exports.editAttendance = async (req, res) => {
  try {
    const { emp_id, date } = req.params;
    const { time_in, time_out, status } = req.body;

    const record = await Attendance.findOne({ where: { emp_id, date } });
    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    const newTimeIn = time_in || record.time_in;
    const newTimeOut = time_out || record.time_out;

    // Recalculate working hours if both times exist
    let working_hours = "00:00:00";
    if (newTimeIn && newTimeOut) {
      const start = new Date(`${date}T${newTimeIn}`);
      const end = new Date(`${date}T${newTimeOut}`);
      const diffMs = end - start;
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      working_hours = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    // Recalculate status based on times if status not explicitly passed
    let finalStatus = status || "present"; // default
    if (!status) {
      const reportingTime = new Date(`${date}T09:30:00`);
      const halfDayCut = new Date(`${date}T13:30:00`);
      const absentCut = new Date(`${date}T14:00:00`);
      const punchInTime = new Date(`${date}T${newTimeIn}`);

      if (!newTimeIn) finalStatus = "absent";
      else if (punchInTime > reportingTime && punchInTime <= halfDayCut) finalStatus = "Late";
      else if (punchInTime > halfDayCut) finalStatus = "half-day";
      else finalStatus = "present";
    }

    await record.update({
      time_in: newTimeIn,
      time_out: newTimeOut,
      status: finalStatus,
      working_hours
    });

    res.json({
      message: "✅ Attendance updated successfully",
      attendance: record
    });

  } catch (err) {
    console.error("Edit Attendance Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: Delete attendance by user ID and date
// exports.deleteAttendance = async (req, res) => {
//   try {
//     const { emp_id, date } = req.params;

//     const record = await Attendance.findOne({
//       where: { emp_id, date }
//     });

//     if (!record) {
//       return res.status(404).json({ message: "Attendance record not found" });
//     }

//     await record.destroy();

//     res.json({ message: "✅ Attendance deleted successfully" });

//   } catch (err) {
//     console.error("Delete Attendance Error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

exports.adminAddAttendance = async (req, res) => {
  try {
    const { emp_id, date, punch_in, punch_out, status } = req.body;

    if (!emp_id || !date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ⛔️ NEW: Check joining date
    const user = await User.findOne({ where: { emp_id } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const joiningDate = new Date(user.joining_date);
    const selectedDate = new Date(date);

    if (selectedDate < joiningDate) {
      return res.status(400).json({
        message: `Admin cannot add attendance before employee's joining date (${user.joining_date})`
      });
    }

    // Convert punch_in and punch_out to HH:MM:SS
    const formatToTime = (value) => {
      if (!value) return null;
      const dateObj = new Date(`1970-01-01 ${value}`);
      return dateObj.toTimeString().split(" ")[0];
    };

    const timeIn = formatToTime(punch_in);
    const timeOut = formatToTime(punch_out);

    let workingHours = null;

    if (timeIn && timeOut) {
      const start = new Date(`1970-01-01T${timeIn}`);
      const end = new Date(`1970-01-01T${timeOut}`);

      let diff = (end - start) / 1000;

      const hours = Math.floor(diff / 3600);
      diff -= hours * 3600;
      const minutes = Math.floor(diff / 60);
      const seconds = Math.floor(diff % 60);

      workingHours = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    const record = await Attendance.create({
      emp_id,
      date,
      time_in: timeIn,
      time_out: timeOut,
      working_hours: workingHours,
      status
    });

    return res.json({
      message: "Attendance added successfully",
      attendance: record
    });

  } catch (error) {
    console.log(error);

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        message: "Attendance for this user already exists for this date"
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
};

// Convert seconds → HH:MM:SS
function secondsToHHMMSS(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

exports.getAttendanceReport = async (req, res) => {
  try {
    //console.log("===== getAttendanceReport START =====");

    const { empId } = req.params;
    const { periodType } = req.query;

   // console.log("1️⃣  Incoming Request:", { empId, periodType });

    if (!periodType || !["daily", "weekly", "monthly"].includes(periodType)) {
      //console.log("❌ Invalid periodType");
      return res.status(400).json({ message: "Invalid periodType" });
    }

    const user = await User.findOne({ where: { emp_id: empId } });
    //console.log("2️⃣  User fetched:", user?.emp_id || "NOT FOUND");

    if (!user) return res.status(404).json({ message: "Employee not found" });

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const joiningDate = new Date(user.joining_date);
    const joiningStr = joiningDate.toISOString().slice(0, 10);

    //console.log("3️⃣  Dates:", { todayStr, joiningStr });

    let startDate;
    let endDate = today;

    // ---------------- DAILY ----------------
    if (periodType === "daily") {
      startDate = endDate = today;
      //console.log("📅 DAILY report:", { startDate, endDate });
    }

    // ---------------- WEEKLY ----------------
    if (periodType === "weekly") {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;

      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + mondayOffset);

      startDate = joiningDate > weekStart ? joiningDate : weekStart;

     // console.log("📅 WEEKLY report:", { startDate, endDate });
    }

    // ---------------- MONTHLY ----------------
    if (periodType === "monthly") {
      const isFirstMonth =
        today.getFullYear() === joiningDate.getFullYear() &&
        today.getMonth() === joiningDate.getMonth();

      if (isFirstMonth) {
        startDate = new Date(joiningDate);
      } else {
        startDate = new Date(`${today.getFullYear()}-${today.getMonth() + 1}-01`);
      }

      endDate = new Date(`${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);

      // console.log("StartDate =", startDate.toLocaleDateString("en-CA"));
      // console.log("EndDate   =", endDate.toLocaleDateString("en-CA"));
    }

    // console.log("4️⃣  FINAL Date Range:", {
    //   startDate: startDate.toISOString().slice(0, 10),
    //   endDate: endDate.toISOString().slice(0, 10),
    // });

    // ---------------- FETCH ATTENDANCE ----------------
    const records = await Attendance.findAll({
      where: {
        emp_id: empId,
        date: {
          [Op.between]: [
            startDate.toISOString().slice(0, 10),
            endDate.toISOString().slice(0, 10),
          ],
        },
      },
      include: [{ model: User, attributes: ["name", "emp_id", "department"] }],
      order: [["date", "ASC"]],
    });

    // console.log("5️⃣  DB Records Fetched:", records.length);

    const recordMap = {};
    records.forEach(r => {
      recordMap[r.date] = r;
    });

    const firstPunchDate = records.length ? records[0].date : null;

    // console.log("6️⃣  First Punch Date:", firstPunchDate);

    // ---------------- BUILD FULL RECORDS ----------------
    const fullRecords = [];
    let totalSeconds = 0;
    let present = 0;
    let absent = 0;

    let ptr = new Date(startDate);
    // console.log("7️⃣  Building full date range records...");

    while (ptr <= endDate) {
      const dateStr = ptr.toISOString().slice(0, 10);
      const entry = recordMap[dateStr];

      let status = "not set";
      let isPresent = "not set";
      let time_in = null;
      let time_out = null;
      let working_hours = "00:00:00";

      if (entry) {
        status = entry.status;
        time_in = entry.time_in;
        time_out = entry.time_out;
        working_hours = entry.working_hours || "00:00:00";

        const [h, m, s] = working_hours.split(":").map(Number);
        totalSeconds += h * 3600 + m * 60 + s;

        isPresent = ["present", "late", "half-day"].includes(status);
        if (isPresent) present++;
        if (entry.status === "absent") absent++;
        // console.log(`   ✔ ${dateStr} → PRESENT (${status})`);
      }
      // BEFORE FIRST PUNCH → NOT SET
      if (!entry && (!firstPunchDate || dateStr < firstPunchDate) && dateStr >= joiningStr) {
        status = "not set";
        isPresent = "not set";
      }

      // AFTER FIRST PUNCH → ABSENT
      else if (firstPunchDate && !entry && dateStr > firstPunchDate && dateStr < todayStr) {
        status = "absent";
        isPresent = false;
        absent++;

        await Attendance.findOrCreate({
          where: { emp_id: empId, date: dateStr },
          defaults: {
            emp_id: empId,
            date: dateStr,
            time_in: null,
            time_out: null,
            working_hours: "00:00:00",
            status: "absent"
          }
        });
      }



      fullRecords.push({
        date: dateStr,
        time_in,
        time_out,
        working_hours,
        status,
        isPresent,
        User: {
          name: user.name,
          emp_id: user.emp_id,
          department: user.department,
        },
      });

      ptr.setDate(ptr.getDate() + 1);
    }
    // console.log("8️⃣  Summary:", { present, absent });

    const totalWorkingHours = secondsToHHMMSS(totalSeconds);

    // console.log("9️⃣  Total Working Hours:", totalWorkingHours);

    // ---------------- RESPONSE ----------------
    //console.log("===== getAttendanceReport END =====");

    res.json({
      empId: user.emp_id,
      name: user.name,
      department: user.department,
      joining_date: joiningStr,
      periodType,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      present,
      absent,
      totalWorkingHours,
      records: fullRecords,
    });

  } catch (err) {
    console.error("❌ Report Error:", err);
    res.status(500).json({ error: err.message });
  }
};

