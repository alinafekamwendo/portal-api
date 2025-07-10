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
