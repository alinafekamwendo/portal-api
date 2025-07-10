const { model } = require("mongoose");

// TeachingAssignment model (replaces SubjectToTeacher)
module.exports = (sequelize, DataTypes) => {
  const TeachingAssignment = sequelize.define(
    "TeachingAssignment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      subjectId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "subjects", key: "id" },
      },
      teacherId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "teachers", key: "id" },
      },
      classId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "classes", key: "id" },
      },
      termId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "terms", key: "id" },
      },
      schoolYearId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "school_years", key: "id" },
      },
      isHOD: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model:"departments",key:"id"
        },
      }
    },
    {
      paranoid: true,
      tableName: "teaching_assignments",
      indexes: [
        {
          unique: true,
          name: "unique_subject_assignment",
          fields: ["subjectId", "classId", "termId", "schoolYearId"],
        },
      ],
    }
  );

  TeachingAssignment.associate = (models) => {
    TeachingAssignment.belongsTo(models.Subject, {
      foreignKey: "subjectId",
      as: "subject",
    });
    TeachingAssignment.belongsTo(models.Teacher, {
      foreignKey: "teacherId",
      as: "teacher",
    });
    TeachingAssignment.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
    });
    TeachingAssignment.belongsTo(models.Term, {
      foreignKey: "termId",
      as: "term",
    });
    TeachingAssignment.belongsTo(models.SchoolYear, {
      foreignKey: "schoolYearId",
      as: "schoolYear",
    });
  };

  return TeachingAssignment;
};


