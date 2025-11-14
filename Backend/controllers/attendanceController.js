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
        const userId = req.user.id;
        const emp_id = req.user.emp_id;

        const today = new Date().toISOString().split("T")[0];
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

        const reportingTime = new Date(`${today}T09:30:00`);
        const halfDayCut = new Date(`${today}T13:30:00`);
        const absentCut = new Date(`${today}T14:00:00`);

        // Already punched in?
        const already = await Attendance.findOne({
            where: { user_id: userId, date: today }
        });

        if (already) {
            return res.status(400).json({ message: "Already punched in today" });
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
            user_id: userId,
            emp_id,
            date: today,
            time_in: currentTime,
            status
        });

        res.json({
            message: "Punch-in recorded",
            status,
            late_by: lateMinutes > 0 ? `${lateMinutes} min late` : "On time",
            attendance: record
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
};



// Punch Out
exports.punchOut = async (req, res) => {
    try {
        const user_id = req.user.id;
        const today = new Date().toISOString().split("T")[0];
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8);

        const halfDayCut = new Date(`${today}T13:30:00`);
        const reportingTime = new Date(`${today}T09:30:00`);

        const record = await Attendance.findOne({
            where: { user_id, date: today }
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
    const user_id = req.user.id;
    const { periodType } = req.query; // ?periodType=daily|weekly|monthly

    const today = new Date();
    let startDate, endDate = today;

    if (periodType === "daily") {
      startDate = today;
    } else if (periodType === "weekly") {
      const day = today.getDay();
      startDate = new Date(today);
      startDate.setDate(today.getDate() - (day === 0 ? 6 : day - 1)); // Monday
    } else if (periodType === "monthly") {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else {
      return res.status(400).json({ message: "Invalid periodType. Use daily, weekly, or monthly." });
    }

    const start = startDate.toISOString().split("T")[0];
    const end = endDate.toISOString().split("T")[0];

    const records = await Attendance.findAll({
      where: { user_id, date: { [Op.between]: [start, end] } },
      order: [['date', 'ASC']]
    });

    // Map records by date for easy lookup
    const recordsMap = {};
    records.forEach(r => { recordsMap[r.date] = r; });

    const allDates = getDatesArray(startDate, endDate);
    let totalSeconds = 0;

    const formattedRecords = allDates.map(dateObj => {
      const dateStr = dateObj.toISOString().split("T")[0];
      const r = recordsMap[dateStr];

      let status = "absent";
      let working_hours = "00:00:00";
      let isPresent = false;

      if (r) {
        status = r.status;
        working_hours = r.working_hours || "00:00:00";
        isPresent = ["present", "Late", "half-day"].includes(r.status);
        if (working_hours) {
          const [h, m, s] = working_hours.split(":").map(Number);
          totalSeconds += h * 3600 + m * 60 + s;
        }
      }

      return { date: dateStr, time_in: r?.time_in || null, time_out: r?.time_out || null, working_hours, status, isPresent };
    });

    let avgWorkingHours = "00:00:00";
    if (formattedRecords.length > 0) {
      const avgSeconds = Math.floor(totalSeconds / formattedRecords.length);
      avgWorkingHours = secondsToHHMMSS(avgSeconds);
    }

    res.json({
      user_id,
      periodType,
      startDate: start,
      endDate: end,
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
  const { userId, date } = req.params;

  try {
    const results = await Attendance.findAll({
      where: { user_id: userId, date },
      include: [{ model: User, attributes: ['name', 'emp_id'] }]
    });

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Admin: Edit attendance
// Admin: Edit attendance by user ID and date
// Admin: Edit attendance by user ID and date
exports.editAttendance = async (req, res) => {
  try {
    const { userId, date } = req.params; // using user ID and date
    const { time_in, time_out, status } = req.body;

    // Find attendance record for that user on that date
    const record = await Attendance.findOne({
      where: { user_id: userId, date }
    });

    if (!record) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    // Use new values or existing values
    const newTimeIn = time_in || record.time_in;
    const newTimeOut = time_out || record.time_out;

    // Recalculate working hours if both time_in and time_out are present
    let working_hours = record.working_hours;
    if (newTimeIn && newTimeOut) {
      const start = new Date(`${date}T${newTimeIn}`);
      const end = new Date(`${date}T${newTimeOut}`);
      const diffMs = end - start;

      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);

      working_hours = `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    // Update allowed fields
    await record.update({
      time_in: newTimeIn,
      time_out: newTimeOut,
      status: status || record.status,
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
    const { userId, date } = req.params;

    const record = await Attendance.findOne({
      where: { user_id: userId, date }
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



