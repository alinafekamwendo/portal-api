// controllers/assessmentController.js (New File)
const { Assessment, Subject, Term, AssessmentType, SchoolYear, Class, StudentAssessmentScore, sequelize } = require('../models');
const asyncHandler = require('../middlewares/asyncHandler');
const Joi = require('joi');


// Joi schema for Assessment creation/update
const assessmentSchema = Joi.object({
  title: Joi.string().required(),
  date: Joi.date().iso().required(),
  maxScore: Joi.number().integer().min(1).required(),
  assessmentTypeId: Joi.string().guid().required(),
  subjectId: Joi.string().guid().required(),
  termId: Joi.string().guid().required(),
 schoolYearId: Joi.string().guid().required(), // This is the field Joi is checking
  classId: Joi.string().guid().allow(null).optional(), // Optional for school-wide exams
});

// Create a new assessment
const createAssessment = asyncHandler(async (req, res) => {
  console.log("Creating assessment with body:", req.body); // Keep this for debugging!
  const { error } = assessmentSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const transaction = await sequelize.transaction();
  try {
    const { title, date, maxScore, assessmentTypeId, subjectId, termId, schoolYearId, classId } = req.body;

    // Validate foreign keys
    // Renamed 'schoolYear' to 'academicYearInstance' for clarity to avoid confusion with the ID
    const [subject, term, assessmentType, academicYearInstance, classObj] = await Promise.all([
      Subject.findByPk(subjectId, { transaction }),
      Term.findByPk(termId, { transaction }),
      AssessmentType.findByPk(assessmentTypeId, { transaction }),
      SchoolYear.findByPk(schoolYearId, { transaction }), // This fetches the SchoolYear instance
      classId ? Class.findByPk(classId, { transaction }) : Promise.resolve(null),
    ]);

    if (!subject) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Subject not found.' });
    }
    if (!term) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Term not found.' });
    }
    if (!assessmentType) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Assessment Type not found.' });
    }
    if (!academicYearInstance) { // Check the instance, not the ID
      await transaction.rollback();
      return res.status(404).json({ error: 'Academic Year not found.' });
    }
    if (classId && !classObj) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Class not found.' });
    }

    const newAssessment = await Assessment.create({
      title,
      date,
      maxScore,
      assessmentTypeId,
      subjectId,
      termId,
      schoolYearId: academicYearId, // <--- **CRITICAL FIX: Changed `schoolYear` to `schoolYearId`**
      classId // This is already the ID, so it's fine
    }, { transaction });

    await transaction.commit();
    res.status(201).json(newAssessment);
  } catch (error) {
    await transaction.rollback();
    console.error("Error creating assessment:", error);
    // Provide more specific error details in development
    res.status(500).json({ error: "Failed to create assessment", details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
});

// Get all assessments (with filters)
const getAllAssessments = asyncHandler(async (req, res) => {
  // Destructure 'type' directly from req.query, along with other filters
  const { subjectId, termId, academicYearId, classId, type } = req.query;
  const whereClause = {};
  const includeClause = [
    { model: Subject, as: 'subject', attributes: ['id', 'name'] },
    { model: Term, as: 'term', attributes: ['id', 'tname'] },
    { model: SchoolYear, as: 'schoolYear', attributes: ['id', 'name'] }, // Use 'schoolYear' as alias consistently
    { model: Class, as: 'class', attributes: ['id', 'name'] },
    // Always include AssessmentType to potentially filter by its 'type'
    { model: AssessmentType, as: 'assessmentType', attributes: ['id', 'name', 'type'] },
  ];

  if (subjectId) whereClause.subjectId = subjectId;
  if (termId) whereClause.termId = termId;
  // Ensure we use 'schoolYearId' as the foreign key in the Assessment model's where clause
  if (academicYearId) whereClause.schoolYearId = academicYearId;
  if (classId) whereClause.classId = classId;

  // Handle the 'type' filter from the frontend by adding a condition to the AssessmentType include
  if (type) {
    const assessmentTypeInclude = includeClause.find(inc => inc.model === AssessmentType);
    if (assessmentTypeInclude) {
      // Add a 'where' condition to the AssessmentType association
      assessmentTypeInclude.where = { type: type };
    }
    // If for some reason AssessmentType wasn't in includes (though it should be for this logic),
    // you'd push it here. But with the explicit include above, this block is safer.
  }

  try {
    const assessments = await Assessment.findAll({
      where: whereClause,
      include: includeClause,
      order: [['date', 'DESC']], // Order by date, descending
    });
    res.status(200).json(assessments);
  } catch (error) {
    console.error("Error fetching assessments:", error);
    res.status(500).json({ error: "Failed to fetch assessments" });
  }
});

// Get a single assessment by ID
const getAssessmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const assessment = await Assessment.findByPk(id, {
      include: [
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
        { model: Term, as: 'term', attributes: ['id', 'tname'] },
        { model: SchoolYear, as: 'academicYear', attributes: ['id', 'name'] },
        { model: Class, as: 'class', attributes: ['id', 'name'] },
      ],
    });
    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found" });
    }
    res.status(200).json(assessment);
  } catch (error) {
    console.error("Error fetching assessment:", error);
    res.status(500).json({ error: "Failed to fetch assessment" });
  }
});

// Update an assessment
const updateAssessment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { error } = assessmentSchema.validate(req.body); // Validate all fields, even if only some are updated
  if (error) {
    return res.status(400).json({ errors: error.details.map(d => d.message) });
  }

  const transaction = await sequelize.transaction();
  try {
    const assessment = await Assessment.findByPk(id, { transaction });
    if (!assessment) {
      await transaction.rollback();
      return res.status(404).json({ error: "Assessment not found" });
    }

    const { title, date, maxScore, isFinalExam, subjectId, termId, academicYearId, classId } = req.body;

    // Validate foreign keys if they are being updated
    if (subjectId && subjectId !== assessment.subjectId) {
      const subject = await Subject.findByPk(subjectId, { transaction });
      if (!subject) { await transaction.rollback(); return res.status(404).json({ error: 'Subject not found.' }); }
    }
    if (termId && termId !== assessment.termId) {
      const term = await Term.findByPk(termId, { transaction });
      if (!term) { await transaction.rollback(); return res.status(404).json({ error: 'Term not found.' }); }
    }
    if (academicYearId && academicYearId !== assessment.academicYearId) {
      const schoolYear = await SchoolYear.findByPk(academicYearId, { transaction });
      if (!schoolYear) { await transaction.rollback(); return res.status(404).json({ error: 'SchoolYear not found.' }); }
    }
    if (classId && classId !== assessment.classId) {
        const classObj = await Class.findByPk(classId, { transaction });
        if (!classObj) { await transaction.rollback(); return res.status(404).json({ error: 'Class not found.' }); }
    }


    await assessment.update({
      title, date, maxScore, isFinalExam, subjectId, termId, academicYearId, classId
    }, { transaction });

    await transaction.commit();
    res.status(200).json(assessment);
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating assessment:", error);
    res.status(500).json({ error: "Failed to update assessment" });
  }
});

// Delete an assessment
const deleteAssessment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();
  try {
    const assessment = await Assessment.findByPk(id, { transaction });
    if (!assessment) {
      await transaction.rollback();
      return res.status(404).json({ error: "Assessment not found" });
    }
    await assessment.destroy({ transaction });
    await transaction.commit();
    res.status(204).end();
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting assessment:", error);
    res.status(500).json({ error: "Failed to delete assessment" });
  }
});

// Submit/Update scores for multiple students for an assessment (from your existing code)
const submitStudentAssessmentScores = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;
  const { scores } = req.body; // scores is an array: [{ studentId, score, comment }]

  if (!Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({ error: "Scores array is required and cannot be empty." });
  }

  const assessment = await Assessment.findByPk(assessmentId);
  if (!assessment) {
      return res.status(404).json({ error: "Assessment not found." });
  }

  const transaction = await sequelize.transaction();
  try {
      const results = [];
      for (const scoreEntry of scores) {
          const { studentId, score, comment } = scoreEntry;
          if (score === null || score === undefined || isNaN(score)) {
              results.push({ studentId, status: 'skipped', message: 'Score is null/undefined' });
              continue;
          }
          if (score < 0 || score > assessment.maxScore) {
              await transaction.rollback();
              return res.status(400).json({ error: `Score for student ${studentId} must be between 0 and ${assessment.maxScore}.` });
          }

          const [studentScore, created] = await StudentAssessmentScore.findOrCreate({
              where: { studentId: studentId, assessmentId: assessmentId },
              defaults: { score: score, comment: comment || null },
              transaction,
          });

          if (!created) {
              await studentScore.update({ score: score, comment: comment || null }, { transaction });
              results.push({ studentId, status: 'updated' });
          } else {
              results.push({ studentId, status: 'created' });
          }
      }
      await transaction.commit();
      res.status(200).json({ message: "Scores submitted successfully.", results });
  } catch (error) {
      await transaction.rollback();
      console.error("Error submitting student assessment scores:", error);
      res.status(500).json({ error: "Failed to submit student assessment scores." });
  }
});

// Get student scores for a specific assessment (for pre-filling/editing)
const getStudentScoresForAssessment = asyncHandler(async (req, res) => {
  const { assessmentId } = req.params;
  try {
    const assessment = await Assessment.findByPk(assessmentId, {
      include: [
        { model: Subject, as: 'subject' },
        { model: Term, as: 'term' },
        { model: SchoolYear, as: 'academicYear' },
        { model: Class, as: 'class' },
      ],
    });

    if (!assessment) {
      return res.status(404).json({ error: "Assessment not found." });
    }

    // Determine students relevant to this assessment.
    // If assessment is class-specific, fetch students from that class.
    // Otherwise, you might need a different logic (e.g., all students taking the subject).
    let studentsInScope = [];
    if (assessment.classId) {
      studentsInScope = await sequelize.models.Student.findAll({
        where: { currentClassId: assessment.classId },
        include: [{ model: sequelize.models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
        order: [['user', 'lastName', 'ASC'], ['user', 'firstName', 'ASC']],
      });
    } else {
      // Fallback: If not class-specific, you might need to fetch all students
      // enrolled in the subject for that academic year/term. This requires
      // a more complex query involving AcademicRecords or TeachingAssignments.
      // For now, let's assume classId is always provided for assessments that need marking.
      return res.status(400).json({ error: "Assessment is not linked to a specific class for student fetching." });
    }

    const studentScores = await StudentAssessmentScore.findAll({
      where: { assessmentId: assessmentId },
      attributes: ['studentId', 'score', 'comment'],
    });

    // Merge students with their scores for easy frontend consumption
    const data = studentsInScope.map(student => {
      const scoreEntry = studentScores.find(s => s.studentId === student.id);
      return {
        studentId: student.id,
        firstName: student.user.firstName,
        lastName: student.user.lastName,
        score: scoreEntry ? scoreEntry.score : null,
        comment: scoreEntry ? scoreEntry.comment : null,
        maxScore: assessment.maxScore,
      };
    });

    res.status(200).json({ assessment, students: data });
  } catch (error) {
    console.error("Error fetching student scores for assessment:", error);
    res.status(500).json({ error: "Failed to fetch student scores for assessment." });
  }
});


module.exports = {
  createAssessment,
  getAllAssessments,
  getAssessmentById,
  updateAssessment,
  deleteAssessment,
  submitStudentAssessmentScores,
  getStudentScoresForAssessment,
};

