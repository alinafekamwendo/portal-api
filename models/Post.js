const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Post = sequelize.define('Post', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255] // Example length validation
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' }, // Assuming 'users' is your User table
      onDelete: 'CASCADE',
    },
    type: { // e.g., 'announcement', 'event', 'general_discussion'
      type: DataTypes.ENUM('announcement', 'event', 'general_discussion'),
      defaultValue: 'general_discussion',
      allowNull: false,
    },
    visibility: { // Controls who can see the post
      type: DataTypes.ENUM('public', 'private_group', 'admin_only', 'teachers', 'parents', 'students', 'class_specific', 'subject_specific'),
      defaultValue: 'public',
      allowNull: false,
    },
    classId: { // Optional: for class-specific posts
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'classes', key: 'id' },
      onDelete: 'SET NULL', // If class is deleted, post remains, but link is severed
    },
    subjectId: { // Optional: for subject-specific posts
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'subjects', key: 'id' },
      onDelete: 'SET NULL',
    },
    eventDate: { // For 'event' type posts
      type: DataTypes.DATE,
      allowNull: true,
    },
    location: { // For 'event' type posts
      type: DataTypes.STRING,
      allowNull: true,
      len: [0, 255]
    },
    // Consider adding a 'status' field if posts can be drafts, published, archived
  }, {
    paranoid: true, // For soft deletes
    tableName: 'posts',
    timestamps: true, // createdAt, updatedAt
  });

  Post.associate = (models) => {
    Post.belongsTo(models.User, { foreignKey: 'authorId', as: 'author' });
    Post.hasMany(models.Comment, { foreignKey: 'postId', as: 'comments' });
    Post.belongsTo(models.Class, { foreignKey: 'classId', as: 'class' });
    Post.belongsTo(models.Subject, { foreignKey: 'subjectId', as: 'subject' });
  };

  return Post;
};