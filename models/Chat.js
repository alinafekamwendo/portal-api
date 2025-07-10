// Chat model
module.exports = (sequelize, DataTypes) => {
  const Chat = sequelize.define(
    "Chat",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true, // Null for private chats
      },
      type: {
        type: DataTypes.ENUM("private", "group", "class", "subject"),
        allowNull: false,
        defaultValue: "private",
      },
      classId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "classes", key: "id" },
      },
      subjectId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "subjects", key: "id" },
      },
    },
    {
      paranoid: true,
      tableName: "chats",
    }
  );
  Chat.associate = (models) => {
    Chat.hasMany(models.ChatParticipant, {
      foreignKey: "chatId",
      as: "participants", // This 'as' now correctly matches your controller's include
    });
    // Chat.belongsToMany(models.User, {
    //   through: "chat_Participants",
    //   foreignKey: "chatId",
    //   as: "users", // Renamed for clarity: a Chat has many Users
    // });
  
    Chat.hasMany(models.Message, {
      foreignKey: "chatId",
      as: "messages",
      onDelete: "CASCADE",
    });
    Chat.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
    });
    Chat.belongsTo(models.Subject, {
      foreignKey: "subjectId",
      as: "subject",
    });
  };

  return Chat;
};