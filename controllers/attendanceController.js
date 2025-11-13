const Attendance = require("../models/Attendance");

// Punch In
exports.punchIn = (req, res) => {
  const { id: user_id, emp_id } = req.user;
  

  Attendance.punchIn(user_id, emp_id, (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: "✅ Punch In recorded successfully!" });
  });
};

// Punch Out
exports.punchOut = (req, res) => {
  const { id: user_id } = req.user;

  Attendance.punchOut(user_id, (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: "✅ Punch Out recorded successfully!" });
  });
};

// Get logged-in user's history
exports.getHistory = (req, res) => {
  const { id: user_id } = req.user;
   console.log("Fetching history for user_id:", user_id);

  Attendance.getHistory(user_id, (err, results) => {
    if (err) return res.status(500).json({ message: err.message });

    console.log("DB Results:", results);
    res.json({ user_id, records: results });
  });
};

// Admin: Get all attendance
exports.getAllAttendance = (req, res) => {
  Attendance.getAll((err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results);
  });
};

// Admin: Get specific user's attendance by date
exports.getByUserAndDate = (req, res) => {
  const { userId, date } = req.params;

  Attendance.getByUserAndDate(userId, date, (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json(results);
  });
};


