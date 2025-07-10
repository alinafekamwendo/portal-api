// ChatParticipant model
module.exports = (sequelize, DataTypes) => {
  const ChatParticipant = sequelize.define(
    "ChatParticipant",
    {
      chatId: {
        type: DataTypes.UUID,
        primaryKey: true,
        field: 'chatId' // Explicit field mapping
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        field: 'userId'
      },
      role: {
        type: DataTypes.ENUM("admin", "member"),
        defaultValue: "member",
      },
      lastSeen: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'chat_participants', // Match exact table name
      underscored: false, // Disable underscore transformation
      paranoid: true,
      timestamps: true
    }
  );
  ChatParticipant.associate = (models) => {
    ChatParticipant.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat'
    });
    
    ChatParticipant.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };


  return ChatParticipant;
};