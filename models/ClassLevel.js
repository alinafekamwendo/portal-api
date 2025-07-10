module.exports = (sequelize, DataTypes) => {
  const ClassLevel = sequelize.define(
    "ClassLevel",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        validate: {
          min: 1 ,// Ensure level is at least 1
          max:4
        }
      },
     
    },
    {
      paranoid: true,
      tableName: "class_levels",
      indexes: [
        {
          unique: true,
          fields: ['level']
        }
      ]
    }
  );

  ClassLevel.associate = (models) => {
    ClassLevel.hasMany(models.Class, {
      foreignKey: "classLevelId",  // Changed from "classLevel" to "classLevelId"
      as: "classes",
      onDelete: "CASCADE",
    });
    
  };

  return ClassLevel;
};