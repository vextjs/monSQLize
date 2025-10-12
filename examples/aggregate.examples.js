/**
 * aggregate 方法完整示例集
 * 演示各种聚合操作场景和最佳实践
 */

const MonSQLize = require('../lib');

// ============================================================================
// 常量配置
// ============================================================================

// MongoDB 连接配置
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { uri: 'mongodb://localhost:27017' }
};

// 集合名称常量
const COLLECTIONS = {
    USERS: 'users',
    PRODUCTS: 'products',
    ORDERS: 'orders',
    CATEGORIES: 'categories'
};

// 数据量配置
const DATA_SIZE = {
    USERS: 50,
    PRODUCTS: 100,
    ORDERS: 200
};

// ============================================================================
// 数据准备和清理工具函数
// ============================================================================

// 全局标志
let indexesChecked = false;
let dataExistenceNotified = false;
let cleanupNotified = false;

/**
 * 创建 MonSQLize 实例
 * @returns {MonSQLize} MonSQLize 实例
 */
function createMonSQLizeInstance() {
    return new MonSQLize(DB_CONFIG);
}

/**
 * 生成用户数据
 */
function generateUsers(count) {
    const users = [];
    for (let i = 1; i <= count; i++) {
        users.push({
            userId: `USER-${String(i).padStart(5, '0')}`,
            name: `用户${i}`,
            email: `user${i}@example.com`,
            status: i % 5 === 0 ? 'inactive' : 'active',
            role: i % 10 === 0 ? 'admin' : i % 15 === 0 ? 'vip' : 'user',
            totalSpent: Math.floor(Math.random() * 20000),
            orderCount: Math.floor(Math.random() * 100),
            level: Math.floor(Math.random() * 10) + 1,
            createdAt: new Date(Date.now() - i * 86400000 * 2),
            updatedAt: new Date()
        });
    }
    return users;
}

/**
 * 生成商品数据
 */
function generateProducts(count) {
    const products = [];
    const categories = ['electronics', 'books', 'clothing', 'food', 'sports'];
    for (let i = 1; i <= count; i++) {
        const category = categories[i % categories.length];
        products.push({
            productId: `PROD-${String(i).padStart(5, '0')}`,
            name: `商品${i}`,
            category,
            price: Math.floor(Math.random() * 1000) + 50,
            cost: Math.floor(Math.random() * 500) + 20,
            inStock: i % 4 !== 0,
            sales: Math.floor(Math.random() * 2000),
            rating: 3 + Math.random() * 2,
            tags: [category, i % 3 === 0 ? 'sale' : 'regular'],
            reviews: Math.floor(Math.random() * 500),
            createdAt: new Date(Date.now() - i * 43200000),
            updatedAt: new Date()
        });
    }
    return products;
}

/**
 * 生成订单数据
 */
function generateOrders(count) {
    const orders = [];
    const statuses = ['pending', 'paid', 'completed', 'cancelled'];
    for (let i = 1; i <= count; i++) {
        const amount = Math.floor(Math.random() * 2000) + 100;
        const discount = Math.floor(Math.random() * 20);
        orders.push({
            orderId: `ORD-${String(i).padStart(5, '0')}`,
            userId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            status: statuses[i % statuses.length],
            amount,
            discount,
            finalAmount: amount * (100 - discount) / 100,
            items: Math.floor(Math.random() * 5) + 1,
            category: ['electronics', 'books', 'clothing', 'food', 'sports'][i % 5],
            createdAt: new Date(Date.now() - i * 21600000),
            completedAt: i % 4 === 2 ? new Date(Date.now() - i * 21600000 + 3600000) : null,
            updatedAt: new Date()
        });
    }
    return orders;
}

/**
 * 准备示例数据
 */
async function prepareExampleData(msq, skipIndexCheck = false) {
    if (!dataExistenceNotified) {
        console.log('🔧 准备示例数据...');
    }

    const db = msq._adapter.db;

    // 检查是否已有数据
    const usersCount = await db.collection(COLLECTIONS.USERS).countDocuments();
    const productsCount = await db.collection(COLLECTIONS.PRODUCTS).countDocuments();
    const ordersCount = await db.collection(COLLECTIONS.ORDERS).countDocuments();

    if (usersCount > 0 && productsCount > 0 && ordersCount > 0) {
        if (!dataExistenceNotified) {
            console.log('✅ 数据库已有数据，跳过插入');
            dataExistenceNotified = true;
        }

        if (!skipIndexCheck && !indexesChecked) {
            await ensureIndexes(db);
            indexesChecked = true;
        }

        return { needCleanup: false };
    }

    console.log('📝 插入示例数据...');
    dataExistenceNotified = true;

    // 插入数据
    const users = generateUsers(DATA_SIZE.USERS);
    await db.collection(COLLECTIONS.USERS).insertMany(users);
    console.log(`  ✅ 插入 ${users.length} 条用户数据`);

    const products = generateProducts(DATA_SIZE.PRODUCTS);
    await db.collection(COLLECTIONS.PRODUCTS).insertMany(products);
    console.log(`  ✅ 插入 ${products.length} 条商品数据`);

    const orders = generateOrders(DATA_SIZE.ORDERS);
    await db.collection(COLLECTIONS.ORDERS).insertMany(orders);
    console.log(`  ✅ 插入 ${orders.length} 条订单数据`);

    console.log('✅ 示例数据准备完成\n');

    if (!skipIndexCheck && !indexesChecked) {
        await ensureIndexes(db);
        indexesChecked = true;
    }

    return { needCleanup: true };
}

/**
 * 确保索引存在
 */
async function ensureIndexes(db) {
    console.log('🔧 检查并创建索引...');

    const indexes = [
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1, createdAt: -1 },
            name: 'status_createdAt_idx'
        },
        {
            collection: COLLECTIONS.ORDERS,
            spec: { userId: 1 },
            name: 'userId_idx'
        },
        {
            collection: COLLECTIONS.ORDERS,
            spec: { category: 1 },
            name: 'category_idx'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { category: 1, price: -1 },
            name: 'category_price_idx'
        },
        {
            collection: COLLECTIONS.USERS,
            spec: { status: 1 },
            name: 'status_idx'
        }
    ];

    for (const indexDef of indexes) {
        try {
            const coll = db.collection(indexDef.collection);
            const existingIndexes = await coll.indexes();
            const indexExists = existingIndexes.some(idx => idx.name === indexDef.name);

            if (!indexExists) {
                await coll.createIndex(indexDef.spec, { name: indexDef.name });
                console.log(`  ✅ 创建索引: ${indexDef.collection}.${indexDef.name}`);
            } else {
                console.log(`  ⏭️  索引已存在: ${indexDef.collection}.${indexDef.name}`);
            }
        } catch (error) {
            console.log(`  ⚠️  索引创建失败 ${indexDef.collection}.${indexDef.name}: ${error.message}`);
        }
    }

    console.log('✅ 索引检查完成\n');
}

/**
 * 清理示例数据
 */
async function cleanupExampleData(msq, needCleanup) {
    if (!needCleanup) {
        if (!cleanupNotified) {
            console.log('\n✅ 使用的是已有数据，无需清理');
            cleanupNotified = true;
        }
        return;
    }

    console.log('\n🧹 清理示例数据...');

    const db = msq._adapter.db;

    const collectionList = Object.values(COLLECTIONS);
    for (const collName of collectionList) {
        await db.collection(collName).deleteMany({});
    }

    console.log('✅ 示例数据清理完成');
}

// ============================================================================
// 示例 1: 基础聚合统计
// ============================================================================
async function example1_basicAggregation() {
    console.log('\n📖 示例 1: 基础聚合统计');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 统计各状态订单的总金额和数量
        console.log('\n1️⃣ 统计各状态订单的总金额和数量：');
        const orderStats = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $group: {
                    _id: '$status',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' },
                    maxAmount: { $max: '$amount' },
                    minAmount: { $min: '$amount' }
                }
            },
            {
                $sort: { totalAmount: -1 }
            }
        ]);

        console.log('  结果:');
        orderStats.forEach(stat => {
            console.log(`    ${stat._id}: 总额=${stat.totalAmount.toFixed(2)}, ` +
                `数量=${stat.count}, 平均=${stat.avgAmount.toFixed(2)}`);
        });

        // 统计每个分类的商品数量和平均价格
        console.log('\n2️⃣ 统计每个分类的商品数量和平均价格：');
        const categoryStats = await collection(COLLECTIONS.PRODUCTS).aggregate([
            {
                $match: { inStock: true }
            },
            {
                $group: {
                    _id: '$category',
                    productCount: { $sum: 1 },
                    avgPrice: { $avg: '$price' },
                    totalSales: { $sum: '$sales' },
                    maxPrice: { $max: '$price' },
                    minPrice: { $min: '$price' }
                }
            },
            {
                $sort: { totalSales: -1 }
            }
        ]);

        console.log('  结果:');
        categoryStats.forEach(stat => {
            console.log(`    ${stat._id}: 商品数=${stat.productCount}, ` +
                `平均价格=${stat.avgPrice.toFixed(2)}, 销量=${stat.totalSales}`);
        });

        // 统计用户等级分布
        console.log('\n3️⃣ 统计用户等级分布：');
        const userLevelStats = await collection(COLLECTIONS.USERS).aggregate([
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 },
                    avgSpent: { $avg: '$totalSpent' },
                    totalSpent: { $sum: '$totalSpent' }
                }
            },
            {
                $sort: { totalSpent: -1 }
            }
        ]);

        console.log('  结果:');
        userLevelStats.forEach(stat => {
            console.log(`    ${stat._id}: 用户数=${stat.count}, ` +
                `平均消费=${stat.avgSpent.toFixed(2)}, 总消费=${stat.totalSpent.toFixed(2)}`);
        });

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 1 完成\n');
}

// ============================================================================
// 示例 2: 联表查询（$lookup）
// ============================================================================
async function example2_lookup() {
    console.log('\n📖 示例 2: 联表查询（$lookup）');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 订单关联用户信息
        console.log('\n1️⃣ 订单关联用户信息：');
        const ordersWithUsers = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $lookup: {
                    from: COLLECTIONS.USERS,
                    localField: 'userId',
                    foreignField: 'userId',
                    as: 'userInfo'
                }
            },
            {
                $unwind: {
                    path: '$userInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    orderId: 1,
                    amount: 1,
                    status: 1,
                    userName: '$userInfo.name',
                    userEmail: '$userInfo.email',
                    userRole: '$userInfo.role',
                    createdAt: 1
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $limit: 10
            }
        ], {
            allowDiskUse: true
        });

        console.log(`  找到 ${ordersWithUsers.length} 个已支付订单`);
        if (ordersWithUsers.length > 0) {
            console.log('  示例订单:', {
                orderId: ordersWithUsers[0].orderId,
                amount: ordersWithUsers[0].amount,
                userName: ordersWithUsers[0].userName
            });
        }

        // 高级 $lookup 使用 pipeline
        console.log('\n2️⃣ 使用 pipeline 形式的 $lookup：');
        const ordersWithActiveUsers = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    status: { $in: ['paid', 'completed'] },
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $lookup: {
                    from: COLLECTIONS.USERS,
                    let: { orderUserId: '$userId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: ['$userId', '$$orderUserId'] },
                                status: 'active'
                            }
                        },
                        {
                            $project: { name: 1, email: 1, role: 1, level: 1 }
                        }
                    ],
                    as: 'user'
                }
            },
            {
                $match: {
                    user: { $ne: [] }
                }
            },
            {
                $project: {
                    orderId: 1,
                    amount: 1,
                    status: 1,
                    user: { $arrayElemAt: ['$user', 0] }
                }
            },
            {
                $limit: 15
            }
        ], {
            allowDiskUse: true
        });

        console.log(`  找到 ${ordersWithActiveUsers.length} 个订单（活跃用户）`);

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 2 完成\n');
}

// ============================================================================
// 示例 3: 数据转换与计算
// ============================================================================
async function example3_dataTransformation() {
    console.log('\n📖 示例 3: 数据转换与计算');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 计算订单利润
        console.log('\n1️⃣ 计算订单折扣和实付金额：');
        const ordersWithCalculations = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $addFields: {
                    discountAmount: {
                        $multiply: [
                            '$amount',
                            { $divide: ['$discount', 100] }
                        ]
                    },
                    finalAmount: {
                        $subtract: [
                            '$amount',
                            { $multiply: ['$amount', { $divide: ['$discount', 100] }] }
                        ]
                    }
                }
            },
            {
                $project: {
                    orderId: 1,
                    originalAmount: '$amount',
                    discount: 1,
                    discountAmount: { $round: ['$discountAmount', 2] },
                    finalAmount: { $round: ['$finalAmount', 2] },
                    createdAt: 1
                }
            },
            {
                $sort: { finalAmount: -1 }
            },
            {
                $limit: 10
            }
        ]);

        console.log(`  找到 ${ordersWithCalculations.length} 个订单`);
        if (ordersWithCalculations.length > 0) {
            const order = ordersWithCalculations[0];
            console.log('  最高金额订单:', {
                orderId: order.orderId,
                原价: order.originalAmount,
                折扣: order.discount + '%',
                折扣金额: order.discountAmount,
                实付: order.finalAmount
            });
        }

        // 条件计算用户等级
        console.log('\n2️⃣ 根据消费金额计算用户等级：');
        const usersWithLevel = await collection(COLLECTIONS.USERS).aggregate([
            {
                $addFields: {
                    computedLevel: {
                        $switch: {
                            branches: [
                                { case: { $gte: ['$totalSpent', 15000] }, then: 'Platinum' },
                                { case: { $gte: ['$totalSpent', 10000] }, then: 'Gold' },
                                { case: { $gte: ['$totalSpent', 5000] }, then: 'Silver' },
                                { case: { $gte: ['$totalSpent', 1000] }, then: 'Bronze' }
                            ],
                            default: 'Regular'
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$computedLevel',
                    count: { $sum: 1 },
                    avgSpent: { $avg: '$totalSpent' }
                }
            },
            {
                $sort: { avgSpent: -1 }
            }
        ]);

        console.log('  等级分布:');
        usersWithLevel.forEach(level => {
            console.log(`    ${level._id}: ${level.count} 人, 平均消费 ${level.avgSpent.toFixed(2)}`);
        });

        // 日期格式化
        console.log('\n3️⃣ 按日期格式化订单：');
        const ordersByDate = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
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
                    orderCount: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            },
            {
                $sort: { _id: -1 }
            },
            {
                $limit: 10
            }
        ]);

        console.log('  每日订单统计:');
        ordersByDate.forEach(day => {
            console.log(`    ${day._id}: ${day.orderCount} 单, 总额 ${day.totalAmount.toFixed(2)}`);
        });

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 3 完成\n');
}

// ============================================================================
// 示例 4: 数组操作
// ============================================================================
async function example4_arrayOperations() {
    console.log('\n📖 示例 4: 数组操作');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 展开标签并统计
        console.log('\n1️⃣ 展开商品标签并统计：');
        const tagStats = await collection(COLLECTIONS.PRODUCTS).aggregate([
            {
                $match: { inStock: true }
            },
            {
                $unwind: '$tags'
            },
            {
                $group: {
                    _id: '$tags',
                    count: { $sum: 1 },
                    avgPrice: { $avg: '$price' },
                    products: { $push: '$name' }
                }
            },
            {
                $sort: { count: -1 }
            },
            {
                $limit: 10
            }
        ]);

        console.log('  热门标签:');
        tagStats.forEach(tag => {
            console.log(`    ${tag._id}: ${tag.count} 个商品, 平均价格 ${tag.avgPrice.toFixed(2)}`);
        });

        // 收集用户的订单ID
        console.log('\n2️⃣ 按用户收集订单列表：');
        const userOrders = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: { status: { $in: ['paid', 'completed'] } }
            },
            {
                $group: {
                    _id: '$userId',
                    orderIds: { $push: '$orderId' },
                    orderCount: { $sum: 1 },
                    totalSpent: { $sum: '$amount' },
                    categories: { $addToSet: '$category' }
                }
            },
            {
                $sort: { totalSpent: -1 }
            },
            {
                $limit: 10
            }
        ]);

        console.log('  Top 10 消费用户:');
        userOrders.forEach((user, idx) => {
            console.log(`    ${idx + 1}. ${user._id}: ${user.orderCount} 单, ` +
                `总消费 ${user.totalSpent.toFixed(2)}, 涉及 ${user.categories.length} 个分类`);
        });

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 4 完成\n');
}

// ============================================================================
// 示例 5: 按日期分组统计
// ============================================================================
async function example5_dateGrouping() {
    console.log('\n📖 示例 5: 按日期分组统计');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 按日统计订单
        console.log('\n1️⃣ 按日统计订单数量和金额：');
        const dailyStats = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt'
                        }
                    },
                    orderCount: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' }
                }
            },
            {
                $sort: { _id: -1 }
            },
            {
                $limit: 10
            }
        ]);

        console.log('  最近10天订单统计:');
        dailyStats.forEach(day => {
            console.log(`    ${day._id}: ${day.orderCount} 单, ` +
                `总额 ${day.totalAmount.toFixed(2)}, 均价 ${day.avgAmount.toFixed(2)}`);
        });

        // 按月统计
        console.log('\n2️⃣ 按月统计订单：');
        const monthlyStats = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    orderCount: { $sum: 1 },
                    totalRevenue: { $sum: '$amount' },
                    avgOrderValue: { $avg: '$amount' }
                }
            },
            {
                $sort: { '_id.year': -1, '_id.month': -1 }
            }
        ]);

        console.log('  月度统计:');
        monthlyStats.forEach(month => {
            console.log(`    ${month._id.year}-${String(month._id.month).padStart(2, '0')}: ` +
                `${month.orderCount} 单, 收入 ${month.totalRevenue.toFixed(2)}`);
        });

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 5 完成\n');
}

// ============================================================================
// 示例 6: 多路聚合（$facet）
// ============================================================================
async function example6_facet() {
    console.log('\n📖 示例 6: 多路聚合（$facet）');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        console.log('\n1️⃣ 一次查询获取多个统计结果：');
        const multiStats = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $facet: {
                    // 总体统计
                    overall: [
                        {
                            $group: {
                                _id: null,
                                totalOrders: { $sum: 1 },
                                totalAmount: { $sum: '$amount' },
                                avgAmount: { $avg: '$amount' }
                            }
                        }
                    ],
                    // 按状态分组
                    byStatus: [
                        {
                            $group: {
                                _id: '$status',
                                count: { $sum: 1 },
                                amount: { $sum: '$amount' }
                            }
                        },
                        {
                            $sort: { count: -1 }
                        }
                    ],
                    // Top 订单
                    topOrders: [
                        {
                            $sort: { amount: -1 }
                        },
                        {
                            $limit: 5
                        },
                        {
                            $project: {
                                orderId: 1,
                                amount: 1,
                                status: 1
                            }
                        }
                    ],
                    // 按分类统计
                    byCategory: [
                        {
                            $group: {
                                _id: '$category',
                                count: { $sum: 1 },
                                total: { $sum: '$amount' }
                            }
                        },
                        {
                            $sort: { total: -1 }
                        }
                    ]
                }
            }
        ]);

        const result = multiStats[0];

        console.log('  总体统计:');
        if (result.overall[0]) {
            const overall = result.overall[0];
            console.log(`    总订单数: ${overall.totalOrders}`);
            console.log(`    总金额: ${overall.totalAmount.toFixed(2)}`);
            console.log(`    平均金额: ${overall.avgAmount.toFixed(2)}`);
        }

        console.log('\n  按状态分布:');
        result.byStatus.forEach(s => {
            console.log(`    ${s._id}: ${s.count} 单, 金额 ${s.amount.toFixed(2)}`);
        });

        console.log('\n  Top 5 订单:');
        result.topOrders.forEach((order, idx) => {
            console.log(`    ${idx + 1}. ${order.orderId}: ${order.amount} (${order.status})`);
        });

        console.log('\n  按分类统计:');
        result.byCategory.forEach(cat => {
            console.log(`    ${cat._id}: ${cat.count} 单, 总额 ${cat.total.toFixed(2)}`);
        });

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 6 完成\n');
}

// ============================================================================
// 示例 7: 流式处理大数据集
// ============================================================================
async function example7_streamProcessing() {
    console.log('\n📖 示例 7: 流式处理大数据集');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        console.log('\n1️⃣ 流式统计订单数据：');
        const stream = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: {
                    createdAt: { $gte: new Date('2024-01-01') }
                }
            },
            {
                $project: {
                    orderId: 1,
                    amount: 1,
                    status: 1,
                    category: 1
                }
            }
        ], {
            stream: true,
            batchSize: 50,
            allowDiskUse: true
        });

        let count = 0;
        let totalAmount = 0;
        const statusCount = {};

        await new Promise((resolve, reject) => {
            stream.on('data', (order) => {
                count++;
                totalAmount += order.amount;
                statusCount[order.status] = (statusCount[order.status] || 0) + 1;
            });

            stream.on('end', () => {
                console.log(`  处理完成: ${count} 条订单`);
                console.log(`  总金额: ${totalAmount.toFixed(2)}`);
                console.log(`  平均金额: ${(totalAmount / count).toFixed(2)}`);
                console.log('  状态分布:', statusCount);
                resolve();
            });

            stream.on('error', reject);
        });

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 7 完成\n');
}

// ============================================================================
// 示例 8: 性能优化（explain）
// ============================================================================
async function example8_performanceOptimization() {
    console.log('\n📖 示例 8: 性能优化（explain）');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();
    const { needCleanup } = await prepareExampleData(msq);

    try {
        console.log('\n1️⃣ 查看聚合执行计划：');
        const plan = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' }
                }
            },
            {
                $sort: { total: -1 }
            }
        ], {
            explain: 'executionStats'
        });

        if (plan.executionStats) {
            console.log('  执行统计:');
            console.log(`    执行时间: ${plan.executionStats.executionTimeMillis} ms`);
            console.log(`    扫描文档: ${plan.executionStats.nReturned || 'N/A'}`);
        } else {
            console.log('  执行计划已生成（查看详细信息需要访问 plan 对象）');
        }

        // 使用 hint 强制索引
        console.log('\n2️⃣ 使用 hint 强制使用索引：');
        const ordersWithHint = await collection(COLLECTIONS.ORDERS).aggregate([
            {
                $match: { status: 'paid' }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $limit: 20
            }
        ], {
            hint: { status: 1, createdAt: -1 },
            comment: '使用状态和日期复合索引'
        });

        console.log(`  返回 ${ordersWithHint.length} 条记录（使用索引优化）`);

    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 8 完成\n');
}

// ============================================================================
// 主函数：运行所有示例
// ============================================================================
async function runAllExamples() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 aggregate 方法完整示例集');
    console.log('='.repeat(60));

    try {
        await example1_basicAggregation();
        await example2_lookup();
        await example3_dataTransformation();
        await example4_arrayOperations();
        await example5_dateGrouping();
        await example6_facet();
        await example7_streamProcessing();
        await example8_performanceOptimization();

        console.log('\n' + '='.repeat(60));
        console.log('✅ 所有示例运行完成！');
        console.log('='.repeat(60) + '\n');
    } catch (error) {
        console.error('\n❌ 运行示例时出错:', error);
        process.exit(1);
    }
}

// ============================================================================
// 导出函数供单独运行
// ============================================================================
module.exports = {
    example1_basicAggregation,
    example2_lookup,
    example3_dataTransformation,
    example4_arrayOperations,
    example5_dateGrouping,
    example6_facet,
    example7_streamProcessing,
    example8_performanceOptimization,
    runAllExamples
};

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

