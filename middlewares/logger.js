// middlewares/logger.js
const { Log } = require('../models');

const logAction = async (req, action, entityType = null, entityId = null, metadata = {}) => {
  try {
    // Safely get user ID from various possible sources
    const userId = req.user.id || 
                  (req.user && req.user.user && req.user.user.id) || 
                  (req.body && req.body.userId) || 
                  null;
      console.log("Logging user with ID", userId);
    await Log.create({
      userId,
      action,
      entityType,
      entityId,
      metadata: {
        ...metadata,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'] || 'unknown'
      }
    });
  } catch (error) {
    console.error('Failed to log action:', error);
    // Consider adding error logging to a file or external service
  }
};

const activityLogger = (action, entityType = null, getEntityId = null) => {
  return async (req, res, next) => {
    try {
      // Store the original response functions
      const originalJson = res.json;
      const originalEnd = res.end;

      // Create a buffer to capture the response body
      let responseBody = null;

      // Override res.json to capture the response
      res.json = function(body) {
        responseBody = body;
        originalJson.call(this, body);
      };

      // Override res.end to ensure logging happens
      res.end = function(chunk, encoding) {
        if (chunk) {
          responseBody = chunk;
        }
        originalEnd.call(this, chunk, encoding);
      };

      // Log the action after the request is completed
      res.on('finish', async () => {
        try {
          const entityId = getEntityId ? getEntityId(req) : null;
          
          // Get user ID from response if available (for login case)
          const responseUserId = responseBody?.user?.id || null;
          
          const metadata = {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            ...(req.body && Object.keys(req.body).length > 0 ? { 
              requestBody: Object.keys(req.body).reduce((acc, key) => {
                // Don't log passwords
                if (key.toLowerCase().includes('password')) {
                  acc[key] = '*****';
                } else {
                  acc[key] = req.body[key];
                }
                return acc;
              }, {})
            } : {})
          };
          
          await logAction(req, action, entityType, entityId || responseUserId, metadata);
        } catch (error) {
          console.error('Error in activity logger finish handler:', error);
        }
      });

      next();
    } catch (error) {
      console.error('Logger middleware error:', error);
      next();
    }
  };
};

module.exports = {
  logAction,
  activityLogger
};