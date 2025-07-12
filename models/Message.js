// Message model
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    "Message",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      parentMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "messages", key: "id" },
      },
      chatId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "chats", key: "id" },
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false // Important to set default value
      }
    },
    {
      paranoid: true,
      tableName: "messages",
    }
  );

  Message.associate = (models) => {
    Message.belongsTo(models.Chat, {
      foreignKey: "chatId",
      as: "chat",
    });
    Message.belongsTo(models.User, {
      foreignKey: "senderId",
      as: "sender",
    });
    Message.belongsTo(models.Message, {
      foreignKey: "parentMessageId",
      as: "parentMessage",
    });
    Message.hasMany(models.Message, {
      foreignKey: "parentMessageId",
      as: "replies",
    });
  };

  return Message;
};
