
// backend/models/studentAssessmentScore.js
module.exports = (sequelize, DataTypes) => {
  const StudentAssessmentScore = sequelize.define("StudentAssessmentScore", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    studentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "students", key: "id" },
      onDelete: "CASCADE", // If student is deleted, delete their scores
    },
    assessmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "assessments", key: "id" },
      onDelete: "CASCADE", // If assessment is deleted, delete associated scores
    },
    score: {
      type: DataTypes.DECIMAL(5, 2), // e.g., 85.50
      allowNull: false,
      validate: {
        min: 0,
        // Max score validation should ideally happen at the controller level
        // or derived from the associated Assessment's maxScore.
      },
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true, // Teacher's comments on this specific score
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "student_assessment_scores",
    timestamps: true, // createdAt, updatedAt
    indexes: [
      {
        unique: true,
        fields: ["studentId", "assessmentId"],
        name: "unique_student_assessment_score"
      }
    ]
  });

  StudentAssessmentScore.associate = (models) => {
    StudentAssessmentScore.belongsTo(models.Student, { foreignKey: "studentId", as: "student" });
    StudentAssessmentScore.belongsTo(models.Assessment, { foreignKey: "assessmentId", as: "assessment" });
  };

  return StudentAssessmentScore;
};
