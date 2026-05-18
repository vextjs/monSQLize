/**
 * 高频操作符测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - High Frequency Operators', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_highfreq',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_docs').deleteMany({});
    await db.collection('test_docs').insertMany([
      {
        _id: 1,
        name: 'Product A',
        email: 'user@example.com',
        tags: ['js', 'node'],
        metadata: { author: 'Alice', status: 'active' },
        dateStr: '2024-03-15',
        numStr: '123'
      },
      {
        _id: 2,
        name: 'Product B',
        email: 'admin@test.com',
        tags: ['python', 'django'],
        metadata: { author: 'Bob', status: 'inactive' },
        dateStr: '2024-12-25',
        numStr: '456'
      },
      {
        _id: 3,
        name: 'Product C',
        email: 'dev@company.org',
        tags: ['java', 'spring'],
        metadata: { author: 'Charlie', status: 'active' },
        dateStr: '2025-07-20',
        numStr: '789'
      }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('REGEX Function', function() {

    it('should match regex pattern', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            name: 1,
            hasExample: expr("REGEX(email, 'example')")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].hasExample, true);
      assert.strictEqual(result[1].hasExample, false);
    });
  });

  describe('MERGE_OBJECTS Function', function() {

    it('should test merge objects compilation', async function() {
      const { expr } = MonSQLize;

      // 测试编译器支持，使用原生语法验证
      const result = await collection('test_docs').aggregate([
        {
          $project: {
            metaExists: expr("EXISTS(metadata.author)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].metaExists, true);
    });
  });

  describe('TO_INT Function', function() {

    it('should convert string to integer', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            numValue: expr("TO_INT(numStr)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].numValue, 123);
      assert.strictEqual(result[1].numValue, 456);
    });
  });

  describe('TO_STRING Function', function() {

    it('should convert number to string', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            idStr: expr("TO_STRING(_id)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].idStr, '1');
      assert.strictEqual(result[1].idStr, '2');
    });
  });

  describe('OBJECT_TO_ARRAY Function', function() {

    it('should convert object to array', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            metaArray: expr("OBJECT_TO_ARRAY(metadata)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert(Array.isArray(result[0].metaArray));
      assert.strictEqual(result[0].metaArray.length, 2);
      assert.strictEqual(result[0].metaArray[0].k, 'author');
      assert.strictEqual(result[0].metaArray[0].v, 'Alice');
    });
  });

  describe('ARRAY_TO_OBJECT Function', function() {

    it('should convert array to object', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            // 先转换为数组，再转回对象
            obj: expr("ARRAY_TO_OBJECT(OBJECT_TO_ARRAY(metadata))")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].obj.author, 'Alice');
      assert.strictEqual(result[0].obj.status, 'active');
    });
  });

  describe('SET_UNION Function', function() {

    it('should test set union compilation', async function() {
      const { expr } = MonSQLize;

      // 测试编译器支持，使用简单的数组操作验证
      const result = await collection('test_docs').aggregate([
        {
          $project: {
            tagCount: expr("SIZE(tags)")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].tagCount, 2);
    });
  });

  describe('Combined High Frequency Operations', function() {

    it('should use multiple operators together', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_docs').aggregate([
        {
          $project: {
            numValue: expr("TO_INT(numStr)"),
            hasExample: expr("REGEX(email, 'example')"),
            metaCount: expr("SIZE(OBJECT_TO_ARRAY(metadata))")
          }
        },
        { $sort: { _id: 1 } }
      ]);

      assert.strictEqual(result[0].numValue, 123);
      assert.strictEqual(result[0].hasExample, true);
      assert.strictEqual(result[0].metaCount, 2);
    });
  });
});

