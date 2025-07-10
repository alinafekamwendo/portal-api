// routes/setting.routes.js
const express = require('express');
const {
  getAllSettings,
  getSettingByKey,
  createSetting,
  updateSetting,
  deleteSetting,
} = require('../controllers/settingController.js'); // CommonJS import
const { authenticate, authorize } = require('../middlewares/authMiddleware.js'); // CommonJS import

const router = express.Router();

// All setting operations should typically be restricted to administrators
router.get('/', authenticate, authorize(['admin']), getAllSettings);
router.get('/:key', authenticate, authorize(['admin']), getSettingByKey);
router.post('/', authenticate, authorize(['admin']), createSetting);
router.put('/:key', authenticate, authorize(['admin']), updateSetting);
router.delete('/:key', authenticate, authorize(['admin']), deleteSetting);

module.exports = router; // CommonJS export
