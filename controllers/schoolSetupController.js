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
  // Method to get terms by school year (as provided in previous response)
const getSchoolTerms = async (req, res) => {
  try {
  
    const { schoolYearId } = req.params; // Expect schoolYearId in URL params

    if (!schoolYearId) {
      return res.status(400).json({ error: "School year ID is required." });
    }

    const schoolYear = await SchoolYear.findByPk(schoolYearId, {
      include: [
        {
          model: Term,
          as: "terms",
          order: [["startDate", "ASC"]]
        }
      ],
      order: [
        [{ model: Term, as: 'terms' }, 'startDate', 'ASC'] // Order terms within the include
      ]
    });

    if (!schoolYear) {
      return res.status(404).json({ error: "School year not found." });
    }

    res.status(200).json(schoolYear.terms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch terms for school year." });
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
  // New method: Get classes by term ID
const getClassesByTerm = async (req, res) => {
  try {
    const { termId } = req.params; // Expect termId in URL params

    if (!termId) {
      return res.status(400).json({ error: "Term ID is required." });
    }

    const classes = await Class.findAll({
      where: { termId: termId }, // Filter classes by termId
      include: [
        {
          model: ClassLevel,
          as: "classLevel"
        },
        {
          model: Teacher,
          as: "supervisor",
          include: [{ model: User, as: "user" }]
        },
        {
          model: Term,
          as: "term"
        },
        {
          model: SchoolYear,
          as: "schoolYear"
        }
      ],
      order: [['name', 'ASC']] // Order classes alphabetically
    });

    res.status(200).json(classes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch classes for term." });
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
  getSchoolTerms,
    getClassesByTerm,
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
  