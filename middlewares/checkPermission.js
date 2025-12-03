const Permissions = require("../models/Permissions");

exports.checkPermission = (api) => {
  return async (req, res, next) => {
    try {
      let userPermissions = req.user.permissions; // from JWT

      if (typeof userPermissions === "string") {
        userPermissions = JSON.parse(userPermissions);
      }

      if (userPermissions.includes("*")) return next();


      if (!userPermissions || userPermissions.length === 0) {
        return res.status(403).json({ message: "No permissions assigned" });
      }

      // Find permission for this API
      const permission = await Permissions.findOne({ where: { api } });
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
