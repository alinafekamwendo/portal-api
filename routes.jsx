const express = require("express");
const {
  createAdmin,
  getAllAdmins,
  getAdminById,
  getAdminByUserId,
  updateAdmin,
  deleteAdmin,
  restoreAdmin,
  promoteToSuperAdmin,
  demoteToRegularAdmin,
} = require("../controllers/adminController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all admin routes
router.use(authenticate);

// Admin management routes
router.get(
  "/admins",
  authorize(["admin"]), // Only admins can access
  getAllAdmins
);

router.get(
  "/admins/:id",
  authorize(["admin"]), // Only admins can access
  getAdminById
);

router.get(
  "/user/:userId",
  authorize(["admin"]), // Only admins can access
  getAdminByUserId
);

router.put(
  "/admins/:id",
  authorize(["admin"]), // Only admins can modify
  updateAdmin
);

router.delete(
  "/admins/:id",
  authorize(["admin"]), // Only super admins can delete
  deleteAdmin
);

router.post(
  "/admins/:id/restore",
  authorize(["admin"]), // Only super admins can restore
  restoreAdmin
);

// Admin promotion/demotion routes
router.post(
  "/admins/:id/promote",
  authorize(["admin"]), // Only super admins can promote
  promoteToSuperAdmin
);

router.post(
  "/admins/:id/demote",
  authorize(["admin"]), // Only super admins can demote
  demoteToRegularAdmin
);

module.exports = router;
// backend/routes/assessmentAndReporting.routes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const assessmentReportingController = require("../controllers/assementReportingController"); // New controller

router.use(authenticate); // All routes below this line require authentication

// --- Assessment Type Routes (Admin/Teacher) ---
router.post("/assessment-types", authorize(["admin"]), assessmentReportingController.createAssessmentType);
router.get("/assessment-types", assessmentReportingController.getAllAssessmentTypes);
router.get("/assessment-types/:id", assessmentReportingController.getAssessmentTypeById);
router.put("/assessment-types/:id", authorize(["admin"]), assessmentReportingController.updateAssessmentType);
router.delete("/assessment-types/:id", authorize(["admin"]), assessmentReportingController.deleteAssessmentType);

// --- Assessment Routes (Teacher/Admin for CRUD) ---
router.post("/assessments", authorize(["admin", "teacher"]), assessmentReportingController.createAssessment);
router.get("/assessments", assessmentReportingController.getAllAssessments); // Get all assessments (can be filtered by query params)
router.get("/assessments/:id", assessmentReportingController.getAssessmentById);
router.put("/assessments/:id", authorize(["admin", "teacher"]), assessmentReportingController.updateAssessment);
router.delete("/assessments/:id", authorize(["admin", "teacher"]), assessmentReportingController.deleteAssessment);

// --- Student Assessment Scores (Marking - Teacher/Admin) ---
// Get students and their scores for a specific assessment (for marking UI)
router.get("/assessments/:assessmentId/student-scores", authorize(["admin", "teacher"]), assessmentReportingController.getStudentScoresForAssessment);
// Submit/Update scores for multiple students for an assessment (bulk marking)
router.post("/assessments/:assessmentId/student-scores", authorize(["admin", "teacher"]), assessmentReportingController.submitStudentScores);
// Update a single student's score for an assessment
router.put("/student-scores/:id", authorize(["admin", "teacher"]), assessmentReportingController.updateSingleStudentScore);

// --- Academic Records (End-of-Term Results - Teacher/Admin) ---
// Create/Update a student's final end-of-term academic record for a subject
router.post("/academic-records", authorize(["admin", "teacher"]), assessmentReportingController.createAcademicRecord);
router.put("/academic-records/:id", authorize(["admin", "teacher"]), assessmentReportingController.updateAcademicRecord);
// Get a student's academic records for a specific term/year (for teachers/admins to review)
router.get("/students/:studentId/academic-records/:academicYearId/:termId", authorize(["admin", "teacher"]), assessmentReportingController.getStudentAcademicRecordsForTerm);
// Publish/Unpublish an academic record (make it visible for reports)
router.patch("/academic-records/:id/publish", authorize(["admin", "teacher"]), assessmentReportingController.publishAcademicRecord);
router.patch("/academic-records/:id/unpublish", authorize(["admin", "teacher"]), assessmentReportingController.unpublishAcademicRecord);

// --- Reporting Routes ---
// Get student's academic summary (all published academic records)
router.get("/students/:studentId/academic-summary", authorize(["admin", "teacher", "student", "parent"]), assessmentReportingController.getStudentAcademicSummary);
// Get student performance report data (for PDF generation, only published data)
router.get("/reports/student/:studentId/:academicYearId/:termId", authorize(["admin", "teacher", "parent", "student"]), assessmentReportingController.getStudentPerformanceReport);
// Generate student performance report PDF
router.get("/reports/student/:studentId/:academicYearId/:termId/pdf", authorize(["admin", "teacher", "parent", "student"]), assessmentReportingController.generateStudentReportPdf);

// Admin/Teacher Reports (Overview, Class Performance, Subject Results)
router.get("/reports/admin/overview", authorize(["admin"]), assessmentReportingController.getAdminOverviewReport);
router.get("/reports/class-performance/:academicYearId/:termId", authorize(["admin", "teacher"]), assessmentReportingController.getClassPerformanceReport);
router.get("/reports/teacher/:teacherId/subject-results/:subjectId/:academicYearId/:termId", authorize(["admin", "teacher"]), assessmentReportingController.getTeacherSubjectResults);

// --- Student Promotion (Admin only, based on Term 3 results) ---
router.post("/students/:studentId/promote", authorize(["admin"]), assessmentReportingController.promoteStudent);

module.exports = router;
const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const chatController = require("../controllers/chatController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const rateLimit = require("express-rate-limit");
const postController = require('../controllers/postController');


// Validation rules
const createChatValidation = [
  check("type")
    .isIn(["private", "group", "class", "subject"])
    .withMessage("Invalid chat type"),
  check("participants").isArray().withMessage("Participants must be an array"),
  check("participants.*")
    .isUUID()
    .withMessage("Invalid user ID in participants"),
  check("classId")
    .optional()
    .isUUID()
    .withMessage("Valid class ID required")
    .custom((value, { req }) => {
      if (req.body.type === "class" && !value) {
        throw new Error("Class ID is required for class chats");
      }
      return true;
    }),
  check("subjectId")
    .optional()
    .isUUID()
    .withMessage("Valid subject ID required")
    .custom((value, { req }) => {
      if (req.body.type === "subject" && !value) {
        throw new Error("Subject ID is required for subject chats");
      }
      return true;
    }),
  check("name")
    .optional()
    .isString()
    .withMessage("Name must be a string")
    .custom((value, { req }) => {
      if (req.body.type !== "private" && !value) {
        throw new Error("Name is required for non-private chats");
      }
      return true;
    })
];

const privateChatValidation = [
  check("userId").isUUID().withMessage("Valid user ID required"),
  check("otherUserId").isUUID().withMessage("Valid participant ID required")
];

const addParticipantsValidation = [
  check("chatId").isUUID().withMessage("Valid chat ID required"),
  check("participants").isArray({ min: 1 }).withMessage("Participants must be a non-empty array"),
  check("participants.*").isUUID().withMessage("Invalid user ID in participants")
];



const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 chat operations per window
});

router.post("/chats", authenticate, chatLimiter, createChatValidation, chatController.createChat);

router.get(
  "/chats/user/:userId",
  authenticate,
  [check("userId").isUUID().withMessage("Valid user ID required")],
  chatController.getUserChats
);

router.get(
  "/chats/user/:userId/preview",
  authenticate,
  [check("userId").isUUID().withMessage("Valid user ID required")],
  chatController.getUserChatsWithLastMessage
);

router.post(
  "/chats/add-participants",
  authenticate,
  addParticipantsValidation,
  chatController.addParticipants
);
router.post('/chats/private',authenticate, chatController.getOrCreatePrivateChat);
router.post('/chats/:chatId/join', authenticate, chatController.joinPublicChat); // New route
router.get('/chats/public/joinable', authenticate, chatController.getJoinablePublicChats); // New route for discovering public chats
// routes for posts

router.get("/posts/", authenticate, postController.getPosts); // Get all posts, accessible to authenticated users
router.post("/posts", authenticate, authorize(['admin']), postController.createPost); // Only admin can create posts
router.post("/posts/:postId/comments", authenticate, postController.createComment); // Create a comment on a post



module.exports = router;
const express = require('express');
const router = express.Router();
const {
  createParent,
  getParents,
  getParentById,
  updateParent,
  deleteParent,
} = require('../controllers/parentController');
const { authenticate,authorize } =require('../middlewares/authMiddleware');
/**
 * @route POST /api/parents
 * @desc Create a new parent and associated user account
 * @access Public (or Restricted based on your auth strategy, e.g., Admin)
 */
router.post(
  '/',
  // Add validation middleware here, e.g., validateParentCreation,
  createParent
);

/**
 * @route GET /api/parents
 * @desc Get all parents with associated user information
 * @access Public (or Restricted)
 */
router.get('/',authenticate,authorize(["admin"]), getParents);

/**
 * @route GET /api/parents/:id
 * @desc Get a single parent by ID with associated user information
 * @access Public (or Restricted)
 */
router.get('/:id',authenticate,authorize(["admin","parent"]), getParentById);

/**
 * @route PUT /api/parents/:id
 * @desc Update parent and associated user information by ID
 * @access Restricted (e.g., Admin or the parent themselves)
 */
router.put(
    '/:id',
    authenticate,authorize(["admin","parent"]),
  // Add validation middleware here, e.g., validateParentUpdate,
  updateParent
);

/**
 * @route DELETE /api/parents/:id
 * @desc Delete a parent and associated user account by ID
 * @access Restricted (e.g., Admin)
 */
router.delete('/:id',authenticate,authorize(["admin","parent"]) ,deleteParent);

module.exports = router;
// backend/routes/schoolSetup.routes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const schoolSetupController = require("../controllers/schoolSetupController"); // New controller
const authController = require("../controllers/authController"); // Existing auth controller

// --- Public Routes (Authentication not strictly required for all, but common for login/signup) ---
router.post("/auth/signup", authController.createUser);
router.post("/auth/login", authController.loginUser);
router.post("/auth/refresh-token", authController.refreshToken); // Delete user account
router.post("/auth/logout", authController.logout);
router.get("/uploads/profilephotos/:filename", authController.serveProfilePhoto); // To serve profile pictures

// --- Authenticated Routes (require valid JWT) ---
router.use(authenticate); // All routes below this line require authentication

// User Management (General)
router.get("/auth/users", authorize(["admin", "teacher", "parent", "student"]), authController.getAllUsers);
router.get("/auth/users/current", authController.getCurrentUser); // Get details of the currently logged-in user
router.get("/auth/users/:id", authorize(["admin", "teacher", "parent", "student"]), authController.getUserById);
router.put("/auth/users/:id", authorize(["admin", "teacher", "parent", "student"]), authController.updateUser);
router.delete("/auth/users/:id", authorize(["admin"]), authController.deleteUser);
router.post("/auth/users/:id/restore", authorize(["admin"]), authController.restoreUser);
router.post("/auth/users/validate-profile-pictures", authorize(["admin"]), authController.validateProfilePictures); // Admin utility

// School Year Routes (Admin only)
router.post("/school-years", authorize(["admin"]), schoolSetupController.createSchoolYear);
router.get("/school-years", schoolSetupController.getAllSchoolYears); // Accessible to all authenticated users
router.get("/school-years/:id", schoolSetupController.getSchoolYearById);
router.put("/school-years/:id", authorize(["admin"]), schoolSetupController.updateSchoolYear);
router.delete("/school-years/:id", authorize(["admin"]), schoolSetupController.deleteSchoolYear);

// Term Routes (Admin only for CRUD)
router.post("/terms", authorize(["admin"]), schoolSetupController.createTerm);
router.get("/terms", schoolSetupController.getAllTerms); // Accessible to all authenticated users
router.get("/terms/:id", schoolSetupController.getTermById);
router.put("/terms/:id", authorize(["admin"]), schoolSetupController.updateTerm);
router.delete("/terms/:id", authorize(["admin"]), schoolSetupController.deleteTerm);

// Class Level (Grade) Routes (Admin only for CRUD)
router.post("/class-levels", authorize(["admin"]), schoolSetupController.createClassLevel);
router.get("/class-levels", schoolSetupController.getAllClassLevels); // Accessible to all authenticated users
router.get("/class-levels/:id", schoolSetupController.getClassLevelById);
router.put("/class-levels/:id", authorize(["admin"]), schoolSetupController.updateClassLevel);
router.delete("/class-levels/:id", authorize(["admin"]), schoolSetupController.deleteClassLevel);

// Class Routes (Admin/Teacher)
router.post("/classes", authorize(["admin"]), schoolSetupController.createClass);
router.get("/classes", schoolSetupController.getAllClasses); // Accessible to all authenticated users
router.get("/classes/:id", schoolSetupController.getClassById);
router.put("/classes/:id", authorize(["admin", "teacher"]), schoolSetupController.updateClass);
router.delete("/classes/:id", authorize(["admin"]), schoolSetupController.deleteClass);
router.get("/classes/:id/assignments", schoolSetupController.getClassAssignments); // Get teaching assignments for a class
router.get("/classes/:id/schedule", schoolSetupController.getClassSchedule); // Get lesson schedule for a class

// Subject Routes (Admin only for CRUD)
router.post("/subjects", authorize(["admin"]), schoolSetupController.createSubject);
router.get("/subjects", schoolSetupController.getAllSubjects); // Accessible to all authenticated users
router.get("/subjects/:id", schoolSetupController.getSubjectById); // New: get subject by ID
router.put("/subjects/:id", authorize(["admin"]), schoolSetupController.updateSubject);
router.delete("/subjects/:id", authorize(["admin"]), schoolSetupController.deleteSubject);

// Department Routes (Admin only for CRUD)
router.post("/departments", authorize(["admin"]), schoolSetupController.createDepartment);
router.post("/departments/assign-hod", authorize(["admin"]), schoolSetupController.assignHOD);
router.get("/departments", schoolSetupController.getAllDepartments); // Accessible to all authenticated users
router.get("/departments/:id", schoolSetupController.getDepartmentById); // New: get department by ID
router.put("/departments/:id", authorize(["admin"]), schoolSetupController.updateDepartment);
router.delete("/departments/:id", authorize(["admin"]), schoolSetupController.deleteDepartment);

// Teaching Assignments (Admin/Teacher)
router.post("/teaching-assignments", authorize(["admin", "teacher"]), schoolSetupController.createTeachingAssignment);
router.get("/teaching-assignments", authorize(["admin", "teacher"]), schoolSetupController.getAllTeachingAssignments);
router.get("/teaching-assignments/:id", authorize(["admin", "teacher"]), schoolSetupController.getTeachingAssignmentById);
router.put("/teaching-assignments/:id", authorize(["admin", "teacher"]), schoolSetupController.updateTeachingAssignment);
router.delete("/teaching-assignments/:id", authorize(["admin", "teacher"]), schoolSetupController.deleteTeachingAssignment);
router.post("/teachers/:teacherId/assign-duties", authorize(["admin", "teacher"]), schoolSetupController.assignTeacherDuties); // For assigning HOD/Supervisor/Teaching duties

module.exports = router;
// routes/setting.routes.js
const express = require('express');
const {
  getAllSettings,
  getSettingByKey,
  createSetting,
  updateSetting,
  deleteSetting,
} = require('../controllers/settingController.js'); // CommonJS import
const { authenticate, authorize } = require('../middlewares/authMiddleware.js'); // CommonJS import

const router = express.Router();

// All setting operations should typically be restricted to administrators
router.get('/', authenticate, authorize(['admin']), getAllSettings);
router.get('/:key', authenticate, authorize(['admin']), getSettingByKey);
router.post('/', authenticate, authorize(['admin']), createSetting);
router.put('/:key', authenticate, authorize(['admin']), updateSetting);
router.delete('/:key', authenticate, authorize(['admin']), deleteSetting);

module.exports = router; // CommonJS export
const express = require("express");
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticate, authorize } = require("../middlewares/authMiddleware");


// Student CRUD operations (existing)
router.post("/", authenticate, authorize(["admin"]), studentController.createStudent);
router.get("/", authenticate, authorize(["admin", "teacher"]), studentController.getAllStudents);
router.get("/:id", authenticate, authorize(["admin", "teacher", "student", "parent"]), studentController.getStudentById);
router.put("/:id", authenticate, authorize(["admin"]), studentController.updateStudent);
router.delete("/:id", authenticate, authorize(["admin"]), studentController.deleteStudent);


// Endpoint to promote a student (modified logic)
router.post("/:studentId/promote", authenticate, authorize(["admin"]), studentController.promoteStudent);

// Endpoint to get student's academic summary (modified to use new model)
router.get("/:studentId/academic-summary", authenticate, authorize(["admin", "teacher", "student", "parent"]), studentController.getAcademicSummary);

module.exports = router;    

const express = require("express");
const teacherController = require("../controllers/teacherController");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { check } = require('express-validator');

// Teacher Routes
router.post("/create", authenticate, authorize(["admin"]), teacherController.createTeacher);
router.get("/", authenticate, teacherController.getTeachers);
router.get("/:id/teacher", authenticate, teacherController.getTeacherById);
router.put("/:id/teacher", authenticate, authorize(["admin","teacher"]), teacherController.updateTeacher);
router.delete("/:id/teacher", authenticate, authorize(["admin"]), teacherController.deleteTeacher);
router.get("/:id/assignments", authenticate, teacherController.getTeacherAssignments);
//router.post("/:id/assign-duties", authenticate, authorize(["admin"]), teacherController.assignTeacherDuties);
router.post(
    "/assign-duties/:teacherId",
    authenticate,
    authorize(["admin","teacher"]),
    teacherController.assignTeacherDuties
);

// Department Routes (Keep these here, as they are teacher-related in context of HODs)
router.post("/departments", authenticate, authorize(["admin"]), teacherController.createDepartment);
router.get("/departments", authenticate, teacherController.getAllDepartments);
router.put("/departments/:id", authenticate, authorize(["admin"]), teacherController.updateDepartment);
router.delete("/departments/:id", authenticate, authorize(["admin"]), teacherController.deleteDepartment);

// Subject Routes (Keep these here, as they are teacher-related in context of teaching)
router.post("/subjects", authenticate, authorize(["admin"]), teacherController.createSubject);
router.get("/subjects", authenticate, teacherController.getAllSubjects);
router.put("/subjects/:id", authenticate, authorize(["admin"]), teacherController.updateSubject);
router.delete("/subjects/:id", authenticate, authorize(["admin"]), teacherController.deleteSubject);

module.exports = router;
const express = require("express");
const dotenv = require("dotenv");
const adminRoutes = require("./routes/admin.route.js");
const chatRoutes = require("./routes/chat.routes.js");
const parentsRoutes = require("./routes/common.routes.js")
const schoolSetupRoutes = require("./routes/schoolSetup.routes.js");
const teacherRoutes = require("./routes/teacher.routes.js");
const studentRoutes = require("./routes/student.routes.js");
const assessmentAndReportingRoutes = require("./routes/assessmentAndReporting.routes.js");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const path = require("path");
const db = require("./models");
const cors = require("cors");


// Load environment variables
dotenv.config();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: "http://localhost:3000", // Replace with your frontend URL
    credentials: true, // Allow cookies
  })
);

// Middleware
app.use(logger("dev"));
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
app.use(cookieParser());

// Serve static files from the "uploads" directory
// IMPORTANT: Ensure this path is correct relative to your app.js
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Specific route for profile photos, if desired, or let the above handle it.
// Your authController.js already uses /uploads/profilephotos, so this is consistent.
app.use(
  "/uploads/profilephotos",
  express.static(path.join(__dirname, "uploads/profilephoto"))
);

// API Version
const apiVersion = process.env.API_VERSION || 'api/v1'; // Default to 'api/v1' if not set


// Home route
app.get(`/${apiVersion}`, (req, res) => {
  res.status(200).json({ Message: "Portal API running !!" });
});

// --- Use the new consolidated route files ---
app.use(`/${apiVersion}`, schoolSetupRoutes); // General school setup and user management
app.use(`/${apiVersion}`, assessmentAndReportingRoutes);

// API routes
 app.use(`/${apiVersion}/students`, studentRoutes); // Student management
app.use(`/${apiVersion}/admin`, adminRoutes);
app.use(`/${apiVersion}/teachers`, teacherRoutes);
app.use(`/${apiVersion}/community`, chatRoutes);

app.use(`/${apiVersion}/parents`, parentsRoutes);

                                   // Assessments, marking, and reports

// Home route
app.get(`/${apiVersion}`, (req, res) => {
  res.status(200).json({ Message: "School Portal API running !!" });
});

// Catch-all route for invalid endpoints
app.get("*", (req, res) => {
  res.status(404).json({ Error: "Invalid endpoint,please check" }); // Changed from 401 to 404 for "not found"
});

// Error handler middleware (keep this as is)
app.use((error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;
  const response = {
    message: error.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  };

  if (error.isJoi) {
    return res.status(400).json({
      type: "VALIDATION_ERROR",
      errors: error.details.map((detail) => ({
        field: detail.context.key,
        message: detail.message.replace(/['"]/g, ""),
      })),
    });
  }

  if (error.name === "SequelizeValidationError") {
    return res.status(400).json({
      type: "DATABASE_VALIDATION_ERROR",
      errors: error.errors.map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  console.error(`[${new Date().toISOString()}] Error:`, {
    message: error.message,
    statusCode,
    path: req.path,
    method: req.method,
    stack: error.stack,
  });

  res.status(statusCode).json(response);
});

const port = process.env.PORT || 5000;

// IMPORTANT: Use { alter: true } for development to sync schema changes,
// or remove .sync() entirely if using Sequelize migrations.
db.sequelize.sync({ alter: true }).then(() => { // Consider removing this line if using sequelize-cli migrations
  app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}/${apiVersion}`);
  });
}).catch(err => {
  console.error('Failed to connect to DB or sync models:', err);
  process.exit(1); // Exit process if DB connection fails
});

