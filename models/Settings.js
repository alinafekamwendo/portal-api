// models/setting.js
// Assuming your sequelize instance is exported from index.js
module.exports = (sequelize, DataTypes) => {
  const Setting = sequelize.define('Setting',
  {  // Model name,
      key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true, // Using key as primary key for direct access
      },
      value: {
        type: DataTypes.JSONB, // Use JSONB to store various data types (string, number, object, array)
        allowNull: true, // Allow null if a setting can be empty
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true, // Optional description for admin UI
      },
    }, {
    timestamps: true, // Includes createdAt and updatedAt
    paranoid: false, // Settings are usually not soft-deleted
  });

  // No associations needed for a simple key-value settings table
  return Setting;
};
