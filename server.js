const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/db"); // Sequelize instance

dotenv.config();

const app = express();

const corsOptions = {
  origin: "https://3945c95c-8d3d-4e14-9792-042025856c73-00-1k33g8iaa9jmx.pike.replit.dev",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};


app.use(cors(corsOptions));
app.use(express.json());

// 📌 Load Models BEFORE associations
require("./models/User");
require("./models/Attendance");
require("./models/Setting");
require("./models/Todo");

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
const todoRoutes = require("./routes/todoRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

app.use("/api/settings", settingsRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/todos", todoRoutes);

// Home
app.get("/", (req, res) => {
  res.send("Attendance System Backend Running ✅");
});

// Start server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
