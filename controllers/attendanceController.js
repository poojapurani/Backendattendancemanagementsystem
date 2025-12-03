const Attendance = require("../models/Attendance");
const User = require("../models/User");
const Todo = require("../models/Todo");
const Setting = require("../models/Setting");
const IdentityCard = require("../models/IdentityCard");

// Punch In
const { Op, fn, col, literal } = require("sequelize");
const sequelize = require("../config/db");

function getISTDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}


function getISTDateString(dateObj = new Date()) {
  const d = getISTDate(dateObj);
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

function parseTime(timeStr, dateStr) {
  if (!timeStr) return null;
  return new Date(`${dateStr}T${timeStr}`);
}

function diffInSeconds(start, end) {
  if (!start || !end) return 0;
  const diff = (end - start) / 1000;
  return diff > 0 ? diff : 0;
}

function formatHHMMSS(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function calculateAttendanceDurations(record) {
  if (!record || !record.date) return {};

  const dateStr = record.date;
  const now = new Date();

  const timeIn = parseTime(record.time_in, dateStr);
  const timeOut = parseTime(record.time_out, dateStr);
  const workStart = parseTime(record.work_start, dateStr);
  const workEnd = parseTime(record.work_end, dateStr);
  const breakStart = parseTime(record.break_start, dateStr);
  const breakEnd = parseTime(record.break_end, dateStr);
  const lunchStart = parseTime(record.lunch_start, dateStr);
  const lunchEnd = parseTime(record.lunch_end, dateStr);

  // 1️⃣ Working hours: time_in → time_out
  const workingSeconds = diffInSeconds(workStart, workEnd);

  // 2️⃣ Break + lunch durations
  const breakSeconds = diffInSeconds(breakStart, breakEnd);
  const lunchSeconds = diffInSeconds(lunchStart, lunchEnd);

  // 3️⃣ Office hours = working hours minus break & lunch

  const officeSeconds = diffInSeconds(timeIn, timeOut);

  // Prevent negative durations
  // if (workingSeconds < 0) workingSeconds = 0;
  // if (breakSeconds < 0) breakSeconds = 0;
  // if (lunchSeconds < 0) lunchSeconds = 0;
  // if (officeSeconds < 0) officeSeconds = 0;
  let workSeconds = workingSeconds - breakSeconds - lunchSeconds;
  if (workSeconds < 0) workSeconds = 0;

  // 4️⃣ Work duration (from work_start → work_end)


  return {
    working_hours: formatHHMMSS(workSeconds),
    break_duration: formatHHMMSS(breakSeconds),
    lunch_duration: formatHHMMSS(lunchSeconds),
    office_hours: formatHHMMSS(officeSeconds),
    work_duration: formatHHMMSS(workingSeconds)
  };
}
// if calculateAttendanceDurations is declared in this file:
module.exports.calculateAttendanceDurations = calculateAttendanceDurations;


// Get emp_id from IdentityCard safely

async function getEmpId(user_id) {
  const identity = await IdentityCard.findOne({ where: { user_id } }); // match column exactly
  if (!identity) return null; // <-- return null if not found
  return identity.emp_id;
}



// Punch In
exports.punchIn = async (req, res) => {
  try {
    const userId = req.user.id;
    const emp_id = await getEmpId(userId);

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
    const userId = req.user.id;
    const emp_id = await getEmpId(userId);
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
    const userId = req.user.id;
    const emp_id = await getEmpId(userId);
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

    //const workDuration = calculateDuration(record.work_start, nowIST);

    record.work_end = nowIST;

    const durations = calculateAttendanceDurations(record);

    record.work_duration = durations.work_duration;
    //record.work_duration = workDuration;
    await record.save();

    res.json({
      message: "Work ended",
      work_start: record.work_start,
      work_end: nowIST,
      work_duration: record.work_duration,
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
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Pause all active tasks for an employee
const pauseActiveTodos = async (emp_id) => {
  const todos = await Todo.findAll({ where: { emp_id, status: "start" } });
  const now = new Date().toTimeString().split(" ")[0];

  const toSeconds = (t) => {
    if (!t || t === "NaN:NaN:NaN") return 0;
    const [h, m, s] = t.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  };

  const toHHMMSS = (sec) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  for (let todo of todos) {
    if (todo.start_time) {
      const start = new Date(`1970-01-01 ${todo.start_time}`);
      const end = new Date(`1970-01-01 ${now}`);
      const diffSeconds = (end - start) / 1000;
      const prev = toSeconds(todo.total_tracked_time);
      todo.total_tracked_time = toHHMMSS(prev + diffSeconds);
      todo.status = "pause";
      await todo.save();
    }
  }
};

// Resume paused tasks for an employee
// const resumePausedTodos = async (emp_id) => {
//   const todos = await Todo.findAll({ where: { emp_id, status: "pause" } });
//   const now = new Date().toTimeString().split(" ")[0];

//   for (let todo of todos) {
//     todo.start_time = now;
//     todo.status = "start";
//     await todo.save();
//   }
// };

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
    const userId = req.user.id;
    const emp_id = await getEmpId(userId);
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
    await pauseActiveTodos(emp_id);

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
    const userId = req.user.id;
    const emp_id = await getEmpId(userId);
    const today = getISTDateString();
    const now = getISTTimeString(); // JUST TIME

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.break_start)
      return res.status(400).json({ message: "Break not started!" });

    await record.update({ break_end: now });

    //const duration = calculateDuration(record.break_start, now);

    record.break_end = now;

    // ✅ Recalculate all durations
    const durations = calculateAttendanceDurations(record);
    record.break_duration = durations.break_duration;


    await record.save();

   

    res.json({
      message: "Break ended",
      break_end: now,
      break_duration: durations.break_duration,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};


// Start Lunch Break
exports.startLunch = async (req, res) => {
  try {
    const userId = req.user.id;
    const emp_id = await getEmpId(userId);
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
    await pauseActiveTodos(emp_id);

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
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
    const today = getISTDateString();
    const now = getISTTimeString();

    const record = await Attendance.findOne({ where: { emp_id, date: today } });
    if (!record || !record.lunch_start)
      return res.status(400).json({ message: "Lunch not started!" });

    await record.update({ lunch_end: now });

    //const duration = calculateDuration(record.lunch_start, now);
    const durations = calculateAttendanceDurations(record);

    record.lunch_duration = durations.lunch_duration;

    await record.save();

    res.json({
      message: "Lunch ended",
      lunch_end: now,
      lunch_duration: durations.lunch_duration,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server Error" });
  }
};



exports.getTodayAttendanceStatus = async (req, res) => {
  try {
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);

    if (!emp_id) {
      return res.status(404).json({ message: "Identity card not found for this user" });
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

    // const lunch_duration = calculateDuration(
    //   attendance?.lunch_start,
    //   attendance?.lunch_end,
    //   attendance?.date || today
    // );

    // const break_duration = calculateDuration(
    //   attendance?.break_start,
    //   attendance?.break_end,
    //   attendance?.date || today
    // );

    // const work_duration = calculateDuration(
    //   attendance?.work_start,
    //   attendance?.work_end,
    //   attendance?.date || today
    // );

    const durations = calculateAttendanceDurations(attendance || { date: today });


    const attendanceStatus = {
      punched_in: !!attendance?.time_in,
      punched_out: !!attendance?.time_out,
      status: attendance?.status || "not set",
      time_in: attendance?.time_in || null,
      time_out: attendance?.time_out || null,
      working_hours: durations.working_hours || "00:00:00",
      lunch_start: attendance?.lunch_start || null,
      lunch_end: attendance?.lunch_end || null,
      lunch_duration: durations.lunch_duration || "00:00:00",
      break_start: attendance?.break_start || null,
      break_end: attendance?.break_end || null,
      break_duration: durations.break_duration || "00:00:00",
      work_start: attendance?.work_start || null,
      work_end: attendance?.work_end || null,
      work_duration: durations.work_duration || "00:00:00",
      office_hours: durations.office_hours || "00:00:00",
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
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
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
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
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
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
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
    //const office_hours = calculateDuration(record.time_in, nowIST);

    record.time_out = nowIST;

    const durations = calculateAttendanceDurations(record);

    // ✅ Save updated durations
    record.office_hours = durations.office_hours;
    record.working_hours = durations.working_hours;
    record.work_duration = durations.work_duration;
    record.break_duration = durations.break_duration;
    record.lunch_duration = durations.lunch_duration;

    //await record.save();
    //record.office_hours = office_hours;
    await record.save();

    res.json({
      message: "Punch-out successful",
      time_out: nowIST,
      office_hours: durations.office_hours,
      working_hours: durations.working_hours,
      work_duration: durations.work_duration,
      break_duration: durations.break_duration,
      lunch_duration: durations.lunch_duration
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
    const user_id = req.user.id;


    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
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

        // const dayOfWeek = d.getDay(); // Sunday = 0
        // if (dayOfWeek === 0) {
        //   return {
        //     date: dateStr,
        //     time_in: null,
        //     time_out: null,
        //     working_hours: "00:00:00",
        //     office_hours: "00:00:00",
        //     status: "not set",
        //     isPresent: "not set",
        //     break_duration: "00:00:00",
        //     lunch_duration: "00:00:00",
        //     work_start: null,
        //     work_end: null,
        //     lunch_start: null,
        //     lunch_end: null,
        //     break_start: null,
        //     break_end: null
        //   };
        // }
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

      let recordData = {};
      if (r) {
        status = r.status;
        // If Sunday: always NOT SET even if DB has empty/incorrect status
        if (new Date(dateStr).getDay() === 0) {
          return {
            date: dateStr,
            time_in: null,
            time_out: null,
            working_hours: "00:00:00",
            office_hours: "00:00:00",
            status: "not set",
            isPresent: "not set",
            break_duration: "00:00:00",
            lunch_duration: "00:00:00",
            work_start: null,
            work_end: null,
            lunch_start: null,
            lunch_end: null,
            break_start: null,
            break_end: null
          };
        }


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

        // if (r.break_start && r.break_end)
        //   break_duration = calculateDuration(r.break_start, r.break_end, r.date);

        // if (r.lunch_start && r.lunch_end)
        //   lunch_duration = calculateDuration(r.lunch_start, r.lunch_end, r.date);

        // let work_duration = "00:00:00";
        // if (r.work_start && r.work_end)
        //   work_duration = calculateDuration(r.work_start, r.work_end, r.date);
        recordData = calculateAttendanceDurations(r);

      }

      return {
        date: dateStr,
        time_in,
        time_out,


        status,
        isPresent,
        working_hours: recordData.working_hours || "00:00:00",
        office_hours: recordData.office_hours || "00:00:00",
        work_duration: recordData.work_duration || "00:00:00",
        break_duration: recordData.break_duration || "00:00:00",
        lunch_duration: recordData.lunch_duration || "00:00:00",
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

      let start = new Date(todayStr);

      // Calculate Monday of the current week
      const diff = (day + 6) % 7; // convert Sun(0)->6, Mon(1)->0, Tue(2)->1 ...
      start.setDate(start.getDate() - diff);

      const startStr = start.toISOString().split("T")[0];

      finalRecords = allFormatted.filter(
        r => r.date >= startStr && r.date <= todayStr
      );
    }
    else if (period === "monthly") {
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

      let lastDay = new Date(year, month, 0).getDate();  // last day of requested month
      let endS = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;


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

      if (new Date(startS) < joiningDate) startS = joiningStr;
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
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
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
  const user_id = req.user.id;

  // Fetch emp_id from IdentityCard
  const emp_id = await getEmpId(user_id);
  const { date } = req.params;

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
    // const user_id = req.user.id;

    // // Fetch emp_id from IdentityCard
    // const emp_id = await getEmpId(user_id);

    const emp_id = req.params.emp_id;
    const { date } = req.params;

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

    // const newTimeIn = time_in || record.time_in;
    // const newTimeOut = time_out || record.time_out;

    // -------------- WORKING HOURS LIKE punchOut --------------
    // Update fields or keep existing
    record.time_in = time_in || record.time_in;
    record.time_out = time_out || record.time_out;
    record.work_start = work_start || record.work_start;
    record.work_end = work_end || record.work_end;
    record.lunch_start = lunch_start || record.lunch_start;
    record.lunch_end = lunch_end || record.lunch_end;
    record.break_start = break_start || record.break_start;
    record.break_end = break_end || record.break_end;
    record.key_learning = key_learning || record.key_learning;

    // Calculate durations using your central function
    const durations = calculateAttendanceDurations(record);

    record.working_hours = durations.working_hours;
    record.work_duration = durations.work_duration;
    record.office_hours = durations.office_hours;
    record.break_duration = durations.break_duration;
    record.lunch_duration = durations.lunch_duration;

    // -------------- STATUS LOGIC SAME AS BEFORE --------------
    let finalStatus = status || record.status;

    if (!status) {
      const reportingTime = new Date(`${date}T09:30:00`);
      const halfDayCut = new Date(`${date}T13:30:00`);
      const punchInTime = record.time_in ? new Date(`${date}T${record.time_in}`) : null;

      if (!punchInTime) record.status = "absent";
      else if (punchInTime > reportingTime && punchInTime <= halfDayCut) record.status = "Late";
      else if (punchInTime > halfDayCut) record.status = "half-day";
      else record.status = "present";
    } else {
      record.status = status;
    }

    await record.save();

    // -------------- UPDATE DB --------------
    await record.update({
      time_in,
      time_out,
      status: finalStatus,
      working_hours: durations.working_hours,
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

    const tempRecord = {
      time_in,
      time_out,
      work_start,
      work_end,
      lunch_start,
      lunch_end,
      break_start,
      break_end,
      date
    };

    const durations = calculateAttendanceDurations(tempRecord);

    const newRecord = await Attendance.create({
      emp_id,
      date,
      time_in,
      time_out,
      status,
      work_start,
      work_end,
      lunch_start,
      lunch_end,
      break_start,
      break_end,

      working_hours: durations.working_hours,
      work_duration: durations.work_duration,
      office_hours: durations.office_hours,
      break_duration: durations.break_duration,
      lunch_duration: durations.lunch_duration
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

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}



function secondsToHHMMSS(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

exports.getAttendanceReport = async (req, res) => {
  try {
    let emp_id;

    // Admin can pass emp_id in route param, normal users fetch from IdentityCard
    if (req.user.role.toLowerCase() === "admin") {
      emp_id = req.params.empId; // route: /report/:empId
      if (!emp_id) return res.status(400).json({ message: "emp_id is required" });
    } else {
      // Normal user -> fetch emp_id from IdentityCard
      const identity = await IdentityCard.findOne({ where: { user_id: req.user.id } });
      if (!identity) return res.status(404).json({ message: "Identity card not found" });
      emp_id = identity.emp_id;
    }

    // Fetch IdentityCard
    const identity = await IdentityCard.findOne({ where: { emp_id } });
    if (!identity) return res.status(404).json({ message: "Identity card not found" });

    // Parse display_user
    const user = identity.display_user
      ? typeof identity.display_user === "string"
        ? JSON.parse(identity.display_user)
        : identity.display_user
      : null;

    if (!user) return res.status(404).json({ message: "User details missing in IdentityCard" });

    let previousIds = [];

    if (user.previous_emp_ids) {
      if (typeof user.previous_emp_ids === "string") {
        previousIds = user.previous_emp_ids.length > 0
          ? user.previous_emp_ids.split(",")
          : [];
      }
    }

    const fetchIds = [emp_id, ...previousIds];

    // Determine period
    const periodType = req.query.periodType || "daily";
    if (!["daily", "weekly", "monthly", "yearly"].includes(periodType))
      return res.status(400).json({ message: "Invalid periodType" });

    const today = getISTDateObj();
    const todayStr = getISTDateString(today);
    const joiningDate = new Date(user.joining_date);
    const joiningStr = getISTDateString(joiningDate);

    let startDate, endDate = today;

    if (periodType === "daily") {
      startDate = endDate = today;

    } else if (periodType === "weekly") {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + mondayOffset);
      startDate = joiningDate > weekStart ? joiningDate : weekStart;

    } else if (periodType === "monthly") {


      // Build start & end of this month using YYYY-MM-DD (IST safe)
      const year = today.getFullYear();
      const month = today.getMonth() + 1;

      let startS = `${year}-${String(month).padStart(2, "0")}-01`;
      let endS = getISTDateString(today); // today is the end



      // If employee joined this month → start from joining day
      if (
        joiningDate.getFullYear() === today.getFullYear() &&
        joiningDate.getMonth() === today.getMonth()
      ) {

        startS = joiningStr;
      } else {

      }

      startDate = new Date(startS);
      endDate = new Date(endS);


    }

    else if (periodType === "yearly") {
      const year = parseInt(req.query.year);
      const month = parseInt(req.query.month);
      if (!year || !month || month < 1 || month > 12)
        return res.status(400).json({ message: "Please provide valid year & month" });

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

    // Fetch attendance
    const records = await Attendance.findAll({
      where: {
        emp_id: { [Op.in]: fetchIds },
        date: { [Op.between]: [getISTDateString(startDate), getISTDateString(endDate)] },
      },
      order: [["date", "ASC"]],
    });

    const recordMap = {};
    records.forEach(r => { recordMap[r.date] = r; });
    const firstPunchDate = records.length ? records[0].date : null;

    // Build full records
    const fullRecords = [];
    let totalSeconds = 0, present = 0, absent = 0;
    let ptr = new Date(startDate);

    while (ptr <= endDate) {
      const dateStr = getISTDateString(ptr);
      const entry = recordMap[dateStr];
      const isSunday = new Date(ptr.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay() === 0;

      let status = "not set", isPresent = "not set", time_in = null, time_out = null, working_hours = "00:00:00";
      let work_start = null, work_end = null, lunch_start = null, lunch_end = null, break_start = null, break_end = null;
      let durations = {
        working_hours: "00:00:00",
        work_duration: "00:00:00",
        office_hours: "00:00:00",
        break_duration: "00:00:00",
        lunch_duration: "00:00:00",
      };


      if (isSunday) {
        status = "not set";
        isPresent = "not set";

        // Override DB if needed
        if (entry && entry.status !== "not set") {
          entry.status = "not set";
          entry.time_in = null;
          entry.time_out = null;
          entry.working_hours = "00:00:00";

          await Attendance.update(
            {
              status: "not set",
              time_in: null,
              time_out: null,
              working_hours: "00:00:00"
            },
            { where: { emp_id, date: dateStr } }
          );
        }
      };





      if (entry) {
        time_in = entry.time_in;
        time_out = entry.time_out;
        work_start = entry.work_start;
        work_end = entry.work_end;
        lunch_start = entry.lunch_start;
        lunch_end = entry.lunch_end;
        break_start = entry.break_start;
        break_end = entry.break_end;
        status = entry.status || "not set";

        durations = calculateAttendanceDurations({
          date: entry.date,
          time_in,
          time_out,
          work_start,
          work_end,
          lunch_start,
          lunch_end,
          break_start,
          break_end
        });

        const [h, m, s] = working_hours.split(":").map(Number);
        totalSeconds += h * 3600 + m * 60 + s;

        isPresent = ["present", "late", "half-day"].includes(status);
        if (isPresent) present++;
        if (status === "absent") absent++;
      } else if (
        firstPunchDate &&
        dateStr > firstPunchDate &&
        dateStr < todayStr &&
        !isSunday       // ⛔ DO NOT mark absent on Sunday
      ) {
        status = "absent";
        isPresent = false;
        absent++;

        await Attendance.findOrCreate({
          where: { emp_id, date: dateStr },
          defaults: {
            emp_id,
            date: dateStr,
            time_in: null,
            time_out: null,
            working_hours: "00:00:00",
            status: "absent"
          },
        });
      } else if (isSunday) {
        // ☀️ SUNDAY → NO ABSENT
        status = "not set";
        isPresent = "not set";
      }


      // const break_duration = entry?.break_start && entry?.break_end ? calculateDuration(entry.break_start, entry.break_end) : "00:00:00";
      // const lunch_duration = entry?.lunch_start && entry?.lunch_end ? calculateDuration(entry.lunch_start, entry.lunch_end) : "00:00:00";

      fullRecords.push({
        date: dateStr,
        time_in,
        time_out,
        ...durations,
        status,
        isPresent,
        work_start,
        work_end,
        lunch_start,
        lunch_end,
        break_start,
        break_end,
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

    // Response
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



    const attendanceDurations = attendance
      ? calculateAttendanceDurations({
        date: selectedDateStr,
        time_in: attendance.time_in,
        time_out: attendance.time_out,
        work_start: attendance.work_start,
        work_end: attendance.work_end,
        lunch_start: attendance.lunch_start,
        lunch_end: attendance.lunch_end,
        break_start: attendance.break_start,
        break_end: attendance.break_end
      })
      : {
        working_hours: "00:00:00",
        work_duration: "00:00:00",
        office_hours: "00:00:00",
        break_duration: "00:00:00",
        lunch_duration: "00:00:00"
      };

    const breaks_log = [
      {
        sr_no: 1,
        break_type: "Lunch Break",
        start_time: attendance?.lunch_start || "",
        end_time: attendance?.lunch_end || "",
        duration: attendanceDurations.lunch_duration
      },
      {
        sr_no: 2,
        break_type: "Normal Break",
        start_time: attendance?.break_start || "",
        end_time: attendance?.break_end || "",
        duration: attendanceDurations.break_duration
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

function getISTOffsetDate(offsetDays = 0) {
  const now = new Date();
  now.setHours(now.getHours() + 5, now.getMinutes() + 30); // convert to IST
  now.setDate(now.getDate() + offsetDays);
  return now.toISOString().split("T")[0];
}

exports.getLogs = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;
    const { type, date, week_start_date } = req.query;
    const user = await User.findOne({ where: { emp_id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];
    const joiningDate = user.joining_date ? new Date(user.joining_date) : null;

    async function processLogs(req, res) {
      const emp_id = req.user.emp_id;
      const { type, date, week_start_date } = req.query;

      // if (!type || !["daily", "weekly", "monthly"].includes(type)) {
      //   return res.status(400).json({ message: "type must be daily | weekly | monthly" });
      // }



      // =====================================================================================
      // 1️⃣ DAILY LOG -----------------------------------------------------------------------
      // =====================================================================================
      if (type === "daily") {
        const selectedDateStr = date || getISTDateString();
        // const selectedDateStr = finalDate ? new Date(finalDate) : new Date();
        if (joiningDate && selectedDateStr < joiningDate) {
          return res.json({ message: "No data available (before joining date)" });
        }


        const todos = await Todo.findAll({
          where: {
            emp_id: fetchIds,
            [Op.or]: [
              // Today’s tasks
              { date: selectedDateStr },

              // Previous pending tasks
              {
                date: { [Op.lt]: selectedDateStr },
                status: { [Op.in]: ["pause", "not_started"] }
              },

              // ⭐ NEW CONDITION — future tasks explicitly created
              {
                date: { [Op.gt]: selectedDateStr },
                status: "not_started"
              }
            ]

          },
          order: [["date", "ASC"], ["sr_no", "ASC"]]
        });

        const completed = [];
        const pending = [];
        const nextDay = [];
        const keyLearnings = [];

        todos.forEach(todo => {
          const timeSpent = todo.total_tracked_time
            ? secondsToHHMM(toSeconds(todo.total_tracked_time))
            : "00:00";

          // If future date & not_started → next day todo
          if (todo.date > selectedDateStr && todo.status === "not_started") {
            nextDay.push({
              sr_no: todo.sr_no,
              title: todo.title,
              description: todo.description,
              assigned_by: todo.assigned_by || "N/A",
              priority: todo.priority
            });
            return;
          }


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

        const attendance = await Attendance.findOne({ where: { emp_id, date: selectedDateStr } });

        if (attendance?.key_learning) keyLearnings.push(attendance.key_learning);

        const attendanceDurations = attendance
          ? calculateAttendanceDurations(attendance)
          : {
            working_hours: "00:00:00",
            work_duration: "00:00:00",
            office_hours: "00:00:00",
            break_duration: "00:00:00",
            lunch_duration: "00:00:00"
          };

        return res.json({
          dailyLog: {
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
                break_type: "Lunch Break",
                start_time: attendance?.lunch_start || "",
                end_time: attendance?.lunch_end || "",
                duration: attendanceDurations.lunch_duration
              },
              {
                break_type: "Normal Break",
                start_time: attendance?.break_start || "",
                end_time: attendance?.break_end || "",
                duration: attendanceDurations.break_duration
              }
            ],
            key_learnings_notes: keyLearnings.join("\n")
          }
        });
      }

      // =====================================================================================
      // 2️⃣ WEEKLY LOG ----------------------------------------------------------------------
      // =====================================================================================
      if (type === "weekly") {
        if (!week_start_date)
          return res.status(400).json({ message: "week_start_date is required" });

        const startDateStr = week_start_date;
        const endDateStr = (() => {
          const d = new Date(startDateStr);
          d.setDate(d.getDate() + 5);
          return d.toISOString().split("T")[0];
        })();

        // Check joining date
        if (joiningDate && endDateStr < joiningDate) {
          return res.json({ message: "No data available (before joining date)" });
        }

        // Adjust start if week overlaps joining date
        if (joiningDate && startDateStr < joiningDate && endDateStr >= joiningDate) {
          startDateStr = joiningDate;
        }

        const todos = await Todo.findAll({
          where: {
            emp_id: fetchIds,
            date: {
              [Op.between]: [startDateStr, endDateStr]
            }
          },
          order: [["date", "ASC"], ["sr_no", "ASC"]]
        });

        const completed = [];
        const pending = [];
        const notStarted = [];
        const keyLearnings = [];

        todos.forEach(t => {
          if (t.status === "complete") {
            completed.push({
              title: t.title,
              description: t.description,
              assigned_by: t.assigned_by,
              completion_date: t.updatedAt.toISOString().split("T")[0],
              notes: t.remark
            });
          } else if (t.status === "pause") {
            pending.push({
              title: t.title,
              description: t.description,
              reason_for_delay: t.remark,
              plan_for_completion: nextWorkingDay()
            });
          } else {
            notStarted.push({
              title: t.title,
              description: t.description,
              priority: t.priority
            });
          }

          if (t.key_learning) keyLearnings.push(t.key_learning);
        });

        return res.json({
          weeklyLog: {
            header: {
              name: user.name,
              emp_id,
              department: user.team_name,
              week_range: `${startDateStr} to ${endDateStr}`,
              prepared_by: user.name
            },
            tasks_completed_this_week: completed,
            weekly_goals_met: [
              ...completed.map(c => ({ goal: c.title, status: "Achieved", notes: c.notes })),
              ...pending.map(p => ({ goal: p.title, status: "Partial", notes: p.reason_for_delay }))
            ],
            delays_missed_goals: pending,
            todo_next_week: notStarted,
            key_learnings: keyLearnings.join("\n")
          }
        });
      }

      // =====================================================================================
      // 3️⃣ MONTHLY LOG ---------------------------------------------------------------------
      // =====================================================================================
      if (type === "monthly") {
        if (!date) return res.status(400).json({ message: "Date is required for monthly log" });

        console.log("===== MONTHLY LOG STRICT (1st → End of Month) =====");
        const selectedDateStr = date || getISTDateString();
        const selectedDate = new Date(selectedDateStr);
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth(); // 0-index

        const monthStartStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const monthEndStr = (() => {
          const d = new Date(year, month + 1, 0);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        })();
        if (joiningDate && monthEndStr < joiningDate) {
          return res.json({ message: "No data available (before joining date)" });
        }

        // Adjust month start if month overlaps joining date
        if (joiningDate && monthStartStr < joiningDate && monthEndStr >= joiningDate) {
          monthStartStr.setTime(joiningDate.getTime());
        }

        console.log("Month Start:", monthStartStr);
        console.log("Month End:", monthEndStr);

        const todos = await Todo.findAll({
          where: {
            emp_id: fetchIds,
            date: {
              [Op.between]: [monthStartStr, monthEndStr]
            }
          },
          order: [["date", "ASC"], ["sr_no", "ASC"]]
        });

        console.log("Total todos fetched for month:", todos.length);

        const weeklyGroups = [];
        let weekStartStr = monthStartStr;

        while (weekStartStr <= monthEndStr) {
          const weekStartDate = new Date(weekStartStr);
          let weekEndDate = new Date(weekStartDate);
          weekEndDate.setDate(weekEndDate.getDate() + 6);
          if (weekEndDate > new Date(monthEndStr)) weekEndDate = new Date(monthEndStr);

          const weekEndStr = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}`;

          console.log("Week range:", weekStartStr, "to", weekEndStr);

          const weekTodos = todos.filter(t => t.date >= weekStartStr && t.date <= weekEndStr);
          console.log("Todos in this week:", weekTodos.length);

          if (weekTodos.length > 0) {
            const completed = [];
            const pending = [];
            const notStarted = [];

            weekTodos.forEach(t => {
              if (t.status === "complete") {
                completed.push({
                  title: t.title,
                  description: t.description,
                  assigned_by: t.assigned_by || "N/A",
                  completion_date: t.updatedAt.toISOString().split("T")[0],
                  notes: t.remark || ""
                });
              } else if (t.status === "pause") {
                pending.push({
                  title: t.title,
                  description: t.description,
                  assigned_by: t.assigned_by || "N/A",
                  reason_for_delay: t.remark || "",
                  plan_for_completion: nextWorkingDay()
                });
              } else {
                notStarted.push({
                  title: t.title,
                  description: t.description,
                  assigned_by: t.assigned_by || "N/A",
                  priority: t.priority
                });
              }
            });

            weeklyGroups.push({
              week_start: weekStartStr,
              week_end: weekEndStr,
              tasks_completed_this_week: completed,
              weekly_goals_met: [
                ...completed.map(c => ({ goal: c.title, status: "Achieved", notes: c.notes })),
                ...pending.map(p => ({ goal: p.title, status: "Partial", notes: p.reason_for_delay }))
              ],
              delays_missed_goals: pending,
              todo_next_week: notStarted,
              key_learnings: weekTodos.map(t => t.key_learning).filter(Boolean).join("\n")
            });
          }

          // Prepare next week's start
          const nextWeekStart = new Date(weekStartStr);
          nextWeekStart.setDate(nextWeekStart.getDate() + 7);
          weekStartStr = `${nextWeekStart.getFullYear()}-${String(nextWeekStart.getMonth() + 1).padStart(2, "0")}-${String(nextWeekStart.getDate()).padStart(2, "0")}`;
        }

        console.log("Final weeklyGroups:", weeklyGroups.map(w => ({ start: w.week_start, end: w.week_end })));

        return res.json({
          monthlyLog: {
            employee: user.name,
            emp_id,
            department: user.team_name,
            month: `${year}-${String(month + 1).padStart(2, "0")}`,
            weeks: weeklyGroups
          }
        });
      }

    }

    // Add this helper at the top of your file
    function addDays(date, days) {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      return result;
    }

    // Optional: format Date to YYYY-MM-DD
    function formatDate(date) {
      return date.toISOString().split("T")[0];
    }

    // ------------------ YESTERDAY ------------------
    if (type === "yesterday") {
      const today = new Date();
      const yesterday = addDays(today, -1);
      const yStr = formatDate(yesterday); // YYYY-MM-DD

      if (joiningDate && yStr < joiningDate) {
        return res.json({ message: "No data available (before joining date)" });
      }


      // Fetch user once
      const user = await User.findOne({ where: { emp_id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

      // Fetch todos for yesterday
      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          [Op.or]: [
            { date: yStr },
            { date: { [Op.lt]: yStr }, status: { [Op.in]: ["pause", "not_started"] } }
          ]
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
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

      // Fetch attendance only for yesterday
      const attendance = await Attendance.findOne({ where: { emp_id, date: yStr } });
      if (attendance?.key_learning) keyLearnings.push(attendance.key_learning);

      const attendanceDurations = attendance
        ? calculateAttendanceDurations(attendance)
        : {
          working_hours: "00:00:00",
          work_duration: "00:00:00",
          office_hours: "00:00:00",
          break_duration: "00:00:00",
          lunch_duration: "00:00:00"
        };

      return res.json({
        dailyLog: {
          header: {
            "Intern ID": emp_id,
            "Intern Name": user.name,
            "Department": user.team_name,
            "Supervisor Name": user.supervisor_name || null,
            "Date": yStr,
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
              break_type: "Lunch Break",
              start_time: attendance?.lunch_start || "",
              end_time: attendance?.lunch_end || "",
              duration: attendanceDurations.lunch_duration
            },
            {
              break_type: "Normal Break",
              start_time: attendance?.break_start || "",
              end_time: attendance?.break_end || "",
              duration: attendanceDurations.break_duration
            }
          ],
          key_learnings_notes: keyLearnings.join("\n")
        }
      });
    }


    // ------------------ LAST WEEK ------------------
    if (type === "last_week") {

      let today = getISTDate();
      let lastWeekStart = addDays(today, -today.getDay() - 7);
      let lastWeekEnd = addDays(lastWeekStart, 6);

      // Check joining date
      if (joiningDate && lastWeekEnd < joiningDate) {
        return res.json({ message: "No data available (before joining date)" });
      }

      // Adjust start if week overlaps joining date
      if (joiningDate && lastWeekStart < joiningDate && lastWeekEnd >= joiningDate) {
        lastWeekStart = joiningDate;
      }

      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          date: {
            [Op.between]: [
              formatDate(lastWeekStart),
              formatDate(lastWeekEnd)
            ]
          }
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
      });

      // group in memory
      const grouped = {};
      todos.forEach(t => {
        if (!grouped[t.date])
          grouped[t.date] = { completed: [], pending: [], notStarted: [], keyLearnings: [] };

        if (t.status === "complete") {
          grouped[t.date].completed.push({
            title: t.title,
            description: t.description,
            completion_date: t.updatedAt.toISOString().split("T")[0],
            notes: t.remark,
          });
        } else if (t.status === "start" || t.status === "pause") {
          grouped[t.date].pending.push({
            title: t.title,
            description: t.description,
            reason_for_delay: t.remark,
            plan_for_completion: nextWorkingDay()
          });
        } else {
          grouped[t.date].notStarted.push({
            title: t.title,
            description: t.description,
            priority: t.priority
          });
        }

        if (t.key_learning) grouped[t.date].keyLearnings.push(t.key_learning);
      });

      return res.json({
        weeklyLog: {
          employee: user.name,
          emp_id,
          department: user.team_name,
          week_start: formatDate(lastWeekStart),
          week_end: formatDate(lastWeekEnd),
          days: grouped
        }
      });
    }


    // ------------------ LAST MONTH ------------------
    if (type === "last_month") {
      const now = new Date();
      let year = now.getFullYear();
      let month = now.getMonth(); // 0-indexed

      // Previous month
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;

      let monthStart = new Date(prevYear, prevMonth, 1);
      const monthEnd = new Date(prevYear, prevMonth + 1, 0); // last day of prev month

      // Adjust if joiningDate is inside this month
      if (joiningDate) {
        const joinDateObj = new Date(joiningDate);
        if (monthEnd < joinDateObj) {
          return res.json({ message: "No data available (before joining date)" });
        }
        if (monthStart < joinDateObj && monthEnd >= joinDateObj) {
          monthStart = joinDateObj; // correctly adjust start
        }
      }

      // Convert to YYYY-MM-DD for querying
      const monthStartStr = monthStart.toISOString().split("T")[0];
      const monthEndStr = monthEnd.toISOString().split("T")[0];

      const user = await User.findOne({ where: { emp_id } });
      if (!user) return res.status(404).json({ message: "User not found" });

      const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          date: { [Op.between]: [monthStartStr, monthEndStr] },
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]],
      });

      // Weekly grouping (same as before)
      const weeklyGroups = [];
      let weekStart = new Date(monthStart);
      while (weekStart <= monthEnd) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekEnd > monthEnd) weekEnd.setDate(monthEnd.getDate());

        const weekTodos = todos.filter(
          t =>
            t.date >= weekStart.toISOString().split("T")[0] &&
            t.date <= weekEnd.toISOString().split("T")[0]
        );

        if (weekTodos.length) {
          const completed = [];
          const pending = [];
          const notStarted = [];

          weekTodos.forEach(t => {
            if (t.status === "complete") completed.push(t);
            else if (t.status === "pause") pending.push(t);
            else notStarted.push(t);
          });

          weeklyGroups.push({
            week_start: weekStart.toISOString().split("T")[0],
            week_end: weekEnd.toISOString().split("T")[0],
            tasks_completed_this_week: completed,
            delays_missed_goals: pending,
            todo_next_week: notStarted,
            key_learnings: weekTodos.map(t => t.key_learning).filter(Boolean).join("\n")
          });
        }

        weekStart.setDate(weekStart.getDate() + 7);
      }

      return res.json({
        monthlyLog: {
          employee: user.name,
          emp_id,
          department: user.team_name,
          month: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`,
          weeks: weeklyGroups
        }
      });
    }




    // =====================================================================================
    // 7️⃣ CUSTOM RANGE (start_date → end_date)
    // =====================================================================================
    if (type === "custom_range") {
      const { start_date, end_date } = req.query;

      if (!start_date || !end_date)
        return res.status(400).json({ message: "start_date and end_date required" });

      // Strictly separate from existing logic → NOT altering monthly/weekly
      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          date: {
            [Op.between]: [start_date, end_date]
          }
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
      });

      const grouped = {};

      todos.forEach(t => {
        if (!grouped[t.date]) grouped[t.date] = { completed: [], pending: [], notStarted: [], keyLearnings: [] };

        if (t.status === "complete") {
          grouped[t.date].completed.push({
            title: t.title,
            description: t.description,
            assigned_by: t.assigned_by,
            completion_date: t.updatedAt.toISOString().split("T")[0],
            notes: t.remark
          });
        } else if (t.status === "pause" || t.status === "start") {

          grouped[t.date].pending.push({
            title: t.title,
            description: t.description,
            reason_for_delay: t.remark,
            plan_for_completion: nextWorkingDay()
          });
        } else {
          grouped[t.date].notStarted.push({
            title: t.title,
            description: t.description,
            priority: t.priority
          });
        }

        if (t.key_learning) grouped[t.date].keyLearnings.push(t.key_learning);
      });

      return res.json({
        customRangeLog: {
          emp_id,
          employee: user.name,
          department: user.team_name,
          range: `${start_date} to ${end_date}`,
          days: grouped
        }
      });
    }
    // Normal daily/weekly/monthly call
    return processLogs(req, res);


  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error", err });
  }
};



function nextWorkingDay() {
  const today = getISTDate();
  const next = new Date(today);
  next.setDate(today.getDate() + 1);

  if (next.getDay() === 0) { // Sunday
    next.setDate(next.getDate() + 1);
  }

  return getISTDateString(next);
}

exports.getWeeklyLog = async (req, res) => {
  try {
    const user_id = req.user.id;

    // Fetch emp_id from IdentityCard
    const emp_id = await getEmpId(user_id);
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: "Date is required for weekly log" });
    }

    const user = await User.findOne({ where: { emp_id } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    const selectedDate = new Date(date);
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    //-------------------------------
    // CUSTOM WEEK LOGIC
    //-------------------------------
    const firstDate = new Date(year, month, 1);
    let currentWeekStart = new Date(firstDate);

    if (firstDate.getDay() === 6) {
      currentWeekStart = new Date(year, month, 1); // week of 1 day
    } else {
      const day = firstDate.getDay();
      const offset = (day === 0 ? 1 : 8 - day);
      currentWeekStart = new Date(year, month, 1 + offset - 1);
    }

    let weekStart = null;
    let weekEnd = null;

    while (true) {
      let tempStart = new Date(currentWeekStart);
      let tempEnd = new Date(tempStart);
      tempEnd.setDate(tempEnd.getDate() + 5); // Mon–Sat (6 days)

      if (selectedDate >= tempStart && selectedDate <= tempEnd) {
        weekStart = tempStart;
        weekEnd = tempEnd;
        break;
      }

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    const weekStartStr = getISTDateString(weekStart);
    const weekEndStr = getISTDateString(weekEnd);

    //------------------------------------
    // FETCH WEEKLY TASKS
    //------------------------------------
    const tasks = await Todo.findAll({
      where: {
        emp_id: fetchIds,
        date: { [Op.between]: [weekStartStr, weekEndStr] }
      },
      order: [["date", "ASC"], ["sr_no", "ASC"]],
    });

    //------------------------------------
    // GROUPING
    //------------------------------------
    const completed = [];
    const weekly_goals = [];
    const delays = [];
    const nextWeek = [];
    const keyLearnings = [];

    tasks.forEach(todo => {
      const item = {
        sr_no: todo.sr_no,
        title: todo.title,
        description: todo.description,
        assigned_by: todo.assigned_by || "N/A",
        priority: todo.priority || "Medium"
      };

      // ✅ Completed task
      if (todo.status === "complete") {
        completed.push({
          ...item,
          completion_date: getISTDateString(todo.updatedAt),
          notes: todo.remark || ""
        });

        weekly_goals.push({
          title: todo.title,
          description: todo.description,
          status: "Achieved",
          notes: todo.remark || ""
        });

        if (todo.key_learning) keyLearnings.push(todo.key_learning);
      }

      // ✅ Paused task
      else if (todo.status === "pause") {
        delays.push({
          ...item,
          reason: todo.remark || "No reason provided",
          plan: nextWorkingDay()
        });

        weekly_goals.push({
          title: todo.title,
          description: todo.description,
          status: "Partial",
          notes: todo.remark || ""
        });

        if (todo.key_learning) keyLearnings.push(todo.key_learning);
      }

      // ❌ Not started → only in next week (not in weekly goals)
      else if (todo.status === "not_started") {
        nextWeek.push({
          ...item
        });
      }
    });

    //------------------------------------
    // FINAL STRUCTURE
    //------------------------------------
    const weeklyLog = {
      header: {
        Name: user.name,
        Department: user.team_name,
        "Week Covered": `${weekStartStr} to ${weekEndStr}`,
        "Prepared By": user.name
      },

      tasks_completed_this_week: completed,

      weekly_goals, // only completed + paused (not 'not_started')

      delays_and_missed_goals: delays,

      next_week_todo: nextWeek,

      key_learnings_suggestions: keyLearnings.join("\n")
    };

    res.json({ weeklyLog });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
};

/**
 * Generate the same dailyLog object you build in the "daily" branch.
 * Throws when dateStr is missing/invalid.
 *
 * @param {string} emp_id - Employee id (primary)
 * @param {string} dateStr - YYYY-MM-DD (required)
 * @param {Object} user - User model instance (needed for name/team)
 * @param {Array} fetchIds - Array of emp_id and previous ids to query todos
 */
async function generateDailyLog(emp_id, dateStr, user, fetchIds) {
  if (!dateStr) {
    throw new Error("generateDailyLog called without a date");
  }

  // parse & validate date
  const selectedDate = getISTDateFromString(dateStr);
  if (!selectedDate || isNaN(selectedDate.getTime())) {
    throw new Error("Invalid date passed to generateDailyLog: " + dateStr);
  }

  // Check joining date restriction if user has joining_date
  const joiningDate = user.joining_date ? getISTDateFromString(user.joining_date) : null;
  if (joiningDate && selectedDate < joiningDate) {
    return { message: "No data available (before joining date)" };
  }

  const selectedDateStr = getISTDateStringFromDate(selectedDate);

  // Fetch todos (same criteria as your daily branch)
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

  // Attendance for that date
  const attendance = await Attendance.findOne({ where: { emp_id, date: selectedDateStr } });
  const attendanceDurations = attendance
    ? calculateAttendanceDurations({
      date: selectedDateStr,
      time_in: attendance.time_in,
      time_out: attendance.time_out,
      work_start: attendance.work_start,
      work_end: attendance.work_end,
      lunch_start: attendance.lunch_start,
      lunch_end: attendance.lunch_end,
      break_start: attendance.break_start,
      break_end: attendance.break_end
    })
    : {
      working_hours: "00:00:00",
      work_duration: "00:00:00",
      office_hours: "00:00:00",
      break_duration: "00:00:00",
      lunch_duration: "00:00:00"
    };

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
        duration: attendanceDurations.lunch_duration
      },
      {
        sr_no: 2,
        break_type: "Normal Break",
        start_time: attendance?.break_start || "",
        end_time: attendance?.break_end || "",
        duration: attendanceDurations.break_duration
      }
    ],
    key_learnings_notes: attendance?.key_learning ? [attendance.key_learning, ...keyLearnings].join("\n") : keyLearnings.join("\n")
  };

  return dailyLog;
}





exports.adminGetLog = async (req, res) => {
  try {
    const { type, emp_id, date, week_start_date, month, start_date, end_date } = req.query;


    let finalType = type;
    let finalDate = date;
    let finalWeekStartDate = week_start_date;



    // --------------------------
    // 1️⃣ Admin must provide emp_id
    // --------------------------
    if (!emp_id) {
      return res.status(400).json({
        message: "emp_id is required for admin to fetch logs",
      });
    }

    // --------------------------
    // 2️⃣ Validate type
    // --------------------------
    // if (!type || !["daily", "weekly", "monthly"].includes(type)) {
    //   return res.status(400).json({
    //     message: "Type must be one of daily, weekly, monthly",
    //   });
    // }

    const allowed = [
      "daily", "weekly", "monthly",
      "today", "yesterday",
      "current_week", "last_week",
      "current_month", "last_month",
      "custom_range"
    ];

    if (!type || !allowed.includes(type)) {
      return res.status(400).json({
        message: "Type must be one of: " + allowed.join(", ")
      });
    }

    // --------------------------
    // 3️⃣ Check employee exists
    // --------------------------
    const user = await User.findOne({
      where: { emp_id },
    });

    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const fetchIds = [user.emp_id, ...(user.previous_emp_ids || [])];

    const nowIST = getISTDate(); // ALWAYS use IST

    const joiningDate = user.joining_date ? getISTDateFromString(user.joining_date) : null;


    // ------------------------------------------------
    // 🔥 TYPE REMAPPING
    // ------------------------------------------------

    // TODAY
    if (type === "today") {
      finalType = "daily";
      date = getISTDateStringFromDate(nowIST);
    }

    // YESTERDAY
    if (type === "yesterday") {
      finalType = "daily";
      const y = new Date(nowIST);
      y.setDate(y.getDate() - 1);
      finalDate = getISTDateStringFromDate(y);
    }

    // CURRENT WEEK → Mon to Sat
    if (type === "current_week") {
      finalType = "weekly";

      let d = new Date(nowIST);
      let day = d.getDay(); // Sun=0

      const numeric = day === 0 ? 7 : day;
      const monday = new Date(d);
      monday.setDate(d.getDate() - (numeric - 1));

      week_start_date = getISTDateStringFromDate(monday);
    }

    // LAST WEEK
    if (type === "last_week") {
      finalType = "weekly";

      let d = new Date(nowIST);
      let day = d.getDay();
      const numeric = day === 0 ? 7 : day;

      let thisMonday = new Date(d);
      thisMonday.setDate(d.getDate() - (numeric - 1));

      let lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);

      finalWeekStartDate = getISTDateStringFromDate(lastMonday);
    }


    // CURRENT MONTH
    if (type === "current_month") {
      finalType = "monthly";

      let yr = nowIST.getFullYear();
      let mn = nowIST.getMonth() + 1;
      finalDate = `${yr}-${mn}-01`;
    }

    // LAST MONTH
    if (type === "last_month") {
      finalType = "monthly";

      let yr = nowIST.getFullYear();
      let lastMonth = nowIST.getMonth(); // Previous

      const last = new Date(yr, lastMonth - 1, 1);
      finalDate = getISTDateStringFromDate(last);
    }

    // ------------------------------------------------
    //           CUSTOM RANGE API
    // ------------------------------------------------
    if (type === "custom_range") {
      if (!start_date || !end_date)
        return res.status(400).json({ message: "start_date and end_date required" });

      const s = getISTDateFromString(start_date);
      const e = getISTDateFromString(end_date);

      if (joiningDate && e < joiningDate) {
        return res.json({ message: "No data available (before joining date)" });
      }

      const adjustedStart = joiningDate && s < joiningDate ? joiningDate : s;
      const formatDate = (d) => getISTDateStringFromDate(d);

      // Build logs array: call generateDailyLog(emp_id, dateStr, user, fetchIds)
      const logs = [];
      let current = new Date(adjustedStart);

      while (current <= e) {
        const currentDateStr = formatDate(current);

        // Always pass date and required context to avoid the "called without a date" error
        try {
          const dailyLog = await generateDailyLog(emp_id, currentDateStr, user, fetchIds);
          logs.push({
            date: currentDateStr,
            ...dailyLog
          });
        } catch (err) {
          // If a single day's log fails, capture the error but continue the loop
          logs.push({
            date: currentDateStr,
            error: err.message || "Error generating daily log"
          });
        }

        current.setDate(current.getDate() + 1);
      }

      return res.json({
        custom_range: {
          start_date: formatDate(adjustedStart),
          end_date: formatDate(e),
          total_days: logs.length,
          logs
        }
      });
    }



    //     if (type === "custom_range") {
    //   if (!start_date || !end_date)
    //     return res.status(400).json({ message: "start_date and end_date required" });

    //   const s = getISTDateFromString(start_date);
    //   const e = getISTDateFromString(end_date);

    //   // Joining date restrictions
    //   if (joiningDate && e < joiningDate) {
    //     return res.json({ message: "No data available (before joining date)" });
    //   }

    //   const adjustedStart = joiningDate && s < joiningDate ? joiningDate : s;

    //   const formatDate = (d) => getISTDateStringFromDate(d);

    //   // Loop through each day
    //   const logs = [];
    //   let current = new Date(adjustedStart);

    //   while (current <= e) {
    //     const currentDateStr = formatDate(current);

    //     // 🔥 Your existing daily log fetcher:
    //     const dailyLog = await generateDailyLog(emp_id, currentDateStr);

    //     logs.push({
    //       date: currentDateStr,
    //       ...dailyLog
    //     });

    //     current.setDate(current.getDate() - (-1)); // increment by 1 day
    //   }

    //   return res.json({
    //     custom_range: {
    //       start_date: formatDate(adjustedStart),
    //       end_date: formatDate(e),
    //       total_days: logs.length,
    //       logs
    //     }
    //   });
    // }




    if (finalType === "daily") {
      // --- Daily log ---
      const selectedDate = finalDate ? getISTDateFromString(finalDate) : getISTDate();
      if (joiningDate && selectedDate < joiningDate) {
        return res.json({ message: "No data available (before joining date)" });
      }

      const selectedDateStr = getISTDateStringFromDate(selectedDate);


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
      const attendanceDurations = attendance
        ? calculateAttendanceDurations({
          date: selectedDateStr,
          time_in: attendance.time_in,
          time_out: attendance.time_out,
          work_start: attendance.work_start,
          work_end: attendance.work_end,
          lunch_start: attendance.lunch_start,
          lunch_end: attendance.lunch_end,
          break_start: attendance.break_start,
          break_end: attendance.break_end
        })
        : {
          working_hours: "00:00:00",
          work_duration: "00:00:00",
          office_hours: "00:00:00",
          break_duration: "00:00:00",
          lunch_duration: "00:00:00"
        };

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
            duration: attendanceDurations.lunch_duration
          },
          {
            sr_no: 2,
            break_type: "Normal Break",
            start_time: attendance?.break_start || "",
            end_time: attendance?.break_end || "",
            duration: attendanceDurations.break_duration
          }
        ],
        key_learnings_notes: attendance?.key_learning ? [attendance.key_learning, ...keyLearnings].join("\n") : keyLearnings.join("\n")
      };

      return res.json({ dailyLog });
    }

    if (finalType === "weekly") {
      if (!finalWeekStartDate)
        return res.status(400).json({ message: "week_start_date is required" });

      let startDate = getISTDateFromString(finalWeekStartDate);
      let endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 5);

      if (joiningDate && endDate < joiningDate) {
        return res.json({ message: "No data available (before joining date)" });
      }

      // If week overlaps joining date, adjust startDate
      if (joiningDate && startDate < joiningDate && endDate >= joiningDate) {
        startDate = joiningDate;
      }

      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          date: {
            [Op.between]: [
              getISTDateStringFromDate(startDate),
              getISTDateStringFromDate(endDate)
            ]
          }
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
      });

      // --- CLASSIFY TASKS ---
      const completed = [];
      const pending = []; // paused only
      const notStarted = [];

      todos.forEach((t, i) => {
        if (t.status === "complete") {
          completed.push({
            sr_no: completed.length + 1,
            title: t.title,
            description: t.description,
            assigned_by: t.assigned_by || "N/A",
            completion_date: getISTDateStringFromDate(new Date(t.updatedAt)),
            notes: t.remark || ""
          });
        } else if (t.status === "pause") {
          pending.push({
            title: t.title,
            description: t.description,
            assigned_by: t.assigned_by || "N/A",
            reason_for_delay: t.remark || "",
            plan_for_completion: nextWorkingDay()
          });
        } else if (t.status === "not_started") {
          notStarted.push({
            title: t.title,
            description: t.description,
            assigned_by: t.assigned_by || "N/A",
            priority: t.priority
          });
        }
      });

      // Weekly goals met (completed + paused)
      const weeklyGoalsMet = [
        ...completed.map(c => ({
          title: c.title,
          description: c.description,
          status: "Achieved",
          notes: c.notes
        })),
        ...pending.map(p => ({
          title: p.title,
          description: p.description,
          status: "Partial",
          notes: p.reason_for_delay
        }))
      ];

      const weeklyLog = {
        header: {
          name: user.name,
          "Employee ID": emp_id,
          department: user.team_name,
          week_covered: `${getISTDateStringFromDate(startDate)} to ${getISTDateStringFromDate(endDate)}`,
          prepared_by: user.name
        },
        tasks_completed_this_week: completed,
        weekly_goals_met: weeklyGoalsMet,
        delays_missed_goals: pending, // NOT including not_started
        todo_next_week: [
          ...notStarted.map(n => ({ ...n })) // not started tasks go only here
        ],
        key_learnings_suggestions: todos.map(t => t.key_learning).filter(Boolean).join("\n")
      };

      return res.json({ weeklyLog });
    }

    // Override incoming date when we auto-compute month start
    // if (finalType === "monthly" && finalDate) {
    //   req.query.date = finalDate;
    // }

    if (finalType === "monthly") {
      if (!finalDate)
        return res.status(400).json({ message: "Date is required for monthly log" });

      const selectedDate = getISTDateFromString(finalDate);

      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      const monthStart = new Date(year, month, 1);
      const monthEnd = new Date(year, month + 1, 0);

      if (joiningDate && monthEnd < joiningDate) {
        return res.json({ message: "No data available (before joining date)" });
      }

      // If month overlaps joining date, adjust monthStart
      if (joiningDate && monthStart < joiningDate && monthEnd >= joiningDate) {
        monthStart.setTime(joiningDate.getTime());
      }

      // Fetch full month tasks
      const todos = await Todo.findAll({
        where: {
          emp_id: fetchIds,
          date: {
            [Op.between]: [
              getISTDateStringFromDate(monthStart),
              getISTDateStringFromDate(monthEnd)
            ]
          }
        },
        order: [["date", "ASC"], ["sr_no", "ASC"]]
      });

      // Build weekly groups
      const weeklyGroups = [];
      let currentWeekStart = new Date(monthStart);

      while (currentWeekStart <= monthEnd) {

        // Create fresh copies for each week
        let weekStart = new Date(currentWeekStart);
        let weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 5); // Monday–Saturday style

        if (weekEnd > monthEnd) weekEnd = new Date(monthEnd);

        const weekTodos = todos.filter(t => {
          const d = getISTDateFromString(t.date);
          return d >= weekStart && d <= weekEnd;
        });

        if (weekTodos.length > 0) {
          const completed = [];
          const pending = [];
          const notStarted = [];

          weekTodos.forEach(t => {
            if (t.status === "complete") {
              completed.push({
                title: t.title,
                description: t.description,
                assigned_by: t.assigned_by || "N/A",
                completion_date: getISTDateStringFromDate(new Date(t.updatedAt)),
                notes: t.remark || ""
              });
            } else if (t.status === "pause") {
              pending.push({
                title: t.title,
                description: t.description,
                assigned_by: t.assigned_by || "N/A",
                reason_for_delay: t.remark || "",
                plan_for_completion: nextWorkingDay()
              });
            } else if (t.status === "not_started") {
              notStarted.push({
                title: t.title,
                description: t.description,
                assigned_by: t.assigned_by || "N/A",
                priority: t.priority
              });
            }
          });

          weeklyGroups.push({
            week_start: getISTDateStringFromDate(weekStart),
            week_end: getISTDateStringFromDate(weekEnd),

            tasks_completed_this_week: completed,

            weekly_goals_met: [
              ...completed.map(c => ({
                goal: c.title,
                status: "Achieved",
                notes: c.notes
              })),
              ...pending.map(p => ({
                goal: p.title,
                status: "Partial",
                notes: p.reason_for_delay
              }))
            ],

            delays_missed_goals: pending,

            todo_next_week: [
              ...pending.map(d => ({ ...d, priority: "Medium" })),
              ...notStarted
            ],

            key_learnings_suggestions: weekTodos
              .map(t => t.key_learning)
              .filter(Boolean)
              .join("\n")
          });
        }

        // Move to next week (exactly 6 days)
        currentWeekStart.setDate(currentWeekStart.getDate() + 6);
      }

      return res.json({
        employee: user.name,
        "Employee ID": emp_id,
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


// -------------------
// IST helper functions
// -------------------

function getISTDateStringFromDate(date) {
  const d = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getISTDateFromString(dateStr) {
  const d = new Date(dateStr);
  const istDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  return istDate;
}




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
    // record.time_out = "Not Provided"; // mark as actual punch-out
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
