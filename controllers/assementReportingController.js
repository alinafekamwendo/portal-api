// backend/controllers/assessmentReportingController.js
const {
  AssessmentType,
  Assessment,
  StudentAssessmentScore,
  AcademicRecord,
  User,
  Student,
  Subject,
  Class,
  Term,
  SchoolYear,
  Teacher,
  Parent, // Assuming Parent model is available for guardians
  sequelize,
} = require("../models");
const { Op } = require('sequelize')
const asyncHandler = require("../middlewares/asyncHandler");

const puppeteer = require('puppeteer'); // For PDF generation
const Joi = require("joi"); // Import Joi for validation

// --- Joi Validation Schemas ---

// Schema for AssessmentType creation and update
const assessmentTypeSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Assessment type name cannot be empty.",
    "string.min": "Assessment type name must be at least 1 character long.",
    "string.max": "Assessment type name cannot exceed 255 characters.",
    "any.required": "Assessment type name is required."
  }),
  type: Joi.string().valid("continuous", "endOfTerm").required().messages({
    "any.only": "Assessment type must be either 'continuous' or 'endOfTerm'.",
    "any.required": "Assessment type is required."
  }),
  weight: Joi.number().precision(2).min(0).max(100).required().messages({
    "number.base": "Weight must be a number.",
    "number.precision": "Weight can have at most 2 decimal places.",
    "number.min": "Weight cannot be less than 0.",
    "number.max": "Weight cannot exceed 100.",
    "any.required": "Weight is required."
  }),
});

// Schema for Assessment creation and update
const assessmentSchema = Joi.object({
  title: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Assessment title cannot be empty.",
    "string.min": "Assessment title must be at least 1 character long.",
    "string.max": "Assessment title cannot exceed 255 characters.",
    "any.required": "Assessment title is required."
  }),
  description: Joi.string().allow('').optional(),
  date: Joi.date().iso().required().messages({
    "date.base": "Assessment date must be a valid date.",
    "date.format": "Assessment date must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ).",
    "any.required": "Assessment date is required."
  }),
  maxScore: Joi.number().precision(2).min(0).max(1000).required().messages({ // Assuming max score up to 1000
    "number.base": "Max score must be a number.",
    "number.precision": "Max score can have at most 2 decimal places.",
    "number.min": "Max score cannot be less than 0.",
    "number.max": "Max score cannot exceed 1000.",
    "any.required": "Max score is required."
  }),
  assessmentTypeId: Joi.string().guid( ).required().messages({
    "string.guid": "Invalid assessment type ID format.",
    "any.required": "Assessment type ID is required."
  }),
  subjectId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid subject ID format.",
    "any.required": "Subject ID is required."
  }),
  classId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid class ID format.",
    "any.required": "Class ID is required."
  }),
  termId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid term ID format.",
    "any.required": "Term ID is required."
  }),
  schoolYearId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid school year ID format.",
    "any.required": "School year ID is required."
  }),
});

// Schema for individual student scores within a bulk submission
const singleStudentScoreSchema = Joi.object({
  studentId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid student ID format in scores.",
    "any.required": "Student ID is required for each score entry."
  }),
  score: Joi.number().precision(2).min(0).required().messages({
    "number.base": "Score must be a number.",
    "number.precision": "Score can have at most 2 decimal places.",
    "number.min": "Score cannot be less than 0.",
    "any.required": "Score is required for each student."
  }),
  remarks: Joi.string().allow('').optional(),
});

// Schema for AcademicRecord creation and update
const academicRecordSchema = Joi.object({
  studentId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid student ID format.",
    "any.required": "Student ID is required."
  }),
  classId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid class ID format.",
    "any.required": "Class ID is required."
  }),
  subjectId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid subject ID format.",
    "any.required": "Subject ID is required."
  }),
  termId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid term ID format.",
    "any.required": "Term ID is required."
  }),
  academicYearId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    "string.guid": "Invalid academic year ID format.",
    "any.required": "Academic year ID is required."
  }),
  finalScore: Joi.number().precision(2).min(0).max(100).required().messages({
    "number.base": "Final score must be a number.",
    "number.precision": "Final score can have at most 2 decimal places.",
    "number.min": "Final score cannot be less than 0.",
    "number.max": "Final score cannot exceed 100.",
    "any.required": "Final score is required."
  }),
  finalGrade: Joi.string().min(1).max(2).required().messages({ // e.g., 'A', 'B+'
    "string.empty": "Final grade cannot be empty.",
    "string.min": "Final grade must be at least 1 character long.",
    "string.max": "Final grade cannot exceed 2 characters.",
    "any.required": "Final grade is required."
  }),
  isPublished: Joi.boolean().optional(),
  isPromoted: Joi.boolean().optional(),
});


// --- Assessment Type Controllers ---
const createAssessmentType = asyncHandler(async (req, res) => {
  const { error } = assessmentTypeSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const { name, type, weight } = req.body;
  try {
    const assessmentType = await AssessmentType.create({ name, type, weight });
    res.status(201).json(assessmentType);
  } catch (dbError) {
    if (dbError.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: `Assessment type with name '${name}' already exists.` });
    }
    console.error("Error creating assessment type:", dbError);
    res.status(500).json({ error: "Failed to create assessment type." });
  }
});

const getAllAssessmentTypes = asyncHandler(async (req, res) => {
  try {
    const assessmentTypes = await AssessmentType.findAll();
    res.status(200).json(assessmentTypes);
  } catch (error) {
    console.error("Error fetching all assessment types:", error);
    res.status(500).json({ error: "Failed to fetch assessment types." });
  }
});

const getAssessmentTypeById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment type ID format." });
  }

  try {
    const assessmentType = await AssessmentType.findByPk(id);
    if (!assessmentType) return res.status(404).json({ error: "Assessment type not found." });
    res.status(200).json(assessmentType);
  } catch (error) {
    console.error(`Error fetching assessment type with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to fetch assessment type." });
  }
});

const updateAssessmentType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment type ID format." });
  }

  const { error } = assessmentTypeSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  try {
    const assessmentType = await AssessmentType.findByPk(id);
    if (!assessmentType) return res.status(404).json({ error: "Assessment type not found." });

    await assessmentType.update(req.body);
    res.status(200).json(assessmentType);
  } catch (dbError) {
    if (dbError.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: `Assessment type name '${req.body.name}' already exists.` });
    }
    console.error(`Error updating assessment type with ID ${id}:`, dbError);
    res.status(500).json({ error: "Failed to update assessment type." });
  }
});

const deleteAssessmentType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment type ID format." });
  }

  try {
    const assessmentType = await AssessmentType.findByPk(id);
    if (!assessmentType) return res.status(404).json({ error: "Assessment type not found." });

    await assessmentType.destroy();
    res.status(204).end(); // 204 No Content for successful deletion
  } catch (error) {
    console.error(`Error deleting assessment type with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to delete assessment type." });
  }
});

// --- Assessment Controllers (Replaces Exam/Assignment CRUD) ---
const createAssessment = asyncHandler(async (req, res) => {
  const { error } = assessmentSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const { title, description, date, maxScore, assessmentTypeId, subjectId, classId, termId, schoolYearId } = req.body;

  try {
    // Verify existence of foreign key entities
    const [assessmentType, subject, classObj, term, schoolYear] = await Promise.all([
      AssessmentType.findByPk(assessmentTypeId),
      Subject.findByPk(subjectId),
      Class.findByPk(classId),
      Term.findByPk(termId),
      SchoolYear.findByPk(schoolYearId),
    ]);

    if (!assessmentType) return res.status(404).json({ error: "Assessment Type not found." });
    if (!subject) return res.status(404).json({ error: "Subject not found." });
    if (!classObj) return res.status(404).json({ error: "Class not found." });
    if (!term) return res.status(404).json({ error: "Term not found." });
    if (!schoolYear) return res.status(404).json({ error: "School Year not found." });

    const assessment = await Assessment.create({
      title, description, date, maxScore, assessmentTypeId, subjectId, classId, termId, schoolYearId
    });
    res.status(201).json(assessment);
  } catch (dbError) {
    if (dbError.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: "An assessment with this title already exists for this subject, class, term, and school year." });
    }
    console.error("Error creating assessment:", dbError);
    res.status(500).json({ error: "Failed to create assessment." });
  }
});

const getAllAssessments = asyncHandler(async (req, res) => {
  const { type, subjectId, classId, termId, schoolYearId } = req.query;
  const where = {};
  const include = [
    { model: AssessmentType, as: "assessmentType" },
    { model: Subject, as: "subject" },
    { model: Class, as: "class" },
    { model: Term, as: "term" },
    { model: SchoolYear, as: "schoolYear" },
  ];

  // Validate UUIDs if provided as query parameters
  if (subjectId && !subjectId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid subjectId format." });
  }
  if (classId && !classId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid classId format." });
  }
  if (termId && !termId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid termId format." });
  }
  if (schoolYearId && !schoolYearId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid schoolYearId format." });
  }

  if (subjectId) where.subjectId = subjectId;
  if (classId) where.classId = classId;
  if (termId) where.termId = termId;
  if (schoolYearId) where.schoolYearId = schoolYearId;

  if (type) {
    try {
      const assessmentType = await AssessmentType.findOne({ where: { type } });
      if (assessmentType) {
        where.assessmentTypeId = assessmentType.id;
      } else {
        return res.status(400).json({ error: "Invalid assessment type filter." });
      }
    } catch (error) {
      console.error("Error filtering by assessment type:", error);
      return res.status(500).json({ error: "Failed to filter assessments by type." });
    }
  }

  try {
    const assessments = await Assessment.findAll({
      where,
      include,
      order: [['date', 'DESC']],
    });
    res.status(200).json(assessments);
  } catch (error) {
    console.error("Error fetching all assessments:", error);
    res.status(500).json({ error: "Failed to fetch assessments." });
  }
});

const getAssessmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment ID format." });
  }

  try {
    const assessment = await Assessment.findByPk(id, {
      include: [
        { model: AssessmentType, as: "assessmentType" },
        { model: Subject, as: "subject" },
        { model: Class, as: "class" },
        { model: Term, as: "term" },
        { model: SchoolYear, as: "schoolYear" },
      ],
    });
    if (!assessment) return res.status(404).json({ error: "Assessment not found." });
    res.status(200).json(assessment);
  } catch (error) {
    console.error(`Error fetching assessment with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to fetch assessment." });
  }
});

const updateAssessment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment ID format." });
  }

  const { error } = assessmentSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const { assessmentTypeId, subjectId, classId, termId, schoolYearId } = req.body;

  try {
    const assessment = await Assessment.findByPk(id);
    if (!assessment) return res.status(404).json({ error: "Assessment not found." });

    // Verify existence of foreign key entities if they are being updated
    if (assessmentTypeId) {
      const typeExists = await AssessmentType.findByPk(assessmentTypeId);
      if (!typeExists) return res.status(404).json({ error: "Assessment Type not found." });
    }
    if (subjectId) {
      const subjectExists = await Subject.findByPk(subjectId);
      if (!subjectExists) return res.status(404).json({ error: "Subject not found." });
    }
    if (classId) {
      const classExists = await Class.findByPk(classId);
      if (!classExists) return res.status(404).json({ error: "Class not found." });
    }
    if (termId) {
      const termExists = await Term.findByPk(termId);
      if (!termExists) return res.status(404).json({ error: "Term not found." });
    }
    if (schoolYearId) {
      const schoolYearExists = await SchoolYear.findByPk(schoolYearId);
      if (!schoolYearExists) return res.status(404).json({ error: "School Year not found." });
    }

    await assessment.update(req.body);
    res.status(200).json(assessment);
  } catch (dbError) {
    if (dbError.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: "An assessment with this title already exists for this subject, class, term, and school year." });
    }
    console.error(`Error updating assessment with ID ${id}:`, dbError);
    res.status(500).json({ error: "Failed to update assessment." });
  }
});

const deleteAssessment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment ID format." });
  }

  try {
    const assessment = await Assessment.findByPk(id);
    if (!assessment) return res.status(404).json({ error: "Assessment not found." });

    await assessment.destroy();
    res.status(204).end();
  } catch (error) {
    console.error(`Error deleting assessment with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to delete assessment." });
  }
});

// --- Student Assessment Scores (Marking) ---
const getStudentScoresForAssessment = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;
  // Basic UUID validation for param
  if (!assessmentId || !assessmentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment ID format." });
  }

  try {
    const assessment = await Assessment.findByPk(assessmentId);
    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found." });
    }

    // Fetch students in the class associated with this assessment
    const studentsInClass = await Student.findAll({
      where: { currentClassId: assessment.classId },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'username'] }]
    });

    // Fetch existing scores for these students for this assessment
    const studentScores = await StudentAssessmentScore.findAll({
      where: {
        assessmentId: assessmentId,
        studentId: { [Op.in]: studentsInClass.map(s => s.id) }
      },
      raw: true // Get plain data for easier merging
    });

    // Merge student data with their scores
    const data = studentsInClass.map(student => {
      const scoreEntry = studentScores.find(s => s.studentId === student.id);
      return {
        studentId: student.id,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        username: student.user.username,
        score: scoreEntry ? parseFloat(scoreEntry.score) : null, // Ensure score is a number
        remarks: scoreEntry ? scoreEntry.remarks : null,
        maxScore: parseFloat(assessment.maxScore) // Ensure maxScore is a number
      };
    });

    res.status(200).json({ assessment, students: data });
  } catch (error) {
    console.error(`Error fetching student scores for assessment ${assessmentId}:`, error);
    res.status(500).json({ error: "Failed to fetch student scores for assessment." });
  }
});

const submitStudentScores = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;
  // Basic UUID validation for param
  if (!assessmentId || !assessmentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid assessment ID format." });
  }

  const { scores } = req.body; // scores is an array: [{ studentId, score, remarks }]

  if (!Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({ error: "Scores array is required and cannot be empty." });
  }

  // Validate each score entry in the array
  for (const scoreEntry of scores) {
    const { error } = singleStudentScoreSchema.validate(scoreEntry);
    if (error) {
      return res.status(400).json({ errors: error.details.map(d => d.message) });
    }
  }

  const assessment = await Assessment.findByPk(assessmentId);
  if (!assessment) {
    return res.status(404).json({ error: "Assessment not found." });
  }

  const transaction = await sequelize.transaction();
  try {
    const results = [];
    for (const scoreEntry of scores) {
      const { studentId, score, remarks } = scoreEntry;

      // Validate score against maxScore (redundant with Joi if maxScore is fixed, but good for dynamic maxScore)
      if (score !== null && (score < 0 || score > assessment.maxScore)) {
        await transaction.rollback();
        return res.status(400).json({ error: `Score for student ${studentId} must be between 0 and ${assessment.maxScore}.` });
      }

      // Verify student exists
      const studentExists = await Student.findByPk(studentId, { transaction });
      if (!studentExists) {
        await transaction.rollback();
        return res.status(404).json({ error: `Student with ID ${studentId} not found.` });
      }

      const [studentScore, created] = await StudentAssessmentScore.findOrCreate({
        where: { studentId: studentId, assessmentId: assessmentId },
        defaults: { score: score, remarks: remarks || null },
        transaction,
      });

      if (!created) {
        await studentScore.update({ score: score, remarks: remarks || null }, { transaction });
        results.push({ studentId, status: 'updated' });
      } else {
        results.push({ studentId, status: 'created' });
      }
    }
    await transaction.commit();
    res.status(200).json({ message: "Scores submitted successfully.", results });
  } catch (error) {
    await transaction.rollback();
    console.error("Error submitting student scores:", error);
    res.status(500).json({ error: "Failed to submit student scores." });
  }
});

const updateSingleStudentScore = asyncHandler(async (req, res) => {
  const { id } = req.params; // ID of the StudentAssessmentScore record
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid student assessment score ID format." });
  }

  const { score, remarks } = req.body;
  const { error } = singleStudentScoreSchema.validate({ score, remarks }); // Validate only the fields being updated
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  try {
    const studentScoreRecord = await StudentAssessmentScore.findByPk(id, {
      include: [{ model: Assessment, as: 'assessment' }]
    });

    if (!studentScoreRecord) {
      return res.status(404).json({ error: "Student score record not found." });
    }

    // Validate score against maxScore of the associated assessment
    if (score !== null && (score < 0 || score > studentScoreRecord.assessment.maxScore)) {
      return res.status(400).json({ error: `Score must be between 0 and ${studentScoreRecord.assessment.maxScore}.` });
    }

    await studentScoreRecord.update({ score, remarks: remarks || null });
    res.status(200).json({ message: "Student score updated successfully.", studentScoreRecord });
  } catch (error) {
    console.error(`Error updating single student score with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to update student score." });
  }
});


// --- Academic Records (End-of-Term Results) ---
const createAcademicRecord = asyncHandler(async (req, res) => {
  const { error } = academicRecordSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const { studentId, classId, subjectId, termId, academicYearId, finalScore, finalGrade } = req.body;

  const transaction = await sequelize.transaction();
  try {
    // Verify existence of foreign key entities
    const [student, classObj, subject, term, schoolYear] = await Promise.all([
      Student.findByPk(studentId, { transaction }),
      Class.findByPk(classId, { transaction }),
      Subject.findByPk(subjectId, { transaction }),
      Term.findByPk(termId, { transaction }),
      SchoolYear.findByPk(academicYearId, { transaction }),
    ]);

    if (!student) return res.status(404).json({ error: "Student not found." });
    if (!classObj) return res.status(404).json({ error: "Class not found." });
    if (!subject) return res.status(404).json({ error: "Subject not found." });
    if (!term) return res.status(404).json({ error: "Term not found." });
    if (!schoolYear) return res.status(404).json({ error: "Academic Year not found." });

    // Check for existing record to prevent duplicates
    const existingRecord = await AcademicRecord.findOne({
      where: { studentId, subjectId, termId, academicYearId },
      transaction
    });

    if (existingRecord) {
      await transaction.rollback();
      return res.status(409).json({ error: "Academic record for this student, subject, term, and year already exists. Use PUT to update." });
    }

    const academicRecord = await AcademicRecord.create({
      studentId, classId, subjectId, termId, academicYearId, finalScore, finalGrade
    }, { transaction });

    await transaction.commit();
    res.status(201).json(academicRecord);
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating academic record:", error);
    // Handle Sequelize unique constraint error for academic_rec_unique index
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: "An academic record for this student, subject, term, and academic year already exists." });
    }
    res.status(500).json({ error: "Failed to create academic record." });
  }
});

const updateAcademicRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic record ID format." });
  }

  // Validate only the fields that can be updated
  const { error } = academicRecordSchema.extract('finalScore').concat(academicRecordSchema.extract('finalGrade'))
                                       .concat(academicRecordSchema.extract('isPublished')).concat(academicRecordSchema.extract('isPromoted'))
                                       .validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const { finalScore, finalGrade, isPublished, isPromoted } = req.body;

  try {
    const academicRecord = await AcademicRecord.findByPk(id);
    if (!academicRecord) {
      return res.status(404).json({ error: "Academic record not found." });
    }

    await academicRecord.update({ finalScore, finalGrade, isPublished, isPromoted });
    res.status(200).json(academicRecord);
  } catch (error) {
    console.error(`Error updating academic record with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to update academic record." });
  }
});

const getStudentAcademicRecordsForTerm = asyncHandler(async (req, res) => {
  const { studentId, academicYearId, termId } = req.params;
  // Basic UUID validation for params
  if (!studentId || !studentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid student ID format." });
  }
  if (!academicYearId || !academicYearId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic year ID format." });
  }
  if (!termId || !termId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid term ID format." });
  }

  try {
    // Verify existence of foreign key entities
    const [student, term, schoolYear] = await Promise.all([
      Student.findByPk(studentId),
      Term.findByPk(termId),
      SchoolYear.findByPk(academicYearId),
    ]);

    if (!student) return res.status(404).json({ error: "Student not found." });
    if (!term) return res.status(404).json({ error: "Term not found." });
    if (!schoolYear) return res.status(404).json({ error: "Academic Year not found." });

    const records = await AcademicRecord.findAll({
      where: { studentId, academicYearId, termId },
      include: [
        { model: Subject, as: 'subject', attributes: ['name', 'code'] },
        { model: Class, as: 'class', attributes: ['name'] },
        { model: Term, as: 'term', attributes: ['tname'] },
        { model: SchoolYear, as: 'schoolYear', attributes: ['name'] }
      ],
      order: [[{ model: Subject, as: 'subject' }, 'name', 'ASC']]
    });

    res.status(200).json(records);
  } catch (error) {
    console.error(`Error fetching academic records for student ${studentId} in term ${termId}, year ${academicYearId}:`, error);
    res.status(500).json({ error: "Failed to fetch academic records for term." });
  }
});

const publishAcademicRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic record ID format." });
  }

  try {
    const academicRecord = await AcademicRecord.findByPk(id);
    if (!academicRecord) {
      return res.status(404).json({ error: "Academic record not found." });
    }
    await academicRecord.update({ isPublished: true });
    res.status(200).json({ message: "Academic record published successfully.", academicRecord });
  } catch (error) {
    console.error(`Error publishing academic record with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to publish academic record." });
  }
});

const unpublishAcademicRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Basic UUID validation for param
  if (!id || !id.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic record ID format." });
  }

  try {
    const academicRecord = await AcademicRecord.findByPk(id);
    if (!academicRecord) {
      return res.status(404).json({ error: "Academic record not found." });
    }
    await academicRecord.update({ isPublished: false });
    res.status(200).json({ message: "Academic record unpublished successfully.", academicRecord });
  } catch (error) {
    console.error(`Error unpublishing academic record with ID ${id}:`, error);
    res.status(500).json({ error: "Failed to unpublish academic record." });
  }
});


// --- Reporting Controllers ---
const getStudentAcademicSummary = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  // Basic UUID validation for param
  if (!studentId || !studentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid student ID format." });
  }

  try {
    // Verify student exists
    const studentExists = await Student.findByPk(studentId);
    if (!studentExists) {
      return res.status(404).json({ error: "Student not found." });
    }

    const academicRecords = await AcademicRecord.findAll({
      where: { studentId, isPublished: true }, // Only show published records
      include: [
        { model: Subject, as: 'subject', attributes: ['name', 'code'] },
        { model: Term, as: 'term', attributes: ['tname', 'startDate'] },
        { model: SchoolYear, as: 'schoolYear', attributes: ['name', 'startDate'] },
        { model: Class, as: 'class', attributes: ['name'] }
      ],
      order: [
        [{ model: SchoolYear, as: 'schoolYear' }, 'startDate', 'DESC'],
        [{ model: Term, as: 'term' }, 'startDate', 'DESC'],
        [{ model: Subject, as: 'subject' }, 'name', 'ASC']
      ]
    });

    let totalScoreSum = 0;
    let recordCount = 0;
    academicRecords.forEach(record => {
      totalScoreSum += parseFloat(record.finalScore);
      recordCount++;
    });
    const overallAverage = recordCount > 0 ? (totalScoreSum / recordCount).toFixed(2) : 'N/A';

    res.status(200).json({ studentId, overallAverage, records: academicRecords });
  } catch (error) {
    console.error(`Error fetching academic summary for student ${studentId}:`, error);
    res.status(500).json({ error: "Failed to fetch student academic summary." });
  }
});

const getStudentPerformanceReport = asyncHandler(async (req, res) => {
  const { studentId, academicYearId, termId } = req.params;
  // Basic UUID validation for params
  if (!studentId || !studentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid student ID format." });
  }
  if (!academicYearId || !academicYearId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic year ID format." });
  }
  if (!termId || !termId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid term ID format." });
  }

  try {
    // Fetch student details
    const studentUser = await User.findByPk(studentId, {
      attributes: ['id', 'firstName', 'lastName', 'username', 'dob', 'role', 'profilePhoto'],
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['studentNumber'],
          include: [
            { model: Class, as: 'currentClass', attributes: ['name'], include: [{ model: ClassLevel, as: 'classLevel', attributes: ['name'] }] },
            { model: Parent, as: 'parent', attributes: ['parentNumber'], include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'phone'] }] },
            { model: Parent, as: 'alternateGuardian', attributes: ['parentNumber'], include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'phone'] }] },
          ]
        },
      ]
    });

    if (!studentUser || studentUser.role !== 'student') {
      return res.status(404).json({ error: "Student not found or is not a student role." });
    }

    const academicYear = await SchoolYear.findByPk(academicYearId);
    const term = await Term.findByPk(termId);

    if (!academicYear || !term) {
      return res.status(404).json({ error: "Academic Year or Term not found." });
    }

    // Fetch only published AcademicRecords for the specified term/year
    const results = await AcademicRecord.findAll({
      where: {
        studentId: studentId,
        academicYearId: academicYearId,
        termId: termId,
        isPublished: true // Only include published results
      },
      include: [{ model: Subject, as: 'subject', attributes: ['name', 'code'] }],
      order: [[{ model: Subject, as: 'subject' }, 'name', 'ASC']]
    });

    let totalScoreSum = 0;
    let gradedSubjectsCount = 0;
    results.forEach(record => {
      totalScoreSum += parseFloat(record.finalScore);
      gradedSubjectsCount++;
    });
    const overallAverage = gradedSubjectsCount > 0 ? (totalScoreSum / gradedSubjectsCount).toFixed(2) : 0;

    let overallGrade = 'N/A';
    if (overallAverage >= 90) overallGrade = 'A+';
    else if (overallAverage >= 80) overallGrade = 'A';
    else if (overallAverage >= 70) overallGrade = 'B+';
    else if (overallAverage >= 60) overallGrade = 'B';
    else if (overallAverage >= 50) overallGrade = 'C';
    else if (overallAverage >= 40) overallGrade = 'D';
    else if (overallAverage > 0) overallGrade = 'F';

    // Placeholder for conduct and attendance (you'd fetch these from other models if they exist)
    const conductReport = "Excellent behavior and participation.";
    const attendanceRecord = "95% attendance.";

    res.status(200).json({
      student: {
        id: studentUser.id,
        firstName: studentUser.firstName,
        lastName: studentUser.lastName,
        username: studentUser.username,
        dob: studentUser.dob,
        profilePhoto: studentUser.profilePhoto, // This will be the relative path, PDF generator will handle full URL
        studentNumber: studentUser.student?.studentNumber,
        class: studentUser.student?.currentClass?.name || 'N/A',
        gradeLevel: studentUser.student?.currentClass?.classLevel?.name || 'N/A',
        parent: studentUser.student?.parent?.user ? `${studentUser.student.parent.user.firstName} ${studentUser.student.parent.user.lastName}` : 'N/A',
        parentPhone: studentUser.student?.parent?.user?.phone || 'N/A',
        alternateGuardian: studentUser.student?.alternateGuardian?.user ? `${studentUser.student.alternateGuardian.user.firstName} ${studentUser.student.alternateGuardian.user.lastName}` : null,
        alternateGuardianPhone: studentUser.student?.alternateGuardian?.user?.phone || null,
      },
      academicYear: academicYear.name,
      term: term.tname,
      results: results.map(r => ({
        subjectName: r.subject.name,
        score: parseFloat(r.finalScore), // Ensure score is a number
        grade: r.finalGrade,
      })),
      overallAverage: parseFloat(overallAverage),
      overallGrade: overallGrade,
      conductReport,
      attendanceRecord,
    });
  } catch (error) {
    console.error(`Error fetching student performance report for student ${studentId} in term ${termId}, year ${academicYearId}:`, error);
    res.status(500).json({ error: "Failed to fetch student performance report." });
  }
});

const generateStudentReportPdf = asyncHandler(async (req, res) => {
  const { studentId, academicYearId, termId } = req.params;

  // Basic UUID validation for params
  if (!studentId || !studentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid student ID format." });
  }
  if (!academicYearId || !academicYearId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic year ID format." });
  }
  if (!termId || !termId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid term ID format." });
  }

  try {
    // Reuse the data fetching logic from getStudentPerformanceReport
    let reportData = {};
    // Create a mock response object to capture the data from the previous controller
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          if (code !== 200) {
            // Propagate error from data fetching
            throw new Error(data.error || "Failed to fetch report data for PDF generation.");
          }
          reportData = data;
          return data;
        },
      }),
    };

    // Call the data fetching controller
    await getStudentPerformanceReport(req, mockRes);

    const { student, academicYear, term, results, overallAverage, overallGrade, conductReport, attendanceRecord } = reportData;

    // Ensure student.profilePhoto is a full URL for Puppeteer
    const fullProfilePhotoUrl = student.profilePhoto
      ? `${req.protocol}://${req.get("host")}${student.profilePhoto}`
      : null;

    // HTML Template Structure (as before, but with full profile photo URL)
    const reportHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Student Report Card - ${student.firstName} ${student.lastName}</title>
          <style>
              body { font-family: 'Times New Roman', Times, serif; margin: 20mm; font-size: 10pt; }
              .container { width: 100%; margin: 0 auto; border: 1px solid #ccc; padding: 10mm; }
              .header { text-align: center; margin-bottom: 10mm; }
              .header img { max-width: 100px; margin-bottom: 5mm; }
              .header h1 { margin: 0; font-size: 16pt; color: #333; }
              .header h2 { margin: 2mm 0; font-size: 12pt; color: #555; }
              .header h3 { margin: 2mm 0; font-size: 10pt; color: #666; }
              .student-info, .report-summary, .subject-results, .comments { margin-bottom: 8mm; }
              .student-info table, .subject-results table { width: 100%; border-collapse: collapse; }
              .student-info th, .student-info td,
              .subject-results th, .subject-results td {
                  border: 1px solid #ddd; padding: 4px 6px; text-align: left;
              }
              .subject-results th { background-color: #f2f2f2; }
              .summary-item { display: flex; justify-content: space-between; margin-bottom: 2mm; }
              .footer { text-align: center; margin-top: 15mm; font-size: 8pt; color: #777; }
              .bold { font-weight: bold; }
              .align-right { text-align: right; }
              .stamp {
                  position: absolute;
                  top: 50%;
                  left: 50%;
                  transform: translate(-50%, -50%) rotate(-20deg);
                  opacity: 0.1;
                  font-size: 4em;
                  color: gray;
                  pointer-events: none;
                  white-space: nowrap;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  ${fullProfilePhotoUrl ? `<img src="${fullProfilePhotoUrl}" alt="Student Photo" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 5mm;">` : ''}
                  <h1>CHIGONEKA MISSION SECONDARY SCHOOL</h1>
                  <h2>STUDENT REPORT CARD</h2>
                  <h3>ACADEMIC YEAR: ${academicYear} &nbsp;&nbsp;&nbsp; TERM: ${term}</h3>
              </div>
              <div class="student-info">
                  <table>
                      <tr>
                          <th style="width: 25%;">Student Name:</th>
                          <td class="bold">${student.firstName} ${student.lastName}</td>
                          <th style="width: 20%;">Student ID:</th>
                          <td>${student.studentNumber || student.username}</td>
                      </tr>
                      <tr>
                          <th>Date of Birth:</th>
                          <td>${student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A'}</td>
                          <th>Class:</th>
                          <td>${student.class} (${student.gradeLevel})</td>
                      </tr>
                      <tr>
                          <th>Parent/Guardian:</th>
                          <td>${student.parent || 'N/A'}</td>
                          <th>Contact:</th>
                          <td>${student.parentPhone || 'N/A'}</td>
                      </tr>
                      ${student.alternateGuardian ? `
                      <tr>
                          <th>Alt. Guardian:</th>
                          <td>${student.alternateGuardian}</td>
                          <th>Alt. Contact:</th>
                          <td>${student.alternateGuardianPhone}</td>
                      </tr>
                      ` : ''}
                  </table>
              </div>
              <div class="subject-results">
                  <h3>Subject Results:</h3>
                  <table>
                      <thead>
                          <tr>
                              <th>Subject</th>
                              <th class="align-right">Score (%)</th>
                              <th>Grade</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${results.map(r => `
                              <tr>
                                  <td>${r.subjectName}</td>
                                  <td class="align-right">${r.score}</td>
                                  <td>${r.grade}</td>
                              </tr>
                          `).join('')}
                      </tbody>
                  </table>
              </div>
              <div class="report-summary">
                  <h3>Term Summary:</h3>
                  <div class="summary-item"><span>Overall Average Score:</span> <span class="bold align-right">${overallAverage}%</span></div>
                  <div class="summary-item"><span>Overall Grade:</span> <span class="bold align-right">${overallGrade}</span></div>
                  <div class="summary-item"><span>Position in Class:</span> <span class="bold align-right">To Be Implemented</span></div>
                  <div class="summary-item"><span>Next Term Class:</span> <span class="bold align-right">To Be Implemented</span></div>
              </div>
              <div class="comments">
                  <h3>Teacher's Comment:</h3>
                  <p>${conductReport}</p>
                  <h3>Head Teacher's Comment:</h3>
                  <p>Keep up the good work and strive for excellence. We encourage active participation in all school activities.</p>
              </div>
              <div class="footer">
                  <p>Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
                  <p>&copy; ${new Date().getFullYear()} CHIGONEKA MIS. All Rights Reserved.</p>
              </div>
              <div class="stamp">CHIGONEKA MIS</div>
          </div>
      </body>
      </html>
      `;
    let browser;
    try {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: true,
        });
        const page = await browser.newPage();
        await page.setContent(reportHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Report_Card_${student.firstName}_${student.lastName}_${academicYear}_${term}.pdf"`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error generating PDF report:", error);
        res.status(500).json({ error: "Failed to generate report PDF." });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
  } catch (error) {
    console.error(`Error in generateStudentReportPdf:`, error);
    res.status(500).json({ error: error.message || "Failed to generate PDF report due to an internal error." });
  }
});


// Admin Reports
const getAdminOverviewReport = asyncHandler(async (req, res) => {
  // Logic from your existing reportsController.js for getAdminOverviewReport
  // Add validation for any query parameters if applicable
  try {
    // Example: Fetch counts of users by role, active classes, etc.
    const totalUsers = await User.count();
    const totalStudents = await Student.count();
    const totalTeachers = await Teacher.count();
    const totalClasses = await Class.count();
    const totalSubjects = await Subject.count();

    res.status(200).json({
      message: "Admin overview report data",
      totalUsers,
      totalStudents,
      totalTeachers,
      totalClasses,
      totalSubjects,
      // Add more relevant overview data here
    });
  } catch (error) {
    console.error("Error fetching admin overview report:", error);
    res.status(500).json({ error: "Failed to fetch admin overview report." });
  }
});

const getClassPerformanceReport = asyncHandler(async (req, res) => {
  const { academicYearId, termId } = req.params;
  // Basic UUID validation for params
  if (!academicYearId || !academicYearId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic year ID format." });
  }
  if (!termId || !termId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid term ID format." });
  }

  try {
    const academicYear = await SchoolYear.findByPk(academicYearId);
    const term = await Term.findByPk(termId);

    if (!academicYear) return res.status(404).json({ error: "Academic Year not found." });
    if (!term) return res.status(404).json({ error: "Term not found." });

    // Fetch all academic records for the given term and academic year that are published
    const classRecords = await AcademicRecord.findAll({
      where: { academicYearId, termId, isPublished: true },
      include: [
        { model: Student, as: 'student', include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }] },
        { model: Class, as: 'class', attributes: ['name'] },
        { model: Subject, as: 'subject', attributes: ['name'] },
      ],
      order: [
        [{ model: Class, as: 'class' }, 'name', 'ASC'],
        [{ model: Student, as: 'student' }, 'id', 'ASC'], // Order by student ID or name
        [{ model: Subject, as: 'subject' }, 'name', 'ASC'],
      ]
    });

    // Aggregate data by class
    const classPerformance = {};
    classRecords.forEach(record => {
      const className = record.class.name;
      if (!classPerformance[className]) {
        classPerformance[className] = {
          totalStudents: new Set(),
          totalScores: 0,
          recordCount: 0,
          subjects: {}
        };
      }
      classPerformance[className].totalStudents.add(record.studentId);
      classPerformance[className].totalScores += parseFloat(record.finalScore);
      classPerformance[className].recordCount++;

      if (!classPerformance[className].subjects[record.subject.name]) {
        classPerformance[className].subjects[record.subject.name] = {
          totalScore: 0,
          studentCount: 0
        };
      }
      classPerformance[className].subjects[record.subject.name].totalScore += parseFloat(record.finalScore);
      classPerformance[className].subjects[record.subject.name].studentCount++;
    });

    const formattedReport = Object.keys(classPerformance).map(className => {
      const classData = classPerformance[className];
      const overallAverage = classData.recordCount > 0 ? (classData.totalScores / classData.recordCount).toFixed(2) : 'N/A';
      const subjectAverages = Object.keys(classData.subjects).map(subjectName => {
        const subjectData = classData.subjects[subjectName];
        return {
          subjectName,
          averageScore: (subjectData.totalScore / subjectData.studentCount).toFixed(2)
        };
      });

      return {
        className,
        totalStudents: classData.totalStudents.size,
        overallAverage: parseFloat(overallAverage),
        subjectAverages
      };
    });

    res.status(200).json({ academicYear: academicYear.name, term: term.tname, report: formattedReport });

  } catch (error) {
    console.error(`Error fetching class performance report for year ${academicYearId}, term ${termId}:`, error);
    res.status(500).json({ error: "Failed to fetch class performance report." });
  }
});

const getTeacherSubjectResults = asyncHandler(async (req, res) => {
  const { teacherId, subjectId, academicYearId, termId } = req.params;
  // Basic UUID validation for params
  if (!teacherId || !teacherId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid teacher ID format." });
  }
  if (!subjectId || !subjectId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid subject ID format." });
  }
  if (!academicYearId || !academicYearId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid academic year ID format." });
  }
  if (!termId || !termId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid term ID format." });
  }

  try {
    // Verify existence of foreign key entities
    const [teacher, subject, academicYear, term] = await Promise.all([
      Teacher.findByPk(teacherId),
      Subject.findByPk(subjectId),
      SchoolYear.findByPk(academicYearId),
      Term.findByPk(termId),
    ]);

    if (!teacher) return res.status(404).json({ error: "Teacher not found." });
    if (!subject) return res.status(404).json({ error: "Subject not found." });
    if (!academicYear) return res.status(404).json({ error: "Academic Year not found." });
    if (!term) return res.status(404).json({ error: "Term not found." });

    // Find teaching assignments for this teacher, subject, term, and year
    const teachingAssignments = await TeachingAssignment.findAll({
      where: { teacherId, subjectId, academicYearId, termId },
      attributes: ['classId'], // We only need the class IDs
      raw: true,
    });

    const classIds = teachingAssignments.map(ta => ta.classId);

    if (classIds.length === 0) {
      return res.status(404).json({ message: "No teaching assignments found for this teacher, subject, term, and year." });
    }

    // Fetch academic records for students in these classes, for this subject, term, and year
    const subjectResults = await AcademicRecord.findAll({
      where: {
        subjectId,
        academicYearId,
        termId,
        classId: { [Op.in]: classIds },
        isPublished: true // Only published results
      },
      include: [
        { model: Student, as: 'student', include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }] },
        { model: Class, as: 'class', attributes: ['name'] },
      ],
      order: [
        [{ model: Class, as: 'class' }, 'name', 'ASC'],
        [{ model: Student, as: 'student' }, 'id', 'ASC'],
      ]
    });

    // Aggregate results by class and student
    const reportData = {};
    subjectResults.forEach(record => {
      const className = record.class.name;
      const studentName = `${record.student.user.firstName} ${record.student.user.lastName}`;
      if (!reportData[className]) {
        reportData[className] = {
          classAverage: 0,
          studentCount: 0,
          students: []
        };
      }
      reportData[className].students.push({
        studentName,
        score: parseFloat(record.finalScore),
        grade: record.finalGrade
      });
      reportData[className].classAverage += parseFloat(record.finalScore);
      reportData[className].studentCount++;
    });

    // Calculate class averages
    Object.keys(reportData).forEach(className => {
      const classData = reportData[className];
      classData.classAverage = (classData.classAverage / classData.studentCount).toFixed(2);
    });

    res.status(200).json({
      teacher: teacher.id, // You might want to fetch teacher name from User model
      subject: subject.name,
      academicYear: academicYear.name,
      term: term.tname,
      resultsByClass: reportData
    });

  } catch (error) {
    console.error(`Error fetching teacher subject results for teacher ${teacherId}, subject ${subjectId}, term ${termId}, year ${academicYearId}:`, error);
    res.status(500).json({ error: "Failed to fetch teacher subject results." });
  }
});

// --- Student Promotion ---
const promoteStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { nextClassId } = req.body; // The class to promote the student to

  // Basic UUID validation for params
  if (!studentId || !studentId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid student ID format." });
  }
  if (!nextClassId || !nextClassId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)) {
    return res.status(400).json({ error: "Invalid next class ID format." });
  }

  const transaction = await sequelize.transaction();
  try {
    const student = await Student.findByPk(studentId, {
      include: [{ model: User, as: 'user' }],
      transaction
    });
    if (!student) {
      await transaction.rollback();
      return res.status(404).json({ error: "Student not found." });
    }

    const nextClass = await Class.findByPk(nextClassId, { transaction });
    if (!nextClass) {
      await transaction.rollback();
      return res.status(404).json({ error: "Next class not found." });
    }

    // Get the current academic year and Term 3
    const currentSchoolYear = await SchoolYear.findOne({
      order: [['startDate', 'DESC']], // Assuming the latest is the current
      transaction
    });
    if (!currentSchoolYear) {
      await transaction.rollback();
      return res.status(404).json({ error: "Current school year not found." });
    }

    const term3 = await Term.findOne({
      where: { schoolYearId: currentSchoolYear.id, tname: 'Term 3' },
      transaction
    });
    if (!term3) {
      await transaction.rollback();
      return res.status(404).json({ error: "Term 3 for current school year not found. Promotion cannot be determined." });
    }

    // Fetch all published academic records for the student in Term 3 of the current academic year
    const term3Records = await AcademicRecord.findAll({
      where: {
        studentId: student.id,
        termId: term3.id,
        academicYearId: currentSchoolYear.id,
        isPublished: true
      },
      transaction
    });

    // Determine promotion status based on Term 3 results
    // This is a simplified logic. You might have more complex rules (e.g., pass all core subjects, overall average threshold).
    // For this example, let's say a student is promoted if they pass at least 50% of their subjects in Term 3.
    const passedSubjectsCount = term3Records.filter(record => parseFloat(record.finalScore) >= 50).length; // Example: passing score is 50
    const totalSubjectsCount = term3Records.length;

    let isPromoted = false;
    if (totalSubjectsCount > 0 && (passedSubjectsCount / totalSubjectsCount) >= 0.5) {
      isPromoted = true;
    }

    // Update the student's currentClassId and isPromoted status in AcademicRecords for Term 3
    await student.update({ currentClassId: nextClassId }, { transaction });

    // Update the isPromoted flag on all Term 3 academic records for this student
    await AcademicRecord.update(
      { isPromoted: isPromoted },
      {
        where: {
          studentId: student.id,
          termId: term3.id,
          academicYearId: currentSchoolYear.id,
        },
        transaction,
      }
    );

    await transaction.commit();

    res.status(200).json({
      message: `Student ${student.user.firstName} ${student.user.lastName} ${isPromoted ? 'promoted' : 'not promoted'} to ${nextClass.name}.`,
      studentId: student.id,
      isPromoted: isPromoted,
      newClassId: isPromoted ? nextClass.id : student.currentClassId,
      details: { passedSubjectsCount, totalSubjectsCount }
    });

  } catch (error) {
    await transaction.rollback();
    console.error(`Error promoting student ${studentId}:`, error);
    res.status(500).json({ error: error.message || "Failed to promote student." });
  }
});


module.exports = {
  createAssessmentType,
  getAllAssessmentTypes,
  getAssessmentTypeById,
  updateAssessmentType,
  deleteAssessmentType,
  createAssessment,
  getAllAssessments,
  getAssessmentById,
  updateAssessment,
  deleteAssessment,
  getStudentScoresForAssessment,
  submitStudentScores,
  updateSingleStudentScore,
  createAcademicRecord,
  updateAcademicRecord,
  getStudentAcademicRecordsForTerm,
  publishAcademicRecord,
  unpublishAcademicRecord,
  getStudentAcademicSummary,
  getStudentPerformanceReport,
  generateStudentReportPdf,
  getAdminOverviewReport,
  getClassPerformanceReport,
  getTeacherSubjectResults,
  promoteStudent,
};
