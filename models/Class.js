module.exports = (sequelize, DataTypes) => {
  const Class = sequelize.define(
    "Class",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      supervisorId: {
        type: DataTypes.UUID,
        allowNull: true, // A class might not have a supervisor initially
        references: {
          model: "teachers",
          key: "id",
        },
      },
      classLevelId: {  // Changed from "level" to "classLevelId"
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "class_levels",
          key: "id",
        },
      },
      schoolYearId: { // Foreign key to SchoolYear
        type: DataTypes.UUID,
        allowNull: false, // Set to false if a class MUST belong to a school year
        references: {
          model: 'school_years', // Assuming your SchoolYear model's table name is 'SchoolYears'
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT', // Prevent deletion of SchoolYear if classes are linked
      },
      termId: {  // Added term association
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "terms",
          key: "id",
        },
      },
    },
    {
      paranoid: true,
      tableName: "classes",
      indexes: [
        {
          unique: true,
          fields: ['name', 'termId'], // Class names should be unique per term
        }
      ]
    }
  );

  Class.associate = (models) => {
    Class.belongsTo(models.Teacher, {
      foreignKey: "supervisorId",
      as: "supervisor",
    });
    
    Class.belongsTo(models.ClassLevel, {
      foreignKey: "classLevelId",
      as: "classLevel",
    });
    
    Class.belongsTo(models.Term, {
      foreignKey: "termId",
      as: "term",
    });
    
    Class.hasMany(models.Student, {
      foreignKey: "currentClassId",
      as: "students",
    });
    
    Class.hasMany(models.Lesson, {
      foreignKey: "classId",
      as: "lessons",
    });
    Class.belongsTo(models.SchoolYear, { foreignKey: 'schoolYearId', as: 'schoolYear' });

  };

  return Class;
};