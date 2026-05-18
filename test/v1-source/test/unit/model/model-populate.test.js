/**
 * PopulateBuilder 和 PopulateProxy 单元测试
 */
const { describe, it, before, beforeEach } = require('mocha');
const { expect } = require('chai');
const { PopulateBuilder, PopulateProxy } = require('../../../lib/model/features/populate');
const RelationManager = require('../../../lib/model/features/relations');

describe('PopulateBuilder 单元测试', function() {
  let builder;
  let mockModel;
  let mockCollection;

  before(function() {
    // 模拟 Model
    mockModel = {
      name: 'User',
      _relations: new RelationManager({ name: 'User' }),
      msq: {
        collection: (name) => ({
          find: () => ({
            toArray: async () => [] // 返回空数组
          })
        })
      }
    };

    // 定义测试关系
    mockModel._relations.define('profile', {
      from: 'profiles',
      localField: 'profileId',
      foreignField: '_id',
      single: true
    });

    // 模拟 Collection
    mockCollection = {
      name: 'users'
    };
  });

  beforeEach(function() {
    builder = new PopulateBuilder(mockModel, mockCollection);
  });

  describe('1. 基础功能', function() {
    it('应该成功创建 PopulateBuilder 实例', function() {
      expect(builder).to.be.instanceOf(PopulateBuilder);
      expect(builder.model).to.equal(mockModel);
      expect(builder.collection).to.equal(mockCollection);
      expect(builder.populatePaths).to.be.an('array');
      expect(builder.populatePaths).to.have.lengthOf(0);
    });
  });

  describe('2. populate - 字符串形式', function() {
    it('应该支持字符串形式 populate', function() {
      builder.populate('profile');

      expect(builder.populatePaths).to.have.lengthOf(1);
      expect(builder.populatePaths[0]).to.deep.equal({ path: 'profile' });
    });

    it('应该支持字符串 + 选项', function() {
      builder.populate('profile', { select: 'bio avatar' });

      expect(builder.populatePaths).to.have.lengthOf(1);
      expect(builder.populatePaths[0]).to.deep.equal({
        path: 'profile',
        select: 'bio avatar'
      });
    });
  });

  describe('3. populate - 数组形式', function() {
    it('应该支持数组形式 populate', function() {
      builder.populate(['profile', 'posts']);

      expect(builder.populatePaths).to.have.lengthOf(2);
      expect(builder.populatePaths[0].path).to.equal('profile');
      expect(builder.populatePaths[1].path).to.equal('posts');
    });
  });

  describe('4. populate - 对象形式', function() {
    it('应该支持对象形式 populate', function() {
      builder.populate({
        path: 'posts',
        select: 'title content',
        sort: { createdAt: -1 },
        limit: 10
      });

      expect(builder.populatePaths).to.have.lengthOf(1);
      expect(builder.populatePaths[0]).to.deep.equal({
        path: 'posts',
        select: 'title content',
        sort: { createdAt: -1 },
        limit: 10
      });
    });
  });

  describe('5. populate - 链式调用', function() {
    it('应该支持链式调用', function() {
      const result = builder.populate('profile').populate('posts');

      expect(result).to.equal(builder); // 返回自身
      expect(builder.populatePaths).to.have.lengthOf(2);
    });
  });

  describe('6. populate - 错误处理', function() {
    it('应该在参数类型错误时抛出异常', function() {
      expect(() => {
        builder.populate(123); // 数字
      }).to.throw('populate 参数必须是字符串、数组或对象');
    });
  });

  describe('7. execute - 空数据处理', function() {
    it('应该在文档为空时直接返回', async function() {
      const result = await builder.execute([]);
      expect(result).to.deep.equal([]);
    });

    it('应该在没有 populate 路径时直接返回', async function() {
      const docs = [{ _id: '1', name: 'test' }];
      const result = await builder.execute(docs);
      expect(result).to.deep.equal(docs);
    });
  });

  describe('8. _populatePath - 未定义关系', function() {
    it('应该在关系未定义时抛出错误', async function() {
      builder.populate('notExist');

      const docs = [{ _id: '1' }];

      try {
        await builder.execute(docs);
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.equal('未定义的关系: notExist');
      }
    });
  });

  describe('9. execute - 已定义关系', function() {
    it.skip('应该在关系已定义时正常执行', async function() {
      // 已由 model-populate-logic.test.js 更全面地测试
      builder.populate('profile');

      const docs = [{ _id: '1', profileId: 'p1' }];
      const result = await builder.execute(docs);

      // Day 2 实现填充逻辑后，这里会有实际数据
      // 目前先验证结构正确
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
    });
  });
});

describe('PopulateProxy 单元测试', function() {
  let proxy;
  let builder;
  let mockModel;
  let mockCollection;

  before(function() {
    mockModel = {
      name: 'User',
      _relations: new RelationManager({ name: 'User' }),
      msq: {
        collection: (name) => ({
          find: () => ({
            toArray: async () => [] // 返回空数组
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

  beforeEach(function() {
    builder = new PopulateBuilder(mockModel, mockCollection);
  });

  describe('1. 基础功能', function() {
    it('应该成功创建 PopulateProxy 实例', function() {
      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder);

      expect(proxy).to.be.instanceOf(PopulateProxy);
      expect(proxy._docsOrPromise).to.equal(docs);
      expect(proxy._builder).to.equal(builder);
      expect(proxy._singleDoc).to.equal(false);
    });
  });

  describe('2. populate - 链式调用', function() {
    it('应该支持链式调用 populate', function() {
      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder);

      const result = proxy.populate('profile');

      expect(result).to.equal(proxy); // 返回自身
      expect(builder.populatePaths).to.have.lengthOf(1);
    });

    it('应该支持多次链式调用', function() {
      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder);

      proxy.populate('profile').populate('posts');

      expect(builder.populatePaths).to.have.lengthOf(2);
    });
  });

  describe('3. then - Promise 接口', function() {
    it('应该实现 Promise then 接口', async function() {
      const docs = [{ _id: '1', profileId: 'p1' }];
      proxy = new PopulateProxy(docs, builder);

      proxy.populate('profile');

      const result = await proxy;

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
    });
  });

  describe('4. singleDoc - 单文档返回', function() {
    it('应该在 singleDoc=true 时返回单文档', async function() {
      const docs = [{ _id: '1', profileId: 'p1' }];
      proxy = new PopulateProxy(docs, builder, true); // singleDoc=true

      proxy.populate('profile');

      const result = await proxy;

      // 应该返回单文档，不是数组
      expect(result).to.be.an('object');
      expect(result._id).to.equal('1');
    });

    it('应该在 singleDoc=false 时返回数组', async function() {
      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder, false); // singleDoc=false

      proxy.populate('profile');

      const result = await proxy;

      // 应该返回数组
      expect(result).to.be.an('array');
    });
  });

  describe('5. catch - Promise 错误处理', function() {
    it('应该正确捕获错误', async function() {
      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder);

      proxy.populate('notExist'); // 未定义的关系

      try {
        await proxy;
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.equal('未定义的关系: notExist');
      }
    });
  });

  describe('6. finally - Promise finally 接口', function() {
    it('应该在成功时执行 finally', async function() {
      let finallyCalled = false;

      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder);

      proxy.populate('profile');

      await proxy.finally(() => {
        finallyCalled = true;
      });

      expect(finallyCalled).to.be.true;
    });

    it('应该在失败时也执行 finally', async function() {
      let finallyCalled = false;

      const docs = [{ _id: '1' }];
      proxy = new PopulateProxy(docs, builder);

      proxy.populate('notExist');

      try {
        await proxy.finally(() => {
          finallyCalled = true;
        });
      } catch (error) {
        // 忽略错误
      }

      expect(finallyCalled).to.be.true;
    });
  });
});

