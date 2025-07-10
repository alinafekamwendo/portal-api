const { Message, Chat, User } = require("../models");
const { sequelize } = require("../models");

// Send a message
const sendMessage = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { chatId, content, parentMessageId } = req.body;
    const senderId = req.user.id; // Assuming authenticated user

    // Verify chat exists and user is participant
    const participant = await ChatParticipant.findOne({
      where: { chatId, userId: senderId },
      transaction,
    });

    if (!participant) {
      await transaction.rollback();
      return res.status(403).json({ error: "Not a chat participant" });
    }

    const message = await Message.create(
      {
        chatId,
        content,
        senderId,
        parentMessageId: parentMessageId || null,
      },
      { transaction }
    );

    // Update last seen for sender
    participant.lastSeen = new Date();
    await participant.save({ transaction });

    await transaction.commit();

    // Populate sender info for real-time delivery
    const messageWithSender = await Message.findByPk(message.id, {
      include: [{ model: User, as: "sender" }],
    });

    res.status(201).json(messageWithSender);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// Get messages for a chat
const getChatMessages = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user.id;

    // Verify user is chat participant
    const participant = await ChatParticipant.findOne({
      where: { chatId, userId },
    });

    if (!participant) {
      return res.status(403).json({ error: "Not a chat participant" });
    }

    // Update last seen
    participant.lastSeen = new Date();
    await participant.save();

    const messages = await Message.findAll({
      where: { chatId },
      include: [
        { model: User, as: "sender" },
        {
          model: Message,
          as: "replies",
          include: [{ model: User, as: "sender" }],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.status(200).json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// Reply to a message
const replyToMessage = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { content } = req.body;
    const parentMessageId = req.params.messageId;
    const senderId = req.user.id;

    // Get parent message to inherit chatId
    const parentMessage = await Message.findByPk(parentMessageId, {
      transaction,
    });

    if (!parentMessage) {
      await transaction.rollback();
      return res.status(404).json({ error: "Parent message not found" });
    }

    // Verify user is chat participant
    const participant = await ChatParticipant.findOne({
      where: { chatId: parentMessage.chatId, userId: senderId },
      transaction,
    });

    if (!participant) {
      await transaction.rollback();
      return res.status(403).json({ error: "Not a chat participant" });
    }

    const message = await Message.create(
      {
        chatId: parentMessage.chatId,
        content,
        senderId,
        parentMessageId,
      },
      { transaction }
    );

    // Update last seen for sender
    participant.lastSeen = new Date();
    await participant.save({ transaction });

    await transaction.commit();

    // Populate sender info
    const messageWithSender = await Message.findByPk(message.id, {
      include: [{ model: User, as: "sender" }],
    });

    res.status(201).json(messageWithSender);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to reply to message" });
  }
};

module.exports = {
  sendMessage,
  getChatMessages,
  replyToMessage,
};
