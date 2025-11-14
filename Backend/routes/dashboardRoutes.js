const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

router.get("/admin/overview", verifyToken, verifyAdmin, dashboardController.getAdminOverview);
router.get("/:userId", verifyToken, dashboardController.getUserDashboard);

router.get("/admin/report", verifyToken, verifyAdmin, dashboardController.getAdminReport);
module.exports = router;
