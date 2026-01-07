/**
 * populate 核心填充逻辑集成测试
 * 测试 _populatePath 的完整功能
 */
const { describe, it, before, after, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const MongoClient = require('mongodb').MongoClient;
const { ObjectId } = require('mongodb');

describe('populate 核心填充逻辑集成测试', function() {
  this.timeout(10000); // 增加超时时间

  let client;
  let db;
  let msq; // 使用真正的 MonSQLize 实例
  let Model;

  before(async function() {
    // 连接 MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('test_populate');

    // 加载 MonSQLize 和 Model
    try {
      const MonSQLize = require('../../../lib/index');
      Model = require('../../../lib/model');

      // 创建真正的 MonSQLize 实例
      msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_populate',
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
    await db.collection('profiles').deleteMany({});
    await db.collection('posts').deleteMany({});

    // 清空 Model 注册表
    if (Model) {
      Model._clear();
    }
  });

  describe('1. one-to-one 关系填充', function() {
    it('应该正确填充 one-to-one 关系', async function() {
      // 插入测试数据
      const profileId = new ObjectId();
      await db.collection('profiles').insertOne({
        _id: profileId,
        bio: 'Software Engineer',
        avatar: 'https://example.com/avatar.jpg'
      });

      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john',
        profileId: profileId
      });

      // 定义 Model
      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!',
          profileId: 'objectId'
        }),
        relations: {
          profile: {
            from: 'profiles',
            localField: 'profileId',
            foreignField: '_id',
            single: true
          }
        }
      });

      // 使用 msq.model() 创建模型实例
      const User = msq.model('users');

      // 查询并 populate（链式调用）
      const result = await User.find({ _id: userId }).populate('profile');

      // 验证结果
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
      expect(result[0].username).to.equal('john');
      expect(result[0].profile).to.be.an('object');
      expect(result[0].profile.bio).to.equal('Software Engineer');
      expect(result[0].profile.avatar).to.equal('https://example.com/avatar.jpg');
    });

    it('应该在外键为 null 时填充 null', async function() {
      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john',
        profileId: null
      });

      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!',
          profileId: 'objectId'
        }),
        relations: {
          profile: {
            from: 'profiles',
            localField: 'profileId',
            foreignField: '_id',
            single: true
          }
        }
      });

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('profile');

      expect(result[0].profile).to.be.null;
    });
  });

  describe('2. one-to-many 关系填充', function() {
    it('应该正确填充 one-to-many 关系（反向）', async function() {
      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      await db.collection('posts').insertMany([
        {
          _id: new ObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          authorId: userId
        },
        {
          _id: new ObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          authorId: userId
        }
      ]);

      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!'
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

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('posts');

      expect(result[0].posts).to.be.an('array');
      expect(result[0].posts).to.have.lengthOf(2);
      expect(result[0].posts[0].title).to.match(/^Post [12]$/);
      expect(result[0].posts[1].title).to.match(/^Post [12]$/);
    });

    it('应该在没有关联数据时返回空数组', async function() {
      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!'
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

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('posts');

      expect(result[0].posts).to.be.an('array');
      expect(result[0].posts).to.have.lengthOf(0);
    });
  });

  describe('3. 多个关系链式 populate', function() {
    it('应该支持链式 populate 多个关系', async function() {
      const profileId = new ObjectId();
      await db.collection('profiles').insertOne({
        _id: profileId,
        bio: 'Software Engineer'
      });

      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john',
        profileId: profileId
      });

      await db.collection('posts').insertOne({
        _id: new ObjectId(),
        title: 'Post 1',
        authorId: userId
      });

      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!',
          profileId: 'objectId'
        }),
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

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('profile').populate('posts');

      expect(result[0].profile).to.be.an('object');
      expect(result[0].profile.bio).to.equal('Software Engineer');
      expect(result[0].posts).to.be.an('array');
      expect(result[0].posts).to.have.lengthOf(1);
      expect(result[0].posts[0].title).to.equal('Post 1');
    });
  });

  describe('4. populate 选项', function() {
    it('应该支持 select 选项', async function() {
      const profileId = new ObjectId();
      await db.collection('profiles').insertOne({
        _id: profileId,
        bio: 'Software Engineer',
        avatar: 'https://example.com/avatar.jpg',
        location: 'Beijing'
      });

      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john',
        profileId: profileId
      });

      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!',
          profileId: 'objectId'
        }),
        relations: {
          profile: {
            from: 'profiles',
            localField: 'profileId',
            foreignField: '_id',
            single: true
          }
        }
      });

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('profile', { select: 'bio avatar' });

      expect(result[0].profile).to.be.an('object');
      expect(result[0].profile._id).to.exist; // _id 总是包含
      expect(result[0].profile.bio).to.equal('Software Engineer');
      expect(result[0].profile.avatar).to.equal('https://example.com/avatar.jpg');
      expect(result[0].profile.location).to.be.undefined; // 未选择的字段
    });

    it('应该支持 sort 选项', async function() {
      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      await db.collection('posts').insertMany([
        { _id: new ObjectId(), title: 'Post C', order: 3, authorId: userId },
        { _id: new ObjectId(), title: 'Post A', order: 1, authorId: userId },
        { _id: new ObjectId(), title: 'Post B', order: 2, authorId: userId }
      ]);

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

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('posts', { sort: { order: 1 } });

      expect(result[0].posts).to.have.lengthOf(3);
      expect(result[0].posts[0].title).to.equal('Post A');
      expect(result[0].posts[1].title).to.equal('Post B');
      expect(result[0].posts[2].title).to.equal('Post C');
    });

    it('应该支持 limit 选项', async function() {
      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john'
      });

      await db.collection('posts').insertMany([
        { _id: new ObjectId(), title: 'Post 1', authorId: userId },
        { _id: new ObjectId(), title: 'Post 2', authorId: userId },
        { _id: new ObjectId(), title: 'Post 3', authorId: userId }
      ]);

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

      const User = msq.model('users');

      const result = await User.find({ _id: userId }).populate('posts', { limit: 2 });

      expect(result[0].posts).to.have.lengthOf(2);
    });
  });

  describe('5. findOne 支持 populate', function() {
    it('应该在 findOne 中正确 populate', async function() {
      const profileId = new ObjectId();
      await db.collection('profiles').insertOne({
        _id: profileId,
        bio: 'Software Engineer'
      });

      const userId = new ObjectId();
      await db.collection('users').insertOne({
        _id: userId,
        username: 'john',
        profileId: profileId
      });

      Model.define('users', {
        schema: (dsl) => dsl({
          username: 'string!',
          profileId: 'objectId'
        }),
        relations: {
          profile: {
            from: 'profiles',
            localField: 'profileId',
            foreignField: '_id',
            single: true
          }
        }
      });

      const User = msq.model('users');

      // findOne 返回 PopulateProxy，直接链式调用 populate
      const result = await User.findOne({ _id: userId }).populate('profile');

      // findOne 返回单文档，不是数组
      expect(result).to.be.an('object');
      expect(result.username).to.equal('john');
      expect(result.profile).to.be.an('object');
      expect(result.profile.bio).to.equal('Software Engineer');
    });
  });
});


