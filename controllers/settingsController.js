const Setting = require("../models/Setting");

// Get current limits
exports.getBreakLimits = async (req, res) => {
  try {
    const setting = await Setting.findOne();

    res.json({
      lunch: setting ? setting.lunch : 45,
      break: setting ? setting.break : 30
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Set or update limits
exports.setBreakLimits = async (req, res) => {
  try {
    const { lunch, break: normalBreak } = req.body;

    if (!lunch || !normalBreak) {
      return res.status(400).json({ message: "Both lunch and break limits are required" });
    }

    let setting = await Setting.findOne();
    if (setting) {
      setting.lunch = lunch;
      setting.break = normalBreak;
      await setting.save();
    } else {
      setting = await Setting.create({ lunch, break: normalBreak });
    }

    res.json({
      message: "Break limits updated successfully",
      lunch,
      break: normalBreak
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
