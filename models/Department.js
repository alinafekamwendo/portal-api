// Department model for HOD assignment
module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define(
    "Department",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      hodId: { // <-- ADD THIS FIELD
        type: DataTypes.UUID,
        allowNull: true, // HOD is optional
        references: {
          model: "teachers", // Reference the teachers table
          key: "id",
        },
        onDelete: "SET NULL", // Recommended: Department remains if HOD is deleted
      },
    },
    {
      paranoid: true,
      tableName: "departments",
    }
  );

  Department.associate = (models) => {
    Department.belongsTo(models.Teacher, {
      foreignKey: "hodId",
      as: "headOfDepartment",
    });
    Department.hasMany(models.Subject, {
      foreignKey: "departmentId",
      as: "subjects",
    });
  };

  return Department;
};
