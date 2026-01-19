/**
 * 表达式核心功能测试
 * 测试表达式检测和基本编译
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression Core - Detection', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_detection',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_orders').deleteMany({});
    await db.collection('test_orders').insertMany([
      { _id: 1, amount: 50, status: 'pending' },
      { _id: 2, amount: 150, status: 'paid' },
      { _id: 3, amount: 200, status: 'paid' },
      { _id: 4, amount: 75, status: 'pending' }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('$ Factory Function', function() {

    it('should create expression object', function() {
      const { $ } = MonSQLize;
      const expr = $("amount > 100");

      assert(expr !== null && typeof expr === 'object', 'Expression should be an object');
      assert.strictEqual(expr.__expr__, 'amount > 100', 'Expression string should match');
      assert.strictEqual(expr.__compiled__, false, 'Should not be compiled yet');
    });

    it('should throw error for non-string input', function() {
      const { $ } = MonSQLize;

      assert.throws(() => {
        $(123);
      }, TypeError, 'Should throw TypeError for number');
    });

    it('should throw error for empty string', function() {
      const { $ } = MonSQLize;

      assert.throws(() => {
        $('');
      }, Error, 'Should throw Error for empty string');
    });
  });

  describe('Expression Detection', function() {

    it('should detect expression in $match stage', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount > 100") }
      ]);

      assert(Array.isArray(result), 'Result should be an array');
      assert.strictEqual(result.length, 2, 'Should return 2 documents');

      const amounts = result.map(r => r.amount);
      assert(amounts.every(a => a > 100), 'All amounts should be > 100');
    });

    it('should work with old syntax (backward compatibility)', async function() {
      const result = await collection('test_orders').aggregate([
        { $match: { amount: { $gt: 100 } } }
      ]);

      assert(Array.isArray(result), 'Result should be an array');
      assert.strictEqual(result.length, 2, 'Should return 2 documents');
    });

    it('should allow mixing old and new syntax', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount > 100") },
        { $match: { status: 'paid' } }  // 旧语法
      ]);

      assert(Array.isArray(result), 'Result should be an array');
      assert.strictEqual(result.length, 2, 'Should return 2 documents');

      const allPaid = result.every(r => r.status === 'paid');
      assert(allPaid, 'All documents should have status=paid');
    });
  });

  describe('Basic Comparison Operators', function() {

    it('should compile > operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount > 100") }
      ]);

      assert.strictEqual(result.length, 2);
    });

    it('should compile >= operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount >= 150") }
      ]);

      // amount >= 150: 150, 200 共2个
      assert.strictEqual(result.length, 2);
      assert(result.every(r => r.amount >= 150), 'All amounts should be >= 150');
    });

    it('should compile <= operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount <= 75") }
      ]);

      // amount <= 75: 50, 75 共2个
      assert.strictEqual(result.length, 2);
      assert(result.every(r => r.amount <= 75), 'All amounts should be <= 75');
    });

    it('should compile < operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount < 100") }
      ]);

      assert.strictEqual(result.length, 2);
    });

    it('should compile === operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("status === 'paid'") }
      ]);

      assert.strictEqual(result.length, 2);
      assert(result.every(r => r.status === 'paid'));
    });

    it('should compile !== operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("status !== 'paid'") }
      ]);

      assert.strictEqual(result.length, 2);
      assert(result.every(r => r.status !== 'paid'));
    });
  });

  describe('Logical Operators', function() {

    it('should compile && (AND) operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount > 100 && status === 'paid'") }
      ]);

      // amount > 100 且 status === 'paid': id=2(150,paid), id=3(200,paid)
      assert.strictEqual(result.length, 2);
      assert(result.every(r => r.amount > 100 && r.status === 'paid'));
    });

    it('should compile || (OR) operator', async function() {
      const { $ } = MonSQLize;

      const result = await collection('test_orders').aggregate([
        { $match: $("amount > 150 || status === 'pending'") }
      ]);

      // amount > 150(id=3:200) 或 status === 'pending'(id=1:50, id=4:75)
      assert.strictEqual(result.length, 3);
    });
  });
});
