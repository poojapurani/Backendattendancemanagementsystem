const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const LoginAttempt = sequelize.define("LoginAttempt", {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  failed_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_failed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  lock_until: {
    type: DataTypes.DATE,
    allowNull: true,
  }
}, {
  tableName: "login_attempts",
  timestamps: false
});

// (async () => {
//     try {
//         await LoginAttempt.sync({ force: true });
//         console.log("The table for the LoginAttempt model was just (re)created!");
//     } catch (error) {
//         console.error("Error syncing the LoginAttempt model:", error);
//     }
// })();

module.exports = LoginAttempt;
