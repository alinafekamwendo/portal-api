
// models/studenttermresult.js (NEW/Renamed from StudentGrade)
module.exports = (sequelize, DataTypes) => {
    const StudentTermResult = sequelize.define('StudentTermResult', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      finalScore: { // This is the end-of-term exam score
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: {
          min: 0,
          max: 100,
        },
      },
      grade: { // Calculated grade based on finalScore
        type: DataTypes.STRING,
        allowNull: false,
      },
      passStatus: { // 'PASS' or 'FAIL' based on Malawian rules
        type: DataTypes.ENUM('PASS', 'FAIL'),
        allowNull: false,
      },
      teacherRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Foreign keys
      studentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'students',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      subjectId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'subjects',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      termId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'terms',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      schoolYearId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'school_years',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
    }, {
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ['studentId', 'subjectId', 'termId', 'schoolYearId'],
          name: 'unique_student_subject_term_result',
        },
      ],
    });
  
    StudentTermResult.associate = (models) => {
      StudentTermResult.belongsTo(models.Student, { foreignKey: 'studentId', as: 'student' });
      StudentTermResult.belongsTo(models.Subject, { foreignKey: 'subjectId', as: 'subject' });
      StudentTermResult.belongsTo(models.Term, { foreignKey: 'termId', as: 'term' });
      StudentTermResult.belongsTo(models.SchoolYear, { foreignKey: 'schoolYearId', as: 'schoolYear' });
    };
  
    return StudentTermResult;
  };