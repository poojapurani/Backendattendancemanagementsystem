const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/db"); // Sequelize instance

dotenv.config();

const app = express();

const corsOptions = {
  origin: "https://c80543b8-d8ed-4f02-a83b-c371137fc5a5-00-3ozfewtsky73d.sisko.replit.dev",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};


app.use(cors(corsOptions));
app.use(express.json());

// 📌 Load Models BEFORE associations
require("./models/User");
require("./models/Attendance");

// 📌 Load and apply associations
const applyAssociations = require("./models/association");
applyAssociations();

// 📌 Sync models after associations
sequelize.sync()
  .then(() => console.log("📦 Models synced with database"))
  .catch(err => console.error("❌ Sync error:", err));


// Routes
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Home
app.get("/", (req, res) => {
  res.send("Attendance System Backend Running ✅");
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
