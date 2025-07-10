const { User, Student, Parent, Class,  ClassLevel, Subject, Term, SchoolYear, StudentGrade, AcademicRecord, Department, Teacher } = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const Joi = require("joi");
const { sequelize } = require("../models");
const asyncHandler = require("../middlewares/asyncHandler");


// Validation schemas
const studentSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().min(6).required(),
  address: Joi.string().required(),
  email: Joi.string().email().required(),
  phone: Joi.string().required(),
  sex: Joi.string().valid("MALE", "FEMALE").required(),
  dob: Joi.date().less("now").required(),
  parentId: Joi.string().guid().required(),
  currentClassId: Joi.string().guid().required(),
  alte_guardian_Id: Joi.string().guid().optional()
});

const gradeSchema = Joi.object({
  subjectId: Joi.string().guid().required(),
  termId: Joi.string().guid().required(),
  schoolYearId: Joi.string().guid().required(),
 
});

// Helper function to get full student data
const getFullStudentData = async (studentId) => {
  return await User.findByPk(studentId, {
    attributes: { exclude: ["password"] },
    include: [
      {
        model: Student,
        as: "student",
        include: [
          {
            model: Parent,
            as: "parent",
            attributes: ["parentNumber"]
          },
          {
            model: Parent,
            as: "alternateGuardian",
            attributes: ["parentNumber"]
          },
          {
            model: Class,
            as: "currentClass",
            include: [
              {
                model: Teacher,
                as: "supervisor",
                attributes: ["staffNumber"],
                include: [
                  {
                    model: User,
                    as: "user",
                    attributes: ["firstName", "lastName", "email"]
                  }
                ]
              }
            ]
          },
        ]
      }
    ]
  });
};

// Create a new student with all validations
const createStudent = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Validate request body
    const { error } = studentSchema.validate(req.body, { abortEarly: false });
    if (error) {
      await transaction.rollback();
      const errors = error.details.map(detail => detail.message);
      return res.status(400).json({ errors });
    }

    const { currentClassId, parentId, alte_guardian_Id, ...userData } = req.body;

    // Check class capacity and existence
    const currentClass = await Class.findByPk(currentClassId, { 
      include: [{
        model: Student,
        as: 'students',
        attributes: ['id']
      }],
      transaction
    });

    if (!currentClass) {
      await transaction.rollback();
      return res.status(404).json({ error: "Class not found" });
    }

    if (currentClass.students.length >= currentClass.capacity) {
      await transaction.rollback();
      return res.status(400).json({ error: "Class has reached maximum capacity" });
    }

    // Get the grade from the class
    const level = await ClassLevel.findByPk(currentClass.classLevelId, { transaction });
    if (!level) {
      await transaction.rollback();
      return res.status(404).json({ error: "Level not found for this class" });
    }

    // Check parent exists
    const parent = await Parent.findByPk(parentId, { transaction });
    if (!parent) {
      await transaction.rollback();
      return res.status(404).json({ error: "Parent not found" });
    }


    // Check for existing user
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          { username: userData.username },
          { email: userData.email },
          { phone: userData.phone }
        ]
      },
      transaction
    });

    if (existingUser) {
      await transaction.rollback();
      const errors = [];
      if (existingUser.username === userData.username) errors.push("Username exists");
      if (existingUser.email === userData.email) errors.push("Email exists");
      if (existingUser.phone === userData.phone) errors.push("Phone exists");
      return res.status(400).json({ errors });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create user (student)
    const user = await User.create({
      ...userData,
      password: hashedPassword,
      sex: userData.sex.toUpperCase(),
      role: "student"
    }, { transaction });

    // Generate student number (format: STU-YYYY-XXXX)
    const currentYear = new Date().getFullYear();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const studentNumber = `STU-${currentYear}-${randomNum}`;

    // Create student record
    await Student.create({
      id: user.id,
      userId: user.id,
      parentId,
      currentClassId,
      gradeId: level.id,
      studentNumber,
      alte_guardian_Id: alte_guardian_Id || null
    }, { transaction });

    const newStudent = await getFullStudentData(user.id);
    await transaction.commit();

    // Fetch complete student data
    
    res.status(201).json(newStudent);

  } catch (error) {
    await transaction.rollback();
    console.error("Error creating student:", error);
    res.status(500).json({ error: "Failed to create student" });
  }
});

// Add grade for student with academic record
const addStudentGrade = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { studentId } = req.params;
    const { subjectId, termId, schoolYearId, score, grade } = req.body;

    // Validate request body
    const { error } = gradeSchema.validate(req.body, { abortEarly: false });
    if (error) {
      await transaction.rollback();
      const errors = error.details.map(detail => detail.message);
      return res.status(400).json({ errors });
    }

    // Check student exists and get their class
    const student = await Student.findByPk(studentId, { 
      include: [{
        model: Class,
        as: 'currentClass',
        attributes: ['id']
      }],
      transaction 
    });
    
    if (!student) {
      await transaction.rollback();
      return res.status(404).json({ error: "Student not found" });
    }

    if (!student.currentClassId) {
      await transaction.rollback();
      return res.status(400).json({ error: "Student is not assigned to a class" });
    }

    // Check subject exists and belongs to a department
    const subject = await Subject.findByPk(subjectId, { 
      include: [{
        model: Department,
        as: 'department',
        attributes: ['id', 'name']
      }],
      transaction 
    });
    
    if (!subject) {
      await transaction.rollback();
      return res.status(404).json({ error: "Subject not found" });
    }

    // Check term exists and belongs to school year
    const term = await Term.findByPk(termId, { 
      where: { schoolYearId },
      transaction 
    });
    
    if (!term) {
      await transaction.rollback();
      return res.status(404).json({ error: "Term not found for this school year" });
    }

    // Check school year exists
    const schoolYear = await SchoolYear.findByPk(schoolYearId, { transaction });
    if (!schoolYear) {
      await transaction.rollback();
      return res.status(404).json({ error: "School year not found" });
    }

    // Check if grade already exists for this combination
    const existingGrade = await StudentGrade.findOne({
      where: {
        studentId,
        subjectId,
        termId,
        schoolYearId
      },
      transaction
    });

    if (existingGrade) {
      await transaction.rollback();
      return res.status(400).json({ error: "Grade already exists for this term and subject" });
    }

    // Create grade records in both tables
    const [studentGrade, academicRecord] = await Promise.all([
      StudentGrade.create({
        studentId,
        subjectId,
        termId,
        schoolYearId,
        score,
        grade
      }, { transaction }),
      
      AcademicRecord.create({
        studentId,
        classId: student.currentClassId,
        subjectId,
        termId,
        academicYearId: schoolYearId,
        score,
        grade,
        isPromoted: false
      }, { transaction })
    ]);

    await transaction.commit();

    res.status(201).json({
      studentGrade,
      academicRecord
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Error adding student grade:", error);
    res.status(500).json({ error: "Failed to add student grade" });
  }
});

// Promote student to new class with grade validation
const promoteStudent = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { studentId } = req.params;
    const { newClassId } = req.body;

    // Check student exists and get current class
    const student = await Student.findByPk(studentId, { 
      include: [{
        model: Class,
        as: 'currentClass',
        attributes: ['id', 'gradeId']
      }],
      transaction 
    });
    
    if (!student) {
      await transaction.rollback();
      return res.status(404).json({ error: "Student not found" });
    }

    // Check new class exists and has capacity
    const newClass = await Class.findByPk(newClassId, {
      include: [{
        model: Student,
        as: 'students',
        attributes: ['id']
      }],
      transaction
    });

    if (!newClass) {
      await transaction.rollback();
      return res.status(404).json({ error: "Class not found" });
    }

    if (newClass.students.length >= newClass.capacity) {
      await transaction.rollback();
      return res.status(400).json({ error: "Class has reached maximum capacity" });
    }

    // Check if promotion is valid (next grade level)
    const currentGrade = await ClassLevel.findByPk(student.currentClass.gradeId, { transaction });
    const newGrade = await ClassLevel.findByPk(newClass.gradeId, { transaction });
    
    if (newGrade.level <= currentGrade.level) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: "Invalid promotion - new class must be a higher grade level",
        currentGrade: currentGrade.name,
        newGrade: newGrade.name
      });
    }

    // Check if student has passing grades in all required subjects
    const currentTerm = await Term.findOne({
      where: {
        schoolYearId: { [Op.ne]: null }, // Current active term
        endDate: { [Op.lte]: new Date() }
      },
      order: [['endDate', 'DESC']],
      transaction
    });

    if (!currentTerm) {
      await transaction.rollback();
      return res.status(400).json({ error: "No active term found for promotion" });
    }

    const requiredSubjects = await Subject.findAll({
      where: { departmentId: { [Op.ne]: null } }, // Core subjects
      transaction
    });

    const studentGrades = await StudentGrade.findAll({
      where: { 
        studentId,
        termId: currentTerm.id
      },
      transaction
    });

    // Check if student has grades for all required subjects
    const missingSubjects = requiredSubjects.filter(subject => 
      !studentGrades.some(grade => grade.subjectId === subject.id)
    );

    if (missingSubjects.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: "Student is missing grades for required subjects",
        missingSubjects: missingSubjects.map(s => s.name)
      });
    }

    // Check if student has failing grades
    const failingGrades = studentGrades.filter(grade => 
      parseFloat(grade.grade) < 50.0 // Assuming 50 is passing
    );

    if (failingGrades.length > 0) {
      await transaction.rollback();
      return res.status(400).json({ 
        error: "Student has failing grades and cannot be promoted",
        failingGrades: failingGrades.map(g => ({
          subjectId: g.subjectId,
          grade: g.grade
        }))
      });
    }

    // Update student's class and grade
    await Student.update(
      { 
        currentClassId: newClassId,
        gradeId: newClass.gradeId
      },
      { where: { id: studentId }, transaction }
    );

    // Mark academic records as promoted
    await AcademicRecord.update(
      { isPromoted: trgue },
      { 
        where: { 
          studentId,
          termId: currentTerm.id
        },
        transaction
      }
    );

    await transaction.commit();

    // Return updated student data
    const updatedStudent = await getFullStudentData(studentId);
    res.status(200).json({
      message: "Student promoted successfully",
      student: updatedStudent
    });

  } catch (error) {
    await transaction.rollback();
    console.error("Error promoting student:", error);
    res.status(500).json({ error: "Failed to promote student" });
  }
});

// Get student's academic performance summary
const getAcademicSummary = asyncHandler(async (req, res) => {
  try {
    const { studentId } = req.params;

    // Check student exists
    const student = await Student.findByPk(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Get all academic records grouped by school year and term
    const academicRecords = await AcademicRecord.findAll({
      where: { studentId },
      include: [
        {
          model: Subject,
          attributes: ['id', 'name', 'code']
        },
        {
          model: Term,
          attributes: ['id', 'tname', 'startDate', 'endDate']
        },
        {
          model: SchoolYear,
          attributes: ['id', 'year', 'description']
        },
        {
          model: Class,
          attributes: ['id', 'name'],
          include: [
            {
              model: ClassLevel,
              attributes: ['id', 'name', 'level']
            }
          ]
        }
      ],
      order: [
        [{ model: SchoolYear, as: 'schoolYear' }, 'startDate', 'DESC'],
        [{ model: Term, as: 'term' }, 'startDate', 'DESC']
      ]
    });

    // Calculate overall performance
    const totalSubjects = academicRecords.length;
    const passedSubjects = academicRecords.filter(r => parseFloat(r.grade) >= 50.0).length;
    const averageScore = totalSubjects > 0 
      ? academicRecords.reduce((sum, r) => sum + parseFloat(r.score), 0) / totalSubjects
      : 0;

    res.status(200).json({
      studentId,
      totalSubjects,
      passedSubjects,
      averageScore: averageScore.toFixed(2),
      records: academicRecords
    });
  } catch (error) {
    console.error("Error fetching academic summary:", error);
    res.status(500).json({ error: "Failed to fetch academic summary" });
  }
});

// Get all students in a class with their details
const getStudentsByClass = asyncHandler(async (req, res) => {
  try {
    const { classId } = req.params;

    // Check class exists
    const classExists = await Class.findByPk(classId);
    if (!classExists) {
      return res.status(404).json({ error: "Class not found" });
    }

    const students = await Student.findAll({
      where: { currentClassId: classId },
      include: [
        {
          model: User,
          as: "user",
          attributes: { exclude: ["password"] }
        },
        {
          model: Parent,
          as: "parent",
          attributes: ["parentNumber"]
        },
        {
          model: ClassLevel,
          as: "grade",
          attributes: ["id", "name", "level"]
        }
      ],
      order: [
        [{ model: User, as: 'user' }, 'lastName', 'ASC'],
        [{ model: User, as: 'user' }, 'firstName', 'ASC']
      ]
    });

    res.status(200).json({
      classId,
      className: classExists.name,
      studentCount: students.length,
      students
    });
  } catch (error) {
    console.error("Error fetching students by class:", error);
    res.status(500).json({ error: "Failed to fetch students by class" });
  }
});

// Get all students with their details
const getAllStudents = asyncHandler(async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: "student" },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Student,
          as: "student",
          include: [
            {
              model: Parent,
              as: "parent",
              attributes: ["parentNumber"]
            },
            {
              model: Class,
              as: "currentClass",
              attributes: ["id", "name", "grade"]
            }
          ]
        }
      ]
    });

    res.status(200).json(students);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

// Get a single student by ID
const getStudentById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const student = await User.findByPk(id, {
      where: { role: "student" },
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Student,
          as: "student",
          include: [
            {
              model: Parent,
              as: "parent",
              attributes: ["parentNumber"]
            },
            {
              model: Parent,
              as: "alternateGuardian",
              attributes: ["parentNumber"]
            },
            {
              model: Class,
              as: "currentClass",
              attributes: ["id", "name", "grade"]
            }
          ]
        }
      ]
    });

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.status(200).json(student);
  } catch (error) {
    console.error("Error fetching student:", error);
    res.status(500).json({ error: "Failed to fetch student" });
  }
});

// Update a student
const updateStudent = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { parentId, currentClassId, alte_guardian_Id, ...userData } = req.body;

    // Find the student
    const student = await Student.findByPk(id, { transaction });
    if (!student) {
      await transaction.rollback();
      return res.status(404).json({ error: "Student not found" });
    }

    // Validate parent if provided
    if (parentId) {
      const parent = await Parent.findByPk(parentId, { transaction });
      if (!parent) {
        await transaction.rollback();
        return res.status(404).json({ error: "Parent not found" });
      }
    }

    // Validate alternate guardian if provided
    if (alte_guardian_Id) {
      const altGuardian = await Parent.findByPk(alte_guardian_Id, { transaction });
      if (!altGuardian) {
        await transaction.rollback();
        return res.status(404).json({ error: "Alternate guardian not found" });
      }
    }

    // Validate class if provided
    if (currentClassId) {
      const classExists = await Class.findByPk(currentClassId, { transaction });
      if (!classExists) {
        await transaction.rollback();
        return res.status(404).json({ error: "Class not found" });
      }
    }

    // Update user data
    if (Object.keys(userData).length > 0) {
      if (userData.password) {
        userData.password = await bcrypt.hash(userData.password, 10);
      }
      
      await User.update(userData, {
        where: { id },
        transaction
      });
    }

    // Update student data
    const studentUpdateData = {};
    if (parentId) studentUpdateData.parentId = parentId;
    if (currentClassId) studentUpdateData.currentClassId = currentClassId;
    if (alte_guardian_Id !== undefined) {
      studentUpdateData.alte_guardian_Id = alte_guardian_Id || null;
    }

    if (Object.keys(studentUpdateData).length > 0) {
      await Student.update(studentUpdateData, {
        where: { id },
        transaction
      });
    }

    await transaction.commit();

    // Fetch updated student
    const updatedStudent = await User.findByPk(id, {
      attributes: { exclude: ["password"] },
      include: [
        {
          model: Student,
          as: "student",
          include: [
            {
              model: Parent,
              as: "parent",
              attributes: ["parentNumber"]
            },
            {
              model: Class,
              as: "currentClass",
              attributes: ["id", "name", "grade"]
            }
          ]
        }
      ]
    });

    res.status(200).json(updatedStudent);

  } catch (error) {
    await transaction.rollback();
    console.error("Error updating student:", error);
    res.status(500).json({ error: "Failed to update student" });
  }
});

// Delete a student
const deleteStudent = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    // Delete student record first
    await Student.destroy({
      where: { id },
      transaction
    });

    // Then delete the user
    await User.destroy({
      where: { id },
      transaction
    });

    await transaction.commit();
    res.status(200).json({ message: "Student deleted successfully" });

  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting student:", error);
    res.status(500).json({ error: "Failed to delete student" });
  }
});
// Get student grades
const getStudentGrades = asyncHandler(async (req, res) => {
  try {
    const { studentId } = req.params;

    // Check student exists
    const student = await Student.findByPk(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const grades = await StudentGrade.findAll({
      where: { studentId },
      include: [
        {
          model: Subject,
          attributes: ['id', 'name', 'code']
        },
        {
          model: Term,
          attributes: ['id', 'name', 'startDate', 'endDate']
        },
        {
          model: SchoolYear,
          attributes: ['id', 'year', 'description']
        }
      ],
      order: [
        ['schoolYearId', 'DESC'],
        ['termId', 'DESC']
      ]
    });

    res.status(200).json(grades);
  } catch (error) {
    console.error("Error fetching student grades:", error);
    res.status(500).json({ error: "Failed to fetch student grades" });
  }
});

// Export all controller methods
module.exports = {
  createStudent,
  addStudentGrade,
  getStudentGrades,
  promoteStudent,
  createStudent,
  getAllStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  getStudentsByClass,
  getAcademicSummary,
  getStudentsByClass,
};