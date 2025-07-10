// backend/models/assessmentType.js
module.exports = (sequelize, DataTypes) => {
  const AssessmentType = sequelize.define("AssessmentType", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true, // e.g., "Continuous Assessment", "End of Term Exam"
    },
    // Crucial for differentiating assessment types
    type: {
      type: DataTypes.ENUM("continuous", "endOfTerm"),
      allowNull: false,
    },
    // Weight for calculation if you decide to combine continuous assessments later,
    // though your current requirement states they don't count for final term reports.
    // This could be useful for internal teacher calculations or future features.
    weight: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 1.00, // Default weight, e.g., 1.00 for 100% if it's the only type
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "assessment_types",
    timestamps: true, // createdAt, updatedAt
  });

  AssessmentType.associate = (models) => {
    // An AssessmentType can have many Assessments
    AssessmentType.hasMany(models.Assessment, {
      foreignKey: "assessmentTypeId",
      as: "assessments",
      onDelete: "SET NULL", // If an assessment type is deleted, assessments remain but lose type link
    });
  };

  return AssessmentType;
};


