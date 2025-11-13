// const {Sequelize} = require('sequelize');

// const sequelize = new Sequelize("attendance_db", "narendra", "", {
//   host: "localhost",
//   dialect: "mysql",
//   logging: false, // set true if you want SQL logs
// });

// sequelize
//   .authenticate()
//   .then(() => console.log("✅ Database connected"))
//   .catch((err) => console.error("❌ Unable to connect to database:", err));

// module.exports = sequelize;





const {Sequelize} = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: false,
  }
);

sequelize
  .authenticate()
  .then(() => console.log("✅ Database connected"))
  .catch((err) => console.error("❌ Unable to connect to database:", err));

module.exports = sequelize;



