/**
 * 条件扩展测试 - SWITCH
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Conditional Extensions', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_conditional',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_students').deleteMany({});
    await db.collection('test_students').insertMany([
      { _id: 1, name: 'Alice', score: 95, status: 'active' },
      { _id: 2, name: 'Bob', score: 75, status: 'active' },
      { _id: 3, name: 'Charlie', score: 55, status: 'inactive' },
      { _id: 4, name: 'David', score: 85, status: 'active' }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('SWITCH Function', function() {

    it('should evaluate switch branches for grades', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_students').aggregate([
        {
          $project: {
            name: 1,
            grade: expr("SWITCH(score >= 90, 'A', score >= 80, 'B', score >= 60, 'C', 'F')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].grade, 'A');  // 95
      assert.strictEqual(result[1].grade, 'C');  // 75
      assert.strictEqual(result[2].grade, 'F');  // 55
      assert.strictEqual(result[3].grade, 'B');  // 85
    });

    it('should handle simple switch with status', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_students').aggregate([
        {
          $project: {
            name: 1,
            statusLabel: expr("SWITCH(status === 'active', 'Active', 'Inactive')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].statusLabel, 'Active');
      assert.strictEqual(result[2].statusLabel, 'Inactive');
    });

    it('should use switch to filter high scores', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_students').aggregate([
        {
          $project: {
            name: 1,
            score: 1,
            isHigh: expr("SWITCH(score >= 80, true, false)")
          }
        },
        { $match: { isHigh: true } },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result.length, 2);  // Alice (95) 和 David (85)
      assert.strictEqual(result[0].name, 'Alice');
      assert.strictEqual(result[1].name, 'David');
    });
  });

  describe('Combined Conditional Operations', function() {

    it('should combine ternary and switch', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_students').aggregate([
        {
          $project: {
            name: 1,
            // 使用三元运算符
            pass: expr("score >= 60 ? 'Pass' : 'Fail'"),
            // 使用 SWITCH 获取等级
            level: expr("SWITCH(score >= 90, 'Excellent', score >= 70, 'Good', 'Need Improvement')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].pass, 'Pass');
      assert.strictEqual(result[0].level, 'Excellent');
      assert.strictEqual(result[2].pass, 'Fail');
      assert.strictEqual(result[2].level, 'Need Improvement');
    });
  });
});

