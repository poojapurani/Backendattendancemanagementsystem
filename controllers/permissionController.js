const Permission = require("../models/Permissions");

exports.addPermission = async (req, res) => {
  try {
    const {
      display_name,
      group,
      tags,
      name,
      api,
      metadata,
      deleted_by
    } = req.body;

    // Validation
    if (!display_name || !name || !api) {
      return res.status(400).json({
        message: "display_name, name and api fields are required"
      });
    }

    // Check duplicate name
    const exists = await Permission.findOne({ where: { name } });
    if (exists) {
      return res.status(400).json({ message: "Permission name already exists" });
    }

    const newPermission = await Permission.create({
      display_name,
      group,
      tags,
      name,
      api,
      metadata,
      deleted_by
    });

    return res.status(201).json({
      message: "Permission added successfully",
      permission: newPermission
    });
  } catch (err) {
    console.error("Error adding permission:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


exports.getAllPermissions = async (req, res) => {
  try {
    const permissions = await Permission.findAll({
      order: [["id", "ASC"]],
    });

    res.json({ permissions });
  } catch (error) {
    console.error("Get Permissions Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// exports.getPermissionById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const permission = await Permission.findByPk(id);

//     if (!permission) {
//       return res.status(404).json({ message: "Permission not found" });
//     }

//     res.json({ permission });
//   } catch (error) {
//     console.error("Get Permission Error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// exports.updatePermission = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const permission = await Permission.findByPk(id);
//     if (!permission) {
//       return res.status(404).json({ message: "Permission not found" });
//     }

//     await permission.update(req.body);

//     res.json({
//       message: "Permission updated successfully",
//       permission,
//     });
//   } catch (error) {
//     console.error("Update Permission Error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };

// exports.deletePermission = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const permission = await Permission.findByPk(id);
//     if (!permission) {
//       return res.status(404).json({ message: "Permission not found" });
//     }

//     await permission.destroy();

//     res.json({ message: "Permission deleted successfully" });
//   } catch (error) {
//     console.error("Delete Permission Error:", error);
//     res.status(500).json({ message: "Internal server error" });
//   }
// };
