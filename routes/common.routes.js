const express = require('express');
const router = express.Router();
const {
  createParent,
  getParents,
  getParentById,
  updateParent,
  deleteParent,
} = require('../controllers/parentController');
const { authenticate,authorize } =require('../middlewares/authMiddleware');
/**
 * @route POST /api/parents
 * @desc Create a new parent and associated user account
 * @access Public (or Restricted based on your auth strategy, e.g., Admin)
 */
router.post(
  '/',
  // Add validation middleware here, e.g., validateParentCreation,
  createParent
);

/**
 * @route GET /api/parents
 * @desc Get all parents with associated user information
 * @access Public (or Restricted)
 */
router.get('/',authenticate,authorize(["admin"]), getParents);

/**
 * @route GET /api/parents/:id
 * @desc Get a single parent by ID with associated user information
 * @access Public (or Restricted)
 */
router.get('/:id',authenticate,authorize(["admin","parent"]), getParentById);

/**
 * @route PUT /api/parents/:id
 * @desc Update parent and associated user information by ID
 * @access Restricted (e.g., Admin or the parent themselves)
 */
router.put(
    '/:id',
    authenticate,authorize(["admin","parent"]),
  // Add validation middleware here, e.g., validateParentUpdate,
  updateParent
);

/**
 * @route DELETE /api/parents/:id
 * @desc Delete a parent and associated user account by ID
 * @access Restricted (e.g., Admin)
 */
router.delete('/:id',authenticate,authorize(["admin","parent"]) ,deleteParent);

module.exports = router;