/**
 * upsertOne 方法完整测试套件
 * 测试 upsertOne 便利方法的所有功能
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('upsertOne 方法测试套件', function () {
  this.timeout(30000);

  let msq;
  let collection;
  let nativeCollection;

  before(async function () {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_upsertone',
      config: { useMemoryServer: true },
      slowQueryMs: 1000
    });

    const conn = await msq.connect();
    collection = conn.collection;

    const db = msq._adapter.db;
    nativeCollection = db.collection('test_users');

    await nativeCollection.deleteMany({});
    console.log('✅ 测试环境准备完成');
  });

  after(async function () {
    console.log('🧹 清理测试环境...');
    if (nativeCollection) {
      await nativeCollection.deleteMany({});
    }
    if (msq) {
      await msq.close();
    }
    console.log('✅ 测试环境清理完成');
  });

  beforeEach(async function () {
    await nativeCollection.deleteMany({});
  });

  describe('1. 基础功能测试', function () {
    it('1.1 应该插入新文档（不存在时）', async function () {
      const result = await collection('test_users').upsertOne(
        { userId: 'user1' },
        { name: 'Alice', age: 30 }
      );

      assert.strictEqual(result.acknowledged, true, 'acknowledged 应该为 true');
      assert.strictEqual(result.matchedCount, 0, 'matchedCount 应该为 0');
      assert.strictEqual(result.modifiedCount, 0, 'modifiedCount 应该为 0');
      assert.strictEqual(result.upsertedCount, 1, 'upsertedCount 应该为 1');
      assert.ok(result.upsertedId, 'upsertedId 应该存在');

      const doc = await nativeCollection.findOne({ userId: 'user1' });
      assert.ok(doc, '文档应该存在');
      assert.equal(doc.name, 'Alice', '名称应该匹配');
      assert.equal(doc.age, 30, '年龄应该匹配');
    });

    it('1.2 应该更新已存在的文档', async function () {
      await nativeCollection.insertOne({ userId: 'user2', name: 'Bob', age: 25 });

      const result = await collection('test_users').upsertOne(
        { userId: 'user2' },
        { name: 'Bob Updated', age: 26 }
      );

      assert.strictEqual(result.acknowledged, true);
      assert.strictEqual(result.matchedCount, 1, 'matchedCount 应该为 1');
      assert.strictEqual(result.modifiedCount, 1, 'modifiedCount 应该为 1');
      assert.strictEqual(result.upsertedCount, 0, 'upsertedCount 应该为 0');
      assert.strictEqual(result.upsertedId, undefined, 'upsertedId 应该为 undefined');

      const doc = await nativeCollection.findOne({ userId: 'user2' });
      assert.equal(doc.name, 'Bob Updated', '名称应该更新');
      assert.equal(doc.age, 26, '年龄应该更新');
    });

    it('1.3 应该支持复杂的 filter 条件', async function () {
      const result = await collection('test_users').upsertOne(
        { userId: 'user3', role: 'admin' },
        { name: 'Admin', permissions: ['read', 'write'] }
      );

      assert.strictEqual(result.upsertedCount, 1);
      const doc = await nativeCollection.findOne({ userId: 'user3' });
      assert.equal(doc.role, 'admin');
      assert.deepStrictEqual(doc.permissions, ['read', 'write']);
    });

    it('1.4 应该支持更新操作符（$set, $inc 等）', async function () {
      await nativeCollection.insertOne({ userId: 'user4', name: 'Charlie', count: 10 });

      const result = await collection('test_users').upsertOne(
        { userId: 'user4' },
        { $set: { name: 'Charlie Updated' }, $inc: { count: 5 } }
      );

      assert.strictEqual(result.modifiedCount, 1);
      const doc = await nativeCollection.findOne({ userId: 'user4' });
      assert.equal(doc.name, 'Charlie Updated');
      assert.equal(doc.count, 15);
    });
  });

  describe('2. 返回值测试', function () {
    it('2.1 插入时应该返回 upsertedId', async function () {
      const result = await collection('test_users').upsertOne(
        { userId: 'user5' },
        { name: 'David' }
      );

      assert.ok(result.upsertedId, 'upsertedId 应该存在');
      assert.strictEqual(result.upsertedCount, 1);

      const doc = await nativeCollection.findOne({ _id: result.upsertedId });
      assert.ok(doc, '应该能通过 upsertedId 找到文档');
    });

    it('2.2 更新时不应该返回 upsertedId', async function () {
      await nativeCollection.insertOne({ userId: 'user6', name: 'Eve' });

      const result = await collection('test_users').upsertOne(
        { userId: 'user6' },
        { name: 'Eve Updated' }
      );

      assert.strictEqual(result.upsertedId, undefined);
      assert.strictEqual(result.upsertedCount, 0);
      assert.strictEqual(result.matchedCount, 1);
    });

    it('2.3 未修改时 modifiedCount 应该为 0', async function () {
      await nativeCollection.insertOne({ userId: 'user7', name: 'Frank', age: 30 });

      const result = await collection('test_users').upsertOne(
        { userId: 'user7' },
        { name: 'Frank', age: 30 }  // 相同的值
      );

      assert.strictEqual(result.matchedCount, 1);
      assert.strictEqual(result.modifiedCount, 0, 'modifiedCount 应该为 0');
    });
  });

  describe('3. 选项参数测试', function () {
    it('3.1 应该支持 maxTimeMS 选项', async function () {
      const result = await collection('test_users').upsertOne(
        { userId: 'user8' },
        { name: 'Grace' },
        { maxTimeMS: 5000 }
      );

      assert.strictEqual(result.upsertedCount, 1);
    });

    it('3.2 应该支持 comment 选项', async function () {
      const result = await collection('test_users').upsertOne(
        { userId: 'user9' },
        { name: 'Henry' },
        { comment: 'test-upsert' }
      );

      assert.strictEqual(result.upsertedCount, 1);
    });
  });

  describe('4. 参数验证测试', function () {
    it('4.1 应该拒绝空 filter', async function () {
      try {
        await collection('test_users').upsertOne(null, { name: 'Test' });
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('filter 必须是非空对象'));
      }
    });

    it('4.2 应该拒绝非对象 filter', async function () {
      try {
        await collection('test_users').upsertOne('invalid', { name: 'Test' });
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('filter 必须是非空对象'));
      }
    });

    it('4.3 应该拒绝数组 filter', async function () {
      try {
        await collection('test_users').upsertOne([], { name: 'Test' });
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('filter 必须是非空对象'));
      }
    });

    it('4.4 应该拒绝空 update', async function () {
      try {
        await collection('test_users').upsertOne({ userId: 'test' }, null);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('update 必须是非空对象'));
      }
    });

    it('4.5 应该拒绝非对象 update', async function () {
      try {
        await collection('test_users').upsertOne({ userId: 'test' }, 'invalid');
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('update 必须是非空对象'));
      }
    });
  });

  describe('5. 缓存失效测试', function () {
    it('5.1 插入时应该触发缓存失效', async function () {
      const cache = msq.getCache();
      if (!cache) {
        this.skip();
        return;
      }

      // 设置缓存
      const namespace = `${msq._adapter.instanceId}:mongodb:test_upsertone:test_users`;
      await cache.set(`${namespace}:test`, { data: 'cached' }, 10000);

      const result = await collection('test_users').upsertOne(
        { userId: 'user10' },
        { name: 'Iris' }
      );

      assert.strictEqual(result.upsertedCount, 1);

      // 验证缓存已失效
      const cachedData = await cache.get(`${namespace}:test`);
      assert.strictEqual(cachedData, undefined, '缓存应该已失效');
    });

    it('5.2 更新时应该触发缓存失效', async function () {
      const cache = msq.getCache();
      if (!cache) {
        this.skip();
        return;
      }

      await nativeCollection.insertOne({ userId: 'user11', name: 'Jack' });

      // 设置缓存
      const namespace = `${msq._adapter.instanceId}:mongodb:test_upsertone:test_users`;
      await cache.set(`${namespace}:test`, { data: 'cached' }, 10000);

      const result = await collection('test_users').upsertOne(
        { userId: 'user11' },
        { name: 'Jack Updated' }
      );

      assert.strictEqual(result.modifiedCount, 1);

      // 验证缓存已失效
      const cachedData = await cache.get(`${namespace}:test`);
      assert.strictEqual(cachedData, undefined, '缓存应该已失效');
    });
  });

  describe('6. 实际应用场景', function () {
    it('6.1 配置项同步（存在则更新，不存在则创建）', async function () {
      // 第一次：创建配置
      const result1 = await collection('test_users').upsertOne(
        { key: 'theme' },
        { value: 'light', updatedAt: new Date() }
      );
      assert.strictEqual(result1.upsertedCount, 1);

      // 第二次：更新配置
      const result2 = await collection('test_users').upsertOne(
        { key: 'theme' },
        { value: 'dark', updatedAt: new Date() }
      );
      assert.strictEqual(result2.modifiedCount, 1);

      const config = await nativeCollection.findOne({ key: 'theme' });
      assert.equal(config.value, 'dark');
    });

    it('6.2 用户资料更新（确保记录存在）', async function () {
      const result = await collection('test_users').upsertOne(
        { userId: 'user12' },
        {
          name: 'Kate',
          email: 'kate@example.com',
          lastLogin: new Date()
        }
      );

      assert.ok(result.upsertedCount === 1 || result.modifiedCount === 1);

      const user = await nativeCollection.findOne({ userId: 'user12' });
      assert.ok(user);
      assert.equal(user.name, 'Kate');
    });

    it('6.3 计数器初始化（存在则增加，不存在则初始化）', async function () {
      // 第一次：初始化（使用 $inc 会自动初始化为 0 然后递增到 1）
      await collection('test_users').upsertOne(
        { key: 'counter' },
        { $inc: { count: 1 } }
      );

      let doc = await nativeCollection.findOne({ key: 'counter' });
      assert.equal(doc.count, 1);

      // 第二次：递增
      await collection('test_users').upsertOne(
        { key: 'counter' },
        { $inc: { count: 1 } }
      );

      doc = await nativeCollection.findOne({ key: 'counter' });
      assert.equal(doc.count, 2);
    });
  });

  describe('7. 边界用例测试', function () {
    it('7.1 应该处理空对象 filter', async function () {
      const result = await collection('test_users').upsertOne(
        {},
        { name: 'Empty Filter' }
      );

      assert.strictEqual(result.upsertedCount, 1);
    });

    it('7.2 应该处理空对象 update（无操作）', async function () {
      await nativeCollection.insertOne({ userId: 'user13', name: 'Leo' });

      const result = await collection('test_users').upsertOne(
        { userId: 'user13' },
        {}
      );

      assert.strictEqual(result.matchedCount, 1);
      // MongoDB 可能返回 modifiedCount 0（无修改）
    });

    it('7.3 应该处理大文档', async function () {
      const largeData = {
        userId: 'user14',
        data: Array(1000).fill({ key: 'value', number: 123 })
      };

      const result = await collection('test_users').upsertOne(
        { userId: 'user14' },
        largeData
      );

      assert.strictEqual(result.upsertedCount, 1);
      const doc = await nativeCollection.findOne({ userId: 'user14' });
      assert.equal(doc.data.length, 1000);
    });
  });

  describe('8. 与 updateOne 对比', function () {
    it('8.1 upsertOne 应该等价于 updateOne({ upsert: true })', async function () {
      // 使用 upsertOne
      const result1 = await collection('test_users').upsertOne(
        { userId: 'user15' },
        { name: 'Mike' }
      );

      // 使用 updateOne({ upsert: true })
      const result2 = await collection('test_users').updateOne(
        { userId: 'user16' },
        { $set: { name: 'Nancy' } },
        { upsert: true }
      );

      assert.strictEqual(result1.upsertedCount, 1);
      assert.strictEqual(result2.upsertedCount, 1);

      const doc1 = await nativeCollection.findOne({ userId: 'user15' });
      const doc2 = await nativeCollection.findOne({ userId: 'user16' });
      assert.ok(doc1);
      assert.ok(doc2);
    });
  });
});

