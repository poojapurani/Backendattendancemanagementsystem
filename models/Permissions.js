const { DataTypes } = require("sequelize");
const sequelize = require("../config/db"); // adjust path as per your project

const Permissions = sequelize.define(
  "Permissions",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    display_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    group: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSON, // can store array of strings
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    api: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSON, // for any additional info
      allowNull: true,
    },
    deleted_by: {
      type: DataTypes.INTEGER, // can be user id who deleted
      allowNull: true,
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt

    paranoid: true,   // enables soft delete (adds deletedAt)
    tableName: "permissions",
  }
);

// (async () => {
//     try {
//         await Permissions.sync({ force: true });
//         console.log("The table for the Permissions model was just (re)created!");
//     } catch (error) {
//         console.error("Error syncing the Permissions model:", error);
//     }
// })();
module.exports = Permissions;
