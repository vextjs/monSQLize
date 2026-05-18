/**
 * findAndCount 和 findPage + populate 测试
 * 测试特殊返回结构的查询方法的 populate 支持
 */
const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const { PopulateBuilder, SpecialPopulateProxy } = require('../../../lib/model/features/populate');
const RelationManager = require('../../../lib/model/features/relations');

describe('findAndCount 和 findPage + populate 测试', function() {
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

  describe('1. findAndCount + populate', function() {
    it('应该支持 findAndCount 返回 SpecialPopulateProxy', function() {
      // 模拟 findAndCount 返回的结构
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' },
          { _id: 'u2', username: 'user2', profileId: 'p2' }
        ],
        total: 100
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findAndCount');

      expect(proxy).to.be.instanceOf(SpecialPopulateProxy);
      expect(typeof proxy.populate).to.equal('function');
      expect(typeof proxy.then).to.equal('function');
    });

    it('应该保持原结构，只填充 data 部分', async function() {
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' }
        ],
        total: 100
      };

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findAndCount');

      const finalResult = await proxy.populate('profile');

      // 验证结构
      expect(finalResult).to.have.property('data');
      expect(finalResult).to.have.property('total');
      expect(finalResult.total).to.equal(100); // 保持不变

      // 验证 data 被填充
      expect(finalResult.data).to.be.an('array');
      expect(finalResult.data).to.have.lengthOf(1);
      expect(finalResult.data[0].profile).to.deep.equal({ _id: 'p1', bio: 'Bio 1' });
    });

    it('应该支持链式 populate', function() {
      const result = {
        data: [{ _id: 'u1', username: 'user1' }],
        total: 100
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findAndCount');

      const chained = proxy.populate('profile');

      expect(chained).to.be.instanceOf(SpecialPopulateProxy);
      expect(chained).to.equal(proxy); // 返回自身
    });

    it('应该正确处理空 data', async function() {
      const result = {
        data: [],
        total: 0
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findAndCount');

      const finalResult = await proxy.populate('profile');

      expect(finalResult.data).to.be.an('array');
      expect(finalResult.data).to.have.lengthOf(0);
      expect(finalResult.total).to.equal(0);
    });

    it('应该支持 populate 选项', async function() {
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' }
        ],
        total: 100
      };

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1', avatar: 'Avatar 1', location: 'Location 1' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findAndCount');

      const finalResult = await proxy.populate('profile', { select: 'bio' });

      expect(finalResult.data[0].profile).to.have.property('_id');
      expect(finalResult.data[0].profile).to.have.property('bio');
      expect(finalResult.data[0].profile).to.not.have.property('avatar');
      expect(finalResult.data[0].profile).to.not.have.property('location');
    });
  });

  describe('2. findPage + populate', function() {
    it('应该支持 findPage 返回 SpecialPopulateProxy', function() {
      // 模拟 findPage 返回的结构
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' }
        ],
        page: 1,
        pageSize: 10,
        total: 100,
        hasNext: true
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findPage');

      expect(proxy).to.be.instanceOf(SpecialPopulateProxy);
    });

    it('应该保持完整的分页结构', async function() {
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' }
        ],
        page: 1,
        pageSize: 10,
        total: 100,
        hasNext: true
      };

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findPage');

      const finalResult = await proxy.populate('profile');

      // 验证所有字段都保持
      expect(finalResult).to.have.property('data');
      expect(finalResult).to.have.property('page');
      expect(finalResult).to.have.property('pageSize');
      expect(finalResult).to.have.property('total');
      expect(finalResult).to.have.property('hasNext');

      // 验证值不变
      expect(finalResult.page).to.equal(1);
      expect(finalResult.pageSize).to.equal(10);
      expect(finalResult.total).to.equal(100);
      expect(finalResult.hasNext).to.equal(true);

      // 验证 data 被填充
      expect(finalResult.data[0].profile).to.deep.equal({ _id: 'p1', bio: 'Bio 1' });
    });

    it('应该支持多个文档的 populate', async function() {
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' },
          { _id: 'u2', username: 'user2', profileId: 'p2' },
          { _id: 'u3', username: 'user3', profileId: 'p3' }
        ],
        page: 1,
        pageSize: 3,
        total: 100,
        hasNext: true
      };

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1' },
            { _id: 'p2', bio: 'Bio 2' },
            { _id: 'p3', bio: 'Bio 3' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findPage');

      const finalResult = await proxy.populate('profile');

      expect(finalResult.data).to.have.lengthOf(3);
      expect(finalResult.data[0].profile.bio).to.equal('Bio 1');
      expect(finalResult.data[1].profile.bio).to.equal('Bio 2');
      expect(finalResult.data[2].profile.bio).to.equal('Bio 3');
    });

    it('应该支持链式 populate 多个关系', async function() {
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' }
        ],
        page: 1,
        pageSize: 10,
        total: 100,
        hasNext: false
      };

      // 定义第二个关系
      mockModel._relations.define('posts', {
        from: 'posts',
        localField: '_id',
        foreignField: 'authorId',
        single: false
      });

      mockModel.msq.collection = (name) => {
        if (name === 'profiles') {
          return {
            find: () => ({
              toArray: async () => [{ _id: 'p1', bio: 'Bio 1' }]
            })
          };
        } else if (name === 'posts') {
          return {
            find: () => ({
              toArray: async () => [{ _id: 'post1', title: 'Post 1', authorId: 'u1' }]
            })
          };
        }
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findPage');

      const finalResult = await proxy.populate('profile').populate('posts');

      expect(finalResult.data[0].profile).to.exist;
      expect(finalResult.data[0].posts).to.exist;
      expect(finalResult.data[0].posts).to.have.lengthOf(1);
    });

    it('应该处理最后一页（hasNext=false）', async function() {
      const result = {
        data: [
          { _id: 'u1', username: 'user1', profileId: 'p1' }
        ],
        page: 10,
        pageSize: 10,
        total: 91,
        hasNext: false
      };

      mockModel.msq.collection = (name) => ({
        find: () => ({
          toArray: async () => [
            { _id: 'p1', bio: 'Bio 1' }
          ]
        })
      });

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findPage');

      const finalResult = await proxy.populate('profile');

      expect(finalResult.hasNext).to.equal(false);
      expect(finalResult.page).to.equal(10);
      expect(finalResult.data[0].profile).to.exist;
    });
  });

  describe('3. 错误处理', function() {
    it('应该正确处理查询失败', async function() {
      const errorResult = Promise.reject(new Error('Query failed'));

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(errorResult, builder, 'findAndCount');

      try {
        await proxy.populate('profile');
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.equal('Query failed');
      }
    });

    it('应该正确处理 populate 失败', async function() {
      const result = {
        data: [{ _id: 'u1', username: 'user1', profileId: 'p1' }],
        total: 1
      };

      // Mock 一个会失败的查询
      mockModel.msq.collection = () => {
        throw new Error('Collection not found');
      };

      const builder = new PopulateBuilder(mockModel, mockCollection);
      const proxy = new SpecialPopulateProxy(Promise.resolve(result), builder, 'findAndCount');

      try {
        await proxy.populate('profile');
        expect.fail('应该抛出错误');
      } catch (error) {
        expect(error.message).to.include('Collection not found');
      }
    });
  });
});

