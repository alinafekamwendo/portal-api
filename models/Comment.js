const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Comment = sequelize.define('Comment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'posts', key: 'id' },
      onDelete: 'CASCADE',
    },
    parentCommentId: { // For nested replies to comments
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'comments', key: 'id' },
      onDelete: 'CASCADE',
    },
  }, {
    paranoid: true, // For soft deletes
    tableName: 'comments',
    timestamps: true,
  });

  Comment.associate = (models) => {
    Comment.belongsTo(models.User, { foreignKey: 'authorId', as: 'author' });
    Comment.belongsTo(models.Post, { foreignKey: 'postId', as: 'post' });
    // Self-referencing for nested comments
    Comment.hasMany(models.Comment, { foreignKey: 'parentCommentId', as: 'replies' });
    Comment.belongsTo(models.Comment, { foreignKey: 'parentCommentId', as: 'parentComment' });
  };

  return Comment;
};