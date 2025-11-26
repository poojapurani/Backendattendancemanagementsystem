const express = require("express");
const router = express.Router();
const controller = require("../controllers/workSessionController");

// Add
router.post("/add", controller.addSession);

// Update
router.put("/update-work-hours/:emp_id", controller.updateSession);

// Get (all or by emp_id)
router.get("/list", controller.getSessions);

module.exports = router;
