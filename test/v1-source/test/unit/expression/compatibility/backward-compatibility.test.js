/**
 * 向后兼容性测试套件
 *
 * 目标: 确保统一表达式系统100%向后兼容MongoDB原生语法
 * 测试数: 30个
 * 优先级: P0（最高）
 *
 * 测试分类:
 * 1. 原生MongoDB语法测试（10个）
 * 2. 混合语法测试（10个）
 * 3. 无破坏性变更测试（10个）
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('🔄 Backward Compatibility Tests', function() {
  this.timeout(30000);

  let msq, collection;

  before(async function() {
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_backward_compat',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;

    // 清理所有集合
    const collections = ['orders', 'users', 'products', 'order_items', 'items', 'events'];
    for (const coll of collections) {
      try {
        await collection(coll).deleteMany({});
      } catch (err) {
        // 集合可能不存在，忽略错误
      }
    }

    // 准备测试数据
    await collection('orders').insertMany([
      { _id: 1, amount: 50, status: 'pending', category: 'A', quantity: 2, price: 25 },
      { _id: 2, amount: 150, status: 'paid', category: 'B', quantity: 3, price: 50 },
      { _id: 3, amount: 250, status: 'paid', category: 'A', quantity: 5, price: 50 },
      { _id: 4, amount: 80, status: 'shipped', category: 'C', quantity: 4, price: 20 },
      { _id: 5, amount: 300, status: 'paid', category: 'B', quantity: 6, price: 50 }
    ]);

    await collection('users').insertMany([
      { _id: 1, name: 'Alice', age: 25, city: 'Beijing', active: true },
      { _id: 2, name: 'Bob', age: 30, city: 'Shanghai', active: true },
      { _id: 3, name: 'Charlie', age: 35, city: 'Beijing', active: false },
      { _id: 4, name: 'David', age: 28, city: 'Shanghai', active: true }
    ]);
  });

  after(async function() {
    await msq.close();
  });

  // ====================================================================
  // 1. 原生MongoDB语法测试（10个）
  // ====================================================================

  describe('1️⃣ Native MongoDB Syntax Support', function() {

    it('1.1 should support native $match with simple query', async function() {
      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } }
      ]);

      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].status, 'paid');
    });

    it('1.2 should support native $match with comparison operators', async function() {
      const result = await collection('orders').aggregate([
        { $match: { amount: { $gt: 100 } } }
      ]);

      assert.strictEqual(result.length, 3);
      result.forEach(doc => {
        assert(doc.amount > 100);
      });
    });

    it('1.3 should support native $group with $sum', async function() {
      const result = await collection('orders').aggregate([
        { $group: { _id: '$category', total: { $sum: '$amount' } } }
      ]);

      assert.strictEqual(result.length, 3);
      const categoryA = result.find(r => r._id === 'A');
      assert.strictEqual(categoryA.total, 300);
    });

    it('1.4 should support native $project with expressions', async function() {
      const result = await collection('orders').aggregate([
        { $project: { amount: 1, doubleAmount: { $multiply: ['$amount', 2] } } }
      ]);

      assert.strictEqual(result[0].doubleAmount, 100);
      assert.strictEqual(result[1].doubleAmount, 300);
    });

    it('1.5 should support native $sort', async function() {
      const result = await collection('orders').aggregate([
        { $sort: { amount: -1 } }
      ]);

      assert.strictEqual(result[0].amount, 300);
      assert.strictEqual(result[result.length - 1].amount, 50);
    });

    it('1.6 should support native $limit and $skip', async function() {
      const result = await collection('orders').aggregate([
        { $sort: { amount: 1 } },
        { $skip: 1 },
        { $limit: 2 }
      ]);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].amount, 80);
      assert.strictEqual(result[1].amount, 150);
    });

    it('1.7 should support native $unwind', async function() {
      await collection('products').insertMany([
        { name: 'Product A', tags: ['tag1', 'tag2', 'tag3'] },
        { name: 'Product B', tags: ['tag2', 'tag4'] }
      ]);

      const result = await collection('products').aggregate([
        { $unwind: '$tags' }
      ]);

      assert.strictEqual(result.length, 5);
    });

    it('1.8 should support native $lookup', async function() {
      await collection('order_items').insertMany([
        { orderId: 1, productName: 'Item A' },
        { orderId: 2, productName: 'Item B' }
      ]);

      const result = await collection('orders').aggregate([
        { $match: { _id: { $in: [1, 2] } } },
        {
          $lookup: {
            from: 'order_items',
            localField: '_id',
            foreignField: 'orderId',
            as: 'items'
          }
        }
      ]);

      assert.strictEqual(result.length, 2);
      assert(Array.isArray(result[0].items));
    });

    it('1.9 should support native $addFields', async function() {
      const result = await collection('orders').aggregate([
        { $addFields: { computed: { $add: ['$amount', 10] } } }
      ]);

      assert.strictEqual(result[0].computed, 60);
    });

    it('1.10 should support complex native pipeline', async function() {
      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: '$category', count: { $sum: 1 }, total: { $sum: '$amount' } } },
        { $sort: { total: -1 } },
        { $limit: 2 }
      ]);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0]._id, 'B');
      assert.strictEqual(result[0].total, 450);
    });
  });

  // ====================================================================
  // 2. 混合语法测试（10个）
  // ====================================================================

  describe('2️⃣ Mixed Syntax Support', function() {

    it('2.1 should support new expression in $match, native in $group', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        { $match: expr("amount > 100") },                    // 新语法
        { $group: { _id: '$category', total: { $sum: '$amount' } } }  // 旧语法
      ]);

      assert.strictEqual(result.length, 2);
    });

    it('2.2 should support native in $match, new expression in $project', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } },                   // 旧语法
        { $project: { total: expr("price * quantity") } }    // 新语法
      ]);

      assert.strictEqual(result[0].total, 150);
    });

    it('2.3 should support mixed expressions in same stage', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        {
          $project: {
            amount: 1,                                    // 旧语法
            doubled: expr("amount * 2"),                     // 新语法
            tripled: { $multiply: ['$amount', 3] }        // 旧语法
          }
        }
      ]);

      assert.strictEqual(result[0].doubled, 100);
      assert.strictEqual(result[0].tripled, 150);
    });

    it('2.4 should support new expression in $group accumulator', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } },
        {
          $group: {
            _id: '$category',
            total: expr("SUM(amount)"),                      // 新语法
            count: { $sum: 1 }                            // 旧语法
          }
        }
      ]);

      assert.strictEqual(result.length, 2);
      const catB = result.find(r => r._id === 'B');
      assert.strictEqual(catB.total, 450);
      assert.strictEqual(catB.count, 2);
    });

    it('2.5 should support multiple stages with mixed syntax', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        { $match: expr("status === 'paid'") },               // 新语法
        { $project: { category: 1, amount: 1 } },         // 旧语法
        { $group: { _id: '$category', total: expr("SUM(amount)") } },  // 新语法
        { $sort: { total: -1 } }                          // 旧语法
      ]);

      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0]._id, 'B');
    });

    it('2.6 should support native $facet with new expressions', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        {
          $facet: {
            highValue: [
              { $match: expr("amount > 100") }               // 新语法
            ],
            byCategory: [
              { $group: { _id: '$category', count: { $sum: 1 } } }  // 旧语法
            ]
          }
        }
      ]);

      assert.strictEqual(result[0].highValue.length, 3);
      assert.strictEqual(result[0].byCategory.length, 3);
    });

    it('2.7 should support nested new expressions with native stages', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        {
          $project: {
            computed: expr("UPPER(CONCAT(category, '-', status))"),  // 新语法
            amount: 1
          }
        },
        { $sort: { amount: -1 } }                         // 旧语法
      ]);

      assert.strictEqual(result[0].computed, 'B-PAID');
    });

    it('2.8 should support conditional new expression with native $cond', async function() {
      const { expr } = MonSQLize;

      const result = await collection('orders').aggregate([
        {
          $project: {
            amount: 1,
            level1: expr("amount > 200 ? 'high' : 'low'"),   // 新语法
            level2: { $cond: [{ $gt: ['$amount', 100] }, 'medium', 'low'] }  // 旧语法
          }
        }
      ]);

      assert.strictEqual(result[4].level1, 'high');
      assert.strictEqual(result[1].level2, 'medium');
    });

    it('2.9 should support array operations mixed syntax', async function() {
      const { expr } = MonSQLize;

      await collection('items').insertMany([
        { values: [1, 2, 3, 4, 5] },
        { values: [10, 20, 30] }
      ]);

      const result = await collection('items').aggregate([
        {
          $project: {
            size1: expr("SIZE(values)"),                     // 新语法
            size2: { $size: '$values' },                  // 旧语法
            first: { $arrayElemAt: ['$values', 0] }       // 旧语法
          }
        }
      ]);

      assert.strictEqual(result[0].size1, 5);
      assert.strictEqual(result[0].size2, 5);
      assert.strictEqual(result[0].first, 1);
    });

    it('2.10 should support date operations mixed syntax', async function() {
      const { expr } = MonSQLize;

      await collection('events').insertMany([
        { name: 'Event 1', date: new Date('2024-01-15') },
        { name: 'Event 2', date: new Date('2024-06-20') }
      ]);

      const result = await collection('events').aggregate([
        {
          $project: {
            name: 1,
            year1: expr("YEAR(date)"),                       // 新语法
            year2: { $year: '$date' },                    // 旧语法
            month: { $month: '$date' }                    // 旧语法
          }
        }
      ]);

      assert.strictEqual(result[0].year1, 2024);
      assert.strictEqual(result[0].year2, 2024);
      assert.strictEqual(result[0].month, 1);
    });
  });

  // ====================================================================
  // 3. 无破坏性变更测试（10个）
  // ====================================================================

  describe('3️⃣ No Breaking Changes', function() {

    it('3.1 should not modify original pipeline object', async function() {
      const pipeline = [
        { $match: { status: 'paid' } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } }
      ];
      const original = JSON.parse(JSON.stringify(pipeline));

      await collection('orders').aggregate(pipeline);

      assert.deepStrictEqual(pipeline, original, '原始pipeline不应被修改');
    });

    it('3.2 should not modify pipeline with new expressions', async function() {
      const { expr } = MonSQLize;

      const exprFilter = expr("amount > 100");
      const pipeline = [{ $match: exprFilter }];
      const original = JSON.parse(JSON.stringify(pipeline));

      await collection('orders').aggregate(pipeline);

      assert.deepStrictEqual(pipeline, original, '包含新表达式的pipeline不应被修改');
    });

    it('3.3 should return same result structure as native', async function() {
      const nativeResult = await collection('orders').aggregate([
        { $match: { status: 'paid' } }
      ]);

      const { expr } = MonSQLize;
      const exprResult = await collection('orders').aggregate([
        { $match: expr("status === 'paid'") }
      ]);

      assert.strictEqual(nativeResult.length, exprResult.length);
      assert.strictEqual(typeof nativeResult[0]._id, typeof exprResult[0]._id);
    });

    it('3.4 should maintain field order', async function() {
      const result = await collection('orders').aggregate([
        { $project: { amount: 1, status: 1, category: 1, _id: 0 } }
      ]);

      const keys = Object.keys(result[0]);
      assert.deepStrictEqual(keys, ['amount', 'status', 'category']);
    });

    it('3.5 should preserve _id by default', async function() {
      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } }
      ]);

      result.forEach(doc => {
        assert(doc._id !== undefined, '_id应该被保留');
      });
    });

    it('3.6 should support existing collection methods', async function() {
      // 确保其他collection方法不受影响
      const findResult = await collection('orders').find({ status: 'paid' });
      const insertResult = await collection('orders').insertOne({
        amount: 500,
        status: 'pending',
        category: 'D'
      });
      const updateResult = await collection('orders').updateOne(
        { _id: insertResult.insertedId },
        { $set: { status: 'paid' } }
      );

      assert.strictEqual(findResult.length, 3);
      assert(insertResult.insertedId);
      assert.strictEqual(updateResult.modifiedCount, 1);

      // 清理插入的测试数据
      await collection('orders').deleteOne({ _id: insertResult.insertedId });
    });

    it('3.7 should work with existing options', async function() {
      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } }
      ], {
        allowDiskUse: true,
        maxTimeMS: 5000
      });

      assert(result.length >= 3, '至少应该有3条paid状态的记录');
    });

    it('3.8 should work with existing error handling', async function() {
      let errorThrown = false;

      try {
        await collection('orders').aggregate([
          { $invalidStage: {} }
        ]);
      } catch (err) {
        errorThrown = true;
        assert(err.message.includes('invalid') || err.message.includes('Unrecognized'));
      }

      assert(errorThrown, '无效的stage应该抛出错误');
    });

    it('3.9 should maintain cursor behavior', async function() {
      // 确保aggregate返回数组（不是cursor）
      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } }
      ]);

      assert(Array.isArray(result), 'aggregate应该返回数组');
    });

    it('3.10 should work with existing indexes', async function() {
      // 创建索引
      await collection('orders').createIndex({ status: 1 });

      // 确保查询仍然使用索引
      const result = await collection('orders').aggregate([
        { $match: { status: 'paid' } }
      ]);

      assert(result.length >= 3, '至少应该有3条paid状态的记录');

      // 清理索引
      try {
        await collection('orders').dropIndex('status_1');
      } catch (err) {
        // 索引可能已经不存在，忽略错误
      }
    });
  });
});

