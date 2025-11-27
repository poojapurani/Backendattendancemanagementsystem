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
            type: DataTypes.ENUM("EMP", "INT","TEMP"),
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

        previous_emp_ids: {
            type: DataTypes.STRING,
            allowNull: true,
        },

        birthdate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
        // Structured Address
        address_line1: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        address_line2: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        city: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "Vadodara",
        },
        state: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "Gujarat",
        },
        country: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: "India",
        },
        pin_code: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        primary_contact: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        contacts: {
            type: DataTypes.JSON, 
            allowNull: true,
        },
        slot: {
            type: DataTypes.JSON,
            allowNull: false
        },
        profile_pic: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        


    },
    {
        timestamps: true,
        //underscored: true,
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
