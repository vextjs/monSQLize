/**
 * populate 错误场景测试
 * 测试各种异常情况和边缘场景
 */
const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { PopulateBuilder, PopulateProxy, SpecialPopulateProxy } = require('../../../lib/model/features/populate');
const RelationManager = require('../../../lib/model/features/relations');

describe('populate 错误场景测试', function() {
  let mockModel;
  let mockCollection;

  beforeEach(function() {
    mockModel = {
      name: 'User',
      _relations: new RelationManager({ name: 'User' }),
      msq: {
        collection: (name) => ({
          find: () => ({
            toArray: async () => []
          })
        })
      }
    };

    mockModel._relations.define('profile', {
      from: 'profiles',
      localField: 'profileId',
      foreignField: '_id',
      single: true
    });

    mockCollection = { name: 'users' };
  });

  describe('1. populate 不存在的关系', function() {
    it('应该抛出清晰的错误信息', async function() {
      const docs = [{ _id: 'u1', username: 'user1' }];
      const builder = new PopulateBuilder(mockModel, mockCollection);

      builder.populate('notExist');

      try {
        await builder.execute(docs);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('未定义的关系');
        expect(error.message).to.include('notExist');
      }
    });

    it('应该在链式调用中检测不存在的关系', async function() {
      const docs = [{ _id: 'u1', username: 'user1', profileId: 'p1' }];
      const builder = new PopulateBuilder(mockModel, mockCollection);

      builder.populate('profile').populate('notExist');

      try {
        await builder.execute(docs);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('未定义的关系');
        expect(error.message).to.include('notExist');
      }
    });
  });

  describe('2. 数据库连接失败', function() {
    it('应该正确传递数据库错误', async function() {
      const docs = [{ _id: 'u1', username: 'user1', profileId: 'p1' }];

      // Mock 数据库连接失败
      mockModel.msq.collection = () => {
        throw new Error('Database connection failed');
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      try {
        await builder.execute(docs);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('Database connection failed');
      }
    });

    it('应该处理查询超时', async function() {
      const docs = [{ _id: 'u1', username: 'user1', profileId: 'p1' }];

      // Mock 查询超时
      mockModel.msq.collection = () => ({
        find: () => ({
          toArray: async () => {
            throw new Error('Query timeout after 30s');
          }
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      try {
        await builder.execute(docs);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('Query timeout');
      }
    });
  });

  describe('3. 无效的 populate 参数', function() {
    it('应该拒绝无效的 path 类型', function() {
      const builder = new PopulateBuilder(mockModel, mockCollection);

      expect(() => {
        builder.populate(123); // 数字
      }).to.throw();

      expect(() => {
        builder.populate(null); // null
      }).to.throw();

      expect(() => {
        builder.populate(undefined); // undefined
      }).to.throw();
    });

    it('应该忽略无效的选项（容错处理）', function() {
      const builder = new PopulateBuilder(mockModel, mockCollection);

      // 无效选项应该被忽略，不应该抛出错误（容错）
      expect(() => {
        builder.populate('profile', { select: 123 });
      }).to.not.throw();

      expect(() => {
        builder.populate('profile', { sort: 'invalid' });
      }).to.not.throw();

      expect(() => {
        builder.populate('profile', { limit: 'invalid' });
      }).to.not.throw();

      // 验证仍然可以正常 populate（只是选项被忽略）
      expect(builder.populatePaths).to.have.lengthOf(3);
    });
  });

  describe('4. 外键类型不匹配', function() {
    it('应该处理外键为不同类型', async function() {
      const docs = [
        { _id: 'u1', username: 'user1', profileId: 123 }, // 数字
        { _id: 'u2', username: 'user2', profileId: 'p2' }  // 字符串
      ];

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: '123', bio: 'Bio 1' }, // 字符串形式的 ID
            { _id: 'p2', bio: 'Bio 2' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      const result = await builder.execute(docs);

      // 应该能够匹配（转为字符串后）
      expect(result[0].profile).to.exist;
      expect(result[1].profile).to.exist;
    });

    it('应该处理 ObjectId 和字符串混合', async function() {
      const { ObjectId } = require('mongodb');

      const objectId1 = new ObjectId();
      const docs = [
        { _id: 'u1', username: 'user1', profileId: objectId1 },
        { _id: 'u2', username: 'user2', profileId: 'string_id' }
      ];

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: objectId1, bio: 'Bio 1' },
            { _id: 'string_id', bio: 'Bio 2' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      const result = await builder.execute(docs);

      expect(result[0].profile).to.exist;
      expect(result[1].profile).to.exist;
    });
  });

  describe('5. SpecialPopulateProxy 错误场景', function() {
    it('应该处理 findAndCount 返回结构错误', async function() {
      // 缺少 data 字段
      const invalidResult = { total: 100 };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(
        Promise.resolve(invalidResult),
        builder,
        'findAndCount'
      );

      const result = await proxy.populate('profile');

      // 应该处理缺失的 data（默认为空数组）
      expect(result.data).to.be.an('array');
      expect(result.data).to.have.lengthOf(0);
    });

    it('应该处理 findPage 返回结构错误', async function() {
      // 缺少 data 字段
      const invalidResult = { page: 1, pageSize: 10, total: 100 };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(
        Promise.resolve(invalidResult),
        builder,
        'findPage'
      );

      const result = await proxy.populate('profile');

      expect(result.data).to.be.an('array');
      expect(result.data).to.have.lengthOf(0);
    });
  });

  describe('6. 大数据量场景', function() {
    it('应该能处理 1000+ 文档', async function() {
      // 创建 1000 个文档
      const docs = Array.from({ length: 1000 }, (_, i) => ({
        _id: `u${i}`,
        username: `user${i}`,
        profileId: `p${i}`
      }));

      // Mock 返回 1000 个 profiles
      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => Array.from({ length: 1000 }, (_, i) => ({
            _id: `p${i}`,
            bio: `Bio ${i}`
          }))
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      const startTime = Date.now();
      const result = await builder.execute(docs);
      const duration = Date.now() - startTime;

      expect(result).to.have.lengthOf(1000);
      expect(duration).to.be.lessThan(1000); // 应该在 1 秒内完成

      // 验证全部填充
      const populated = result.filter(doc => doc.profile !== null);
      expect(populated).to.have.lengthOf(1000);
    });

    it('应该能处理 1000+ 外键值去重', async function() {
      // 创建 1000 个文档，但只有 100 个不同的 profileId（重复）
      const docs = Array.from({ length: 1000 }, (_, i) => ({
        _id: `u${i}`,
        username: `user${i}`,
        profileId: `p${i % 100}` // 只有 100 个不同的 profile
      }));

      let queryCount = 0;
      mockModel.msq.collection = (name) => ({
        find: (query) => {
          queryCount++;
          // 验证去重：应该只查询 100 个 ID
          const ids = query._id.$in;
          expect(ids).to.have.lengthOf(100);

          return {
            toArray: async () => Array.from({ length: 100 }, (_, i) => ({
              _id: `p${i}`,
              bio: `Bio ${i}`
            }))
          };
        }
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      const result = await builder.execute(docs);

      expect(result).to.have.lengthOf(1000);
      expect(queryCount).to.equal(1); // 只查询一次
    });
  });

  describe('7. 循环引用检测', function() {
    it('应该检测并警告循环引用（未来功能）', function() {
      // 这是一个占位测试，用于未来实现循环引用检测
      // 例如：User → posts → author (回到 User)

      // 目前只是验证不会死循环
      mockModel._relations.define('posts', {
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId',
        single: false
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);

      // 这不会导致循环，因为只 populate 一层
      builder.populate('posts');

      expect(builder.populatePaths).to.have.lengthOf(1);
    });
  });

  describe('8. 内存溢出保护', function() {
    it('应该在外键数量过多时警告（未来功能）', function() {
      // 占位测试：当外键数量超过某个阈值（如 10000）时应该警告
      const docs = Array.from({ length: 50000 }, (_, i) => ({
        _id: `u${i}`,
        profileId: `p${i}`
      }));

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      // 目前只验证不会崩溃
      expect(builder.populatePaths).to.have.lengthOf(1);
    });
  });

  describe('9. Promise 拒绝处理', function() {
    it('应该正确处理 Promise.reject', async function() {
      const errorPromise = Promise.reject(new Error('Promise rejected'));

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(errorPromise, builder, false);

      try {
        await proxy.populate('profile');
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.equal('Promise rejected');
      }
    });

    it('应该通过 catch 捕获错误', async function() {
      const errorPromise = Promise.reject(new Error('Async error'));

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(errorPromise, builder, false);

      let caughtError = null;
      await proxy.populate('profile').catch(err => {
        caughtError = err;
      });

      expect(caughtError).to.exist;
      expect(caughtError.message).to.equal('Async error');
    });
  });

  describe('10. 空值和特殊值处理', function() {
    it('应该处理各种空值', async function() {
      const docs = [
        { _id: 'u1', profileId: null },
        { _id: 'u2', profileId: undefined },
        { _id: 'u3', profileId: '' },
        { _id: 'u4', profileId: 0 },
        { _id: 'u5', profileId: false }
      ];

      const builder = new PopulateBuilder(mockModel, mockCollection);
      builder.populate('profile');

      const result = await builder.execute(docs);

      // null 和 undefined 应该返回 null
      expect(result[0].profile).to.be.null;
      expect(result[1].profile).to.be.null;

      // 其他值应该尝试查询（即使查不到）
      expect(result[2]).to.have.property('profile');
      expect(result[3]).to.have.property('profile');
      expect(result[4]).to.have.property('profile');
    });
  });
});

