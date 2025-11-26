const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const IdentityCard = sequelize.define(
    "IdentityCard",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        emp_id: {
            type: DataTypes.STRING,   // emp_id
            allowNull: false,
        },

        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: "users",
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
        },

        display_user: {
            type: DataTypes.JSON,     // store all user data except password, emp_id, timestamps
            allowNull: false,
        },

        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        deleted_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        previous_emp_ids: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
    },
    {
        timestamps: true,   // createdAt, updatedAt auto
        underscored: true,
        tableName: "identity_cards",
        paranoid: false,    // we are manually handling deleted_at
    }
);

module.exports = IdentityCard;
