/**
 * find 方法完整示例集
 * 演示各种使用场景和最佳实践
 */

const MonSQLize = require('../lib');

// ============================================================================
// 常量配置
// ============================================================================

// MongoDB 连接配置
// 优先使用环境变量 MONGODB_URI，否则使用 Memory Server
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'ecommerce',
    config:{ useMemoryServer: true }
};

// 集合名称常量
const COLLECTIONS = {
    USERS: 'users',
    PRODUCTS: 'products',
    ORDERS: 'orders',
    CATEGORIES: 'categories',
    SETTINGS: 'settings'
};

// 数据量配置
const DATA_SIZE = {
    USERS: 50,
    PRODUCTS: 100,
    ORDERS: 150
};

// ============================================================================
// 数据准备和清理工具函数
// ============================================================================

// 全局标志：标记索引是否已经检查过
let indexesChecked = false;
// 全局标志：标记是否已经提示过数据存在
let dataExistenceNotified = false;
// 全局标志：标记是否已经提示过无需清理
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
 * @param {number} count - 生成数量
 * @returns {Array} 用户数据数组
 */
function generateUsers(count) {
    const users = [];
    for (let i = 1; i <= count; i++) {
        users.push({
            userId: `USER-${String(i).padStart(5, '0')}`,
            name: `用户${i}`,
            username: i % 2 === 0 ? `user${i}` : `User${i}`,
            email: `user${i}@example.com`,
            status: i % 5 === 0 ? 'inactive' : 'active',
            role: i % 10 === 0 ? 'admin' : i % 15 === 0 ? 'vip' : 'user',
            totalSpent: Math.floor(Math.random() * 20000),
            orderCount: Math.floor(Math.random() * 100),
            level: Math.floor(Math.random() * 10) + 1,
            verified: i % 3 !== 0,
            avatar: `avatar${i}.jpg`,
            createdAt: new Date(Date.now() - i * 86400000 * 2),
            updatedAt: new Date()
        });
    }
    return users;
}

/**
 * 生成商品数据
 * @param {number} count - 生成数量
 * @returns {Array} 商品数据数组
 */
function generateProducts(count) {
    const products = [];
    const categories = ['electronics', 'books', 'clothing'];
    for (let i = 1; i <= count; i++) {
        products.push({
            productId: `PROD-${String(i).padStart(5, '0')}`,
            name: `商品${i}`,
            category: categories[i % 3],
            language: i % 5 === 0 ? 'zh' : 'en',
            price: Math.floor(Math.random() * 1000) + 50,
            inStock: i % 4 !== 0,
            sales: Math.floor(Math.random() * 2000),
            hot: i % 10 === 0,
            rating: 3 + Math.random() * 2,
            tags: i % 3 === 0 ? ['electronics', 'sale'] : ['test'],
            image: `product${i}.jpg`,
            publishDate: new Date(Date.now() - Math.random() * 365 * 86400000),
            reviews: [{ rating: 4.5 }],
            createdAt: new Date(Date.now() - i * 43200000),
            updatedAt: new Date()
        });
    }
    return products;
}

/**
 * 生成订单数据
 * @param {number} count - 生成数量
 * @returns {Array} 订单数据数组
 */
function generateOrders(count) {
    const orders = [];
    const statuses = ['pending', 'paid', 'completed'];
    for (let i = 1; i <= count; i++) {
        orders.push({
            orderId: `ORD-${String(i).padStart(5, '0')}`,
            status: statuses[i % 3],
            amount: Math.floor(Math.random() * 2000) + 100,
            items: Math.floor(Math.random() * 5) + 1,
            priority: Math.floor(Math.random() * 3),
            customerId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            createdAt: new Date(Date.now() - i * 21600000),
            completedAt: i % 3 === 2 ? new Date(Date.now() - i * 21600000 + 3600000) : null,
            updatedAt: new Date()
        });
    }
    return orders;
}

/**
 * 准备示例数据
 * @param {Object} msq - MonSQLize 实例
 * @param {boolean} [skipIndexCheck=false] - 是否跳过索引检查（默认不跳过）
 */
async function prepareExampleData(msq, skipIndexCheck = false) {
    // 只在第一次准备数据时输出提示
    if (!dataExistenceNotified) {
        console.log('🔧 准备示例数据...');
    }

    const db = msq._adapter.db;

    // 检查是否已有数据
    const usersCount = await db.collection(COLLECTIONS.USERS).countDocuments();
    const productsCount = await db.collection(COLLECTIONS.PRODUCTS).countDocuments();
    const ordersCount = await db.collection(COLLECTIONS.ORDERS).countDocuments();

    if (usersCount > 0 && productsCount > 0 && ordersCount > 0) {
        // 只在第一次发现数据时提示
        if (!dataExistenceNotified) {
            console.log('✅ 数据库已有数据，跳过插入');
            dataExistenceNotified = true;
        }

        // 只在需要时检查索引（且未检查过）
        if (!skipIndexCheck && !indexesChecked) {
            await ensureIndexes(db);
            indexesChecked = true;
        }

        return { needCleanup: false };
    }

    console.log('📝 插入示例数据...');
    dataExistenceNotified = true;

    // 插入用户数据
    const users = generateUsers(DATA_SIZE.USERS);
    await db.collection(COLLECTIONS.USERS).insertMany(users);
    console.log(`  ✅ 插入 ${users.length} 条用户数据`);

    // 插入商品数据
    const products = generateProducts(DATA_SIZE.PRODUCTS);
    await db.collection(COLLECTIONS.PRODUCTS).insertMany(products);
    console.log(`  ✅ 插入 ${products.length} 条商品数据`);

    // 插入订单数据
    const orders = generateOrders(DATA_SIZE.ORDERS);
    await db.collection(COLLECTIONS.ORDERS).insertMany(orders);
    console.log(`  ✅ 插入 ${orders.length} 条订单数据`);

    // 插入分类数据
    const categories_data = [
        { name: '电子产品', slug: 'electronics', enabled: true, order: 1 },
        { name: '图书', slug: 'books', enabled: true, order: 2 },
        { name: '服装', slug: 'clothing', enabled: true, order: 3 },
        { name: '食品', slug: 'food', enabled: false, order: 4 }
    ];
    await db.collection(COLLECTIONS.CATEGORIES).insertMany(categories_data);
    console.log(`  ✅ 插入 ${categories_data.length} 条分类数据`);

    // 插入配置数据
    const settings = [
        { type: 'system', key: 'siteName', value: 'My Shop' },
        { type: 'system', key: 'language', value: 'zh-CN' },
        { type: 'user', key: 'theme', value: 'dark' }
    ];
    await db.collection(COLLECTIONS.SETTINGS).insertMany(settings);
    console.log(`  ✅ 插入 ${settings.length} 条配置数据`);

    console.log('✅ 示例数据准备完成\n');

    // 创建必要的索引（只在未检查过时执行）
    if (!skipIndexCheck && !indexesChecked) {
        await ensureIndexes(db);
        indexesChecked = true;
    }

    return { needCleanup: true };
}

/**
 * 确保所有必要的索引存在
 */
async function ensureIndexes(db) {
    console.log('🔧 检查并创建索引...');

    const indexes = [
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1, createdAt: -1 },
            name: 'status_createdAt_idx',
            description: '订单状态和创建时间索引'
        },
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1, amount: 1 },
            name: 'status_amount_idx',
            description: '订单状态和金额索引'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { category: 1, price: -1 },
            name: 'category_price_idx',
            description: '商品分类和价格索引'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { inStock: 1, sales: -1 },
            name: 'inStock_sales_idx',
            description: '商品库存和销量索引'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { hot: 1, inStock: 1 },
            name: 'hot_inStock_idx',
            description: '热门商品和库存索引'
        },
        {
            collection: COLLECTIONS.USERS,
            spec: { status: 1, createdAt: -1 },
            name: 'status_createdAt_idx',
            description: '用户状态和创建时间索引'
        },
        {
            collection: COLLECTIONS.CATEGORIES,
            spec: { enabled: 1, order: 1 },
            name: 'enabled_order_idx',
            description: '分类启用状态和排序索引'
        },
        {
            collection: COLLECTIONS.SETTINGS,
            spec: { type: 1, key: 1 },
            name: 'type_key_idx',
            description: '配置类型和键索引'
        }
    ];

    for (const indexDef of indexes) {
        try {
            const coll = db.collection(indexDef.collection);

            // 检查索引是否已存在
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
            // 继续创建其他索引，不中断流程
        }
    }

    console.log('✅ 索引检查完成\n');
}

/**
 * 清理示例数据
 */
async function cleanupExampleData(msq, needCleanup) {
    if (!needCleanup) {
        // 只在第一次提示无需清理
        if (!cleanupNotified) {
            console.log('\n✅ 使用的是已有数据，无需清理');
            cleanupNotified = true;
        }
        return;
    }

    console.log('\n🧹 清理示例数据...');

    const db = msq._adapter.db;

    // 使用常量清理集合
    const collectionList = Object.values(COLLECTIONS);
    for (const collName of collectionList) {
        await db.collection(collName).deleteMany({});
    }

    // 可选：清理创建的索引
    console.log('🧹 清理索引...');
    for (const collName of collectionList) {
        try {
            const coll = db.collection(collName);
            const indexes = await coll.indexes();

            // 删除非 _id 的自定义索引
            for (const idx of indexes) {
                if (idx.name !== '_id_' && idx.name.endsWith('_idx')) {
                    try {
                        await coll.dropIndex(idx.name);
                        console.log(`  ✅ 删除索引: ${collName}.${idx.name}`);
                    } catch (error) {
                        // 索引可能已被删除，忽略错误
                    }
                }
            }
        } catch (error) {
            // 集合可能不存在，忽略错误
        }
    }

    console.log('✅ 示例数据清理完成');
}

// ============================================================================
// 示例 1: 基础查询
// ============================================================================
async function example1_basicQueries() {
    console.log('\n📖 示例 1: 基础查询');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 查询所有活跃用户
        console.log('\n1️⃣ 查询所有活跃用户（限制 10 条）：');
        const activeUsers = await collection(COLLECTIONS.USERS).find({
            query: { status: 'active' },
            limit: 10
        });

        console.log(`  - 找到 ${activeUsers.length} 个活跃用户`);
        if (activeUsers.length > 0) {
            console.log(`  - 第一个用户: ${activeUsers[0].name || activeUsers[0].username}`);
        }

        // 带字段投影的查询
        console.log('\n2️⃣ 查询用户基本信息（仅返回指定字段）：');
        const userProfiles = await collection(COLLECTIONS.USERS).find({
            query: { status: 'active' },
            projection: { name: 1, email: 1, createdAt: 1 },
            limit: 5
        });

        console.log(`  - 返回 ${userProfiles.length} 条记录`);
        if (userProfiles.length > 0) {
            console.log('  - 字段:', Object.keys(userProfiles[0]).join(', '));
        }

        // 带排序的查询
        console.log('\n3️⃣ 查询最新注册的用户：');
        const newUsers = await collection(COLLECTIONS.USERS).find({
            query: { status: 'active' },
            sort: { createdAt: -1 },
            projection: ['name', 'email', 'createdAt'],
            limit: 10
        });

        console.log(`  - 返回 ${newUsers.length} 个最新用户`);
        if (newUsers.length > 0) {
            const latest = newUsers[0];
            console.log(`  - 最新: ${latest.name}, 注册于 ${latest.createdAt}`);
        }
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 1 完成\n');
}

// ============================================================================
// 示例 2: 复杂查询条件
// ============================================================================
async function example2_complexQueries() {
    console.log('\n📖 示例 2: 复杂查询条件');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 范围查询
        console.log('\n1️⃣ 查询指定金额范围的订单：');
        const orders = await collection(COLLECTIONS.ORDERS).find({
            query: {
                amount: { $gte: 100, $lte: 1000 },
                status: 'paid'
            },
            sort: { amount: -1 },
            limit: 20
        });

        console.log(`  - 找到 ${orders.length} 个订单`);
        if (orders.length > 0) {
            const amounts = orders.map(o => o.amount);
            console.log(`  - 金额范围: ${Math.min(...amounts)} ~ ${Math.max(...amounts)}`);
        }

        // 多状态查询
        console.log('\n2️⃣ 查询已支付或已完成的订单：');
        const paidOrders = await collection(COLLECTIONS.ORDERS).find({
            query: {
                status: { $in: ['paid', 'completed'] },
                createdAt: { $gte: new Date('2024-01-01') }
            },
            sort: { createdAt: -1 },
            projection: { orderId: 1, status: 1, amount: 1, createdAt: 1 },
            limit: 15
        });

        console.log(`  - 找到 ${paidOrders.length} 个订单`);
        const statusCount = {};
        paidOrders.forEach(order => {
            statusCount[order.status] = (statusCount[order.status] || 0) + 1;
        });
        console.log('  - 状态分布:', statusCount);

        // 逻辑组合查询
        console.log('\n3️⃣ 复杂逻辑组合查询：');
        const vipUsers = await collection(COLLECTIONS.USERS).find({
            query: {
                $or: [
                    { role: 'vip' },
                    { $and: [
                            { totalSpent: { $gte: 10000 } },
                            { orderCount: { $gte: 50 } }
                        ]}
                ],
                status: 'active'
            },
            sort: { totalSpent: -1 },
            limit: 20
        });

        console.log(`  - 找到 ${vipUsers.length} 个 VIP 用户`);
        if (vipUsers.length > 0) {
            console.log(`  - 最高消费: ${vipUsers[0].totalSpent || 0}`);
        }

        // 数组查询
        console.log('\n4️⃣ 查询带特定标签的商品：');
        const products = await collection(COLLECTIONS.PRODUCTS).find({
            query: {
                tags: { $all: ['electronics', 'sale'] },
                inStock: true,
                price: { $lte: 500 }
            },
            sort: { sales: -1, price: 1 },
            projection: { name: 1, price: 1, tags: 1, sales: 1 },
            limit: 10
        });

        console.log(`  - 找到 ${products.length} 个商品`);
        if (products.length > 0) {
            console.log(`  - 最热销: ${products[0].name}, 销量 ${products[0].sales}`);
        }
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 2 完成\n');
}

// ============================================================================
// 示例 3: 分页查询（skip + limit）
// ============================================================================
async function example3_pagination() {
    console.log('\n📖 示例 3: 传统分页查询');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        const pageSize = 20;

        // 第一页
        console.log('\n1️⃣ 获取第 1 页：');
        const page1 = await collection(COLLECTIONS.PRODUCTS).find({
            query: { category: 'books', inStock: true },
            sort: { publishDate: -1, _id: 1 },
            limit: pageSize,
            skip: 0
        });

        console.log(`  - 返回 ${page1.length} 条记录`);

        // 第二页
        console.log('\n2️⃣ 获取第 2 页：');
        const page2 = await collection(COLLECTIONS.PRODUCTS).find({
            query: { category: 'books', inStock: true },
            sort: { publishDate: -1, _id: 1 },
            limit: pageSize,
            skip: pageSize
        });

        console.log(`  - 返回 ${page2.length} 条记录`);

        // 第三页
        console.log('\n3️⃣ 获取第 3 页：');
        const page3 = await collection(COLLECTIONS.PRODUCTS).find({
            query: { category: 'books', inStock: true },
            sort: { publishDate: -1, _id: 1 },
            limit: pageSize,
            skip: pageSize * 2
        });

        console.log(`  - 返回 ${page3.length} 条记录`);

        // 验证数据不重复
        const allIds = [...page1, ...page2, ...page3].map(p => String(p._id));
        const uniqueIds = new Set(allIds);
        console.log(`\n  - 总共 ${allIds.length} 条记录，去重后 ${uniqueIds.size} 条`);
        console.log(`  - 数据完整性: ${allIds.length === uniqueIds.size ? '✅ 无重复' : '❌ 有重复'}`);

        console.log('\n⚠️  注意: skip + limit 方式在大数据量下性能较差');
        console.log('   推荐使用 findPage 方法进行高性能分页！');
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 3 完成\n');
}

// ============================================================================
// 示例 4: 流式处理大数据集
// ============================================================================
async function example4_streamProcessing() {
    console.log('\n📖 示例 4: 流式处理大数据集');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 流式统计订单数据
        console.log('\n1️⃣ 流式统计 2024 年订单数据：');
        const stream = await collection(COLLECTIONS.ORDERS).find({
            query: {
                createdAt: {
                    $gte: new Date('2024-01-01'),
                    $lt: new Date('2025-01-01')
                }
            },
            sort: { createdAt: 1 },
            stream: true,
            batchSize: 1000
        });

        let totalOrders = 0;
        let totalAmount = 0;
        let totalItems = 0;
        const statusCount = {};
        const monthlyStats = {};

        stream.on('data', (order) => {
            totalOrders++;
            totalAmount += order.amount || 0;
            totalItems += order.items || 0;

            // 统计状态分布
            statusCount[order.status] = (statusCount[order.status] || 0) + 1;

            // 统计月度数据
            const month = order.createdAt.toISOString().substring(0, 7);
            if (!monthlyStats[month]) {
                monthlyStats[month] = { count: 0, amount: 0 };
            }
            monthlyStats[month].count++;
            monthlyStats[month].amount += order.amount || 0;

            // 每 1000 条输出进度
            if (totalOrders % 1000 === 0) {
                process.stdout.write(`\r  - 已处理: ${totalOrders} 条订单...`);
            }
        });

        await new Promise((resolve, reject) => {
            stream.on('end', () => {
                if (totalOrders > 0) {
                    console.log(`\n  - 总订单数: ${totalOrders.toLocaleString()}`);
                    console.log(`  - 总金额: ¥${totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`);
                    console.log(`  - 平均订单金额: ¥${(totalAmount / totalOrders).toFixed(2)}`);
                    console.log(`  - 平均订单商品数: ${(totalItems / totalOrders).toFixed(1)}`);
                    console.log('  - 状态分布:', statusCount);
                    console.log('  - 月度统计:');
                    Object.entries(monthlyStats)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .forEach(([month, stats]) => {
                            console.log(`    ${month}: ${stats.count} 单, ¥${stats.amount.toFixed(2)}`);
                        });
                } else {
                    console.log('\n  - 没有找到 2024 年的订单数据');
                }
                resolve();
            });

            stream.on('error', (err) => {
                console.error('\n  ❌ 流处理错误:', err.message);
                reject(err);
            });
        });

        // 流式导出用户数据
        console.log('\n2️⃣ 流式导出数据到 CSV：');
        const exportStream = await collection(COLLECTIONS.USERS).find({
            query: { status: 'active' },
            projection: { name: 1, email: 1, createdAt: 1 },
            sort: { createdAt: -1 },
            stream: true,
            batchSize: 500
        });

        let exportCount = 0;
        const csvLines = ['Name,Email,CreatedAt'];

        exportStream.on('data', (user) => {
            const line = `"${user.name || ''}","${user.email || ''}","${user.createdAt}"`;
            csvLines.push(line);
            exportCount++;

            if (exportCount % 500 === 0) {
                process.stdout.write(`\r  - 已导出: ${exportCount} 条记录...`);
            }
        });

        await new Promise((resolve, reject) => {
            exportStream.on('end', () => {
                console.log(`\n  - 导出完成: ${exportCount} 条记录`);
                console.log(`  - CSV 行数: ${csvLines.length}`);
                console.log(`  - 前 3 行预览:`);
                csvLines.slice(0, 3).forEach(line => console.log(`    ${line}`));
                resolve();
            });

            exportStream.on('error', (err) => {
                console.error('\n  ❌ 导出错误:', err.message);
                reject(err);
            });
        });
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 4 完成\n');
}

// ============================================================================
// 示例 5: 索引优化和性能分析
// ============================================================================
async function example5_indexOptimization() {
    console.log('\n📖 示例 5: 索引优化和性能分析');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 查看查询执行计划
        console.log('\n1️⃣ 分析查询执行计划：');
        const plan = await collection(COLLECTIONS.ORDERS).find({
            query: { status: 'paid', amount: { $gte: 500 } },
            sort: { createdAt: -1 },
            limit: 20,
            explain: 'executionStats'
        });

        if (plan.executionStats) {
            console.log(`  - 执行时间: ${plan.executionStats.executionTimeMillis} ms`);
            console.log(`  - 扫描文档数: ${plan.executionStats.totalDocsExamined}`);
            console.log(`  - 返回文档数: ${plan.executionStats.nReturned}`);
            console.log(`  - 使用索引: ${plan.executionStats.executionStages?.indexName || '无'}`);

            const efficiency = plan.executionStats.nReturned / (plan.executionStats.totalDocsExamined || 1);
            console.log(`  - 查询效率: ${(efficiency * 100).toFixed(2)}%`);

            if (efficiency < 0.5) {
                console.log('  ⚠️  查询效率较低，建议添加索引！');
            }
        }

        // 强制使用索引
        console.log('\n2️⃣ 使用 hint 强制指定索引：');
        try {
            const ordersWithHint = await collection(COLLECTIONS.ORDERS).find({
                query: { status: 'paid' },
                sort: { createdAt: -1 },
                hint: { status: 1, createdAt: -1 },
                limit: 10
            });
            console.log(`  - 返回 ${ordersWithHint.length} 条记录`);
            console.log('  ✅ 成功使用指定索引');
        } catch (error) {
            console.log(`  ⚠️  索引不存在: ${error.message}`);
            console.log('  提示: 可能需要创建索引 { status: 1, createdAt: -1 }');
        }

        // 设置查询超时
        console.log('\n3️⃣ 设置查询超时时间：');
        try {
            const startTime = Date.now();
            const products = await collection(COLLECTIONS.PRODUCTS).find({
                query: { category: 'electronics' },
                sort: { sales: -1 },
                maxTimeMS: 5000,  // 5 秒超时
                limit: 50
            });
            const duration = Date.now() - startTime;
            console.log(`  - 查询完成: ${products.length} 条记录`);
            console.log(`  - 实际耗时: ${duration} ms`);
        } catch (error) {
            if (error.code === 50) {  // MongoDB 超时错误码
                console.log('  ❌ 查询超时，需要优化查询或添加索引');
            } else {
                throw error;
            }
        }
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 5 完成\n');
}

// ============================================================================
// 示例 6: 缓存查询结果
// ============================================================================
async function example6_caching() {
    console.log('\n📖 示例 6: 缓存查询结果');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 首次查询（未缓存）
        console.log('\n1️⃣ 首次查询分类列表：');
        const start1 = Date.now();
        const categories1 = await collection(COLLECTIONS.CATEGORIES).find({
            query: { enabled: true },
            sort: { order: 1 },
            projection: ['name', 'slug', 'order'],
            cache: 300000  // 缓存 5 分钟
        });
        const duration1 = Date.now() - start1;
        console.log(`  - 返回 ${categories1.length} 个分类`);
        console.log(`  - 耗时: ${duration1} ms`);

        // 第二次查询（使用缓存）
        console.log('\n2️⃣ 第二次查询（应从缓存读取）：');
        const start2 = Date.now();
        const categories2 = await collection(COLLECTIONS.CATEGORIES).find({
            query: { enabled: true },
            sort: { order: 1 },
            projection: ['name', 'slug', 'order'],
            cache: 300000
        });
        const duration2 = Date.now() - start2;
        console.log(`  - 返回 ${categories2.length} 个分类`);
        console.log(`  - 耗时: ${duration2} ms`);
        console.log(`  - 性能提升: ${((duration1 - duration2) / duration1 * 100).toFixed(1)}%`);

        // 缓存热门商品
        console.log('\n3️⃣ 缓存热门商品列表：');
        const hotProducts = await collection(COLLECTIONS.PRODUCTS).find({
            query: { hot: true, inStock: true },
            sort: { sales: -1 },
            projection: { name: 1, price: 1, image: 1, sales: 1 },
            limit: 20,
            cache: 600000  // 缓存 10 分钟
        });
        console.log(`  - 返回 ${hotProducts.length} 个热门商品`);
        console.log('  - 缓存时间: 10 分钟');

        // 缓存配置信息
        console.log('\n4️⃣ 缓存系统配置：');
        const configs = await collection(COLLECTIONS.SETTINGS).find({
            query: { type: 'system' },
            projection: { key: 1, value: 1 },
            cache: 3600000  // 缓存 1 小时
        });
        console.log(`  - 返回 ${configs.length} 条配置`);
        console.log('  - 缓存时间: 1 小时');
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 6 完成\n');
}

// ============================================================================
// 示例 7: 字符串排序和本地化
// ============================================================================
async function example7_collation() {
    console.log('\n📖 示例 7: 字符串排序和本地化');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    const { collection } = await msq.connect();

    // 准备数据
    const { needCleanup } = await prepareExampleData(msq);

    try {
        // 不区分大小写的查询
        console.log('\n1️⃣ 不区分大小写查询用户名：');
        const users = await collection(COLLECTIONS.USERS).find({
            query: { username: 'user2' },
            collation: {
                locale: 'en',
                strength: 2  // 不区分大小写
            },
            limit: 10
        });
        console.log(`  - 找到 ${users.length} 个用户（匹配 user2, User2, USER2 等）`);

        // 中文排序
        console.log('\n2️⃣ 按中文拼音排序：');
        const chineseProducts = await collection(COLLECTIONS.PRODUCTS).find({
            query: { language: 'zh' },
            sort: { name: 1 },
            collation: {
                locale: 'zh',
                numericOrdering: true
            },
            projection: ['name'],
            limit: 20
        });
        console.log(`  - 返回 ${chineseProducts.length} 个商品`);
        if (chineseProducts.length > 0) {
            console.log('  - 排序示例:', chineseProducts.slice(0, 5).map(p => p.name).join(', '));
        }
    } finally {
        await cleanupExampleData(msq, needCleanup);
        await msq.close();
    }

    console.log('\n✅ 示例 7 完成\n');
}

// ============================================================================
// 主函数：运行所有示例
// ============================================================================
async function runAllExamples() {
    console.log('\n' + '='.repeat(60));
    console.log('  find 方法完整示例集');
    console.log('='.repeat(60));

    const msq = createMonSQLizeInstance();
    await msq.connect();

    // 准备数据（只准备一次）
    const { needCleanup } = await prepareExampleData(msq);

    await msq.close();

    try {
        await example1_basicQueries();
        await example2_complexQueries();
        await example3_pagination();
        await example4_streamProcessing();
        await example5_indexOptimization();
        await example6_caching();
        await example7_collation();

        console.log('\n' + '='.repeat(60));
        console.log('  ✅ 所有示例运行完成！');
        console.log('='.repeat(60) + '\n');
    } catch (error) {
        console.error('\n❌ 示例运行失败:', error);
        process.exit(1);
    } finally {
        // 清理数据（只清理一次）
        const msqCleanup = createMonSQLizeInstance();
        await msqCleanup.connect();
        await cleanupExampleData(msqCleanup, needCleanup);
        await msqCleanup.close();
    }
}

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
    runAllExamples().catch(err => {
        console.error('运行示例时出错:', err);
        process.exit(1);
    }).then(() => {
        console.log('\n💡 使用方法:');
        console.log('   - 运行所有示例: node examples/find.examples.js');
        console.log('   - 运行单个示例: 在代码中调用具体的 example 函数');
        console.log('\n📚 更多文档: docs/find.md');
        console.log('🧪 测试用例: test/find.test.js\n');
    });
}

// 导出各个示例函数，方便单独调用
module.exports = {
    example1_basicQueries,
    example2_complexQueries,
    example3_pagination,
    example4_streamProcessing,
    example5_indexOptimization,
    example6_caching,
    example7_collation,
    runAllExamples
};
