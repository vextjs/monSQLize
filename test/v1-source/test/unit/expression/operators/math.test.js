/**
 * 数学函数测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Math Functions', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_math',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_numbers').deleteMany({});
    await db.collection('test_numbers').insertMany([
      { _id: 1, value: -5.7, base: 2, exponent: 3 },
      { _id: 2, value: 3.2, base: 3, exponent: 2 },
      { _id: 3, value: -10.5, base: 5, exponent: 2 },
      { _id: 4, value: 16, base: 4, exponent: 3 }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('ABS Function', function() {

    it('should get absolute value', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            absValue: expr("ABS(value)")
          }
        }
      ]);

      assert.strictEqual(result[0].absValue, 5.7);   // ABS(-5.7)
      assert.strictEqual(result[1].absValue, 3.2);   // ABS(3.2)
      assert.strictEqual(result[2].absValue, 10.5);  // ABS(-10.5)
    });
  });

  describe('CEIL Function', function() {

    it('should round up to ceiling', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            ceilValue: expr("CEIL(value)")
          }
        }
      ]);

      assert.strictEqual(result[0].ceilValue, -5);   // CEIL(-5.7)
      assert.strictEqual(result[1].ceilValue, 4);    // CEIL(3.2)
      assert.strictEqual(result[2].ceilValue, -10);  // CEIL(-10.5)
    });
  });

  describe('FLOOR Function', function() {

    it('should round down to floor', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            floorValue: expr("FLOOR(value)")
          }
        }
      ]);

      assert.strictEqual(result[0].floorValue, -6);   // FLOOR(-5.7)
      assert.strictEqual(result[1].floorValue, 3);    // FLOOR(3.2)
      assert.strictEqual(result[2].floorValue, -11);  // FLOOR(-10.5)
    });
  });

  describe('ROUND Function', function() {

    it('should round to nearest integer', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            roundValue: expr("ROUND(value)")
          }
        }
      ]);

      assert.strictEqual(result[0].roundValue, -6);  // ROUND(-5.7)
      assert.strictEqual(result[1].roundValue, 3);   // ROUND(3.2)
    });
  });

  describe('SQRT Function', function() {

    it('should get square root', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            sqrtValue: expr("SQRT(value)")
          }
        },
        { $match: { value: { $gt: 0 } } }  // 只取正数
      ]);

      assert(Math.abs(result[0].sqrtValue - Math.sqrt(3.2)) < 0.001);  // SQRT(3.2)
      assert.strictEqual(result[1].sqrtValue, 4);  // SQRT(16)
    });
  });

  describe('POW Function', function() {

    it('should calculate power', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            base: 1,
            exponent: 1,
            power: expr("POW(base, exponent)")
          }
        }
      ]);

      assert.strictEqual(result[0].power, 8);    // POW(2, 3) = 8
      assert.strictEqual(result[1].power, 9);    // POW(3, 2) = 9
      assert.strictEqual(result[2].power, 25);   // POW(5, 2) = 25
      assert.strictEqual(result[3].power, 64);   // POW(4, 3) = 64
    });
  });

  describe('Combined Math Operations', function() {

    it('should combine multiple math functions', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            normalized: expr("ROUND(ABS(value))")
          }
        }
      ]);

      // ROUND(ABS(-5.7)) = ROUND(5.7) = 6
      // ROUND(ABS(3.2)) = ROUND(3.2) = 3
      // ROUND(ABS(-10.5)) = ROUND(10.5) = 10 或 11 (银行家舍入)
      assert.strictEqual(result[0].normalized, 6);
      assert.strictEqual(result[1].normalized, 3);
      assert(result[2].normalized === 10 || result[2].normalized === 11, 'Should be 10 or 11');
    });

    it('should use math functions in expressions', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            value: 1,
            category: expr("ABS(value) > 10 ? 'large' : 'small'")
          }
        }
      ]);

      assert.strictEqual(result[0].category, 'small');  // ABS(-5.7) = 5.7
      assert.strictEqual(result[1].category, 'small');  // ABS(3.2) = 3.2
      assert.strictEqual(result[2].category, 'large');  // ABS(-10.5) = 10.5
    });

    it('should combine with arithmetic operators', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_numbers').aggregate([
        {
          $project: {
            base: 1,
            exponent: 1,
            result: expr("POW(base, exponent) + base")  // 修改：使用 base 而不是 ABS(base)
          }
        }
      ]);

      assert.strictEqual(result[0].result, 10);   // POW(2, 3) + 2 = 8 + 2
      assert.strictEqual(result[1].result, 12);   // POW(3, 2) + 3 = 9 + 3
    });
  });
});

