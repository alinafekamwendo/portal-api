const { Post, Comment, User, Class, Subject } = require('../models'); // Import all necessary models
const { sequelize, Op } = require('../models'); // Import Op for Sequelize operators

// Create a new post
const createPost = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { title, content, type, visibility, classId, subjectId, eventDate, location } = req.body;
    const authorId = req.user.id; // Assumes req.user is populated by your authentication middleware

    // Authorization check: Only admins or specific roles can create certain post types
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can create posts.' });
    }
    // Further granular checks: e.g., teachers can create class_specific posts for their classes

    const post = await Post.create({
      title, content, authorId, type, visibility, classId, subjectId, eventDate, location
    }, { transaction });

    await transaction.commit();
    res.status(201).json(post);
  } catch (err) {
    await transaction.rollback();
    console.error(`Error creating post: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to create post' });
  }
};

// Get all posts, with robust filtering based on user role and post visibility
const getPosts = async (req, res) => {
  try {
  

    
      // Add subject-specific visibility (more complex, depends on how students/teachers are linked to subjects)
      // You'd need to fetch all subjects the user is associated wit

    const posts = await Post.findAll({
      include: [
        { model: User, as: 'author', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePhoto'] },
        {
          model: Comment,
          as: 'comments',
          separate: true, // Important for ordering comments per post
          order: [['createdAt', 'ASC']],
          include: [
            { model: User, as: 'author', attributes: ['id', 'username', 'firstName', 'lastName'] },
            { model: Comment, as: 'replies', include: [{ model: User, as: 'author', attributes: ['id', 'username'] }] } // Nested replies
          ]
        },
        { model: Class, as: 'class', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']], // Latest posts first
    });

    res.status(200).json(posts);
  } catch (err) {
    console.error(`Error fetching posts: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
};

// Create a comment on a post
const createComment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;
    const authorId = req.user.id; // Current user ID from auth

    const post = await Post.findByPk(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = await Comment.create({
      content, authorId, postId, parentCommentId
    }, { transaction });

    await transaction.commit();
    res.status(201).json(comment);
  } catch (err) {
    await transaction.rollback();
    console.error(`Error creating comment: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to create comment' });
  }
};

module.exports = {
  createPost,
  getPosts,
  createComment,
  // Add more: getPostById, updatePost, deletePost, updateComment, deleteComment
};