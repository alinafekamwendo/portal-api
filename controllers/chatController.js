const { Chat, User, Class, Subject, ChatParticipant,Message } = require("../models");
const { sequelize, Op } = require("../models"); // Import Op

// Create a new chat

// Get all chats for a user
const getUserChats = async (req, res) => {

  try {
    const userId = req.params.userId;

    const chats = await ChatParticipant.findAll({
      where: {userId },
      include: [
        {
          model: Chat,
          as: "chat",
          include: [
            { model: Class, as: "class" },
            { model: Subject, as: "subject" },
            {
              model: ChatParticipant,
              as: "participants",
              include: [{ model: User, as: "user" }],
            },
          ],
        },
      ],
    });

    res.status(200).json(chats.map((p) => p.chat));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

// Add participants to a chat
const addParticipants = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { chatId, participants } = req.body;

    for (const userId of participants) {
      await ChatParticipant.findOrCreate({
        where: { chatId, userId },
        defaults: { role: "member" },
        transaction,
      });
    }

    await transaction.commit();
    res.status(200).json({ message: "Participants added successfully" });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to add participants" });
  }
};
// controllers/chatController.js

// ... (previous imports)

const getOrCreatePrivateChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { userId, otherUserId } = req.body;

    // Check if private chat already exists
    const existingChat = await Chat.findOne({
      where: {
        type: 'private'
      },
      include: [{
        model: ChatParticipant,
        where: {
          userId: [userId, otherUserId]
        },
        attributes: ['chatId'],
        group: ['chatId'],
        having: sequelize.where(
          sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('participants.userId'))),
          2
        )
      }]
    });

    if (existingChat) {
      await transaction.commit();
      return res.status(200).json(existingChat);
    }

    // Create new private chat
    const chat = await Chat.create({
      type: 'private'
    }, { transaction });

    // Add both participants
    await ChatParticipant.bulkCreate([
      { chatId: chat.id, userId, role: 'member' },
      { chatId: chat.id, userId: otherUserId, role: 'member' }
    ], { transaction });

    await transaction.commit();
    res.status(201).json(chat);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to create/find private chat" });
  }
};

// Enhanced get user chats with last message
const getUserChatsWithLastMessage = async (req, res) => {
  try {
    const userId = req.params.userId;

    const chats = await ChatParticipant.findAll({
      where: { userId },
      include: [
        {
          model: Chat,
          as: "chat",
          include: [
            { model: Class, as: "class" },
            { model: Subject, as: "subject" },
            {
              model: ChatParticipant,
              as: "participants",
              include: [{ model: User, as: "user" }],
            },
            {
              model: Message,
              as: "messages",
              separate: true,
              limit: 1,
              order: [['createdAt', 'DESC']],
              include: [{ model: User, as: "sender" }]
            }
          ],
        },
      ],
    });

    const formattedChats = chats.map(p => ({
      ...p.chat.toJSON(),
      lastMessage: p.chat.messages?.[0] || null
    }));

    res.status(200).json(formattedChats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};


// Create a new chat - Reworked
const createChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { type, participants, classId, subjectId, name } = req.body;
    const creatorId = req.user.id; // Assuming user ID is available from authentication middleware

    // Validate input based on chat type
    if (!['private', 'group', 'class', 'subject', 'public_group'].includes(type)) {
      return res.status(400).json({ error: 'Invalid chat type provided.' });
    }

    if (type === 'private' && (!participants || participants.length !== 1)) {
        return res.status(400).json({ error: 'Private chat creation requires exactly one other participant.' });
    }
    if (type === 'group' && (!participants || participants.length < 1)) { // Participants here means other users than creator
        return res.status(400).json({ error: 'Group chat requires at least one other participant.' });
    }
    if (['class', 'subject'].includes(type) && (!classId && !subjectId)) {
        return res.status(400).json({ error: `${type} chat requires a ${type}Id.` });
    }
    if (type === 'public_group' && !name) {
        return res.status(400).json({ error: 'Public group chat requires a name.' });
    }
    if (type !== 'private' && !name) { // All non-private chats need a name
        return res.status(400).json({ error: 'Group, class, subject, or public chat requires a name.' });
    }


    let finalParticipants = new Set([creatorId]); // Creator is always a participant
    let chatName = name; // Default name

    // Handle participants based on type
    if (type === 'class') {
      // Fetch all students in the class
      const students = await User.findAll({
        include: [{ model: sequelize.models.Student, as: 'student', where: { currentClassId: classId } }],
        attributes: ['id']
      });
      // Fetch teachers assigned to this class
      const teachers = await User.findAll({
        include: [{ model: sequelize.models.Teacher, as: 'teacher',
            include: [{ model: sequelize.models.TeachingAssignment, as: 'teachingAssignments', where: { classId: classId } }]
        }],
        attributes: ['id']
      });
      students.forEach(s => finalParticipants.add(s.id));
      teachers.forEach(t => finalParticipants.add(t.id));
      const classObj = await Class.findByPk(classId, { transaction });
      chatName = classObj ? `Class ${classObj.name} Chat` : `Class Chat`;
    } else if (type === 'subject') {
      // This logic is more complex and depends on how students and teachers are linked to subjects.
      // You'd need to query students enrolled in the subject and teachers teaching it.
      // For now, if no specific logic, treat it like a 'group' with explicit participants.
      participants.forEach(p => finalParticipants.add(p));
      const subjectObj = await Subject.findByPk(subjectId, { transaction });
      chatName = subjectObj ? `${subjectObj.name} Chat` : `Subject Chat`;
    } else if (type === 'group' || type === 'private') {
      participants.forEach(p => finalParticipants.add(p));
      if (type === 'private') {
          // Ensure no existing private chat between these two
          const existingChat = await Chat.findOne({
              where: { type: 'private' },
              include: [{
                  model: ChatParticipant,
                  as: 'participants',
                  where: { userId: { [Op.in]: [creatorId, participants[0]] } },
                  attributes: [], // No need to return participant attributes here
                  group: ['chat.id'], // Group by chat ID to count distinct participants
                  having: sequelize.where(sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('participants.userId'))), 2)
              }]
          });
          if (existingChat) {
              await transaction.rollback();
              return res.status(200).json({ message: 'Private chat already exists', chat: existingChat });
          }
          chatName = null; // Private chats typically don't have an explicit name field
      }
    } else if (type === 'public_group') {
        // No initial participants added, users join later
        finalParticipants = new Set();
    }


    const chat = await Chat.create(
      {
        type,
        classId: type === "class" ? classId : null,
        subjectId: type === "subject" ? subjectId : null,
        name: chatName,
        isPublic: type === 'public_group', // Set isPublic based on type
      },
      { transaction }
    );

    // Add participants only if not a public_group chat (or if public_group but creator is added)
    if (finalParticipants.size > 0) {
        const chatParticipantsData = Array.from(finalParticipants).map(userId => ({
            chatId: chat.id,
            userId,
            role: "member", // Default role
        }));
        await ChatParticipant.bulkCreate(chatParticipantsData, { transaction });
    }


    await transaction.commit();
    res.status(201).json(chat);
  } catch (err) {
    await transaction.rollback();
    console.error(`Error creating chat: ${err.message}`, err);
    res.status(500).json({ error: "Failed to create chat" });
  }
};

// New: Join a public chat
const joinPublicChat = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { chatId } = req.params;
        const userId = req.user.id; // Current user

        const chat = await Chat.findByPk(chatId, { transaction });
        if (!chat || chat.type !== 'public_group' || !chat.isPublic) {
            return res.status(404).json({ error: 'Chat not found or is not a joinable public group.' });
        }

        const [chatParticipant, created] = await ChatParticipant.findOrCreate({
            where: { chatId, userId },
            defaults: { role: 'member' },
            transaction,
        });

        if (!created) {
            return res.status(200).json({ message: 'User is already a participant of this chat.' });
        }

        await transaction.commit();
        res.status(200).json({ message: 'Successfully joined public chat.' });
    } catch (err) {
        await transaction.rollback();
        console.error(`Error joining public chat: ${err.message}`, err);
        res.status(500).json({ error: 'Failed to join public chat.' });
    }
};

// New: Get public chats a user can join (or are public and visible)
const getJoinablePublicChats = async (req, res) => {
    try {
        const userId = req.user.id;

        const joinableChats = await Chat.findAll({
            where: {
                type: 'public_group',
                isPublic: true,
                // Ensure the user is NOT already a participant
                '$participants.userId$': { [Op.not]: userId } // This requires a LEFT JOIN
            },
            include: [
                {
                    model: ChatParticipant,
                    as: 'participants',
                    attributes: ['userId'],
                    required: false // LEFT JOIN to include chats where user is not a participant
                }
            ]
        });
         // Filter out chats where the user is already a participant in memory (if $participants.userId$ with Op.not doesn't work as expected)
        const filteredChats = joinableChats.filter(chat => !chat.participants.some(p => p.userId === userId));


        res.status(200).json(filteredChats);
    } catch (err) {
        console.error(`Error fetching joinable public chats: ${err.message}`, err);
        res.status(500).json({ error: 'Failed to fetch joinable public chats.' });
    }
};

module.exports = {
  createChat,
  getUserChats,
  getUserChatsWithLastMessage,
  getOrCreatePrivateChat,
  addParticipants,
  joinPublicChat, // Export new function
  getJoinablePublicChats, // Export new function
};


