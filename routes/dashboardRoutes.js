const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

//count of present, absent
router.get("/admin/overview", verifyToken, verifyAdmin, dashboardController.getAdminOverview);

//get user dashboard using employee id
router.get("/:empId", verifyToken, dashboardController.getUserDashboard);

//route for admin report daily, weekly, monthly
router.get("/admin/report", verifyToken, verifyAdmin, dashboardController.getAdminReport);

module.exports = router;