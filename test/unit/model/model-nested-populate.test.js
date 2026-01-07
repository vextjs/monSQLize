/**
 * 深度 populate 测试
 * 测试嵌套 populate 功能
 */
const { describe, it, before, after, beforeEach } = require('mocha');
const { expect } = require('chai');
const MongoClient = require('mongodb').MongoClient;
const { ObjectId } = require('mongodb');

describe('深度 populate（嵌套）测试', function() {
  this.timeout(10000);

  let client;
  let db;
  let msq;
  let Model;

  before(async function() {
    // 连接 MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test_nested_populate');

    // 加载 MonSQLize 和 Model
    try {
      const MonSQLize = require('../../../lib/index');
      Model = require('../../../lib/model');

      msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_nested_populate',
        config: { uri }
      });
      await msq.connect();
    } catch (err) {
      console.log('⚠️  跳过集成测试：初始化失败', err);
      this.skip();
    }
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
    if (client) {
      await client.close();
    }
  });

  beforeEach(async function() {
    // 清空测试集合
    await db.collection('users').deleteMany({});
    await db.collection('posts').deleteMany({});
    await db.collection('comments').deleteMany({});

    // 清空 Model 注册表
    if (Model) {
      Model._clear();
    }
  });

  describe('1. 基本嵌套 populate', function() {
    it('应该支持嵌套 populate（User -> Post -> Comment）', async function() {
      // 创建测试数据
      const userId = new ObjectId();
      const postId = new ObjectId();
      const commentId1 = new ObjectId();
      const commentId2 = new ObjectId();

      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      await db.collection('posts').insertOne({
        _id: postId,
        title: 'My Post',
        authorId: userId
      });

      await db.collection('comments').insertMany([
        { _id: commentId1, content: 'Great post!', postId: postId, authorId: userId },
        { _id: commentId2, content: 'Thanks!', postId: postId, authorId: userId }
      ]);

      // 定义 Model
      Model.define('users', {
        schema: (dsl) => dsl({ username: 'string!' }),
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
        schema: (dsl) => dsl({ title: 'string!' }),
        relations: {
          comments: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            single: false
          }
        }
      });

      Model.define('comments', {
        schema: (dsl) => dsl({ content: 'string!' })
      });

      // 执行嵌套 populate
      const User = msq.model('users');
      const result = await User.findOne({ _id: userId })
        .populate({
          path: 'posts',
          populate: 'comments'  // 嵌套 populate
        });

      // 验证结果
      expect(result).to.be.an('object');
      expect(result.username).to.equal('john');
      expect(result.posts).to.be.an('array');
      expect(result.posts).to.have.lengthOf(1);

      const post = result.posts[0];
      expect(post.title).to.equal('My Post');
      expect(post.comments).to.be.an('array');
      expect(post.comments).to.have.lengthOf(2);
      expect(post.comments[0].content).to.match(/^(Great post!|Thanks!)$/);
      expect(post.comments[1].content).to.match(/^(Great post!|Thanks!)$/);
    });

    it('应该支持嵌套 populate 对象配置', async function() {
      // 创建测试数据
      const userId = new ObjectId();
      const postId = new ObjectId();
      const commentId = new ObjectId();

      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      await db.collection('posts').insertOne({
        _id: postId,
        title: 'My Post',
        authorId: userId
      });

      await db.collection('comments').insertOne({
        _id: commentId,
        content: 'Great post!',
        extra: 'Should not be selected',
        postId: postId,
        authorId: userId
      });

      // 定义 Model（同上）
      Model.define('users', {
        schema: (dsl) => dsl({ username: 'string!' }),
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
        schema: (dsl) => dsl({ title: 'string!' }),
        relations: {
          comments: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            single: false
          }
        }
      });

      Model.define('comments', {
        schema: (dsl) => dsl({ content: 'string!' })
      });

      // 执行嵌套 populate（带选项）
      const User = msq.model('users');
      const result = await User.findOne({ _id: userId })
        .populate({
          path: 'posts',
          populate: {
            path: 'comments',
            select: 'content'  // 只选择 content 字段
          }
        });

      // 验证结果

      expect(result.posts).to.be.an('array');
      expect(result.posts).to.have.lengthOf(1);
      expect(result.posts[0].comments).to.be.an('array');
      expect(result.posts[0].comments).to.have.lengthOf(1);
      expect(result.posts[0].comments[0]).to.be.an('object');
      expect(result.posts[0].comments[0].content).to.equal('Great post!');
      expect(result.posts[0].comments[0].extra).to.be.undefined;
    });
  });

  describe('2. 多层嵌套 populate', function() {
    it('应该支持3层嵌套（User -> Post -> Comment -> Author）', async function() {
      // 创建测试数据
      const userId = new ObjectId();
      const postId = new ObjectId();
      const commentId = new ObjectId();
      const commentAuthorId = new ObjectId();

      await db.collection('users').insertMany([
        { _id: userId, username: 'john' },
        { _id: commentAuthorId, username: 'jane' }
      ]);

      await db.collection('posts').insertOne({
        _id: postId,
        title: 'My Post',
        authorId: userId
      });

      await db.collection('comments').insertOne({
        _id: commentId,
        content: 'Great post!',
        postId: postId,
        authorId: commentAuthorId
      });

      // 定义 Model
      Model.define('users', {
        schema: (dsl) => dsl({ username: 'string!' }),
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
        schema: (dsl) => dsl({ title: 'string!' }),
        relations: {
          comments: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            single: false
          }
        }
      });

      Model.define('comments', {
        schema: (dsl) => dsl({ content: 'string!' }),
        relations: {
          author: {
            from: 'users',
            localField: 'authorId',
            foreignField: '_id',
            single: true
          }
        }
      });

      // 执行3层嵌套 populate
      const User = msq.model('users');
      const result = await User.findOne({ _id: userId })
        .populate({
          path: 'posts',
          populate: {
            path: 'comments',
            populate: 'author'  // 第3层嵌套
          }
        });

      // 验证结果
      expect(result.posts[0].comments[0].author).to.be.an('object');
      expect(result.posts[0].comments[0].author.username).to.equal('jane');
    });
  });

  describe('3. 嵌套 populate 数组形式', function() {
    it('应该支持嵌套多个 populate', async function() {
      // 创建测试数据
      const userId = new ObjectId();
      const postId = new ObjectId();
      const commentId = new ObjectId();
      const likeId = new ObjectId();

      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      await db.collection('posts').insertOne({
        _id: postId,
        title: 'My Post',
        authorId: userId
      });

      await db.collection('comments').insertOne({
        _id: commentId,
        content: 'Great!',
        postId: postId
      });

      await db.collection('likes').insertOne({
        _id: likeId,
        postId: postId,
        userId: userId
      });

      // 定义 Model
      Model.define('users', {
        schema: (dsl) => dsl({ username: 'string!' }),
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
        schema: (dsl) => dsl({ title: 'string!' }),
        relations: {
          comments: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            single: false
          },
          likes: {
            from: 'likes',
            localField: '_id',
            foreignField: 'postId',
            single: false
          }
        }
      });

      Model.define('comments', {
        schema: (dsl) => dsl({ content: 'string!' })
      });

      Model.define('likes', {
        schema: (dsl) => dsl({ userId: 'objectId' })
      });

      // 执行嵌套多个 populate
      const User = msq.model('users');
      const result = await User.findOne({ _id: userId })
        .populate({
          path: 'posts',
          populate: ['comments', 'likes']  // 嵌套多个
        });

      // 验证结果
      expect(result.posts[0].comments).to.be.an('array');
      expect(result.posts[0].comments).to.have.lengthOf(1);
      expect(result.posts[0].likes).to.be.an('array');
      expect(result.posts[0].likes).to.have.lengthOf(1);
    });
  });

  describe('4. 混合使用链式和嵌套 populate', function() {
    it('应该同时支持链式和嵌套 populate', async function() {
      // 创建测试数据
      const userId = new ObjectId();
      const profileId = new ObjectId();
      const postId = new ObjectId();
      const commentId = new ObjectId();

      await db.collection('users').insertOne({
        _id: userId,
        username: 'john',
        profileId: profileId
      });

      await db.collection('profiles').insertOne({
        _id: profileId,
        bio: 'Software Engineer'
      });

      await db.collection('posts').insertOne({
        _id: postId,
        title: 'My Post',
        authorId: userId
      });

      await db.collection('comments').insertOne({
        _id: commentId,
        content: 'Great!',
        postId: postId
      });

      // 定义 Model
      Model.define('users', {
        schema: (dsl) => dsl({ username: 'string!' }),
        relations: {
          profile: {
            from: 'profiles',
            localField: 'profileId',
            foreignField: '_id',
            single: true
          },
          posts: {
            from: 'posts',
            localField: '_id',
            foreignField: 'authorId',
            single: false
          }
        }
      });

      Model.define('profiles', {
        schema: (dsl) => dsl({ bio: 'string' })
      });

      Model.define('posts', {
        schema: (dsl) => dsl({ title: 'string!' }),
        relations: {
          comments: {
            from: 'comments',
            localField: '_id',
            foreignField: 'postId',
            single: false
          }
        }
      });

      Model.define('comments', {
        schema: (dsl) => dsl({ content: 'string!' })
      });

      // 混合使用链式和嵌套
      const User = msq.model('users');
      const result = await User.findOne({ _id: userId })
        .populate('profile')  // 链式
        .populate({
          path: 'posts',
          populate: 'comments'  // 嵌套
        });

      // 验证结果
      expect(result.profile).to.be.an('object');
      expect(result.profile.bio).to.equal('Software Engineer');
      expect(result.posts[0].comments).to.be.an('array');
      expect(result.posts[0].comments[0].content).to.equal('Great!');
    });
  });
});

