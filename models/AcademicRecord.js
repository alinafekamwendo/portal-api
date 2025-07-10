// backend/models/academicRecord.js (UPDATED & CONSOLIDATED)
// This model now serves as the official end-of-term result for a student in a subject.
module.exports = (sequelize, DataTypes) => {
  const AcademicRecord = sequelize.define("AcademicRecord", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    studentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "students", key: "id" },
      onDelete: "CASCADE",
    },
    classId: { // The class the student was in when this record was made
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "classes", key: "id" },
      onDelete: "CASCADE",
    },
    subjectId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "subjects", key: "id" },
      onDelete: "CASCADE",
    },
    termId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "terms", key: "id" },
      onDelete: "CASCADE",
    },
    academicYearId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "school_years", key: "id" },
      onDelete: "CASCADE",
    },
    // This is the FINAL end-of-term score for the subject
    finalScore: {
      type: DataTypes.DECIMAL(5, 2), // e.g., 99.99
      allowNull: false,
      validate: { min: 0, max: 100 },
    },
    // This is the FINAL end-of-term grade for the subject
    finalGrade: {
      type: DataTypes.STRING(2), // e.g., 'A', 'B+'
      allowNull: false,
    },
    // NEW: Flag to control if results are visible in reports
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    // This flag is primarily relevant for Term 3 results for promotion decisions
    isPromoted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "academic_records",
    timestamps: true, // createdAt, updatedAt
    indexes: [
      // Composite unique constraint to ensure one final record per student, subject, term, year
      {
        unique: true,
        name: "academic_rec_unique",
        fields: ["studentId", "subjectId", "termId", "academicYearId"],
      },
    ],
  });

  AcademicRecord.associate = (models) => {
    AcademicRecord.belongsTo(models.Student, { foreignKey: "studentId", as: "student" });
    AcademicRecord.belongsTo(models.Class, { foreignKey: "classId", as: "class" });
    AcademicRecord.belongsTo(models.Subject, { foreignKey: "subjectId", as: "subject" });
    AcademicRecord.belongsTo(models.Term, { foreignKey: "termId", as: "term" });
    AcademicRecord.belongsTo(models.SchoolYear, { foreignKey: "academicYearId", as: "schoolYear" });
  };

  return AcademicRecord;
};
