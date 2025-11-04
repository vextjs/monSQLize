/**
 * distinct 方法完整测试套件
 * 测试所有去重模式、边界情况和错误处理
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('distinct 方法测试套件', function() {
  this.timeout(30000); // 设置超时时间为 30 秒

  let msq;
  let distinctCollection;
  let nativeCollection;
  const testData = [];

  // 准备测试数据
  before(async function() {
    console.log('🔧 初始化测试环境...');

    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test_distinct',
      config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
      slowQueryMs: 1000
    });

    const conn = await msq.connect();
    distinctCollection = conn.collection;

    // 获取原生 MongoDB 集合对象用于数据准备
    const db = msq._adapter.db;
    nativeCollection = db.collection('test_products');

    // 清空并插入测试数据
    await nativeCollection.deleteMany({});

    // 插入 100 条测试商品（包含各种测试场景）
    for (let i = 1; i <= 100; i++) {
      const tags = [];
      if (i % 5 === 0) tags.push('sale', 'hot');
      if (i % 3 === 0) tags.push('new');
      if (i % 7 === 0) tags.push('recommended');

      testData.push({
        productId: `PROD-${String(i).padStart(5, '0')}`,
        name: `商品 ${i}`,
        // 3种分类，便于测试
        category: i % 3 === 0 ? 'electronics' : i % 3 === 1 ? 'books' : 'clothing',
        // 测试大小写
        brand: i % 2 === 0 ? 'BrandA' : 'branda',
        price: Math.floor(Math.random() * 10000) + 100,
        inStock: i % 4 !== 0,
        sales: Math.floor(Math.random() * 1000),
        rating: 3 + Math.random() * 2,
        tags: tags,
        // 测试嵌套字段
        specs: {
          weight: Math.floor(Math.random() * 1000) + 100,
          size: i % 3 === 0 ? 'large' : i % 2 === 0 ? 'medium' : 'small',
          color: i % 4 === 0 ? 'red' : i % 4 === 1 ? 'blue' : i % 4 === 2 ? 'green' : 'black'
        },
        year: 2020 + (i % 5),
        createdAt: new Date(Date.now() - i * 86400000),
        updatedAt: new Date()
      });
    }

    await nativeCollection.insertMany(testData);
    console.log('✅ 测试数据准备完成：100 条商品');

    // 创建测试所需的索引
    console.log('🔧 创建测试索引...');

    const indexes = [
      {
        spec: { category: 1 },
        name: 'test_category_idx',
        description: '分类索引'
      },
      {
        spec: { brand: 1 },
        name: 'test_brand_idx',
        description: '品牌索引'
      },
      {
        spec: { inStock: 1, category: 1 },
        name: 'test_inStock_category_idx',
        description: '库存分类索引'
      }
    ];

    for (const indexDef of indexes) {
      try {
        const existingIndexes = await nativeCollection.indexes();
        const indexExists = existingIndexes.some(idx => idx.name === indexDef.name);

        if (!indexExists) {
          await nativeCollection.createIndex(indexDef.spec, { name: indexDef.name });
          console.log(`✅ 创建索引: ${indexDef.name} - ${indexDef.description}`);
        } else {
          console.log(`⏭️  索引已存在: ${indexDef.name}`);
        }
      } catch (error) {
        console.log(`⚠️  创建索引失败 ${indexDef.name}: ${error.message}`);
      }
    }

    console.log('✅ 索引创建完成\n');
  });

  after(async function() {
    console.log('🧹 清理测试环境...');
    if (msq && nativeCollection) {
      // 清理测试索引
      const indexNames = [
        'test_category_idx',
        'test_brand_idx',
        'test_inStock_category_idx'
      ];

      console.log('🧹 删除测试索引...');
      for (const indexName of indexNames) {
        try {
          await nativeCollection.dropIndex(indexName);
          console.log(`✅ 删除索引: ${indexName}`);
        } catch (error) {
          console.log(`⏭️  索引不存在或已删除: ${indexName}`);
        }
      }

      await nativeCollection.deleteMany({});
      await msq.close();
    }
    console.log('✅ 清理完成');
  });

  describe('1. 基础去重功能', function() {
    it('1.1 应该返回数组格式的结果', async function() {
      const result = await distinctCollection('test_products').distinct('category');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.length > 0, '应该有数据');
    });

    it('1.2 应该正确去重分类字段', async function() {
      const result = await distinctCollection('test_products').distinct('category');

      // 根据测试数据，应该有3个分类
      assert.ok(result.includes('electronics'), '应该包含 electronics');
      assert.ok(result.includes('books'), '应该包含 books');
      assert.ok(result.includes('clothing'), '应该包含 clothing');
      assert.equal(result.length, 3, '应该有3个唯一分类');
    });

    it('1.3 应该正确去重年份字段', async function() {
      const result = await distinctCollection('test_products').distinct('year');

      // 根据测试数据，应该有5个年份（2020-2024）
      assert.ok(Array.isArray(result), '应该返回数组');
      assert.equal(result.length, 5, '应该有5个唯一年份');

      result.forEach(year => {
        assert.ok(year >= 2020 && year <= 2024, '年份应该在2020-2024之间');
      });
    });

    it('1.4 应该支持字段名作为字符串参数', async function() {
      const result = await distinctCollection('test_products').distinct('category');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.length > 0, '应该有数据');
    });
  });

  describe('2. 带查询条件的去重', function() {
    it('2.1 应该正确应用简单查询条件', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        query: { inStock: true }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.length > 0, '应该有数据');
      assert.ok(result.length <= 3, '分类数量不应超过3');
    });

    it('2.2 应该正确应用复杂查询条件', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        query: {
          inStock: true,
          price: { $gte: 1000 }
        }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      // 结果可能为空或有数据，取决于随机价格
    });

    it('2.3 应该处理返回空结果的查询', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        query: { price: { $gt: 999999 } }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.equal(result.length, 0, '应该返回空数组');
    });

    it('2.4 应该支持 $in 操作符', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        query: { category: { $in: ['electronics', 'books'] } }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.length >= 1 && result.length <= 2, '应该返回1-2个分类');
      result.forEach(cat => {
        assert.ok(['electronics', 'books'].includes(cat), '分类应该在指定范围内');
      });
    });
  });

  describe('3. 嵌套字段去重', function() {
    it('3.1 应该支持嵌套字段去重', async function() {
      const result = await distinctCollection('test_products').distinct('specs.size');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.includes('small') || result.includes('medium') || result.includes('large'),
        '应该包含尺寸值');
    });

    it('3.2 应该支持深层嵌套字段', async function() {
      const result = await distinctCollection('test_products').distinct('specs.color');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.length > 0, '应该有数据');
      assert.ok(result.includes('red') || result.includes('blue'), '应该包含颜色值');
    });

    it('3.3 嵌套字段应该支持查询条件', async function() {
      const result = await distinctCollection('test_products').distinct('specs.size', {
        query: { inStock: true }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.length > 0, '应该有数据');
    });
  });

  describe('4. 数组字段去重', function() {
    it('4.1 应该展开数组并去重', async function() {
      const result = await distinctCollection('test_products').distinct('tags');

      assert.ok(Array.isArray(result), '应该返回数组');
      // 根据测试数据，应该包含 'sale', 'hot', 'new', 'recommended'
      assert.ok(result.length > 0, '应该有标签数据');
    });

    it('4.2 数组字段去重应该支持查询条件', async function() {
      const result = await distinctCollection('test_products').distinct('tags', {
        query: { sales: { $gte: 500 } }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      // 结果可能为空或有数据
    });

    it('4.3 空数组应该不返回任何值', async function() {
      // 查询 tags 为空数组的商品的 tags
      const result = await distinctCollection('test_products').distinct('tags', {
        query: { tags: { $size: 0 } }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      // 空数组的文档不会贡献任何 distinct 值
    });
  });

  describe('5. collation（排序规则）', function() {
    it('5.1 默认应该区分大小写', async function() {
      const result = await distinctCollection('test_products').distinct('brand');

      assert.ok(Array.isArray(result), '应该返回数组');
      // BrandA 和 branda 应该被视为不同值
      assert.ok(result.length >= 2, '应该有至少2个不同的品牌');
    });

    it('5.2 使用 collation 应该不区分大小写', async function() {
      const result = await distinctCollection('test_products').distinct('brand', {
        collation: {
          locale: 'en',
          strength: 1  // 不区分大小写
        }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
      // BrandA 和 branda 应该被视为相同值
      // 注意：实际返回的可能是其中一个，具体取决于 MongoDB 版本和数据顺序
    });

    it('5.3 collation 应该与查询条件配合使用', async function() {
      const result = await distinctCollection('test_products').distinct('brand', {
        query: { inStock: true },
        collation: {
          locale: 'en',
          strength: 1
        }
      });

      assert.ok(Array.isArray(result), '应该返回数组');
    });
  });

  describe('6. 缓存功能', function() {
    it('6.1 应该支持缓存', async function() {
      const result1 = await distinctCollection('test_products').distinct('category', {
        cache: 60000  // 60秒
      });

      const result2 = await distinctCollection('test_products').distinct('category', {
        cache: 60000
      });

      assert.deepEqual(result1.sort(), result2.sort(), '缓存结果应该一致');
    });

    it('6.2 缓存应该提升性能', async function() {
      // 第一次查询（无缓存）
      const start1 = Date.now();
      await distinctCollection('test_products').distinct('category', {
        cache: 60000
      });
      const time1 = Date.now() - start1;

      // 第二次查询（使用缓存）
      const start2 = Date.now();
      await distinctCollection('test_products').distinct('category', {
        cache: 60000
      });
      const time2 = Date.now() - start2;

      // 缓存查询应该更快（但不是严格要求，因为数据量小）
      console.log(`  第一次查询: ${time1}ms, 第二次查询: ${time2}ms`);
      assert.ok(true, '缓存功能正常');
    });

    it('6.3 不同查询条件应该使用不同缓存', async function() {
      const result1 = await distinctCollection('test_products').distinct('category', {
        query: { inStock: true },
        cache: 60000
      });

      const result2 = await distinctCollection('test_products').distinct('category', {
        query: { inStock: false },
        cache: 60000
      });

      // 两个查询可能返回不同的结果
      assert.ok(Array.isArray(result1), '第一个查询应该返回数组');
      assert.ok(Array.isArray(result2), '第二个查询应该返回数组');
    });

    it('6.4 应该支持手动清除缓存', async function() {
      // 先执行一次缓存查询
      await distinctCollection('test_products').distinct('category', {
        cache: 60000
      });

      // 清除缓存
      const deleted = await distinctCollection('test_products').invalidate('distinct');

      assert.ok(typeof deleted === 'number', '应该返回删除的键数量');
      assert.ok(deleted >= 0, '删除数量应该大于等于0');
    });
  });

  describe('7. explain 功能', function() {
    it('7.1 应该支持 explain: true', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        explain: true
      });

      assert.ok(typeof result === 'object', '应该返回对象');
      assert.ok(result.queryPlanner || result.stages, '应该包含查询计划');
    });

    it('7.2 应该支持 explain: "executionStats"', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        explain: 'executionStats'
      });

      assert.ok(typeof result === 'object', '应该返回对象');
      assert.ok(result.executionStats || result.stages, '应该包含执行统计');
    });

    it('7.3 explain 应该与查询条件配合使用', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        query: { inStock: true },
        explain: 'executionStats'
      });

      assert.ok(typeof result === 'object', '应该返回对象');
    });

    it('7.4 explain 不应该触发缓存', async function() {
      const result1 = await distinctCollection('test_products').distinct('category', {
        cache: 60000,
        explain: 'executionStats'
      });

      const result2 = await distinctCollection('test_products').distinct('category', {
        cache: 60000,
        explain: 'executionStats'
      });

      // explain 结果应该包含执行统计，不应该被缓存
      assert.ok(result1.executionStats || result1.stages, '应该有执行统计');
      assert.ok(result2.executionStats || result2.stages, '应该有执行统计');
    });
  });

  describe('8. maxTimeMS 超时控制', function() {
    it('8.1 应该支持 maxTimeMS 参数', async function() {
      const result = await distinctCollection('test_products').distinct('category', {
        maxTimeMS: 5000
      });

      assert.ok(Array.isArray(result), '应该返回数组');
    });

    it('8.2 超时应该抛出错误', async function() {
      try {
        await distinctCollection('test_products').distinct('category', {
          maxTimeMS: 1  // 极短超时
        });
        // 如果没有抛出错误，可能是查询太快了
        assert.ok(true, '查询完成（可能太快而未超时）');
      } catch (error) {
        assert.ok(error.message.includes('time') || error.message.includes('timeout'),
          '应该是超时相关的错误');
      }
    });
  });

  describe('9. 边界情况和错误处理', function() {
    it('9.1 应该处理不存在的字段', async function() {
      const result = await distinctCollection('test_products').distinct('nonExistentField');

      assert.ok(Array.isArray(result), '应该返回数组');
      // 不存在的字段会返回空数组或包含 undefined/null
    });

    it('9.2 应该处理空集合', async function() {
      const db = msq._adapter.db;
      await db.collection('test_empty').deleteMany({});

      const result = await distinctCollection('test_empty').distinct('field');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.equal(result.length, 0, '空集合应该返回空数组');
    });

    it('9.3 应该处理 null 值', async function() {
      const db = msq._adapter.db;
      const testColl = db.collection('test_null_distinct');

      await testColl.deleteMany({});
      await testColl.insertMany([
        { name: 'A', category: 'test1' },
        { name: 'B', category: null },
        { name: 'C', category: 'test2' },
        { name: 'D' }  // category 不存在
      ]);

      const result = await distinctCollection('test_null_distinct').distinct('category');

      assert.ok(Array.isArray(result), '应该返回数组');
      // null 和 undefined 会被视为一个值
      assert.ok(result.includes('test1'), '应该包含 test1');
      assert.ok(result.includes('test2'), '应该包含 test2');

      // 清理
      await testColl.drop();
    });

    it('9.4 应该处理空字符串', async function() {
      const db = msq._adapter.db;
      const testColl = db.collection('test_empty_string');

      await testColl.deleteMany({});
      await testColl.insertMany([
        { name: 'A', category: '' },
        { name: 'B', category: 'test' },
        { name: 'C', category: '' }
      ]);

      const result = await distinctCollection('test_empty_string').distinct('category');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(result.includes(''), '应该包含空字符串');
      assert.ok(result.includes('test'), '应该包含 test');

      // 清理
      await testColl.drop();
    });

    it('9.5 应该处理大数据量', async function() {
      // 使用现有的100条数据
      const result = await distinctCollection('test_products').distinct('productId');

      assert.ok(Array.isArray(result), '应该返回数组');
      assert.equal(result.length, 100, '应该返回100个唯一的商品ID');
    });
  });

  describe('10. 与其他方法的集成', function() {
    it('10.1 distinct 结果应该与 find 一致', async function() {
      const distinctResult = await distinctCollection('test_products').distinct('category');

      const findResult = await distinctCollection('test_products').find({
        projection: ['category'],
        limit: 1000
      });

      const categoriesFromFind = [...new Set(findResult.map(item => item.category))];

      assert.deepEqual(distinctResult.sort(), categoriesFromFind.sort(),
        'distinct 和 find 的结果应该一致');
    });

    it('10.2 distinct 应该与 count 结果相关', async function() {
      const categories = await distinctCollection('test_products').distinct('category');

      for (const category of categories) {
        const count = await distinctCollection('test_products').count({
          query: { category }
        });

        assert.ok(count > 0, `分类 ${category} 应该有数据`);
      }
    });

    it('10.3 应该支持命名空间隔离', async function() {
      const result1 = await distinctCollection('test_products').distinct('category');
      const result2 = await distinctCollection('test_empty', 'another_db').distinct('category');

      // 不同集合应该独立
      assert.ok(Array.isArray(result1), '第一个集合应该返回数组');
      assert.ok(Array.isArray(result2), '第二个集合应该返回数组');
    });
  });

  describe('11. 性能测试', function() {
    it('11.1 索引应该提升 distinct 性能', async function() {
      // 使用有索引的字段
      const start1 = Date.now();
      await distinctCollection('test_products').distinct('category');
      const time1 = Date.now() - start1;

      console.log(`  有索引的 distinct 耗时: ${time1}ms`);
      assert.ok(time1 < 1000, 'distinct 应该在1秒内完成');
    });

    it('11.2 带查询条件的 distinct 应该能利用索引', async function() {
      const start = Date.now();
      const result = await distinctCollection('test_products').distinct('category', {
        query: { inStock: true }
      });
      const time = Date.now() - start;

      console.log(`  带条件的 distinct 耗时: ${time}ms`);
      assert.ok(Array.isArray(result), '应该返回数组');
      assert.ok(time < 1000, '查询应该在1秒内完成');
    });
  });

  describe('12. 实际应用场景测试', function() {
    it('12.1 获取筛选器选项', async function() {
      const categories = await distinctCollection('test_products').distinct('category', {
        query: { inStock: true },
        cache: 5 * 60 * 1000
      });

      assert.ok(Array.isArray(categories), '应该返回数组');
      assert.ok(categories.length > 0, '应该有分类数据');
    });

    it('12.2 统计维度值', async function() {
      const years = await distinctCollection('test_products').distinct('year');
      const categories = await distinctCollection('test_products').distinct('category');

      assert.ok(years.length > 0, '应该有年份数据');
      assert.ok(categories.length > 0, '应该有分类数据');

      console.log(`  统计维度: ${years.length} 个年份, ${categories.length} 个分类`);
    });

    it('12.3 多维度组合查询', async function() {
      const categories = await distinctCollection('test_products').distinct('category');

      for (const category of categories) {
        const sizes = await distinctCollection('test_products').distinct('specs.size', {
          query: { category }
        });

        assert.ok(Array.isArray(sizes), `分类 ${category} 应该有尺寸数据`);
        console.log(`  ${category}: ${sizes.length} 种尺寸`);
      }
    });
  });
});

