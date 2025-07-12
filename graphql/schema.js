const { gql } = require('apollo-server-express');

// Using graphql-scalars for common types like UUID, Date, JSON
// You might need to install: npm install graphql-scalars
// And then include them in your ApolloServer setup (see index.js)
const typeDefs = gql`
  # Scalar types for common data data types
  scalar UUID
  scalar Date
  scalar JSON
  scalar Upload # For file uploads with GraphQL (e.g., for importMarks)

  # --- ENUMS ---
  enum Role {
    admin
    teacher
    student
    parent
  }

  enum Sex {
    MALE
    FEMALE
  }

  enum AssessmentTypeEnum {
    continuous
    endOfTerm
  }

  enum PostType {
    announcement
    event
    general_discussion
  }

  enum PostVisibility {
    public
    private_group
    admin_only
    teachers
    parents
    students
    class_specific
    subject_specific
  }

  enum ChatTypeEnum { # Aligned with your Chat model's type enum
    private
    group
    class
    subject
    public_group # Assuming you meant to add this based on your chatService.ts
  }

  enum ChatParticipantRole { # Aligned with your ChatParticipant model
    admin
    member
  }

  # --- CORE ENTITY TYPES (matching your Sequelize models) ---

  type User {
    id: UUID!
    firstName: String!
    lastName: String!
    username: String!
    email: String
    phone: String
    address: String
    dob: Date
    sex: Sex!
    role: Role!
    profilePhoto: String
    isActive: Boolean!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
    # Relationships (resolved by resolvers)
    parent: Parent
    teacher: Teacher
    student: Student
    admin: Admin
    # New chat relationships (via ChatParticipant)
    chatParticipants: [ChatParticipant!] # Direct link to join table entries
    sentMessages: [Message!] # Messages sent by this user
  }

  type Parent {
    id: UUID!
    parentNumber: String
    userId: UUID!
    user: User! # Nested user details
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Teacher {
    id: UUID!
    staffNumber: String
    qualifications: [String]
    subjects: [String] # Array of subject IDs or names
    userId: UUID!
    user: User!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Admin {
    id: UUID!
    adminNumber: String
    level: String!
    userId: UUID!
    user: User!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type ClassLevel {
    id: UUID!
    name: String!
    level: Int!
    description: String
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Subject {
    id: UUID!
    name: String!
    code: String
    departmentId: UUID
    department: Department
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Department {
    id: UUID!
    name: String!
    hodId: UUID
    hod: Teacher # Head of Department
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type SchoolYear {
    id: UUID!
    name: String!
    startDate: Date!
    endDate: Date!
    description: String
    isCurrent: Boolean!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Term {
    id: UUID!
    tname: String! # Backend uses tname
    startDate: Date!
    endDate: Date!
    schoolYearId: UUID!
    schoolYear: SchoolYear!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Class { # Renamed from Class to avoid keyword conflict
    id: UUID!
    name: String!
    capacity: Int
    supervisorId: UUID
    supervisor: Teacher # Class supervisor
    classLevelId: UUID!
    classLevel: ClassLevel!
    academicYearId: UUID # Link to SchoolYear
    academicYear: SchoolYear
    termId: UUID # Link to Term
    term: Term
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Student {
    id: UUID!
    studentNumber: String
    userId: UUID!
    user: User!
    parentId: UUID!
    parent: Parent!
    alte_guardian_Id: UUID
    alte_guardian: Parent
    currentClassId: UUID
    currentClass: Class
    classLevelId: UUID
    classLevel: ClassLevel
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type AssessmentType {
    id: UUID!
    name: String!
    type: AssessmentTypeEnum!
    weight: Float!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type Assessment {
    id: UUID!
    title: String!
    description: String
    date: Date!
    maxScore: Float!
    assessmentTypeId: UUID!
    assessmentType: AssessmentType!
    subjectId: UUID!
    subject: Subject!
    classId: UUID
    class: Class
    termId: UUID!
    term: Term!
    schoolYearId: UUID!
    schoolYear: SchoolYear!
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
    # Relationship to scores (can be fetched as part of assessment)
    studentScores: [StudentAssessmentScore]
  }

  type StudentAssessmentScore {
    id: UUID!
    studentId: UUID!
    student: Student!
    assessmentId: UUID!
    assessment: Assessment!
    score: Float!
    remarks: String
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  type TeachingAssignment {
    id: UUID!
    subjectId: UUID
    subject: Subject
    teacherId: UUID!
    teacher: Teacher!
    classId: UUID
    class: Class
    termId: UUID
    term: Term
    schoolYearId: UUID!
    schoolYear: SchoolYear!
    isHOD: Boolean
    departmentId: UUID
    department: Department
    createdAt: Date!
    updatedAt: Date!
    deletedAt: Date
  }

  # --- CHAT TYPES (Aligned with your existing models) ---
  type Message {
    id: UUID!
    senderId: UUID!
    sender: User! # Sender user details
    chatId: UUID! # Renamed from chatRoomId to chatId
    chat: Chat! # Associated chat
    content: String!
    isRead: Boolean! # Added as per your previous schema and controller logic
    parentMessageId: UUID # Added for replies
    replies: [Message!] # Nested replies
    createdAt: Date!
    updatedAt: Date!
  }

type Chat { # Renamed from ChatRoom to Chat to align with your model
    id: UUID!
    name: String # For group chats, null for private
    type: ChatTypeEnum! # private, group, class, subject, public_group
    classId: UUID
    class: Class
    subjectId: UUID
    subject: Subject
    participants: [ChatParticipant!]! # Participants in this chat, including their lastSeen
    messages: [Message!] # Recent messages in this chat
    lastMessage: Message # The most recent message
    currentUserLastSeen: Date # <--- ADDED THIS FIELD
    createdAt: Date!
    updatedAt: Date!
  }

  type ChatParticipant { # Aligned with your ChatParticipant model
    chatId: UUID!
    chat: Chat!
    userId: UUID!
    user: User!
    role: ChatParticipantRole! # admin or member
    lastSeen: Date # Timestamp when the user last saw messages
    createdAt: Date!
    updatedAt: Date!
  }

  # --- QUERY TYPE ---
  type Query {
    # Users and Roles
    users(limit: Int, offset: Int, role: Role, isActive: Boolean, search: String): [User!]!
    user(id: UUID!): User
    parents(limit: Int, offset: Int, search: String): [Parent!]!
    parent(id: UUID!): Parent
    teachers(limit: Int, offset: Int, search: String): [Teacher!]!
    teacher(id: UUID!): Teacher
    students(limit: Int, offset: Int, search: String): [Student!]!
    student(id: UUID!): Student
    admins(limit: Int, offset: Int, search: String): [Admin!]!
    admin(id: UUID!): Admin

    # School Entities
    schoolYears(limit: Int, offset: Int, name: String, isCurrent: Boolean): [SchoolYear!]!
    schoolYear(id: UUID!): SchoolYear
    terms(limit: Int, offset: Int, tname: String, schoolYearId: UUID): [Term!]!
    term(id: UUID!): Term
    subjects(limit: Int, offset: Int, name: String, code: String, departmentId: UUID): [Subject!]!
    subject(id: UUID!): Subject
    classLevels: [ClassLevel!]!
    classLevel(id: UUID!): ClassLevel
    classes(limit: Int, offset: Int, name: String, academicYearId: UUID, termId: UUID, classLevelId: UUID, supervisorId: UUID): [Class!]!
    class(id: UUID!): Class

    # Assessments and Marks
    assessmentTypes: [AssessmentType!]!
    assessmentType(id: UUID!): AssessmentType
    assessments(limit: Int, offset: Int, title: String, subjectId: UUID, classId: UUID, termId: UUID, schoolYearId: UUID): [Assessment!]!
    assessment(id: UUID!): Assessment
    studentAssessmentScores(studentId: UUID, assessmentId: UUID): [StudentAssessmentScore!]!

    # Teaching Assignments
    teachingAssignments(teacherId: UUID, subjectId: UUID, classId: UUID, termId: UUID, schoolYearId: UUID, isHOD: Boolean, departmentId: UUID): [TeachingAssignment!]!
    teachingAssignment(id: UUID!): TeachingAssignment

    # Chat Queries (New - Aligned with your models)
    messages(chatId: UUID!): [Message!]! # Fetches messages for a specific chat
    userChats: [Chat!]! # Get all chats for the current user
    chat(id: UUID!): Chat # Get a single chat by ID
    getOrCreatePrivateChat(otherUserId: UUID!): Chat! # For direct messages
    joinablePublicChats: [Chat!]! # Public chats user can join
  }

  # --- INPUT TYPES FOR MUTATIONS ---

  # User & Role Inputs
  input CreateUserInput {
    firstName: String!
    lastName: String!
    username: String!
    email: String!
    password: String!
    phone: String
    address: String
    dob: Date
    sex: Sex!
    role: Role!
    profilePhoto: String
  }

  input UpdateUserInput {
    firstName: String
    lastName: String
    username: String
    email: String
    phone: String
    address: String
    dob: Date
    sex: Sex
    profilePhoto: String
    isActive: Boolean
  }

  input CreateTeacherInput {
    userId: UUID!
    staffNumber: String
    qualifications: [String]
    subjects: [String]
  }

  input UpdateTeacherInput {
    staffNumber: String
    qualifications: [String]
    subjects: [String]
  }

  input CreateStudentInput {
    userId: UUID!
    parentId: UUID!
    studentNumber: String
    alte_guardian_Id: UUID
    currentClassId: UUID
    classLevelId: UUID
  }

  input UpdateStudentInput {
    parentId: UUID
    studentNumber: String
    alte_guardian_Id: UUID
    currentClassId: UUID
    classLevelId: UUID
  }

  input CreateParentInput {
    userId: UUID!
    parentNumber: String
  }

  input UpdateParentInput {
    parentNumber: String
  }

  input CreateAdminInput {
    userId: UUID!
    adminNumber: String
    level: String!
  }

  input UpdateAdminInput {
    adminNumber: String
    level: String
  }


  # School Entity Inputs
  input CreateSchoolYearInput {
    name: String!
    startDate: Date!
    endDate: Date!
    description: String
    isCurrent: Boolean
  }

  input UpdateSchoolYearInput {
    name: String
    startDate: Date
    endDate: Date
    description: String
    isCurrent: Boolean
  }

  input CreateTermInput {
    tname: String!
    startDate: Date!
    endDate: Date!
    schoolYearId: UUID!
  }

  input UpdateTermInput {
    tname: String
    startDate: Date
    endDate: Date
    schoolYearId: UUID
  }

  input CreateSubjectInput {
    name: String!
    code: String
    departmentId: UUID
  }

  input UpdateSubjectInput {
    name: String
    code: String
    departmentId: UUID
  }

  input CreateClassLevelInput {
    name: String!
    level: Int!
    description: String
  }

  input UpdateClassLevelInput {
    name: String
    level: Int
    description: String
  }

  input CreateClassInput {
    name: String!
    capacity: Int
    supervisorId: UUID
    classLevelId: UUID!
    academicYearId: UUID
    termId: UUID
  }

  input UpdateClassInput {
    name: String
    capacity: Int
    supervisorId: UUID
    classLevelId: UUID
    academicYearId: UUID
    termId: UUID
  }

  # Assessment and Marks Inputs
  input CreateAssessmentTypeInput {
    name: String!
    type: AssessmentTypeEnum!
    weight: Float!
  }

  input UpdateAssessmentTypeInput {
    name: String
    type: AssessmentTypeEnum
    weight: Float
  }

  input CreateAssessmentInput {
    title: String!
    description: String
    date: Date!
    maxScore: Float!
    assessmentTypeId: UUID!
    subjectId: UUID!
    classId: UUID
    termId: UUID!
    schoolYearId: UUID!
  }

  input UpdateAssessmentInput {
    title: String
    description: String
    date: Date
    maxScore: Float
    assessmentTypeId: UUID
    subjectId: UUID
    classId: UUID
    termId: UUID
    schoolYearId: UUID
  }

  input CreateStudentAssessmentScoreInput {
    studentId: UUID!
    assessmentId: UUID!
    score: Float!
    remarks: String
  }

  input UpdateStudentAssessmentScoreInput {
    score: Float
    remarks: String
  }

  input ScoreInput { # For bulk import
    studentId: UUID!
    score: Float
    remarks: String
  }

  # Teaching Assignment Inputs
  input CreateTeachingAssignmentInput {
    teacherId: UUID!
    subjectId: UUID
    classId: UUID
    termId: UUID
    schoolYearId: UUID!
    isHOD: Boolean
    departmentId: UUID
  }

  input UpdateTeachingAssignmentInput {
    subjectId: UUID
    classId: UUID
    termId: UUID
    schoolYearId: UUID
    isHOD: Boolean
    departmentId: UUID
  }

  # Chat Inputs (New - Aligned with your models)
  input SendMessageInput {
    chatId: UUID! # Renamed from chatRoomId to chatId
    content: String!
    parentMessageId: UUID # Added for replies
  }
  

  input CreateChatInput { # Renamed from CreateChatRoomInput to CreateChatInput
    type: ChatTypeEnum! # private, group, class, subject, public_group
    participants: [UUID!] # IDs of users to include (for private/group)
    name: String # Optional name for group chats
    classId: UUID # For class chats
    subjectId: UUID # For subject chats
  }

  input AddParticipantsInput { # New input for adding participants
    chatId: UUID!
    userIds: [UUID!]!
  }

  # --- MUTATION TYPE ---
  type Mutation {
    # User & Role Mutations
    createUser(input: CreateUserInput!): User!
    updateUser(id: UUID!, input: UpdateUserInput!): User!
    deleteUser(id: UUID!): Boolean!
    restoreUser(id: UUID!): Boolean!

    createTeacher(input: CreateTeacherInput!): Teacher!
    updateTeacher(id: UUID!, input: UpdateTeacherInput!): Teacher!
    deleteTeacher(id: UUID!): Boolean!

    createStudent(input: CreateStudentInput!): Student!
    updateStudent(id: UUID!, input: UpdateStudentInput!): Student!
    deleteStudent(id: UUID!): Boolean!

    createParent(input: CreateParentInput!): Parent!
    updateParent(id: UUID!, input: UpdateParentInput!): Parent!
    deleteParent(id: UUID!): Boolean!

    createAdmin(input: CreateAdminInput!): Admin!
    updateAdmin(id: UUID!, input: UpdateAdminInput!): Admin!
    deleteAdmin(id: UUID!): Boolean!

    # School Entity Mutations
    createSchoolYear(input: CreateSchoolYearInput!): SchoolYear!
    updateSchoolYear(id: UUID!, input: UpdateSchoolYearInput!): SchoolYear!
    deleteSchoolYear(id: UUID!): Boolean!
    restoreSchoolYear(id: UUID!): Boolean!

    createTerm(input: CreateTermInput!): Term!
    updateTerm(id: UUID!, input: UpdateTermInput!): Term!
    deleteTerm(id: UUID!): Boolean!
    restoreTerm(id: UUID!): Boolean!

    createSubject(input: CreateSubjectInput!): Subject!
    updateSubject(id: UUID!, input: UpdateSubjectInput!): Subject!
    deleteSubject(id: UUID!): Boolean!
    restoreSubject(id: UUID!): Boolean!

    createClassLevel(input: CreateClassLevelInput!): ClassLevel!
    updateClassLevel(id: UUID!, input: UpdateClassLevelInput!): ClassLevel!
    deleteClassLevel(id: UUID!): Boolean! # Soft delete for ClassLevel?

    createClass(input: CreateClassInput!): Class!
    updateClass(id: UUID!, input: UpdateClassInput!): Class!
    deleteClass(id: UUID!): Boolean!
    restoreClass(id: UUID!): Boolean!

    # Assessment and Marks Mutations
    createAssessmentType(input: CreateAssessmentTypeInput!): AssessmentType!
    updateAssessmentType(id: UUID!, input: UpdateAssessmentTypeInput!): AssessmentType!
    deleteAssessmentType(id: UUID!): Boolean!

    createAssessment(input: CreateAssessmentInput!): Assessment!
    updateAssessment(id: UUID!, input: UpdateAssessmentInput!): Assessment!
    deleteAssessment(id: UUID!): Boolean!

    createStudentAssessmentScore(input: CreateStudentAssessmentScoreInput!): StudentAssessmentScore!
    updateStudentAssessmentScore(id: UUID!, input: UpdateStudentAssessmentScoreInput!): StudentAssessmentScore!
    deleteStudentAssessmentScore(id: UUID!): Boolean!
    
    # Bulk import marks (can be a mutation, but file upload is usually handled via REST for simplicity)
    # importMarks(file: Upload!, assessmentId: UUID!): JSON # Example for file upload via GraphQL

    # Teaching Assignment Mutations
    createTeachingAssignment(input: CreateTeachingAssignmentInput!): TeachingAssignment!
    updateTeachingAssignment(id: UUID!, input: UpdateTeachingAssignmentInput!): TeachingAssignment!
    deleteTeachingAssignment(id: UUID!): Boolean!

    # Chat Mutations (New - Aligned with your models and controller)
    sendMessage(input: SendMessageInput!): Message!
    createChat(input: CreateChatInput!): Chat! # Renamed to createChat
    addParticipantsToChat(input: AddParticipantsInput!): Chat! # New mutation for adding participants
    markMessagesAsRead(id: UUID!): Boolean # Mark all unread messages in a chat as read for the current user
    deleteChat(id: UUID!): Boolean!
   deleteMessage(id: UUID!): Boolean!
  }

  # --- SUBSCRIPTION TYPE ---
  type Subscription {
    messageSent(chatId: UUID!): Message! # Subscribe to new messages in a specific chat
    chatCreated(userId: UUID!): Chat! # Notify user when they are added to a new chat
    participantAdded(chatId: UUID!, userId: UUID!): ChatParticipant! # Notify when a participant is added
  }
`;

module.exports = typeDefs;
