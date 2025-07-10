const express = require("express");
const router = express.Router();
const { check } = require("express-validator");
const chatController = require("../controllers/chatController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const rateLimit = require("express-rate-limit");
const postController = require('../controllers/postController');


// Validation rules
const createChatValidation = [
  check("type")
    .isIn(["private", "group", "class", "subject"])
    .withMessage("Invalid chat type"),
  check("participants").isArray().withMessage("Participants must be an array"),
  check("participants.*")
    .isUUID()
    .withMessage("Invalid user ID in participants"),
  check("classId")
    .optional()
    .isUUID()
    .withMessage("Valid class ID required")
    .custom((value, { req }) => {
      if (req.body.type === "class" && !value) {
        throw new Error("Class ID is required for class chats");
      }
      return true;
    }),
  check("subjectId")
    .optional()
    .isUUID()
    .withMessage("Valid subject ID required")
    .custom((value, { req }) => {
      if (req.body.type === "subject" && !value) {
        throw new Error("Subject ID is required for subject chats");
      }
      return true;
    }),
  check("name")
    .optional()
    .isString()
    .withMessage("Name must be a string")
    .custom((value, { req }) => {
      if (req.body.type !== "private" && !value) {
        throw new Error("Name is required for non-private chats");
      }
      return true;
    })
];

const privateChatValidation = [
  check("userId").isUUID().withMessage("Valid user ID required"),
  check("otherUserId").isUUID().withMessage("Valid participant ID required")
];

const addParticipantsValidation = [
  check("chatId").isUUID().withMessage("Valid chat ID required"),
  check("participants").isArray({ min: 1 }).withMessage("Participants must be a non-empty array"),
  check("participants.*").isUUID().withMessage("Invalid user ID in participants")
];



const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 chat operations per window
});

router.post("/chats", authenticate, chatLimiter, createChatValidation, chatController.createChat);

router.get(
  "/chats/user/:userId",
  authenticate,
  [check("userId").isUUID().withMessage("Valid user ID required")],
  chatController.getUserChats
);

router.get(
  "/chats/user/:userId/preview",
  authenticate,
  [check("userId").isUUID().withMessage("Valid user ID required")],
  chatController.getUserChatsWithLastMessage
);

router.post(
  "/chats/add-participants",
  authenticate,
  addParticipantsValidation,
  chatController.addParticipants
);
router.post('/chats/private',authenticate, chatController.getOrCreatePrivateChat);
router.post('/chats/:chatId/join', authenticate, chatController.joinPublicChat); // New route
router.get('/chats/public/joinable', authenticate, chatController.getJoinablePublicChats); // New route for discovering public chats
// routes for posts

router.get("/posts/", authenticate, postController.getPosts); // Get all posts, accessible to authenticated users
router.post("/posts", authenticate, authorize(['admin']), postController.createPost); // Only admin can create posts
router.post("/posts/:postId/comments", authenticate, postController.createComment); // Create a comment on a post



module.exports = router;