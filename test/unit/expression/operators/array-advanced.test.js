/**
 * 数组高级函数测试
 */

const MonSQLize = require('../../../../lib');
const assert = require('assert');

describe('Expression - Array Advanced Functions', function() {
  this.timeout(30000);

  let msq;
  let collection;
  let db;

  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_expression_array_advanced',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
    db = msq._adapter.db;

    // 准备测试数据
    await db.collection('test_products').deleteMany({});
    await db.collection('test_products').insertMany([
      {
        _id: 1,
        name: 'Product A',
        tags: [
          { name: 'featured', active: true, score: 8 },
          { name: 'new', active: true, score: 9 },
          { name: 'sale', active: false, score: 5 }
        ],
        categories: ['electronics', 'gadgets']
      },
      {
        _id: 2,
        name: 'Product B',
        tags: [
          { name: 'popular', active: true, score: 7 },
          { name: 'featured', active: false, score: 4 }
        ],
        categories: ['home', 'kitchen']
      },
      {
        _id: 3,
        name: 'Product C',
        tags: [
          { name: 'new', active: true, score: 10 },
          { name: 'trending', active: true, score: 6 }
        ],
        categories: ['fashion']
      }
    ]);

    console.log('✅ 测试数据准备完成');
  });

  after(async function() {
    if (msq) {
      await msq.close();
    }
  });

  describe('FILTER Function', function() {

    it('should filter array elements by condition', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            activeTags: expr("FILTER(tags, tag, tag.active === true)")
          }
        }
      ]);

      assert.strictEqual(result[0].activeTags.length, 2);
      assert.strictEqual(result[1].activeTags.length, 1);
    });

    it('should filter by score threshold', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            highScoreTags: expr("FILTER(tags, tag, tag.score > 7)")
          }
        }
      ]);

      assert.strictEqual(result[0].highScoreTags.length, 2); // score 8, 9
      assert.strictEqual(result[2].highScoreTags.length, 1); // score 10
    });
  });

  describe('MAP Function', function() {

    it('should map array elements', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            tagNames: expr("MAP(tags, tag, tag.name)")
          }
        }
      ]);

      assert.deepStrictEqual(result[0].tagNames, ['featured', 'new', 'sale']);
      assert.deepStrictEqual(result[1].tagNames, ['popular', 'featured']);
    });

    it('should map with transformation', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            upperTags: expr("MAP(tags, tag, UPPER(tag.name))")
          }
        }
      ]);

      assert.deepStrictEqual(result[0].upperTags, ['FEATURED', 'NEW', 'SALE']);
    });
  });

  describe('INDEX_OF Function', function() {

    it('should find element index in array', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            gadgetIndex: expr("INDEX_OF(categories, 'gadgets')")
          }
        }
      ]);

      assert.strictEqual(result[0].gadgetIndex, 1);
      assert.strictEqual(result[1].gadgetIndex, -1); // not found
    });
  });

  describe('CONCAT_ARRAYS Function', function() {

    it('should concatenate arrays', async function() {
      const { expr } = MonSQLize;

      // 添加额外字段用于测试
      await db.collection('test_products').updateMany(
        {},
        { $set: { extraCategories: ['special'] } }
      );

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            allCategories: expr("CONCAT_ARRAYS(categories, extraCategories)")
          }
        }
      ]);

      assert.strictEqual(result[0].allCategories.length, 3); // 2 + 1
      assert(result[0].allCategories.includes('special'));
    });
  });

  describe('Combined Advanced Array Operations', function() {

    it('should combine FILTER and MAP', async function() {
      const { expr } = MonSQLize;

      const result = await collection('test_products').aggregate([
        {
          $project: {
            name: 1,
            activeTagNames: expr("MAP(FILTER(tags, tag, tag.active === true), tag, tag.name)")
          }
        }
      ]);

      assert.deepStrictEqual(result[0].activeTagNames, ['featured', 'new']);
    });

    // TODO: 支持深度嵌套的函数调用 SIZE(FILTER(...))
    // it('should use array functions in conditions', async function() {...});
  });
});

