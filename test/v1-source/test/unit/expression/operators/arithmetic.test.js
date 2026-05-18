/**
 * 算术运算符和特殊操作符测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Arithmetic & Special Operators', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_arithmetic',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_products').deleteMany({});
    await db.collection('test_products').insertMany([
      { _id: 1, name: 'Product A', price: 100, cost: 60, quantity: 10 },
      { _id: 2, name: 'Product B', price: 200, cost: 120, quantity: 5 },
      { _id: 3, name: 'Product C', price: 150, cost: 90, quantity: 0 },
      { _id: 4, name: 'Product D', price: 80, cost: 50, quantity: 20 }
    ]);

    await db.collection('test_users').deleteMany({});
    await db.collection('test_users').insertMany([
      { _id: 1, name: 'Alice', nickname: 'Ali', age: 25 },
      { _id: 2, name: 'Bob', nickname: null, age: 30 },
      { _id: 3, name: 'Charlie', age: 35 }  // 没有nickname字段
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('Arithmetic Operators', function() {

    it('should compile + (addition)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            price: 1,
            cost: 1,
            total: expr("price + cost")
          }
        }
      ]);

      assert.strictEqual(result.length, 4);
      assert.strictEqual(result[0].total, 160);  // 100 + 60
      assert.strictEqual(result[1].total, 320);  // 200 + 120
    });

    it('should compile - (subtraction)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            profit: expr("price - cost")
          }
        }
      ]);

      assert.strictEqual(result[0].profit, 40);   // 100 - 60
      assert.strictEqual(result[1].profit, 80);   // 200 - 120
    });

    it('should compile * (multiplication)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            quantity: 1,
            price: 1,
            totalValue: expr("price * quantity")
          }
        }
      ]);

      assert.strictEqual(result[0].totalValue, 1000);  // 100 * 10
      assert.strictEqual(result[1].totalValue, 1000);  // 200 * 5
    });

    it('should compile / (division)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            price: 1,
            quantity: 1,
            pricePerUnit: expr("price / quantity")
          }
        },
        { $match: { quantity: { $gt: 0 } } }
      ]);

      assert.strictEqual(result[0].pricePerUnit, 10);   // 100 / 10
      assert.strictEqual(result[1].pricePerUnit, 40);   // 200 / 5
    });

    it('should compile % (modulo)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            price: 1,
            remainder: expr("price % 30")
          }
        }
      ]);

      assert.strictEqual(result[0].remainder, 10);  // 100 % 30 = 10
      assert.strictEqual(result[1].remainder, 20);  // 200 % 30 = 20
    });
  });

  describe('Ternary Operator', function() {

    it('should compile ?: (ternary)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            price: 1,
            category: expr("price > 100 ? 'expensive' : 'cheap'")
          }
        }
      ]);

      assert.strictEqual(result[0].category, 'cheap');      // price=100
      assert.strictEqual(result[1].category, 'expensive');  // price=200
      assert.strictEqual(result[2].category, 'expensive');  // price=150
      assert.strictEqual(result[3].category, 'cheap');      // price=80
    });

    it('should compile nested ternary', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            price: 1,
            grade: expr("price >= 200 ? 'A' : price >= 100 ? 'B' : 'C'")
          }
        }
      ]);

      assert.strictEqual(result[0].grade, 'B');  // price=100
      assert.strictEqual(result[1].grade, 'A');  // price=200
      assert.strictEqual(result[2].grade, 'B');  // price=150
      assert.strictEqual(result[3].grade, 'C');  // price=80
    });
  });

  describe('Null Coalescing Operator', function() {

    it('should compile ?? (null coalescing)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            name: 1,
            displayName: expr("nickname ?? name")
          }
        }
      ]);

      assert.strictEqual(result[0].displayName, 'Ali');      // nickname存在
      assert.strictEqual(result[1].displayName, 'Bob');      // nickname是null
      assert.strictEqual(result[2].displayName, 'Charlie'); // nickname不存在
    });

    it('should compile ?? with literal value', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            name: 1,
            displayName: expr("nickname ?? 'Anonymous'")
          }
        }
      ]);

      assert.strictEqual(result[0].displayName, 'Ali');        // nickname存在
      assert.strictEqual(result[1].displayName, 'Anonymous');  // nickname是null
      assert.strictEqual(result[2].displayName, 'Anonymous'); // nickname不存在
    });
  });
});

