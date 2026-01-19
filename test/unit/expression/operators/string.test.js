/**
 * 字符串操作符测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - String Operators', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_string',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_users').deleteMany({});
    await db.collection('test_users').insertMany([
      { _id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      { _id: 2, firstName: 'Jane', lastName: 'Smith', email: 'JANE@EXAMPLE.COM' },
      { _id: 3, firstName: 'Bob', lastName: 'Johnson', email: '  bob@test.com  ' },
      { _id: 4, firstName: 'Alice', lastName: 'Williams', email: 'alice@demo.com' }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('CONCAT Function', function() {

    it('should concat two fields', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            fullName: expr("CONCAT(firstName, ' ', lastName)")
          }
        }
      ]);

      assert.strictEqual(result[0].fullName, 'John Doe');
      assert.strictEqual(result[1].fullName, 'Jane Smith');
    });

    it('should concat multiple strings', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            info: expr("CONCAT(firstName, ' ', lastName, ' <', email, '>')")
          }
        }
      ]);

      assert.strictEqual(result[0].info, 'John Doe <john@example.com>');
    });
  });

  describe('UPPER Function', function() {

    it('should convert to uppercase', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            firstName: 1,
            upperFirst: expr("UPPER(firstName)")
          }
        }
      ]);

      assert.strictEqual(result[0].upperFirst, 'JOHN');
      assert.strictEqual(result[1].upperFirst, 'JANE');
    });
  });

  describe('LOWER Function', function() {

    it('should convert to lowercase', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            email: 1,
            lowerEmail: expr("LOWER(email)")
          }
        }
      ]);

      assert.strictEqual(result[1].lowerEmail, 'jane@example.com');
    });
  });

  describe('TRIM Function', function() {

    it('should trim whitespace', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            email: 1,
            trimmedEmail: expr("TRIM(email)")
          }
        }
      ]);

      const bob = result.find(r => r._id === 3);
      assert.strictEqual(bob.trimmedEmail, 'bob@test.com');
    });
  });

  describe('SUBSTR Function', function() {

    it('should extract substring', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            firstName: 1,
            firstThree: expr("SUBSTR(firstName, 0, 3)")
          }
        }
      ]);

      assert.strictEqual(result[0].firstThree, 'Joh');
      assert.strictEqual(result[1].firstThree, 'Jan');
    });
  });

  describe('LENGTH Function', function() {

    it('should get string length', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            firstName: 1,
            nameLength: expr("LENGTH(firstName)")
          }
        }
      ]);

      assert.strictEqual(result[0].nameLength, 4);  // John
      assert.strictEqual(result[1].nameLength, 4);  // Jane
      assert.strictEqual(result[2].nameLength, 3);  // Bob
    });
  });

  describe('Combined String Operations', function() {

    it('should combine multiple string operations', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            normalized: expr("UPPER(TRIM(email))")
          }
        }
      ]);

      const bob = result.find(r => r._id === 3);
      assert.strictEqual(bob.normalized, 'BOB@TEST.COM');
    });

    it('should use string functions with conditionals', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_users').aggregate([
        {
          $project: {
            firstName: 1,
            category: expr("LENGTH(firstName) > 3 ? 'long' : 'short'")
          }
        }
      ]);

      assert.strictEqual(result[0].category, 'long');   // John (4)
      assert.strictEqual(result[2].category, 'short');  // Bob (3)
    });
  });
});

