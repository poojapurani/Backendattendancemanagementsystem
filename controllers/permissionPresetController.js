const PermissionPreset = require("../models/PermissionPreset");
const Permissions = require("../models/Permissions");

/**
 * ➤ Add a new permission preset
 */
exports.addPreset = async (req, res) => {
  try {
    const { name, permission_ids } = req.body;

    if (!name || !Array.isArray(permission_ids)) {
      return res.status(400).json({ message: "Name and permission_ids array required" });
    }

    const preset = await PermissionPreset.create({ name, permission_ids });

    res.status(201).json({
      message: "Permission preset created",
      preset,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating preset", error: err.message });
  }
};

/**
 * ➤ Get all permission presets
 */
exports.getPresets = async (req, res) => {
  try {
    const presets = await PermissionPreset.findAll({
      include: [{ model: Permissions }],
    });

    return res.status(200).json({ presets });
  } catch (error) {
    console.error("Get Presets Error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// /**
//  * ➤ Get single preset by ID
//  */
// exports.getPresetById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const preset = await PermissionPreset.findByPk(id, {
//       include: [{ model: Permission }],
//     });

//     if (!preset) {
//       return res.status(404).json({ message: "Preset not found" });
//     }

//     return res.status(200).json({ preset });
//   } catch (error) {
//     console.error("Get Preset Error:", error);
//     return res.status(500).json({
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };

// /**
//  * ➤ Update preset
//  */
// exports.updatePreset = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, permission_id } = req.body;

//     const preset = await PermissionPreset.findByPk(id);
//     if (!preset) {
//       return res.status(404).json({ message: "Preset not found" });
//     }

//     // If updating permission
//     if (permission_id) {
//       const checkPermission = await Permission.findByPk(permission_id);
//       if (!checkPermission) {
//         return res.status(404).json({ message: "Permission not found" });
//       }
//     }

//     await preset.update({
