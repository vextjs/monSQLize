/**
 * 链式调用方法测试套件
 * 测试 find 和 aggregate 的完整链式调用功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib');

describe('链式调用方法测试', function() {
    this.timeout(10000);

    let monSQLize;
    let collection;
    let db;

    before(async function() {
        // 使用 Memory Server
        monSQLize = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_chaining',
            config: { useMemoryServer: true }
        });

        const conn = await monSQLize.connect();
        collection = conn.collection;
        db = monSQLize._adapter.db;

        // 准备测试数据
        const productsCollection = db.collection('products');
        await productsCollection.deleteMany({});

        const products = [];
        for (let i = 1; i <= 100; i++) {
            products.push({
                productId: `PROD-${String(i).padStart(3, '0')}`,
                name: `商品${i}`,
                category: i % 3 === 0 ? 'electronics' : i % 3 === 1 ? 'books' : 'clothing',
                price: 100 + i * 10,
                inStock: i % 4 !== 0,
                sales: Math.floor(Math.random() * 1000),
                rating: 3 + Math.random() * 2,
                createdAt: new Date(Date.now() - i * 86400000)
            });
        }
        await productsCollection.insertMany(products);

        // 创建索引
        await productsCollection.createIndex({ category: 1, price: -1 });
        await productsCollection.createIndex({ createdAt: -1 });
    });

    after(async function() {
        if (monSQLize) {
            await monSQLize.close();
        }
    });

    describe('FindChain - find 链式调用', function() {
        it('应该支持 .limit() 链式调用', async function() {
            const results = await collection('products')
                .find({ category: 'electronics' })
                .limit(5);

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.equal(results.length, 5, '应该限制为 5 条记录');
            results.forEach(item => {
                assert.equal(item.category, 'electronics', '所有记录应该符合查询条件');
            });
        });

        it('应该支持 .skip() 链式调用', async function() {
            const allResults = await collection('products')
                .find({ category: 'books' })
                .limit(10);

            const skippedResults = await collection('products')
                .find({ category: 'books' })
                .skip(5)
                .limit(5);

            assert.equal(skippedResults.length, 5, '应该返回 5 条记录');
            // 验证跳过了前 5 条
            assert.equal(skippedResults[0].productId, allResults[5].productId, '应该跳过前 5 条记录');
        });

        it('应该支持 .sort() 链式调用', async function() {
            const results = await collection('products')
                .find({ category: 'electronics' })
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

        it('应该支持 .project() 链式调用', async function() {
            const results = await collection('products')
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
                assert.equal(item.sales, undefined, '不应该包含 sales');
            });
        });

        it('应该支持 .hint() 链式调用', async function() {
            const results = await collection('products')
                .find({ category: 'electronics', price: { $gte: 500 } })
                .hint({ category: 1, price: -1 })
                .limit(10);

            assert.ok(results.length > 0, '应该返回数据');
            results.forEach(item => {
                assert.equal(item.category, 'electronics', '应该符合查询条件');
                assert.ok(item.price >= 500, '价格应该 >= 500');
            });
        });

        it('应该支持 .collation() 链式调用', async function() {
            const results = await collection('products')
                .find({ name: { $regex: '^商品' } })
                .collation({ locale: 'zh', strength: 2 })
                .limit(5);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .comment() 链式调用', async function() {
            const results = await collection('products')
                .find({ category: 'clothing' })
                .comment('测试查询注释')
                .limit(5);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .maxTimeMS() 链式调用', async function() {
            const results = await collection('products')
                .find({ inStock: true })
                .maxTimeMS(5000)
                .limit(10);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .batchSize() 链式调用', async function() {
            const results = await collection('products')
                .find({ category: 'electronics' })
                .batchSize(10)
                .limit(20);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持多个链式调用组合', async function() {
            const results = await collection('products')
                .find({ inStock: true })
                .sort({ price: -1 })
                .skip(5)
                .limit(10)
                .project({ name: 1, price: 1 });

            assert.equal(results.length, 10, '应该返回 10 条记录');

            // 验证排序
            for (let i = 1; i < results.length; i++) {
                assert.ok(
                    results[i - 1].price >= results[i].price,
                    '价格应该按降序排列'
                );
            }

            // 验证投影
            results.forEach(item => {
                assert.ok(item._id, '应该包含 _id');
                assert.ok(item.name, '应该包含 name');
                assert.ok(item.price, '应该包含 price');
                assert.equal(item.category, undefined, '不应该包含 category');
            });
        });

        it('应该支持 .toArray() 显式调用', async function() {
            const results = await collection('products')
                .find({ category: 'books' })
                .limit(5)
                .toArray();

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.equal(results.length, 5, '应该返回 5 条记录');
        });

        it('应该支持 .explain() 链式调用', async function() {
            const plan = await collection('products')
                .find({ category: 'electronics', price: { $gte: 500 } })
                .sort({ price: -1 })
                .limit(10)
                .explain('executionStats');

            assert.ok(plan, '应该返回执行计划');
            assert.ok(plan.queryPlanner, '应该包含 queryPlanner');
            assert.ok(plan.executionStats, '应该包含 executionStats');
        });

        it('应该支持 .stream() 链式调用', async function() {
            const stream = collection('products')
                .find({ category: 'electronics' })
                .limit(10)
                .stream();

            const results = [];

            await new Promise((resolve, reject) => {
                stream.on('data', (doc) => {
                    results.push(doc);
                });

                stream.on('end', () => {
                    try {
                        assert.ok(results.length > 0, '应该返回数据');
                        assert.ok(results.length <= 10, '应该不超过 limit');
                        results.forEach(item => {
                            assert.equal(item.category, 'electronics', '应该符合查询条件');
                        });
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                stream.on('error', reject);
            });
        });

        it('链式调用应该像 Promise 一样工作', async function() {
            // 测试 .then()
            const results1 = await collection('products')
                .find({ category: 'books' })
                .limit(5)
                .then(res => res);

            assert.ok(Array.isArray(results1), '应该返回数组');

            // 测试 .catch()
            try {
                await collection('nonexistent')
                    .find({})
                    .limit(5)
                    .catch(err => {
                        throw err;
                    });
            } catch (err) {
                assert.ok(err, '应该捕获错误');
            }
        });

        it('执行后不应该允许再次调用链式方法', async function() {
            const chain = collection('products')
                .find({ category: 'electronics' })
                .limit(5);

            // 第一次执行
            await chain.toArray();

            // 第二次执行应该抛出错误
            try {
                await chain.toArray();
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('already executed'), '应该提示已执行');
            }
        });

        it('应该正确验证参数', async function() {
            // limit 需要非负数
            try {
                await collection('products')
                    .find({})
                    .limit(-1);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('non-negative'), '应该提示需要非负数');
            }

            // skip 需要非负数
            try {
                await collection('products')
                    .find({})
                    .skip(-1);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('non-negative'), '应该提示需要非负数');
            }

            // sort 需要对象
            try {
                await collection('products')
                    .find({})
                    .sort('invalid');
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('object'), '应该提示需要对象');
            }
        });
    });

    describe('AggregateChain - aggregate 链式调用', function() {
        it('应该支持 .hint() 链式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { category: 'electronics' } },
                    { $sort: { price: -1 } },
                    { $limit: 10 }
                ])
                .hint({ category: 1, price: -1 });

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .collation() 链式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { name: { $regex: '^商品' } } },
                    { $limit: 5 }
                ])
                .collation({ locale: 'zh', strength: 2 });

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .comment() 链式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { category: 'books' } },
                    { $limit: 5 }
                ])
                .comment('测试聚合注释');

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .maxTimeMS() 链式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { inStock: true } },
                    { $limit: 10 }
                ])
                .maxTimeMS(5000);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .allowDiskUse() 链式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $group: { _id: '$category', total: { $sum: 1 } } },
                    { $sort: { total: -1 } }
                ])
                .allowDiskUse(true);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持 .batchSize() 链式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { category: 'electronics' } },
                    { $limit: 20 }
                ])
                .batchSize(10);

            assert.ok(results.length > 0, '应该返回数据');
        });

        it('应该支持多个链式调用组合', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { inStock: true } },
                    { $group: { _id: '$category', avgPrice: { $avg: '$price' }, count: { $sum: 1 } } },
                    { $sort: { avgPrice: -1 } }
                ])
                .allowDiskUse(true)
                .maxTimeMS(5000)
                .comment('测试组合链式调用');

            assert.ok(results.length > 0, '应该返回数据');
            results.forEach(item => {
                assert.ok(item._id, '应该有分组字段');
                assert.ok(typeof item.avgPrice === 'number', '应该有平均价格');
                assert.ok(typeof item.count === 'number', '应该有计数');
            });
        });

        it('应该支持 .toArray() 显式调用', async function() {
            const results = await collection('products')
                .aggregate([
                    { $match: { category: 'books' } },
                    { $limit: 5 }
                ])
                .toArray();

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.equal(results.length, 5, '应该返回 5 条记录');
        });

        it('应该支持 .explain() 链式调用', async function() {
            const plan = await collection('products')
                .aggregate([
                    { $match: { category: 'electronics' } },
                    { $group: { _id: '$inStock', total: { $sum: 1 } } }
                ])
                .explain('executionStats');

            assert.ok(plan, '应该返回执行计划');
        });

        it('应该支持 .stream() 链式调用', async function() {
            const stream = collection('products')
                .aggregate([
                    { $match: { category: 'electronics' } },
                    { $limit: 10 }
                ])
                .stream();

            const results = [];

            await new Promise((resolve, reject) => {
                stream.on('data', (doc) => {
                    results.push(doc);
                });

                stream.on('end', () => {
                    try {
                        assert.ok(results.length > 0, '应该返回数据');
                        assert.ok(results.length <= 10, '应该不超过 limit');
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });

                stream.on('error', reject);
            });
        });

        it('链式调用应该像 Promise 一样工作', async function() {
            // 测试 .then()
            const results = await collection('products')
                .aggregate([
                    { $match: { category: 'books' } },
                    { $limit: 5 }
                ])
                .then(res => res);

            assert.ok(Array.isArray(results), '应该返回数组');
        });
    });

    describe('向后兼容性测试', function() {
        it('find 使用 options 参数应该仍然工作', async function() {
            const results = await collection('products').find(
                { category: 'electronics' },
                {
                    sort: { price: -1 },
                    limit: 10,
                    projection: { name: 1, price: 1 }
                }
            );

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length > 0, '应该返回数据');
        });

        it('aggregate 使用 options 参数应该仍然工作', async function() {
            const results = await collection('products').aggregate(
                [
                    { $match: { category: 'books' } },
                    { $limit: 5 }
                ],
                {
                    allowDiskUse: true,
                    maxTimeMS: 5000
                }
            );

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length > 0, '应该返回数据');
        });

        it('find 的 explain 选项应该仍然工作', async function() {
            const plan = await collection('products').find(
                { category: 'electronics' },
                { explain: 'executionStats' }
            );

            assert.ok(plan.queryPlanner, '应该返回执行计划');
        });

        it('aggregate 的 explain 选项应该仍然工作', async function() {
            const plan = await collection('products').aggregate(
                [{ $match: { category: 'books' } }],
                { explain: true }
            );

            assert.ok(plan, '应该返回执行计划');
        });
    });
});

