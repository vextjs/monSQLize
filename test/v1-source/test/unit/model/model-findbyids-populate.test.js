/**
 * findByIds 和 findOneById + populate 测试
 * 测试新增的便利查询方法的 populate 支持
 */
const { describe, it, before, beforeEach } = require('mocha');
const { expect } = require('chai');
const { PopulateBuilder, PopulateProxy } = require('../../../lib/model/features/populate');
const RelationManager = require('../../../lib/model/features/relations');

describe('findByIds 和 findOneById + populate 测试', function() {
  let mockModel;
  let mockCollection;

  beforeEach(function() {
    // 创建 mock model
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

    mockCollection = { name: 'users' };
  });

  describe('1. findByIds + populate', function() {
    it('应该支持 findByIds 返回 PopulateProxy', function() {
      // 模拟 findByIds 返回的数据
      const docs = [
        { _id: 'u1', username: 'user1', profileId: 'p1' },
        { _id: 'u2', username: 'user2', profileId: 'p2' }
      ];

      // 创建 PopulateProxy（模拟 Model 的包装）
      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(docs), builder, false);

      // 验证返回 PopulateProxy
      expect(proxy).to.be.instanceOf(PopulateProxy);
      expect(typeof proxy.populate).to.equal('function');
      expect(typeof proxy.then).to.equal('function');
    });

    it('应该支持链式调用 populate', function() {
      const docs = [
        { _id: 'u1', username: 'user1', profileId: 'p1' }
      ];

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(docs), builder, false);

      // 链式调用
      const result = proxy.populate('profile');

      expect(result).to.be.instanceOf(PopulateProxy);
      expect(result).to.equal(proxy); // 返回自身
    });

    it('应该正确处理空数组结果', async function() {
      const docs = [];

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(docs), builder, false);

      const result = await proxy.populate('profile');

      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(0);
    });

    it('应该正确填充多个文档', async function() {
      // Mock 数据
      const docs = [
        { _id: 'u1', username: 'user1', profileId: 'p1' },
        { _id: 'u2', username: 'user2', profileId: 'p2' }
      ];

      // Mock collection.find 返回 profiles
      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1' },
            { _id: 'p2', bio: 'Bio 2' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(docs), builder, false);

      const result = await proxy.populate('profile');

      expect(result).to.have.lengthOf(2);
      expect(result[0].profile).to.deep.equal({ _id: 'p1', bio: 'Bio 1' });
      expect(result[1].profile).to.deep.equal({ _id: 'p2', bio: 'Bio 2' });
    });

    it('应该支持 populate 选项', async function() {
      const docs = [
        { _id: 'u1', username: 'user1', profileId: 'p1' }
      ];

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1', avatar: 'Avatar 1', location: 'Location 1' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(docs), builder, false);

      const result = await proxy.populate('profile', { select: 'bio avatar' });

      expect(result[0].profile).to.have.property('_id');
      expect(result[0].profile).to.have.property('bio');
      expect(result[0].profile).to.have.property('avatar');
      expect(result[0].profile).to.not.have.property('location');
    });
  });

  describe('2. findOneById + populate', function() {
    it('应该支持 findOneById 返回 PopulateProxy', function() {
      // 模拟 findOneById 返回的单个文档
      const doc = { _id: 'u1', username: 'user1', profileId: 'p1' };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(doc), builder, true); // singleDoc=true

      expect(proxy).to.be.instanceOf(PopulateProxy);
      expect(typeof proxy.populate).to.equal('function');
    });

    it('应该返回单个文档而不是数组', async function() {
      const doc = { _id: 'u1', username: 'user1', profileId: 'p1' };

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(doc), builder, true);

      const result = await proxy.populate('profile');

      // 应该返回单个对象，不是数组
      expect(result).to.be.an('object');
      expect(result).to.not.be.an('array');
      expect(result._id).to.equal('u1');
      expect(result.profile).to.deep.equal({ _id: 'p1', bio: 'Bio 1' });
    });

    it('应该在文档为 null 时返回 null', async function() {
      const doc = null; // findOneById 未找到

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new PopulateProxy(Promise.resolve(doc), builder, true);

      const result = await proxy.populate('profile');

      expect(result).to.be.null;
    });
  });
});

