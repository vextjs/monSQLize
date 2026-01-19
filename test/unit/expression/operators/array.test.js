/**
 * 数组操作符测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Array Operators', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_array',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_docs').deleteMany({});
    await db.collection('test_docs').insertMany([
      { _id: 1, tags: ['js', 'node', 'mongo'], scores: [80, 90, 85], value: 5 },
      { _id: 2, tags: ['python', 'django'], scores: [70, 75], value: 10 },
      { _id: 3, tags: ['java', 'spring', 'mysql', 'redis'], scores: [95, 88, 92], value: 3 },
      { _id: 4, tags: [], scores: [60], value: 8 }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('SIZE Function', function() {

    it('should get array size', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            tagCount: expr("SIZE(tags)"),
            scoreCount: expr("SIZE(scores)")
          }
        }
      ]);

      assert.strictEqual(result[0].tagCount, 3);
      assert.strictEqual(result[1].tagCount, 2);
      assert.strictEqual(result[3].tagCount, 0);
    });
  });

  describe('IN Function', function() {

    it('should check if value in array', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $match: expr("IN('node', tags)")
        }
      ]);

      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0]._id, 1);
    });
  });

  describe('SLICE Function', function() {

    it('should slice array', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            firstTwo: expr("SLICE(tags, 2)")
          }
        }
      ]);

      assert.strictEqual(result[0].firstTwo.length, 2);
      assert.deepStrictEqual(result[0].firstTwo, ['js', 'node']);
    });
  });

  describe('FIRST Function', function() {

    it('should get first element', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            firstTag: expr("FIRST(tags)")
          }
        }
      ]);

      assert.strictEqual(result[0].firstTag, 'js');
      assert.strictEqual(result[1].firstTag, 'python');
    });
  });

  describe('LAST Function', function() {

    it('should get last element', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            lastTag: expr("LAST(tags)")
          }
        }
      ]);

      assert.strictEqual(result[0].lastTag, 'mongo');
      assert.strictEqual(result[1].lastTag, 'django');
    });
  });

  describe('Combined Array Operations', function() {

    it('should combine array functions', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            hasMultiple: expr("SIZE(tags) > 2 ? 'yes' : 'no'")
          }
        }
      ]);

      assert.strictEqual(result[0].hasMultiple, 'yes');  // 3 tags
      assert.strictEqual(result[1].hasMultiple, 'no');   // 2 tags
    });
  });

  describe('ARRAY_ELEM_AT Function', function() {

    it('should get element at specific index', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            secondTag: expr("ARRAY_ELEM_AT(tags, 1)")
          }
        }
      ]);

      assert.strictEqual(result[0].secondTag, 'node');    // ['js', 'node', 'mongo']
      assert.strictEqual(result[1].secondTag, 'django');  // ['python', 'django']
    });

    it('should get element with negative index (last element)', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            lastTag: expr("ARRAY_ELEM_AT(tags, -1)")
          }
        }
      ]);

      assert.strictEqual(result[0].lastTag, 'mongo');
      assert.strictEqual(result[1].lastTag, 'django');
    });
  });
});

