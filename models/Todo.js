const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Todo = sequelize.define(
  "Todo",
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

    sr_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },

    description: {
        type: DataTypes.STRING,
        allowNull: false,
    },

    priority: {
        type: DataTypes.ENUM("low", "medium", "high"),
        allowNull: false,
    },

    status: {
        type: DataTypes.ENUM("not_started", "started", "paused", "completed"),
        defaultValue: "pending",
    },
    start_time: {
        type: DataTypes.TIME,
        allowNull: true,
    },
    total_tracked_time: {
        type: DataTypes.TIME, // store seconds
        allowNull: true,
        defaultValue: "00:00:00"
    },

    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
    },

  },
  {
    timestamps: true,
    tableName: "todos",
    indexes: [
      {
        fields: ["emp_id"],
      },
    ],
  }
);

// (async () => {
//   try {
//     await Todo.sync({ force: true });
//     console.log("Todo table recreated successfully!");
//   } catch (error) {
//     console.error("Error syncing Todo model:", error);
//   }
// })();


module.exports = Todo;
