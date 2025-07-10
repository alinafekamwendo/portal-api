// backend/controllers/schoolSetupController.js
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
  