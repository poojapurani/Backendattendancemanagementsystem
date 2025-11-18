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
        member_type: {
            type: DataTypes.ENUM("EMP", "INT"),
            allowNull: false
        },
        team_name: {
            type: DataTypes.ENUM("shdpixel", "metamatrix", "aibams"),
            allowNull: false
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
            type: DataTypes.ENUM("Admin", "User"),
            allowNull: false,
            defaultValue: "User",
        },
        department: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        joining_date: { 
            type: DataTypes.DATEONLY, 
            allowNull: false, 
            defaultValue: DataTypes.NOW 
        },
        status: {
        type: DataTypes.STRING,
        defaultValue: "active" // active | deactivated
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
