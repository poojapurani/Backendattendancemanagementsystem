const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Todo = require("../models/Todo");
const Setting = require("../models/Setting");

// Punch In
const { Op, fn, col, literal } = require("sequelize");
const sequelize = require("../config/db");

function getISTDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}


function getISTDateString() {
  const d = getISTDate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getISTTimeString() {
  const d = getISTDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

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
    const emp_id = req.user.emp_id;
    const user = await User.findOne({ where: { emp_id } });

    const today = getISTDateString();
    const nowIST = getISTDate();               // PURE IST Date object
    const currentTime = getISTTimeString();    // IST HH:MM:SS

    const reportingTime = new Date(`${today}T09:30:00`);
    const halfDayCut = new Date(`${today}T13:30:00`);
    //const absentCut = new Date(`${today}T14:00:00`);

    const already = await Attendance.findOne({ where: { emp_id, date: today } });
    if (already) {
      return res.status(400).json({ message: "Already punched in today", success: false });
    }

    // if (nowIST > absentCut) {
    //   await Attendance.create({
    //     emp_id,
    //     date: today,
    //     time_in: null,
    //     status: "absent"
    //   });

    //   return res.status(400).json({
    //     message: "You are marked absent today (Login allowed only before 2 PM)",
    //     success: false
    //   });
    // }

    const punchInTime = new Date(`${today}T${currentTime}`);
    let status = "present";
    let late_by = null;

    if (punchInTime > reportingTime) {
      const diffMs = punchInTime - reportingTime;
      const diffMin = Math.floor(diffMs / 60000);
      late_by = formatLateMinutes(diffMin);
      status = "Late";
    }

    if (nowIST > halfDayCut) {
      status = "half-day";
    }

    const record = await Attendance.create({
      emp_id,
      date: today,
      time_in: currentTime,    // IST
      status
    });

    res.json({
      message: "Punch-in recorded",
      success: true,
      attendance: record
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server Error", success: false });
  }
};


exports.startWork = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const nowIST = getISTTimeString();  // IST

    const todos = await Todo.findAll({
      where: { emp_id, status: { [Op.ne]: "complete" } }
    });

    if (!todos.length) {
      return res.status(403).json({ message: "Cannot start work: no todos assigned." });
    }

    let record = await Attendance.findOne({ where: { emp_id, date: today } });

    if (!record) {
      record = await Attendance.create({ emp_id, date: today, work_start: nowIST });
      return res.json({ message: "Work started", work_start: nowIST });
    }

    if (record.work_start) {
      return res.status(400).json({
        message: "Work already started",
        work_start: record.work_start
      });
    }

    record.work_start = nowIST;
    await record.save();

    res.json({ message: "Work started", work_start: nowIST });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};



exports.endWork = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const nowIST = getISTTimeString();

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.work_start) {
      return res.status(400).json({ message: "Work has not started yet" });
    }

    if (record.work_end) {
      return res.status(400).json({ message: "Work already ended", work_end: record.work_end });
    }

    const activeTodos = await Todo.findAll({ where: { emp_id, status: "start" } });
    if (activeTodos.length > 0) {
      return res.status(403).json({
        message: "Cannot end work: some tasks are still in progress."
      });
    }

    const workDuration = calculateDuration(record.work_start, nowIST);

    record.work_end = nowIST;
    record.work_duration = workDuration;
    await record.save();

    res.json({
      message: "Work ended",
      work_start: record.work_start,
      work_end: nowIST,
      work_duration: workDuration
    });

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

// const calculateDuration = (start, end) => {
//   if (!start || !end) return "00:00:00";

//   const s = new Date(`1970-01-01T${start}`);
//   const e = new Date(`1970-01-01T${end}`);

//   if (isNaN(s) || isNaN(e)) return "00:00:00";

//   const diff = e - s;
//   const h = Math.floor(diff / 3600000);
//   const m = Math.floor((diff % 3600000) / 60000);
//   const sec = Math.floor((diff % 60000) / 1000);

//   return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
// };

// Add Lunch Break & Normal Break APIs
exports.startBreak = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const nowIST = getISTTimeString();

    const record = await Attendance.findOne({ where: { emp_id, date: today } });

    if (!record || !record.time_in)
      return res.status(400).json({ message: "Punch in first!" });

    if (record.break_start && !record.break_end)
      return res.status(400).json({ message: "Normal break already started!" });

    if (record.lunch_start && !record.lunch_end)
      return res.status(400).json({ message: "Lunch break ongoing!" });

    await record.update({ break_start: nowIST, break_end: null });

    const setting = await Setting.findOne();
    const max_duration_minutes = setting?.break || 30;

    res.json({ message: "Break started", break_start: nowIST, max_duration_minutes });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


// End Normal Break
exports.endBreak = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const now = getISTTimeString(); // JUST TIME

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.break_start)
      return res.status(400).json({ message: "Break not started!" });

    await record.update({ break_end: now });

    const duration = calculateDuration(record.break_start, now);

    res.json({
      message: "Break ended",
      break_end: now,
      break_duration: duration
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


// Start Lunch Break
exports.startLunch = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const now = getISTTimeString();

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.time_in)
      return res.status(400).json({ message: "Punch in first!" });

    if (record.lunch_start && !record.lunch_end)
      return res.status(400).json({ message: "Lunch already started!" });

    if (record.break_start && !record.break_end)
      return res.status(400).json({ message: "Normal break ongoing!" });

    await record.update({ lunch_start: now, lunch_end: null });

    const setting = await Setting.findOne();
    const max_duration_minutes = setting ? setting.lunch : 45;

    res.json({
      message: "Lunch started",
      lunch_start: now,
      max_duration_minutes
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


// End Lunch Break
exports.endLunch = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const now = getISTTimeString();

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.lunch_start)
      return res.status(400).json({ message: "Lunch not started!" });

    await record.update({ lunch_end: now });

    const duration = calculateDuration(record.lunch_start, now);

    res.json({
      message: "Lunch ended",
      lunch_end: now,
      lunch_duration: duration
    });

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
    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    const today = getISTDateString();

    const attendance = await Attendance.findOne({
      where: { emp_id: fetchIds, date: today }
    });

    const lunch_duration = calculateDuration(
      attendance?.lunch_start,
      attendance?.lunch_end,
      attendance?.date || today
    );

    const break_duration = calculateDuration(
      attendance?.break_start,
      attendance?.break_end,
      attendance?.date || today
    );

    const work_duration = calculateDuration(
      attendance?.work_start,
      attendance?.work_end,
      attendance?.date || today
    );


    const attendanceStatus = {
      punched_in: attendance?.time_in ? true : false,
      punched_out: attendance?.time_out ? true : false,
      status: attendance?.status || "not set",
      time_in: attendance?.time_in || null,
      time_out: attendance?.time_out || null,
      working_hours: attendance?.working_hours || "00:00:00",

      // Breaks
      lunch_start: attendance?.lunch_start || null,
      lunch_end: attendance?.lunch_end || null,
      lunch_duration,
      break_start: attendance?.break_start || null,
      break_end: attendance?.break_end || null,
      break_duration,

      // NEW FIELDS ADDED ⬇⬇⬇
      work_start: attendance?.work_start || null,
      work_end: attendance?.work_end || null,
      work_duration,
      office_hours: attendance?.office_hours || "00:00:00",
      key_learning: attendance?.key_learning || ""
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

exports.updateKeyLearning = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const key_learning = req.body && req.body.notes ? req.body.notes : "";
    
    if (!key_learning || key_learning.trim() === "") {
      return res.status(400).json({ message: "Key learning cannot be empty" });
    }

    const today = getISTDateString();


    const attendance = await Attendance.findOne({
      where: { emp_id, date: today }
    });

    if (!attendance) {
      return res.status(400).json({ message: "No attendance record found for today" });
    }

    await attendance.update({ key_learning });

    return res.json({
      message: "Key learnings saved",
      emp_id,
      date: today,
      key_learning
    });


  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", err });
  }
};


exports.getTodayKeyLearning = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();


    const user = await User.findOne({ where: { emp_id } });
    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    const attendance = await Attendance.findOne({
      where: { emp_id: fetchIds, date: today }
    });

    if (!attendance) {
      return res.status(404).json({ message: "No attendance record found for today" });
    }

    return res.json({
      emp_id,
      date: today,
      key_learning: attendance.key_learning || ""
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error", err });
  }
};



// Punch Out
exports.punchOut = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const today = getISTDateString();
    const nowIST = getISTTimeString();

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record) return res.status(400).json({ message: "You have not punched in today!" });

    if (record.time_out) {
      return res.status(400).json({ message: "Already punched out today!" });
    }

    if (record.break_start && !record.break_end)
      return res.status(400).json({ message: "Normal break running!" });

    if (record.lunch_start && !record.lunch_end)
      return res.status(400).json({ message: "Lunch break running!" });

    if (record.work_start && !record.work_end)
      return res.status(400).json({ message: "End work session first!" });

    const runningTodo = await Todo.findOne({ where: { emp_id, status: "start" } });
    if (runningTodo) {
      return res.status(400).json({
        message: "Complete/pause the todo before punch out!",
        sr_no: runningTodo.sr_no,
        title: runningTodo.title
      });
    }

    // Office hours calculation using IST
    const office_hours = calculateDuration(record.time_in, nowIST);

    record.time_out = nowIST;
    record.office_hours = office_hours;
    await record.save();

    res.json({
      message: "Punch-out successful",
      time_out: nowIST,
      office_hours
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", err });
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
    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    if (!user) return res.status(404).json({ message: "User not found" });

    const joiningDate = new Date(user.joining_date);
    const joiningStr = joiningDate.toISOString().split("T")[0];

    const today = getISTDate();
    today.setHours(23, 59, 59, 999);
    const todayStr = getISTDateString();

    // Fetch DB attendance
    const dbRecords = await Attendance.findAll({
      where: {
        emp_id: fetchIds,
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
            office_hours: "00:00:00",
            status: "not set",
            isPresent: "not set",
            break_duration,
            lunch_duration,
            work_start: null,
            work_end: null,
            lunch_start: null,
            lunch_end: null,
            break_start: null,
            break_end: null
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
        work_start = r.work_start;
        work_end = r.work_end;
        lunch_start = r.lunch_start;
        lunch_end = r.lunch_end;
        break_start = r.break_start;
        break_end = r.break_end;


        const [h, m, s] = working_hours.split(":").map(Number);
        totalSeconds += h * 3600 + m * 60 + s;

        if (r.break_start && r.break_end) 
          break_duration = calculateDuration(r.break_start, r.break_end, r.date);

        if (r.lunch_start && r.lunch_end) 
          lunch_duration = calculateDuration(r.lunch_start, r.lunch_end, r.date);

        let work_duration = "00:00:00";
        if (r.work_start && r.work_end) 
            work_duration = calculateDuration(r.work_start, r.work_end, r.date);


      }

      return { 
        date: dateStr,
        time_in,
        time_out,
        working_hours,
        office_hours: r?.office_hours || "00:00:00",
        status,
        isPresent,
        break_duration,
        lunch_duration,
        work_start,
        work_end,
        lunch_start,
        lunch_end,
        break_start,
        break_end
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
        const start = getISTDate();
        const diff = (day + 6) % 7; // convert Sun(0)→6
        start.setDate(today.getISTDate() - diff);
        startStr = start.getISTDateString();
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
        let endS = `${year}-${String(month).padStart(2, "0")}-${getISTDate()}`;

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
    
  const fetchIds = [
    user.emp_id,
    ...(user.previous_emp_ids || [])
  ];
    const results = await Attendance.findAll({
      where: { emp_id: fetchIds },
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
    
    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];
    const results = await Attendance.findAll({
      where: { emp_id: fetchIds, date },
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

    const {
      time_in,
      time_out,
      status,
      work_start,
      work_end,
      lunch_start,
      lunch_end,
      break_start,
      break_end,
      key_learning
    } = req.body;

    const record = await Attendance.findOne({ where: { emp_id, date } });
    if (!record) return res.status(404).json({ message: "Attendance record not found" });

    const newTimeIn = time_in || record.time_in;
    const newTimeOut = time_out || record.time_out;

    // -------------- WORKING HOURS LIKE punchOut --------------
    let working_hours = "00:00:00";

    if (newTimeIn && newTimeOut) {
      const timeIn = new Date(`${date}T${newTimeIn}`);
      const timeOut = new Date(`${date}T${newTimeOut}`);

      let diffMs = timeOut - timeIn;

      // subtract breaks
      let totalBreakMs = 0;

      if (record.lunch_start && record.lunch_end) {
        const lunchStart = new Date(`${date}T${record.lunch_start}`);
        const lunchEnd = new Date(`${date}T${record.lunch_end}`);
        totalBreakMs += Math.max(0, lunchEnd - lunchStart);
      }

      if (record.break_start && record.break_end) {
        const breakStart = new Date(`${date}T${record.break_start}`);
        const breakEnd = new Date(`${date}T${record.break_end}`);
        totalBreakMs += Math.max(0, breakEnd - breakStart);
      }

      diffMs -= totalBreakMs;

      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);

      working_hours =
        `${hours.toString().padStart(2, "0")}:` +
        `${minutes.toString().padStart(2, "0")}:` +
        `${seconds.toString().padStart(2, "0")}`;
    }

    // -------------- STATUS LOGIC SAME AS BEFORE --------------
    let finalStatus = status || record.status;

    if (!status) {
      const reportingTime = new Date(`${date}T09:30:00`);
      const halfDayCut = new Date(`${date}T13:30:00`);
      const punchInTime = new Date(`${date}T${newTimeIn}`);

      if (!newTimeIn) finalStatus = "absent";
      else if (punchInTime > reportingTime && punchInTime <= halfDayCut)
        finalStatus = "Late";
      else if (punchInTime > halfDayCut)
        finalStatus = "half-day";
      else
        finalStatus = "present";
    }

    // -------------- UPDATE DB --------------
    await record.update({
      time_in: newTimeIn,
      time_out: newTimeOut,
      status: finalStatus,
      working_hours,
      work_start: work_start || record.work_start,
      work_end: work_end || record.work_end,
      lunch_start: lunch_start || record.lunch_start,
      lunch_end: lunch_end || record.lunch_end,
      break_start: break_start || record.break_start,
      break_end: break_end || record.break_end,
      key_learning: key_learning || record.key_learning
    });

    res.json({
      message: "Attendance updated successfully",
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
    const admin = req.user;  // logged-in admin info
    console.log(admin);
    if (!admin) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      emp_id,        // TAKE FROM BODY
      date: inputDate,
      time_in,
      time_out,
      status,
      work_start,
      work_end,
      lunch_start,
      lunch_end,
      break_start,
      break_end
    } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "emp_id is required in body" });
    }

    const date = inputDate || getISTDateString();;

    const existing = await Attendance.findOne({ where: { emp_id, date } });
    if (existing) {
      return res.status(400).json({ message: "Attendance already submitted for this date" });
    }

    let working_hours = "00:00:00";
    if (time_in && time_out) {
      const start = new Date(`${date}T${time_in}`);
      const end = new Date(`${date}T${time_out}`);
      const diff = end - start;

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      working_hours = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }
    let work_duration = null;
    if (work_start && work_end) {
      console.log("Calculating work_duration with:", { work_start, work_end, date });
      work_duration = calculateDuration(work_start, work_end, date);
      console.log("work_duration:", work_duration);

    }

    const newRecord = await Attendance.create({
      emp_id,
      date,
      time_in,
      time_out,
      working_hours,
      status,
      work_start,
      work_end,
      lunch_start,
      lunch_end,
      break_start,
      break_end,  
      work_duration
    });

    res.json({
      message: "Attendance added successfully",
      attendance: newRecord
    });

  } catch (err) {
    console.error("Add Attendance Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Convert seconds → HH:MM:SS
// function secondsToHHMMSS(seconds) {
//   const h = Math.floor(seconds / 3600);
//   const m = Math.floor((seconds % 3600) / 60);
//   const s = seconds % 60;
//   return `${h.toString().padStart(2, "0")}:${m
//     .toString()
//     .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
// }

// ---------------- HELPERS ----------------
function getISTDateObj() {
  const now = new Date();
  // IST = UTC +5:30
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
}

function getISTDateString(date = null) {
  const d = date ? new Date(date) : getISTDateObj();
  return d.toISOString().slice(0, 10);
}

function calculateDuration(startTime, endTime, date) {
  if (!startTime || !endTime) return "00:00:00"; // or "not provided"

  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);
  const diff = end - start;

  if (isNaN(diff) || diff < 0) return "00:00:00";

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}



function secondsToHHMMSS(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ---------------- MAIN FUNCTION ----------------
exports.getAttendanceReport = async (req, res) => {
  try {
    const { empId } = req.params;
    const { periodType } = req.query;

    if (!periodType || !["daily", "weekly", "monthly", "yearly"].includes(periodType)) {
      return res.status(400).json({ message: "Invalid periodType" });
    }

    // Fetch user
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { emp_id: empId },
          { previous_emp_ids: { [Op.like]: `%${empId}%` } },
        ],
      },
      order: [
        ['id', 'DESC']
      ]
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const previousIds = user.previous_emp_ids ? user.previous_emp_ids.split(",") : [];
    const fetchIds = [user.emp_id, ...previousIds];

    const today = getISTDateObj();
    const todayStr = getISTDateString(today);
    const joiningDate = new Date(user.joining_date);
    const joiningStr = getISTDateString(joiningDate);

    let startDate, endDate = today;

    // ---------------- PERIODS ----------------
    if (periodType === "daily") {
      startDate = endDate = today;
    } else if (periodType === "weekly") {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + mondayOffset);
      startDate = joiningDate > weekStart ? joiningDate : weekStart;
    } else if (periodType === "monthly") {
      const isFirstMonth =
        today.getFullYear() === joiningDate.getFullYear() &&
        today.getMonth() === joiningDate.getMonth();
      startDate = isFirstMonth
        ? joiningDate
        : new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = today;
    } else if (periodType === "yearly") {
      const year = parseInt(req.query.year);
      const month = parseInt(req.query.month);
      if (!year || !month || month < 1 || month > 12) {
        return res.status(400).json({ message: "Please provide valid year & month" });
      }
      let startS = `${year}-${String(month).padStart(2, "0")}-01`;
      let endS = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

      if (new Date(endS) < joiningDate)
        return res.json({
          message: "No data available before joining date",
          empId: user.emp_id,
          name: user.name,
          joining_date: joiningStr,
          periodType,
          startDate: null,
          endDate: null,
          records: [],
        });

      if (new Date(startS) < joiningDate) startS = joiningStr;
      if (new Date(endS) > today) endS = todayStr;

      startDate = new Date(startS);
      endDate = new Date(endS);
    }

    // ---------------- FETCH ATTENDANCE ----------------
    const records = await Attendance.findAll({
      where: {
        emp_id: { [Op.in]: fetchIds },
        date: { [Op.between]: [getISTDateString(startDate), getISTDateString(endDate)] },
      },
      include: [{ model: User, attributes: ["name", "emp_id", "department"] }],
      order: [["date", "ASC"]],
    });

    const recordMap = {};
    records.forEach(r => { recordMap[r.date] = r; });

    const firstPunchDate = records.length ? records[0].date : null;

    // ---------------- BUILD FULL RECORDS ----------------
    const fullRecords = [];
    let totalSeconds = 0;
    let present = 0, absent = 0;

    let ptr = new Date(startDate);
    while (ptr <= endDate) {
      const dateStr = getISTDateString(ptr);
      const entry = recordMap[dateStr];

      let status = "not set";
      let isPresent = "not set";
      let time_in = null, time_out = null;
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
      } else if (firstPunchDate && dateStr > firstPunchDate && dateStr < todayStr) {
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
            status: "absent",
          },
        });
      }

      let break_duration = entry?.break_start && entry?.break_end
        ? calculateDuration(entry.break_start, entry.break_end)
        : "00:00:00";

      let lunch_duration = entry?.lunch_start && entry?.lunch_end
        ? calculateDuration(entry.lunch_start, entry.lunch_end)
        : "00:00:00";

      fullRecords.push({
        date: dateStr,
        time_in,
        time_out,
        working_hours,
        office_hours: entry?.office_hours || "00:00:00",
        status,
        isPresent,
        break_duration,
        lunch_duration,
        work_start: entry?.work_start || null,
        work_end: entry?.work_end || null,
        lunch_start: entry?.lunch_start || null,
        lunch_end: entry?.lunch_end || null,
        break_start: entry?.break_start || null,
        break_end: entry?.break_end || null,
        User: {
          name: user.name,
          empId: user.emp_id,
          previous_emp_ids: previousIds,
          all_ids_used: fetchIds,
          department: user.department,
        },
      });

      ptr.setDate(ptr.getDate() + 1);
    }

    const totalWorkingHours = secondsToHHMMSS(totalSeconds);

    // ---------------- RESPONSE ----------------
    res.json({
      empId: user.emp_id,
      name: user.name,
      department: user.department,
      joining_date: joiningStr,
      periodType,
      startDate: getISTDateString(startDate),
      endDate: getISTDateString(endDate),
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
function nextWorkingDay() {
  const today = getISTDate(); // Date object in IST
  const next = new Date(today); // clone today
  next.setDate(today.getDate() + 1); // move to tomorrow

  // skip Sunday (0 = Sunday)
  if (next.getDay() === 0) {
    next.setDate(next.getDate() + 1); // move to Monday
  }

  // Format as YYYY-MM-DD
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const dd = String(next.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}



// ----------------- Daily Log API -----------------
exports.getDailyLog = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { date } = req.query;

    // --- SELECT DATE: user input OR today's date ---
    const selectedDate = date ? new Date(date) : getISTDate();
    const selectedDateStr = selectedDate.toISOString().split("T")[0];

    
    // Validate user
    const user = await User.findOne({ where: { emp_id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];
    // Fetch todos: selected date + previous pending
    const todos = await Todo.findAll({
      where: {
        emp_id: fetchIds,
        [Op.or]: [
          { date: selectedDateStr }, // tasks of selected date
          {
            date: { [Op.lt]: selectedDateStr }, // previous tasks
            status: { [Op.in]: ["pause", "not_started"] } // pending
          }
        ]
      },
      order: [["date", "ASC"], ["sr_no", "ASC"]],
    });

    const completed = [];
    const pending = [];
    const nextDay = [];
    const keyLearnings = [];

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
      } 
      else if (todo.status === "pause") {
        pending.push({
          sr_no: todo.sr_no,
          title: todo.title,
          description: todo.description,
          assigned_by: todo.assigned_by || "N/A",
          reason_for_delay: todo.remark || "",
          planned_completion_date: nextWorkingDay(),
          time_spent: timeSpent
        });
        if (todo.key_learning) keyLearnings.push(todo.key_learning);
      } 
      else if (todo.status === "not_started") {
        nextDay.push({
          sr_no: todo.sr_no,
          title: todo.title,
          description: todo.description,
          assigned_by: todo.assigned_by || "N/A",
          priority: todo.priority
        });
      }
    });

    // Attendance for selected date
    const attendance = await Attendance.findOne({
      where: { emp_id, date: selectedDateStr }
    });

    const punchIn = attendance?.time_in || null;
    const punchOut = attendance?.time_out || null;
    const workStart = attendance?.work_start || null;
    const workEnd = attendance?.work_end || null;

    if (attendance?.key_learning) {
      keyLearnings.push(attendance.key_learning);
    }

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
        "Department": user.team_name,
        "Supervisor Name": user.supervisor_name || null,
        "Date": selectedDateStr,      // <-- final selected date shown
        "Punch in time": punchIn,
        "Work Start": workStart,
        "Punch out time": punchOut,
        "Work End": workEnd
      },
      tasks_completed_today: completed,
      pending_tasks: pending,
      next_day_todo: nextDay,
      breaks_log,
      key_learnings_notes: keyLearnings.join("\n")
    };

    res.json({ dailyLog });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};

exports.adminGetLog = async (req, res) => {
  try {
    const { emp_id, date, week_start_date, month, type } = req.query;

    if (!emp_id) return res.status(400).json({ message: "Employee ID is required" });
    if (!type || !["daily", "weekly", "monthly"].includes(type))
      return res.status(400).json({ message: "Type must be one of daily, weekly, monthly" });

    // Validate employee
    const user = await User.findOne({ where: { emp_id } });
    if (!user) return res.status(404).json({ message: "Employee not found" });
    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    if (type === "daily") {
      // --- Daily log ---
      const selectedDate = date ? new Date(date) : getISTDate();
      const selectedDateStr = selectedDate.toISOString().split("T")[0];

      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          [Op.or]: [
            { date: selectedDateStr },
            { date: { [Op.lt]: selectedDateStr }, status: { [Op.in]: ["pause", "not_started"] } }
          ]
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]],
      });

      const completed = [], pending = [], nextDay = [], keyLearnings = [];

      todos.forEach(todo => {
        const timeSpent = todo.total_tracked_time ? secondsToHHMM(toSeconds(todo.total_tracked_time)) : "00:00";

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
            planned_completion_date: nextWorkingDay(),
            time_spent: timeSpent
          });
          if (todo.key_learning) keyLearnings.push(todo.key_learning);
        } else if (todo.status === "not_started") {
          nextDay.push({
            sr_no: todo.sr_no,
            title: todo.title,
            description: todo.description,
            assigned_by: todo.assigned_by || "N/A",
            priority: todo.priority
          });
        }
      });

      // Attendance
      const attendance = await Attendance.findOne({ where: { emp_id, date: selectedDateStr } });

      const dailyLog = {
        header: {
          "Employee ID": emp_id,
          "Employee Name": user.name,
          "Department": user.team_name,
          "Supervisor Name": user.supervisor_name || null,
          "Date": selectedDateStr,
          "Punch in time": attendance?.time_in || null,
          "Work Start": attendance?.work_start || null,
          "Punch out time": attendance?.time_out || null,
          "Work End": attendance?.work_end || null
        },
        tasks_completed_today: completed,
        pending_tasks: pending,
        next_day_todo: nextDay,
        breaks_log: [
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
        ],
        key_learnings_notes: attendance?.key_learning ? [attendance.key_learning, ...keyLearnings].join("\n") : keyLearnings.join("\n")
      };

      return res.json({ dailyLog });
    }

    if (type === "weekly") {
      if (!week_start_date) return res.status(400).json({ message: "week_start_date is required for weekly log" });

      const startDate = new Date(week_start_date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 5); // 6-day week (Mon → Sat)

      const todos = await Todo.findAll({
        where: { emp_id: fetchIds, date: { [Op.between]: [startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]] } },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
      });

      // Tasks Completed
      const tasksCompleted = todos.filter(t => t.status === "complete").map((t, i) => ({
        sr_no: i + 1,
        title: t.title,
        description: t.description,
        assigned_by: t.assigned_by || "N/A",
        completion_date: t.updatedAt.toISOString().split("T")[0],
        notes: t.remark || ""
      }));

      // Delays & Missed Goals
      const delays = todos.filter(t => t.status !== "complete").map((t, i) => ({
        title: t.title,
        description: t.description,
        assigned_by: t.assigned_by || "N/A",
        reason_for_delay: t.remark || "",
        plan_for_completion: nextWorkingDay()
      }));

      // Weekly Log JSON (report template)
      const weeklyLog = {
        header: {
          name: user.name,
          department: user.team_name,
          week_covered: `${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}`,
          prepared_by: "Admin"
        },
        tasks_completed_this_week: tasksCompleted,
        weekly_goals_met: [], // can be filled manually
        delays_missed_goals: delays,
        todo_next_week: delays.map(d => ({ ...d, priority: "Medium" })),
        key_learnings_suggestions: todos.map(t => t.key_learning).filter(Boolean).join("\n")
      };

      return res.json({ weeklyLog });
    }

    if (type === "monthly") {
      if (!date) return res.status(400).json({ message: "Date is required for monthly log" });

      const selectedDate = new Date(date);
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();

      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);

      const todos = await Todo.findAll({
        where: { emp_id: fetchIds, date: { [Op.between]: [monthStart.toISOString().split("T")[0], monthEnd.toISOString().split("T")[0]] } },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
      });

      // Split month into 6-day weeks (Mon → Sat), week 1 starts from 1st
      const weeklyGroups = [];
      let currentWeekStart = new Date(monthStart);

      while (currentWeekStart <= monthEnd) {
        const currentWeekEnd = new Date(currentWeekStart);
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 5); // 6-day week
        if (currentWeekEnd > monthEnd) currentWeekEnd.setDate(monthEnd.getDate());

        const weekTodos = todos.filter(t => {
          const d = new Date(t.date);
          return d >= currentWeekStart && d <= currentWeekEnd;
        });

        if (weekTodos.length > 0) {
          const tasksCompleted = weekTodos.filter(t => t.status === "complete").map((t, i) => ({
            sr_no: i + 1,
            title: t.title,
            description: t.description,
            assigned_by: t.assigned_by || "N/A",
            completion_date: t.updatedAt.toISOString().split("T")[0],
            notes: t.remark || ""
          }));

          const delays = weekTodos.filter(t => t.status !== "complete").map(t => ({
            title: t.title,
            description: t.description,
            assigned_by: t.assigned_by || "N/A",
            reason_for_delay: t.remark || "",
            plan_for_completion: nextWorkingDay()
          }));

          weeklyGroups.push({
            week_start: currentWeekStart.toISOString().split("T")[0],
            week_end: currentWeekEnd.toISOString().split("T")[0],
            tasks_completed_this_week: tasksCompleted,
            weekly_goals_met: [], 
            delays_missed_goals: delays,
            todo_next_week: delays.map(d => ({ ...d, priority: "Medium" })),
            key_learnings_suggestions: weekTodos.map(t => t.key_learning).filter(Boolean).join("\n")
          });
        }

        currentWeekStart.setDate(currentWeekStart.getDate() + 6); // next week starts after current week
      }

      return res.json({
        emp_name: user.name,
        department: user.team_name,
        month: `${year}-${month + 1}`,
        monthlyLog: weeklyGroups
      });
    }


  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};


exports.addMissedPunchoutRemark = async (req, res) => {
  try {
    if (!req.user || !req.user.emp_id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const emp_id = req.user.emp_id;
    const { reason, time } = req.body || {};

    

    // Find the attendance record that has missed punch-out
    const record = await Attendance.findOne({
      where: { emp_id, missed_punchout: true }
    });

    if (!record) {
      return res.status(400).json({ message: "No pending missed punch-out found" });
    }

    // Update record with reason and time
    record.missed_reason = reason;
    record.missed_time = time;
    record.time_out = time; // mark as actual punch-out
    record.missed_punchout = false;

    // Optional: calculate office hours
    if (record.time_in && time) {
      record.office_hours = calculateDuration(record.time_in, time);
    }

    await record.save();

    res.json({ message: "Missed punch-out remark added successfully", record });
  } catch (err) {
    console.error("Error in addMissedPunchoutRemark:", err);
    res.status(500).json({ message: "Server error", err });
  }
};
