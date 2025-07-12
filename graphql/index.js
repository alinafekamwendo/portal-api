const { useServer } =require('graphql-ws/use/ws');// For integrating graphql-ws with Apollo Server
const { ApolloServer } = require('@apollo/server');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { WebSocketServer } = require('ws'); // For WebSocket server

const { makeExecutableSchema } = require('@graphql-tools/schema'); // To create schema for useServer
const jwt = require('jsonwebtoken'); // For JWT token verification

const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const db = require('../models'); // Import your Sequelize models

// Create the executable GraphQL schema
const schema = makeExecutableSchema({ typeDefs, resolvers });

// This function will be called from your main Express app.js/index.js
// It sets up the Apollo Server and the WebSocket server for subscriptions.
async function setupApolloServer(httpServer) {
  // Set up WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql', // WebSocket path, should match Apollo Client's wsLink URI
  });

  // `useServer` will hook into the WebSocket server to handle GraphQL subscriptions
  const serverCleanup = useServer(
    {
      schema,
      context: async (ctx) => {
        // This context is for WebSocket connections (subscriptions).
        // `connectionParams` are sent from the client during the WebSocket handshake.
        const token = ctx.connectionParams?.authToken;
        let user = null;
        if (token) {
          try {
            // Verify the token and attach the decoded user to the context
            user = jwt.verify(token, process.env.JWT_SECRET);
          } catch (error) {
            console.error("WebSocket JWT Verification Error:", error.message);
            // If token is invalid/expired, `user` will remain null, and `checkAuth` in resolvers will handle it.
          }
        }
        return { user, db }; // Pass authenticated user and db models to resolvers
      },
      onConnect: (ctx) => {
        console.log('WebSocket Connected:', ctx.extra.request.socket.remoteAddress);
        // You can perform additional connection validation here if needed
      },
      onDisconnect: (ctx, code, reason) => {
        console.log('WebSocket Disconnected:', code, reason);
      },
    },
    wsServer
  );

  // Setup Apollo Server
  const apolloServer = new ApolloServer({
    schema, // Use the executable schema here
    plugins: [
      // Proper shutdown for HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for WebSocket server
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
    // Custom scalars are already part of the executable schema, but keeping typeDefs/resolvers for clarity
    typeDefs,
    resolvers,
    formatError: (error) => {
      // Custom error formatting (optional)
      console.error("GraphQL Error:", error.message);
      if (error.extensions?.exception?.stacktrace) {
        console.error("Stack Trace:", error.extensions.exception.stacktrace);
      }
      return error;
    },
    // Enable GraphQL Playground / Apollo Sandbox in development
    introspection: process.env.NODE_ENV !== 'production',
    playground: process.env.NODE_ENV !== 'production' ? {
      settings: {
        'editor.theme': 'dark',
        'request.credentials': 'include' // Important for sending cookies/auth headers
      }
    } : false,
  });

  await apolloServer.start(); // Start the Apollo Server

  return apolloServer; // Return the started Apollo Server instance
}

// Export the setup function
module.exports = setupApolloServer;
