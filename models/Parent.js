
module.exports = (sequelize, DataTypes) => {
  const Parent = sequelize.define(
    "Parent",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      parentNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: () => `PAR${Math.floor(1000 + Math.random() * 9000)}`, // Generates like PAR1234
      },
    },
    {
      paranoid: true,
      tableName: "parents",
    }
  );

  Parent.associate = (models) => {
    Parent.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE",
    });
    Parent.hasMany(models.Student, {
      foreignKey: "parentId",
      as: "students",
      onDelete: "CASCADE", // Add this
    });
    // ... rest of your associations
  };

  return Parent;
};