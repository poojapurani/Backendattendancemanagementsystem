const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const sequelize = require("./config/db"); // Sequelize instance

dotenv.config();

const app = express();

const corsOptions = {
  origin: "https://b8ebc431-9947-46da-9232-d34475f12c94-00-1fclazu1303ua.pike.replit.dev",
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
const todoRoutes = require("./routes/todoRoutes");

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
