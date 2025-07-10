// backend/models/academicRecord.js (UPDATED & CONSOLIDATED)
// This model now serves as the official end-of-term result for a student in a subject.
module.exports = (sequelize, DataTypes) => {
  const AcademicRecord = sequelize.define("AcademicRecord", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    studentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "students", key: "id" },
      onDelete: "CASCADE",
    },
    classId: { // The class the student was in when this record was made
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "classes", key: "id" },
      onDelete: "CASCADE",
    },
    subjectId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "subjects", key: "id" },
      onDelete: "CASCADE",
    },
    termId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "terms", key: "id" },
      onDelete: "CASCADE",
    },
    academicYearId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "school_years", key: "id" },
      onDelete: "CASCADE",
    },
    // This is the FINAL end-of-term score for the subject
    finalScore: {
      type: DataTypes.DECIMAL(5, 2), // e.g., 99.99
      allowNull: false,
      validate: { min: 0, max: 100 },
    },
    // This is the FINAL end-of-term grade for the subject
    finalGrade: {
      type: DataTypes.STRING(2), // e.g., 'A', 'B+'
      allowNull: false,
    },
    // NEW: Flag to control if results are visible in reports
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    // This flag is primarily relevant for Term 3 results for promotion decisions
    isPromoted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "academic_records",
    timestamps: true, // createdAt, updatedAt
    indexes: [
      // Composite unique constraint to ensure one final record per student, subject, term, year
      {
        unique: true,
        name: "academic_rec_unique",
        fields: ["studentId", "subjectId", "termId", "academicYearId"],
      },
    ],
  });

  AcademicRecord.associate = (models) => {
    AcademicRecord.belongsTo(models.Student, { foreignKey: "studentId", as: "student" });
    AcademicRecord.belongsTo(models.Class, { foreignKey: "classId", as: "class" });
    AcademicRecord.belongsTo(models.Subject, { foreignKey: "subjectId", as: "subject" });
    AcademicRecord.belongsTo(models.Term, { foreignKey: "termId", as: "term" });
    AcademicRecord.belongsTo(models.SchoolYear, { foreignKey: "academicYearId", as: "schoolYear" });
  };

  return AcademicRecord;
};
module.exports = (sequelize, DataTypes) => {
  const Admin = sequelize.define(
    "Admin",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      adminNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: () => `ADM${Math.floor(1000 + Math.random() * 9000)}`, // Generates like ADM1234
      },
      level: {
        type: DataTypes.ENUM("regular", "super"),
        allowNull: false,
        defaultValue: "regular",
      },
    },
    {
      paranoid: true,
      tableName: "admins",
    }
  );

  Admin.associate = (models) => {
    Admin.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE",
    });
  };

  return Admin;
};
module.exports = (sequelize, DataTypes) => {
  const Announcement = sequelize.define(
    "Announcement",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      date: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      classId: {
        type: DataTypes.UUID,
        references: {
          model: "classes", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
    },
    {
      paranoid: true,
      tableName: "announcements",
    }
  );

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
      onDelete: "CASCADE", // Add this
    });
  };

  return Announcement;
};
// backend/models/assessment.js
module.exports = (sequelize, DataTypes) => {
  const Assessment = sequelize.define("Assessment", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false, // e.g., "Math Quiz 1", "Term 1 Final Exam"
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false, // Date the assessment was conducted
    },
    maxScore: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 100.00, // Maximum possible score for this assessment
      validate: {
        min: 0,
      }
    },
    // Foreign keys to link to other models
    assessmentTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "assessment_types", key: "id" },
      onDelete: "CASCADE", // If assessment type is deleted, delete assessments
    },
    subjectId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "subjects", key: "id" },
      onDelete: "CASCADE", // If subject is deleted, delete assessments
    },
    classId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "classes", key: "id" },
      onDelete: "CASCADE", // Which class this assessment is for
    },
    termId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "terms", key: "id" },
      onDelete: "CASCADE", // Which term this assessment belongs to
    },
    schoolYearId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "school_years", key: "id" },
      onDelete: "CASCADE", // Which school year this assessment belongs to
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "assessments",
    timestamps: true, // createdAt, updatedAt
    indexes: [
      {
        unique: true,
        fields: ["title", "subjectId", "classId", "termId", "schoolYearId", "assessmentTypeId"],
        name: "unique_assessment_per_context"
      }
    ]
  });

  Assessment.associate = (models) => {
    Assessment.belongsTo(models.AssessmentType, { foreignKey: "assessmentTypeId", as: "assessmentType" });
    Assessment.belongsTo(models.Subject, { foreignKey: "subjectId", as: "subject" });
    Assessment.belongsTo(models.Class, { foreignKey: "classId", as: "class" });
    Assessment.belongsTo(models.Term, { foreignKey: "termId", as: "term" });
    Assessment.belongsTo(models.SchoolYear, { foreignKey: "schoolYearId", as: "schoolYear" });
    // An Assessment has many StudentAssessmentScores
    Assessment.hasMany(models.StudentAssessmentScore, {
      foreignKey: "assessmentId",
      as: "studentScores",
      onDelete: "CASCADE", // If an assessment is deleted, delete all associated student scores
    });
  };

  return Assessment;
};
// backend/models/assessmentType.js
module.exports = (sequelize, DataTypes) => {
  const AssessmentType = sequelize.define("AssessmentType", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true, // e.g., "Continuous Assessment", "End of Term Exam"
    },
    // Crucial for differentiating assessment types
    type: {
      type: DataTypes.ENUM("continuous", "endOfTerm"),
      allowNull: false,
    },
    // Weight for calculation if you decide to combine continuous assessments later,
    // though your current requirement states they don't count for final term reports.
    // This could be useful for internal teacher calculations or future features.
    weight: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 1.00, // Default weight, e.g., 1.00 for 100% if it's the only type
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "assessment_types",
    timestamps: true, // createdAt, updatedAt
  });

  AssessmentType.associate = (models) => {
    // An AssessmentType can have many Assessments
    AssessmentType.hasMany(models.Assessment, {
      foreignKey: "assessmentTypeId",
      as: "assessments",
      onDelete: "SET NULL", // If an assessment type is deleted, assessments remain but lose type link
    });
  };

  return AssessmentType;
};

module.exports = (sequelize, DataTypes) => {
  const Assignment = sequelize.define(
    "Assignment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      dueDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      lessonId: {
        type: DataTypes.UUID,
        references: {
          model: "lessons", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
    },
    {
      paranoid: true,
      tableName: "assignments",
    }
  );

  Assignment.associate = (models) => {
    Assignment.belongsTo(models.Lesson, {
      foreignKey: "lessonId",
      as: "lesson",
      onDelete: "CASCADE", // Add this
    });
  };

  return Assignment;
};// Chat model
module.exports = (sequelize, DataTypes) => {
  const Chat = sequelize.define(
    "Chat",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true, // Null for private chats
      },
      type: {
        type: DataTypes.ENUM("private", "group", "class", "subject"),
        allowNull: false,
        defaultValue: "private",
      },
      classId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "classes", key: "id" },
      },
      subjectId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "subjects", key: "id" },
      },
    },
    {
      paranoid: true,
      tableName: "chats",
    }
  );
  Chat.associate = (models) => {
    Chat.hasMany(models.ChatParticipant, {
      foreignKey: "chatId",
      as: "participants", // This 'as' now correctly matches your controller's include
    });
    // Chat.belongsToMany(models.User, {
    //   through: "chat_Participants",
    //   foreignKey: "chatId",
    //   as: "users", // Renamed for clarity: a Chat has many Users
    // });
  
    Chat.hasMany(models.Message, {
      foreignKey: "chatId",
      as: "messages",
      onDelete: "CASCADE",
    });
    Chat.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
    });
    Chat.belongsTo(models.Subject, {
      foreignKey: "subjectId",
      as: "subject",
    });
  };

  return Chat;
};

// ChatParticipant model
module.exports = (sequelize, DataTypes) => {
  const ChatParticipant = sequelize.define(
    "ChatParticipant",
    {
      chatId: {
        type: DataTypes.UUID,
        primaryKey: true,
        field: 'chatId' // Explicit field mapping
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        primaryKey: true,
        field: 'userId'
      },
      role: {
        type: DataTypes.ENUM("admin", "member"),
        defaultValue: "member",
      },
      lastSeen: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'chat_participants', // Match exact table name
      underscored: false, // Disable underscore transformation
      paranoid: true,
      timestamps: true
    }
  );
  ChatParticipant.associate = (models) => {
    ChatParticipant.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat'
    });
    
    ChatParticipant.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };


  return ChatParticipant;
};
module.exports = (sequelize, DataTypes) => {
  const Class = sequelize.define(
    "Class",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true
        }
      },
      capacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      supervisorId: {
        type: DataTypes.UUID,
        allowNull: true, // A class might not have a supervisor initially
        references: {
          model: "teachers",
          key: "id",
        },
      },
      classLevelId: {  // Changed from "level" to "classLevelId"
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "class_levels",
          key: "id",
        },
      },
      schoolYearId: { // Foreign key to SchoolYear
        type: DataTypes.UUID,
        allowNull: false, // Set to false if a class MUST belong to a school year
        references: {
          model: 'school_years', // Assuming your SchoolYear model's table name is 'SchoolYears'
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT', // Prevent deletion of SchoolYear if classes are linked
      },
      termId: {  // Added term association
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "terms",
          key: "id",
        },
      },
    },
    {
      paranoid: true,
      tableName: "classes",
      indexes: [
        {
          unique: true,
          fields: ['name', 'termId'], // Class names should be unique per term
        }
      ]
    }
  );

  Class.associate = (models) => {
    Class.belongsTo(models.Teacher, {
      foreignKey: "supervisorId",
      as: "supervisor",
    });
    
    Class.belongsTo(models.ClassLevel, {
      foreignKey: "classLevelId",
      as: "classLevel",
    });
    
    Class.belongsTo(models.Term, {
      foreignKey: "termId",
      as: "term",
    });
    
    Class.hasMany(models.Student, {
      foreignKey: "currentClassId",
      as: "students",
    });
    
    Class.hasMany(models.Lesson, {
      foreignKey: "classId",
      as: "lessons",
    });
    Class.belongsTo(models.SchoolYear, { foreignKey: 'schoolYearId', as: 'schoolYear' });

  };

  return Class;
};
module.exports = (sequelize, DataTypes) => {
  const ClassLevel = sequelize.define(
    "ClassLevel",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        validate: {
          min: 1 ,// Ensure level is at least 1
          max:4
        }
      },
     
    },
    {
      paranoid: true,
      tableName: "class_levels",
      indexes: [
        {
          unique: true,
          fields: ['level']
        }
      ]
    }
  );

  ClassLevel.associate = (models) => {
    ClassLevel.hasMany(models.Class, {
      foreignKey: "classLevelId",  // Changed from "classLevel" to "classLevelId"
      as: "classes",
      onDelete: "CASCADE",
    });
    
  };

  return ClassLevel;
};
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'posts', key: 'id' },
      onDelete: 'CASCADE',
    },
    parentCommentId: { // For nested replies to comments
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'comments', key: 'id' },
      onDelete: 'CASCADE',
    },
  }, {
    paranoid: true, // For soft deletes
    tableName: 'comments',
    timestamps: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.User, { foreignKey: 'authorId', as: 'author' });
    Comment.belongsTo(models.Post, { foreignKey: 'postId', as: 'post' });
    // Self-referencing for nested comments
    Comment.hasMany(models.Comment, { foreignKey: 'parentCommentId', as: 'replies' });
    Comment.belongsTo(models.Comment, { foreignKey: 'parentCommentId', as: 'parentComment' });
  };

  return Comment;
};// Department model for HOD assignment
module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define(
    "Department",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      hodId: { // <-- ADD THIS FIELD
        type: DataTypes.UUID,
        allowNull: true, // HOD is optional
        references: {
          model: "teachers", // Reference the teachers table
          key: "id",
        },
        onDelete: "SET NULL", // Recommended: Department remains if HOD is deleted
      },
    },
    {
      paranoid: true,
      tableName: "departments",
    }
  );

  Department.associate = (models) => {
    Department.belongsTo(models.Teacher, {
      foreignKey: "hodId",
      as: "headOfDepartment",
    });
    Department.hasMany(models.Subject, {
      foreignKey: "departmentId",
      as: "subjects",
    });
  };

  return Department;
};
const { Sequelize } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  const Event = sequelize.define(
    "Event",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      classId: {
        type: DataTypes.UUID,
        references: {
          model: "classes", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.NOW,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      paranoid: true, // Enables soft deletes
      tableName: "events", // Explicit table name
    }
  );

  Event.associate = (models) => {
    Event.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
      onDelete: "CASCADE", // Add this
    });
  };

  return Event;
};
"use strict";

require("dotenv").config();
const fs = require("fs");

const path = require("path");
const Sequelize = require("sequelize");
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || "development";

const config = require(path.join(__dirname, "../", "config", "config.json"))[
  env
];

const db = {};

let sequelize;
if (config.use_env_variable) {
  console.log(`config is: ${config}`);
  sequelize = new Sequelize(
    process.env[config.use_env_variable],
    config.dialect,
    (config.logging = false),
    config
  );
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, {
    host: config.host,
    dialect: config.dialect, // Explicitly include the dialect
    logging: false,
  });
}
// sequelize = new Sequelize(
//   "postgresql://postgres.vzoevdkkjwvfouogmbrj:6d8CrGJ1AwFZR6KM@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
//   {
//     dialect: "postgres",
//     protocol: "postgres",
//     dialectOptions: {
//       ssl: {
//         require: true,
//         rejectUnauthorized: false, // For self-signed certificates (Supabase uses SSL)
//       },
//       pool: {
//         max: 5,
//         min: 0,
//         acquire: 30000,
//         idle: 10000
//       },
//     },
//     logging: false, // Disable logging if not needed
//   }
// );

fs.readdirSync(__dirname)
  .filter((file) => {
    return (
      file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js"
    );
  })
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(
      sequelize,
      Sequelize.DataTypes
    );
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

// In your models/index.js or equivalent
// db.User.hasMany(db.StudentAssessmentScore, { foreignKey: 'studentId', as: 'scores' });
// db.StudentAssessmentScore.belongsTo(db.User, { foreignKey: 'studentId', as: 'student' });

// db.Subject.hasMany(db.Assessment, { foreignKey: 'subjectId' });
// db.Assessment.belongsTo(db.Subject, { foreignKey: 'subjectId' });

// db.AssessmentType.hasMany(db.Assessment, { foreignKey: 'assessmentTypeId' });
// db.Assessment.belongsTo(db.AssessmentType, { foreignKey: 'assessmentTypeId' });

// db.Assessment.hasMany(db.StudentAssessmentScore, { foreignKey: 'assessmentId' });
// db.StudentAssessmentScore.belongsTo(db.Assessment, { foreignKey: 'assessmentId' });

// Ensure AcademicRecord has proper associations as well, e.g., to Student, Subject, AcademicYear, Term.
// Assuming your AcademicRecord is per term/year, not per assessment.
// You might want to update AcademicRecord's score/grade to be derived from assessments.

// const fs = require('fs');
// const path = require('path');
// const { Sequelize } = require('sequelize');
// const config = require('../config/config'); // Assuming config.js is in the parent directory

// const sequelize = new Sequelize(config.database, config.username, config.password, {
//   host: config.host,
//   dialect: 'postgres',
//   logging: false, // Disable logging
// });

// const models = {};

// fs.readdirSync(__dirname)
//   .filter(file => file.endsWith('.js') && file !== path.basename(__filename))
//   .forEach(file => {
//     const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
//     models[model.name] = model;
//   });

// Object.keys(models).forEach(modelName => {
//   if (models[modelName].associate) {
//     models[modelName].associate(models);
//   }
// });

// module.exports = { sequelize, Sequelize, models };
module.exports = (sequelize, DataTypes) => {
  const Lesson = sequelize.define(
    "Lesson",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      day: {
        type: DataTypes.ENUM(
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ),
        allowNull: false,
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      subjectId: {
        type: DataTypes.UUID,
        references: {
          model: "subjects", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      classId: {
        type: DataTypes.UUID,
        references: {
          model: "classes", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      teacherId: {
        type: DataTypes.UUID,
        references: {
          model: "teachers", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      termId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "terms", key: "id" },
      },
      schoolYearId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "school_years", key: "id" },
      },
    },
    {
      paranoid: true,
      tableName: "lessons",
    }
  );

  Lesson.associate = (models) => {
    Lesson.belongsTo(models.Subject, {
      foreignKey: "subjectId",
      as: "subject",
      onDelete: "CASCADE", // Add this
    });
    Lesson.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
      onDelete: "CASCADE", // Add this
    });
    Lesson.belongsTo(models.Teacher, {
      foreignKey: "teacherId",
      as: "teacher",
      onDelete: "CASCADE", // Add this
    });
    Lesson.belongsTo(models.TeachingAssignment, {
      foreignKey: "assignmentId",
      as: "assignment",
    });
  };

  return Lesson;
};
// Message model
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    "Message",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      parentMessageId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "messages", key: "id" },
      },
      chatId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "chats", key: "id" },
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
    },
    {
      paranoid: true,
      tableName: "messages",
    }
  );

  Message.associate = (models) => {
    Message.belongsTo(models.Chat, {
      foreignKey: "chatId",
      as: "chat",
    });
    Message.belongsTo(models.User, {
      foreignKey: "senderId",
      as: "sender",
    });
    Message.belongsTo(models.Message, {
      foreignKey: "parentMessageId",
      as: "parentMessage",
    });
    Message.hasMany(models.Message, {
      foreignKey: "parentMessageId",
      as: "replies",
    });
  };

  return Message;
};

module.exports = (sequelize, DataTypes) => {
  const Parent = sequelize.define(
    "Parent",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      parentNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: () => `PAR${Math.floor(1000 + Math.random() * 9000)}`, // Generates like PAR1234
      },
    },
    {
      paranoid: true,
      tableName: "parents",
    }
  );

  Parent.associate = (models) => {
    Parent.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE",
    });
    Parent.hasMany(models.Student, {
      foreignKey: "parentId",
      as: "students",
      onDelete: "CASCADE", // Add this
    });
    // ... rest of your associations
  };

  return Parent;
};const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Post = sequelize.define('Post', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255] // Example length validation
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }, // Assuming 'users' is your User table
      onDelete: 'CASCADE',
    },
    type: { // e.g., 'announcement', 'event', 'general_discussion'
      type: DataTypes.ENUM('announcement', 'event', 'general_discussion'),
      defaultValue: 'general_discussion',
      allowNull: false,
    },
    visibility: { // Controls who can see the post
      type: DataTypes.ENUM('public', 'private_group', 'admin_only', 'teachers', 'parents', 'students', 'class_specific', 'subject_specific'),
      defaultValue: 'public',
      allowNull: false,
    },
    classId: { // Optional: for class-specific posts
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'classes', key: 'id' },
      onDelete: 'SET NULL', // If class is deleted, post remains, but link is severed
    },
    subjectId: { // Optional: for subject-specific posts
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'subjects', key: 'id' },
      onDelete: 'SET NULL',
    },
    eventDate: { // For 'event' type posts
      type: DataTypes.DATE,
      allowNull: true,
    },
    location: { // For 'event' type posts
      type: DataTypes.STRING,
      allowNull: true,
      len: [0, 255]
    },
    // Consider adding a 'status' field if posts can be drafts, published, archived
  }, {
    paranoid: true, // For soft deletes
    tableName: 'posts',
    timestamps: true, // createdAt, updatedAt
  });

  Post.associate = (models) => {
    Post.belongsTo(models.User, { foreignKey: 'authorId', as: 'author' });
    Post.hasMany(models.Comment, { foreignKey: 'postId', as: 'comments' });
    Post.belongsTo(models.Class, { foreignKey: 'classId', as: 'class' });
    Post.belongsTo(models.Subject, { foreignKey: 'subjectId', as: 'subject' });
  };

  return Post;
};module.exports = (sequelize, DataTypes) => {
  const SchoolYear = sequelize.define(
    "SchoolYear",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      paranoid: true,
      tableName: "school_years",
    }
  );

  SchoolYear.associate = (models) => {
    SchoolYear.hasMany(models.Term, {
      foreignKey: "schoolYearId",
      as: "terms",
      onDelete: "CASCADE", // Add this
    });
  };

  return SchoolYear;
};
// models/setting.js
// Assuming your sequelize instance is exported from index.js
module.exports = (sequelize, DataTypes) => {
  const Setting = sequelize.define('Setting',
  {  // Model name,
      key: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true, // Using key as primary key for direct access
      },
      value: {
        type: DataTypes.JSONB, // Use JSONB to store various data types (string, number, object, array)
        allowNull: true, // Allow null if a setting can be empty
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true, // Optional description for admin UI
      },
    }, {
    timestamps: true, // Includes createdAt and updatedAt
    paranoid: false, // Settings are usually not soft-deleted
  });

  // No associations needed for a simple key-value settings table
  return Setting;
};
module.exports = (sequelize, DataTypes) => {
  const Student = sequelize.define(
    "Student",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        references: {
          model: "users", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      parentId: {
        type: DataTypes.UUID,
        references: {
          model: "parents", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      alte_guardian_Id: { // Consider renaming to alternateGuardianId
        type: DataTypes.UUID,
        references: { model: "parents", key: "id" }, // Assuming this also links to Parents
        allowNull: true,
        onDelete: "CASCADE",
      },
      currentClassId: {
        type: DataTypes.UUID,
        references: {
          model: "classes", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      studentNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: function () {
          const currentYear = new Date().getFullYear().toString().slice(-2);
          const randomNum = Math.floor(100 + Math.random() * 900);
          return `STUD-${randomNum}-${currentYear}`; // Generates like STUD-123-23
        },
      },
    },
    {
      paranoid: true,
      tableName: "students",
    }
  );

  Student.associate = (models) => {
    Student.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE", // Add this
    });
    Student.belongsTo(models.Parent, {
      foreignKey: "parentId",
      as: "parent",
      onDelete: "CASCADE", // Add this
    });
    Student.belongsTo(models.Parent, { // Association for alternate guardian
      foreignKey: "alte_guardian_Id", // Corrected foreign key name
      as: "alternateGuardian",
      onDelete: "CASCADE",
    });
    Student.belongsTo(models.Class, {
      foreignKey: "currentClassId",
      as: "currentClass",
      onDelete: "SET NULL", // Recommendation: SET NULL for class changes
    });
    

  };
  return Student;
};

// 
// backend/models/studentAssessmentScore.js
module.exports = (sequelize, DataTypes) => {
  const StudentAssessmentScore = sequelize.define("StudentAssessmentScore", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    studentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "students", key: "id" },
      onDelete: "CASCADE", // If student is deleted, delete their scores
    },
    assessmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "assessments", key: "id" },
      onDelete: "CASCADE", // If assessment is deleted, delete associated scores
    },
    score: {
      type: DataTypes.DECIMAL(5, 2), // e.g., 85.50
      allowNull: false,
      validate: {
        min: 0,
        // Max score validation should ideally happen at the controller level
        // or derived from the associated Assessment's maxScore.
      },
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true, // Teacher's comments on this specific score
    },
  }, {
    paranoid: true, // Enable soft deletes
    tableName: "student_assessment_scores",
    timestamps: true, // createdAt, updatedAt
    indexes: [
      {
        unique: true,
        fields: ["studentId", "assessmentId"],
        name: "unique_student_assessment_score"
      }
    ]
  });

  StudentAssessmentScore.associate = (models) => {
    StudentAssessmentScore.belongsTo(models.Student, { foreignKey: "studentId", as: "student" });
    StudentAssessmentScore.belongsTo(models.Assessment, { foreignKey: "assessmentId", as: "assessment" });
  };

  return StudentAssessmentScore;
};

// models/studenttermresult.js (NEW/Renamed from StudentGrade)
module.exports = (sequelize, DataTypes) => {
  const StudentTermResult = sequelize.define('StudentTermResult', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    finalScore: { // This is the end-of-term exam score
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      validate: {
        min: 0,
        max: 100,
      },
    },
    grade: { // Calculated grade based on finalScore
      type: DataTypes.STRING,
      allowNull: false,
    },
    passStatus: { // 'PASS' or 'FAIL' based on Malawian rules
      type: DataTypes.ENUM('PASS', 'FAIL'),
      allowNull: false,
    },
    teacherRemarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Foreign keys
    studentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'students',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    subjectId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'subjects',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    termId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'terms',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    schoolYearId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'school_years',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
  }, {
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        unique: true,
        fields: ['studentId', 'subjectId', 'termId', 'schoolYearId'],
        name: 'unique_student_subject_term_result',
      },
    ],
  });

  StudentTermResult.associate = (models) => {
    StudentTermResult.belongsTo(models.Student, { foreignKey: 'studentId', as: 'student' });
    StudentTermResult.belongsTo(models.Subject, { foreignKey: 'subjectId', as: 'subject' });
    StudentTermResult.belongsTo(models.Term, { foreignKey: 'termId', as: 'term' });
    StudentTermResult.belongsTo(models.SchoolYear, { foreignKey: 'schoolYearId', as: 'schoolYear' });
  };

  return StudentTermResult;
};
module.exports = (sequelize, DataTypes) => {
  const Subject = sequelize.define(
    "Subject",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      paranoid: true,
      tableName: "subjects",
    },
   
  );

  Subject.associate = (models) => {
    Subject.belongsToMany(models.Teacher, {
      through: "SubjectToTeacher",
      foreignKey: "subjectId",
      as: "teachers",
      onDelete: "CASCADE", // Add this
    });
    Subject.belongsTo(models.Department, {
      foreignKey: "departmentId",
      as: "department",
    });
    Subject.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
    });
    
    Subject.hasMany(models.Assessment,
      { foreignKey: 'subjectId' });


  };

  return Subject;
};
const { DataTypes } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  const Teacher = sequelize.define(
    "Teacher",
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true, // Remove defaultValue since it will come from User
      },
      staffNumber: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        defaultValue: () => `STAF${Math.floor(1000 + Math.random() * 9000)}`, // Generates like STAF1234
      },
      qualifications: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
      subjects: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
      },
    },
    {
      paranoid: true,
      tableName: "teachers",
    }
  );

  Teacher.associate = (models) => {
    Teacher.belongsTo(models.User, {
      foreignKey: "id",
      as: "user",
      onDelete: "CASCADE",
    });
    Teacher.hasMany(models.Lesson, {
      foreignKey: "teacherId",
      as: "lessons",
      onDelete: "CASCADE", // Add this
    });
    Teacher.hasMany(models.TeachingAssignment, {
      foreignKey: "teacherId",
      as: "teachingAssignments",
      onDelete: "CASCADE",
    });
    Teacher.hasMany(models.Class, {
      foreignKey: "supervisorId",
      as: "supervisedClasses",
      onDelete: "SET NULL", // Recommended: SET NULL if a class supervisor is deleted
    });
    Teacher.hasMany(models.Department, {
      foreignKey: "hodId", // Assuming hodId is on Department
      as: "departmentsAsHOD",
      onDelete: "SET NULL", // Recommended: SET NULL if an HOD is deleted
    });
    // ... rest of your associations
  };

  return Teacher;
};
const { model } = require("mongoose");

// TeachingAssignment model (replaces SubjectToTeacher)
module.exports = (sequelize, DataTypes) => {
  const TeachingAssignment = sequelize.define(
    "TeachingAssignment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      subjectId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "subjects", key: "id" },
      },
      teacherId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "teachers", key: "id" },
      },
      classId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "classes", key: "id" },
      },
      termId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "terms", key: "id" },
      },
      schoolYearId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "school_years", key: "id" },
      },
      isHOD: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      departmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model:"departments",key:"id"
        },
      }
    },
    {
      paranoid: true,
      tableName: "teaching_assignments",
      indexes: [
        {
          unique: true,
          name: "unique_subject_assignment",
          fields: ["subjectId", "classId", "termId", "schoolYearId"],
        },
      ],
    }
  );

  TeachingAssignment.associate = (models) => {
    TeachingAssignment.belongsTo(models.Subject, {
      foreignKey: "subjectId",
      as: "subject",
    });
    TeachingAssignment.belongsTo(models.Teacher, {
      foreignKey: "teacherId",
      as: "teacher",
    });
    TeachingAssignment.belongsTo(models.Class, {
      foreignKey: "classId",
      as: "class",
    });
    TeachingAssignment.belongsTo(models.Term, {
      foreignKey: "termId",
      as: "term",
    });
    TeachingAssignment.belongsTo(models.SchoolYear, {
      foreignKey: "schoolYearId",
      as: "schoolYear",
    });
  };

  return TeachingAssignment;
};

module.exports = (sequelize, DataTypes) => {
  const Term = sequelize.define(
    "Term",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tname: {
        type: DataTypes.ENUM("Term 1", "Term 2", "Term 3"),
        allowNull: false,
        
      },
      schoolYearId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "school_years", // Table name
          key: "id",
        },
        onDelete: "CASCADE", // Add this
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      paranoid: true,
      tableName: "terms",
    }
  );

  Term.associate = (models) => {
    Term.belongsTo(models.SchoolYear, {
      foreignKey: "schoolYearId",
      as: "schoolYear",
      onDelete: "CASCADE", // Add this
    });
  };

  return Term;
};
const { DataTypes } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        unique: true, // Username should still be unique for login
        allowNull: false,
      },
      dob: {
        type: DataTypes.DATE,
        allowNull: true, // Date of birth might be optional for some systems, but usually kept for students
      },
      role: {
        type: DataTypes.ENUM("admin", "teacher", "parent", "student"),
        allowNull: false,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true, // <--- CHANGED: Now allows null
      },
      email: {
        type: DataTypes.STRING,
        unique: false, // <--- CHANGED: No longer unique across all users
        allowNull: true, // <--- CHANGED: Now allows null
        validate: {
          isEmail: function(value) {
            // Only validate as email if a value is provided
            if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              throw new Error('Invalid email format');
            }
          },
        },
      },
      phone: {
        type: DataTypes.STRING,
        unique: false, // <--- CHANGED: No longer unique across all users
        allowNull: true, // <--- CHANGED: Now allows null
        // You might add custom phone number validation here if needed
      },
      sex: {
        type: DataTypes.ENUM("MALE", "FEMALE"),
        allowNull: false,
      },
      profilePhoto: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      paranoid: true,
      tableName: "users",
    }
  );

  User.associate = (models) => {
    User.hasOne(models.Teacher, {
      foreignKey: "id", // Changed from userId to id to share same ID
      as: "teacher",
      onDelete: "CASCADE",
    });
    User.hasOne(models.Parent, {
      foreignKey: "id", // Changed from userId to id
      as: "parent",
      onDelete: "CASCADE",
    });
    User.hasOne(models.Student, {
      foreignKey: "id", // Changed from userId to id
      as: "student",
      onDelete: "CASCADE",
    });
    User.hasOne(models.Admin, {
      foreignKey: "id", // Changed from userId to id
      as: "admin",
      onDelete: "CASCADE",
    });
  };

  return User;
};
