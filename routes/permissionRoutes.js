const express = require("express");
const router = express.Router();

const {
    addPermission,
  createPermission,
  getAllPermissions,
  getPermissionById,
  updatePermission,
  deletePermission,
} = require("../controllers/permissionController");

// Middlewares (optional depending on your permission system)
//const verifyToken = require("../middlewares/verifyToken");
//const checkPermission = require("../middlewares/checkPermission");

// --- CRUD API ROUTES ---

// Create Permission
router.post("/add", addPermission);
// Get All Permissions
// router.get(
//   "/",
//   verifyToken,
//   checkPermission("permissions.view"),
//   getAllPermissions
// );

// // Get Single Permission
// router.get(
//   "/:id",
//   verifyToken,
//   checkPermission("permissions.view"),
//   getPermissionById
// );

// // Update Permission
// router.put(
//   "/:id",
//   verifyToken,
//   checkPermission("permissions.update"),
//   updatePermission
// );

// // Delete Permission
// router.delete(
//   "/:id",
//   verifyToken,
//   checkPermission("permissions.delete"),
//   deletePermission
// );

module.exports = router;
