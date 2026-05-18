/**
 * aggregate 方法完整测试套件
 * 测试所有聚合操作、边界情况和错误处理
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('aggregate 方法测试套件', function() {
    this.timeout(30000); // 设置超时时间为 30 秒

    let msq;
    let aggregateCollection;
    let nativeCollection;
    const testData = {
        users: [],
        products: [],
        orders: []
    };

    // 准备测试数据
    before(async function() {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_aggregate',
            config: { useMemoryServer: true },
            slowQueryMs: 1000,
            findLimit: 100
        });

        const conn = await msq.connect();
        aggregateCollection = conn.collection;

        const db = msq._adapter.db;

        // 清空测试集合
        await db.collection('test_users').deleteMany({});
        await db.collection('test_products').deleteMany({});
        await db.collection('test_orders').deleteMany({});

        // 插入测试用户数据
        console.log('📝 准备测试数据...');
        for (let i = 1; i <= 50; i++) {
            testData.users.push({
                userId: `USER-${String(i).padStart(3, '0')}`,
                name: `用户${i}`,
                email: `user${i}@test.com`,
                status: i % 5 === 0 ? 'inactive' : 'active',
                role: i % 10 === 0 ? 'admin' : i % 15 === 0 ? 'vip' : 'user',
                totalSpent: Math.floor(Math.random() * 10000),
                orderCount: Math.floor(Math.random() * 50),
                createdAt: new Date(Date.now() - i * 86400000)
            });
        }
        await db.collection('test_users').insertMany(testData.users);
        console.log(`✅ 插入 ${testData.users.length} 条用户数据`);

        // 插入测试商品数据
        const categories = ['electronics', 'books', 'clothing'];
        for (let i = 1; i <= 100; i++) {
            testData.products.push({
                productId: `PROD-${String(i).padStart(3, '0')}`,
                name: `商品${i}`,
                category: categories[i % 3],
                price: Math.floor(Math.random() * 1000) + 50,
                cost: Math.floor(Math.random() * 500) + 20,
                inStock: i % 4 !== 0,
                sales: Math.floor(Math.random() * 1000),
                rating: 3 + Math.random() * 2,
                tags: [categories[i % 3], i % 2 === 0 ? 'sale' : 'regular'],
                createdAt: new Date(Date.now() - i * 43200000)
            });
        }
        await db.collection('test_products').insertMany(testData.products);
        console.log(`✅ 插入 ${testData.products.length} 条商品数据`);

        // 插入测试订单数据
        const statuses = ['pending', 'paid', 'completed', 'cancelled'];
        for (let i = 1; i <= 150; i++) {
            testData.orders.push({
                orderId: `ORD-${String(i).padStart(3, '0')}`,
                userId: `USER-${String((i % 50) + 1).padStart(3, '0')}`,
                productId: `PROD-${String((i % 100) + 1).padStart(3, '0')}`,
                status: statuses[i % 4],
                amount: Math.floor(Math.random() * 2000) + 100,
                discount: Math.floor(Math.random() * 20),
                items: Math.floor(Math.random() * 5) + 1,
                category: categories[i % 3],
                createdAt: new Date(Date.now() - i * 21600000)
            });
        }
        await db.collection('test_orders').insertMany(testData.orders);
        console.log(`✅ 插入 ${testData.orders.length} 条订单数据`);

        // 创建测试所需的索引
        console.log('🔧 创建测试索引...');
        await db.collection('test_orders').createIndex({ status: 1, createdAt: -1 }, { name: 'test_status_createdAt' });
        await db.collection('test_orders').createIndex({ userId: 1 }, { name: 'test_userId' });
        await db.collection('test_orders').createIndex({ category: 1 }, { name: 'test_category' });
        await db.collection('test_products').createIndex({ category: 1, price: -1 }, { name: 'test_category_price' });
        console.log('✅ 索引创建完成\n');
    });

    after(async function() {
        console.log('🧹 清理测试环境...');
        if (msq) {
            const db = msq._adapter.db;

            // 删除测试索引
            try {
                await db.collection('test_orders').dropIndex('test_status_createdAt');
                await db.collection('test_orders').dropIndex('test_userId');
                await db.collection('test_orders').dropIndex('test_category');
                await db.collection('test_products').dropIndex('test_category_price');
            } catch (error) {
                // 索引可能不存在，忽略错误
            }

            await db.collection('test_users').deleteMany({});
            await db.collection('test_products').deleteMany({});
            await db.collection('test_orders').deleteMany({});
            await msq.close();
        }
        console.log('✅ 清理完成');
    });

    describe('1. 基础聚合功能', function() {
        it('1.1 应该返回数组格式的结果', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $limit: 10 }
            ]);

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该有数据');
        });

        it('1.2 应该正确执行 $match 过滤', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.equal(item.status, 'paid', '所有订单状态应该是 paid');
            });
        });

        it('1.3 应该正确执行 $group 分组', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$amount' }
                    }
                }
            ]);

            assert.ok(result.length > 0, '应该返回分组结果');
            result.forEach(item => {
                assert.ok(item._id, '应该有 _id 字段');
                assert.ok(typeof item.count === 'number', '应该有 count 字段');
                assert.ok(typeof item.totalAmount === 'number', '应该有 totalAmount 字段');
            });
        });

        it('1.4 应该正确执行 $sort 排序', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $sort: { amount: -1 } },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');

            // 验证降序排列
            for (let i = 1; i < result.length; i++) {
                assert.ok(
                    result[i - 1].amount >= result[i].amount,
                    '金额应该按降序排列'
                );
            }
        });

        it('1.5 应该正确执行 $project 投影', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $project: {
                        orderId: 1,
                        amount: 1,
                        status: 1
                    }
                },
                { $limit: 5 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(item._id, '应该包含 _id');
                assert.ok(item.orderId, '应该包含 orderId');
                assert.ok(typeof item.amount === 'number', '应该包含 amount');
                assert.ok(item.status, '应该包含 status');
                assert.equal(item.userId, undefined, '不应该包含 userId');
            });
        });
    });

    describe('2. 统计聚合操作', function() {
        it('2.1 应该正确计算 $sum', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: '$amount' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            assert.equal(result.length, 1, '应该返回一条汇总记录');
            assert.ok(result[0].totalAmount > 0, 'totalAmount 应该大于 0');
            assert.equal(result[0].count, testData.orders.length, 'count 应该等于订单总数');
        });

        it('2.2 应该正确计算 $avg', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: '$status',
                        avgAmount: { $avg: '$amount' }
                    }
                }
            ]);

            assert.ok(result.length > 0, '应该返回分组数据');
            result.forEach(item => {
                assert.ok(typeof item.avgAmount === 'number', 'avgAmount 应该是数字');
                assert.ok(item.avgAmount > 0, 'avgAmount 应该大于 0');
            });
        });

        it('2.3 应该正确计算 $max 和 $min', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: '$status',
                        maxAmount: { $max: '$amount' },
                        minAmount: { $min: '$amount' }
                    }
                }
            ]);

            assert.ok(result.length > 0, '应该返回分组数据');
            result.forEach(item => {
                assert.ok(typeof item.maxAmount === 'number', 'maxAmount 应该是数字');
                assert.ok(typeof item.minAmount === 'number', 'minAmount 应该是数字');
                assert.ok(item.maxAmount >= item.minAmount, 'maxAmount 应该 >= minAmount');
            });
        });

        it('2.4 应该正确使用 $push 收集数组', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                {
                    $group: {
                        _id: '$userId',
                        orderIds: { $push: '$orderId' },
                        count: { $sum: 1 }
                    }
                },
                { $limit: 5 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(Array.isArray(item.orderIds), 'orderIds 应该是数组');
                assert.equal(item.orderIds.length, item.count, '数组长度应该等于 count');
            });
        });

        it('2.5 应该正确使用 $addToSet 去重收集', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: '$userId',
                        categories: { $addToSet: '$category' },
                        statuses: { $addToSet: '$status' }
                    }
                },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(Array.isArray(item.categories), 'categories 应该是数组');
                assert.ok(Array.isArray(item.statuses), 'statuses 应该是数组');

                // 验证数组中没有重复值
                const uniqueCategories = new Set(item.categories);
                assert.equal(item.categories.length, uniqueCategories.size, 'categories 应该无重复');
            });
        });
    });

    describe('3. 联表查询 ($lookup)', function() {
        it('3.1 应该正确执行基础 $lookup', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                {
                    $lookup: {
                        from: 'test_users',
                        localField: 'userId',
                        foreignField: 'userId',
                        as: 'userInfo'
                    }
                },
                { $limit: 5 }
            ], {
                allowDiskUse: true
            });

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(Array.isArray(item.userInfo), 'userInfo 应该是数组');
            });
        });

        it('3.2 应该正确执行带 pipeline 的 $lookup', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                {
                    $lookup: {
                        from: 'test_users',
                        let: { orderUserId: '$userId' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ['$userId', '$$orderUserId'] },
                                    status: 'active'
                                }
                            },
                            {
                                $project: { name: 1, email: 1, role: 1 }
                            }
                        ],
                        as: 'user'
                    }
                },
                { $limit: 10 }
            ], {
                allowDiskUse: true
            });

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(Array.isArray(item.user), 'user 应该是数组');
            });
        });

        it('3.3 应该正确执行 $unwind 展开关联结果', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                {
                    $lookup: {
                        from: 'test_users',
                        localField: 'userId',
                        foreignField: 'userId',
                        as: 'userInfo'
                    }
                },
                {
                    $unwind: {
                        path: '$userInfo',
                        preserveNullAndEmptyArrays: false
                    }
                },
                { $limit: 10 }
            ], {
                allowDiskUse: true
            });

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item.userInfo === 'object', 'userInfo 应该是对象（已展开）');
                assert.ok(!Array.isArray(item.userInfo), 'userInfo 不应该是数组');
            });
        });
    });

    describe('4. 数据转换操作', function() {
        it('4.1 应该正确使用 $addFields 添加字段', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $addFields: {
                        discountAmount: {
                            $multiply: ['$amount', { $divide: ['$discount', 100] }]
                        }
                    }
                },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item.discountAmount === 'number', '应该有 discountAmount 字段');
            });
        });

        it('4.2 应该正确使用 $cond 条件表达式', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $addFields: {
                        isHighValue: {
                            $cond: [{ $gte: ['$amount', 1000] }, true, false]
                        }
                    }
                },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item.isHighValue === 'boolean', 'isHighValue 应该是布尔值');
                if (item.amount >= 1000) {
                    assert.equal(item.isHighValue, true, '高金额订单应该为 true');
                } else {
                    assert.equal(item.isHighValue, false, '低金额订单应该为 false');
                }
            });
        });

        it('4.3 应该正确使用 $switch 多分支条件', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $addFields: {
                        level: {
                            $switch: {
                                branches: [
                                    { case: { $gte: ['$amount', 1500] }, then: 'high' },
                                    { case: { $gte: ['$amount', 800] }, then: 'medium' },
                                    { case: { $gte: ['$amount', 300] }, then: 'low' }
                                ],
                                default: 'very-low'
                            }
                        }
                    }
                },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item.level === 'string', 'level 应该是字符串');
                assert.ok(
                    ['high', 'medium', 'low', 'very-low'].includes(item.level),
                    'level 应该是有效值'
                );
            });
        });

        it('4.4 应该正确使用数学运算符', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $addFields: {
                        finalAmount: {
                            $subtract: [
                                '$amount',
                                { $multiply: ['$amount', { $divide: ['$discount', 100] }] }
                            ]
                        }
                    }
                },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item.finalAmount === 'number', 'finalAmount 应该是数字');
                assert.ok(item.finalAmount <= item.amount, 'finalAmount 应该 <= amount');
            });
        });
    });

    describe('5. 数组操作', function() {
        it('5.1 应该正确执行 $unwind 展开数组', async function() {
            const result = await aggregateCollection('test_products').aggregate([
                { $match: { inStock: true } },
                { $unwind: '$tags' },
                {
                    $group: {
                        _id: '$tags',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item._id === 'string', '_id（标签）应该是字符串');
                assert.ok(typeof item.count === 'number', 'count 应该是数字');
            });
        });

        it('5.2 应该正确使用 $push 收集数组', async function() {
            const result = await aggregateCollection('test_products').aggregate([
                {
                    $group: {
                        _id: '$category',
                        products: { $push: '$name' },
                        count: { $sum: 1 }
                    }
                }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(Array.isArray(item.products), 'products 应该是数组');
                assert.equal(item.products.length, item.count, '数组长度应该等于 count');
            });
        });
    });

    describe('6. 按日期分组', function() {
        it('6.1 应该正确使用 $dateToString 格式化日期', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $addFields: {
                        orderDate: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt'
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$orderDate',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: -1 } },
                { $limit: 10 }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item._id === 'string', '_id（日期）应该是字符串');
                assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(item._id), '日期格式应该是 YYYY-MM-DD');
            });
        });

        it('6.2 应该正确使用 $year 和 $month 提取日期', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': -1, '_id.month': -1 } }
            ]);

            assert.ok(result.length > 0, '应该返回数据');
            result.forEach(item => {
                assert.ok(typeof item._id.year === 'number', 'year 应该是数字');
                assert.ok(typeof item._id.month === 'number', 'month 应该是数字');
                assert.ok(item._id.month >= 1 && item._id.month <= 12, 'month 应该在 1-12 之间');
            });
        });
    });

    describe('7. 多路聚合 ($facet)', function() {
        it('7.1 应该正确执行 $facet 多路聚合', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $facet: {
                        statistics: [
                            {
                                $group: {
                                    _id: null,
                                    totalOrders: { $sum: 1 },
                                    totalAmount: { $sum: '$amount' }
                                }
                            }
                        ],
                        byStatus: [
                            {
                                $group: {
                                    _id: '$status',
                                    count: { $sum: 1 }
                                }
                            },
                            { $sort: { count: -1 } }
                        ],
                        topOrders: [
                            { $sort: { amount: -1 } },
                            { $limit: 5 }
                        ]
                    }
                }
            ]);

            assert.equal(result.length, 1, '应该返回一条记录');
            const facetResult = result[0];

            assert.ok(Array.isArray(facetResult.statistics), 'statistics 应该是数组');
            assert.ok(Array.isArray(facetResult.byStatus), 'byStatus 应该是数组');
            assert.ok(Array.isArray(facetResult.topOrders), 'topOrders 应该是数组');
            assert.equal(facetResult.topOrders.length, 5, 'topOrders 应该有 5 条记录');
        });
    });

    describe('8. 流式处理', function() {
        it('8.1 应该返回流对象', async function() {
            const stream = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $project: { orderId: 1, amount: 1 } }
            ], {
                stream: true
            });

            assert.equal(typeof stream.on, 'function', '应该是流对象');
            assert.equal(typeof stream.pipe, 'function', '应该支持 pipe 方法');
        });

        it('8.2 应该正确流式读取聚合数据', async function() {
            const stream = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $project: { orderId: 1, amount: 1, status: 1 } }
            ], {
                stream: true,
                batchSize: 20
            });

            let count = 0;
            const items = [];

            await new Promise((resolve, reject) => {
                stream.on('data', (item) => {
                    count++;
                    items.push(item);
                    assert.equal(item.status, 'paid', '所有数据状态应该是 paid');
                });

                stream.on('end', () => {
                    assert.ok(count > 0, '应该读取到数据');
                    assert.equal(count, items.length, '计数应该匹配');
                    resolve();
                });

                stream.on('error', reject);
            });
        });
    });

    describe('9. 性能优化选项', function() {
        it('9.1 应该支持 explain 查看执行计划', async function() {
            const plan = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                {
                    $group: {
                        _id: '$category',
                        total: { $sum: '$amount' }
                    }
                }
            ], {
                explain: true
            });

            assert.ok(plan, '应该返回执行计划');
            // MongoDB 聚合的 explain 结构可能因版本而异
            assert.ok(plan.stages || plan.queryPlanner, '应该包含执行计划信息');
        });

        it('9.2 应该支持 explain executionStats 模式', async function() {
            const plan = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $sort: { createdAt: -1 } },
                { $limit: 10 }
            ], {
                explain: 'executionStats'
            });

            assert.ok(plan, '应该返回执行计划');
        });

        it('9.3 应该支持 allowDiskUse 选项', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                {
                    $group: {
                        _id: '$userId',
                        totalAmount: { $sum: '$amount' },
                        orders: { $push: '$$ROOT' }
                    }
                },
                { $sort: { totalAmount: -1 } }
            ], {
                allowDiskUse: true
            });

            assert.ok(Array.isArray(result), '应该返回数组');
        });

        it('9.4 应该支持 hint 指定索引', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $sort: { createdAt: -1 } },
                { $limit: 10 }
            ], {
                hint: { status: 1, createdAt: -1 }
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该返回数据');
        });

        it('9.5 应该支持 maxTimeMS 设置超时', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $limit: 10 }
            ], {
                maxTimeMS: 5000
            });

            assert.ok(Array.isArray(result), '应该返回数组');
        });

        it('9.6 应该支持 comment 添加查询注释', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $limit: 5 }
            ], {
                comment: '测试查询注释'
            });

            assert.ok(Array.isArray(result), '应该返回数组');
        });
    });

    describe('10. 边界情况和错误处理', function() {
        it('10.1 应该正确处理空管道', async function() {
            const result = await aggregateCollection('test_orders').aggregate([]);

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '空管道应该返回所有数据');
        });

        it('10.2 应该返回空数组当没有匹配数据时', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'nonexistent' } }
            ]);

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.equal(result.length, 0, '应该返回空数组');
        });

        it('10.3 应该正确处理 $limit 为 1', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $limit: 1 }
            ]);

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.equal(result.length, 1, '应该返回空数组');
        });

        it('10.4 应该正确处理复杂的管道组合', async function() {
            const result = await aggregateCollection('test_orders').aggregate([
                { $match: { status: 'paid' } },
                { $sort: { amount: -1 } },
                { $limit: 20 },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$amount' },
                        avgAmount: { $avg: '$amount' }
                    }
                },
                { $sort: { totalAmount: -1 } }
            ]);

            assert.ok(Array.isArray(result), '应该返回数组');
            result.forEach(item => {
                assert.ok(item._id, '应该有 _id');
                assert.ok(typeof item.count === 'number', '应该有 count');
                assert.ok(typeof item.totalAmount === 'number', '应该有 totalAmount');
                assert.ok(typeof item.avgAmount === 'number', '应该有 avgAmount');
            });
        });
    });

    describe('11. 字符串排序 (collation)', function() {
        it('11.1 应该支持 collation 配置', async function() {
            const result = await aggregateCollection('test_products').aggregate([
                { $sort: { name: 1 } },
                { $limit: 10 }
            ], {
                collation: {
                    locale: 'zh',
                    strength: 2
                }
            });

            assert.ok(Array.isArray(result), '应该返回数组');
            assert.ok(result.length > 0, '应该返回数据');
        });
    });

    describe('12. 链式调用集成测试', function() {
        it('12.1 应该支持基础链式调用', async function() {
            const results = await aggregateCollection('test_orders')
                .aggregate([
                    { $match: { status: 'paid' } },
                    { $limit: 10 }
                ])
                .comment('测试链式调用');

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length > 0, '应该返回数据');
        });

        it('12.2 应该支持 hint 链式调用', async function() {
            const results = await aggregateCollection('test_orders')
                .aggregate([
                    { $match: { status: 'paid' } },
                    { $sort: { createdAt: -1 } },
                    { $limit: 10 }
                ])
                .hint({ status: 1, createdAt: -1 });

            assert.ok(Array.isArray(results), '应该返回数组');
        });

        it('12.3 应该支持 allowDiskUse 链式调用', async function() {
            const results = await aggregateCollection('test_orders')
                .aggregate([
                    { $group: { _id: '$category', total: { $sum: '$amount' } } },
                    { $sort: { total: -1 } }
                ])
                .allowDiskUse(true);

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length > 0, '应该返回数据');
        });

        it('12.4 应该支持多个链式调用组合', async function() {
            const results = await aggregateCollection('test_orders')
                .aggregate([
                    { $match: { status: 'paid' } },
                    { $group: { _id: '$category', count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ])
                .allowDiskUse(true)
                .maxTimeMS(5000)
                .comment('复杂链式调用');

            assert.ok(Array.isArray(results), '应该返回数组');
        });

        it('12.5 链式调用应该与 options 参数结果一致', async function() {
            const pipeline = [
                { $match: { status: 'paid' } },
                { $group: { _id: '$category', total: { $sum: '$amount' } } }
            ];

            // 方式1：链式调用
            const results1 = await aggregateCollection('test_orders')
                .aggregate(pipeline)
                .allowDiskUse(true)
                .maxTimeMS(5000);

            // 方式2：options 参数
            const results2 = await aggregateCollection('test_orders').aggregate(pipeline, {
                allowDiskUse: true,
                maxTimeMS: 5000
            });

            // 结果应该一致
            assert.equal(results1.length, results2.length, '返回数量应该一致');
        });

        it('12.6 链式调用应该支持 .toArray() 显式调用', async function() {
            const results = await aggregateCollection('test_orders')
                .aggregate([
                    { $match: { status: 'paid' } },
                    { $limit: 5 }
                ])
                .toArray();

            assert.ok(Array.isArray(results), '应该返回数组');
            assert.ok(results.length <= 5, '应该不超过 limit');
        });
    });
});

