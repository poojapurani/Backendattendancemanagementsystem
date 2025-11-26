const Permission = require("../models/Permission");

exports.checkPermission = (api) => {
  return async (req, res, next) => {
    try {
      const userPermissions = req.user.permissions; // from JWT

      if (!userPermissions || userPermissions.length === 0) {
        return res.status(403).json({ message: "No permissions assigned" });
      }

      // Find permission for this API
      const permission = await Permission.findOne({ where: { api } });
      if (!permission) {
        return res.status(403).json({ message: "Permission not found for API" });
      }

      if (!userPermissions.includes(permission.id)) {
        return res.status(403).json({ message: "Access denied" });
      }

      next();
    } catch (err) {
      console.error("Permission Middleware Error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  };
};
