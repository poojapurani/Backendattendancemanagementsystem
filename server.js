const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/db"); // Sequelize instance
const Attendance = require("./models/Attendance");
const User = require("./models/User");
const { Op } = require("sequelize");
const authMiddleware = require('./middlewares/authMiddleware');

dotenv.config();

const app = express();

const corsOptions = {
  origin: "https://689ce9e0-1020-4096-8895-935ac4370c05-00-1570umgkihas6.pike.replit.dev",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};


app.use(cors(corsOptions));
app.use(express.json());

function isServerInIST() {
  const offsetMinutes = new Date().getTimezoneOffset(); 
  // IST = UTC+5:30 → offset = -330
  return offsetMinutes === -330;
}

const SERVER_IS_IST = isServerInIST();

console.log("========== TIMEZONE CHECK ==========");
console.log("Server Timezone:", SERVER_IS_IST ? "IST (UTC+5:30)" : "NOT IST (Probably UTC)");
console.log("====================================");

async function flagMissedPunchouts() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const yDate = yesterday.toISOString().split("T")[0];

  // Find all attendance records of yesterday with time_in but no time_out
  const missedRecords = await Attendance.findAll({
    where: {
      date: yDate,
      time_in: { [Op.ne]: null },
      time_out: null
    }
  });

  for (const record of missedRecords) {
    record.missed_punchout = true;
    record.time_out = "Not Provided"; // mark as not provided
    await record.save();
  }

  console.log(`Flagged ${missedRecords.length} missed punch-outs from ${yDate}`);
}


// 📌 Load Models BEFORE associations
require("./models/User");
require("./models/Attendance");
require("./models/Setting");
require("./models/Todo");
require("./models/WorkSession");
require("./routes/permissionRoutes");
require("./routes/permissionPresetRoutes");



// 📌 Load and apply associations
const applyAssociations = require("./models/association");
applyAssociations();

// 📌 Sync models after associations
sequelize.sync()
  .then(async () => {
    console.log("📦 Models synced with database");

    // Flag any missed punch-outs from yesterday
    await flagMissedPunchouts();
  })
  .catch(err => console.error("❌ Sync error:", err));


// Routes
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const todoRoutes = require("./routes/todoRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const workSessionRoutes = require("./routes/workSessionRoutes");
const permissionRoutes = require("./routes/permissionRoutes");
const permissionPresetRoutes = require("./routes/permissionPresetRoutes");


app.use("/api/settings", settingsRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/todos",authMiddleware.verifyToken, authMiddleware.requireMissedPunchoutRemark, todoRoutes);

app.use(
  "/api/attendance",
  authMiddleware.verifyToken,
  authMiddleware.requireMissedPunchoutRemark,
  attendanceRoutes
);

app.use(
  "/api/dashboard",
  authMiddleware.verifyToken,
  authMiddleware.requireMissedPunchoutRemark,
  dashboardRoutes
);
app.use("/api/work-sessions", workSessionRoutes);

app.use("/api/permissions", permissionRoutes);
app.use("/api/presets", permissionPresetRoutes);


// Home
app.get("/", (req, res) => {
  res.send("Attendance System Backend Running ✅");
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
