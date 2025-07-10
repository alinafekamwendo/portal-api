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
