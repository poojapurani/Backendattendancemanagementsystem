const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
    "User",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        emp_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        user_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        role: {
            type: DataTypes.ENUM("Admin", "Employee", "Intern"),
            allowNull: false,
            defaultValue: "Employee",
        },
        department: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        timestamps: true,
        tableName: "users",
    }
);

// (async () => {
//     try {
//         await User.sync({ force: true });
//         console.log("The table for the User model was just (re)created!");
//     } catch (error) {
//         console.error("Error syncing the User model:", error);
//     }
// })();

module.exports = User;
