const express = require("express");
const dotenv = require("dotenv");
const adminRoutes = require("./routes/admin.route.js");
const chatRoutes = require("./routes/chat.routes.js");
const parentsRoutes = require("./routes/common.routes.js")
const schoolSetupRoutes = require("./routes/schoolSetup.routes.js");
const teacherRoutes = require("./routes/teacher.routes.js");
const studentRoutes = require("./routes/student.routes.js");
const assessmentAndReportingRoutes = require("./routes/assessmentAndReporting.routes.js");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const path = require("path");
const db = require("./models");
const cors = require("cors");


// Load environment variables
dotenv.config();

const app = express();

// CORS configuration
app.use(
  cors({
    origin: "http://localhost:3000", // Replace with your frontend URL
    credentials: true, // Allow cookies
  })
);

// Middleware
app.use(logger("dev"));
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
app.use(cookieParser());

// Serve static files from the "uploads" directory
// IMPORTANT: Ensure this path is correct relative to your app.js
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// Specific route for profile photos, if desired, or let the above handle it.
// Your authController.js already uses /uploads/profilephotos, so this is consistent.
app.use(
  "/uploads/profilephotos",
  express.static(path.join(__dirname, "uploads/profilephoto"))
);

// API Version
const apiVersion = process.env.API_VERSION || 'api/v1'; // Default to 'api/v1' if not set


// Home route
app.get(`/${apiVersion}`, (req, res) => {
  res.status(200).json({ Message: "Portal API running !!" });
});

// --- Use the new consolidated route files ---
app.use(`/${apiVersion}`, schoolSetupRoutes); // General school setup and user management
app.use(`/${apiVersion}`, assessmentAndReportingRoutes);

// API routes
 app.use(`/${apiVersion}/students`, studentRoutes); // Student management
app.use(`/${apiVersion}/admin`, adminRoutes);
app.use(`/${apiVersion}/teachers`, teacherRoutes);
app.use(`/${apiVersion}/community`, chatRoutes);

app.use(`/${apiVersion}/parents`, parentsRoutes);

                                   // Assessments, marking, and reports

// Home route
app.get(`/${apiVersion}`, (req, res) => {
  res.status(200).json({ Message: "School Portal API running !!" });
});

// Catch-all route for invalid endpoints
app.get("*", (req, res) => {
  res.status(404).json({ Error: "Invalid endpoint,please check" }); // Changed from 401 to 404 for "not found"
});

// Error handler middleware (keep this as is)
app.use((error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;
  const response = {
    message: error.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
  };

  if (error.isJoi) {
    return res.status(400).json({
      type: "VALIDATION_ERROR",
      errors: error.details.map((detail) => ({
        field: detail.context.key,
        message: detail.message.replace(/['"]/g, ""),
      })),
    });
  }

  if (error.name === "SequelizeValidationError") {
    return res.status(400).json({
      type: "DATABASE_VALIDATION_ERROR",
      errors: error.errors.map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  console.error(`[${new Date().toISOString()}] Error:`, {
    message: error.message,
    statusCode,
    path: req.path,
    method: req.method,
    stack: error.stack,
  });

  res.status(statusCode).json(response);
});

const port = process.env.PORT || 5000;

// IMPORTANT: Use { alter: true } for development to sync schema changes,
// or remove .sync() entirely if using Sequelize migrations.
db.sequelize.sync({ alter: true }).then(() => { // Consider removing this line if using sequelize-cli migrations
  app.listen(port, () => {
    console.log(`Server running on port http://localhost:${port}/${apiVersion}`);
  });
}).catch(err => {
  console.error('Failed to connect to DB or sync models:', err);
  process.exit(1); // Exit process if DB connection fails
});

