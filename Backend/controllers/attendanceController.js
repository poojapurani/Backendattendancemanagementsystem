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
        const absentCut = new Date(`${today}T14:00:00`);

        // Already punched in?
        const already = await Attendance.findOne({
            where: { emp_id, date: today }
        });

        if (already) {
            return res.status(400).json({ message: "Already punched in today",success:false });
        }

        // Block after 2 PM = absent
        /*
        if (now > absentCut) {
            return res.status(400).json({
                message: "You are marked absent today (Login allowed only before 2 PM)"
            });
        }
        */

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
            success:true,
            // status,
            // late_by: lateMinutes > 0 ? `${lateMinutes} min late` : "On time",
            attendance: record
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error",success:false });
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
  let dt = new Date(start);
  while (dt <= end) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return arr;
}


function secondsToHHMMSS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;
}



exports.getHistory = async (req, res) => {
  try {
    const emp_id = req.user.emp_id;

    // Fetch user
    const user = await User.findOne({
      where: { emp_id },
      attributes: ["emp_id", "joining_date", "name"]
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const today = new Date();
    const startDate = new Date(user.joining_date); // start from joining date
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999); // normalize time

    // Fetch all attendance from joining date to today
    const records = await Attendance.findAll({
      where: { emp_id, date: { [Op.between]: [startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]] } },
      order: [['date', 'ASC']]
    });

    // Map records for fast lookup
    const recordsMap = {};
    records.forEach(r => { recordsMap[r.date] = r; });

    const allDates = getDatesArray(startDate, endDate);
    let totalSeconds = 0;

    const formattedRecords = allDates.map(dateObj => {
      const dateStr = dateObj.toISOString().split("T")[0];
      const r = recordsMap[dateStr];

      let status = "not set"; // default before first punch
      let working_hours = "00:00:00";
      let time_in = null;
      let time_out = null;
      let isPresent = false;

      if (r) {
        status = r.status;
        working_hours = r.working_hours || "00:00:00";
        time_in = r.time_in || null;
        time_out = r.time_out || null;
        isPresent = ["present", "Late", "half-day"].includes(status);

        // Sum working hours
        if (working_hours) {
          const [h, m, s] = working_hours.split(":").map(Number);
          totalSeconds += h * 3600 + m * 60 + s;
        }
      } else {
        // Check if before first punch → 'not set', after first punch → 'absent'
        const firstPunchDate = records.length ? records[0].date : null;
        if (firstPunchDate && dateStr < firstPunchDate) {
          status = "not set";
        } else if (firstPunchDate && dateStr > firstPunchDate) {
          status = "absent";
        } else if (!firstPunchDate) {
          status = "not set"; // no punches at all
        }
      }

      return { date: dateStr, time_in, time_out, working_hours, status, isPresent };
    });

    const avgWorkingHours = formattedRecords.length
      ? secondsToHHMMSS(Math.floor(totalSeconds / formattedRecords.length))
      : "00:00:00";

    res.json({
      emp_id: user.emp_id,
      name: user.name,
      joining_date: user.joining_date,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      records: formattedRecords,
      averageWorkingHours: avgWorkingHours
    });

  } catch (err) {
    console.error("History Error:", err);
    res.status(500).json({ message: err.message });
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
      working_hours = `${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${seconds.toString().padStart(2,"0")}`;
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
exports.deleteAttendance = async (req, res) => {
  try {
    const { emp_id, date } = req.params;

    const record = await Attendance.findOne({
      where: { emp_id, date }
    });

    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    await record.destroy();

    res.json({ message: "✅ Attendance deleted successfully" });

  } catch (err) {
    console.error("Delete Attendance Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.adminAddAttendance = async (req, res) => {
  try {
    const { emp_id, date, punch_in, punch_out, status } = req.body;

    // Required fields check
    if ( !emp_id || !date || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Convert punch_in and punch_out to HH:MM:SS
    const formatToTime = (value) => {
      if (!value) return null;
      const dateObj = new Date(`1970-01-01 ${value}`);
      return dateObj.toTimeString().split(" ")[0]; // HH:MM:SS
    };

    const timeIn = formatToTime(punch_in);
    const timeOut = formatToTime(punch_out);

    // Calculate working hours if both exist
    let workingHours = null;

    if (timeIn && timeOut) {
      const start = new Date(`1970-01-01T${timeIn}`);
      const end = new Date(`1970-01-01T${timeOut}`);

      let diff = (end - start) / 1000; // seconds

      const hours = Math.floor(diff / 3600);
      diff -= hours * 3600;
      const minutes = Math.floor(diff / 60);
      const seconds = Math.floor(diff % 60);

      workingHours = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    // Insert into DB
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
    const { empId } = req.params;
    const { periodType } = req.query;

    if (!periodType || !["daily", "weekly", "monthly"].includes(periodType)) {
      return res.status(400).json({ message: "Invalid periodType" });
    }

    // Fetch User Info
    const user = await User.findOne({ where: { emp_id: empId } });
    if (!user) return res.status(404).json({ message: "Employee not found" });

    let whereCondition = { emp_id: empId };
    let startDate = null;
    let endDate = null;

    const today = new Date();

    // DAILY REPORT
    if (periodType === "daily") {
      whereCondition.date = today.toISOString().slice(0, 10);

      const records = await Attendance.findAll({
        where: whereCondition,
        include: [{ model: User, attributes: ["name", "emp_id", "department"] }],
      });

      return res.json({
        empId: user.emp_id,
        name: user.name,
        department: user.department,
        periodType,
        records,
      });
    }


    // WEEKLY REPORT
    if (periodType === "weekly") {
      const day = today.getDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat

      // Find Monday of the current week
      const monday = new Date(today);
      monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));

      // Saturday = Monday + 5 days
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);

      startDate = monday;
      endDate = saturday;

      whereCondition.date = {
        [Op.between]: [
          monday.toISOString().slice(0, 10),
          saturday.toISOString().slice(0, 10),
        ],
      };
    }


    // MONTHLY REPORT
    if (periodType === "monthly") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }

    // Fetch attendance data for range
    whereCondition.date = {
      [Op.between]: [
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
      ],
    };

    const records = await Attendance.findAll({
      where: whereCondition,
      include: [{ model: User, attributes: ["name", "emp_id", "department"] }],
    });

    // Convert DB records to map for fast lookup
    const recordMap = {};
    records.forEach((r) => (recordMap[r.date] = r));

    // Build complete date range
    const fullRecords = [];
    let ptr = new Date(startDate);
    const last = new Date(endDate);

    let present = 0;
    let absent = 0;
    let totalSeconds = 0;

    while (ptr <= last) {
      const dateStr = ptr.toISOString().slice(0, 10);

      if (recordMap[dateStr]) {
        const entry = recordMap[dateStr];
        fullRecords.push(entry);

        if (entry.status === "present" || entry.time_in) present++;

        if (entry.working_hours) {
          const [h, m, s] = entry.working_hours.split(":").map(Number);
          totalSeconds += h * 3600 + m * 60 + s;
        }
      } else {
        // No record → mark as ABSENT
        fullRecords.push({
          date: dateStr,
          status: "absent",
          time_in: null,
          time_out: null,
          working_hours: "00:00:00",
          User: {
            name: user.name,
            emp_id: user.emp_id,
            department: user.department,
          },
        });
        absent++;
      }

      ptr.setDate(ptr.getDate() + 1);
    }

    // Convert seconds → HH:MM:SS
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const totalWorkingHours =
      `${String(hrs).padStart(2, "0")}:` +
      `${String(mins).padStart(2, "0")}:` +
      `${String(secs).padStart(2, "0")}`;

    // Final Response
    res.json({
      empId: user.emp_id,
      name: user.name,
      department: user.department,
      periodType,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      present,
      absent,
      totalWorkingHours,
      records: fullRecords,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


