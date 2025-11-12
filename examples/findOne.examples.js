/**
 * findOne 方法完整示例集
 * 演示各种使用场景和最佳实践
 */

const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

// ============================================================================
// 常量配置
// ============================================================================

// MongoDB 连接配置
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'ecommerce',
    config: { useMemoryServer: true }
};

// 集合名称常量
const COLLECTIONS = {
    USERS: 'users',
    PRODUCTS: 'products',
    ORDERS: 'orders',
    CATEGORIES: 'categories',
    SETTINGS: 'settings'
};

// ============================================================================
// 数据准备和清理工具函数
// ============================================================================

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
            createdAt: new Date(Date.now() - i * 86400000),
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
    const statuses = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    for (let i = 1; i <= count; i++) {
        orders.push({
            orderId: `ORDER-${String(i).padStart(5, '0')}`,
            userId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            productId: `PROD-${String((i % 100) + 1).padStart(5, '0')}`,
            amount: Math.floor(Math.random() * 500) + 10,
            status: statuses[i % 5],
            createdAt: new Date(Date.now() - i * 3600000 * 2),
            updatedAt: new Date()
        });
    }
    return orders;
}

// ============================================================================
// 示例函数
// ============================================================================

/**
 * 示例 1: 基础查询 - 根据 ID 查询用户
 */
async function example1_BasicQuery() {
    console.log('\n=== 示例 1: 基础查询 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 准备测试数据 - 使用原生 MongoDB 集合插入
        const users = generateUsers(10);
        const db = monSQLize._adapter.db;
        await db.collection(COLLECTIONS.USERS).insertMany(users);

        // 查询第一个用户
        const firstUser = await collection(COLLECTIONS.USERS).findOne(
            { userId: 'USER-00001' }
        );

        console.log('查询结果:', firstUser ? {
            userId: firstUser.userId,
            name: firstUser.name,
            email: firstUser.email,
            status: firstUser.status
        } : '未找到用户');

    } catch (error) {
        console.error('示例 1 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 2: 条件查询 - 查询活跃用户
 */
async function example2_ConditionalQuery() {
    console.log('\n=== 示例 2: 条件查询 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 查询活跃用户，按创建时间倒序，返回最新的一个
        const activeUser = await collection(COLLECTIONS.USERS).findOne(
            { status: 'active' },
            { sort: { createdAt: -1 } }
        );

        console.log('最新活跃用户:', activeUser ? {
            userId: activeUser.userId,
            name: activeUser.name,
            createdAt: activeUser.createdAt
        } : '未找到活跃用户');

    } catch (error) {
        console.error('示例 2 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 3: 投影查询 - 只返回需要的字段
 */
async function example3_ProjectionQuery() {
    console.log('\n=== 示例 3: 投影查询 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 只返回用户的基本信息字段
        const user = await collection(COLLECTIONS.USERS).findOne(
            { role: 'admin' },
            { projection: { name: 1, email: 1, role: 1 } }
        );

        console.log('管理员信息:', user ? {
            name: user.name,
            email: user.email,
            role: user.role
        } : '未找到管理员');

    } catch (error) {
        console.error('示例 3 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 4: 复杂查询条件 - 使用 MongoDB 操作符
 */
async function example4_ComplexQuery() {
    console.log('\n=== 示例 4: 复杂查询条件 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 查询高消费且已验证的用户
        const vipUser = await collection(COLLECTIONS.USERS).findOne(
            {
                totalSpent: { $gte: 10000 },
                verified: true,
                status: 'active'
            },
            { sort: { totalSpent: -1 } }
        );

        console.log('VIP 用户:', vipUser ? {
            userId: vipUser.userId,
            name: vipUser.name,
            totalSpent: vipUser.totalSpent,
            verified: vipUser.verified
        } : '未找到 VIP 用户');

    } catch (error) {
        console.error('示例 4 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 5: 数组查询 - 查询包含特定标签的商品
 */
async function example5_ArrayQuery() {
    console.log('\n=== 示例 5: 数组查询 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 准备商品数据 - 使用原生 MongoDB 集合插入
        const products = generateProducts(20);
        const db = monSQLize._adapter.db;
        await db.collection(COLLECTIONS.PRODUCTS).insertMany(products);

        // 查询热门商品
        const hotProduct = await collection(COLLECTIONS.PRODUCTS).findOne(
            { hot: true },
            { sort: { rating: -1 } }
        );

        console.log('热门商品:', hotProduct ? {
            productId: hotProduct.productId,
            name: hotProduct.name,
            rating: hotProduct.rating,
            hot: hotProduct.hot
        } : '未找到热门商品');

    } catch (error) {
        console.error('示例 5 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 6: 缓存查询 - 启用缓存的查询
 */
async function example6_CachedQuery() {
    console.log('\n=== 示例 6: 缓存查询 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 启用 30 秒缓存
        const startTime = Date.now();
        const user = await collection(COLLECTIONS.USERS).findOne(
            { userId: 'USER-00001' },
            { cache: 30000 }  // 30 秒
        );
        const firstQueryTime = Date.now() - startTime;

        // 再次查询，应该从缓存返回
        const startTime2 = Date.now();
        const user2 = await collection(COLLECTIONS.USERS).findOne(
            { userId: 'USER-00001' },
            { cache: 30000 }
        );
        const secondQueryTime = Date.now() - startTime2;

        console.log('首次查询耗时:', firstQueryTime, 'ms');
        console.log('缓存查询耗时:', secondQueryTime, 'ms');
        console.log('缓存加速比:', (firstQueryTime / secondQueryTime).toFixed(2) + 'x');

    } catch (error) {
        console.error('示例 6 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 7: 查询执行计划 - 使用 explain 分析查询
 */
async function example7_ExplainQuery() {
    console.log('\n=== 示例 7: 查询执行计划 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 查看查询执行计划
        const plan = await collection(COLLECTIONS.USERS).findOne(
            { status: 'active' },
            { explain: 'executionStats' }
        );

        console.log('执行计划:', {
            executionTimeMillis: plan.executionStats?.executionTimeMillis,
            totalDocsExamined: plan.executionStats?.totalDocsExamined,
            totalKeysExamined: plan.executionStats?.totalKeysExamined
        });

    } catch (error) {
        console.error('示例 7 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 8: 排序规则 - 使用 collation 进行不区分大小写查询
 */
async function example8_CollationQuery() {
    console.log('\n=== 示例 8: 排序规则 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 不区分大小写查询用户名
        const user = await collection(COLLECTIONS.USERS).findOne(
            { username: 'User1' },
            { collation: { locale: 'en', strength: 2 } }  // 不区分大小写
        );

        console.log('找到的用户:', user ? {
            userId: user.userId,
            username: user.username
        } : '未找到用户');

    } catch (error) {
        console.error('示例 8 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 9: 错误处理 - 处理查询错误
 */
async function example9_ErrorHandling() {
    console.log('\n=== 示例 9: 错误处理 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 查询不存在的集合或字段
        const result = await collection('nonexistent_collection').findOne(
            { invalidField: 'value' },
            { maxTimeMS: 1000 }
        );

        console.log('查询结果:', result);

    } catch (error) {
        console.error('查询出错:', error.message);
        console.error('错误代码:', error.code);
    } finally {
        await monSQLize.close();
    }
}

/**
 * 示例 10: 最佳实践 - 综合查询示例
 */
async function example10_BestPractices() {
    console.log('\n=== 示例 10: 最佳实践 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 最佳实践：指定排序、投影、缓存
        const user = await collection(COLLECTIONS.USERS).findOne(
            {
                status: 'active',
                verified: true,
                level: { $gte: 5 }
            },
            {
                projection: ['name', 'email', 'level', 'totalSpent'],
                sort: { level: -1, totalSpent: -1 },
                cache: 60000,  // 1 分钟缓存
                maxTimeMS: 2000
            }
        );

        console.log('优质用户:', user ? {
            name: user.name,
            email: user.email,
            level: user.level,
            totalSpent: user.totalSpent
        } : '未找到符合条件的用户');

    } catch (error) {
        console.error('示例 10 出错:', error.message);
    } finally {
        await monSQLize.close();
    }
}

// ============================================================================
// 主执行函数
// ============================================================================

/**
 * 运行所有示例
 */
async function runAllExamples() {
    console.log('🚀 开始运行 findOne 方法示例集\n');

    try {
        await example1_BasicQuery();
        await example2_ConditionalQuery();
        await example3_ProjectionQuery();
        await example4_ComplexQuery();
        await example5_ArrayQuery();
        await example6_CachedQuery();
        await example7_ExplainQuery();
        await example8_CollationQuery();
        await example9_ErrorHandling();
        await example10_BestPractices();

        console.log('\n✅ 所有示例运行完成');

    } catch (error) {
        console.error('\n❌ 示例运行失败:', error.message);
    } finally {
        // 显式停止 Memory Server，否则 Node.js 进程会卡住
        await stopMemoryServer();
    }
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    runAllExamples,
    example1_BasicQuery,
    example2_ConditionalQuery,
    example3_ProjectionQuery,
    example4_ComplexQuery,
    example5_ArrayQuery,
    example6_CachedQuery,
    example7_ExplainQuery,
    example8_CollationQuery,
    example9_ErrorHandling,
    example10_BestPractices
};
