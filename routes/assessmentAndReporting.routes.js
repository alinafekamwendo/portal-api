// backend/routes/assessmentAndReporting.routes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const assessmentReportingController = require("../controllers/assementReportingController"); // New controller
const markingController = require('../controllers/markingController'); // Adjust path
const multer = require("multer");

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(), // Store file in memory as a buffer
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
});
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
router.get(
    '/marking/template/:assessmentId',
    authenticate,
    authorize(['admin', 'teacher']),
    markingController.generateMarkingTemplate
);

// Route to import marks from an Excel file
// Accessible by admin or teacher
router.post(
    '/marking/import',
    authenticate,
    authorize(['admin', 'teacher']),
    upload.single('file'), // 'file' is the field name for the uploaded file
    markingController.importMarks
);

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
