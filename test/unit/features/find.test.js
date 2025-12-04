/**
 * find 方法完整测试套件
 * 测试所有查询模式、边界情况和错误处理
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('find 方法测试套件', function () {
    this.timeout(30000); // 设置超时时间为 30 秒

    let msq;
    let findCollection; // 改为 findCollection 避免冲突
    let nativeCollection; // 原生 MongoDB 集合对象
    const testData = [];

    // 准备测试数据
    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_find',
            config: { useMemoryServer: true },
            slowQueryMs: 1000,
            findLimit: 100
        });

        const conn = await msq.connect();
        findCollection = conn.collection; // 使用新的变量名

        // 获取原生 MongoDB 集合对象用于数据准备
        const db = msq._adapter.db;
        nativeCollection = db.collection('test_products');

        // 清空并插入测试数据
        await nativeCollection.deleteMany({});

        // 插入 100 条测试商品
        for (let i = 1; i <= 100; i++) {
            testData.push({
                productId: `PROD-${String(i).padStart(5, '0')}`,
                name: `商品 ${i}`,
                price: Math.floor(Math.random() * 10000) + 100,
                category: i % 3 === 0 ? 'electronics' : i % 3 === 1 ? 'books' : 'clothing',
                inStock: i % 4 !== 0,
                sales: Math.floor(Math.random() * 1000),
                rating: 3 + Math.random() * 2,
                tags: ['test', `group-${Math.floor(i / 20)}`],
                createdAt: new Date(Date.now() - i * 86400000), // 每天一条
                updatedAt: new Date()
            });
        }

        await nativeCollection.insertMany(testData);
        console.log('✅ 测试数据准备完成：100 条商品');

        // 创建测试所需的索引
        console.log('🔧 创建测试索引...');

        const indexes = [
            {
                spec: { category: 1, price: -1 },
                name: 'test_category_price_idx',
                description: '分类和价格索引'
            },
            {
                spec: { inStock: 1, sales: -1 },
                name: 'test_inStock_sales_idx',
                description: '库存和销量索引'
            },
            {
                spec: { createdAt: -1 },
                name: 'test_createdAt_idx',
                description: '创建时间索引'
            },
            {
                spec: { price: -1 },
                name: 'test_price_idx',
                description: '价格索引'
            }
        ];

        for (const indexDef of indexes) {
            try {
                // 检查索引是否已存在
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
                // 继续创建其他索引，不中断测试
            }
        }

        console.log('✅ 索引创建完成\n');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (msq && nativeCollection) {
            // 清理测试索引
            const indexNames = [
                'test_category_price_idx',
                'test_inStock_sales_idx',
                'test_createdAt_idx',
                'test_price_idx'
            ];

            console.log('🧹 删除测试索引...');
            for (const indexName of indexNames) {
                try {
                    await nativeCollection.dropIndex(indexName);
                    console.log(`✅ 删除索引: ${indexName}`);
                } catch (error) {
                    // 索引可能不存在，忽略错误
                    console.log(`⏭️  索引不存在或已删除: ${indexName}`);
                }
            }

            await nativeCollection.deleteMany({});
            await msq.close();
        }
        console.log('✅ 清理完成');
    });

    describe('1. 基础查询功能', function () {
        it('1.1 应该返回数组格式的结果', async function () {
            const result = await findCollection('test_products').find({}, {
                limit: 10
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该有数据');
            assert.ok(result.length <= 10, '数据量不应超过 limit');
        });

        it('1.2 应该正确应用查询条件', async function () {
            const result = await findCollection('test_products').find({ category: 'electronics' }, {
                limit: 50
            });

            assert.ok(result.length > 0, '应该返回数据');

            // 验证所有数据都符合查询条件
            result.forEach(item => {
                assert.equal(item.category, 'electronics', '所有数据都应该是 electronics 分类');
            });
        });

        it('1.3 应该正确应用排序', async function () {
            const result = await findCollection('test_products').find({}, {
                sort: { price: -1 },
                limit: 20
            });

            assert.ok(result.length > 0, '应该返回数据');

            // 验证降序排列
            for (let i = 1; i < result.length; i++) {
                assert.ok(
                    result[i - 1].price >= result[i].price,
                    '价格应该按降序排列'
                );
            }
        });

        it('1.4 应该正确应用字段投影', async function () {
            const result = await findCollection('test_products').find({}, {
                projection: { name: 1, price: 1 },
                limit: 5
            });

            assert.ok(result.length > 0, '应该返回数据');

            result.forEach(item => {
                assert.ok(item._id, '应该包含 _id 字段');
                assert.ok(item.name, '应该包含 name 字段');
                assert.ok(typeof item.price === 'number', '应该包含 price 字段');
                assert.equal(item.category, undefined, '不应该包含 category 字段');
                assert.equal(item.sales, undefined, '不应该包含 sales 字段');
            });
        });

        it('1.5 应该支持数组格式的投影', async function () {
            const result = await findCollection('test_products').find({}, {
                projection: ['name', 'price', 'category'],
                limit: 5
            });

            assert.ok(result.length > 0, '应该返回数据');

            result.forEach(item => {
                assert.ok(item._id, '应该包含 _id 字段');
                assert.ok(item.name, '应该包含 name 字段');
                assert.ok(typeof item.price === 'number', '应该包含 price 字段');
                assert.ok(item.category, '应该包含 category 字段');
                assert.equal(item.sales, undefined, '不应该包含 sales 字段');
            });
        });

        it('1.6 应该正确处理 limit 参数', async function () {
            const result = await findCollection('test_products').find({}, {
                limit: 15
            });

            assert.ok(result.length > 0, '应该返回数据');
            assert.ok(result.length <= 15, '返回数据量应该不超过 limit');
        });

        it('1.7 应该返回空数组当没有匹配数据时', async function () {
            const result = await findCollection('test_products').find({ category: 'nonexistent' }, {
                limit: 10
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.equal(result.length, 0, '应该返回空数组');
        });
    });

    describe('2. 复杂查询条件', function () {
        it('2.1 应该支持范围查询', async function () {
            const minPrice = 500;
            const maxPrice = 5000;

            const result = await findCollection('test_products').find({
                price: { $gte: minPrice, $lte: maxPrice }
            }, {
                limit: 50
            });

            assert.ok(result.length > 0, '应该返回数据');

            result.forEach(item => {
                assert.ok(item.price >= minPrice, '价格应该 >= 最小值');
                assert.ok(item.price <= maxPrice, '价格应该 <= 最大值');
            });
        });

        it('2.2 应该支持 $in 查询', async function () {
            const categories = ['electronics', 'books'];

            const result = await findCollection('test_products').find({
                category: { $in: categories }
            }, {
                limit: 50
            });

            assert.ok(result.length > 0, '应该返回数据');

            result.forEach(item => {
                assert.ok(
                    categories.includes(item.category),
                    '分类应该在指定列表中'
                );
            });
        });

        it('2.3 应该支持逻辑组合查询 ($and)', async function () {
            const result = await findCollection('test_products').find({
                $and: [
                    { inStock: true },
                    { price: { $gte: 1000 } },
                    { category: 'electronics' }
                ]
            }, {
                limit: 30
            });

            result.forEach(item => {
                assert.equal(item.inStock, true, '应该有库存');
                assert.ok(item.price >= 1000, '价格应该 >= 1000');
                assert.equal(item.category, 'electronics', '分类应该是 electronics');
            });
        });

        it('2.4 应该支持逻辑组合查询 ($or)', async function () {
            const result = await findCollection('test_products').find({
                $or: [
                    { category: 'electronics' },
                    { sales: { $gte: 800 } }
                ]
            }, {
                limit: 50
            });

            assert.ok(result.length > 0, '应该返回数据');

            result.forEach(item => {
                const matchCondition =
          item.category === 'electronics' || item.sales >= 800;
                assert.ok(matchCondition, '应该满足至少一个条件');
            });
        });

        it('2.5 应该支持数组字段查询', async function () {
            const result = await findCollection('test_products').find({
                tags: 'test'
            }, {
                limit: 20
            });

            assert.ok(result.length > 0, '应该返回数据');

            result.forEach(item => {
                assert.ok(Array.isArray(item.tags), 'tags 应该是数组');
                assert.ok(item.tags.includes('test'), 'tags 应该包含 test');
            });
        });
    });

    describe('3. 分页功能 (skip + limit)', function () {
        it('3.1 应该正确使用 skip 跳过记录', async function () {
            const page1 = await findCollection('test_products').find({}, {
                sort: { _id: 1 },
                limit: 10,
                skip: 0
            });

            const page2 = await findCollection('test_products').find({}, {
                sort: { _id: 1 },
                limit: 10,
                skip: 10
            });

            assert.equal(page1.length, 10, '第一页应该有 10 条数据');
            assert.equal(page2.length, 10, '第二页应该有 10 条数据');

            // 验证数据不重复
            const page1Ids = page1.map(item => String(item._id));
            const page2Ids = page2.map(item => String(item._id));
            const intersection = page1Ids.filter(id => page2Ids.includes(id));

            assert.equal(intersection.length, 0, '两页数据不应该有重复');
        });

        it('3.2 应该正确处理多页分页', async function () {
            const pageSize = 15;
            const pages = [];

            // 获取前 3 页
            for (let i = 0; i < 3; i++) {
                const page = await findCollection('test_products').find({}, {
                    sort: { createdAt: -1, _id: 1 },
                    limit: pageSize,
                    skip: i * pageSize
                });
                pages.push(page);
            }

            assert.equal(pages[0].length, pageSize, '第 1 页应该有数据');
            assert.equal(pages[1].length, pageSize, '第 2 页应该有数据');
            assert.ok(pages[2].length > 0, '第 3 页应该有数据');

            // 验证所有数据唯一
            const allIds = pages.flat().map(item => String(item._id));
            const uniqueIds = new Set(allIds);
            assert.equal(allIds.length, uniqueIds.size, '所有数据应该唯一');
        });
    });

    describe('4. 流式查询', function () {
        it('4.1 应该返回流对象', async function () {
            const stream = await findCollection('test_products').find({}, {
                sort: { createdAt: -1 },
                stream: true
            });

            assert.equal(typeof stream.on, 'function', '应该是流对象');
            assert.equal(typeof stream.pipe, 'function', '应该支持 pipe 方法');
        });

        it('4.2 应该正确流式读取数据', async function () {
            const stream = await findCollection('test_products').find({ inStock: true }, {
                sort: { sales: -1 },
                stream: true,
                batchSize: 20
            });

            let count = 0;
            const items = [];

            await new Promise((resolve, reject) => {
                stream.on('data', (item) => {
                    count++;
                    items.push(item);
                    assert.equal(item.inStock, true, '所有商品都应该有库存');
                });

                stream.on('end', () => {
                    assert.ok(count > 0, '应该读取到数据');
                    assert.equal(count, items.length, '计数应该匹配');
                    resolve();
                });

                stream.on('error', reject);
            });
        });

        it('4.3 应该正确处理流式查询的排序', async function () {
            const stream = await findCollection('test_products').find({}, {
                sort: { price: -1 },
                stream: true,
                limit: 50
            });

            const prices = [];

            await new Promise((resolve, reject) => {
                stream.on('data', (item) => {
                    prices.push(item.price);
                });

                stream.on('end', () => {
                    // 验证价格按降序排列
                    for (let i = 1; i < prices.length; i++) {
                        assert.ok(
                            prices[i - 1] >= prices[i],
                            '价格应该按降序排列'
                        );
                    }
                    resolve();
                });

                stream.on('error', reject);
            });
        });

        it('4.4 应该支持设置 batchSize', async function () {
            const stream = await findCollection('test_products').find({}, {
                stream: true,
                batchSize: 10,
                limit: 30
            });

            let count = 0;

            await new Promise((resolve, reject) => {
                stream.on('data', () => {
                    count++;
                });

                stream.on('end', () => {
                    assert.ok(count > 0, '应该读取到数据');
                    assert.ok(count <= 30, '数据量不应超过 limit');
                    resolve();
                });

                stream.on('error', reject);
            });
        });
    });

    describe('5. 索引和性能优化', function () {
        it('5.1 应该支持 explain 查看执行计划', async function () {
            const plan = await findCollection('test_products').find({ category: 'electronics' }, {
                sort: { price: -1 },
                limit: 10,
                explain: true
            });

            assert.ok(plan, '应该返回执行计划');
            assert.ok(plan.queryPlanner, '应该包含 queryPlanner');
        });

        it('5.2 应该支持 explain executionStats 模式', async function () {
            const plan = await findCollection('test_products').find({ inStock: true }, {
                sort: { sales: -1 },
                limit: 20,
                explain: 'executionStats'
            });

            assert.ok(plan.executionStats, '应该包含 executionStats');
            assert.ok(
                typeof plan.executionStats.executionTimeMillis === 'number',
                '应该包含执行时间'
            );
            assert.ok(
                typeof plan.executionStats.totalDocsExamined === 'number',
                '应该包含扫描文档数'
            );
        });

        it('5.3 应该支持 hint 指定索引', async function () {
            const result = await findCollection('test_products').find({ category: 'electronics' }, {
                sort: { price: -1 },
                hint: { category: 1, price: -1 },
                limit: 10
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该返回数据');
        });

        it('5.4 应该支持设置 maxTimeMS', async function () {
            const result = await findCollection('test_products').find({ category: 'books' }, {
                maxTimeMS: 5000,
                limit: 20
            });

            assert.ok(Array.isArray(result), '应该返回数组');
        });
    });

    describe('6. 缓存功能', function () {
        it('6.1 应该支持缓存查询结果', async function () {
            // 重置缓存统计,确保测试独立性
            msq.cache.resetStats();

            const query = { category: 'clothing' };
            const options = {
                sort: { price: 1 },
                limit: 10,
                cache: 60000  // 缓存 1 分钟
            };

            console.log('\n     📊 缓存测试开始...');

            // 首次查询（应该未命中缓存）
            console.log('     → 执行首次查询（应该未命中缓存）');
            const result1 = await findCollection('test_products').find(query, options);

            const statsAfterFirst = msq.cache.getStats();
            console.log(`     → 首次查询后: hits=${statsAfterFirst.hits}, misses=${statsAfterFirst.misses}, sets=${statsAfterFirst.sets}`);

            // 第二次查询（应该从缓存读取）
            console.log('     → 执行第二次查询（应该命中缓存）');
            const result2 = await findCollection('test_products').find(query, options);

            const statsAfterSecond = msq.cache.getStats();
            console.log(`     → 第二次查询后: hits=${statsAfterSecond.hits}, misses=${statsAfterSecond.misses}, hitRate=${(statsAfterSecond.hitRate * 100).toFixed(1)}%`);

            // ✅ 验证缓存命中：第二次查询应该增加缓存命中次数
            assert.ok(
                statsAfterSecond.hits > statsAfterFirst.hits,
                `应该有缓存命中（命中次数从 ${statsAfterFirst.hits} 增加到 ${statsAfterSecond.hits}）`
            );

            console.log(`     ✅ 缓存命中验证通过: 命中次数从 ${statsAfterFirst.hits} 增加到 ${statsAfterSecond.hits}`);

            // 验证结果一致性
            assert.equal(result1.length, result2.length, '两次查询结果数量应该相同');

            // 验证结果内容一致（比较第一条数据的 ID）
            if (result1.length > 0) {
                assert.equal(
                    String(result1[0]._id),
                    String(result2[0]._id),
                    '两次查询结果应该一致'
                );
            }

            console.log(`     ✅ 结果一致性验证通过: 两次查询返回 ${result1.length} 条相同数据`);
        });

        it('6.2 缓存应该区分不同的查询条件', async function () {
            // 重置缓存统计
            msq.cache.resetStats();

            console.log('\n     📊 测试缓存隔离性...');

            // 查询1：electronics
            console.log('     → 查询1: category=electronics');
            const result1 = await findCollection('test_products').find({ category: 'electronics' }, {
                limit: 5,
                cache: 60000
            });

            const statsAfter1 = msq.cache.getStats();
            console.log(`     → 查询1后: hits=${statsAfter1.hits}, misses=${statsAfter1.misses}, sets=${statsAfter1.sets}`);

            // 查询2：books（不同条件）
            console.log('     → 查询2: category=books');
            const result2 = await findCollection('test_products').find({ category: 'books' }, {
                limit: 5,
                cache: 60000
            });

            const statsAfter2 = msq.cache.getStats();
            console.log(`     → 查询2后: hits=${statsAfter2.hits}, misses=${statsAfter2.misses}, sets=${statsAfter2.sets}`);

            // 两个不同的查询应该返回不同的结果
            const categories1 = result1.map(item => item.category);
            const categories2 = result2.map(item => item.category);

            assert.ok(
                !categories1.every(c => c === 'books'),
                '第一个查询不应该返回 books'
            );
            assert.ok(
                categories2.every(c => c === 'books'),
                '第二个查询应该只返回 books'
            );

            // 验证两次查询都未命中缓存（因为是不同的查询）
            assert.equal(
                statsAfter2.sets,
                2,
                '应该设置了2个不同的缓存条目'
            );

            console.log(`     ✅ 缓存隔离验证通过: 两个不同查询各自创建了独立缓存（共 ${statsAfter2.sets} 个缓存条目）`);
        });
    });

    describe('7. 字符串排序 (collation)', function () {
        it('7.1 应该支持 collation 配置', async function () {
            const result = await findCollection('test_products').find({}, {
                sort: { name: 1 },
                collation: {
                    locale: 'zh',
                    strength: 2
                },
                limit: 10
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该返回数据');
        });
    });

    describe('8. 边界情况和错误处理', function () {
        it('8.1 应该处理空查询条件', async function () {
            const result = await findCollection('test_products').find({}, {
                limit: 10
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该返回数据');
        });

        it('8.2 应该处理 limit 为 0 的情况', async function () {
            const result = await findCollection('test_products').find({}, {
                limit: 0
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            // MongoDB limit: 0 表示不限制，但实际返回会受到服务器限制
        });

        it('8.3 应该处理非常大的 skip 值', async function () {
            const result = await findCollection('test_products').find({}, {
                sort: { _id: 1 },
                skip: 1000000,
                limit: 10
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.equal(result.length, 0, '应该返回空数组（超出数据范围）');
        });

        it('8.4 应该处理无效的投影配置', async function () {
            // MongoDB 允许空投影
            const result = await findCollection('test_products').find({}, {
                projection: {},
                limit: 5
            });

            assert.ok(Array.isArray(result), '应该返回数组');
        });

        it('8.5 应该处理复杂的嵌套查询', async function () {
            const result = await findCollection('test_products').find({
                $or: [
                    {
                        $and: [
                            { category: 'electronics' },
                            { price: { $gte: 1000 } }
                        ]
                    },
                    {
                        $and: [
                            { category: 'books' },
                            { sales: { $gte: 500 } }
                        ]
                    }
                ]
            }, {
                limit: 30
            });

            assert.ok(Array.isArray(result), '应该返回数组');
        });
    });

    describe('9. 多字段排序', function () {
        it('9.1 应该支持多字段复合排序', async function () {
            const result = await findCollection('test_products').find({}, {
                sort: {
                    category: 1,
                    price: -1,
                    _id: 1
                },
                limit: 30
            });

            assert.ok(result.length > 0, '应该返回数据');

            // 验证排序正确性
            for (let i = 1; i < result.length; i++) {
                const prev = result[i - 1];
                const curr = result[i];

                if (prev.category === curr.category) {
                    // 同分类下，价格应该降序
                    assert.ok(
                        prev.price >= curr.price,
                        '同分类下价格应该降序排列'
                    );
                } else {
                    // 不同分类，按字典序升序
                    assert.ok(
                        prev.category <= curr.category,
                        '分类应该按字典序升序'
                    );
                }
            }
        });
    });

    describe('9. 链式调用集成测试', function () {
        it('9.1 应该支持基础链式调用 (limit + skip)', async function () {
            const results = await findCollection('test_products')
                .find({ category: 'electronics' })
                .limit(5)
                .skip(2);

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length <= 5, '应该不超过 limit');
            results.forEach(item => {
                assert.equal(item.category, 'electronics', '应该符合查询条件');
            });
        });

        it('9.2 应该支持链式调用排序', async function () {
            const results = await findCollection('test_products')
                .find({ inStock: true })
                .sort({ price: -1 })
                .limit(10);

            assert.ok(results.length > 0, '应该返回数据');

            // 验证降序排列
            for (let i = 1; i < results.length; i++) {
                assert.ok(
                    results[i - 1].price >= results[i].price,
                    '价格应该按降序排列'
                );
            }
        });

        it('9.3 应该支持链式调用字段投影', async function () {
            const results = await findCollection('test_products')
                .find({ category: 'books' })
                .project({ name: 1, price: 1, category: 1 })
                .limit(5);

            assert.ok(results.length > 0, '应该返回数据');
            results.forEach(item => {
                assert.ok(item._id, '应该包含 _id');
                assert.ok(item.name, '应该包含 name');
                assert.ok(item.price, '应该包含 price');
                assert.ok(item.category, '应该包含 category');
                assert.equal(item.inStock, undefined, '不应该包含 inStock');
            });
        });

        it('9.4 应该支持复杂链式调用组合', async function () {
            const results = await findCollection('test_products')
                .find({ inStock: true })
                .sort({ rating: -1 })
                .skip(3)
                .limit(10)
                .project({ name: 1, price: 1, rating: 1 });

            assert.ok(results.length > 0, '应该返回数据');
            assert.ok(results.length <= 10, '应该不超过 limit');

            // 验证排序
            for (let i = 1; i < results.length; i++) {
                assert.ok(
                    results[i - 1].rating >= results[i].rating,
                    'rating 应该按降序排列'
                );
            }

            // 验证投影
            results.forEach(item => {
                assert.ok(item._id, '应该包含 _id');
                assert.ok(item.name, '应该包含 name');
                assert.equal(item.inStock, undefined, '不应该包含未投影的字段');
            });
        });

        it('9.5 链式调用应该与 options 参数结果一致', async function () {
            const query = { category: 'electronics' };
            const sortSpec = { price: -1 };
            const limitVal = 10;

            // 方式1：链式调用
            const results1 = await findCollection('test_products')
                .find(query)
                .sort(sortSpec)
                .limit(limitVal);

            // 方式2：options 参数
            const results2 = await findCollection('test_products').find(query, {
                sort: sortSpec,
                limit: limitVal
            });

            // 结果应该完全一致
            assert.equal(results1.length, results2.length, '返回数量应该一致');
            for (let i = 0; i < results1.length; i++) {
                assert.equal(results1[i]._id.toString(), results2[i]._id.toString(), 'ID 应该一致');
                assert.equal(results1[i].name, results2[i].name, 'name 应该一致');
                assert.equal(results1[i].price, results2[i].price, 'price 应该一致');
            }
        });

        it('9.6 链式调用应该支持 .toArray() 显式调用', async function () {
            const results = await findCollection('test_products')
                .find({ category: 'books' })
                .limit(5)
                .toArray();

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length <= 5, '应该不超过 limit');
        });
    });
});

