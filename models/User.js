const { DataTypes } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        unique: true, // Username should still be unique for login
        allowNull: false,
      },
      dob: {
        type: DataTypes.DATE,
        allowNull: true, // Date of birth might be optional for some systems, but usually kept for students
      },
      role: {
        type: DataTypes.ENUM("admin", "teacher", "parent", "student"),
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true, // <--- CHANGED: Now allows null
      },
      email: {
        type: DataTypes.STRING,
        unique: false, // <--- CHANGED: No longer unique across all users
        allowNull: true, // <--- CHANGED: Now allows null
        validate: {
          isEmail: function(value) {
            // Only validate as email if a value is provided
            if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              throw new Error('Invalid email format');
            }
          },
        },
      },
      phone: {
        type: DataTypes.STRING,
        unique: false, // <--- CHANGED: No longer unique across all users
        allowNull: true, // <--- CHANGED: Now allows null
        // You might add custom phone number validation here if needed
      },
      sex: {
        type: DataTypes.ENUM("MALE", "FEMALE"),
        allowNull: false,
      },
      profilePhoto: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      paranoid: true,
      tableName: "users",
    }
  );

  User.associate = (models) => {
    User.hasOne(models.Teacher, {
      foreignKey: "id", // Changed from userId to id to share same ID
      as: "teacher",
      onDelete: "CASCADE",
    });
    User.hasOne(models.Parent, {
      foreignKey: "id", // Changed from userId to id
      as: "parent",
      onDelete: "CASCADE",
    });
    User.hasOne(models.Student, {
      foreignKey: "id", // Changed from userId to id
      as: "student",
      onDelete: "CASCADE",
    });
    User.hasOne(models.Admin, {
      foreignKey: "id", // Changed from userId to id
      as: "admin",
      onDelete: "CASCADE",
    });
  };

  return User;
};