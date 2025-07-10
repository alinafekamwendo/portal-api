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
