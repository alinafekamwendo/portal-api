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
