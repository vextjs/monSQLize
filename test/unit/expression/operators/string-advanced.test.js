/**
 * 字符串高级函数测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - String Advanced Functions', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_string_adv',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_texts').deleteMany({});
    await db.collection('test_texts').insertMany([
      { _id: 1, text: 'Hello World', tags: 'js,node,mongo', email: '  user@example.com  ' },
      { _id: 2, text: 'MongoDB Query', tags: 'mongo,database', email: 'admin@test.com' },
      { _id: 3, text: 'JavaScript ES6', tags: 'js,es6,modern', email: '  developer@company.org  ' }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('SPLIT Function', function() {

    it('should split string by delimiter', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            tagArray: expr("SPLIT(tags, ',')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert(Array.isArray(result[0].tagArray));
      assert.strictEqual(result[0].tagArray.length, 3);
      assert.strictEqual(result[0].tagArray[0], 'js');
      assert.strictEqual(result[0].tagArray[1], 'node');
    });
  });

  describe('REPLACE Function', function() {

    it('should replace substring', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            newText: expr("REPLACE(text, 'World', 'Universe')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].newText, 'Hello Universe');
      assert.strictEqual(result[1].newText, 'MongoDB Query');
    });
  });

  describe('INDEX_OF_STR Function', function() {

    it('should find substring index', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            index: expr("INDEX_OF_STR(text, 'o')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].index, 4);  // "Hello World" -> 'o' at index 4
      assert.strictEqual(result[1].index, 1);  // "MongoDB" -> 'o' at index 1
    });

    it('should return -1 if not found', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            index: expr("INDEX_OF_STR(text, 'xyz')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].index, -1);
    });
  });

  describe('LTRIM Function', function() {

    it('should trim left whitespace', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            trimmed: expr("LTRIM(email)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].trimmed, 'user@example.com  ');
      assert.strictEqual(result[1].trimmed, 'admin@test.com');
    });
  });

  describe('RTRIM Function', function() {

    it('should trim right whitespace', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            trimmed: expr("RTRIM(email)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].trimmed, '  user@example.com');
      assert.strictEqual(result[1].trimmed, 'admin@test.com');
    });
  });

  describe('SUBSTR_CP Function', function() {

    it('should extract substring with code points', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            sub: expr("SUBSTR_CP(text, 0, 5)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].sub, 'Hello');
      assert.strictEqual(result[1].sub, 'Mongo');
    });
  });

  describe('Combined String Advanced Operations', function() {

    it('should use multiple string functions together', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_texts').aggregate([
        {
          $project: {
            // Split tags, trim email, replace text
            tagCount: expr("SIZE(SPLIT(tags, ','))"),
            cleanEmail: expr("TRIM(email)"),
            hasWorld: expr("INDEX_OF_STR(text, 'World') >= 0")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].tagCount, 3);
      assert.strictEqual(result[0].cleanEmail, 'user@example.com');
      assert.strictEqual(result[0].hasWorld, true);
      assert.strictEqual(result[1].hasWorld, false);
    });
  });
});

