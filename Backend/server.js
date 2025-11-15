const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/db"); // Sequelize instance

dotenv.config();

const app = express();

const corsOptions = {
  origin: "https://c1edf405-1020-413a-b84f-87ee5e14c1c5-00-2bbdvbbbxej2w.pike.replit.dev",
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
