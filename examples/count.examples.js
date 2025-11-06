/**
 * count 方法完整示例集
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
    CATEGORIES: 'categories'
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
            email: `user${i}@example.com`,
            status: i % 5 === 0 ? 'inactive' : 'active',
            role: i % 10 === 0 ? 'admin' : i % 15 === 0 ? 'vip' : 'user',
            level: Math.floor(Math.random() * 10) + 1,
            verified: i % 3 !== 0,
            totalSpent: Math.floor(Math.random() * 20000),
            createdAt: new Date(Date.now() - i * 86400000),
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
            price: Math.floor(Math.random() * 1000) + 50,
            inStock: i % 4 !== 0,
            sales: Math.floor(Math.random() * 2000),
            tags: i % 3 === 0 ? ['featured', 'hot'] : ['regular'],
            rating: 3 + Math.random() * 2,
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
    const statuses = ['pending', 'paid', 'completed', 'cancelled'];
    for (let i = 1; i <= count; i++) {
        orders.push({
            orderId: `ORDER-${String(i).padStart(5, '0')}`,
            userId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            amount: Math.floor(Math.random() * 5000) + 100,
            status: statuses[i % 4],
            items: Math.floor(Math.random() * 5) + 1,
            createdAt: new Date(Date.now() - i * 3600000),
            completedAt: i % 4 === 2 ? new Date(Date.now() - i * 3600000 + 1800000) : null,
            updatedAt: new Date()
        });
    }
    return orders;
}

// ============================================================================
// 示例函数
// ============================================================================

/**
 * 示例 1: 基础统计 - 统计文档总数
 */
async function example1_BasicCount() {
    console.log('\n=== 示例 1: 基础统计 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 准备测试数据
        const users = generateUsers(100);
        const db = monSQLize._adapter.db;

        // 先清空旧数据
        await db.collection(COLLECTIONS.USERS).deleteMany({});
        await db.collection(COLLECTIONS.USERS).insertMany(users);

        // 统计所有用户（空查询自动使用 estimatedDocumentCount，性能最优）
        const totalUsers = await collection(COLLECTIONS.USERS).count();
        console.log('总用户数:', totalUsers);

        // 统计活跃用户
        const activeUsers = await collection(COLLECTIONS.USERS).count({
            query: { status: 'active' }
        });
        console.log('活跃用户数:', activeUsers);

        // 统计非活跃用户
        const inactiveUsers = await collection(COLLECTIONS.USERS).count({
            query: { status: 'inactive' }
        });
        console.log('非活跃用户数:', inactiveUsers);

        // 验证统计结果
        console.log('统计验证:', activeUsers + inactiveUsers === totalUsers ? '✅ 通过' : '❌ 失败');

    } catch (error) {
        console.error('示例 1 出错:', error.message);
    }
}

/**
 * 示例 2: 条件统计 - 使用查询操作符
 */
async function example2_ConditionalCount() {
    console.log('\n=== 示例 2: 条件统计 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 范围统计：高消费用户（消费超过 10000）
        const highSpenders = await collection(COLLECTIONS.USERS).count({
            query: { totalSpent: { $gte: 10000 } }
        });
        console.log('高消费用户数:', highSpenders);

        // 逻辑组合统计：VIP 或高等级用户
        const vipOrHighLevel = await collection(COLLECTIONS.USERS).count({
            query: {
                $or: [
                    { role: 'vip' },
                    { level: { $gte: 8 } }
                ]
            }
        });
        console.log('VIP 或高等级用户数:', vipOrHighLevel);

        // 多条件统计：活跃且已验证的用户
        const activeVerified = await collection(COLLECTIONS.USERS).count({
            query: {
                status: 'active',
                verified: true
            }
        });
        console.log('活跃且已验证用户数:', activeVerified);

        // $ne 操作符：非管理员用户
        const nonAdmins = await collection(COLLECTIONS.USERS).count({
            query: { role: { $ne: 'admin' } }
        });
        console.log('非管理员用户数:', nonAdmins);

    } catch (error) {
        console.error('示例 2 出错:', error.message);
    }
}

/**
 * 示例 3: 多集合统计 - 业务报表数据
 */
async function example3_MultiCollectionStats() {
    console.log('\n=== 示例 3: 多集合统计 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 准备测试数据
        const products = generateProducts(200);
        const orders = generateOrders(500);
        const db = monSQLize._adapter.db;

        await db.collection(COLLECTIONS.PRODUCTS).deleteMany({});
        await db.collection(COLLECTIONS.ORDERS).deleteMany({});
        await db.collection(COLLECTIONS.PRODUCTS).insertMany(products);
        await db.collection(COLLECTIONS.ORDERS).insertMany(orders);

        console.log('📊 生成业务报表...\n');

        // 商品统计
        const totalProducts = await collection(COLLECTIONS.PRODUCTS).count();
        const inStockProducts = await collection(COLLECTIONS.PRODUCTS).count({
            query: { inStock: true }
        });
        const outOfStock = totalProducts - inStockProducts;

        console.log('商品统计:');
        console.log(`  总商品数: ${totalProducts}`);
        console.log(`  在库商品: ${inStockProducts}`);
        console.log(`  缺货商品: ${outOfStock}`);

        // 订单统计
        const totalOrders = await collection(COLLECTIONS.ORDERS).count();
        const completedOrders = await collection(COLLECTIONS.ORDERS).count({
            query: { status: 'completed' }
        });
        const pendingOrders = await collection(COLLECTIONS.ORDERS).count({
            query: { status: 'pending' }
        });

        console.log('\n订单统计:');
        console.log(`  总订单数: ${totalOrders}`);
        console.log(`  已完成订单: ${completedOrders}`);
        console.log(`  待处理订单: ${pendingOrders}`);
        console.log(`  完成率: ${((completedOrders / totalOrders) * 100).toFixed(2)}%`);

    } catch (error) {
        console.error('示例 3 出错:', error.message);
    }
}

/**
 * 示例 4: 日期范围统计 - 时间段分析
 */
async function example4_DateRangeCount() {
    console.log('\n=== 示例 4: 日期范围统计 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 3600000);
        const oneWeekAgo = new Date(now - 7 * 24 * 3600000);
        const oneMonthAgo = new Date(now - 30 * 24 * 3600000);

        // 最近 24 小时的订单
        const last24Hours = await collection(COLLECTIONS.ORDERS).count({
            query: { createdAt: { $gte: oneDayAgo } }
        });
        console.log('最近 24 小时订单数:', last24Hours);

        // 最近 7 天的订单
        const last7Days = await collection(COLLECTIONS.ORDERS).count({
            query: { createdAt: { $gte: oneWeekAgo } }
        });
        console.log('最近 7 天订单数:', last7Days);

        // 最近 30 天的订单
        const last30Days = await collection(COLLECTIONS.ORDERS).count({
            query: { createdAt: { $gte: oneMonthAgo } }
        });
        console.log('最近 30 天订单数:', last30Days);

        // 特定日期范围的订单
        const startDate = new Date('2025-01-01');
        const endDate = new Date('2025-02-01');
        const rangeOrders = await collection(COLLECTIONS.ORDERS).count({
            query: {
                createdAt: {
                    $gte: startDate,
                    $lt: endDate
                }
            }
        });
        console.log(`2025年1月订单数: ${rangeOrders}`);

    } catch (error) {
        console.error('示例 4 出错:', error.message);
    }
}

/**
 * 示例 5: 数组字段统计 - 标签和分类
 */
async function example5_ArrayFieldCount() {
    console.log('\n=== 示例 5: 数组字段统计 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 统计包含 'featured' 标签的商品
        const featuredProducts = await collection(COLLECTIONS.PRODUCTS).count({
            query: { tags: 'featured' }
        });
        console.log('精选商品数:', featuredProducts);

        // 统计包含 'hot' 标签的商品
        const hotProducts = await collection(COLLECTIONS.PRODUCTS).count({
            query: { tags: 'hot' }
        });
        console.log('热门商品数:', hotProducts);

        // 统计电子产品类别
        const electronics = await collection(COLLECTIONS.PRODUCTS).count({
            query: { category: 'electronics' }
        });
        console.log('电子产品数:', electronics);

        // 统计图书类别
        const books = await collection(COLLECTIONS.PRODUCTS).count({
            query: { category: 'books' }
        });
        console.log('图书数:', books);

    } catch (error) {
        console.error('示例 5 出错:', error.message);
    }
}

/**
 * 示例 6: 缓存统计 - 性能优化
 */
async function example6_CachedCount() {
    console.log('\n=== 示例 6: 缓存统计 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        console.log('测试缓存性能...\n');

        // 第一次查询（无缓存）
        const startTime1 = Date.now();
        const count1 = await collection(COLLECTIONS.USERS).count({
            query: { status: 'active' },
            cache: 60000  // 缓存 1 分钟
        });
        const time1 = Date.now() - startTime1;

        // 第二次查询（使用缓存）
        const startTime2 = Date.now();
        const count2 = await collection(COLLECTIONS.USERS).count({
            query: { status: 'active' },
            cache: 60000
        });
        const time2 = Date.now() - startTime2;

        // 第三次查询（使用缓存）
        const startTime3 = Date.now();
        const count3 = await collection(COLLECTIONS.USERS).count({
            query: { status: 'active' },
            cache: 60000
        });
        const time3 = Date.now() - startTime3;

        console.log('统计结果:', count1);
        console.log(`首次查询耗时: ${time1} ms`);
        console.log(`第二次查询耗时: ${time2} ms (使用缓存)`);
        console.log(`第三次查询耗时: ${time3} ms (使用缓存)`);

        if (time2 < time1 || time3 < time1) {
            console.log(`✅ 缓存生效，性能提升 ${((time1 / Math.min(time2, time3))).toFixed(2)}x`);
        }

    } catch (error) {
        console.error('示例 6 出错:', error.message);
    }
}

/**
 * 示例 7: 查询执行计划 - 性能分析
 */
async function example7_ExplainCount() {
    console.log('\n=== 示例 7: 查询执行计划 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 查看空查询执行计划
        const plan1 = await collection(COLLECTIONS.USERS).count({
            explain: 'executionStats'
        });

        console.log('空查询执行计划:');
        console.log('  执行时间:', plan1.executionStats?.executionTimeMillis || 0, 'ms');
        console.log('  扫描文档数:', plan1.executionStats?.totalDocsExamined || 0);
        console.log('  是否使用估算:', plan1.command?.estimatedDocumentCount ? '是' : '否');

        // 查看条件查询执行计划
        const plan2 = await collection(COLLECTIONS.USERS).count({
            query: { status: 'active' },
            explain: 'executionStats'
        });

        console.log('\n条件查询执行计划:');
        console.log('  执行时间:', plan2.executionStats?.executionTimeMillis || 0, 'ms');
        console.log('  扫描文档数:', plan2.executionStats?.totalDocsExamined || 0);
        console.log('  扫描索引键数:', plan2.executionStats?.totalKeysExamined || 0);

    } catch (error) {
        console.error('示例 7 出错:', error.message);
    }
}

/**
 * 示例 8: 索引提示 - 强制使用索引
 */
async function example8_HintCount() {
    console.log('\n=== 示例 8: 索引提示 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        const db = monSQLize._adapter.db;
        const nativeCollection = db.collection(COLLECTIONS.USERS);

        // 确保索引存在
        try {
            await nativeCollection.createIndex({ status: 1 }, { name: 'status_idx' });
            console.log('✅ 索引已创建: status_idx');
        } catch (err) {
            console.log('⏭️  索引已存在或创建失败');
        }

        // 使用索引提示
        const count = await collection(COLLECTIONS.USERS).count({
            query: { status: 'active' },
            hint: { status: 1 }
        });

        console.log('使用索引提示统计结果:', count);

    } catch (error) {
        console.error('示例 8 出错:', error.message);
    }
}

/**
 * 示例 9: 错误处理 - 处理统计错误
 */
async function example9_ErrorHandling() {
    console.log('\n=== 示例 9: 错误处理 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        // 测试 1: 查询不存在的集合
        try {
            const count = await collection('nonexistent_collection').count();
            console.log('不存在的集合统计结果:', count);
        } catch (error) {
            console.log('查询不存在的集合:', error.message);
        }

        // 测试 2: 无效的查询条件
        try {
            const count = await collection(COLLECTIONS.USERS).count({
                query: { $invalidOperator: 'value' }
            });
            console.log('无效查询条件统计结果:', count);
        } catch (error) {
            console.log('无效查询条件错误:', error.message);
        }

        // 测试 3: 超时处理
        try {
            const count = await collection(COLLECTIONS.ORDERS).count({
                query: { status: 'completed' },
                maxTimeMS: 1  // 设置极短超时测试
            });
            console.log('超时测试统计结果:', count);
        } catch (error) {
            console.log('超时错误:', error.message.includes('timeout') ? '查询超时' : error.message);
        }

    } catch (error) {
        console.error('示例 9 出错:', error.message);
    }
}

/**
 * 示例 10: 最佳实践 - 综合示例
 */
async function example10_BestPractices() {
    console.log('\n=== 示例 10: 最佳实践 ===');

    const monSQLize = createMonSQLizeInstance();
    const { collection } = await monSQLize.connect();

    try {
        console.log('📊 生成实时仪表板数据...\n');

        // 最佳实践：使用缓存、设置超时、索引优化
        const dashboardStats = await Promise.all([
            // 总用户数（空查询，自动优化）
            collection(COLLECTIONS.USERS).count({
                cache: 300000  // 缓存 5 分钟
            }),

            // 活跃用户数（索引字段，缓存）
            collection(COLLECTIONS.USERS).count({
                query: { status: 'active' },
                cache: 60000,  // 缓存 1 分钟
                maxTimeMS: 5000
            }),

            // VIP 用户数
            collection(COLLECTIONS.USERS).count({
                query: { role: 'vip' },
                cache: 60000,
                maxTimeMS: 5000
            }),

            // 总订单数
            collection(COLLECTIONS.ORDERS).count({
                cache: 300000
            }),

            // 待处理订单数
            collection(COLLECTIONS.ORDERS).count({
                query: { status: 'pending' },
                cache: 30000,  // 缓存 30 秒（更新频繁）
                maxTimeMS: 5000
            }),

            // 已完成订单数
            collection(COLLECTIONS.ORDERS).count({
                query: { status: 'completed' },
                cache: 60000,
                maxTimeMS: 5000
            })
        ]);

        const [totalUsers, activeUsers, vipUsers, totalOrders, pendingOrders, completedOrders] = dashboardStats;

        console.log('用户统计:');
        console.log(`  总用户: ${totalUsers}`);
        console.log(`  活跃用户: ${activeUsers} (${((activeUsers / totalUsers) * 100).toFixed(1)}%)`);
        console.log(`  VIP 用户: ${vipUsers} (${((vipUsers / totalUsers) * 100).toFixed(1)}%)`);

        console.log('\n订单统计:');
        console.log(`  总订单: ${totalOrders}`);
        console.log(`  待处理: ${pendingOrders} (${((pendingOrders / totalOrders) * 100).toFixed(1)}%)`);
        console.log(`  已完成: ${completedOrders} (${((completedOrders / totalOrders) * 100).toFixed(1)}%)`);

        console.log('\n✅ 使用了缓存、超时控制和并发查询优化');

    } catch (error) {
        console.error('示例 10 出错:', error.message);
    }
}

// ============================================================================
// 主执行函数
// ============================================================================

/**
 * 运行所有示例
 */
async function runAllExamples() {
    console.log('🚀 开始运行 count 方法示例集\n');

    try {
        await example1_BasicCount();
        await example2_ConditionalCount();
        await example3_MultiCollectionStats();
        await example4_DateRangeCount();
        await example5_ArrayFieldCount();
        await example6_CachedCount();
        await example7_ExplainCount();
        await example8_HintCount();
        await example9_ErrorHandling();
        await example10_BestPractices();

        console.log('\n✅ 所有示例运行完成');

    } catch (error) {
        console.error('\n❌ 示例运行失败:', error.message);
    }
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    runAllExamples,
    example1_BasicCount,
    example2_ConditionalCount,
    example3_MultiCollectionStats,
    example4_DateRangeCount,
    example5_ArrayFieldCount,
    example6_CachedCount,
    example7_ExplainCount,
    example8_HintCount,
    example9_ErrorHandling,
    example10_BestPractices
};

