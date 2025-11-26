const User = require("./User");
const Attendance = require("./Attendance");

const IdentityCard = require("./IdentityCard");




function applyAssociations() {
  User.hasMany(Attendance, { 
    foreignKey: "emp_id",
    sourceKey: "emp_id"
  });

  Attendance.belongsTo(User, { 
    foreignKey: "emp_id",
    targetKey: "emp_id"
  });

  User.hasOne(IdentityCard, { foreignKey: 'userId', as: 'identityCard' });
  IdentityCard.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  }

module.exports = applyAssociations;
