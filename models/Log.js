// models/Log.js
module.exports = (sequelize, DataTypes) => {
    const Log = sequelize.define('Log', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      action: {
        type: DataTypes.STRING,
        allowNull: false
      },
      entityType: {
        type: DataTypes.STRING,
        allowNull: true
      },
      entityId: {
        type: DataTypes.UUID,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true
      },
      ipAddress: {
        type: DataTypes.STRING,
        allowNull: true
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    }, {
      timestamps: true,
      paranoid: false
    });
  
    Log.associate = (models) => {
      Log.belongsTo(models.User, {
        foreignKey: 'id',
        as: 'user'
      },
          
     );
    };
  
    return Log;
  };