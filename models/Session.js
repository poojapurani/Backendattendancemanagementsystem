const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const User = require("./User");

const Session = sequelize.define(
  "Session",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    // refresh_token: {
    //   type: DataTypes.TEXT,
    //   allowNull: false,
    // },

    refresh_token_hash: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    refresh_token_salt: {      // <-- NEW
      type: DataTypes.TEXT,
      allowNull: true,         // allowNull true for migration fallback
    },

    access_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    device_info: {
      type: DataTypes.JSON, // ✔ MySQL OK, MariaDB will use LONGTEXT
      allowNull: true,
    },

    issued_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    refresh_expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    max_expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    rotated_from: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    rotated_to: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    revoked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    revoked_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    session_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    access_jti: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

  },
  {
    tableName: "sessions",
    timestamps: false,
    indexes: [
      {
        fields: ["refresh_token_hash"],
      },
    ],
  }
);

// Relations
Session.belongsTo(User, { foreignKey: "user_id" });

// (async () => {
//     try {
//         await Session.sync({ force: true });
//         console.log("The table for the Session model was just (re)created!");
//     } catch (error) {
//         console.error("Error syncing the Session model:", error);
//     }
// })();

module.exports = Session;
