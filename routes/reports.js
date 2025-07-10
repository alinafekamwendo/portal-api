const express = require("express");
const reportController = require("../controllers/reportsController");
const router = express.Router();
const { authenticate, authorize } = require("../middlewares/authMiddleware");

// Admin Reports
router.get(
  "/admin/overview",
  authenticate,
  reportController.getAdminOverviewReport
);

router.get(
  "/admin/class-performance/:academicYearId/:termId",
  authenticate,
  reportController.getClassPerformanceReport
);

// Teacher Reports
router.get(
  "/teacher/:teacherId/class-performance/:academicYearId/:termId",
  authenticate,
  reportController.getTeacherClassPerformance
);

router.get(
  "/teacher/:teacherId/subject-results/:subjectId/:academicYearId/:termId",
  authenticate,
  reportController.getTeacherSubjectResults
);

// Student/Parent Reports
router.get(
  "/student/:studentId/performance/:academicYearId/:termId",
  authenticate,
  reportController.getStudentPerformanceReport
);

router.get(
  "/student/:studentId/report-pdf/:academicYearId/:termId",
  authenticate,
  reportController.generateStudentReportPdf
);

module.exports = router;