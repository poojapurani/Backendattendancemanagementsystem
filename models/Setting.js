const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Setting = sequelize.define("Setting", {
  lunch: {
    type: DataTypes.INTEGER,
    defaultValue: 45
  },
  break: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  }
}, {
  tableName: "settings"
});

module.exports = Setting;
