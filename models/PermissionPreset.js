const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const Permissions = require("./Permissions");


const PermissionPreset = sequelize.define(
  "PermissionPreset",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    permission_ids: {
        type: DataTypes.JSON,
        allowNull: false,
         defaultValue: [],
        }

  },
  {
    tableName: "permission_presets",
    timestamps: true,
    underscored: true, // created_at, updated_at
  }
);

// Relation
PermissionPreset.belongsTo(Permissions, { foreignKey: "permission_ids" });

module.exports = PermissionPreset;
