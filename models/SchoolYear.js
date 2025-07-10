module.exports = (sequelize, DataTypes) => {
  const SchoolYear = sequelize.define(
    "SchoolYear",
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
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      paranoid: true,
      tableName: "school_years",
    }
  );

  SchoolYear.associate = (models) => {
    SchoolYear.hasMany(models.Term, {
      foreignKey: "schoolYearId",
      as: "terms",
      onDelete: "CASCADE", // Add this
    });
  };

  return SchoolYear;
};
