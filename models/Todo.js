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
        type: DataTypes.ENUM("pending", "completed"),
        defaultValue: "pending",
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
