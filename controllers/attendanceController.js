const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Todo = require("../models/Todo");


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

    let isPresent = false;

    const normalized = status.trim().toLowerCase();
    if (["present", "late", "half-day"].includes(normalized)) {
      isPresent = true;
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
      attendance: record,
      isPresent
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error", success: false });
  }
};

exports.startWork = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().split(" ")[0];

    let record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record) {
      record = await Attendance.create({ emp_id, date: today, work_start: now });
      return res.json({ message: "Work started", work_start: now });
    }

    if (record.work_start) {
      return res.status(400).json({ message: "Work already started", work_start: record.work_start });
    }

    record.work_start = now;
    await record.save();
    res.json({ message: "Work started", work_start: now });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};


exports.endWork = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().split(" ")[0];

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.work_start) {
      return res.status(400).json({ message: "Work has not started yet" });
    }

    if (record.work_end) {
      return res.status(400).json({ message: "Work already ended", work_end: record.work_end });
    }

    record.work_end = now;
    await record.save();
    res.json({ message: "Work ended", work_end: now });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};


// Helper
function secondsToHHMMSS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function calculateDuration(startTime, endTime) {
  if (!startTime || !endTime) return null;
  const start = new Date(`1970-01-01T${startTime}`);
  const end = new Date(`1970-01-01T${endTime}`);
  const diffSeconds = Math.max(0, (end - start) / 1000);
  return secondsToHHMMSS(diffSeconds);
}


// Add Lunch Break
// Break & Lunch APIs
// Start Normal Break
exports.startBreak = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 8);

    const record = await Attendance.findOne({ where: { emp_id, date: today } });

    if (!record || !record.time_in) return res.status(400).json({ message: "Punch in first!" });
    
    // Check if any break/lunch is ongoing
    if (record.break_start && !record.break_end) return res.status(400).json({ message: "Normal break already started!" });
    if (record.lunch_start && !record.lunch_end) return res.status(400).json({ message: "Lunch break ongoing, cannot start normal break!" });

    await record.update({ break_start: now, break_end: null });
    res.json({ message: "Break started", break_start: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// End Normal Break
exports.endBreak = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 8);

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.break_start) return res.status(400).json({ message: "Break not started!" });

    await record.update({ break_end: now });

    const duration = calculateDuration(record.break_start, now);
    res.json({ message: "Break ended", break_end: now, break_duration: duration });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// Start Lunch Break
exports.startLunch = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 8);

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.time_in) return res.status(400).json({ message: "Punch in first!" });

    if (record.lunch_start && !record.lunch_end) return res.status(400).json({ message: "Lunch already started!" });
    if (record.break_start && !record.break_end) return res.status(400).json({ message: "Normal break ongoing, cannot start lunch!" });

    await record.update({ lunch_start: now, lunch_end: null });
    res.json({ message: "Lunch started", lunch_start: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};

// End Lunch Break
exports.endLunch = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toTimeString().slice(0, 8);

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.lunch_start) return res.status(400).json({ message: "Lunch not started!" });

    await record.update({ lunch_end: now });

    const duration = calculateDuration(record.lunch_start, now);
    res.json({ message: "Lunch ended", lunch_end: now, lunch_duration: duration });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


exports.getTodayAttendanceStatus = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;

    if (!emp_id) {
      return res.status(400).json({ message: "emp_id missing from token" });
    }

    const user = await User.findOne({ where: { emp_id } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const today = new Date().toISOString().split("T")[0];

    const attendance = await Attendance.findOne({
      where: { emp_id, date: today }
    });

    const attendanceStatus = {
      punched_in: attendance?.time_in ? true : false,
      punched_out: attendance?.time_out ? true : false,
      status: attendance?.status || "not set",
      time_in: attendance?.time_in || null,
      time_out: attendance?.time_out || null,
      working_hours: attendance?.working_hours || "00:00:00",

      // 🔥 Added break details
      lunch_start: attendance?.lunch_start || null,
      lunch_end: attendance?.lunch_end || null,
      break_start: attendance?.break_start || null,
      break_end: attendance?.break_end || null
    };

    res.json({
      emp_id,
      date: today,
      attendanceStatus
    });

  } catch (err) {
    console.error("Attendance Status Error:", err);
    res.status(500).json({ message: "Internal server error" });
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


    // 🚫 Normal Break is active
    if (record.break_start && !record.break_end) {
      return res.status(400).json({
        message: "Normal break is running. End it before punch out!"
      });
    }

    // 🚫 Lunch Break is active
    if (record.lunch_start && !record.lunch_end) {
      return res.status(400).json({
        message: "Lunch break is running. End it before punch out!"
      });
    }

    // 🚫 TODO RUNNING (status = start)
    const runningTodo = await Todo.findOne({
      where: {
        emp_id,
        status: "start"
      }
    });

    if (runningTodo) {
      return res.status(400).json({
        message: "You have a running task. Pause or complete the todo before punch out!",
        sr_no: runningTodo.sr_no,
        title: runningTodo.title
      });
    }

    // Working hours calculation

    const timeIn = new Date(`${today}T${record.time_in}`);
    let diffMs = now - timeIn;

    // 🔹 Subtract breaks if present
    let totalBreakMs = 0;

    if (record.lunch_start && record.lunch_end) {
      const lunchStart = new Date(`${today}T${record.lunch_start}`);
      const lunchEnd = new Date(`${today}T${record.lunch_end}`);
      totalBreakMs += Math.max(0, lunchEnd - lunchStart);
    }

    if (record.break_start && record.break_end) {
      const breakStart = new Date(`${today}T${record.break_start}`);
      const breakEnd = new Date(`${today}T${record.break_end}`);
      totalBreakMs += Math.max(0, breakEnd - breakStart);
    }

    diffMs -= totalBreakMs;

    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    const working_hours = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
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
      let break_duration = "00:00:00";
      let lunch_duration = "00:00:00";

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
            isPresent: "not set",
            break_duration,
            lunch_duration
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

        if (r.break_start && r.break_end) break_duration = calculateDuration(r.break_start, r.break_end);
        if (r.lunch_start && r.lunch_end) lunch_duration = calculateDuration(r.lunch_start, r.lunch_end);
      }

      return { date: dateStr, 
        time_in, 
        time_out, 
        working_hours, 
        status, 
        isPresent,
        break_duration,
        lunch_duration
      };
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
      // ---------- YEARLY (Specific Year + Month) ---------- //

      else if (period === "yearly") {
        const year = parseInt(req.query.year);
        const month = parseInt(req.query.month); // 1–12

        if (!year || !month || month < 1 || month > 12) {
          return res.status(400).json({ message: "Please provide valid year & month" });
        }

        // Requested month start and end
        let startS = `${year}-${String(month).padStart(2, "0")}-01`;
        let endS = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

        // If requested month **ends before joining** → truly no data
        if (new Date(endS) < joiningDate) {
          return res.status(200).json({
            message: "No data available before joining date",
            emp_id: user.emp_id,
            name: user.name,
            joining_date: joiningStr,
            periodType: period,
            startDate: null,
            endDate: null,
            records: []
          });
        }

        // Trim start if requested start is before joining
        if (new Date(startS) < joiningDate) startS = joiningStr;

        // Trim end if requested end is after today
        if (new Date(endS) > today) endS = todayStr;

        startStr = startS;

        finalRecords = allFormatted.filter(
          (r) => r.date >= startS && r.date <= endS
        );
      }






    const startDate = startStr;
    const endDate = todayStr;

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalNotSet = 0;

    finalRecords.forEach(r => {
      if (r.isPresent === true) totalPresent++;
      else if (r.isPresent === false) totalAbsent++;
      else if (r.isPresent === "not set") totalNotSet++;
    });
    return res.json({
      emp_id: user.emp_id,
      name: user.name,
      joining_date: joiningStr,
      startDate,
      endDate,
      periodType: period,
      records: finalRecords,
      averageWorkingHours: avg,
      totalPresent,
      totalAbsent,
      totalNotSet
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

    if (!periodType || !["daily", "weekly", "monthly", "yearly"].includes(periodType)) {
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
    }else if (periodType === "yearly") {
      const year = parseInt(req.query.year);
      const month = parseInt(req.query.month); // 1-12

      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ message: "Please provide valid year & month" });
      }

      let startS = `${year}-${String(month).padStart(2, "0")}-01`;
      let endS = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

      // ✅ Check if requested period is before joining date
      if (new Date(endS) < joiningDate) {
        return res.status(200).json({
          message: "No data available before joining date",
          empId: user.emp_id,
          name: user.name,
          joining_date: joiningStr,
          periodType,
          startDate: null,
          endDate: null,
          records: []
        });
      }

      // Adjust for joining date
      if (new Date(startS) < joiningDate) startS = joiningStr;
      // Adjust for today
      if (new Date(endS) > today) endS = todayStr;

      startDate = new Date(startS);
      endDate = new Date(endS);
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

      let break_duration = "00:00:00";
      let lunch_duration = "00:00:00";

      if (entry && entry.break_start && entry.break_end) {
        break_duration = calculateDuration(entry.break_start, entry.break_end);
      }

      if (entry && entry.lunch_start && entry.lunch_end) {
        lunch_duration = calculateDuration(entry.lunch_start, entry.lunch_end);
      }


      fullRecords.push({
        date: dateStr,
        time_in,
        time_out,
        working_hours,
        status,
        isPresent,
        break_duration,
        lunch_duration,
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

// ----------------- Utilities -----------------

// Convert HH:MM:SS → seconds
const toSeconds = t => {
  if (!t) return 0;
  const [h, m, s] = t.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

// Convert seconds → HH:MM
const secondsToHHMM = sec => {
  const h = Math.floor(sec / 3600).toString().padStart(2, "0");
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

// Calculate duration between HH:MM:SS strings
// const calculateDuration = (start, end) => {
//   const startSec = toSeconds(start);
//   const endSec = toSeconds(end);
//   return secondsToHHMM(Math.max(0, endSec - startSec));
// };

// Get next working day (skip weekends)
const nextWorkingDay = (date = new Date()) => {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
};

// ----------------- Daily Log API -----------------
exports.getDailyLog = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;

    // Fetch user
    const user = await User.findOne({ where: { emp_id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Fetch todos for today
    const todos = await Todo.findAll({
      where: { emp_id, date: todayStr },
      order: [["sr_no", "ASC"]],
    });

    const completed = [];
    const pending = [];
    const nextDay = [];
    const keyLearnings = []; // collect key learnings from todos

    todos.forEach(todo => {
      const timeSpent = todo.total_tracked_time
        ? secondsToHHMM(toSeconds(todo.total_tracked_time))
        : "00:00";

      if (todo.status === "complete") {
        completed.push({
          sr_no: todo.sr_no,
          title: todo.title,
          description: todo.description,
          assigned_by: todo.assigned_by || "N/A",
          time_spent: timeSpent,
          remark: todo.remark || ""
        });
        if (todo.key_learning) keyLearnings.push(todo.key_learning);
      } else if (todo.status === "pause") {
        pending.push({
          sr_no: todo.sr_no,
          title: todo.title,
          description: todo.description,
          assigned_by: todo.assigned_by || "N/A",
          reason_for_delay: todo.remark || "",
          planned_completion_date: nextWorkingDay()
        });
        if (todo.key_learning) keyLearnings.push(todo.key_learning);
      } else if (todo.status === "not_started") {
        nextDay.push({
          sr_no: todo.sr_no,
          title: todo.title,
          description: todo.description,
          assigned_to: emp_id,
          priority: todo.priority
        });
      }
    });

    // Fetch today's attendance for punch-in/out & breaks
    const attendance = await Attendance.findOne({ where: { emp_id, date: todayStr } });
    const punchIn = attendance?.time_in || null;
    const punchOut = attendance?.time_out || null;
    const workStart = attendance?.work_start || null;
    const workEnd = attendance?.work_end || null;

    const breaks_log = [
      {
        sr_no: 1,
        break_type: "Lunch Break",
        start_time: attendance?.lunch_start || "",
        end_time: attendance?.lunch_end || "",
        duration: attendance?.lunch_start && attendance?.lunch_end
          ? calculateDuration(attendance.lunch_start, attendance.lunch_end)
          : "00:00"
      },
      {
        sr_no: 2,
        break_type: "Normal Break",
        start_time: attendance?.break_start || "",
        end_time: attendance?.break_end || "",
        duration: attendance?.break_start && attendance?.break_end
          ? calculateDuration(attendance.break_start, attendance.break_end)
          : "00:00"
      }
    ];

    const dailyLog = {
      header: {

        "Intern ID": emp_id,
        "Intern Name": user.name,
        "Department": user.department ,
        "Supervisor Name": user.supervisor_name || null,
        "Date": todayStr,
        "Punch in time": punchIn,
        "Work Start": workStart,
        "Punch out time": punchOut,
        "Work End": workEnd
      },
      tasks_completed_today: completed,
      pending_tasks: pending,
      next_day_todo: nextDay,
      breaks_log,
      key_learnings_notes: keyLearnings.join("\n") // all key learnings combined
    };

    res.json({ dailyLog });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};
