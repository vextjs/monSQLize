/**
 * 精准缓存失效 - 单元测试
 * @description 测试 CacheInvalidationEngine 的所有核心方法
 */

const { expect } = require('chai');
const CacheInvalidationEngine = require('../../../lib/cache-invalidation');
const CacheFactory = require('../../../lib/cache');

describe('CacheInvalidationEngine - 单元测试', () => {
  describe('matchesField() - 字段匹配', () => {
    it('应该匹配简单等值', () => {
      expect(CacheInvalidationEngine.matchesField('active', 'active')).to.be.true;
      expect(CacheInvalidationEngine.matchesField('active', 'inactive')).to.be.false;
    });

    it('应该匹配数字类型', () => {
      expect(CacheInvalidationEngine.matchesField(25, 25)).to.be.true;
      expect(CacheInvalidationEngine.matchesField(25, 30)).to.be.false;
    });

    it('应该匹配 $in 操作符', () => {
      expect(CacheInvalidationEngine.matchesField('active', { $in: ['active', 'pending'] })).to.be.true;
      expect(CacheInvalidationEngine.matchesField('deleted', { $in: ['active', 'pending'] })).to.be.false;
    });

    it('应该匹配 $gt 操作符', () => {
      expect(CacheInvalidationEngine.matchesField(30, { $gt: 20 })).to.be.true;
      expect(CacheInvalidationEngine.matchesField(15, { $gt: 20 })).to.be.false;
    });

    it('应该匹配 $gte 操作符', () => {
      expect(CacheInvalidationEngine.matchesField(20, { $gte: 20 })).to.be.true;
      expect(CacheInvalidationEngine.matchesField(19, { $gte: 20 })).to.be.false;
    });

    it('应该匹配 $lt 操作符', () => {
      expect(CacheInvalidationEngine.matchesField(15, { $lt: 20 })).to.be.true;
      expect(CacheInvalidationEngine.matchesField(25, { $lt: 20 })).to.be.false;
    });

    it('应该匹配 $lte 操作符', () => {
      expect(CacheInvalidationEngine.matchesField(20, { $lte: 20 })).to.be.true;
      expect(CacheInvalidationEngine.matchesField(21, { $lte: 20 })).to.be.false;
    });

    it('应该匹配 $ne 操作符', () => {
      expect(CacheInvalidationEngine.matchesField('active', { $ne: 'deleted' })).to.be.true;
      expect(CacheInvalidationEngine.matchesField('deleted', { $ne: 'deleted' })).to.be.false;
    });

    it('应该匹配 $exists 操作符', () => {
      expect(CacheInvalidationEngine.matchesField('value', { $exists: true })).to.be.true;
      expect(CacheInvalidationEngine.matchesField(undefined, { $exists: true })).to.be.false;
      expect(CacheInvalidationEngine.matchesField(undefined, { $exists: false })).to.be.true;
    });

    it('应该处理 null 值', () => {
      expect(CacheInvalidationEngine.matchesField(null, null)).to.be.true;
      expect(CacheInvalidationEngine.matchesField(null, 'value')).to.be.false;
    });

    it('应该处理 undefined 值', () => {
      expect(CacheInvalidationEngine.matchesField(undefined, undefined)).to.be.true;
    });

    it('应该对不支持的操作符返回 false', () => {
      expect(CacheInvalidationEngine.matchesField('test', { $regex: /test/ })).to.be.false;
    });
  });

  describe('matchesQuery() - 查询匹配', () => {
    it('应该匹配空查询', () => {
      const doc = { status: 'active', name: 'Alice' };
      expect(CacheInvalidationEngine.matchesQuery(doc, {})).to.be.true;
    });

    it('应该匹配单字段查询', () => {
      const doc = { status: 'active', name: 'Alice' };
      expect(CacheInvalidationEngine.matchesQuery(doc, { status: 'active' })).to.be.true;
      expect(CacheInvalidationEngine.matchesQuery(doc, { status: 'inactive' })).to.be.false;
    });

    it('应该匹配多字段查询（AND 逻辑）', () => {
      const doc = { status: 'active', role: 'admin', age: 25 };
      expect(CacheInvalidationEngine.matchesQuery(doc, {
        status: 'active',
        role: 'admin'
      })).to.be.true;

      expect(CacheInvalidationEngine.matchesQuery(doc, {
        status: 'active',
        role: 'user'
      })).to.be.false;
    });

    it('应该匹配操作符查询', () => {
      const doc = { age: 25, status: 'active' };
      expect(CacheInvalidationEngine.matchesQuery(doc, {
        age: { $gt: 20 },
        status: { $in: ['active', 'pending'] }
      })).to.be.true;
    });

    it('应该处理文档缺少查询字段的情况', () => {
      const doc = { status: 'active' };
      expect(CacheInvalidationEngine.matchesQuery(doc, { name: 'Alice' })).to.be.false;
    });

    it('应该处理 null 查询', () => {
      const doc = { status: 'active' };
      expect(CacheInvalidationEngine.matchesQuery(doc, null)).to.be.true;
    });
  });

  describe('hasComplexOperators() - 复杂操作符检测', () => {
    it('应该检测 $or 操作符', () => {
      expect(CacheInvalidationEngine.hasComplexOperators({
        $or: [{ a: 1 }, { b: 2 }]
      })).to.be.true;
    });

    it('应该检测 $nor 操作符', () => {
      expect(CacheInvalidationEngine.hasComplexOperators({
        $nor: [{ a: 1 }, { b: 2 }]
      })).to.be.true;
    });

    it('应该检测 $expr 操作符', () => {
      expect(CacheInvalidationEngine.hasComplexOperators({
        $expr: { $gt: ['$a', '$b'] }
      })).to.be.true;
    });

    it('应该检测 $where 操作符', () => {
      expect(CacheInvalidationEngine.hasComplexOperators({
        $where: 'this.a > this.b'
      })).to.be.true;
    });

    it('应该检测 $text 操作符', () => {
      expect(CacheInvalidationEngine.hasComplexOperators({
        $text: { $search: 'coffee' }
      })).to.be.true;
    });

    it('应该对简单查询返回 false', () => {
      expect(CacheInvalidationEngine.hasComplexOperators({
        status: 'active',
        age: { $gt: 20 }
      })).to.be.false;
    });

    it('应该处理 null 或 undefined', () => {
      expect(CacheInvalidationEngine.hasComplexOperators(null)).to.be.false;
      expect(CacheInvalidationEngine.hasComplexOperators(undefined)).to.be.false;
    });
  });

  describe('extractQueryFromKey() - 查询条件提取', () => {
    it('应该从标准缓存键提取查询条件', () => {
      const key = JSON.stringify({
        ns: { p: 'monSQLize', v: 1, iid: 'test', type: 'mongodb', db: 'test', collection: 'users' },
        op: 'find',
        query: { status: 'active' },
        projection: {},
        sort: {}
      });

      const query = CacheInvalidationEngine.extractQueryFromKey(key);
      expect(query).to.deep.equal({ status: 'active' });
    });

    it('应该处理空查询', () => {
      const key = JSON.stringify({
        ns: { p: 'monSQLize', v: 1, iid: 'test', type: 'mongodb', db: 'test', collection: 'users' },
        op: 'find',
        query: {},
        projection: {}
      });

      const query = CacheInvalidationEngine.extractQueryFromKey(key);
      expect(query).to.deep.equal({});
    });

    it('应该对无效 JSON 返回 null', () => {
      const query = CacheInvalidationEngine.extractQueryFromKey('invalid json');
      expect(query).to.be.null;
    });

    it('应该对缺少 query 字段返回 null', () => {
      const key = JSON.stringify({
        ns: { p: 'monSQLize', v: 1 },
        op: 'find'
      });

      const query = CacheInvalidationEngine.extractQueryFromKey(key);
      expect(query).to.be.null;
    });
  });

  describe('mergeFilterAndUpdate() - 合并 filter 和 update', () => {
    it('应该合并 filter 和 $set', () => {
      const filter = { userId: 'user123' };
      const update = { $set: { name: 'Alice', age: 25 } };

      const doc = CacheInvalidationEngine.mergeFilterAndUpdate(filter, update);
      expect(doc).to.deep.equal({
        userId: 'user123',
        name: 'Alice',
        age: 25
      });
    });

    it('应该处理 $inc 操作符', () => {
      const filter = { userId: 'user123' };
      const update = { $inc: { loginCount: 1 } };

      const doc = CacheInvalidationEngine.mergeFilterAndUpdate(filter, update);
      expect(doc).to.have.property('loginCount');
    });

    it('应该处理只有 filter 的情况', () => {
      const filter = { userId: 'user123', status: 'active' };
      const update = {};

      const doc = CacheInvalidationEngine.mergeFilterAndUpdate(filter, update);
      expect(doc).to.deep.equal({ userId: 'user123', status: 'active' });
    });

    it('应该处理多个更新操作符', () => {
      const filter = { userId: 'user123' };
      const update = {
        $set: { name: 'Alice' },
        $inc: { loginCount: 1 }
      };

      const doc = CacheInvalidationEngine.mergeFilterAndUpdate(filter, update);
      expect(doc).to.include({ userId: 'user123', name: 'Alice' });
      expect(doc).to.have.property('loginCount');
    });
  });

  describe('invalidatePrecise() - 精准失效集成测试', () => {
    let mockCache;

    beforeEach(() => {
      // 创建 Mock 缓存
      mockCache = {
        data: new Map(),
        keys: function(pattern) {
          // 将通配符模式转换为正则表达式
          // pattern 格式: *"ns":{...}*
          const escapedPattern = pattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
            .replace(/\*/g, '.*');  // 将 * 转换为 .*
          const regex = new RegExp(escapedPattern);
          return Array.from(this.data.keys()).filter(key => regex.test(key));
        },
        delMany: async function(keys) {
          let deleted = 0;
          for (const key of keys) {
            if (this.data.delete(key)) {
              deleted++;
            }
          }
          return deleted;
        }
      };

      // 准备测试缓存数据
      const cacheKeys = [
        { query: { status: 'active' }, result: [{ id: 1 }] },
        { query: { status: 'inactive' }, result: [{ id: 2 }] },
        { query: { status: 'active', role: 'admin' }, result: [{ id: 3 }] },
        { query: {}, result: [{ id: 4 }] },
        { query: { $or: [{ a: 1 }, { b: 2 }] }, result: [{ id: 5 }] }
      ];

      cacheKeys.forEach(({ query, result }) => {
        const keyObj = CacheFactory.buildCacheKey({
          iid: 'test',
          type: 'mongodb',
          db: 'test',
          collection: 'users',
          op: 'find',
          base: { query, projection: {} }
        });
        const key = CacheFactory.stableStringify(keyObj);
        mockCache.data.set(key, result);
      });
    });

    it('应该只失效匹配的缓存', async () => {
      const context = {
        instanceId: 'test',
        type: 'mongodb',
        db: 'test',
        collection: 'users',
        document: { status: 'active', name: 'Alice' },
        operation: 'insertOne'
      };

      const deleted = await CacheInvalidationEngine.invalidatePrecise(mockCache, context);

      // 应该失效至少 2 个缓存：
      // 1. { status: 'active' }
      // 2. {} (空查询，匹配所有)
      // 注意：{ status: 'active', role: 'admin' } 不会匹配，因为文档没有 role 字段
      expect(deleted).to.be.at.least(2);
    });

    it('应该跳过复杂查询', async () => {
      const context = {
        instanceId: 'test',
        type: 'mongodb',
        db: 'test',
        collection: 'users',
        document: { a: 1 },
        operation: 'insertOne'
      };

      const deleted = await CacheInvalidationEngine.invalidatePrecise(mockCache, context);

      // 不应该失效 { $or: [...] } 的缓存
      const remainingKeys = Array.from(mockCache.data.keys());
      const complexQueryKey = remainingKeys.find(key =>
        key.includes('"$or"')
      );
      expect(complexQueryKey).to.exist;
    });

    it('应该处理空缓存', async () => {
      mockCache.data.clear();

      const context = {
        instanceId: 'test',
        type: 'mongodb',
        db: 'test',
        collection: 'users',
        document: { status: 'active' },
        operation: 'insertOne'
      };

      const deleted = await CacheInvalidationEngine.invalidatePrecise(mockCache, context);
      expect(deleted).to.equal(0);
    });
  });
});

