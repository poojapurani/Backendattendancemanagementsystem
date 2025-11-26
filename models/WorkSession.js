const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const WorkSession = sequelize.define(
  "WorkSession",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    emp_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    start_time: {
      type: DataTypes.TIME,
      allowNull: false,
    },

    end_time: {
      type: DataTypes.TIME,
      allowNull: true,     // null until user ends
    },
  },
  {
    timestamps: true,         // createdAt & updatedAt
    tableName: "work_sessions",
    indexes: [
      { fields: ["emp_id"] },
      { fields: ["name"] }
    ],
  }
);

//Uncomment to create table
// (async () => {
//    try {
//     await WorkSession.sync({ force: true });
//     console.log("WorkSession table recreated successfully!");
//   } catch (error) {
//     console.error("Error syncing WorkSession model:", error);
//   }
// })();

module.exports = WorkSession;
