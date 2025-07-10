module.exports = (sequelize, DataTypes) => {
  const Announcement = sequelize.define(
    "Announcement",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      date: {
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
    },
    {
      paranoid: true,
      tableName: "announcements",
    }
  );

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
      onDelete: "CASCADE", // Add this
    });
  };

  return Announcement;
};
