const express = require("express");
const router = express.Router();
const controller = require("../controllers/permissionPresetController");

// CRUD
router.post("/add", controller.addPreset);
router.get("/getpresets", controller.getPresets);
// router.get("/:id", controller.getPresetById);
// router.put("/:id", controller.updatePreset);
// router.delete("/:id", controller.deletePreset);

module.exports = router;
