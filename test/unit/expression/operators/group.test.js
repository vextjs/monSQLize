    /**
 * $group 上下文聚合累加器测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Group Accumulators', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_group',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_orders').deleteMany({});
    await db.collection('test_orders').insertMany([
      { _id: 1, userId: 'user1', amount: 100, item: 'A', date: new Date('2024-01-01') },
      { _id: 2, userId: 'user1', amount: 200, item: 'B', date: new Date('2024-01-02') },
      { _id: 3, userId: 'user2', amount: 50, item: 'C', date: new Date('2024-01-03') },
      { _id: 4, userId: 'user2', amount: 30, item: 'D', date: new Date('2024-01-04') },
      { _id: 5, userId: 'user3', amount: 150, item: 'E', date: new Date('2024-01-05') }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('FIRST in $group', function() {

    it('should get first value in group', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $sort: { date: 1 } },
        {
          $group: {
            _id: '$userId',
            firstAmount: expr("FIRST(amount)"),
            firstItem: expr("FIRST(item)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // user1的第一笔订单
      assert.strictEqual(result[0]._id, 'user1');
      assert.strictEqual(result[0].firstAmount, 100);
      assert.strictEqual(result[0].firstItem, 'A');

      // user2的第一笔订单
      assert.strictEqual(result[1]._id, 'user2');
      assert.strictEqual(result[1].firstAmount, 50);
      assert.strictEqual(result[1].firstItem, 'C');
    });
  });

  describe('LAST in $group', function() {

    it('should get last value in group', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $sort: { date: 1 } },
        {
          $group: {
            _id: '$userId',
            lastAmount: expr("LAST(amount)"),
            lastItem: expr("LAST(item)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // user1的最后一笔订单
      assert.strictEqual(result[0]._id, 'user1');
      assert.strictEqual(result[0].lastAmount, 200);
      assert.strictEqual(result[0].lastItem, 'B');

      // user2的最后一笔订单
      assert.strictEqual(result[1]._id, 'user2');
      assert.strictEqual(result[1].lastAmount, 30);
      assert.strictEqual(result[1].lastItem, 'D');
    });
  });

  describe('Combined Group Accumulators', function() {

    it('should use FIRST, LAST with other accumulators', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $sort: { date: 1 } },
        {
          $group: {
            _id: '$userId',
            total: expr("SUM(amount)"),
            avg: expr("AVG(amount)"),
            count: expr("COUNT()"),
            firstItem: expr("FIRST(item)"),
            lastItem: expr("LAST(item)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const user1 = result[0];
      assert.strictEqual(user1._id, 'user1');
      assert.strictEqual(user1.total, 300);      // 100 + 200
      assert.strictEqual(user1.avg, 150);        // (100 + 200) / 2
      assert.strictEqual(user1.count, 2);
      assert.strictEqual(user1.firstItem, 'A');
      assert.strictEqual(user1.lastItem, 'B');
    });
  });
});

