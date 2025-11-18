const User = require("./User");
const Attendance = require("./Attendance");

function applyAssociations() {
  User.hasMany(Attendance, { 
    foreignKey: "emp_id",
    sourceKey: "emp_id"
  });

  Attendance.belongsTo(User, { 
    foreignKey: "emp_id",
    targetKey: "emp_id"
  });
}

module.exports = applyAssociations;
