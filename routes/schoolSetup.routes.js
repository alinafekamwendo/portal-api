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
router.get("/get-school-terms/:schoolYearId", schoolSetupController.getSchoolTerms)
router.get("/terms/:termId/classes/", schoolSetupController.getClassesByTerm)


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
