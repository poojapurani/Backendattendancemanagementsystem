const User = require("./User");
const Attendance = require("./Attendance");

function applyAssociations() {
  User.hasMany(Attendance, { foreignKey: "user_id" });
  Attendance.belongsTo(User, { foreignKey: "user_id" });
}

module.exports = applyAssociations;
