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

