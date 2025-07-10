// backend/models/assessment.js
module.exports = (sequelize, DataTypes) => {
  const Assessment = sequelize.define("Assessment", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false, // e.g., "Math Quiz 1", "Term 1 Final Exam"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false, // Date the assessment was conducted
    },
    maxScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 100.00, // Maximum possible score for this assessment
      validate: {
        min: 0,
      }
    },
    // Foreign keys to link to other models
    assessmentTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "assessment_types", key: "id" },
      onDelete: "CASCADE", // If assessment type is deleted, delete assessments
    },
    subjectId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "subjects", key: "id" },
      onDelete: "CASCADE", // If subject is deleted, delete assessments
    },
    classId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "classes", key: "id" },
      onDelete: "CASCADE", // Which class this assessment is for
    },
    termId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "terms", key: "id" },
      onDelete: "CASCADE", // Which term this assessment belongs to
    },
    schoolYearId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "school_years", key: "id" },
      onDelete: "CASCADE", // Which school year this assessment belongs to
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "assessments",
    timestamps: true, // createdAt, updatedAt
    indexes: [
      {
        unique: true,
        fields: ["title", "subjectId", "classId", "termId", "schoolYearId", "assessmentTypeId"],
        name: "unique_assessment_per_context"
      }
    ]
  });

  Assessment.associate = (models) => {
    Assessment.belongsTo(models.AssessmentType, { foreignKey: "assessmentTypeId", as: "assessmentType" });
    Assessment.belongsTo(models.Subject, { foreignKey: "subjectId", as: "subject" });
    Assessment.belongsTo(models.Class, { foreignKey: "classId", as: "class" });
    Assessment.belongsTo(models.Term, { foreignKey: "termId", as: "term" });
    Assessment.belongsTo(models.SchoolYear, { foreignKey: "schoolYearId", as: "schoolYear" });
    // An Assessment has many StudentAssessmentScores
    Assessment.hasMany(models.StudentAssessmentScore, {
      foreignKey: "assessmentId",
      as: "studentScores",
      onDelete: "CASCADE", // If an assessment is deleted, delete all associated student scores
    });
  };

  return Assessment;
};
