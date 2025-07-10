module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define(
    "Student",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        references: {
          model: "users", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      parentId: {
        type: DataTypes.UUID,
        references: {
          model: "parents", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      alte_guardian_Id: { // Consider renaming to alternateGuardianId
        type: DataTypes.UUID,
        references: { model: "parents", key: "id" }, // Assuming this also links to Parents
        allowNull: true,
        onDelete: "CASCADE",
      },
      currentClassId: {
        type: DataTypes.UUID,
        references: {
          model: "classes", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      studentNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: function () {
          const currentYear = new Date().getFullYear().toString().slice(-2);
          const randomNum = Math.floor(100 + Math.random() * 900);
          return `STUD-${randomNum}-${currentYear}`; // Generates like STUD-123-23
        },
      },
    },
    {
      paranoid: true,
      tableName: "students",
    }
  );

  Student.associate = (models) => {
    Student.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE", // Add this
    });
    Student.belongsTo(models.Parent, {
      foreignKey: "parentId",
      as: "parent",
      onDelete: "CASCADE", // Add this
    });
    Student.belongsTo(models.Parent, { // Association for alternate guardian
      foreignKey: "alte_guardian_Id", // Corrected foreign key name
      as: "alternateGuardian",
      onDelete: "CASCADE",
    });
    Student.belongsTo(models.Class, {
      foreignKey: "currentClassId",
      as: "currentClass",
      onDelete: "SET NULL", // Recommendation: SET NULL for class changes
    });
    

  };
  return Student;
};

// 