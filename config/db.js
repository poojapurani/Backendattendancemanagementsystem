const {Sequelize} = require('sequelize');

const sequelize = new Sequelize("attendance_db", "root", "", {
  host: "localhost",
  dialect: "mysql",
  logging: false, // set true if you want SQL logs
});

sequelize
  .authenticate()
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.error("❌ Unable to connect to database:", err));

module.exports = sequelize;
