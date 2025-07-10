module.exports = (sequelize, DataTypes) => {
  const Term = sequelize.define(
    "Term",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tname: {
        type: DataTypes.ENUM("Term 1", "Term 2", "Term 3"),
        allowNull: false,
        
      },
      schoolYearId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "school_years", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      paranoid: true,
      tableName: "terms",
    }
  );

  Term.associate = (models) => {
    Term.belongsTo(models.SchoolYear, {
      foreignKey: "schoolYearId",
      as: "schoolYear",
      onDelete: "CASCADE", // Add this
    });
  };

  return Term;
};
