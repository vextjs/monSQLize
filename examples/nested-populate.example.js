/**
 * 深度 Populate 使用示例
 *
 * 场景：博客系统
 * - User 有多个 Post
 * - Post 有多个 Comment
 * - Comment 有一个 Author (User)
 */

const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

// 1. 定义 Model
Model.define('users', {
  schema: (dsl) => dsl({
    username: 'string!',
    email: 'string!'
  }),
  relations: {
    posts: {
      from: 'posts',
      localField: '_id',
      foreignField: 'authorId',
      single: false
    }
  }
});

Model.define('posts', {
  schema: (dsl) => dsl({
    title: 'string!',
    content: 'string!',
    authorId: 'objectId'
  }),
  relations: {
    author: {
      from: 'users',
      localField: 'authorId',
      foreignField: '_id',
      single: true
    },
    comments: {
      from: 'comments',
      localField: '_id',
      foreignField: 'postId',
      single: false
    }
  }
});

Model.define('comments', {
  schema: (dsl) => dsl({
    content: 'string!',
    postId: 'objectId',
    authorId: 'objectId'
  }),
  relations: {
    author: {
      from: 'users',
      localField: 'authorId',
      foreignField: '_id',
      single: true
    }
  }
});

// 2. 连接数据库
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'blog',
  config: { uri: 'mongodb://localhost:27017' }
});

async function examples() {
  await msq.connect();
  const User = msq.model('users');

  // ========== 示例 1：基本嵌套 populate ==========
  console.log('\n示例 1：User -> Posts -> Comments');
  const user1 = await User.findOne({ username: 'john' })
    .populate({
      path: 'posts',
      populate: 'comments'  // 嵌套填充评论
    });

  console.log('用户:', user1.username);
  console.log('文章数:', user1.posts.length);
  console.log('第一篇文章的评论数:', user1.posts[0]?.comments?.length || 0);

  // ========== 示例 2：3 层嵌套 ==========
  console.log('\n示例 2：User -> Posts -> Comments -> Comment Author');
  const user2 = await User.findOne({ username: 'john' })
    .populate({
      path: 'posts',
      populate: {
        path: 'comments',
        populate: 'author'  // 评论的作者（第 3 层）
      }
    });

  const firstComment = user2.posts[0]?.comments[0];
  if (firstComment) {
    console.log('评论内容:', firstComment.content);
    console.log('评论作者:', firstComment.author?.username);
  }

  // ========== 示例 3：带选项的嵌套 populate ==========
  console.log('\n示例 3：嵌套 populate + 选项');
  const user3 = await User.findOne({ username: 'john' })
    .populate({
      path: 'posts',
      select: 'title',  // 只选择标题
      populate: {
        path: 'comments',
        select: 'content',  // 只选择评论内容
        sort: { createdAt: -1 },  // 按时间倒序
        limit: 5  // 最多 5 条评论
      }
    });

  console.log('文章（仅标题）:', user3.posts.map(p => p.title));
  console.log('最新 5 条评论:', user3.posts[0]?.comments.length);

  // ========== 示例 4：混合链式和嵌套 ==========
  console.log('\n示例 4：混合使用');
  const user4 = await User.findOne({ username: 'john' })
    .populate('profile')  // 链式：填充用户资料
    .populate({
      path: 'posts',
      populate: 'comments'  // 嵌套：填充文章评论
    });

  console.log('用户资料:', user4.profile);
  console.log('文章和评论:', user4.posts[0]?.comments);

  await msq.close();
}

// 运行示例
if (require.main === module) {
  examples().catch(console.error);
}

module.exports = { examples };

