const { GraphQLUUID, GraphQLDate, GraphQLJSON } = require('graphql-scalars');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For JWT token generation (if you want to handle login via GraphQL)
const { AuthenticationError, UserInputError, ApolloError } = require('apollo-server-express');
const { PubSub } = require('graphql-subscriptions'); // For real-time subscriptions
const { Op } = require('sequelize'); // Sequelize operators

// Import your Sequelize models
const db = require('../models'); // Assuming your models are indexed here
const {
  User, Parent, Teacher, Student, Admin,
  SchoolYear, Term, Subject, Department, ClassLevel, Class, // Destructuring 'Class' here
  AssessmentType, Assessment, StudentAssessmentScore, TeachingAssignment,
  Chat, Message, ChatParticipant, // Your existing chat models
  sequelize // For transactions
} = db; // Destructure models from the db object

// Initialize PubSub for subscriptions
const pubsub = new PubSub();
const MESSAGE_SENT = 'MESSAGE_SENT';
const CHAT_CREATED = 'CHAT_CREATED';
const PARTICIPANT_ADDED = 'PARTICIPANT_ADDED';

// Helper function for authentication in resolvers
const checkAuth = (context) => {
  if (!context.user) {
    throw new AuthenticationError('Authentication required. Please log in.');
  }
  return context.user;
};

// Helper for authorization by role
const authorizeRole = (user, allowedRoles) => {
  if (!user || !allowedRoles.includes(user.role)) {
    throw new AuthenticationError('You are not authorized to perform this action.');
  }
};

// Helper to get or create a private chat between two users
// Helper to get or create a private chat between two users
const getOrCreatePrivateChatLogic = async (userId1, userId2, transaction) => {
    // Ensure the users exist
    const users = await User.findAll({
      where: { id: { [Op.in]: [userId1, userId2] } },
      transaction,
    });
    if (users.length !== 2) {
      throw new UserInputError('One or both users not found.');
    }
    console.log("user id", userId1);
    // Alternative approach to find existing private chat
    // Fetch all private chats that involve both userId1 and userId2
    const existingChats = await Chat.findAll({
      where: { type: 'private' },
      include: [{
        model: ChatParticipant,
        as: 'participants',
        where: {
          userId: { [Op.in]: [userId1, userId2] }
        },
        required: true, // Ensure both users are part of the initial fetch
      }],
      transaction
    });
  
    // Manually filter to find chats with exactly these 2 participants
    const existingChat = existingChats.find(chat =>
      chat.participants.length === 2 &&
      chat.participants.every(p => [userId1, userId2].includes(p.userId))
    );
  
    if (existingChat) {
      return existingChat;
    }
  
    // If no private chat exists, create a new one
    const chat = await Chat.create({ type: 'private' }, { transaction });
    await ChatParticipant.bulkCreate([
      { chatId: chat.id, userId: userId1, role: 'member', lastSeen: new Date() },
      { chatId: chat.id, userId: userId2, role: 'member', lastSeen: new Date() },
    ], { transaction });
  
    // Fetch the newly created chat with participants for the payload
    const newChatWithParticipants = await Chat.findByPk(chat.id, {
      include: [{
        model: ChatParticipant,
        as: 'participants',
        include: [{ model: User, as: 'user' }]
      }],
      transaction,
    });
  
    // Publish chat created event for both participants
    pubsub.publish(CHAT_CREATED, { chatCreated: newChatWithParticipants, userId: userId1 });
    pubsub.publish(CHAT_CREATED, { chatCreated: newChatWithParticipants, userId: userId2 });
  
    return newChatWithParticipants;
  };

const resolvers = {
  // Custom Scalar Resolvers
  UUID: GraphQLUUID,
  Date: GraphQLDate,
  JSON: GraphQLJSON,

  // --- Type Resolvers (for nested relationships) ---
  User: {
    parent: async (parent) => {
      if (parent.role === 'parent') {
        return await Parent.findOne({ where: { userId: parent.id } });
      }
      return null;
    },
    teacher: async (parent) => {
      if (parent.role === 'teacher') {
        return await Teacher.findOne({ where: { userId: parent.id } });
      }
      return null;
    },
    student: async (parent) => {
      if (parent.role === 'student') {
        return await Student.findOne({ where: { userId: parent.id } });
      }
      return null;
    },
    admin: async (parent) => {
      if (parent.role === 'admin') {
        return await Admin.findOne({ where: { userId: parent.id } });
      }
      return null;
    },
    chatParticipants: async (user) => {
      return await ChatParticipant.findAll({ where: { userId: user.id } });
    },
    sentMessages: async (user) => {
      return await Message.findAll({ where: { senderId: user.id } });
    }
  },
  Parent: {
    user: async (parent) => await User.findByPk(parent.userId),
  },
  Teacher: {
    user: async (teacher) => await User.findByPk(teacher.userId),
  },
  Student: {
    user: async (student) => await User.findByPk(student.userId),
    parent: async (student) => student.parentId ? await Parent.findByPk(student.parentId) : null,
    alte_guardian: async (student) => student.alte_guardian_Id ? await Parent.findByPk(student.alte_guardian_Id) : null,
    currentClass: async (student) => student.currentClassId ? await Class.findByPk(student.currentClassId) : null, // Uses 'Class'
    classLevel: async (student) => student.classLevelId ? await ClassLevel.findByPk(student.classLevelId) : null,
  },
  Admin: {
    user: async (admin) => await User.findByPk(admin.userId),
  },
  Subject: {
    department: async (subject) => subject.departmentId ? await Department.findByPk(subject.departmentId) : null,
  },
  Department: {
    hod: async (department) => department.hodId ? await Teacher.findByPk(department.hodId) : null,
  },
  Term: {
    schoolYear: async (term) => await SchoolYear.findByPk(term.schoolYearId),
  },
  // Note: This 'SchoolClass' refers to the GraphQL type, not the Sequelize model alias
  Class: { // This is the GraphQL type, not the Sequelize model
    supervisor: async (schoolClass) => schoolClass.supervisorId ? await Teacher.findByPk(schoolClass.supervisorId) : null,
    classLevel: async (schoolClass) => await ClassLevel.findByPk(schoolClass.classLevelId),
    academicYear: async (schoolClass) => schoolClass.academicYearId ? await SchoolYear.findByPk(schoolClass.academicYearId) : null,
    term: async (schoolClass) => schoolClass.termId ? await Term.findByPk(schoolClass.termId) : null,
  },
  Assessment: {
    assessmentType: async (assessment) => await AssessmentType.findByPk(assessment.assessmentTypeId),
    subject: async (assessment) => await Subject.findByPk(assessment.subjectId),
    class: async (assessment) => assessment.classId ? await Class.findByPk(assessment.classId) : null, // Uses 'Class'
    term: async (assessment) => await Term.findByPk(assessment.termId),
    schoolYear: async (assessment) => await SchoolYear.findByPk(assessment.schoolYearId),
    studentScores: async (assessment) => await StudentAssessmentScore.findAll({ where: { assessmentId: assessment.id } }),
  },
  StudentAssessmentScore: {
    student: async (score) => await Student.findByPk(score.studentId),
    assessment: async (score) => await Assessment.findByPk(score.assessmentId),
  },
  TeachingAssignment: {
    teacher: async (assignment) => await Teacher.findByPk(assignment.teacherId),
    subject: async (assignment) => assignment.subjectId ? await Subject.findByPk(assignment.subjectId) : null,
    class: async (assignment) => assignment.classId ? await Class.findByPk(assignment.classId) : null, // Uses 'Class'
    term: async (assignment) => assignment.termId ? await Term.findByPk(assignment.termId) : null,
    schoolYear: async (assignment) => assignment.schoolYearId ? await SchoolYear.findByPk(assignment.schoolYearId) : null,
    department: async (assignment) => assignment.departmentId ? await Department.findByPk(assignment.departmentId) : null,
  },
  // Chat Type Resolvers (Aligned with your models)
  Message: {
    sender: async (message) => await User.findByPk(message.senderId),
    chat: async (message) => await Chat.findByPk(message.chatId),
    replies: async (message) => {
      return await Message.findAll({
        where: { parentMessageId: message.id },
        order: [['createdAt', 'ASC']],
        include: [{ model: User, as: 'sender' }], // Include sender for replies
      });
    },
  },
  Chat: {
    participants: async (chat) => {
      return await ChatParticipant.findAll({
        where: { chatId: chat.id },
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'profilePhoto'] }]
      });
    },
    messages: async (chat) => {
      // Fetch recent top-level messages for a chat, including replies
      return await Message.findAll({
        where: { chatId: chat.id, parentMessageId: { [Op.is]: null } }, // Only top-level messages
        order: [['createdAt', 'DESC']],
        limit: 50, // Limit to last 50 messages for performance
        include: [
          { model: User, as: 'sender' },
          {
            model: Message,
            as: 'replies',
            include: [{ model: User, as: 'sender' }],
          },
        ],
      });
    },
    lastMessage: async (chat) => {
      const messages = await Message.findAll({
        where: { chatId: chat.id },
        order: [['createdAt', 'DESC']],
        limit: 1,
      });
      return messages[0] || null;
    },
    class: async (chat) => chat.classId ? await Class.findByPk(chat.classId) : null, // Uses 'Class'
    subject: async (chat) => chat.subjectId ? await Subject.findByPk(chat.subjectId) : null,
  },
  ChatParticipant: {
    chat: async (chatParticipant) => await Chat.findByPk(chatParticipant.chatId),
    user: async (chatParticipant) => await User.findByPk(chatParticipant.userId),
  },

  // --- Query Resolvers ---
  Query: {
    // Users and Roles
    users: async (_, { limit, offset, role, isActive, search }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']); // Only admins can list all users
      const where = {};
      if (role) where.role = role;
      if (isActive !== undefined) where.isActive = isActive;
      const include = [];
      if (search) {
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { username: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } },
        ];
      }
      return await User.findAll({ where, limit, offset, include });
    },
    user: async (_, { id }, context) => {
      const user = checkAuth(context);
      // Basic authorization: user can view their own profile or admin can view any
      if (user.id !== id && user.role !== 'admin') {
        throw new AuthenticationError('You are not authorized to view this user profile.');
      }
      return await User.findByPk(id);
    },
    parents: async (_, { limit, offset, search }, context) => {
      checkAuth(context); // Authenticated users can view parents
      const where = {};
      const include = [{ model: User, as: 'user' }];
      if (search) {
        where[Op.or] = [
          { '$user.firstName$': { [Op.iLike]: `%${search}%` } },
          { '$user.lastName$': { [Op.iLike]: `%${search}%` } },
          { '$user.username$': { [Op.iLike]: `%${search}%` } },
          { '$user.email$': { [Op.iLike]: `%${search}%` } },
          { parentNumber: { [Op.iLike]: `%${search}%` } },
        ];
      }
      return await Parent.findAll({
        where,
        limit,
        offset,
        include,
      });
    },
    parent: async (_, { id }, context) => {
      checkAuth(context);
      return await Parent.findByPk(id, { include: [{ model: User, as: 'user' }] });
    },
    teachers: async (_, { limit, offset, search }, context) => {
      checkAuth(context);
      const where = {};
      const include = [{ model: User, as: 'user' }];
      if (search) {
        where[Op.or] = [
          { '$user.firstName$': { [Op.iLike]: `%${search}%` } },
          { '$user.lastName$': { [Op.iLike]: `%${search}%` } },
          { '$user.username$': { [Op.iLike]: `%${search}%` } },
          { '$user.email$': { [Op.iLike]: `%${search}%` } },
          { staffNumber: { [Op.iLike]: `%${search}%` } },
        ];
      }
      return await Teacher.findAll({
        where,
        limit,
        offset,
        include,
      });
    },
    teacher: async (_, { id }, context) => {
      checkAuth(context);
      return await Teacher.findByPk(id, { include: [{ model: User, as: 'user' }] });
    },
    students: async (_, { limit, offset, search }, context) => {
      checkAuth(context);
      const where = {};
      const include = [{ model: User, as: 'user' }];
      if (search) {
        where[Op.or] = [
          { '$user.firstName$': { [Op.iLike]: `%${search}%` } },
          { '$user.lastName$': { [Op.iLike]: `%${search}%` } },
          { '$user.username$': { [Op.iLike]: `%${search}%` } },
          { '$user.email$': { [Op.iLike]: `%${search}%` } },
          { studentNumber: { [Op.iLike]: `%${search}%` } },
        ];
      }
      return await Student.findAll({
        where,
        limit,
        offset,
        include,
      });
    },
    student: async (_, { id }, context) => {
      checkAuth(context);
      return await Student.findByPk(id, { include: [{ model: User, as: 'user' }] });
    },
    admins: async (_, { limit, offset, search }, context) => {
      checkAuth(context);
      const where = {};
      const include = [{ model: User, as: 'user' }];
      if (search) {
        where[Op.or] = [
          { '$user.firstName$': { [Op.iLike]: `%${search}%` } },
          { '$user.lastName$': { [Op.iLike]: `%${search}%` } },
          { '$user.username$': { [Op.iLike]: `%${search}%` } },
          { '$user.email$': { [Op.iLike]: `%${search}%` } },
          { adminNumber: { [Op.iLike]: `%${search}%` } },
        ];
      }
      return await Admin.findAll({
        where,
        limit,
        offset,
        include,
      });
    },
    admin: async (_, { id }, context) => {
      checkAuth(context);
      return await Admin.findByPk(id, { include: [{ model: User, as: 'user' }] });
    },

    // School Entities
    schoolYears: async (_, { limit, offset, name, isCurrent }, context) => {
      checkAuth(context);
      const where = {};
      if (name) where.name = { [Op.iLike]: `%${name}%` };
      if (isCurrent !== undefined) where.isCurrent = isCurrent;
      return await SchoolYear.findAll({ where, limit, offset });
    },
    schoolYear: async (_, { id }, context) => {
      checkAuth(context);
      return await SchoolYear.findByPk(id);
    },
    terms: async (_, { limit, offset, tname, schoolYearId }, context) => {
      checkAuth(context);
      const where = {};
      if (tname) where.tname = { [Op.iLike]: `%${tname}%` };
      if (schoolYearId) where.schoolYearId = schoolYearId;
      return await Term.findAll({ where, limit, offset, include: [{ model: SchoolYear, as: 'schoolYear' }] });
    },
    term: async (_, { id }, context) => {
      checkAuth(context);
      return await Term.findByPk(id, { include: [{ model: SchoolYear, as: 'schoolYear' }] });
    },
    subjects: async (_, { limit, offset, name, code, departmentId }, context) => {
      checkAuth(context);
      const where = {};
      if (name) where.name = { [Op.iLike]: `%${name}%` };
      if (code) where.code = { [Op.iLike]: `%${code}%` };
      if (departmentId) where.departmentId = departmentId;
      return await Subject.findAll({ where, limit, offset, include: [{ model: Department, as: 'department' }] });
    },
    subject: async (_, { id }, context) => {
      checkAuth(context);
      return await Subject.findByPk(id, { include: [{ model: Department, as: 'department' }] });
    },
    classLevels: async (_, __, context) => {
      checkAuth(context);
      return await ClassLevel.findAll();
    },
    classLevel: async (_, { id }, context) => {
      checkAuth(context);
      return await ClassLevel.findByPk(id);
    },
    classes: async (_, { limit, offset, name, academicYearId, termId, classLevelId, supervisorId }, context) => {
      checkAuth(context);
      const where = {};
      if (name) where.name = { [Op.iLike]: `%${name}%` };
      if (academicYearId) where.academicYearId = academicYearId;
      if (termId) where.termId = termId;
      if (classLevelId) where.classLevelId = classLevelId;
      if (supervisorId) where.supervisorId = supervisorId;
      return await Class.findAll({ // Uses 'Class'
        where,
        limit,
        offset,
        include: [
          { model: ClassLevel, as: 'classLevel' },
          { model: Teacher, as: 'supervisor', include: [{ model: User, as: 'user' }] },
          { model: SchoolYear, as: 'academicYear' },
          { model: Term, as: 'term' },
        ]
      });
    },
    class: async (_, { id }, context) => {
      checkAuth(context);
      return await Class.findByPk(id, { // Uses 'Class'
        include: [
          { model: ClassLevel, as: 'classLevel' },
          { model: Teacher, as: 'supervisor', include: [{ model: User, as: 'user' }] },
          { model: SchoolYear, as: 'academicYear' },
          { model: Term, as: 'term' },
        ]
      });
    },

    // Assessments and Marks
    assessmentTypes: async (_, __, context) => {
      checkAuth(context);
      return await AssessmentType.findAll();
    },
    assessmentType: async (_, { id }, context) => {
      checkAuth(context);
      return await AssessmentType.findByPk(id);
    },
    assessments: async (_, { limit, offset, title, subjectId, classId, termId, schoolYearId }, context) => {
      checkAuth(context);
      const where = {};
      if (title) where.title = { [Op.iLike]: `%${title}%` };
      if (subjectId) where.subjectId = subjectId;
      if (classId) where.classId = classId;
      if (termId) where.termId = termId;
      if (schoolYearId) where.schoolYearId = schoolYearId;
      return await Assessment.findAll({
        where,
        limit,
        offset,
        include: [
          { model: AssessmentType, as: 'assessmentType' },
          { model: Subject, as: 'subject' },
          { model: Class, as: 'class' }, // Uses 'Class'
          { model: Term, as: 'term' },
          { model: SchoolYear, as: 'schoolYear' },
        ]
      });
    },
    assessment: async (_, { id }, context) => {
      checkAuth(context);
      return await Assessment.findByPk(id, {
        include: [
          { model: AssessmentType, as: 'assessmentType' },
          { model: Subject, as: 'subject' },
          { model: Class, as: 'class' }, // Uses 'Class'
          { model: Term, as: 'term' },
          { model: SchoolYear, as: 'schoolYear' },
        ]
      });
    },
    studentAssessmentScores: async (_, { studentId, assessmentId }, context) => {
      checkAuth(context);
      const where = {};
      if (studentId) where.studentId = studentId;
      if (assessmentId) where.assessmentId = assessmentId;
      return await StudentAssessmentScore.findAll({
        where,
        include: [{ model: Student, as: 'student', include: [{ model: User, as: 'user' }] }, { model: Assessment, as: 'assessment' }]
      });
    },

    // Teaching Assignments
    teachingAssignments: async (_, { limit, offset, teacherId, subjectId, classId, termId, schoolYearId, isHOD, departmentId }, context) => {
      checkAuth(context);
      const where = {};
      if (teacherId) where.teacherId = teacherId;
      if (subjectId) where.subjectId = subjectId;
      if (classId) where.classId = classId;
      if (termId) where.termId = termId;
      if (schoolYearId) where.schoolYearId = schoolYearId;
      if (isHOD !== undefined) where.isHOD = isHOD;
      if (departmentId) where.departmentId = departmentId;

      return await TeachingAssignment.findAll({
        where,
        limit,
        offset,
        include: [
          { model: Teacher, as: 'teacher', include: [{ model: User, as: 'user' }] },
          { model: Subject, as: 'subject' },
          { model: Class, as: 'class' }, // Uses 'Class'
          { model: Term, as: 'term' },
          { model: SchoolYear, as: 'schoolYear' },
          { model: Department, as: 'department' },
        ]
      });
    },
    teachingAssignment: async (_, { id }, context) => {
      checkAuth(context);
      return await TeachingAssignment.findByPk(id, {
        include: [
          { model: Teacher, as: 'teacher', include: [{ model: User, as: 'user' }] },
          { model: Subject, as: 'subject' },
          { model: Class, as: 'class' }, // Uses 'Class'
          { model: Term, as: 'term' },
          { model: SchoolYear, as: 'schoolYear' },
          { model: Department, as: 'department' },
        ]
      });
    },

    // Chat Queries (New - Aligned with your models and controller)
    messages: async (_, { chatId }, context) => {
      const currentUser = checkAuth(context);

      const chat = await Chat.findByPk(chatId);
      if (!chat) {
        throw new UserInputError('Chat not found.');
      }

      // Verify the current user is a participant of the chat
      const isParticipant = await ChatParticipant.findOne({
        where: { chatId: chat.id, userId: currentUser.id }
      });

      if (!isParticipant) {
        throw new AuthenticationError('You are not authorized to view messages in this chat.');
      }

      // Update lastSeen for the current user in this chat
      await ChatParticipant.update(
        { lastSeen: new Date() },
        { where: { chatId: chat.id, userId: currentUser.id } }
      );

      return await Message.findAll({
        where: { chatId: chat.id },
        order: [['createdAt', 'ASC']], // Order messages chronologically
        include: [
          { model: User, as: 'sender' },
          {
            model: Message,
            as: 'replies',
            include: [{ model: User, as: 'sender' }],
          },
        ],
      });
    },

    userChats: async (_, __, context) => {
      const currentUser = checkAuth(context);

      // Find all chat participants for the current user
      const userChatParticipants = await ChatParticipant.findAll({
        where: { userId: currentUser.id },
        include: [{
          model: Chat,
          as: 'chat',
          include: [
            // Include the ChatParticipant association as defined in your Chat model
            { 
              model: ChatParticipant, 
              as: 'participants', // This alias matches Chat.hasMany(ChatParticipant, { as: 'participants' })
              include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'profilePhoto'] }] 
            },
            {
              model: Message,
              as: 'messages', // Use the 'messages' alias as defined in Chat.hasMany(Message)
              limit: 1,
              order: [['createdAt', 'DESC']],
              include: [{ model: User, as: 'sender', attributes: ['id', 'firstName'] }]
            },
            { model: Class, as: 'class' }, // Uses 'Class'
            { model: Subject, as: 'subject' },
          ]
        }]
      });

      // Map to return the Chat objects directly
      return userChatParticipants.map(cp => {
        const chat = cp.chat.toJSON();
        // Add currentUserLastSeen from the ChatParticipant entry
        chat.currentUserLastSeen = cp.lastSeen;
        return chat;
      });
    },

    chat: async (_, { id }, context) => {
      const currentUser = checkAuth(context);

      const chat = await Chat.findByPk(id, {
        include: [{
          model: ChatParticipant,
          as: 'participants',
          where: { userId: currentUser.id }, // Ensure current user is a participant
          required: true, // Only return if user is a participant
        },
        { model: Class, as: 'class' }, // Uses 'Class'
        { model: Subject, as: 'subject' },
        ],
      });

      if (!chat) {
        throw new UserInputError('Chat not found or you are not a participant.');
      }
      return chat;
    },

    getOrCreatePrivateChat: async (_, { otherUserId }, context) => {
      const currentUser = checkAuth(context);
      if (currentUser.id === otherUserId) {
        throw new UserInputError('Cannot create a private chat with yourself.');
      }
      const transaction = await sequelize.transaction();
      try {
        const chat = await getOrCreatePrivateChatLogic(currentUser.id, otherUserId, transaction);
        await transaction.commit();
        return chat;
      } catch (error) {
        await transaction.rollback();
        console.error('Error getting or creating private chat:', error);
        throw new ApolloError('Failed to get or create private chat', 'PRIVATE_CHAT_FAILED', { originalError: error });
      }
    },

    joinablePublicChats: async (_, __, context) => {
      const currentUser = checkAuth(context);

      // Find all public chats
      const publicChats = await Chat.findAll({
        where: { type: 'public_group' },
        include: [{
          model: ChatParticipant,
          as: 'participants',
          attributes: ['userId'], // Only need participant IDs
          required: false // Include chats even if they have no participants yet
        }]
      });

      // Filter out chats where the current user is already a participant
      const joinableChats = publicChats.filter(chat => {
        const isParticipant = chat.participants.some(p => p.userId === currentUser.id);
        return !isParticipant;
      });

      return joinableChats;
    },
  },
  // In your resolvers.js
Mutation: {
  deleteChat: async (_, { chatId }, context) => {
    const currentUser = checkAuth(context);
    const transaction = await sequelize.transaction();
    
    try {
      // Find the chat and verify the current user is the creator/admin
      const chat = await Chat.findByPk(chatId, {
        include: [{
          model: ChatParticipant,
          as: 'participants',
          where: { userId: currentUser.id }
        }],
        transaction
      });

      if (!chat) {
        throw new UserInputError('Chat not found');
      }

      const participant = chat.participants[0];
      if (!participant || participant.role !== 'admin') {
        throw new AuthenticationError('Only chat admins can delete this chat');
      }

      // Delete all messages first
      await Message.destroy({ where: { chatId }, transaction });
      
      // Delete all participants
      await ChatParticipant.destroy({ where: { chatId }, transaction });
      
      // Delete the chat
      await chat.destroy({ transaction });

      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      console.error('Error deleting chat:', error);
      throw new ApolloError('Failed to delete chat', 'CHAT_DELETE_FAILED');
    }
  },

  deleteMessage: async (_, { messageId }, context) => {
    const currentUser = checkAuth(context);
    console.log(`Attempting to delete message ${messageId} by user ${currentUser.id}`);
    try {
      const message = await Message.findByPk(messageId);
      if (!message) {
        throw new UserInputError('Message not found');
      }

      // Only allow deletion if user is the sender or a chat admin
      const isParticipant = await ChatParticipant.findOne({
        where: { 
          chatId: message.chatId,
          userId: currentUser.id,
          //role: 'admin' 
        }
      });

      if (message.senderId !== currentUser.id && !isParticipant) {
        throw new AuthenticationError('You can only delete your own messages');
      }

      await message.destroy();
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      throw new ApolloError('Failed to delete message', 'MESSAGE_DELETE_FAILED');
    }
  }
},

  // --- Mutation Resolvers ---
  Mutation: {
    // User & Role Mutations (existing)
    createUser: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']); // Only admin can create users directly
      const hashedPassword = await bcrypt.hash(input.password, 10);
      return await User.create({ ...input, password: hashedPassword });
    },
    updateUser: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      if (currentUser.id !== id && currentUser.role !== 'admin') {
        throw new AuthenticationError('You are not authorized to update this user.');
      }
      const targetUser = await User.findByPk(id);
      if (!targetUser) throw new UserInputError('User not found');
      await targetUser.update(input);
      return targetUser;
    },
    deleteUser: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const userToDelete = await User.findByPk(id);
      if (!userToDelete) throw new UserInputError('User not found');
      await userToDelete.destroy(); // Soft delete
      return true;
    },
    restoreUser: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const userToRestore = await User.findByPk(id, { paranoid: false }); // Find even if soft-deleted
      if (!userToRestore) throw new UserInputError('User not found');
      await userToRestore.restore(); // Restore soft-deleted record
      return true;
    },

    createTeacher: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Teacher.create(input);
    },
    updateTeacher: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const teacher = await Teacher.findByPk(id);
      if (!teacher) throw new UserInputError('Teacher not found');
      await teacher.update(input);
      return teacher;
    },
    deleteTeacher: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const teacher = await Teacher.findByPk(id);
      if (!teacher) throw new UserInputError('Teacher not found');
      await teacher.destroy();
      return true;
    },

    createStudent: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Student.create(input);
    },
    updateStudent: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const student = await Student.findByPk(id);
      if (!student) throw new UserInputError('Student not found');
      await student.update(input);
      return student;
    },
    deleteStudent: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const student = await Student.findByPk(id);
      if (!student) throw new UserInputError('Student not found');
      await student.destroy();
      return true;
    },

    createParent: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Parent.create(input);
    },
    updateParent: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const parent = await Parent.findByPk(id);
      if (!parent) throw new UserInputError('Parent not found');
      await parent.update(input);
      return parent;
    },
    deleteParent: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const parent = await Parent.findByPk(id);
      if (!parent) throw new UserInputError('Parent not found');
      await parent.destroy();
      return true;
    },

    createAdmin: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Admin.create(input);
    },
    updateAdmin: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const admin = await Admin.findByPk(id);
      if (!admin) throw new UserInputError('Admin not found');
      await admin.update(input);
      return admin;
    },
    deleteAdmin: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const admin = await Admin.findByPk(id);
      if (!admin) throw new UserInputError('Admin not found');
      await admin.destroy();
      return true;
    },

    // School Entity Mutations (existing)
    createSchoolYear: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await SchoolYear.create(input);
    },
    updateSchoolYear: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const schoolYear = await SchoolYear.findByPk(id);
      if (!schoolYear) throw new UserInputError('School Year not found');
      await schoolYear.update(input);
      return schoolYear;
    },
    deleteSchoolYear: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const schoolYear = await SchoolYear.findByPk(id);
      if (!schoolYear) throw new UserInputError('School Year not found');
      await schoolYear.destroy();
      return true;
    },
    restoreSchoolYear: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const schoolYear = await SchoolYear.findByPk(id, { paranoid: false });
      if (!schoolYear) throw new UserInputError('School Year not found');
      await schoolYear.restore();
      return true;
    },

    createTerm: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Term.create(input);
    },
    updateTerm: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const term = await Term.findByPk(id);
      if (!term) throw new UserInputError('Term not found');
      await term.update(input);
      return term;
    },
    deleteTerm: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const term = await Term.findByPk(id);
      if (!term) throw new UserInputError('Term not found');
      await term.destroy();
      return true;
    },
    restoreTerm: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const term = await Term.findByPk(id, { paranoid: false });
      if (!term) throw new UserInputError('Term not found');
      await term.restore();
      return true;
    },

    createSubject: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Subject.create(input);
    },
    updateSubject: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const subject = await Subject.findByPk(id);
      if (!subject) throw new UserInputError('Subject not found');
      await subject.update(input);
      return subject;
    },
    deleteSubject: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const subject = await Subject.findByPk(id);
      if (!subject) throw new UserInputError('Subject not found');
      await subject.destroy();
      return true;
    },
    restoreSubject: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const subject = await Subject.findByPk(id, { paranoid: false });
      if (!subject) throw new UserInputError('Subject not found');
      await subject.restore();
      return true;
    },

    createClassLevel: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await ClassLevel.create(input);
    },
    updateClassLevel: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const classLevel = await ClassLevel.findByPk(id);
      if (!classLevel) throw new UserInputError('Class Level not found');
      await classLevel.update(input);
      return classLevel;
    },
    deleteClassLevel: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const classLevel = await ClassLevel.findByPk(id);
      if (!classLevel) throw new UserInputError('Class Level not found');
      // Note: ClassLevel might not have soft delete (paranoid: true) in your model.
      // If not, this will be a hard delete. Adjust if soft delete is desired.
      await classLevel.destroy();
      return true;
    },

    createClass: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await Class.create(input); // Uses 'Class'
    },
    updateClass: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const schoolClass = await Class.findByPk(id); // Uses 'Class'
      if (!schoolClass) throw new UserInputError('Class not found');
      await schoolClass.update(input);
      return schoolClass;
    },
    deleteClass: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const schoolClass = await Class.findByPk(id); // Uses 'Class'
      if (!schoolClass) throw new UserInputError('Class not found');
      await schoolClass.destroy();
      return true;
    },
    restoreClass: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const schoolClass = await Class.findByPk(id, { paranoid: false }); // Uses 'Class'
      if (!schoolClass) throw new UserInputError('Class not found');
      await schoolClass.restore();
      return true;
    },

    // Assessment and Marks Mutations (existing)
    createAssessmentType: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await AssessmentType.create(input);
    },
    updateAssessmentType: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const assessmentType = await AssessmentType.findByPk(id);
      if (!assessmentType) throw new UserInputError('Assessment Type not found');
      await assessmentType.update(input);
      return assessmentType;
    },
    deleteAssessmentType: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const assessmentType = await AssessmentType.findByPk(id);
      if (!assessmentType) throw new UserInputError('Assessment Type not found');
      await assessmentType.destroy();
      return true;
    },

    createAssessment: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin', 'teacher']);
      return await Assessment.create(input);
    },
    updateAssessment: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin', 'teacher']);
      const assessment = await Assessment.findByPk(id);
      if (!assessment) throw new UserInputError('Assessment not found');
      await assessment.update(input);
      return assessment;
    },
    deleteAssessment: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin', 'teacher']);
      const assessment = await Assessment.findByPk(id);
      if (!assessment) throw new UserInputError('Assessment not found');
      await assessment.destroy();
      return true;
    },

    createStudentAssessmentScore: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin', 'teacher']);
      // Add validation for score range here if not done in schema
      const assessment = await Assessment.findByPk(input.assessmentId);
      if (!assessment) throw new UserInputError('Assessment not found for score creation.');
      if (input.score < 0 || input.score > assessment.maxScore) {
        throw new UserInputError(`Score must be between 0 and ${assessment.maxScore}.`);
      }
      return await StudentAssessmentScore.create(input);
    },
    updateStudentAssessmentScore: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin', 'teacher']);
      const scoreEntry = await StudentAssessmentScore.findByPk(id);
      if (!scoreEntry) throw new UserInputError('Student Assessment Score not found');

      // Re-validate score against maxScore if score is being updated
      if (input.score !== undefined && input.score !== null) {
        const assessment = await Assessment.findByPk(scoreEntry.assessmentId);
        if (!assessment) throw new UserInputError('Associated Assessment not found for score validation.');
        if (input.score < 0 || input.score > assessment.maxScore) {
          throw new UserInputError(`Score must be between 0 and ${assessment.maxScore}.`);
        }
      }
      await scoreEntry.update(input);
      return scoreEntry;
    },
    deleteStudentAssessmentScore: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin', 'teacher']);
      const scoreEntry = await StudentAssessmentScore.findByPk(id);
      if (!scoreEntry) throw new UserInputError('Student Assessment Score not found');
      await scoreEntry.destroy();
      return true;
    },

    // Teaching Assignment Mutations (existing)
    createTeachingAssignment: async (_, { input }, context) => {
      const user = checkAuth(context);
      authorizeRole(user, ['admin']);
      return await TeachingAssignment.create(input);
    },
    updateTeachingAssignment: async (_, { id, input }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const assignment = await TeachingAssignment.findByPk(id);
      if (!assignment) throw new UserInputError('Teaching Assignment not found');
      await assignment.update(input);
      return assignment;
    },
    deleteTeachingAssignment: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      authorizeRole(currentUser, ['admin']);
      const assignment = await TeachingAssignment.findByPk(id);
      if (!assignment) throw new UserInputError('Teaching Assignment not found');
      await assignment.destroy();
      return true;
    },

    // Chat Mutations (New - Aligned with your models and controller)
    sendMessage: async (_, { input }, context) => {
      const currentUser = checkAuth(context);
      const transaction = await sequelize.transaction();
      try {
        const { chatId, content, parentMessageId } = input;

        const chat = await Chat.findByPk(chatId, { transaction });
        if (!chat) {
          throw new UserInputError('Chat not found.');
        }

        // Verify user is participant
        const participant = await ChatParticipant.findOne({
          where: { chatId, userId: currentUser.id },
          transaction,
        });

        if (!participant) {
          throw new AuthenticationError('Not a chat participant.');
        }

        if (parentMessageId) {
          const parentMessage = await Message.findByPk(parentMessageId, { transaction });
          if (!parentMessage) {
            throw new UserInputError('Parent message not found.');
          }
          if (parentMessage.chatId !== chatId) {
            throw new UserInputError('Parent message does not belong to the specified chat.');
          }
        }

        const message = await Message.create(
          {
            chatId,
            content,
            senderId: currentUser.id,
            isRead: false,
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
          include: [{ model: User, as: 'sender' }],
        });

        // Publish the new message to subscribers of this chat
        pubsub.publish(MESSAGE_SENT, {
          messageSent: messageWithSender,
          chatId: chat.id, // Use chatId
        });

        return messageWithSender;
      } catch (error) {
        await transaction.rollback();
        console.error('Error sending message:', error);
        throw new ApolloError('Failed to send message', 'MESSAGE_SEND_FAILED', { originalError: error });
      }
    },

    createChat: async (_, { input }, context) => {
        const currentUser = checkAuth(context);
        const transaction = await sequelize.transaction();
        try {
          const { type, participants, name, classId, subjectId } = input;
      
          // Validation based on chat type
          if (type === 'private') {
            if (!participants || participants.length !== 1) {
              throw new UserInputError('Private chat requires exactly one other participant.');
            }
            const otherUserId = participants[0];
            if (currentUser.id === otherUserId) {
              throw new UserInputError('Cannot create a private chat with yourself.');
            }
            // Handle private chat creation separately
            const existingChat = await getOrCreatePrivateChatLogic(currentUser.id, otherUserId, transaction);
            await transaction.commit();
            return existingChat;
          }
      
          // For group chats
          if ((type === 'group' || type === 'public_group') && !name) {
            throw new UserInputError('Group chats require a name.');
          }
      
          // For class chats
          if (type === 'class' && !classId) {
            throw new UserInputError('Class chat requires a classId.');
          }
      
          // For subject chats
          if (type === 'subject' && !subjectId) {
            throw new UserInputError('Subject chat requires a subjectId.');
          }
      
          // Check for existing chats for class/subject types
          if (type === 'class') {
            const existingClassChat = await Chat.findOne({ where: { type: 'class', classId }, transaction });
            if (existingClassChat) {
              throw new UserInputError('A chat already exists for this class.');
            }
          } else if (type === 'subject') {
            const existingSubjectChat = await Chat.findOne({ where: { type: 'subject', subjectId }, transaction });
            if (existingSubjectChat) {
              throw new UserInputError('A chat already exists for this subject.');
            }
          }
      
          // Create the chat
          const chat = await Chat.create({
            name: name || null,
            type,
            classId: classId || null,
            subjectId: subjectId || null,
          }, { transaction });
      
          // Determine participants based on chat type
          let allParticipantIds = [currentUser.id]; // Always include creator
      
          if (type === 'group' || type === 'public_group') {
            allParticipantIds = [...new Set([...(participants || []), currentUser.id])];
          } else if (type === 'class') {
            // Get all students and teachers in this class
            const classStudents = await Student.findAll({ 
              where: { currentClassId: classId }, 
              attributes: ['userId'], 
              transaction 
            });
            const classTeachers = await TeachingAssignment.findAll({ 
              where: { classId }, 
              attributes: ['teacherId'], 
              transaction 
            });
            const teacherUsers = await Teacher.findAll({ 
              where: { id: { [Op.in]: classTeachers.map(ta => ta.teacherId) } }, 
              attributes: ['userId'], 
              transaction 
            });
      
            allParticipantIds = [
              ...new Set([
                currentUser.id,
                ...classStudents.map(s => s.userId),
                ...teacherUsers.map(t => t.userId)
              ])
            ];
          } else if (type === 'subject') {
            // Get teachers assigned to this subject
            const subjectTeachers = await TeachingAssignment.findAll({ 
              where: { subjectId }, 
              attributes: ['teacherId'], 
              transaction 
            });
            const teacherUsers = await Teacher.findAll({ 
              where: { id: { [Op.in]: subjectTeachers.map(ta => ta.teacherId) } }, 
              attributes: ['userId'], 
              transaction 
            });
            allParticipantIds = [...new Set([currentUser.id, ...teacherUsers.map(t => t.userId)])];
          }
      
          // Verify all participant IDs are valid users
          const validUsers = await User.findAll({
            where: { id: { [Op.in]: allParticipantIds } },
            transaction,
          });
      
          if (validUsers.length !== allParticipantIds.length) {
            throw new UserInputError('One or more participant IDs are invalid.');
          }
      
          // Create participant entries
          const participantEntries = allParticipantIds.map(userId => ({
            chatId: chat.id,
            userId: userId,
            role: userId === currentUser.id ? 'admin' : 'member',
            lastSeen: new Date(),
          }));
      
          await ChatParticipant.bulkCreate(participantEntries, { transaction });
      
          // Commit the transaction
          await transaction.commit();
      
          // Fetch the created chat with all its participants
          const createdChatWithDetails = await Chat.findByPk(chat.id, {
            include: [{
              model: ChatParticipant, 
              as: 'participants', 
              include: [{ model: User, as: 'user' }]
            }],
          });
      
          // Publish chat created event for all participants
          for (const userId of allParticipantIds) {
            pubsub.publish(CHAT_CREATED, { 
              chatCreated: createdChatWithDetails, 
              userId: userId 
            });
          }
      
          return createdChatWithDetails;
        } catch (error) {
          await transaction.rollback();
          console.error('Error creating chat:', error);
          throw new ApolloError(
            'Failed to create chat: ' + error.message, 
            'CHAT_CREATION_FAILED', 
            { originalError: error }
          );
        }
      },
    addParticipantsToChat: async (_, { input }, context) => {
      const currentUser = checkAuth(context);
      const transaction = await sequelize.transaction();
      try {
        const { chatId, userIds } = input;

        const chat = await Chat.findByPk(chatId, {
          include: [{ model: ChatParticipant, as: 'participants', where: { userId: currentUser.id } }],
          transaction,
        });

        if (!chat) {
          throw new UserInputError('Chat not found or you are not a participant.');
        }

        // Only chat admins or creators can add participants (example authorization)
        const currentUserParticipant = chat.participants.find(p => p.userId === currentUser.id);
        if (!currentUserParticipant || currentUserParticipant.role !== 'admin') {
          // For simplicity, allowing any participant to add to non-private chats
          // You might want stricter rules based on chat.type
          if (chat.type === 'private' || chat.type === 'class' || chat.type === 'subject') {
             throw new AuthenticationError('You are not authorized to add participants to this chat type.');
          }
        }

        const existingParticipantIds = chat.participants.map(p => p.userId);
        const newParticipantIds = userIds.filter(id => !existingParticipantIds.includes(id));

        if (newParticipantIds.length === 0) {
          return chat; // No new participants to add
        }

        // Check if all new participants exist
        const validNewUsers = await User.findAll({
          where: { id: { [Op.in]: newParticipantIds } },
          transaction,
        });
        if (validNewUsers.length !== newParticipantIds.length) {
          throw new UserInputError('One or more user IDs to add are invalid.');
        }

        const participantEntries = newParticipantIds.map(userId => ({
          chatId: chat.id,
          userId: userId,
          role: 'member', // New participants are members by default
          lastSeen: new Date(),
        }));

        await ChatParticipant.bulkCreate(participantEntries, { transaction });

        await transaction.commit();

        // Fetch the updated chat with all its participants for the subscription payload
        const updatedChatWithDetails = await Chat.findByPk(chat.id, {
          include: [{ model: ChatParticipant, as: 'participants', include: [{ model: User, as: 'user' }] }],
        });

        // Publish participant added event for each new participant and potentially existing ones
        for (const pId of newParticipantIds) {
          const newParticipantEntry = updatedChatWithDetails.participants.find(p => p.userId === pId);
          if (newParticipantEntry) {
            pubsub.publish(PARTICIPANT_ADDED, { participantAdded: newParticipantEntry, chatId: chat.id, userId: pId });
            // Also notify the new participant about the chat creation if they weren't already in it
            pubsub.publish(CHAT_CREATED, { chatCreated: updatedChatWithDetails, userId: pId });
          }
        }

        return updatedChatWithDetails;
      } catch (error) {
        await transaction.rollback();
        console.error('Error adding participants to chat:', error);
        throw new ApolloError('Failed to add participants to chat', 'ADD_PARTICIPANTS_FAILED', { originalError: error });
      }
    },

    markMessagesAsRead: async (_, { chatId }, context) => {
      const currentUser = checkAuth(context);
      const transaction = await sequelize.transaction();
      try {
        // Verify user is a participant of the chat
        const participant = await ChatParticipant.findOne({
          where: { chatId, userId: currentUser.id },
          transaction,
        });

        if (!participant) {
          throw new AuthenticationError('You are not a participant of this chat.');
        }

        // Mark all messages in this chat as read for the current user
        // This logic assumes 'isRead' is a per-message flag, not per-user-per-message.
        // If 'isRead' should be per-user, you'd need a separate join table for message reads.
        // For simplicity, we'll just update the lastSeen timestamp.
        // The original controller's markAsSeen implies updating lastSeen.
        await ChatParticipant.update(
          { lastSeen: new Date() },
          { where: { chatId, userId: currentUser.id }, transaction }
        );

        // Optionally, you could mark specific messages as read if 'isRead' was per-user
        // For now, we're focusing on 'lastSeen' as the primary read indicator.
        // If 'isRead' on Message model is a global flag, you'd need to decide when to set it.

        await transaction.commit();
        return true;
      } catch (error) {
        await transaction.rollback();
        console.error('Error marking messages as read:', error);
        throw new ApolloError('Failed to mark messages as read', 'MARK_READ_FAILED', { originalError: error });
      }
    },

    deleteChat: async (_, { id }, context) => {
      const currentUser = checkAuth(context);
      const transaction = await sequelize.transaction();
      try {
        const chatToDelete = await Chat.findByPk(id, { transaction });
        if (!chatToDelete) {
          throw new UserInputError('Chat not found.');
        }

        // Authorization: Only admin or the creator/admin of the chat can delete it
        // For simplicity, let's say only admin can delete any chat, or a chat admin can delete their own group chats.
        const currentUserParticipant = await ChatParticipant.findOne({
            where: { chatId: id, userId: currentUser.id },
            transaction
        });

        const isChatAdmin = currentUserParticipant && currentUserParticipant.role === 'admin';

        if (currentUser.role !== 'admin' && !isChatAdmin) {
            throw new AuthenticationError('You are not authorized to delete this chat.');
        }

        await chatToDelete.destroy({ transaction }); // Soft delete

        await transaction.commit();
        return true;
      } catch (error) {
        await transaction.rollback();
        console.error('Error deleting chat:', error);
        throw new ApolloError('Failed to delete chat', 'CHAT_DELETE_FAILED', { originalError: error });
      }
    },
  },
  //delete
  // In your resolvers.js

  // --- Subscription Resolvers (New - Aligned with your models) ---
  Subscription: {
    messageSent: {
      subscribe: async (_, { chatId }, context) => {
        const currentUser = checkAuth(context); // Auth check during subscription handshake

        const chat = await Chat.findByPk(chatId);
        if (!chat) {
          throw new UserInputError("Chat not found for subscription.");
        }

        // Verify the subscribing user is a participant of the target chat
        const isParticipant = await ChatParticipant.findOne({
          where: { chatId: chat.id, userId: currentUser.id }
        });

        if (!isParticipant) {
          throw new AuthenticationError("You are not authorized to subscribe to this chat's messages.");
        }

        // Return an async iterator for the MESSAGE_SENT event
        return pubsub.asyncIterator(MESSAGE_SENT);
      },
      resolve: (payload, args, context) => {
        // Only send the message if it belongs to the chatId the client subscribed to
        if (payload.chatId === args.chatId) {
          return payload.messageSent;
        }
        return null; // Do not send message if it doesn't match the subscribed chatId
      }
    },
    chatCreated: {
      subscribe: async (_, { userId }, context) => {
        const currentUser = checkAuth(context);
        if (userId && userId !== currentUser.id) {
          throw new AuthenticationError("Not authorized to subscribe to other users' chat creations.");
        }
        // Return an async iterator for the CHAT_CREATED event
        return pubsub.asyncIterator(CHAT_CREATED);
      },
      resolve: (payload, args, context) => {
        // Only send the chat if the current user is the target of the chat creation notification
        if (payload.userId === context.user.id) {
          return payload.chatCreated;
        }
        return null;
      }
    },
    participantAdded: {
      subscribe: async (_, { chatId, userId }, context) => {
        const currentUser = checkAuth(context);
        // Ensure the current user is either the one being added or an existing participant in the chat
        const chat = await Chat.findByPk(chatId, {
          include: [{
            model: ChatParticipant,
            as: 'participants',
            where: { userId: currentUser.id },
            required: false // Don't require current user to be participant to subscribe IF they are the target userId
          }]
        });

        if (!chat) {
          throw new UserInputError("Chat not found for participantAdded subscription.");
        }

        const isCurrentUserParticipant = chat.participants.some(p => p.userId === currentUser.id);

        if (userId && userId === currentUser.id) {
          // Current user is subscribing to their own addition
          return pubsub.asyncIterator(PARTICIPANT_ADDED);
        } else if (isCurrentUserParticipant) {
          // Current user is an existing participant and wants to know about others being added
          return pubsub.asyncIterator(PARTICIPANT_ADDED);
        } else {
          throw new AuthenticationError("Not authorized to subscribe to participant additions in this chat.");
        }
      },
      resolve: (payload, args, context) => {
        // Only send the participant if it matches the subscribed chatId and userId (if specified)
        if (payload.chatId === args.chatId && (!args.userId || payload.userId === args.userId)) {
          return payload.participantAdded;
        }
        return null;
      }
    }
  },
};

module.exports = resolvers;
