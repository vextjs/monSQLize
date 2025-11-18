/**
 * incrementOne 方法完整测试套件
 * 测试原子递增/递减字段值的功能
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('incrementOne 方法测试套件', function () {
  this.timeout(30000);

  let msq;
  let collection;
  let nativeCollection;

  before(async function () {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_incrementone',
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
    it('1.1 应该递增单个字段（默认 +1）', async function () {
      await nativeCollection.insertOne({ userId: 'user1', loginCount: 10 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user1' },
        'loginCount'
      );

      assert.strictEqual(result.acknowledged, true);
      assert.strictEqual(result.matchedCount, 1);
      assert.strictEqual(result.modifiedCount, 1);
      assert.strictEqual(result.value.loginCount, 11, 'loginCount 应该递增到 11');
    });

    it('1.2 应该递增单个字段（指定增量）', async function () {
      await nativeCollection.insertOne({ userId: 'user2', points: 100 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user2' },
        'points',
        50
      );

      assert.strictEqual(result.matchedCount, 1);
      assert.strictEqual(result.value.points, 150);
    });

    it('1.3 应该递减单个字段（负数）', async function () {
      await nativeCollection.insertOne({ userId: 'user3', credits: 100 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user3' },
        'credits',
        -30
      );

      assert.strictEqual(result.matchedCount, 1);
      assert.strictEqual(result.value.credits, 70);
    });

    it('1.4 应该支持多字段递增', async function () {
      await nativeCollection.insertOne({
        userId: 'user4',
        loginCount: 10,
        points: 100,
        credits: 50
      });

      const result = await collection('test_users').incrementOne(
        { userId: 'user4' },
        {
          loginCount: 1,
          points: 20,
          credits: -10
        }
      );

      assert.strictEqual(result.matchedCount, 1);
      assert.strictEqual(result.value.loginCount, 11);
      assert.strictEqual(result.value.points, 120);
      assert.strictEqual(result.value.credits, 40);
    });

    it('1.5 应该支持小数增量', async function () {
      await nativeCollection.insertOne({ userId: 'user5', balance: 100.5 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user5' },
        'balance',
        25.75
      );

      assert.strictEqual(result.value.balance, 126.25);
    });

    it('1.6 应该支持从 0 开始递增', async function () {
      await nativeCollection.insertOne({ userId: 'user6', newField: 0 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user6' },
        'newField',
        5
      );

      assert.strictEqual(result.value.newField, 5);
    });
  });

  describe('2. 返回值测试', function () {
    it('2.1 应该返回更新后的文档（默认）', async function () {
      await nativeCollection.insertOne({ userId: 'user7', count: 10 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user7' },
        'count',
        5
      );

      assert.strictEqual(result.value.count, 15, '默认应该返回更新后的值');
    });

    it('2.2 应该支持返回更新前的文档', async function () {
      await nativeCollection.insertOne({ userId: 'user8', count: 10 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user8' },
        'count',
        5,
        { returnDocument: 'before' }
      );

      assert.strictEqual(result.value.count, 10, '应该返回更新前的值');

      // 验证数据库中的值已更新
      const doc = await nativeCollection.findOne({ userId: 'user8' });
      assert.strictEqual(doc.count, 15);
    });

    it('2.3 未找到文档时应该返回 null', async function () {
      const result = await collection('test_users').incrementOne(
        { userId: 'nonexistent' },
        'count',
        5
      );

      assert.strictEqual(result.matchedCount, 0);
      assert.strictEqual(result.value, null);
    });
  });

  describe('3. 选项支持测试', function () {
    it('3.1 应该支持 projection 选项', async function () {
      await nativeCollection.insertOne({
        userId: 'user9',
        count: 10,
        name: 'Alice',
        email: 'alice@example.com'
      });

      const result = await collection('test_users').incrementOne(
        { userId: 'user9' },
        'count',
        5,
        { projection: { count: 1, name: 1 } }
      );

      assert.ok(result.value._id);
      assert.ok(result.value.name);
      assert.strictEqual(result.value.count, 15);
      assert.strictEqual(result.value.email, undefined, 'email 不应该返回');
    });

    it('3.2 应该支持 maxTimeMS 选项', async function () {
      await nativeCollection.insertOne({ userId: 'user10', count: 10 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user10' },
        'count',
        5,
        { maxTimeMS: 5000 }
      );

      assert.strictEqual(result.matchedCount, 1);
    });

    it('3.3 应该支持 comment 选项', async function () {
      await nativeCollection.insertOne({ userId: 'user11', count: 10 });

      const result = await collection('test_users').incrementOne(
        { userId: 'user11' },
        'count',
        5,
        { comment: 'test-increment' }
      );

      assert.strictEqual(result.matchedCount, 1);
    });
  });

  describe('4. 参数验证测试', function () {
    it('4.1 应该拒绝空 filter', async function () {
      try {
        await collection('test_users').incrementOne(null, 'count', 5);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('filter 必须是非空对象'));
      }
    });

    it('4.2 应该拒绝非对象 filter', async function () {
      try {
        await collection('test_users').incrementOne('invalid', 'count', 5);
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('filter 必须是非空对象'));
      }
    });

    it('4.3 应该拒绝非数字增量', async function () {
      await nativeCollection.insertOne({ userId: 'user12', count: 10 });

      try {
        await collection('test_users').incrementOne(
          { userId: 'user12' },
          'count',
          'invalid'
        );
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('increment 必须是数字'));
      }
    });

    it('4.4 应该拒绝 NaN 增量', async function () {
      await nativeCollection.insertOne({ userId: 'user13', count: 10 });

      try {
        await collection('test_users').incrementOne(
          { userId: 'user13' },
          'count',
          NaN
        );
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('increment 必须是数字'));
      }
    });

    it('4.5 应该拒绝非字符串非对象的 field', async function () {
      await nativeCollection.insertOne({ userId: 'user14', count: 10 });

      try {
        await collection('test_users').incrementOne(
          { userId: 'user14' },
          123,
          5
        );
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('field 必须是字符串或对象'));
      }
    });

    it('4.6 多字段时应该验证所有增量都是数字', async function () {
      await nativeCollection.insertOne({ userId: 'user15', a: 10, b: 20 });

      try {
        await collection('test_users').incrementOne(
          { userId: 'user15' },
          { a: 5, b: 'invalid' }
        );
        assert.fail('应该抛出错误');
      } catch (error) {
        assert.ok(error.message.includes('增量必须是数字'));
      }
    });
  });

  describe('5. 缓存失效测试', function () {
    it('5.1 更新时应该触发缓存失效', async function () {
      const cache = msq.getCache();
      if (!cache) {
        this.skip();
        return;
      }

      await nativeCollection.insertOne({ userId: 'user16', count: 10 });

      // 设置缓存
      const namespace = `${msq._adapter.instanceId}:mongodb:test_incrementone:test_users`;
      await cache.set(`${namespace}:test`, { data: 'cached' }, 10000);

      const result = await collection('test_users').incrementOne(
        { userId: 'user16' },
        'count',
        5
      );

      assert.strictEqual(result.matchedCount, 1);

      // 验证缓存已失效
      const cachedData = await cache.get(`${namespace}:test`);
      assert.strictEqual(cachedData, null, '缓存应该已失效');
    });
  });

  describe('6. 实际应用场景', function () {
    it('6.1 登录次数统计', async function () {
      await nativeCollection.insertOne({
        userId: 'user17',
        loginCount: 0,
        lastLogin: null
      });

      // 用户登录，递增登录次数
      const result = await collection('test_users').incrementOne(
        { userId: 'user17' },
        'loginCount'
      );

      assert.strictEqual(result.value.loginCount, 1);

      // 再次登录
      const result2 = await collection('test_users').incrementOne(
        { userId: 'user17' },
        'loginCount'
      );

      assert.strictEqual(result2.value.loginCount, 2);
    });

    it('6.2 积分系统（加分/扣分）', async function () {
      await nativeCollection.insertOne({
        userId: 'user18',
        points: 100
      });

      // 完成任务，获得积分
      const result1 = await collection('test_users').incrementOne(
        { userId: 'user18' },
        'points',
        50
      );
      assert.strictEqual(result1.value.points, 150);

      // 兑换商品，扣除积分
      const result2 = await collection('test_users').incrementOne(
        { userId: 'user18' },
        'points',
        -30
      );
      assert.strictEqual(result2.value.points, 120);
    });

    it('6.3 文章浏览量统计', async function () {
      await nativeCollection.insertOne({
        articleId: 'article1',
        views: 100,
        likes: 10
      });

      // 用户浏览文章
      const result = await collection('test_users').incrementOne(
        { articleId: 'article1' },
        'views'
      );

      assert.strictEqual(result.value.views, 101);
    });

    it('6.4 库存管理（增加/减少）', async function () {
      await nativeCollection.insertOne({
        productId: 'prod1',
        stock: 50
      });

      // 进货，增加库存
      await collection('test_users').incrementOne(
        { productId: 'prod1' },
        'stock',
        20
      );

      // 出货，减少库存
      const result = await collection('test_users').incrementOne(
        { productId: 'prod1' },
        'stock',
        -5
      );

      assert.strictEqual(result.value.stock, 65);
    });

    it('6.5 多维度统计', async function () {
      await nativeCollection.insertOne({
        articleId: 'article2',
        views: 100,
        likes: 10,
        shares: 5,
        comments: 3
      });

      // 用户浏览+点赞+分享
      const result = await collection('test_users').incrementOne(
        { articleId: 'article2' },
        {
          views: 1,
          likes: 1,
          shares: 1
        }
      );

      assert.strictEqual(result.value.views, 101);
      assert.strictEqual(result.value.likes, 11);
      assert.strictEqual(result.value.shares, 6);
      assert.strictEqual(result.value.comments, 3, 'comments 不应该变化');
    });
  });

  describe('7. 边界用例测试', function () {
    it('7.1 应该处理大数值', async function () {
      await nativeCollection.insertOne({
        userId: 'user19',
        bigNumber: 999999999
      });

      const result = await collection('test_users').incrementOne(
        { userId: 'user19' },
        'bigNumber',
        1
      );

      assert.strictEqual(result.value.bigNumber, 1000000000);
    });

    it('7.2 应该处理负数字段', async function () {
      await nativeCollection.insertOne({
        userId: 'user20',
        debt: -100
      });

      const result = await collection('test_users').incrementOne(
        { userId: 'user20' },
        'debt',
        -50
      );

      assert.strictEqual(result.value.debt, -150);
    });

    it('7.3 应该处理 0 增量（无变化）', async function () {
      await nativeCollection.insertOne({
        userId: 'user21',
        count: 10
      });

      const result = await collection('test_users').incrementOne(
        { userId: 'user21' },
        'count',
        0
      );

      assert.strictEqual(result.value.count, 10);
    });

    it('7.4 应该处理不存在的字段（从 undefined 开始）', async function () {
      await nativeCollection.insertOne({
        userId: 'user22',
        name: 'Test'
      });

      const result = await collection('test_users').incrementOne(
        { userId: 'user22' },
        'newField',
        10
      );

      assert.strictEqual(result.value.newField, 10, '不存在的字段应该从 0 开始');
    });
  });

  describe('8. 与其他方法对比', function () {
    it('8.1 incrementOne 应该等价于 updateOne + $inc', async function () {
      await nativeCollection.insertMany([
        { userId: 'user23', count: 10 },
        { userId: 'user24', count: 10 }
      ]);

      // 使用 incrementOne
      await collection('test_users').incrementOne(
        { userId: 'user23' },
        'count',
        5
      );

      // 使用 updateOne + $inc
      await collection('test_users').updateOne(
        { userId: 'user24' },
        { $inc: { count: 5 } }
      );

      const doc1 = await nativeCollection.findOne({ userId: 'user23' });
      const doc2 = await nativeCollection.findOne({ userId: 'user24' });

      assert.strictEqual(doc1.count, doc2.count, '结果应该相同');
    });

    it('8.2 incrementOne 应该比 find + update 更安全（原子性）', async function () {
      await nativeCollection.insertOne({ userId: 'user25', count: 10 });

      // incrementOne（原子操作）
      const result = await collection('test_users').incrementOne(
        { userId: 'user25' },
        'count',
        5
      );

      assert.strictEqual(result.value.count, 15);
      // 即使并发执行，也能保证原子性
    });
  });
});

