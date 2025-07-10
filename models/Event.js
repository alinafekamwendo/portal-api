const { Sequelize } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  const Event = sequelize.define(
    "Event",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      classId: {
        type: DataTypes.UUID,
        references: {
          model: "classes", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      paranoid: true, // Enables soft deletes
      tableName: "events", // Explicit table name
    }
  );

  Event.associate = (models) => {
    Event.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
      onDelete: "CASCADE", // Add this
    });
  };

  return Event;
};
