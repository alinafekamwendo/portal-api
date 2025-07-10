const express = require("express");
const {
  createAdmin,
  getAllAdmins,
  getAdminById,
  getAdminByUserId,
  updateAdmin,
  deleteAdmin,
  restoreAdmin,
  promoteToSuperAdmin,
  demoteToRegularAdmin,
} = require("../controllers/adminController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all admin routes
router.use(authenticate);

// Admin management routes
router.get(
  "/admins",
  authorize(["admin"]), // Only admins can access
  getAllAdmins
);

router.get(
  "/admins/:id",
  authorize(["admin"]), // Only admins can access
  getAdminById
);

router.get(
  "/user/:userId",
  authorize(["admin"]), // Only admins can access
  getAdminByUserId
);

router.put(
  "/admins/:id",
  authorize(["admin"]), // Only admins can modify
  updateAdmin
);

router.delete(
  "/admins/:id",
  authorize(["admin"]), // Only super admins can delete
  deleteAdmin
);

router.post(
  "/admins/:id/restore",
  authorize(["admin"]), // Only super admins can restore
  restoreAdmin
);

// Admin promotion/demotion routes
router.post(
  "/admins/:id/promote",
  authorize(["admin"]), // Only super admins can promote
  promoteToSuperAdmin
);

router.post(
  "/admins/:id/demote",
  authorize(["admin"]), // Only super admins can demote
  demoteToRegularAdmin
);

module.exports = router;
