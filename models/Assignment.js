module.exports = (sequelize, DataTypes) => {
  const Assignment = sequelize.define(
    "Assignment",
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
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      lessonId: {
        type: DataTypes.UUID,
        references: {
          model: "lessons", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
    },
    {
      paranoid: true,
      tableName: "assignments",
    }
  );

  Assignment.associate = (models) => {
    Assignment.belongsTo(models.Lesson, {
      foreignKey: "lessonId",
      as: "lesson",
      onDelete: "CASCADE", // Add this
    });
  };

  return Assignment;
};
