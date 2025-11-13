const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const pool = require("./config/db"); // ✅ MySQL connection

const app = express();

// ✅ CORS configuration to allow only your Replit frontend
const corsOptions = {
  origin: "https://ca6f992f-3570-4f05-9cf1-fc1e1fefe8a3-00-1b3a5vj90sev3.pike.replit.dev",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true, // allows cookies or auth headers
};

app.use(cors(corsOptions));
app.use(express.json());

// ✅ Optional: check MySQL connection
// pool.getConnection((err, connection) => {
//   if (err) {
//     console.error("❌ Database connection failed:", err.message);
//   } else {
//     console.log("✅ MySQL connected successfully");
//     connection.release();
//   }
// });

// ✅ Import Routes
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

// ✅ Route Middleware
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);

// ✅ Default route
app.get("/", (req, res) => {
  res.send("Attendance System Backend Running ✅");
});

// ✅ Start Server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
