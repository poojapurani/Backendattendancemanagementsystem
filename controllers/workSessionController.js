const WorkSession = require("../models/WorkSession");
const User = require("../models/User");
const timeSlots = require("../utils/timeSlots");

exports.addSession = async (req, res) => {
  try {
    const { emp_id, slot_id } = req.body;

    // 1. Check user exists
    const user = await User.findOne({ where: { emp_id } });
    if (!user) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // 2. Validate slot
    const slot = timeSlots[slot_id];
    if (!slot) {
      return res.status(400).json({ message: "Invalid slot_id" });
    }

    // 3. Create database entry
    const session = await WorkSession.create({
      emp_id,
      name: user.name,
      start_time: slot.start_time,
      end_time: slot.end_time
    });

    return res.status(201).json({
      message: "Session added successfully",
      data: session
    });
  } catch (error) {
    console.error("Error adding session:", error);
    return res.status(500).json({ error: "Server error" });
  }
};


// ➤ Update a record (only start_time OR end_time)
// UPDATE work hours for employee
exports.updateSession = async (req, res) => {
  try {
    const { emp_id } = req.params;
    const { start_time, end_time, slot_name } = req.body;

    const updated = await WorkSession.update(
      { start_time, end_time, slot_name },
      { where: { emp_id } }
    );

    if (updated[0] === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.status(200).json({ message: "Work session updated successfully" });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ➤ Get all sessions (optional filter by emp_id)
exports.getSessions = async (req, res) => {
  try {
    const { emp_id } = req.query;

    const where = {};
    if (emp_id) where.emp_id = emp_id;

    const sessions = await WorkSession.findAll({
      where,
      order: [["id", "DESC"]],
    });

    return res.status(200).json(sessions);
  } catch (error) {
    console.error("Get Sessions Error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
