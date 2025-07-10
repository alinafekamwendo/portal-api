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
