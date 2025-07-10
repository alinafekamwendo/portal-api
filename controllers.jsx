const { User, Admin } = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const Joi = require("joi");
const { sequelize } = require("../models");

// Validation schema for admin creation/update
const adminSchema = Joi.object({
  level: Joi.string().valid("regular", "super").default("regular"),
  userId: Joi.string().guid().required(),
});

// Create a new admin (usually called from user controller during user creation)
const createAdmin = async (userId, level = "regular", transaction) => {
  return Admin.create(
    {
      userId,
      level,
    },
    { transaction }
  );
};

// Get all admins with their user details
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: { exclude: ["password", "deletedAt"] },
          paranoid: false,
        },
      ],
      paranoid: false,
    });

    res.status(200).json(admins);
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ error: "Failed to fetch admins" });
  }
};

// Get admin by ID with user details
const getAdminById = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: { exclude: ["password", "deletedAt"] },
          paranoid: false,
        },
      ],
      paranoid: false,
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.status(200).json(admin);
  } catch (error) {
    console.error("Error fetching admin:", error);
    res.status(500).json({ error: "Failed to fetch admin" });
  }
};

// Get admin by user ID
const getAdminByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const admin = await Admin.findOne({
      where: { userId },
      include: [
        {
          model: User,
          as: "user",
          attributes: { exclude: ["password", "deletedAt"] },
          paranoid: false,
        },
      ],
      paranoid: false,
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.status(200).json(admin);
  } catch (error) {
    console.error("Error fetching admin:", error);
    res.status(500).json({ error: "Failed to fetch admin" });
  }
};

// Update admin level
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { level } = req.body;

    // Validate input
    const { error } = adminSchema.validate({ level, userId: id });
    if (error) {
      const errors = error.details.map((detail) => detail.message);
      return res.status(400).json({ errors });
    }

    const admin = await Admin.findByPk(id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Only super admins can change admin levels
    if (req.user.role === "admin") {
      const requestingAdmin = await Admin.findOne({
        where: { userId: req.user.id },
      });
      if (requestingAdmin.level !== "super") {
        return res
          .status(403)
          .json({ error: "Only super admins can modify admin levels" });
      }
    }

    await admin.update({ level });

    const updatedAdmin = await Admin.findByPk(id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: { exclude: ["password", "deletedAt"] },
        },
      ],
    });

    res.status(200).json(updatedAdmin);
  } catch (error) {
    console.error("Error updating admin:", error);
    res.status(500).json({ error: "Failed to update admin" });
  }
};

// Delete admin (soft delete)
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await sequelize.transaction();

    try {
      const admin = await Admin.findByPk(id, { transaction });
      if (!admin) {
        await transaction.rollback();
        return res.status(404).json({ error: "Admin not found" });
      }

      // Prevent self-deletion
      if (admin.userId === req.user.id) {
        await transaction.rollback();
        return res
          .status(400)
          .json({ error: "Cannot delete your own admin account" });
      }

      // Only super admins can delete admins
      if (req.user.role === "admin") {
        const requestingAdmin = await Admin.findOne({
          where: { userId: req.user.id },
          transaction,
        });
        if (requestingAdmin.level !== "super") {
          await transaction.rollback();
          return res
            .status(403)
            .json({ error: "Only super admins can delete admins" });
        }
      }

      await admin.destroy({ transaction });
      await transaction.commit();

      res.status(200).json({ message: "Admin deleted successfully" });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error deleting admin:", error);
    res.status(500).json({ error: "Failed to delete admin" });
  }
};

// Restore soft-deleted admin
const restoreAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const transaction = await sequelize.transaction();

    try {
      const admin = await Admin.findOne({
        where: { id },
        paranoid: false,
        transaction,
      });

      if (!admin) {
        await transaction.rollback();
        return res.status(404).json({ error: "Admin not found" });
      }

      // Only super admins can restore admins
      if (req.user.role === "admin") {
        const requestingAdmin = await Admin.findOne({
          where: { userId: req.user.id },
          transaction,
        });
        if (requestingAdmin.level !== "super") {
          await transaction.rollback();
          return res
            .status(403)
            .json({ error: "Only super admins can restore admins" });
        }
      }

      await admin.restore({ transaction });
      await transaction.commit();

      res.status(200).json({ message: "Admin restored successfully" });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error restoring admin:", error);
    res.status(500).json({ error: "Failed to restore admin" });
  }
};

// Promote admin to super admin
const promoteToSuperAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Only super admins can promote others
    if (req.user.role === "admin") {
      const requestingAdmin = await Admin.findOne({
        where: { userId: req.user.id },
      });
      if (requestingAdmin.level !== "super") {
        return res
          .status(403)
          .json({ error: "Only super admins can promote admins" });
      }
    }

    const admin = await Admin.findByPk(id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    await admin.update({ level: "super" });

    res
      .status(200)
      .json({ message: "Admin promoted to super admin successfully" });
  } catch (error) {
    console.error("Error promoting admin:", error);
    res.status(500).json({ error: "Failed to promote admin" });
  }
};

// Demote super admin to regular admin
const demoteToRegularAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent self-demotion
    const admin = await Admin.findByPk(id);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    if (admin.userId === req.user.id) {
      return res.status(400).json({ error: "Cannot demote yourself" });
    }

    // Only super admins can demote others
    if (req.user.role === "admin") {
      const requestingAdmin = await Admin.findOne({
        where: { userId: req.user.id },
      });
      if (requestingAdmin.level !== "super") {
        return res
          .status(403)
          .json({ error: "Only super admins can demote admins" });
      }
    }

    await admin.update({ level: "regular" });

    res
      .status(200)
      .json({ message: "Super admin demoted to regular admin successfully" });
  } catch (error) {
    console.error("Error demoting admin:", error);
    res.status(500).json({ error: "Failed to demote admin" });
  }
};

module.exports = {
  createAdmin,
  getAllAdmins,
  getAdminById,
  getAdminByUserId,
  updateAdmin,
  deleteAdmin,
  restoreAdmin,
  promoteToSuperAdmin,
  demoteToRegularAdmin,
};
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

// backend/controllers/authController.js
const { User, Teacher, Parent, Student, Admin } = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Joi = require("joi"); // Joi is already imported, good.
const { sequelize } = require("../models");
const cookie = require("cookie");
const asyncHandler = require("../middlewares/asyncHandler");

// Token generation functions (unchanged)
const generateAccessToken = (user) => {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });
};

const generateRefreshToken = (user) => {
  return jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

// Refresh token endpoint (unchanged)
const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({
        error: "Refresh token required",
        shouldLogout: true,
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = await User.findOne({
      where: { id: decoded.id },
      attributes: ["id", "role"],
    });

    if (!user) {
      res.clearCookie("refreshToken");
      return res.status(403).json({
        error: "Invalid refresh token",
        shouldLogout: true,
      });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token: newAccessToken,
      expiresIn: 15 * 60 * 1000,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.clearCookie("refreshToken");
    if (error.name === "TokenExpiredError") {
      return res.status(403).json({
        error: "Refresh token expired",
        shouldLogout: true,
      });
    }
    return res.status(403).json({
      error: "Invalid refresh token",
      shouldLogout: true,
    });
  }
};

// Updated login function to include role numbers (unchanged, as it uses existing user data)
const loginUser = async (req, res) => {
  const reqUser = req.user;
  try {
    const { email, password } = req.body;
    console.log("Creating", req.body);
    if (!email || !password || email === "" || password === "") {
      return res.status(400).json({ error: "All fields are required" });
    }

    const isEmail = email.includes('@');
    let user;
    if (isEmail) {
      user = await User.findOne({
        where: { email },
        attributes: { exclude: ["deletedAt"] },
        include: [
          {
            model: Teacher,
            as: "teacher",
            required: false,
            attributes: ["staffNumber", "qualifications", "subjects"],
          },
          {
            model: Parent,
            as: "parent",
            required: false,
            attributes: ["parentNumber"],
          },
          {
            model: Student,
            as: "student",
            required: false,
            attributes: ["studentNumber"],
          },
          {
            model: Admin,
            as: "admin",
            required: false,
            attributes: ["adminNumber", "level"],
          },
        ],
      });
    }
    if (!isEmail) {
      user = await User.findOne({
        where: { username:email },
        attributes: { exclude: ["deletedAt"] },
        include: [
          {
            model: Teacher,
            as: "teacher",
            required: false,
            attributes: ["staffNumber", "qualifications", "subjects"],
          },
          {
            model: Parent,
            as: "parent",
            required: false,
            attributes: ["parentNumber"],
          },
          {
            model: Student,
            as: "student",
            required: false,
            attributes: ["studentNumber"],
          },
          {
            model: Admin,
            as: "admin",
            required: false,
            attributes: ["adminNumber", "level"],
          },
        ],
      });
    }
   
    if (!user) {
      return res.status(404).json({ error: "Account not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.setHeader(
      "Set-Cookie",
      cookie.serialize("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      })
    );

    const profilePhotoUrl = user.profilePhoto
      ? `${req.protocol}://${req.get("host")}${user.profilePhoto}`
      : null;

    // Build response with role-specific number
    const responseData = {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        sex: user.sex,
        profilePhoto: profilePhotoUrl,
      },
      token: accessToken,
    };

    // Add role-specific number to response
    switch (user.role) {
      case "teacher":
        responseData.user.staffNumber = user.teacher?.staffNumber;
        responseData.user.qualifications = user.teacher?.qualifications;
        responseData.user.subjects = user.teacher?.subjects;
        break;
      case "parent":
        responseData.user.parentNumber = user.parent?.parentNumber;
        break;
      case "student":
        responseData.user.studentNumber = user.student?.studentNumber;
        break;
      case "admin":
        responseData.user.adminNumber = user.admin?.adminNumber;
        responseData.user.level = user.admin?.level;
        break;
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Failed to log in" });
  }
};

// Logout function (unchanged)
const logout = async (req, res) => {
  const userId = req.user?.id || null;
  try {
    res.setHeader(
      "Set-Cookie",
      cookie.serialize("refreshToken", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        expires: new Date(0),
        path: "/",
      })
    );

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ error: "Failed to logout" });
  }
};

// Multer configuration (unchanged)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../uploads/profilephoto");
    try {
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    } catch (err) {
      console.error("Error creating upload directory:", err);
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    // Ensure username is available in req.body for filename
    const username = req.body.username || 'unknown_user';
    const uniqueName = `${username}_${Date.now()}${path.extname(
      file.originalname
    )}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Token generation (unchanged)
const generateToken = (user) => {
  return jwt.sign(
    { username: user.username, id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "4h" }
  );
};

// --- UPDATED Joi Validation Schemas ---
const userSchema = Joi.object({
  firstName: Joi.string().required().messages({
    "any.required": "First name is required",
    "string.empty": "First name cannot be empty",
  }),
  lastName: Joi.string().required().messages({
    "any.required": "Last name is required",
    "string.empty": "Last name cannot be empty",
  }),
  username: Joi.string().required().messages({
    "any.required": "Username is required",
    "string.empty": "Username cannot be empty",
  }),
  role: Joi.string()
    .valid("admin", "parent", "teacher", "student")
    .required()
    .messages({
      "any.required": "Role is required",
      "any.only": "Role must be one of: admin, parent, teacher, student",
    }),
  password: Joi.string().min(6).required().messages({
    "any.required": "Password is required",
    "string.min": "Password must be at least 6 characters long",
    "string.empty": "Password cannot be empty",
  }),
  address: Joi.string().when('role', {
    is: 'student',
    then: Joi.optional().allow(null, ''), // Optional for students
    otherwise: Joi.string().required().messages({ // Required for others
      "any.required": "Address is required",
      "string.empty": "Address cannot be empty",
    }),
  }),
  email: Joi.string().email().when('role', {
    is: 'student',
    then: Joi.optional().allow(null, ''), // Optional for students
    otherwise: Joi.string().email().required().messages({ // Required for others
      "any.required": "Email is required",
      "string.email": "Email must be a valid email address",
      "string.empty": "Email cannot be empty",
    }),
  }),
  phone: Joi.string().when('role', {
    is: 'student',
    then: Joi.optional().allow(null, ''), // Optional for students
    otherwise: Joi.string().required().messages({ // Required for others
      "any.required": "Phone number is required",
      "string.empty": "Phone number cannot be empty",
    }),
  }),
  sex: Joi.string().valid("MALE", "FEMALE").required().messages({
    "any.required": "Sex is required",
    "any.only": "Sex must be one of: MALE, FEMALE",
  }),
  dob: Joi.date().less("now").required().messages({
    "any.required": "Date of birth is required",
    "date.base": "Date of birth must be a valid date",
    "date.format": "Date of birth must be in ISO 8601 format (YYYY-MM-DD)",
    "date.less": "Date of birth cannot be in the future",
  }),
});

const teacherSchema = Joi.object({
  qualifications: Joi.array().items(Joi.string()).optional(),
  subjects: Joi.array().items(Joi.string()).optional(),
});

const parentSchema = Joi.object({});

const studentSchema = Joi.object({
  parentId: Joi.string().guid().required().messages({
    "any.required": "Parent ID is required for students.",
    "string.guid": "Invalid parent ID format."
  }),
  alte_guardian_Id: Joi.string().guid().optional().allow(null, ''),
});

const adminSchema = Joi.object({
  level: Joi.string().valid("regular", "super").default("regular"),
});

// Updated createUser function to handle shared IDs and conditional validation
const createUser = async (req, res) => {
  try {
    upload.single("profilePhoto")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        console.error("Multer error during user creation:", err);
        return res.status(400).json({ error: `File upload error: ${err.message}` });
      } else if (err) {
        // An unknown error occurred when uploading.
        console.error("Unknown error during file upload for user creation:", err);
        return res.status(500).json({ error: "An unexpected error occurred during file upload." });
      }

      const {
        firstName,
        lastName,
        username,
        role,
        password,
        address,
        email,
        phone,
        dob,
        sex,
        qualifications,
        subjects,
        parentId,
        alte_guardian_Id,
        level,
      } = req.body;

      console.log("req body", req.body);
      console.log("req file", req.file); // Log req.file to debug multer issues

      // Validate input data using Joi with conditional requirements
      const { error: userValidationError } = userSchema.validate(
        {
          firstName,
          lastName,
          username,
          role,
          password,
          address,
          email,
          phone,
          sex,
          dob,
        },
        { abortEarly: false }
      );

      if (userValidationError) {
        const errors = userValidationError.details.map((detail) => detail.message);
        return res.status(400).json({ errors });
      }

      let roleValidationError;
      switch (role.toLowerCase()) {
        case "teacher":
          roleValidationError = teacherSchema.validate({
            qualifications,
            subjects,
          }).error;
          break;
        case "student":
          roleValidationError = studentSchema.validate({ parentId, alte_guardian_Id }).error; // Include alte_guardian_Id
          break;
        case "admin":
          roleValidationError = adminSchema.validate({ level }).error;
          break;
        case "parent":
          roleValidationError = parentSchema.validate({}).error; // No specific parent fields to validate here
          break;
      }

      if (roleValidationError) {
        const errors = roleValidationError.details.map(
          (detail) => detail.message
        );
        return res.status(400).json({ errors });
      }

      // Check for existing user (username, email, phone)
      const existingUserWhereClause = {
        username: username,
      };

      // Only add email/phone to uniqueness check if they are provided
      if (email) {
        existingUserWhereClause.email = email;
      }
      if (phone) {
        existingUserWhereClause.phone = phone;
      }

      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { username },
            ...(email ? [{ email }] : []), // Conditionally add email to OR clause
            ...(phone ? [{ phone }] : []), // Conditionally add phone to OR clause
          ],
        },
      });


      if (existingUser) {
        const errors = [];
        if (existingUser.username === username)
          errors.push("Username already exists");
        if (email && existingUser.email === email) errors.push("Email already exists");
        if (phone && existingUser.phone === phone)
          errors.push("Phone number already exists");
        return res.status(400).json({ errors });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const lowerCaseRole = role.toLowerCase();
      const upperCaseSex = sex.toUpperCase();

      let profilePhotoUrl = null;
      if (req.file) {
        profilePhotoUrl = `/uploads/profilephotos/${req.file.filename}`;
      }

      const transaction = await sequelize.transaction();

      try {
        // Create the user
        const user = await User.create(
          {
            firstName,
            lastName,
            username,
            role: lowerCaseRole,
            password: hashedPassword,
            address: address || null, // Ensure null if empty string or undefined
            email: email || null,     // Ensure null if empty string or undefined
            phone: phone || null,     // Ensure null if empty string or undefined
            sex: upperCaseSex,
            dob,
            profilePhoto: profilePhotoUrl,
          },
          { transaction }
        );

        // Create role-specific record with same ID
        switch (lowerCaseRole) {
          case "teacher":
            await Teacher.create(
              {
                id: user.id, // Using same ID as user
                qualifications: qualifications || [],
                subjects: subjects || [],
              },
              { transaction }
            );
            break;
          case "parent":
            await Parent.create(
              {
                id: user.id, // Using same ID as user
              },
              { transaction }
            );
            break;
          case "student":
            const parent = await Parent.findByPk(parentId, { transaction });
            if (!parent) {
              await transaction.rollback();
              // Clean up uploaded file if transaction fails here
              if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
              }
              return res.status(400).json({ error: "Parent not found" });
            }
            await Student.create(
              {
                id: user.id, // Using same ID as user
                parentId,
                alte_guardian_Id: alte_guardian_Id || null,
              },
              { transaction }
            );
            break;
          case "admin":
            await Admin.create(
              {
                id: user.id, // Using same ID as user
                level: level || "regular",
              },
              { transaction }
            );
            break;
        }

        await transaction.commit();

        // Fetch the newly created user with role data
        const newUser = await User.findByPk(user.id, {
          attributes: { exclude: ["password"] },
          include: [
            {
              model: Teacher,
              as: "teacher",
              required: false,
              attributes: ["staffNumber"],
            },
            {
              model: Parent,
              as: "parent",
              required: false,
              attributes: ["parentNumber"],
            },
            {
              model: Student,
              as: "student",
              required: false,
              attributes: ["studentNumber"],
            },
            {
              model: Admin,
              as: "admin",
              required: false,
              attributes: ["adminNumber", "level"],
            },
          ],
        });

        const token = generateToken(user);

        // Add role number to response
        const responseData = {
          user: {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            role: newUser.role,
            profilePhoto: newUser.profilePhoto,
          },
          token,
        };

        switch (newUser.role) {
          case "teacher":
            responseData.user.staffNumber = newUser.teacher?.staffNumber;
            break;
          case "parent":
            responseData.user.parentNumber = newUser.parent?.parentNumber;
            break;
          case "student":
            responseData.user.studentNumber = newUser.student?.studentNumber;
            break;
          case "admin":
            responseData.user.adminNumber = newUser.admin?.adminNumber;
            responseData.user.level = newUser.admin?.level;
            break;
        }

        res.status(200).json(responseData);
      } catch (error) {
        await transaction.rollback();
        // If a file was saved but DB transaction failed, clean it up
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.error("Error creating user (transaction rolled back):", error);
        // Propagate Joi validation errors from transaction if any
        if (error.isJoi) {
            return res.status(400).json({
                type: "VALIDATION_ERROR",
                errors: error.details.map((detail) => ({
                    field: detail.context.key,
                    message: detail.message.replace(/['"]/g, ""),
                })),
            });
        }
        res.status(500).json({ error: error.message || "An unexpected error occurred during user creation." });
      }
    });
  } catch (error) {
    // This outer catch block is less likely to be hit now that Multer errors are handled inside its callback.
    console.error("Outer try-catch error in createUser:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred." });
  }
};

// Updated getCurrentUser to include role numbers (unchanged, as it uses existing user data)
const getCurrentUser = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const include = [];
    switch (user.role) {
      case "teacher":
        include.push({
          model: Teacher,
          as: "teacher",
          required: false,
          attributes: ["staffNumber", "qualifications", "subjects"],
        });
        break;
      case "parent":
        include.push({
          model: Parent,
          as: "parent",
          required: false,
          attributes: ["parentNumber"],
        });
        break;
      case "student":
        include.push({
          model: Student,
          as: "student",
          required: false,
          attributes: ["studentNumber"],
          include: [
            {
              model: Parent,
              as: "parent",
              attributes: ["parentNumber"],
            },
          ],
        });
        break;
      case "admin":
        include.push({
          model: Admin,
          as: "admin",
          required: false,
          attributes: ["adminNumber", "level"],
        });
        break;
    }

    const fullUser = await User.findOne({
      where: { id: user.id },
      attributes: { exclude: ["password", "deletedAt"] },
      include: include.length ? include : undefined,
    });

    if (!fullUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add profile photo URL if exists
    if (fullUser.profilePhoto) {
      fullUser.profilePhoto = `${req.protocol}://${req.get("host")}${
        fullUser.profilePhoto
      }`;
    }

    res.status(200).json(fullUser);
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ error: "Failed to fetch current user" });
  }
};

// Updated getUserById to include role numbers (unchanged, as it uses existing user data)
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      attributes: { exclude: ["password", "deletedAt"] },
      include: [
        {
          model: Teacher,
          as: "teacher",
          required: false,
          attributes: ["staffNumber", "qualifications", "subjects"],
        },
        {
          model: Parent,
          as: "parent",
          required: false,
          attributes: ["parentNumber"],
        },
        {
          model: Student,
          as: "student",
          required: false,
          attributes: ["studentNumber"],
          include: [
            {
              model: Parent,
              as: "parent",
              attributes: ["parentNumber"],
            },
          ],
        },
        {
          model: Admin,
          as: "admin",
          required: false,
          attributes: ["adminNumber", "level"],
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add profile photo URL if exists
    if (user.profilePhoto) {
      user.profilePhoto = `${req.protocol}://${req.get("host")}${
        user.profilePhoto
      }`;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
};

// Updated updateUser function
const updateUser = async (req, res) => {
  console.log(req.body);
  try {
    const {
      firstName,
      lastName,
      username,
      role, // Role might be updated, but for conditional validation, we need the *current* role or the intended one.
      email,
      phone,
      password,
      sex,
      address, // Added address to destructuring
      qualifications,
      subjects,
      parentId,
      profilePhoto,
      alte_guardian_Id,
      level,
    } = req.body;

    upload.single("profilePhoto")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        console.error("Multer error during user update:", err);
        return res.status(400).json({ error: `File upload error: ${err.message}` });
      } else if (err) {
        console.error("Unknown error during file upload for user update:", err);
        return res.status(500).json({ error: "An unexpected error occurred during file upload." });
      }

      const { id } = req.params;
    
      const transaction = await sequelize.transaction();

      try {
        const user = await User.findByPk(id, { transaction });
        if (!user) {
          await transaction.rollback();
          return res.status(404).json({ error: "User not found" });
        }

        // Validate input data using Joi with conditional requirements
        // Use the *current* user's role for validation if role is not being updated
        // or the provided role if it's part of the update.
        const effectiveRole = role || user.role; // Use provided role if present, else current role

        const { error: userValidationError } = userSchema.validate(
          {
            firstName,
            lastName,
            username,
            role: effectiveRole, // Use the effective role for validation
            password,
            address,
            email,
            phone,
            sex,
            // dob is not typically updated here, but if it were, add it.
          },
          { abortEarly: false, context: { isUpdate: true } } // Add context for update scenarios if needed in schema
        );

        if (userValidationError) {
          await transaction.rollback();
          // Clean up uploaded file if validation fails
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          const errors = userValidationError.details.map((detail) => detail.message);
          return res.status(400).json({ errors });
        }

        let roleValidationError;
        switch (effectiveRole.toLowerCase()) {
          case "teacher":
            roleValidationError = teacherSchema.validate({
              qualifications,
              subjects,
            }).error;
            break;
          case "student":
            roleValidationError = studentSchema.validate({ parentId, alte_guardian_Id }).error;
            break;
          case "admin":
            roleValidationError = adminSchema.validate({ level }).error;
            break;
          case "parent":
            roleValidationError = parentSchema.validate({}).error;
            break;
        }

        if (roleValidationError) {
          await transaction.rollback();
          // Clean up uploaded file if validation fails
          if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          const errors = roleValidationError.details.map(
            (detail) => detail.message
          );
          return res.status(400).json({ errors });
        }


        // Hash new password if provided
        let updatedFields = { firstName, lastName, username, email, phone, address, sex: sex ? sex.toUpperCase() : undefined, role: effectiveRole };
        if (password) {
          updatedFields.password = await bcrypt.hash(password, 10);
        }

        // Handle profile picture update
        if (req.file) {
          if (user.profilePhoto) {
            const oldPhotoPath = path.join(__dirname, "..", user.profilePhoto);
            if (fs.existsSync(oldPhotoPath)) {
              fs.unlinkSync(oldPhotoPath); // Delete old photo
            }
          }
          updatedFields.profilePhoto = `/uploads/profilephotos/${req.file.filename}`;
        } else if (req.body.profilePhoto === null) { // Allow explicit removal of profile photo
          if (user.profilePhoto) {
            const oldPhotoPath = path.join(__dirname, "..", user.profilePhoto);
            if (fs.existsSync(oldPhotoPath)) {
              fs.unlinkSync(oldPhotoPath);
            }
          }
          updatedFields.profilePhoto = null;
        }


        await User.update(updatedFields, {
          where: { id },
          transaction,
        });

        // Update role-specific data
        switch (effectiveRole.toLowerCase()) {
          case "teacher":
            // Ensure qualifications and subjects are arrays, even if null/undefined from input
            const teacherUpdateData = {
                qualifications: qualifications === undefined ? undefined : qualifications || [],
                subjects: subjects === undefined ? undefined : subjects || [],
            };
            if (Object.keys(teacherUpdateData).length > 0) { // Only update if there are fields to update
                await Teacher.update(teacherUpdateData, { where: { id }, transaction });
            }
            break;
          case "student":
            const studentUpdateData = {};
            if (parentId !== undefined) studentUpdateData.parentId = parentId;
            if (alte_guardian_Id !== undefined) studentUpdateData.alte_guardian_Id = alte_guardian_Id || null;

            if (Object.keys(studentUpdateData).length > 0) {
                await Student.update(studentUpdateData, { where: { id }, transaction });
            }
            break;
          case "admin":
            if (level !== undefined) {
                await Admin.update({ level }, { where: { id }, transaction });
            }
            break;
          case "parent":
            // No specific fields to update on Parent model directly from User update
            break;
        }

        await transaction.commit();

        // Fetch updated user with role data
        const updatedUser = await User.findByPk(id, {
          attributes: { exclude: ["password", "deletedAt"] },
          include: [
            {
              model: Teacher,
              as: "teacher",
              required: false,
              attributes: ["staffNumber", "qualifications", "subjects"], // Include all teacher attributes
            },
            {
              model: Parent,
              as: "parent",
              required: false,
              attributes: ["parentNumber"],
            },
            {
              model: Student,
              as: "student",
              required: false,
              attributes: ["studentNumber", "parentId", "alte_guardian_Id"], // Include student-specific attributes
            },
            {
              model: Admin,
              as: "admin",
              required: false,
              attributes: ["adminNumber", "level"],
            },
          ],
        });

        // Add profile photo URL if exists
        if (updatedUser.profilePhoto) {
          updatedUser.profilePhoto = `${req.protocol}://${req.get("host")}${
            updatedUser.profilePhoto
          }`;
        }

        res.status(200).json(updatedUser);
      } catch (error) {
        await transaction.rollback();
        // If a file was saved but DB transaction failed, clean it up
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        console.error("Error updating user (transaction rolled back):", error);
        // Handle Sequelize unique constraint error for username if it's updated to an existing one
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: "Username already exists." });
        }
        res.status(500).json({ error: error.message || "An unexpected error occurred during user update." });
      }
    });
  } catch (error) {
    console.error("Outer try-catch error in updateUser:", error);
    res.status(500).json({ error: error.message || "An unexpected error occurred" });
  }
};

// Serve uploaded files (unchanged)
const serveProfilePhoto = async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, "../uploads/profilephoto", filename);

  try {
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      console.error("File not found at path:", filePath);
      res.status(404).json({ error: "File not found" });
    }
  } catch (err) {
    console.error("Error serving file:", err);
    res.status(500).json({ error: "Error serving file" });
  }
};
// Updated deleteUser function (unchanged in logic, but context provided)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await sequelize.transaction();

    try {
      const user = await User.findByPk(id, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({ error: "User not found" });
      }

      // Delete role-specific record first
      switch (user.role) {
        case "teacher":
          await Teacher.destroy({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
        case "parent":
          await Parent.destroy({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
        case "student":
          await Student.destroy({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
        case "admin":
          await Admin.destroy({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
      }

      // Then delete the user
      await user.destroy({ transaction });

      await transaction.commit();
      res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// Updated restoreUser function (unchanged in logic, but context provided)
const restoreUser = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await sequelize.transaction();

    try {
      const user = await User.findOne({
        where: { id },
        paranoid: false,
        transaction,
      });

      if (!user) {
        await transaction.rollback();
        return res.status(404).json({ error: "User not found" });
      }

      // Restore the user first
      await user.restore({ transaction });

      // Restore role-specific record
      switch (user.role) {
        case "teacher":
          await Teacher.restore({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
        case "parent":
          await Parent.restore({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
        case "student":
          await Student.restore({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
        case "admin":
          await Admin.restore({
            where: { id }, // Now using id directly
            transaction,
          });
          break;
      }

      await transaction.commit();
      res.status(200).json({ message: "User restored successfully" });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error restoring user:", error);
    res.status(500).json({ error: "Failed to restore user" });
  }
};

// getAllUsers remains unchanged as it doesn't need role-specific numbers
const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password", "deletedAt"] },
      paranoid: true,
    });

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

const validateProfilePictures = async (req,res) => {
  try {
    // 1. Get all profile photo paths from the database
    const users = await User.findAll({
      attributes: ['id', 'profilePhoto'],
      where: {
        profilePhoto: {
          [Op.not]: null
        }
      },
      raw: true
    });

    // 2. Create a Set of valid profile photo paths for quick lookup
    const validProfilePhotos = new Set();
    users.forEach(user => {
      if (user.profilePhoto) {
        // Normalize paths for comparison
        const normalizedPath = path.normalize(user.profilePhoto).replace(/\\/g, '/');
        validProfilePhotos.add(normalizedPath);
      }
    });

    // 3. Define the uploads directory path
    const uploadsDir = path.join(__dirname, '../uploads/profilephoto');

    // 4. Check if directory exists
    if (!fs.existsSync(uploadsDir)) {
      return {
        success: true,
        message: 'Profile photos directory does not exist',
        deletedCount: 0
      };
    }

    // 5. Read all files in the directory
    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;

    // 6. Check each file against the database records
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const relativePath = `/uploads/profilephoto/${file}`;
      const normalizedRelativePath = path.normalize(relativePath).replace(/\\/g, '/');

      // 7. Delete if file doesn't exist in database records
      if (!validProfilePhotos.has(normalizedRelativePath)) {
        try {
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (err) {
          console.error(`Error deleting file ${filePath}:`, err);
        }
      }
    }

    res.status(200).json({ message: "Finished validating profile pictures"});
  } catch (error) {
    res.status(500).json({ error: "Failed to validate" });
  }
};

module.exports = {
  createUser: asyncHandler(createUser),
  getAllUsers:asyncHandler(getAllUsers),
  getUserById: asyncHandler(getUserById),
  updateUser: asyncHandler(updateUser),
  deleteUser: asyncHandler(deleteUser),
  restoreUser:asyncHandler(restoreUser),
  loginUser:asyncHandler(loginUser),
  serveProfilePhoto:asyncHandler(serveProfilePhoto),
  getCurrentUser: asyncHandler(getCurrentUser),
  refreshToken: asyncHandler(refreshToken),
  logout: asyncHandler(logout),
  validateProfilePictures: asyncHandler(validateProfilePictures)
};
const { Chat, User, Class, Subject, ChatParticipant,Message } = require("../models");
const { sequelize, Op } = require("../models"); // Import Op

// Create a new chat

// Get all chats for a user
const getUserChats = async (req, res) => {

  try {
    const userId = req.params.userId;

    const chats = await ChatParticipant.findAll({
      where: {userId },
      include: [
        {
          model: Chat,
          as: "chat",
          include: [
            { model: Class, as: "class" },
            { model: Subject, as: "subject" },
            {
              model: ChatParticipant,
              as: "participants",
              include: [{ model: User, as: "user" }],
            },
          ],
        },
      ],
    });

    res.status(200).json(chats.map((p) => p.chat));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};

// Add participants to a chat
const addParticipants = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { chatId, participants } = req.body;

    for (const userId of participants) {
      await ChatParticipant.findOrCreate({
        where: { chatId, userId },
        defaults: { role: "member" },
        transaction,
      });
    }

    await transaction.commit();
    res.status(200).json({ message: "Participants added successfully" });
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to add participants" });
  }
};
// controllers/chatController.js

// ... (previous imports)

const getOrCreatePrivateChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { userId, otherUserId } = req.body;

    // Check if private chat already exists
    const existingChat = await Chat.findOne({
      where: {
        type: 'private'
      },
      include: [{
        model: ChatParticipant,
        where: {
          userId: [userId, otherUserId]
        },
        attributes: ['chatId'],
        group: ['chatId'],
        having: sequelize.where(
          sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('participants.userId'))),
          2
        )
      }]
    });

    if (existingChat) {
      await transaction.commit();
      return res.status(200).json(existingChat);
    }

    // Create new private chat
    const chat = await Chat.create({
      type: 'private'
    }, { transaction });

    // Add both participants
    await ChatParticipant.bulkCreate([
      { chatId: chat.id, userId, role: 'member' },
      { chatId: chat.id, userId: otherUserId, role: 'member' }
    ], { transaction });

    await transaction.commit();
    res.status(201).json(chat);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to create/find private chat" });
  }
};

// Enhanced get user chats with last message
const getUserChatsWithLastMessage = async (req, res) => {
  try {
    const userId = req.params.userId;

    const chats = await ChatParticipant.findAll({
      where: { userId },
      include: [
        {
          model: Chat,
          as: "chat",
          include: [
            { model: Class, as: "class" },
            { model: Subject, as: "subject" },
            {
              model: ChatParticipant,
              as: "participants",
              include: [{ model: User, as: "user" }],
            },
            {
              model: Message,
              as: "messages",
              separate: true,
              limit: 1,
              order: [['createdAt', 'DESC']],
              include: [{ model: User, as: "sender" }]
            }
          ],
        },
      ],
    });

    const formattedChats = chats.map(p => ({
      ...p.chat.toJSON(),
      lastMessage: p.chat.messages?.[0] || null
    }));

    res.status(200).json(formattedChats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
};


// Create a new chat - Reworked
const createChat = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { type, participants, classId, subjectId, name } = req.body;
    const creatorId = req.user.id; // Assuming user ID is available from authentication middleware

    // Validate input based on chat type
    if (!['private', 'group', 'class', 'subject', 'public_group'].includes(type)) {
      return res.status(400).json({ error: 'Invalid chat type provided.' });
    }

    if (type === 'private' && (!participants || participants.length !== 1)) {
        return res.status(400).json({ error: 'Private chat creation requires exactly one other participant.' });
    }
    if (type === 'group' && (!participants || participants.length < 1)) { // Participants here means other users than creator
        return res.status(400).json({ error: 'Group chat requires at least one other participant.' });
    }
    if (['class', 'subject'].includes(type) && (!classId && !subjectId)) {
        return res.status(400).json({ error: `${type} chat requires a ${type}Id.` });
    }
    if (type === 'public_group' && !name) {
        return res.status(400).json({ error: 'Public group chat requires a name.' });
    }
    if (type !== 'private' && !name) { // All non-private chats need a name
        return res.status(400).json({ error: 'Group, class, subject, or public chat requires a name.' });
    }


    let finalParticipants = new Set([creatorId]); // Creator is always a participant
    let chatName = name; // Default name

    // Handle participants based on type
    if (type === 'class') {
      // Fetch all students in the class
      const students = await User.findAll({
        include: [{ model: sequelize.models.Student, as: 'student', where: { currentClassId: classId } }],
        attributes: ['id']
      });
      // Fetch teachers assigned to this class
      const teachers = await User.findAll({
        include: [{ model: sequelize.models.Teacher, as: 'teacher',
            include: [{ model: sequelize.models.TeachingAssignment, as: 'teachingAssignments', where: { classId: classId } }]
        }],
        attributes: ['id']
      });
      students.forEach(s => finalParticipants.add(s.id));
      teachers.forEach(t => finalParticipants.add(t.id));
      const classObj = await Class.findByPk(classId, { transaction });
      chatName = classObj ? `Class ${classObj.name} Chat` : `Class Chat`;
    } else if (type === 'subject') {
      // This logic is more complex and depends on how students and teachers are linked to subjects.
      // You'd need to query students enrolled in the subject and teachers teaching it.
      // For now, if no specific logic, treat it like a 'group' with explicit participants.
      participants.forEach(p => finalParticipants.add(p));
      const subjectObj = await Subject.findByPk(subjectId, { transaction });
      chatName = subjectObj ? `${subjectObj.name} Chat` : `Subject Chat`;
    } else if (type === 'group' || type === 'private') {
      participants.forEach(p => finalParticipants.add(p));
      if (type === 'private') {
          // Ensure no existing private chat between these two
          const existingChat = await Chat.findOne({
              where: { type: 'private' },
              include: [{
                  model: ChatParticipant,
                  as: 'participants',
                  where: { userId: { [Op.in]: [creatorId, participants[0]] } },
                  attributes: [], // No need to return participant attributes here
                  group: ['chat.id'], // Group by chat ID to count distinct participants
                  having: sequelize.where(sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('participants.userId'))), 2)
              }]
          });
          if (existingChat) {
              await transaction.rollback();
              return res.status(200).json({ message: 'Private chat already exists', chat: existingChat });
          }
          chatName = null; // Private chats typically don't have an explicit name field
      }
    } else if (type === 'public_group') {
        // No initial participants added, users join later
        finalParticipants = new Set();
    }


    const chat = await Chat.create(
      {
        type,
        classId: type === "class" ? classId : null,
        subjectId: type === "subject" ? subjectId : null,
        name: chatName,
        isPublic: type === 'public_group', // Set isPublic based on type
      },
      { transaction }
    );

    // Add participants only if not a public_group chat (or if public_group but creator is added)
    if (finalParticipants.size > 0) {
        const chatParticipantsData = Array.from(finalParticipants).map(userId => ({
            chatId: chat.id,
            userId,
            role: "member", // Default role
        }));
        await ChatParticipant.bulkCreate(chatParticipantsData, { transaction });
    }


    await transaction.commit();
    res.status(201).json(chat);
  } catch (err) {
    await transaction.rollback();
    console.error(`Error creating chat: ${err.message}`, err);
    res.status(500).json({ error: "Failed to create chat" });
  }
};

// New: Join a public chat
const joinPublicChat = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { chatId } = req.params;
        const userId = req.user.id; // Current user

        const chat = await Chat.findByPk(chatId, { transaction });
        if (!chat || chat.type !== 'public_group' || !chat.isPublic) {
            return res.status(404).json({ error: 'Chat not found or is not a joinable public group.' });
        }

        const [chatParticipant, created] = await ChatParticipant.findOrCreate({
            where: { chatId, userId },
            defaults: { role: 'member' },
            transaction,
        });

        if (!created) {
            return res.status(200).json({ message: 'User is already a participant of this chat.' });
        }

        await transaction.commit();
        res.status(200).json({ message: 'Successfully joined public chat.' });
    } catch (err) {
        await transaction.rollback();
        console.error(`Error joining public chat: ${err.message}`, err);
        res.status(500).json({ error: 'Failed to join public chat.' });
    }
};

// New: Get public chats a user can join (or are public and visible)
const getJoinablePublicChats = async (req, res) => {
    try {
        const userId = req.user.id;

        const joinableChats = await Chat.findAll({
            where: {
                type: 'public_group',
                isPublic: true,
                // Ensure the user is NOT already a participant
                '$participants.userId$': { [Op.not]: userId } // This requires a LEFT JOIN
            },
            include: [
                {
                    model: ChatParticipant,
                    as: 'participants',
                    attributes: ['userId'],
                    required: false // LEFT JOIN to include chats where user is not a participant
                }
            ]
        });
         // Filter out chats where the user is already a participant in memory (if $participants.userId$ with Op.not doesn't work as expected)
        const filteredChats = joinableChats.filter(chat => !chat.participants.some(p => p.userId === userId));


        res.status(200).json(filteredChats);
    } catch (err) {
        console.error(`Error fetching joinable public chats: ${err.message}`, err);
        res.status(500).json({ error: 'Failed to fetch joinable public chats.' });
    }
};

module.exports = {
  createChat,
  getUserChats,
  getUserChatsWithLastMessage,
  getOrCreatePrivateChat,
  addParticipants,
  joinPublicChat, // Export new function
  getJoinablePublicChats, // Export new function
};
const asyncHandler = require('../middlewares/asyncHandler');
const db = require('../models'); // Your Sequelize models setup

// Helper to get all students in a class (assuming Student is a User with role 'student')
const getStudentsInClass = async (classId) => {
    // This assumes you have a relationship between User and Class, e.g., through a 'StudentClass' join table
    // or a 'classId' column on the User model for students.
    // For simplicity, let's assume students have a `classId` directly or we can fetch them via a Class model.
    // You might need to adjust this based on your actual Class/Student model relationship.
    const students = await db.User.findAll({
        where: { role: 'student' /* and potentially classId: classId */ },
        attributes: ['id', 'firstName', 'lastName', 'username'],
        // Include any related Class model if necessary
        // include: [{ model: db.Class, where: { id: classId }}]
    });
    return students;
};


// Get assessments relevant for a teacher to mark
const getAssessmentsForMarking = asyncHandler(async (req, res) => {
    const { teacherId, subjectId, classId } = req.params;
    // Assuming a teacher is assigned to teach a specific subject to a specific class.
    // You might need a 'TeacherAssignment' model to link teachers to subjects and classes.
    // For this example, let's just fetch assessments for the given subject and class for the current academic year/term.

    // Fetch current academic year and term (You'll need a mechanism for this, e.g., from settings or a dedicated model)
    const currentAcademicYear = await db.AcademicYear.findOne({ where: { isCurrent: true } });
    const currentTerm = await db.Term.findOne({ where: { isCurrent: true } });

    if (!currentAcademicYear || !currentTerm) {
        return res.status(400).json({ error: "Current academic year or term not set." });
    }

    const assessments = await db.Assessment.findAll({
        where: {
            subjectId: subjectId,
            academicYearId: currentAcademicYear.id,
            termId: currentTerm.id,
            // Potentially add classId here if assessments are class-specific
        },
        include: [
            { model: db.AssessmentType, attributes: ['name', 'weight'] },
            { model: db.Subject, attributes: ['name'] }
        ],
        order: [['date', 'ASC']]
    });

    res.status(200).json(assessments);
});


// Get students and their scores for a specific assessment (for pre-filling/editing)
const getStudentScoresForAssessment = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;

    const assessment = await db.Assessment.findByPk(assessmentId);
    if (!assessment) {
        return res.status(404).json({ error: "Assessment not found." });
    }

    // Assuming you can determine the class(es) associated with this assessment
    // For simplicity, let's assume you fetch all students and filter by those
    // who should be taking this assessment (e.g., all students in a specific class).
    // This part is crucial and depends on how you link students to classes and classes to assessments.
    // For now, let's fetch all students and their scores for this assessment.
    // You might need to fetch students belonging to the class this assessment is for.
    const studentsInRelevantClass = await getStudentsInClass(null); // Refine this to pass actual classId

    const studentScores = await db.StudentAssessmentScore.findAll({
        where: { assessmentId: assessmentId },
        include: [{ model: db.User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }]
    });

    // Merge students with their scores for easy frontend consumption
    const data = studentsInRelevantClass.map(student => {
        const scoreEntry = studentScores.find(s => s.studentId === student.id);
        return {
            studentId: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            score: scoreEntry ? scoreEntry.score : null,
            comment: scoreEntry ? scoreEntry.comment : null,
            maxScore: assessment.maxScore // Useful for frontend validation
        };
    });

    res.status(200).json({ assessment, students: data });
});

// Submit/Update scores for multiple students for an assessment
const submitStudentScores = asyncHandler(async (req, res) => {
    const { assessmentId } = req.params;
    const { scores } = req.body; // scores is an array: [{ studentId, score, comment }]

    if (!Array.isArray(scores) || scores.length === 0) {
        return res.status(400).json({ error: "Scores array is required and cannot be empty." });
    }

    const assessment = await db.Assessment.findByPk(assessmentId);
    if (!assessment) {
        return res.status(404).json({ error: "Assessment not found." });
    }

    const transaction = await db.sequelize.transaction();
    try {
        const results = [];
        for (const scoreEntry of scores) {
            const { studentId, score, comment } = scoreEntry;

            if (score === null || score === undefined || isNaN(score)) {
                // Allow null/undefined scores for students who didn't take the exam, or skip them
                // Depending on business logic, you might want to enforce score presence
                results.push({ studentId, status: 'skipped', message: 'Score is null/undefined' });
                continue;
            }

            if (score < 0 || score > assessment.maxScore) {
                await transaction.rollback();
                return res.status(400).json({ error: `Score for student ${studentId} must be between 0 and ${assessment.maxScore}.` });
            }

            const [studentScore, created] = await db.StudentAssessmentScore.findOrCreate({
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
        console.error("Error submitting student scores:", error);
        res.status(500).json({ error: "Failed to submit student scores." });
    }
});

module.exports = {
    getAssessmentsForMarking,
    getStudentScoresForAssessment,
    submitStudentScores,
};

const { Message, Chat, User } = require("../models");
const { sequelize } = require("../models");

// Send a message
const sendMessage = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { chatId, content, parentMessageId } = req.body;
    const senderId = req.user.id; // Assuming authenticated user

    // Verify chat exists and user is participant
    const participant = await ChatParticipant.findOne({
      where: { chatId, userId: senderId },
      transaction,
    });

    if (!participant) {
      await transaction.rollback();
      return res.status(403).json({ error: "Not a chat participant" });
    }

    const message = await Message.create(
      {
        chatId,
        content,
        senderId,
        parentMessageId: parentMessageId || null,
      },
      { transaction }
    );

    // Update last seen for sender
    participant.lastSeen = new Date();
    await participant.save({ transaction });

    await transaction.commit();

    // Populate sender info for real-time delivery
    const messageWithSender = await Message.findByPk(message.id, {
      include: [{ model: User, as: "sender" }],
    });

    res.status(201).json(messageWithSender);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to send message" });
  }
};

// Get messages for a chat
const getChatMessages = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user.id;

    // Verify user is chat participant
    const participant = await ChatParticipant.findOne({
      where: { chatId, userId },
    });

    if (!participant) {
      return res.status(403).json({ error: "Not a chat participant" });
    }

    // Update last seen
    participant.lastSeen = new Date();
    await participant.save();

    const messages = await Message.findAll({
      where: { chatId },
      include: [
        { model: User, as: "sender" },
        {
          model: Message,
          as: "replies",
          include: [{ model: User, as: "sender" }],
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    res.status(200).json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// Reply to a message
const replyToMessage = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { content } = req.body;
    const parentMessageId = req.params.messageId;
    const senderId = req.user.id;

    // Get parent message to inherit chatId
    const parentMessage = await Message.findByPk(parentMessageId, {
      transaction,
    });

    if (!parentMessage) {
      await transaction.rollback();
      return res.status(404).json({ error: "Parent message not found" });
    }

    // Verify user is chat participant
    const participant = await ChatParticipant.findOne({
      where: { chatId: parentMessage.chatId, userId: senderId },
      transaction,
    });

    if (!participant) {
      await transaction.rollback();
      return res.status(403).json({ error: "Not a chat participant" });
    }

    const message = await Message.create(
      {
        chatId: parentMessage.chatId,
        content,
        senderId,
        parentMessageId,
      },
      { transaction }
    );

    // Update last seen for sender
    participant.lastSeen = new Date();
    await participant.save({ transaction });

    await transaction.commit();

    // Populate sender info
    const messageWithSender = await Message.findByPk(message.id, {
      include: [{ model: User, as: "sender" }],
    });

    res.status(201).json(messageWithSender);
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to reply to message" });
  }
};

module.exports = {
  sendMessage,
  getChatMessages,
  replyToMessage,
};
const { validationResult } = require("express-validator");
const { Parent, User } = require("../models");
const { sequelize } = require("../models");
const bcrypt = require("bcryptjs");

// Create a new parent (and associated user)
const createParent = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const transaction = await sequelize.transaction();
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      password,
      phone,
      address,
      sex,
    } = req.body;

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // First create the User
    const user = await User.create(
      {
        firstName,
        lastName,
        username,
        email,
        password: hashedPassword,
        phone,
        address,
        sex,
        role: "parent",
      },
      { transaction }
    );

    // Then create the Parent with the same ID as User
    const parent = await Parent.create(
      {
        id: user.id, // Using same ID as user
      },
      { transaction }
    );

    await transaction.commit();

    // Return combined data with parent number
    const response = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      address: user.address,
      sex: user.sex,
      role: user.role,
      parentNumber: parent.parentNumber,
      profilePhoto:user.profilePhoto,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    dob: user.dob, // Assuming it will be converted to Date object on frontend or kept as string
    isActive:user.isActive,
    deletedAt: user.deletedAt,
  
    };

    res.status(201).json(response);
  } catch (err) {
    await transaction.rollback();
    console.error(err);

    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error: "Username or email already exists",
      });
    }

    res.status(500).json({ error: "Failed to create parent" });
  }
};

// Get all parents with basic user info and parent numbers
const getParents = async (req, res) => {
 
  try {
    const parents = await Parent.findAll({
      attributes: ["id", "parentNumber"],
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "firstName",
            "lastName",
            "email",
            "phone",
            "address",
            "sex",
            "dob",
            "isActive",
            "profilePhoto",
            "deletedAt",
            "createdAt",
            "updatedAt",
          ],
        },
      ],
    });

    // Transform the data to a more client-friendly format
    const formattedParents = parents.map((parent) => ({
      id: parent.id,
      parentNumber: parent.parentNumber,
      ...parent.user.get({ plain: true }),
    }));

    res.status(200).json(formattedParents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch parents" });
  }
};

// Get parent by ID with parent number
const getParentById = async (req, res) => {
  try {
    const parent = await Parent.findByPk(req.params.id, {
      attributes: ["id", "parentNumber"],
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "firstName",
            "lastName",
            "email",
            "phone",
            "address",
            "sex",
            "profilePhoto",
          ],
        },
      ],
    });

    if (!parent) {
      return res.status(404).json({ error: "Parent not found" });
    }

    // Construct the response object with parent number
    const response = {
      id: parent.id,
      parentNumber: parent.parentNumber,
      ...parent.user.get({ plain: true }),
    };

    // Add profile photo URL if exists
    if (response.profilePhoto) {
      response.profilePhoto = `${req.protocol}://${req.get("host")}${
        response.profilePhoto
      }`;
    }

    res.status(200).json(response);
  } catch (err) {
    console.error("Error fetching parent:", err);
    res.status(500).json({
      error: "Failed to fetch parent details",
      details: err.message,
    });
  }
};

// Update parent information
const updateParent = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const transaction = await sequelize.transaction();
  try {
    const parent = await Parent.findByPk(req.params.id, { transaction });
    if (!parent) {
      await transaction.rollback();
      return res.status(404).json({ error: "Parent not found" });
    }

    // Since we're using shared IDs, we can find the user by the same ID
    const user = await User.findByPk(parent.id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: "Associated user not found" });
    }

    const {
      firstName,
      lastName,
      username,
      email,
      phone,
      address,
      sex,
      profilePhoto,
    } = req.body;

    // Prepare user update fields
    const userUpdateFields = {};
    if (firstName !== undefined) userUpdateFields.firstName = firstName;
    if (lastName !== undefined) userUpdateFields.lastName = lastName;
    if (username !== undefined) userUpdateFields.username = username;
    if (email !== undefined) userUpdateFields.email = email;
    if (phone !== undefined) userUpdateFields.phone = phone;
    if (address !== undefined) userUpdateFields.address = address;
    if (sex !== undefined) userUpdateFields.sex = sex;
    if (profilePhoto !== undefined)
      userUpdateFields.profilePhoto = profilePhoto;

    // Update user record
    await user.update(userUpdateFields, { transaction });

    // Reload both records to get updated data
    await user.reload({ transaction });
    await parent.reload({ transaction });

    await transaction.commit();

    // Construct response with parent number
    const response = {
      id: parent.id,
      parentNumber: parent.parentNumber,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      phone: user.phone,
      address: user.address,
      sex: user.sex,
      profilePhoto: user.profilePhoto,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json(response);
  } catch (err) {
    await transaction.rollback();
    console.error("Error updating parent:", err);

    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({
        error: "Username or email already exists",
        details: err.errors?.map((e) => e.message) || err.message,
      });
    }

    res.status(500).json({
      error: "Failed to update parent",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

// Delete a parent and associated user
const deleteParent = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    // Find parent by ID (which is the same as user ID)
    const parent = await Parent.findByPk(req.params.id, { transaction });
    if (!parent) {
      await transaction.rollback();
      return res.status(404).json({ error: "Parent not found" });
    }

    // Find user by the same ID
    const user = await User.findByPk(parent.id, { transaction });
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ error: "Associated user not found" });
    }

    // Delete both records
    await parent.destroy({ transaction });
    await user.destroy({ transaction });

    await transaction.commit();
    res.status(204).end();
  } catch (err) {
    await transaction.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to delete parent" });
  }
};

module.exports = {
  createParent,
  getParents,
  getParentById,
  updateParent,
  deleteParent,
};
const { Post, Comment, User, Class, Subject } = require('../models'); // Import all necessary models
const { sequelize, Op } = require('../models'); // Import Op for Sequelize operators

// Create a new post
const createPost = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { title, content, type, visibility, classId, subjectId, eventDate, location } = req.body;
    const authorId = req.user.id; // Assumes req.user is populated by your authentication middleware

    // Authorization check: Only admins or specific roles can create certain post types
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can create posts.' });
    }
    // Further granular checks: e.g., teachers can create class_specific posts for their classes

    const post = await Post.create({
      title, content, authorId, type, visibility, classId, subjectId, eventDate, location
    }, { transaction });

    await transaction.commit();
    res.status(201).json(post);
  } catch (err) {
    await transaction.rollback();
    console.error(`Error creating post: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to create post' });
  }
};

// Get all posts, with robust filtering based on user role and post visibility
const getPosts = async (req, res) => {
  try {
  

    
      // Add subject-specific visibility (more complex, depends on how students/teachers are linked to subjects)
      // You'd need to fetch all subjects the user is associated wit

    const posts = await Post.findAll({
      include: [
        { model: User, as: 'author', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePhoto'] },
        {
          model: Comment,
          as: 'comments',
          separate: true, // Important for ordering comments per post
          order: [['createdAt', 'ASC']],
          include: [
            { model: User, as: 'author', attributes: ['id', 'username', 'firstName', 'lastName'] },
            { model: Comment, as: 'replies', include: [{ model: User, as: 'author', attributes: ['id', 'username'] }] } // Nested replies
          ]
        },
        { model: Class, as: 'class', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']], // Latest posts first
    });

    res.status(200).json(posts);
  } catch (err) {
    console.error(`Error fetching posts: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
};

// Create a comment on a post
const createComment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;
    const authorId = req.user.id; // Current user ID from auth

    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = await Comment.create({
      content, authorId, postId, parentCommentId
    }, { transaction });

    await transaction.commit();
    res.status(201).json(comment);
  } catch (err) {
    await transaction.rollback();
    console.error(`Error creating comment: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

module.exports = {
  createPost,
  getPosts,
  createComment,
  // Add more: getPostById, updatePost, deletePost, updateComment, deleteComment
};
const {
    SchoolYear,
    Term,
    Class,
    ClassLevel,
    Teacher,
    Subject,
    Department,
    TeachingAssignment,
    Student,
    Lesson,
    User,
    sequelize
  } = require("../models");
const { validationResult } = require("express-validator");
const asyncHandler  = require("../middlewares/asyncHandler");
  
  // School Year Controllers
  const createSchoolYear = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    const transaction = await sequelize.transaction();
    try {
      const { name, startDate, endDate, isCurrent = false } = req.body;
  
      
      const school = await SchoolYear.findOne({
        where: { name},
        paranoid: false,
        transaction,
      });

      if (school) {
        return res.status(400).json({ error: "School year name must be unique" });
      }
      // If setting as current, ensure only one current school year exists
      // if (isCurrent) {
      //   await SchoolYear.update(
      //     { isCurrent: false },
      //     { where: {}, transaction }
      //   );
      // }
  
      const schoolYear = await SchoolYear.create({
        name,
        startDate,
        endDate,
        isCurrent
      }, { transaction });
  
      await transaction.commit();
      res.status(201).json(schoolYear);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(400).json({ error: "School year name must be unique" });
      }
      
      res.status(500).json({ error: "Failed to create school year" });
    }
  };
  
  const getAllSchoolYears = async (req, res) => {
    try {
      const schoolYears = await SchoolYear.findAll({
        order: [["startDate", "DESC"]],
        include: [
          {
            model: Term,
            as: "terms",
            order: [["startDate", "ASC"]]
          }
        ]
      });
      res.status(200).json(schoolYears);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch school years" });
    }
  };
  
  const updateSchoolYear = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    const transaction = await sequelize.transaction();
    try {
      const { name, startDate, endDate, isCurrent } = req.body;
      const schoolYear = await SchoolYear.findByPk(req.params.id, { transaction });
  
      if (!schoolYear) {
        await transaction.rollback();
        return res.status(404).json({ error: "School year not found" });
      }
  
      // If setting as current, ensure only one current school year exists
      if (isCurrent) {
        await SchoolYear.update(
          { isCurrent: false },
          { 
            where: { id: { [sequelize.Op.ne]: schoolYear.id } },
            transaction 
          }
        );
      }
  
      await schoolYear.update({ name, startDate, endDate, isCurrent }, { transaction });
      await transaction.commit();
      res.status(200).json(schoolYear);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to update school year" });
    }
  };
  
  const deleteSchoolYear = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const schoolYear = await SchoolYear.findByPk(req.params.id, { transaction });
      if (!schoolYear) {
        await transaction.rollback();
        return res.status(404).json({ error: "School year not found" });
      }
  
      // Check if school year has associated terms
      const termCount = await Term.count({
        where: { schoolYearId: schoolYear.id },
        transaction
      });
  
      if (termCount > 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: "Cannot delete school year with associated terms" 
        });
      }
  
      await schoolYear.destroy({ transaction });
      await transaction.commit();
      res.status(204).end();
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete school year" });
    }
  };
  
  // Term Controllers
  const createTerm = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    const transaction = await sequelize.transaction();
    try {
      const { tname, startDate, endDate, isCurrent, schoolYearId } = req.body;
  
      // Validate school year exists
      const schoolYear = await SchoolYear.findByPk(schoolYearId, { transaction });
      if (!schoolYear) {
        await transaction.rollback();
        return res.status(404).json({ error: "School year not found" });
      }
  
      // Check for date conflicts within the same school year
      const conflictingTerm = await Term.findOne({
        where: {
          schoolYearId,
         tname
        },
        transaction
      });
  
      if (conflictingTerm) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: "Term dates conflict with existing term in this school year" 
        });
      }
  
      // If setting as current, ensure only one current term exists
      if (isCurrent) {
        await Term.update(
          { isCurrent: false },
          { where: {}, transaction }
        );
      }
  
      const term = await Term.create({
        tname,
        startDate,
        endDate,
        isCurrent,
        schoolYearId
      }, { transaction });
  
      await transaction.commit();
      res.status(201).json(term);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(400).json({ 
          error: "Term with this name already exists in this school year" 
        });
      }
      
      res.status(500).json({ error: "Failed to create term" });
    }
  };
  
  const getAllTerms = async (req, res) => {
    try {
      const terms = await Term.findAll({
        order: [["startDate", "ASC"]],
        include: [
          {
            model: SchoolYear,
            as: "schoolYear"
          },
          // {
          //   model: TeachingAssignment,
          //   as: "teachingAssignments",
          //   include: [
          //     { model: Subject, as: "subject" },
          //     { model: Class, as: "class" },
          //     { 
          //       model: Teacher, 
          //       as: "teacher",
          //       include: [{ model: User, as: "user" }]
          //     }
          //   ]
          // }
        ]
      });
      res.status(200).json(terms);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch terms" });
    }
  };
  
  const updateTerm = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    const transaction = await sequelize.transaction();
    try {
      const { tname, startDate, endDate, isCurrent, schoolYearId } = req.body;
      const term = await Term.findByPk(req.params.id, { transaction });
  
      if (!term) {
        await transaction.rollback();
        return res.status(404).json({ error: "Term not found" });
      }
  
      // If changing school year, validate it exists
      if (schoolYearId && schoolYearId !== term.schoolYearId) {
        const schoolYear = await SchoolYear.findByPk(schoolYearId, { transaction });
        if (!schoolYear) {
          await transaction.rollback();
          return res.status(404).json({ error: "School year not found" });
        }
      }
  
      // Check for date conflicts within the same school year
      const conflictingTerm = await Term.findOne({
        where: {
          schoolYearId: schoolYearId || term.schoolYearId,
          id: { [sequelize.Op.ne]: term.id },
          [sequelize.Op.or]: [
            {
              startDate: { [sequelize.Op.lte]: endDate },
              endDate: { [sequelize.Op.gte]: startDate }
            }
          ]
        },
        transaction
      });
  
      if (conflictingTerm) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: "Term dates conflict with existing term in this school year" 
        });
      }
  
      // If setting as current, ensure only one current term exists
      if (isCurrent) {
        await Term.update(
          { isCurrent: false },
          { 
            where: { id: { [sequelize.Op.ne]: term.id } },
            transaction 
          }
        );
      }
  
      await term.update({ 
        tname, 
        startDate, 
        endDate, 
        isCurrent, 
        schoolYearId: schoolYearId || term.schoolYearId 
      }, { transaction });
  
      await transaction.commit();
      res.status(200).json(term);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to update term" });
    }
  };
  
  const deleteTerm = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const term = await Term.findByPk(req.params.id, { transaction });
      if (!term) {
        await transaction.rollback();
        return res.status(404).json({ error: "Term not found" });
      }
  
      // Check if term has associated teaching assignments
      const assignmentCount = await TeachingAssignment.count({
        where: { termId: term.id },
        transaction
      });
  
      if (assignmentCount > 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: "Cannot delete term with associated teaching assignments" 
        });
      }
  
      await term.destroy({ transaction });
      await transaction.commit();
      res.status(204).end();
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete term" });
    }
  };
  
  
  //class Controllers
  const getAllClasses = async (req, res) => {
    try {
      const classes = await Class.findAll({
        include: [
          {
            model: Teacher,
            as: "supervisor",
            include: [{ model: User, as: "user" }]
          },
          {
            model: ClassLevel,
            as: "classLevel"
          },
          {
            model: Student,
            as: "students",
            include: [{ model: User, as: "user" }]
          }
        ]
      });
      res.status(200).json(classes);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch classes" });
    }
  };
  
  const updateClass = async (req, res) => {
    const errors = validationResult(req);
   
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    const transaction = await sequelize.transaction();
    try {
      const { name, capacity, supervisorId, gradeId } = req.body;
      const classToUpdate = await Class.findByPk(req.params.id, { transaction });
  
      if (!classToUpdate) {
        await transaction.rollback();
        return res.status(404).json({ error: "Class not found" });
      }
  
      // Validate supervisor exists if provided
      if (supervisorId) {
        const supervisor = await Teacher.findByPk(supervisorId, { transaction });
        if (!supervisor) {
          await transaction.rollback();
          return res.status(404).json({ error: "Supervisor teacher not found" });
        }
      }
  
      // Validate grade exists if provided
      if (gradeId) {
        const grade = await ClassLevel.findByPk(gradeId, { transaction });
        if (!grade) {
          await transaction.rollback();
          return res.status(404).json({ error: "Grade not found" });
        }
      }
  
      await classToUpdate.update({ 
        name, 
        capacity, 
        supervisorId, 
        gradeId 
      }, { transaction });
  
      await transaction.commit();
      res.status(200).json(classToUpdate);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(400).json({ error: "Class name must be unique" });
      }
      
      res.status(500).json({ error: "Failed to update class" });
    }
  };
  
  const deleteClass = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const classToDelete = await Class.findByPk(req.params.id, { transaction });
      if (!classToDelete) {
        await transaction.rollback();
        return res.status(404).json({ error: "Class not found" });
      }
  
      // Check if class has students
      const studentCount = await Student.count({
        where: { currentClassId: classToDelete.id },
        transaction
      });
  
      if (studentCount > 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          error: "Cannot delete class with assigned students" 
        });
      }
  
      await classToDelete.destroy({ transaction });
      await transaction.commit();
      res.status(204).end();
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete class" });
    }
};
  // Add getSchoolYearById
const getSchoolYearById = async (req, res) => {
    try {
      const schoolYear = await SchoolYear.findByPk(req.params.id, {
        include: [
          {
            model: Term,
            as: "terms",
            order: [["startDate", "ASC"]]
          }
        ]
      });
  
      if (!schoolYear) {
        return res.status(404).json({ error: "School year not found" });
      }
  
      res.status(200).json(schoolYear);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch school year" });
    }
  };
  
  // Term Controllers (existing methods remain the same)
  // ... (keep all existing term methods)
  
  // Add getTermById
  const getTermById = async (req, res) => {
    try {
      const term = await Term.findByPk(req.params.id, {
        include: [
          {
            model: SchoolYear,
            as: "schoolYear"
          },
          {
            model: TeachingAssignment,
            as: "teachingAssignments",
            include: [
              { model: Subject, as: "subject" },
              { model: Class, as: "class" },
              { 
                model: Teacher, 
                as: "teacher",
                include: [{ model: User, as: "user" }]
              }
            ]
          }
        ]
      });
  
      if (!term) {
        return res.status(404).json({ error: "Term not found" });
      }
  
      res.status(200).json(term);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch term" });
    }
  };
  
  // Class Controllers (existing methods remain the same)
  // ... (keep all existing class methods)
  
  // Add getClassById
  const getClassById = async (req, res) => {
    try {
      const classObj = await Class.findByPk(req.params.id, {
        include: [
          {
            model: Teacher,
            as: "supervisor",
            include: [{ model: User, as: "user" }]
          },
          {
            model: ClassLevel,
            as: "grade"
          },
          {
            model: Student,
            as: "students",
            include: [{ model: User, as: "user" }]
          }
        ]
      });
  
      if (!classObj) {
        return res.status(404).json({ error: "Class not found" });
      }
  
      res.status(200).json(classObj);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch class" });
    }
  };
  
  // Add getClassAssignments
  const getClassAssignments = async (req, res) => {
    try {
      const assignments = await TeachingAssignment.findAll({
        where: { classId: req.params.id },
        include: [
          { model: Subject, as: "subject" },
          { 
            model: Teacher, 
            as: "teacher",
            include: [{ model: User, as: "user" }]
          },
          { model: Term, as: "term" },
          { model: SchoolYear, as: "schoolYear" }
        ]
      });
  
      res.status(200).json(assignments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch class assignments" });
    }
  };
  
  // Add getClassSchedule
  const getClassSchedule = async (req, res) => {
    try {
      const schedule = await Lesson.findAll({
        where: { classId: req.params.id },
        include: [
          { model: Subject, as: "subject" },
          { 
            model: Teacher, 
            as: "teacher",
            include: [{ model: User, as: "user" }]
          },
          { model: Term, as: "term" }
        ],
        order: [
          ['day', 'ASC'],
          ['startTime', 'ASC']
        ]
      });
  
      res.status(200).json(schedule);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch class schedule" });
    }
};

// Class Level (Grade) Controllers
const createClassLevel = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

  const transaction = await sequelize.transaction();
  try {
      const { level, description } = req.body;

      // Check if class level already exists
      const existingLevel = await ClassLevel.findOne({
          where: { level },
          paranoid: false,
          transaction
      });

      if (existingLevel) {
          await transaction.rollback();
          return res.status(400).json({ error: "Class level already exists" });
      }

      const classLevel = await ClassLevel.create({
          level,
          description: description || `Form ${level}`
      }, { transaction });

      await transaction.commit();
      res.status(201).json(classLevel);
  } catch (err) {
      await transaction.rollback();
      console.error(err);

      if (err.name === "SequelizeUniqueConstraintError") {
          return res.status(400).json({ error: "Class level must be unique" });
      }

      res.status(500).json({ error: "Failed to create class level" });
  }
};

const getAllClassLevels = async (req, res) => {
  try {
      const classLevels = await ClassLevel.findAll({
          order: [["level", "ASC"]],
          include: [
              {
                  model: Class,
                  as: "classes",
                  include: [
                      {
                          model: Term,
                          as: "term"
                      }
                  ]
              }
          ]
      });
      res.status(200).json(classLevels);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch class levels" });
  }
};

const getClassLevelById = async (req, res) => {
  try {
      const classLevel = await ClassLevel.findByPk(req.params.id, {
          include: [
              {
                  model: Class,
                  as: "classes",
                  include: [
                      {
                          model: Term,
                          as: "term",
                          include: [
                              {
                                  model: SchoolYear,
                                  as: "schoolYear"
                              }
                          ]
                      },
                      {
                          model: Student,
                          as: "students",
                          include: [
                              {
                                  model: User,
                                  as: "user"
                              }
                          ]
                      }
                  ]
              }
          ]
      });

      if (!classLevel) {
          return res.status(404).json({ error: "Class level not found" });
      }

      res.status(200).json(classLevel);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch class level" });
  }
};

const updateClassLevel = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

  const transaction = await sequelize.transaction();
  try {
      const { level, description } = req.body;
      const classLevel = await ClassLevel.findByPk(req.params.id, { transaction });

      if (!classLevel) {
          await transaction.rollback();
          return res.status(404).json({ error: "Class level not found" });
      }

      // Check if level is being changed and if the new level already exists
      if (level && level !== classLevel.level) {
          const existingLevel = await ClassLevel.findOne({
              where: { level },
              paranoid: false,
              transaction
          });

          if (existingLevel) {
              await transaction.rollback();
              return res.status(400).json({ error: "Class level already exists" });
          }
      }

      await classLevel.update({
          level: level || classLevel.level,
          description: description || classLevel.description
      }, { transaction });

      await transaction.commit();
      res.status(200).json(classLevel);
  } catch (err) {
      await transaction.rollback();
      console.error(err);

      if (err.name === "SequelizeUniqueConstraintError") {
          return res.status(400).json({ error: "Class level must be unique" });
      }

      res.status(500).json({ error: "Failed to update class level" });
  }
};

const deleteClassLevel = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
      const classLevel = await ClassLevel.findByPk(req.params.id, { transaction });

      if (!classLevel) {
          await transaction.rollback();
          return res.status(404).json({ error: "Class level not found" });
      }

      // Check if class level has associated classes
      const classCount = await Class.count({
          where: { classLevelId: classLevel.id },
          transaction
      });

      if (classCount > 0) {
          await transaction.rollback();
          return res.status(400).json({
              error: "Cannot delete class level with associated classes"
          });
      }

      await classLevel.destroy({ transaction });
      await transaction.commit();
      res.status(204).end();
  } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete class level" });
  }
};

// Update the Class controller methods to use classLevelId instead of gradeId
const createClass = async (req, res) => {
  const errors = validationResult(req);
  console.log(req.body);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

  const transaction = await sequelize.transaction();
  try {
      const { name, capacity, supervisorId, classLevelId, termId } = req.body;

      // Validate supervisor exists if provided
      if (supervisorId) {
          const supervisor = await Teacher.findByPk(supervisorId, { transaction });
          if (!supervisor) {
              await transaction.rollback();
              return res.status(404).json({ error: "Supervisor teacher not found" });
          }
      }

      // Validate class level exists
      const classLevel = await ClassLevel.findByPk(classLevelId, { transaction });
      if (!classLevel) {
          await transaction.rollback();
          return res.status(404).json({ error: "Class level not found" });
      }

      // Validate term exists
      const term = await Term.findByPk(termId, { transaction });
      if (!term) {
          await transaction.rollback();
          return res.status(404).json({ error: "Term not found" });
      }

      const newClass = await Class.create({
          name,
          capacity,
          supervisorId,
        classLevelId,
          schoolYearId: term.schoolYearId, // Use term's school year
          termId,
      }, { transaction });

      // Include related data in response
      const classWithDetails = await Class.findByPk(newClass.id, {
          include: [
              { association: 'classLevel' },
              { association: 'supervisor' },
              { association: 'term' }
          ],
          transaction
      });

      await transaction.commit();
      res.status(201).json(classWithDetails);
  } catch (err) {
      await transaction.rollback();
      console.error(err);

      if (err.name === "SequelizeUniqueConstraintError") {
          return res.status(400).json({ error: "Class name must be unique for this term" });
      }

      res.status(500).json({ error: "Failed to create class" });
  }
};

const assignTeacherDuties = async (req, res) => {
    const { teacherId } = req.params; // Get teacherId from URL params as per your route
     const { duties } = req.body; // 'duties' should be an array of duty objects
    
      // Ensure express-validator is applied as middleware before this controller
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    console.log("Assigning duties to teacher...",teacherId);
    console.log("Assigning duties ...",duties);
      const transaction = await sequelize.transaction();
      try {
       
        if (!Array.isArray(duties) || duties.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ error: "Duties array cannot be empty." });
        }
    
        const teacher = await Teacher.findByPk(teacherId, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ error: "Teacher not found." });
        }
    
        for (const duty of duties) {
          switch (duty.type) { // Frontend must send 'type' (e.g., 'HOD', 'supervisor', 'teaching')
            case "HOD":
              if (!duty.departmentId) {
                throw new Error("Department ID is required for HOD assignment.");
              }
              const department = await Department.findByPk(duty.departmentId, { transaction });
              if (!department) {
                throw new Error(`Department with ID ${duty.departmentId} not found.`);
              }
              await Department.update(
                { hodId: teacherId },
                { where: { id: duty.departmentId }, transaction }
              );
              break;
    
            case "supervisor":
              if (!duty.classId) {
                throw new Error("Class ID is required for supervisor assignment.");
              }
              const classToSupervise = await Class.findByPk(duty.classId, { transaction });
              if (!classToSupervise) {
                throw new Error(`Class with ID ${duty.classId} not found.`);
              }
              await Class.update(
                { supervisorId: teacherId },
                { where: { id: duty.classId }, transaction }
              );
              break;
    
            case "teaching":
              const { subjectId, classId, termId, schoolYearId } = duty;
              if (!subjectId || !classId || !termId || !schoolYearId) {
                throw new Error("Subject, Class, Term, and School Year IDs are required for teaching assignment.");
              }
              // Validate existence of related entities
              const [subject, targetClass, term, schoolYear] = await Promise.all([
                Subject.findByPk(subjectId, { transaction }),
                Class.findByPk(classId, { transaction }),
                Term.findByPk(termId, { transaction }),
                SchoolYear.findByPk(schoolYearId, { transaction }),
              ]);
    
              if (!subject) throw new Error(`Subject with ID ${subjectId} not found.`);
              if (!targetClass) throw new Error(`Class with ID ${classId} not found.`);
              if (!term) throw new Error(`Term with ID ${termId} not found.`);
              if (!schoolYear) throw new Error(`School Year with ID ${schoolYearId} not found.`);
    
              // Validate assignment uniqueness as before
              const existing = await TeachingAssignment.findOne({
                where: { subjectId, classId, termId, schoolYearId },
                transaction,
              });
    
              if (existing && existing.teacherId !== teacherId) {
                throw new Error("This subject/class/term/year combination is already assigned to another teacher.");
              }
    
              // Create or update assignment
              await TeachingAssignment.upsert(
                { teacherId, subjectId, classId, termId, schoolYearId, isHOD: duty.isHOD || false },
                { transaction }
              );
              break;
    
            default:
              throw new Error(`Unknown duty type: ${duty.type}`);
          }
        }
    
        await transaction.commit();
        res.status(200).json({ message: "Duties assigned successfully." });
      } catch (err) {
        await transaction.rollback();
        console.error("Error assigning duties:", err); // Log the specific error
        res.status(400).json({ // Return 400 for client-side errors
          error: err.message || "Failed to assign duties."
     });
    }
    };
    
  const getTeacherAssignments = async (req, res) => {
    try {
      const assignments = await TeachingAssignment.findAll({
        where: { teacherId: req.params.id },
        include: [
          { model: Subject, as: "subject" },
          { model: Class, as: "class" },
          { model: Term, as: "term" },
          { model: SchoolYear, as: "schoolYear" },
        ],
      });
  
      res.status(200).json(assignments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch teacher assignments" });
    }
  };
  
  
  // Department Controllers
  const createDepartment = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    try {
      const { name } = req.body;
      const department = await Department.create({ name });
      res.status(201).json(department);
    } catch (err) {
      console.error(err);
      if (err.name === "SequelizeUniqueConstraintError") {
        return res.status(400).json({ error: "Department name already exists" });
      }
      res.status(500).json({ error: "Failed to create department" });
    }
  };
  
  const getAllDepartments = async (req, res) => {
    try {
      const departments = await Department.findAll({
        include: [
          {
            model: Teacher,
            as: "headOfDepartment",
            include: [{ model: User, as: "user" }],
          },
          { model: Subject, as: "subjects" },
        ],
      });
      res.status(200).json(departments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch departments" });
    }
  };
  
  const updateDepartment = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    try {
      const { name, hodId } = req.body;
      const department = await Department.findByPk(req.params.id);
  
      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }
  
      await department.update({ name, hodId });
      res.status(200).json(department);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update department" });
    }
  };
  
  const deleteDepartment = async (req, res) => {
    try {
      const department = await Department.findByPk(req.params.id);
      if (!department) {
        return res.status(404).json({ error: "Department not found" });
      }
  
      await department.destroy();
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete department" });
    }
};
const getDepartmentById = asyncHandler(async (req, res) => {
    const department = await Department.findByPk(req.params.id);
    if (!department) return res.status(404).json({ error: "Department not found" });
    res.status(200).json(department);
  });
// Assign HOD to department
const assignHOD = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { departmentId, teacherId } = req.body;
  
      const department = await Department.findByPk(departmentId, { transaction });
      const teacher = await Teacher.findByPk(teacherId, { transaction });
  
      if (!department || !teacher) {
        await transaction.rollback();
        return res.status(404).json({ error: "Department or teacher not found" });
      }
  
      department.hodId = teacherId;
      await department.save({ transaction });
  
      await transaction.commit();
      res.status(200).json(department);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to assign HOD" });
    }
  };
  
  // Subject Controllers
  const createSubject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    try {
      const { name,code, departmentId, classId } = req.body;
  
      // --- Start: Check for existing subject in the same class ---
      const existingSubject = await Subject.findOne({
        where: {
          name: name,
          classId: classId,
        },
      });
  const existingCode = await Subject.findOne({
    where: {
      code: code, 

    },
  });
      if (existingSubject) {
        return res.status(409).json({ // 409 Conflict status for duplicate resource
          error: `A subject named '${name}' already exists for this class.`,
        });
      }
      if (existingCode) {
        return res.status(409).json({ // 409 Conflict status for duplicate resource   
          error: `A subject with code '${code}' already exists.`,
        });
      };
      // --- End: Check for existing subject ---
  
      const subject = await Subject.create({ name,code, departmentId, classId });
      res.status(201).json(subject);
    } catch (err) {
      console.error("Error creating subject:", err); // Log the full error for debugging
      res.status(500).json({ error: "Failed to create subject" });
    }
  };
  
  const getAllSubjects = async (req, res) => {
    try {
      const subjects = await Subject.findAll();
      res.status(200).json(subjects);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch subjects" });
    }
  };
  
  const updateSubject = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
  
    try {
      const { name, departmentId } = req.body;
      const subject = await Subject.findByPk(req.params.id);
  
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
  
      await subject.update({ name, departmentId });
      res.status(200).json(subject);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to update subject" });
    }
  };
  
  const deleteSubject = async (req, res) => {
    try {
      const subject = await Subject.findByPk(req.params.id);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
  
      await subject.destroy();
      res.status(204).end();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to delete subject" });
    }
  };

  const getSubjectById = asyncHandler(async (req, res) => {
    // New: Get a single subject by ID
    const subject = await Subject.findByPk(req.params.id);
    if (!subject) return res.status(404).json({ error: "Subject not found" });
    res.status(200).json(subject);
  });
  
// Ensure you have imported necessary models and utilities like sequelize instance
// For example:
// const { sequelize, TeachingAssignment, Teacher, Subject, Class, Term, SchoolYear, Department } = require('../models');

const createTeachingAssignment = async (req, res) => {
  console.log(req.body);
  const transaction = await sequelize.transaction();
  try {
    const {
      teacherId,
      subjectId,
      classId,
      termId,
      schoolYearId,
      isHOD,
      departmentId, // Now explicitly included for HOD assignments
    } = req.body;

    // --- Validation Logic ---
    if (isHOD) {
      // HOD Assignment Requirements
      if (!teacherId || !departmentId || !schoolYearId) {
        throw new Error("Teacher, Department, and School Year are required for Head of Department assignment.");
      }

      // Check for existing HOD assignment for this teacher, department, and year
      const existingHODAssignment = await TeachingAssignment.findOne({
        where: {
          teacherId,
          departmentId,
          schoolYearId,
          isHOD: true, // Only check for existing HOD assignments
        },
        transaction,
      });

      if (existingHODAssignment) {
        throw new Error("This teacher is already assigned as Head of Department for this department and year.");
      }

      // For HOD assignment, teaching-related IDs should be null
      if (subjectId || classId || termId) {
          console.warn("Teaching-related IDs provided for HOD assignment. These will be ignored or set to null.");
          // You might want to throw an error here if strict separation is desired:
          // throw new Error("Subject, Class, and Term must not be provided for HOD assignment.");
      }

    } else {
      // Teaching Assignment Requirements
      if (!teacherId || !subjectId || !classId || !termId || !schoolYearId) {
        throw new Error("Teacher, Subject, Class, Term, and School Year are required for teaching assignment.");
      }

      // Check for existing teaching assignment (subject-class-term-year uniqueness)
      const existingTeachingAssignment = await TeachingAssignment.findOne({
        where: {
          subjectId,
          classId,
          termId,
          schoolYearId,
          isHOD: false, // Only check for existing teaching assignments
        },
        transaction,
      });

      if (existingTeachingAssignment) {
        throw new Error(
          "This subject/class/term/year combination is already assigned to a teacher."
        );
      }
      
      // For teaching assignment, departmentId should be null
      if (departmentId) {
          console.warn("Department ID provided for teaching assignment. It will be ignored or set to null.");
          // You might want to throw an error here:
          // throw new Error("Department must not be provided for teaching assignment.");
      }

      // --- "Head of Class" Pre-condition (Future Enhancement/Consideration) ---
      // The prompt stated: "for a teacher to head the class he needs to be assigned atleast a subject to that class"
      // This implies a separate assignment type (e.g., `isClassTeacher` flag).
      // If you were to add `isClassTeacher` to the model:
      // if (isClassTeacher) { // Assuming a new flag from frontend
      //   const hasSubjectInClass = await TeachingAssignment.findOne({
      //     where: {
      //       teacherId,
      //       classId,
      //       termId,
      //       schoolYearId,
      //       subjectId: { [Op.ne]: null }, // Op.ne for not equals null (assuming Sequelize Op)
      //       isHOD: false,
      //       isClassTeacher: false // Ensure it's a regular teaching assignment
      //     },
      //     transaction,
      //   });
      //   if (!hasSubjectInClass) {
      //     throw new Error("Teacher must be assigned at least one subject to this class, term, and year before being assigned as Class Head.");
      //   }
      // }
    }

    // --- Create Assignment Record ---
    const assignmentData = {
      teacherId,
      schoolYearId,
      isHOD: isHOD || false,
      // Conditionally set fields to null based on assignment type
      subjectId: isHOD ? null : subjectId,
      classId: isHOD ? null : classId,
      termId: isHOD ? null : termId,
      departmentId: isHOD ? departmentId : null,
    };

    const newAssignment = await TeachingAssignment.create(assignmentData, { transaction });

    await transaction.commit();
    res.status(201).json(newAssignment);
  } catch (err) {
    await transaction.rollback();
    console.error("Error creating teaching assignment:", err);
    res.status(400).json({ error: err.message || "Failed to create teaching assignment." });
  }
};


  // Get all teaching assignments
  const getAllTeachingAssignments = async (req, res) => {
    try {
      const assignments = await TeachingAssignment.findAll({
        include: [
          {
            model: Teacher,
            as: "teacher",
            include: [{ model: User, as: "user" }],
          },
          { model: Subject, as: "subject" },
          { model: Class, as: "class" },
          { model: Term, as: "term" },
          { model: SchoolYear, as: "schoolYear" },
        ],
      });
      res.status(200).json(assignments);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  };
  
  // Update a teaching assignment
  const updateTeachingAssignment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const assignment = await TeachingAssignment.findByPk(req.params.id, {
        transaction,
      });
  
      if (!assignment) {
        await transaction.rollback();
        return res.status(404).json({ error: "Assignment not found" });
      }
  
      const { teacherId, isHOD } = req.body;
  
      // Only allow changing teacher or HOD status
      if (teacherId) assignment.teacherId = teacherId;
      if (isHOD !== undefined) assignment.isHOD = isHOD;
  
      await assignment.save({ transaction });
      await transaction.commit();
  
      res.status(200).json(assignment);
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to update assignment" });
    }
  };
  
  // Delete a teaching assignment
  const deleteTeachingAssignment = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const assignment = await TeachingAssignment.findByPk(req.params.id, {
        transaction,
      });
  
      if (!assignment) {
        await transaction.rollback();
        return res.status(404).json({ error: "Assignment not found" });
      }
  
      await assignment.destroy({ transaction });
      await transaction.commit();
  
      res.status(204).end();
    } catch (err) {
      await transaction.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  };
 
  
  // --- Teaching Assignment Controllers ---
 
  const getTeachingAssignmentById = asyncHandler(async (req, res) => {
    // New: Get a single teaching assignment by ID
    const assignment = await TeachingAssignment.findByPk(req.params.id);
    if (!assignment) return res.status(404).json({ error: "Teaching assignment not found" });
    res.status(200).json(assignment);
  });
  
 
 
  
module.exports = {
      //school year controllers
    createSchoolYear,
    getAllSchoolYears,
    getSchoolYearById,
    updateSchoolYear,
    deleteSchoolYear,
    //term controllers
    createTerm,
    getAllTerms,
    getTermById,
    updateTerm,
    deleteTerm,
    //class level controllers
    createClassLevel,
    getAllClassLevels,
    getClassLevelById,
    updateClassLevel,
    deleteClassLevel,
    //class controllers
    createClass,
    getAllClasses,
    getClassById,
    updateClass,
    deleteClass,
    getClassAssignments,
    getClassSchedule,
    //subject controllers
    createSubject,
    getAllSubjects,
    getSubjectById,
    updateSubject,
      deleteSubject,
    //Department controllers
    createDepartment,
    assignHOD,
    getAllDepartments,
    getDepartmentById,
    updateDepartment,
      deleteDepartment,
    //teacher assignmets
    createTeachingAssignment,
    getAllTeachingAssignments,
    getTeachingAssignmentById,
    updateTeachingAssignment,
    deleteTeachingAssignment,
    assignTeacherDuties,
  };
  
  // controllers/settingController.js
  const Setting = require('../models/setting.js'); // Adjust path if necessary
  const asyncHandler = require('../middlewares/asyncHandler.js'); // CommonJS
  const Joi = require('joi'); // CommonJS
  
  // Joi schema for creating/updating a setting
  const settingSchema = Joi.object({
    key: Joi.string().required(),
    value: Joi.any().required(), // Value can be anything, will be stored as JSONB
    description: Joi.string().allow(null, '').optional(),
  });
  
  // Get all settings
  const getAllSettings = asyncHandler(async (req, res) => {
    try {
      const settings = await Setting.findAll();
      res.status(200).json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });
  
  // Get a single setting by key
  const getSettingByKey = asyncHandler(async (req, res) => {
    const { key } = req.params;
    try {
      const setting = await Setting.findByPk(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.status(200).json(setting);
    } catch (error) {
      console.error(`Error fetching setting with key ${key}:`, error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });
  
  // Create a new setting
  const createSetting = asyncHandler(async (req, res) => {
    const { error } = settingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ errors: error.details.map(d => d.message) });
    }
  
    const { key, value, description } = req.body;
    try {
      const [setting, created] = await Setting.findOrCreate({
        where: { key },
        defaults: { value, description },
      });
  
      if (!created) {
        return res.status(409).json({ error: `Setting with key '${key}' already exists. Use PUT to update.` });
      }
  
      res.status(201).json(setting);
    } catch (error) {
      console.error("Error creating setting:", error);
      res.status(500).json({ error: "Failed to create setting" });
    }
  });
  
  // Update an existing setting by key
  const updateSetting = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value, description } = req.body; // Key is from params, not body for update
  
    // Validate only the updatable fields
    const updateSchema = Joi.object({
      value: Joi.any().required(),
      description: Joi.string().allow(null, '').optional(),
    });
    const { error } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ errors: error.details.map(d => d.message) });
    }
  
    try {
      const setting = await Setting.findByPk(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
  
      await setting.update({ value, description });
      res.status(200).json(setting);
    } catch (error) {
      console.error(`Error updating setting with key ${key}:`, error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });
  
  // Delete a setting by key
  const deleteSetting = asyncHandler(async (req, res) => {
    const { key } = req.params;
    try {
      const setting = await Setting.findByPk(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      await setting.destroy();
      res.status(204).end(); // No content
    } catch (error) {
      console.error(`Error deleting setting with key ${key}:`, error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });
  
  module.exports = {
    getAllSettings,
    getSettingByKey,
    createSetting,
    updateSetting,
    deleteSetting,
  };
  // controllers/settingController.js
  const Setting = require('../models/setting.js'); // Adjust path if necessary
  const asyncHandler = require('../middlewares/asyncHandler.js'); // CommonJS
  const Joi = require('joi'); // CommonJS
  
  // Joi schema for creating/updating a setting
  const settingSchema = Joi.object({
    key: Joi.string().required(),
    value: Joi.any().required(), // Value can be anything, will be stored as JSONB
    description: Joi.string().allow(null, '').optional(),
  });
  
  // Get all settings
  const getAllSettings = asyncHandler(async (req, res) => {
    try {
      const settings = await Setting.findAll();
      res.status(200).json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });
  
  // Get a single setting by key
  const getSettingByKey = asyncHandler(async (req, res) => {
    const { key } = req.params;
    try {
      const setting = await Setting.findByPk(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      res.status(200).json(setting);
    } catch (error) {
      console.error(`Error fetching setting with key ${key}:`, error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });
  
  // Create a new setting
  const createSetting = asyncHandler(async (req, res) => {
    const { error } = settingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ errors: error.details.map(d => d.message) });
    }
  
    const { key, value, description } = req.body;
    try {
      const [setting, created] = await Setting.findOrCreate({
        where: { key },
        defaults: { value, description },
      });
  
      if (!created) {
        return res.status(409).json({ error: `Setting with key '${key}' already exists. Use PUT to update.` });
      }
  
      res.status(201).json(setting);
    } catch (error) {
      console.error("Error creating setting:", error);
      res.status(500).json({ error: "Failed to create setting" });
    }
  });
  
  // Update an existing setting by key
  const updateSetting = asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value, description } = req.body; // Key is from params, not body for update
  
    // Validate only the updatable fields
    const updateSchema = Joi.object({
      value: Joi.any().required(),
      description: Joi.string().allow(null, '').optional(),
    });
    const { error } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ errors: error.details.map(d => d.message) });
    }
  
    try {
      const setting = await Setting.findByPk(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
  
      await setting.update({ value, description });
      res.status(200).json(setting);
    } catch (error) {
      console.error(`Error updating setting with key ${key}:`, error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });
  
  // Delete a setting by key
  const deleteSetting = asyncHandler(async (req, res) => {
    const { key } = req.params;
    try {
      const setting = await Setting.findByPk(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      await setting.destroy();
      res.status(204).end(); // No content
    } catch (error) {
      console.error(`Error deleting setting with key ${key}:`, error);
      res.status(500).json({ error: "Failed to delete setting" });
    }
  });
  
  module.exports = {
    getAllSettings,
    getSettingByKey,
    createSetting,
    updateSetting,
    deleteSetting,
  };
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
  };// backend/controllers/schoolSetupController.js
  const {
      User,
      Teacher,
      TeachingAssignment,
      Department,
      Subject,
      Class,
      Term,
      SchoolYear,
      ClassLevel, // Added ClassLevel
      sequelize
    } = require("../models");
    const Joi = require("joi"); // Import Joi
    const bcrypt = require("bcryptjs");
    const asyncHandler = require("../middlewares/asyncHandler"); // Assuming you have this
    
    // --- Joi Validation Schemas ---
    
    // Reusable UUID schema for IDs
    const uuidSchema = Joi.string().guid({ version: 'uuidv4' }).required().messages({
      "string.guid": "Invalid ID format. Must be a valid UUID v4.",
      "any.required": "ID is required."
    });
    
    // Schema for creating a Teacher
    const createTeacherSchema = Joi.object({
      firstName: Joi.string().trim().min(1).max(255).required().messages({
        "string.empty": "First name cannot be empty.",
        "string.min": "First name must be at least 1 character long.",
        "any.required": "First name is required."
      }),
      lastName: Joi.string().trim().min(1).max(255).required().messages({
        "string.empty": "Last name cannot be empty.",
        "string.min": "Last name must be at least 1 character long.",
        "any.required": "Last name is required."
      }),
      username: Joi.string().trim().min(3).max(50).required().messages({
        "string.empty": "Username cannot be empty.",
        "string.min": "Username must be at least 3 characters long.",
        "any.required": "Username is required."
      }),
      email: Joi.string().email().required().messages({ // Email is required for Teachers
        "string.empty": "Email cannot be empty.",
        "string.email": "Email must be a valid email address.",
        "any.required": "Email is required."
      }),
      password: Joi.string().min(6).required().messages({
        "string.empty": "Password cannot be empty.",
        "string.min": "Password must be at least 6 characters long.",
        "any.required": "Password is required."
      }),
      phone: Joi.string().trim().min(7).max(20).required().messages({ // Phone is required for Teachers
        "string.empty": "Phone number cannot be empty.",
        "string.min": "Phone number must be at least 7 digits.",
        "any.required": "Phone number is required."
      }),
      address: Joi.string().trim().min(5).max(255).required().messages({ // Address is required for Teachers
        "string.empty": "Address cannot be empty.",
        "string.min": "Address must be at least 5 characters long.",
        "any.required": "Address is required."
      }),
      sex: Joi.string().valid("MALE", "FEMALE").required().messages({
        "any.only": "Sex must be either 'MALE' or 'FEMALE'.",
        "any.required": "Sex is required."
      }),
      dob: Joi.date().iso().less('now').required().messages({ // DOB is required for Teachers
        "date.base": "Date of birth must be a valid date.",
        "date.iso": "Date of birth must be in ISO 8601 format (YYYY-MM-DD).",
        "date.less": "Date of birth cannot be in the future.",
        "any.required": "Date of birth is required."
      }),
      qualifications: Joi.array().items(Joi.string().trim().min(1)).optional().messages({
        "array.base": "Qualifications must be an array of strings."
      }),
      subjects: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).optional().messages({ // Array of Subject UUIDs
        "array.base": "Subjects must be an array of valid UUIDs.",
        "string.guid": "Each subject ID must be a valid UUID v4."
      }),
      profilePhoto: Joi.string().uri().optional().allow(null, '').messages({ // Assuming URL or path
        "string.uri": "Profile photo must be a valid URI."
      }),
    });
    
    // Schema for updating a Teacher (all fields optional, but validate if present)
    const updateTeacherSchema = Joi.object({
      firstName: Joi.string().trim().min(1).max(255).optional(),
      lastName: Joi.string().trim().min(1).max(255).optional(),
      username: Joi.string().trim().min(3).max(50).optional(),
      email: Joi.string().email().optional(),
      password: Joi.string().min(6).optional(),
      phone: Joi.string().trim().min(7).max(20).optional(),
      address: Joi.string().trim().min(5).max(255).optional(),
      sex: Joi.string().valid("MALE", "FEMALE").optional(),
      dob: Joi.date().iso().less('now').optional(),
      qualifications: Joi.array().items(Joi.string().trim().min(1)).optional(),
      subjects: Joi.array().items(Joi.string().guid({ version: 'uuidv4' })).optional(),
      profilePhoto: Joi.string().uri().optional().allow(null, ''),
      isActive: Joi.boolean().optional(),
    });
    
    // Schema for individual duty object within assignTeacherDuties
    const assignDutySchema = Joi.object().keys({
      type: Joi.string().valid('HOD', 'supervisor', 'teaching').required().messages({
        "any.only": "Duty type must be 'HOD', 'supervisor', or 'teaching'.",
        "any.required": "Duty type is required."
      }),
      departmentId: uuidSchema.optional().when('type', {
        is: 'HOD',
        then: uuidSchema.required().messages({"any.required": "Department ID is required for HOD duty."}),
      }),
      classId: uuidSchema.optional().when('type', {
        is: 'supervisor',
        then: uuidSchema.required().messages({"any.required": "Class ID is required for supervisor duty."}),
        otherwise: uuidSchema.optional().when('type', {
          is: 'teaching',
          then: uuidSchema.required().messages({"any.required": "Class ID is required for teaching duty."}),
        }),
      }),
      subjectId: uuidSchema.optional().when('type', {
        is: 'teaching',
        then: uuidSchema.required().messages({"any.required": "Subject ID is required for teaching duty."}),
      }),
      termId: uuidSchema.optional().when('type', {
        is: 'teaching',
        then: uuidSchema.required().messages({"any.required": "Term ID is required for teaching duty."}),
      }),
      schoolYearId: uuidSchema.optional().when('type', {
        is: 'teaching',
        then: uuidSchema.required().messages({"any.required": "School Year ID is required for teaching duty."}),
      }),
      isHOD: Joi.boolean().optional(), // For teaching assignment, can indicate if it's also an HOD subject
    });
    
    // Schema for the overall payload of assignTeacherDuties
    const assignTeacherDutiesPayloadSchema = Joi.object({
      duties: Joi.array().items(assignDutySchema).min(1).required().messages({
        "array.base": "Duties must be an array.",
        "array.min": "Duties array cannot be empty.",
        "any.required": "Duties are required."
      }),
    });
    
    // Schema for creating a Department
    const createDepartmentSchema = Joi.object({
      name: Joi.string().trim().min(1).max(255).required().messages({
        "string.empty": "Department name cannot be empty.",
        "string.min": "Department name must be at least 1 character long.",
        "any.required": "Department name is required."
      }),
    });
    
    // Schema for updating a Department
    const updateDepartmentSchema = Joi.object({
      name: Joi.string().trim().min(1).max(255).optional(),
      hodId: uuidSchema.optional().allow(null), // HOD can be null or a UUID
    });
    
    // Schema for creating a Subject
    const createSubjectSchema = Joi.object({
      name: Joi.string().trim().min(1).max(255).required().messages({
        "string.empty": "Subject name cannot be empty.",
        "string.min": "Subject name must be at least 1 character long.",
        "any.required": "Subject name is required."
      }),
      code: Joi.string().trim().min(1).max(10).optional().allow(null, '').messages({ // Code is optional
        "string.empty": "Subject code cannot be empty if provided.",
        "string.min": "Subject code must be at least 1 character long.",
        "string.max": "Subject code cannot exceed 10 characters."
      }),
      departmentId: uuidSchema.optional().allow(null), // Department ID is optional
    });
    
    // Schema for updating a Subject
    const updateSubjectSchema = Joi.object({
      name: Joi.string().trim().min(1).max(255).optional(),
      code: Joi.string().trim().min(1).max(10).optional().allow(null, ''),
      departmentId: uuidSchema.optional().allow(null),
    });
    
    
    // --- Teacher Controllers ---
    
    // Create a new teacher (and associated user)
    const createTeacher = asyncHandler(async (req, res) => {
      const { error } = createTeacherSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({ errors: error.details.map(d => d.message) });
      }
    
      const transaction = await sequelize.transaction();
      try {
        const {
          firstName,
          lastName,
          username,
          email,
          password,
          phone,
          address,
          sex,
          dob,
          qualifications,
          subjects,
          profilePhoto, // This would typically come from a file upload, not directly in body for initial creation
        } = req.body;
    
        // Check for existing user (username, email, phone) before hashing password
        const existingUser = await User.findOne({
          where: {
            [Sequelize.Op.or]: [
              { username },
              { email },
              { phone }
            ]
          },
          transaction
        });
    
        if (existingUser) {
          await transaction.rollback();
          const errors = [];
          if (existingUser.username === username) errors.push("Username already exists.");
          if (existingUser.email === email) errors.push("Email already exists.");
          if (existingUser.phone === phone) errors.push("Phone number already exists.");
          return res.status(409).json({ errors }); // 409 Conflict for existing resource
        }
    
        const hashedPassword = await bcrypt.hash(password, 10);
    
        const user = await User.create(
          {
            firstName,
            lastName,
            username,
            email,
            password: hashedPassword,
            phone,
            address,
            sex: sex.toUpperCase(), // Ensure uppercase for ENUM
            dob,
            role: "teacher",
            profilePhoto, // Handle actual file upload separately if needed
          },
          { transaction }
        );
    
        const teacher = await Teacher.create(
          {
            id: user.id, // Using same ID as user
            qualifications: qualifications || [],
            subjects: subjects || [],
          },
          { transaction }
        );
    
        await transaction.commit();
    
        // Return combined data
        const response = {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          username: user.username,
          email: user.email,
          phone: user.phone,
          address: user.address,
          sex: user.sex,
          dob: user.dob,
          profilePhoto: user.profilePhoto,
          role: user.role,
          staffNumber: teacher.staffNumber,
          qualifications: teacher.qualifications,
          subjects: teacher.subjects,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
    
        res.status(201).json(response);
      } catch (err) {
        await transaction.rollback();
        console.error("Error creating teacher:", err);
        res.status(500).json({ error: "Failed to create teacher", details: err.message });
      }
    });
    
    // Get all teachers with basic user info and staff numbers
    const getTeachers = asyncHandler(async (req, res) => {
      // No specific body/param validation for this endpoint, but could add query param validation later
      try {
        const teachers = await Teacher.findAll({
          attributes: ["id", "staffNumber", "qualifications", "subjects"],
          include: [
            {
              model: User,
              as: "user",
              attributes: [
                "id", "firstName", "lastName", "username", "email", "phone",
                "profilePhoto", "address", "sex", "isActive", "createdAt", "updatedAt", "dob",
              ],
            },
          ],
        });
    
        const formattedTeachers = teachers.map((teacher) => ({
          id: teacher.id,
          staffNumber: teacher.staffNumber,
          qualifications: teacher.qualifications,
          subjects: teacher.subjects,
          // Spread user attributes directly
          ...teacher.user.get({ plain: true }),
        }));
    
        res.status(200).json(formattedTeachers);
      } catch (err) {
        console.error("Error fetching teachers:", err);
        res.status(500).json({ error: "Failed to fetch teachers", details: err.message });
      }
    });
    
    // Get teacher by ID with staff number
    const getTeacherById = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid teacher ID format." });
      }
    
      try {
        const teacher = await Teacher.findByPk(req.params.id, {
          attributes: ["id", "staffNumber", "qualifications", "subjects"],
          include: [
            {
              model: User,
              as: "user",
              attributes: [
                "id", "firstName", "lastName", "username", "email", "phone",
                "profilePhoto", "sex", "address", "isActive", "createdAt", "updatedAt", "dob",
              ],
            },
          ],
        });
    
        if (!teacher) {
          return res.status(404).json({ error: "Teacher not found" });
        }
    
        const response = {
          id: teacher.id,
          staffNumber: teacher.staffNumber,
          qualifications: teacher.qualifications,
          subjects: teacher.subjects,
          ...teacher.user.get({ plain: true }),
        };
    
        res.status(200).json(response);
      } catch (err) {
        console.error("Error fetching teacher by ID:", err);
        res.status(500).json({
          error: "Failed to fetch teacher details",
          details: err.message,
        });
      }
    });
    
    // Update teacher information
    const updateTeacher = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid teacher ID format." });
      }
    
      const { error: bodyError } = updateTeacherSchema.validate(req.body, { abortEarly: false });
      if (bodyError) {
        return res.status(400).json({ errors: bodyError.details.map(d => d.message) });
      }
    
      const transaction = await sequelize.transaction();
      try {
        const teacher = await Teacher.findByPk(req.params.id, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ error: "Teacher not found" });
        }
    
        const user = await User.findByPk(teacher.id, { transaction });
        if (!user) {
          await transaction.rollback();
          return res.status(404).json({ error: "Associated user not found" });
        }
    
        const {
          firstName, lastName, username, email, phone, isActive,
          address, sex, profilePhoto, qualifications, subjects, password
        } = req.body;
    
        // Prepare user update fields
        const userUpdateFields = {};
        if (firstName !== undefined) userUpdateFields.firstName = firstName;
        if (lastName !== undefined) userUpdateFields.lastName = lastName;
        if (username !== undefined) userUpdateFields.username = username;
        if (email !== undefined) userUpdateFields.email = email;
        if (phone !== undefined) userUpdateFields.phone = phone;
        if (address !== undefined) userUpdateFields.address = address;
        if (sex !== undefined) userUpdateFields.sex = sex.toUpperCase(); // Ensure uppercase
        if (isActive !== undefined) userUpdateFields.isActive = isActive;
        if (profilePhoto !== undefined) userUpdateFields.profilePhoto = profilePhoto;
        if (password !== undefined) userUpdateFields.password = await bcrypt.hash(password, 10);
    
        // Prepare teacher update fields
        const teacherUpdateFields = {};
        if (qualifications !== undefined) teacherUpdateFields.qualifications = qualifications;
        if (subjects !== undefined) teacherUpdateFields.subjects = subjects;
    
        // Update both records
        await user.update(userUpdateFields, { transaction });
        await teacher.update(teacherUpdateFields, { transaction });
    
        await transaction.commit();
    
        // Fetch updated data for response
        const updatedUser = await User.findByPk(user.id);
        const updatedTeacher = await Teacher.findByPk(teacher.id);
    
        const response = {
          id: updatedTeacher.id,
          staffNumber: updatedTeacher.staffNumber,
          qualifications: updatedTeacher.qualifications,
          subjects: updatedTeacher.subjects,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          username: updatedUser.username,
          email: updatedUser.email,
          phone: updatedUser.phone,
          address: updatedUser.address,
          sex: updatedUser.sex,
          isActive: updatedUser.isActive,
          profilePhoto: updatedUser.profilePhoto,
          role: updatedUser.role,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        };
    
        res.status(200).json(response);
      } catch (err) {
        await transaction.rollback();
        console.error("Error updating teacher:", err);
    
        if (err.name === "SequelizeUniqueConstraintError") {
          return res.status(409).json({ // 409 Conflict
            error: "Username, email or phone number already exists.",
            details: err.errors?.map((e) => e.message) || err.message,
          });
        }
    
        res.status(500).json({
          error: "Failed to update teacher",
          details: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
      }
    });
    
    // Delete a teacher and associated user
    const deleteTeacher = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid teacher ID format." });
      }
    
      const transaction = await sequelize.transaction();
      try {
        const teacher = await Teacher.findByPk(req.params.id, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ error: "Teacher not found" });
        }
    
        const user = await User.findByPk(teacher.id, { transaction });
        if (!user) {
          await transaction.rollback();
          return res.status(404).json({ error: "Associated user not found" });
        }
    
        // Delete both records (soft delete due to paranoid: true)
        await teacher.destroy({ transaction });
        await user.destroy({ transaction });
        // Note: user.isActive is handled by authController's deleteUser, if this is a separate route,
        // you might want to explicitly set isActive: false here if paranoid is true for User.
        // However, if user.destroy() is called, paranoid will set deletedAt.
        // If you want to explicitly deactivate without deleting, use user.update({ isActive: false }).
        // Given the previous deleteUser in authController, this looks like a duplicate.
        // If this is the primary delete route, ensure it aligns with overall user management strategy.
    
        await transaction.commit();
        res.status(204).end();
      } catch (err) {
        await transaction.rollback();
        console.error("Error deleting teacher:", err);
        res.status(500).json({ error: "Failed to delete teacher", details: err.message });
      }
    });
    
    
    const assignTeacherDuties = asyncHandler(async (req, res) => {
      const { teacherId } = req.params;
      const { duties } = req.body;
    
      const { error: paramError } = uuidSchema.validate(teacherId);
      if (paramError) {
        return res.status(400).json({ error: "Invalid teacher ID format in URL." });
      }
    
      const { error: bodyError } = assignTeacherDutiesPayloadSchema.validate(req.body, { abortEarly: false });
      if (bodyError) {
        return res.status(400).json({ errors: bodyError.details.map(d => d.message) });
      }
    
      const transaction = await sequelize.transaction();
      try {
        const teacher = await Teacher.findByPk(teacherId, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ error: "Teacher not found." });
        }
    
        for (const duty of duties) {
          switch (duty.type) {
            case "HOD":
              // Validate department exists
              const department = await Department.findByPk(duty.departmentId, { transaction });
              if (!department) {
                throw new Error(`Department with ID ${duty.departmentId} not found.`);
              }
              await Department.update(
                { hodId: teacherId },
                { where: { id: duty.departmentId }, transaction }
              );
              break;
    
            case "supervisor":
              // Validate class exists
              const classToSupervise = await Class.findByPk(duty.classId, { transaction });
              if (!classToSupervise) {
                throw new Error(`Class with ID ${duty.classId} not found.`);
              }
              await Class.update(
                { supervisorId: teacherId },
                { where: { id: duty.classId }, transaction }
              );
              break;
    
            case "teaching":
              const { subjectId, classId, termId, schoolYearId } = duty;
              // Validate existence of related entities
              const [subject, targetClass, term, schoolYear] = await Promise.all([
                Subject.findByPk(subjectId, { transaction }),
                Class.findByPk(classId, { transaction }),
                Term.findByPk(termId, { transaction }),
                SchoolYear.findByPk(schoolYearId, { transaction }),
              ]);
    
              if (!subject) throw new Error(`Subject with ID ${subjectId} not found.`);
              if (!targetClass) throw new Error(`Class with ID ${classId} not found.`);
              if (!term) throw new Error(`Term with ID ${termId} not found.`);
              if (!schoolYear) throw new Error(`School Year with ID ${schoolYearId} not found.`);
    
              // Validate assignment uniqueness (teacherId is part of the unique constraint)
              const [teachingAssignment, created] = await TeachingAssignment.findOrCreate({
                where: { subjectId, classId, termId, schoolYearId },
                defaults: { teacherId, isHOD: duty.isHOD || false },
                transaction,
              });
    
              if (!created && teachingAssignment.teacherId !== teacherId) {
                throw new Error(`This subject/class/term/year combination is already assigned to another teacher (ID: ${teachingAssignment.teacherId}).`);
              } else if (!created) {
                 // If assignment already exists for this teacher, just update if needed
                 await teachingAssignment.update({ isHOD: duty.isHOD || false }, { transaction });
              }
              break;
    
            default:
              throw new Error(`Unknown duty type: ${duty.type}`);
          }
        }
    
        await transaction.commit();
        res.status(200).json({ message: "Duties assigned successfully." });
      } catch (err) {
        await transaction.rollback();
        console.error("Error assigning duties:", err);
        // Provide specific error message for client-side
        res.status(400).json({
          error: err.message || "Failed to assign duties. Please check your input.",
        });
      }
    });
    
    const getTeacherAssignments = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid teacher ID format." });
      }
    
      try {
        const assignments = await TeachingAssignment.findAll({
          where: { teacherId: req.params.id },
          include: [
            { model: Subject, as: "subject" },
            { model: Class, as: "class" },
            { model: Term, as: "term" },
            { model: SchoolYear, as: "schoolYear" },
          ],
        });
    
        res.status(200).json(assignments);
      } catch (err) {
        console.error("Error fetching teacher assignments:", err);
        res.status(500).json({ error: "Failed to fetch teacher assignments", details: err.message });
      }
    });
    
    
    // --- Department Controllers ---
    
    const createDepartment = asyncHandler(async (req, res) => {
      const { error } = createDepartmentSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({ errors: error.details.map(d => d.message) });
      }
    
      try {
        const { name } = req.body;
        const department = await Department.create({ name });
        res.status(201).json(department);
      } catch (err) {
        console.error("Error creating department:", err);
        if (err.name === "SequelizeUniqueConstraintError") {
          return res.status(409).json({ error: "Department name already exists." });
        }
        res.status(500).json({ error: "Failed to create department", details: err.message });
      }
    });
    
    const getAllDepartments = asyncHandler(async (req, res) => {
      try {
        const departments = await Department.findAll({
          include: [
            {
              model: Teacher,
              as: "hod", // Changed from headOfDepartment to hod as per model association
              include: [{ model: User, as: "user", attributes: ['firstName', 'lastName', 'email'] }],
            },
            { model: Subject, as: "subjects" },
          ],
        });
        res.status(200).json(departments);
      } catch (err) {
        console.error("Error fetching departments:", err);
        res.status(500).json({ error: "Failed to fetch departments", details: err.message });
      }
    });
    
    const updateDepartment = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid department ID format." });
      }
    
      const { error: bodyError } = updateDepartmentSchema.validate(req.body, { abortEarly: false });
      if (bodyError) {
        return res.status(400).json({ errors: bodyError.details.map(d => d.message) });
      }
    
      try {
        const { name, hodId } = req.body;
        const department = await Department.findByPk(req.params.id);
    
        if (!department) {
          return res.status(404).json({ error: "Department not found" });
        }
    
        // If HOD is being assigned, verify teacher exists
        if (hodId) {
          const teacherExists = await Teacher.findByPk(hodId);
          if (!teacherExists) {
            return res.status(404).json({ error: "Assigned HOD (Teacher) not found." });
          }
        }
    
        await department.update({ name, hodId });
        res.status(200).json(department);
      } catch (err) {
        console.error("Error updating department:", err);
        if (err.name === "SequelizeUniqueConstraintError") {
          return res.status(409).json({ error: "Department name already exists." });
        }
        res.status(500).json({ error: "Failed to update department", details: err.message });
      }
    });
    
    const deleteDepartment = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid department ID format." });
      }
    
      try {
        const department = await Department.findByPk(req.params.id);
        if (!department) {
          return res.status(404).json({ error: "Department not found" });
        }
    
        await department.destroy();
        res.status(204).end();
      } catch (err) {
        console.error("Error deleting department:", err);
        res.status(500).json({ error: "Failed to delete department", details: err.message });
      }
    });
    
    // --- Subject Controllers ---
    
    const createSubject = asyncHandler(async (req, res) => {
      const { error } = createSubjectSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({ errors: error.details.map(d => d.message) });
      }
    
      try {
        const { name, code, departmentId } = req.body;
    
        // Check for existing subject by name or code
        const existingSubject = await Subject.findOne({
          where: {
            [Sequelize.Op.or]: [
              { name: name },
              ...(code ? [{ code: code }] : []) // Only check code if provided
            ],
          },
        });
    
        if (existingSubject) {
          const errors = [];
          if (existingSubject.name === name) errors.push(`A subject named '${name}' already exists.`);
          if (code && existingSubject.code === code) errors.push(`A subject with code '${code}' already exists.`);
          return res.status(409).json({ errors });
        }
    
        // If departmentId is provided, verify it exists
        if (departmentId) {
          const departmentExists = await Department.findByPk(departmentId);
          if (!departmentExists) {
            return res.status(404).json({ error: "Department not found." });
          }
        }
    
        const subject = await Subject.create({ name, code, departmentId });
        res.status(201).json(subject);
      } catch (err) {
        console.error("Error creating subject:", err);
        res.status(500).json({ error: "Failed to create subject", details: err.message });
      }
    });
    
    const getAllSubjects = asyncHandler(async (req, res) => {
      // No specific body/param validation for this endpoint, but could add query param validation later
      try {
        const subjects = await Subject.findAll({
          include: [
            { model: Department, as: "department", attributes: ['id', 'name'] },
          ]
        });
        res.status(200).json(subjects);
      } catch (err) {
        console.error("Error fetching subjects:", err);
        res.status(500).json({ error: "Failed to fetch subjects", details: err.message });
      }
    });
    
    const updateSubject = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid subject ID format." });
      }
    
      const { error: bodyError } = updateSubjectSchema.validate(req.body, { abortEarly: false });
      if (bodyError) {
        return res.status(400).json({ errors: bodyError.details.map(d => d.message) });
      }
    
      try {
        const { name, code, departmentId } = req.body;
        const subject = await Subject.findByPk(req.params.id);
    
        if (!subject) {
          return res.status(404).json({ error: "Subject not found" });
        }
    
        // Check for unique name/code if they are being updated to existing ones
        if (name !== undefined || code !== undefined) {
          const existingSubject = await Subject.findOne({
            where: {
              id: { [Sequelize.Op.ne]: req.params.id }, // Exclude current subject
              [Sequelize.Op.or]: [
                ...(name !== undefined ? [{ name: name }] : []),
                ...(code !== undefined && code !== null && code !== '' ? [{ code: code }] : [])
              ]
            }
          });
    
          if (existingSubject) {
            const errors = [];
            if (name !== undefined && existingSubject.name === name) errors.push(`A subject named '${name}' already exists.`);
            if (code !== undefined && code !== null && code !== '' && existingSubject.code === code) errors.push(`A subject with code '${code}' already exists.`);
            if (errors.length > 0) return res.status(409).json({ errors });
          }
        }
    
        // If departmentId is provided, verify it exists
        if (departmentId) {
          const departmentExists = await Department.findByPk(departmentId);
          if (!departmentExists) {
            return res.status(404).json({ error: "Department not found." });
          }
        }
    
        await subject.update({ name, code, departmentId });
        res.status(200).json(subject);
      } catch (err) {
        console.error("Error updating subject:", err);
        res.status(500).json({ error: "Failed to update subject", details: err.message });
      }
    });
    
    const deleteSubject = asyncHandler(async (req, res) => {
      const { error: paramError } = uuidSchema.validate(req.params.id);
      if (paramError) {
        return res.status(400).json({ error: "Invalid subject ID format." });
      }
    
      try {
        const subject = await Subject.findByPk(req.params.id);
        if (!subject) {
          return res.status(404).json({ error: "Subject not found" });
        }
    
        await subject.destroy();
        res.status(204).end();
      } catch (err) {
        console.error("Error deleting subject:", err);
        res.status(500).json({ error: "Failed to delete subject", details: err.message });
      }
    });
    
    
    module.exports = {
      // Teacher methods
      createTeacher,
      getTeachers,
      getTeacherById,
      updateTeacher,
      deleteTeacher,
      assignTeacherDuties,
      getTeacherAssignments,
    
      // Department methods
      createDepartment,
      getAllDepartments,
      updateDepartment,
      deleteDepartment,
    
      // Subject methods
      createSubject,
      getAllSubjects,
      updateSubject,
      deleteSubject,
    };
    