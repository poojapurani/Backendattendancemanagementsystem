const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

router.post("/init-admin", authController.initialAdminRegister);
// Admin-only registration
router.post("/register", verifyToken, verifyAdmin, authController.register);

// Public login
router.post("/login", authController.login);

// 📌 Attendance status route 
// router.get("/today-status", verifyToken, authController.getTodayAttendanceStatus);



//admin

// Description: Fetches all registered users (id, emp_id, name, user_id, role)
router.get("/", verifyToken, verifyAdmin, authController.getAllUsers);

// Description: Updates user information like name, user_id, and role
router.put("/emp/:empId", verifyToken, verifyAdmin, authController.updateUserByEmpId);

// Description: Deletes a user by their ID
router.delete("/:emp_id", verifyToken, verifyAdmin, authController.deleteUser);



module.exports = router;
