module.exports = (sequelize, DataTypes) => {
  const Admin = sequelize.define(
    "Admin",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      adminNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: () => `ADM${Math.floor(1000 + Math.random() * 9000)}`, // Generates like ADM1234
      },
      level: {
        type: DataTypes.ENUM("regular", "super"),
        allowNull: false,
        defaultValue: "regular",
      },
    },
    {
      paranoid: true,
      tableName: "admins",
    }
  );

  Admin.associate = (models) => {
    Admin.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE",
    });
  };

  return Admin;
};
