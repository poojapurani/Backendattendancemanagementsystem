const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Attendance = sequelize.define(
  "Attendance",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // user_id: {
    //   type: DataTypes.INTEGER,
    //   allowNull: false,
    // },
    emp_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    date: {
      type: DataTypes.DATEONLY, // YYYY-MM-DD
      allowNull: false,
    },
    time_in: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    time_out: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    working_hours: {
      type: DataTypes.STRING, // format HH:MM:SS
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("present", "late", "half-day", "absent"),
      allowNull: false,
      defaultValue: "present",
    },
  },
  {
    timestamps: true, // createdAt and updatedAt
    tableName: "attendance",
    indexes: [
      {
        unique: true,
        fields: ["emp_id", "date"], // ensure only one record per user per day
      },
    ],
  }
);

// (async () => {
//     try {
//         await Attendance.sync({ force: true });
//         console.log("The table for the Attendance model was just (re)created!");
//     } catch (error) {
//         console.error("Error syncing the Attendance model:", error);
//     }
// })();


module.exports = Attendance;
