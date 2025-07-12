const express = require("express");
const http = require('http');
const ngrok = require('@ngrok/ngrok');
const dotenv = require("dotenv");
const adminRoutes = require("./routes/admin.route.js");
const chatRoutes = require("./routes/chat.routes.js"); // Your existing REST chat routes (will be replaced by GraphQL for chat)
const parentsRoutes = require("./routes/common.routes.js")
const schoolSetupRoutes = require("./routes/schoolSetup.routes.js");
const teacherRoutes = require("./routes/teacher.routes.js");
const studentRoutes = require("./routes/student.routes.js");
const assessmentAndReportingRoutes = require("./routes/assessmentAndReporting.routes.js");


const cookieParser = require("cookie-parser");
const logger = require("morgan");
const path = require("path");
const db = require("./models"); // Your Sequelize models
const cors = require("cors");
 // Import http module for server creation
const { expressMiddleware } = require('@apollo/server/express4'); // For Apollo Server Express integration
const bodyParser = require('body-parser'); // For parsing GraphQL request bodies
const jwt = require('jsonwebtoken'); // For JWT token verification in GraphQL middleware

// Import the setup function for your GraphQL server
const setupApolloServer = require('./graphql'); // Your GraphQL server setup function from backend/graphql/index.js

// Load environment variables
dotenv.config();

const app = express();
const httpServer = http.createServer(app); // Create an HTTP server from your Express app
//cors configuration
const allowedOrigins = [
  'https://chigoneka-school-portal.vercel.app', // Your Vercel frontend
  'http://localhost:3000', // Local dev (optional)
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // Required if using cookies/auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization','ngrok-skip-browser-warning'], // Allowed headers
  })
);
// Middleware
app.use(logger("dev"));
app.use(express.json()); // For parsing application/json
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded
app.use(cookieParser());

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  "/uploads/profilephotos",
  express.static(path.join(__dirname, "uploads/profilephoto"))
);

// API Version
const apiVersion = process.env.API_VERSION || 'api/v1'; // Default to 'api/v1' if not set


// Home route for REST API
app.get(`/${apiVersion}`, (req, res) => {
  res.status(200).json({ Message: "Portal API running !!" });
});

// --- Your existing REST API routes ---
app.use(`/${apiVersion}`, schoolSetupRoutes);
app.use(`/${apiVersion}`, assessmentAndReportingRoutes);
app.use(`/${apiVersion}/students`, studentRoutes);
app.use(`/${apiVersion}/admin`, adminRoutes);
app.use(`/${apiVersion}/teachers`, teacherRoutes);
app.use(`/${apiVersion}/community`, chatRoutes); // Your existing REST chat routes
app.use(`/${apiVersion}/parents`, parentsRoutes);

// Catch-all route for invalid REST endpoints
app.get("*", (req, res) => {
  res.status(404).json({ Error: "Invalid endpoint, please check" });
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

// --- GraphQL Endpoint Integration ---
async function startServer() {
  // Setup Apollo Server and get the instance
  const apolloServer = await setupApolloServer(httpServer);

  // Middleware to attach authenticated user to req.user for HTTP GraphQL requests
  const authenticateGraphQL = async (req, res, next) => {
    let token = req.headers.authorization?.split(' ')[1] || req.cookies?.accessToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user to request object
      } catch (error) {
        console.error("HTTP GraphQL JWT Verification Error:", error.message);
      }
    }
    next(); // Always call next, even if no token or invalid token, to allow Apollo Server to proceed
  };

  // Apply Apollo Server middleware to your Express app at the /graphql endpoint
  app.use(
    `/${apiVersion}/graphql`,
    cors(),
    bodyParser.json(),
    authenticateGraphQL, // Custom authentication middleware for HTTP GraphQL requests
    expressMiddleware(apolloServer, {
      context: async ({ req }) => ({ user: req.user, db }), // Pass authenticated user and db models to resolvers
    }),
  );

  // IMPORTANT: Use { alter: true } for development to sync schema changes,
  // or remove .sync() entirely if using Sequelize migrations.
  db.sequelize.sync({ alter: true }).then(() => {
    httpServer.listen(port, () => { // Use httpServer.listen() for WebSockets to work
      console.log(`Server running on port http://localhost:${port}/${apiVersion}`);
      console.log(`GraphQL endpoint: http://localhost:${port}/graphql`);
      console.log(`GraphQL Subscriptions: ws://localhost:${port}/graphql`);
    try {
        // Configure ngrok to forward to your server's port
         ngrok.connect({
          addr: port, 
          authtoken_from_env: true, // Make sure NGROK_AUTH_TOKEN is in your .env
          // You can add more ngrok options here if needed
          // For example, to expose both http and https:
          // proto: 'http', // or 'https', 'tcp', 'tls'
        }).then(listener => console.log(`Ingress established at: ${listener.url()}`));
      
        
        console.log(`ngrok tunnel created at: ${listener.url()}`);
        console.log('Traffic stats available at http://127.0.0.1:4040');
      } catch (err) {
        console.error('ngrok connection error:', err);
        // Don't exit the process, your server is still running locally
      }
    });
  }).catch(err => {
    console.error('Failed to connect to DB or sync models:', err);
    process.exit(1);
  });
}

startServer();