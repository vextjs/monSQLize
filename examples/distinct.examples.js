/**
 * distinct 方法完整示例集
 * 演示各种使用场景和最佳实践
 */

const MonSQLize = require('../lib');

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
    REVIEWS: 'reviews',
    TAGS: 'tags'
};

// 数据量配置
const DATA_SIZE = {
    USERS: 50,
    PRODUCTS: 100,
    ORDERS: 150,
    REVIEWS: 200
};

// ============================================================================
// 数据准备和清理工具函数
// ============================================================================

// 全局标志：标记索引是否已经检查过
let indexesChecked = false;
// 全局标志：标记是否已经提示过数据存在
let dataExistenceNotified = false;

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
    const roles = ['user', 'admin', 'vip', 'moderator'];
    const statuses = ['active', 'inactive', 'pending', 'banned'];
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉'];

    for (let i = 1; i <= count; i++) {
        users.push({
            userId: `USER-${String(i).padStart(5, '0')}`,
            name: `用户${i}`,
            username: i % 2 === 0 ? `user${i}` : `User${i}`, // 测试大小写
            email: `user${i}@example.com`,
            status: statuses[i % statuses.length],
            role: roles[i % roles.length],
            level: (i % 10) + 1,
            verified: i % 3 !== 0,
            address: {
                city: cities[i % cities.length],
                country: i % 2 === 0 ? 'China' : 'USA'
            },
            tags: i % 3 === 0 ? ['vip', 'premium'] : i % 2 === 0 ? ['active'] : [],
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
    const categories = ['electronics', 'books', 'clothing', 'food', 'toys'];
    const brands = ['BrandA', 'BrandB', 'BrandC', 'BrandD'];
    const colors = ['red', 'blue', 'green', 'black', 'white'];

    for (let i = 1; i <= count; i++) {
        const tags = [];
        if (i % 5 === 0) tags.push('sale', 'hot');
        if (i % 3 === 0) tags.push('new');
        if (i % 7 === 0) tags.push('recommended');

        products.push({
            productId: `PROD-${String(i).padStart(5, '0')}`,
            name: `商品${i}`,
            category: categories[i % categories.length],
            brand: brands[i % brands.length],
            color: colors[i % colors.length],
            price: Math.floor(Math.random() * 5000) + 50,
            inStock: i % 4 !== 0,
            sales: Math.floor(Math.random() * 1000),
            rating: 3 + Math.random() * 2,
            tags: tags,
            specs: {
                weight: Math.floor(Math.random() * 1000) + 100,
                size: i % 3 === 0 ? 'large' : i % 2 === 0 ? 'medium' : 'small'
            },
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
    const statuses = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    const paymentMethods = ['credit_card', 'paypal', 'alipay', 'wechat'];

    for (let i = 1; i <= count; i++) {
        orders.push({
            orderId: `ORD-${String(i).padStart(5, '0')}`,
            customerId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            status: statuses[i % statuses.length],
            amount: Math.floor(Math.random() * 5000) + 100,
            currency: i % 3 === 0 ? 'USD' : 'CNY',
            payment: {
                method: paymentMethods[i % paymentMethods.length],
                status: i % 3 === 0 ? 'completed' : 'pending'
            },
            year: 2020 + (i % 5),
            month: (i % 12) + 1,
            createdAt: new Date(Date.now() - i * 21600000),
            updatedAt: new Date()
        });
    }
    return orders;
}

/**
 * 生成评论数据
 * @param {number} count - 生成数量
 * @returns {Array} 评论数据数组
 */
function generateReviews(count) {
    const reviews = [];
    const sentiments = ['positive', 'negative', 'neutral'];
    const languages = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];

    for (let i = 1; i <= count; i++) {
        reviews.push({
            reviewId: `REV-${String(i).padStart(5, '0')}`,
            productId: `PROD-${String((i % 100) + 1).padStart(5, '0')}`,
            userId: `USER-${String((i % 50) + 1).padStart(5, '0')}`,
            rating: (i % 5) + 1,
            sentiment: sentiments[i % sentiments.length],
            language: languages[i % languages.length],
            verified: i % 2 === 0,
            helpful: i % 3 === 0,
            createdAt: new Date(Date.now() - i * 10800000),
            updatedAt: new Date()
        });
    }
    return reviews;
}

/**
 * 确保索引存在
 * @param {Object} db - MongoDB 数据库实例
 */
async function ensureIndexes(db) {
    if (indexesChecked) return;

    console.log('🔧 检查并创建索引...');

    const indexes = [
        {
            collection: COLLECTIONS.USERS,
            spec: { role: 1 },
            name: 'idx_users_role'
        },
        {
            collection: COLLECTIONS.USERS,
            spec: { status: 1 },
            name: 'idx_users_status'
        },
        {
            collection: COLLECTIONS.USERS,
            spec: { 'address.city': 1 },
            name: 'idx_users_city'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { category: 1 },
            name: 'idx_products_category'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { brand: 1 },
            name: 'idx_products_brand'
        },
        {
            collection: COLLECTIONS.PRODUCTS,
            spec: { inStock: 1, category: 1 },
            name: 'idx_products_inStock_category'
        },
        {
            collection: COLLECTIONS.ORDERS,
            spec: { status: 1 },
            name: 'idx_orders_status'
        },
        {
            collection: COLLECTIONS.ORDERS,
            spec: { year: 1 },
            name: 'idx_orders_year'
        }
    ];

    for (const indexDef of indexes) {
        try {
            const coll = db.collection(indexDef.collection);
            const existingIndexes = await coll.indexes();
            const exists = existingIndexes.some(idx => idx.name === indexDef.name);

            if (!exists) {
                await coll.createIndex(indexDef.spec, { name: indexDef.name });
                console.log(`  ✅ 创建索引: ${indexDef.collection}.${indexDef.name}`);
            }
        } catch (error) {
            console.log(`  ⚠️  索引创建失败: ${indexDef.name}`);
        }
    }

    indexesChecked = true;
    console.log('✅ 索引检查完成\n');
}

/**
 * 准备示例数据
 * @param {Object} msq - MonSQLize 实例
 */
async function prepareExampleData(msq) {
    if (!dataExistenceNotified) {
        console.log('🔧 准备示例数据...');
    }

    const db = msq._adapter.db;

    // 检查是否已有数据
    const usersCount = await db.collection(COLLECTIONS.USERS).countDocuments();
    const productsCount = await db.collection(COLLECTIONS.PRODUCTS).countDocuments();
    const ordersCount = await db.collection(COLLECTIONS.ORDERS).countDocuments();
    const reviewsCount = await db.collection(COLLECTIONS.REVIEWS).countDocuments();

    if (usersCount > 0 && productsCount > 0 && ordersCount > 0 && reviewsCount > 0) {
        if (!dataExistenceNotified) {
            console.log('✅ 数据库已有数据，跳过插入');
            dataExistenceNotified = true;
        }
        await ensureIndexes(db);
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

    // 插入评论数据
    const reviews = generateReviews(DATA_SIZE.REVIEWS);
    await db.collection(COLLECTIONS.REVIEWS).insertMany(reviews);
    console.log(`  ✅ 插入 ${reviews.length} 条评论数据`);

    await ensureIndexes(db);

    return { needCleanup: true };
}

/**
 * 清理示例数据
 * @param {Object} msq - MonSQLize 实例
 */
async function cleanupExampleData(msq) {
    console.log('\n🧹 清理示例数据...');
    const db = msq._adapter.db;

    await db.collection(COLLECTIONS.USERS).deleteMany({});
    await db.collection(COLLECTIONS.PRODUCTS).deleteMany({});
    await db.collection(COLLECTIONS.ORDERS).deleteMany({});
    await db.collection(COLLECTIONS.REVIEWS).deleteMany({});

    console.log('✅ 数据清理完成');
}

// ============================================================================
// 示例 1: 基础去重查询
// ============================================================================

async function example01_basicDistinct() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 1: 基础去重查询');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n1.1 获取所有商品分类');
        console.log('-'.repeat(80));
        const categories = await collection(COLLECTIONS.PRODUCTS).distinct('category');
        console.log('商品分类:', categories);
        console.log('分类数量:', categories.length);

        console.log('\n1.2 获取所有用户角色');
        console.log('-'.repeat(80));
        const roles = await collection(COLLECTIONS.USERS).distinct('role');
        console.log('用户角色:', roles);
        console.log('角色数量:', roles.length);

        console.log('\n1.3 获取所有订单状态');
        console.log('-'.repeat(80));
        const statuses = await collection(COLLECTIONS.ORDERS).distinct('status');
        console.log('订单状态:', statuses);
        console.log('状态数量:', statuses.length);

        console.log('\n1.4 获取所有订单年份');
        console.log('-'.repeat(80));
        const years = await collection(COLLECTIONS.ORDERS).distinct('year');
        console.log('订单年份:', years.sort());
        console.log('年份数量:', years.length);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 2: 带条件的去重查询
// ============================================================================

async function example02_distinctWithQuery() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 2: 带条件的去重查询');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n2.1 获取在售商品的分类');
        console.log('-'.repeat(80));
        const inStockCategories = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            query: { inStock: true }
        });
        console.log('在售商品分类:', inStockCategories);

        console.log('\n2.2 获取活跃用户的角色');
        console.log('-'.repeat(80));
        const activeRoles = await collection(COLLECTIONS.USERS).distinct('role', {
            query: { status: 'active' }
        });
        console.log('活跃用户角色:', activeRoles);

        console.log('\n2.3 获取已完成订单的客户ID（前5个）');
        console.log('-'.repeat(80));
        const completedCustomers = await collection(COLLECTIONS.ORDERS).distinct('customerId', {
            query: { status: 'completed' }
        });
        console.log('已完成订单的客户数:', completedCustomers.length);
        console.log('示例客户ID:', completedCustomers.slice(0, 5));

        console.log('\n2.4 获取高价商品（>=1000元）的品牌');
        console.log('-'.repeat(80));
        const expensiveBrands = await collection(COLLECTIONS.PRODUCTS).distinct('brand', {
            query: { price: { $gte: 1000 } }
        });
        console.log('高价商品品牌:', expensiveBrands);

        console.log('\n2.5 获取2023年订单的支付方式');
        console.log('-'.repeat(80));
        const payment2023 = await collection(COLLECTIONS.ORDERS).distinct('payment.method', {
            query: { year: 2023 }
        });
        console.log('2023年支付方式:', payment2023);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 3: 嵌套字段去重
// ============================================================================

async function example03_nestedFieldDistinct() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 3: 嵌套字段去重');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n3.1 获取所有用户的城市');
        console.log('-'.repeat(80));
        const cities = await collection(COLLECTIONS.USERS).distinct('address.city');
        console.log('用户所在城市:', cities);
        console.log('城市数量:', cities.length);

        console.log('\n3.2 获取所有用户的国家');
        console.log('-'.repeat(80));
        const countries = await collection(COLLECTIONS.USERS).distinct('address.country');
        console.log('用户所在国家:', countries);

        console.log('\n3.3 获取所有订单的支付方式');
        console.log('-'.repeat(80));
        const paymentMethods = await collection(COLLECTIONS.ORDERS).distinct('payment.method');
        console.log('支付方式:', paymentMethods);

        console.log('\n3.4 获取所有商品的尺寸规格');
        console.log('-'.repeat(80));
        const sizes = await collection(COLLECTIONS.PRODUCTS).distinct('specs.size');
        console.log('商品尺寸:', sizes);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 4: 数组字段去重（自动展开）
// ============================================================================

async function example04_arrayFieldDistinct() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 4: 数组字段去重（自动展开）');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n4.1 获取所有商品标签（自动展开数组）');
        console.log('-'.repeat(80));
        const productTags = await collection(COLLECTIONS.PRODUCTS).distinct('tags');
        console.log('所有商品标签:', productTags);
        console.log('标签数量:', productTags.length);

        console.log('\n4.2 获取所有用户标签');
        console.log('-'.repeat(80));
        const userTags = await collection(COLLECTIONS.USERS).distinct('tags');
        console.log('所有用户标签:', userTags);
        console.log('标签数量:', userTags.length);

        console.log('\n4.3 获取热门商品的标签');
        console.log('-'.repeat(80));
        const hotTags = await collection(COLLECTIONS.PRODUCTS).distinct('tags', {
            query: { sales: { $gte: 500 } }
        });
        console.log('热门商品标签:', hotTags);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 5: 不区分大小写的去重
// ============================================================================

async function example05_caseInsensitiveDistinct() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 5: 不区分大小写的去重');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n5.1 默认去重（区分大小写）');
        console.log('-'.repeat(80));
        const usernamesDefault = await collection(COLLECTIONS.USERS).distinct('username');
        console.log('用户名数量（区分大小写）:', usernamesDefault.length);
        console.log('示例用户名:', usernamesDefault.slice(0, 10));

        console.log('\n5.2 不区分大小写去重');
        console.log('-'.repeat(80));
        const usernamesCaseInsensitive = await collection(COLLECTIONS.USERS).distinct('username', {
            collation: {
                locale: 'en',
                strength: 1  // 1 = 忽略大小写和重音
            }
        });
        console.log('用户名数量（不区分大小写）:', usernamesCaseInsensitive.length);
        console.log('示例用户名:', usernamesCaseInsensitive.slice(0, 10));

        console.log('\n5.3 对比说明');
        console.log('-'.repeat(80));
        console.log('区分大小写时，"user1" 和 "User1" 被视为不同值');
        console.log('不区分大小写时，它们被视为相同值');
        console.log(`差异: ${usernamesDefault.length - usernamesCaseInsensitive.length} 个重复值`);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 6: 复杂查询条件
// ============================================================================

async function example06_complexQueryDistinct() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 6: 复杂查询条件');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n6.1 获取高评分（>=4分）商品的分类');
        console.log('-'.repeat(80));
        const highRatedCategories = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            query: { rating: { $gte: 4 } }
        });
        console.log('高评分商品分类:', highRatedCategories);

        console.log('\n6.2 获取VIP用户所在的城市');
        console.log('-'.repeat(80));
        const vipCities = await collection(COLLECTIONS.USERS).distinct('address.city', {
            query: {
                role: 'vip',
                status: 'active'
            }
        });
        console.log('VIP用户城市:', vipCities);

        console.log('\n6.3 获取近30天订单的货币类型');
        console.log('-'.repeat(80));
        const recentDate = new Date(Date.now() - 30 * 86400000);
        const recentCurrencies = await collection(COLLECTIONS.ORDERS).distinct('currency', {
            query: {
                createdAt: { $gte: recentDate }
            }
        });
        console.log('近30天货币类型:', recentCurrencies);

        console.log('\n6.4 获取已验证的正面评论的语言');
        console.log('-'.repeat(80));
        const languages = await collection(COLLECTIONS.REVIEWS).distinct('language', {
            query: {
                verified: true,
                sentiment: 'positive',
                rating: { $gte: 4 }
            }
        });
        console.log('正面评论语言:', languages);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 7: 启用缓存
// ============================================================================

async function example07_distinctWithCache() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 7: 启用缓存');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n7.1 第一次查询（无缓存）');
        console.log('-'.repeat(80));
        const start1 = Date.now();
        const categories1 = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            cache: 60000  // 缓存 60 秒
        });
        const time1 = Date.now() - start1;
        console.log('商品分类:', categories1);
        console.log('查询耗时:', time1, 'ms');

        console.log('\n7.2 第二次查询（使用缓存）');
        console.log('-'.repeat(80));
        const start2 = Date.now();
        const categories2 = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            cache: 60000
        });
        const time2 = Date.now() - start2;
        console.log('商品分类:', categories2);
        console.log('查询耗时:', time2, 'ms');
        console.log('性能提升:', ((time1 - time2) / time1 * 100).toFixed(2), '%');

        console.log('\n7.3 缓存用户角色列表（10分钟）');
        console.log('-'.repeat(80));
        const roles = await collection(COLLECTIONS.USERS).distinct('role', {
            query: { status: 'active' },
            cache: 10 * 60 * 1000  // 缓存 10 分钟
        });
        console.log('活跃用户角色:', roles);
        console.log('✅ 结果已缓存 10 分钟');

        console.log('\n7.4 手动清除缓存');
        console.log('-'.repeat(80));
        const deleted = await collection(COLLECTIONS.PRODUCTS).invalidate('distinct');
        console.log('已清除缓存键数量:', deleted);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 8: 性能分析（explain）
// ============================================================================

async function example08_distinctExplain() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 8: 性能分析（explain）');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n8.1 查看查询执行计划');
        console.log('-'.repeat(80));
        const plan1 = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            explain: 'executionStats'
        });

        console.log('查询阶段:', plan1.queryPlanner?.winningPlan?.stage || 'N/A');
        console.log('扫描文档数:', plan1.executionStats?.totalDocsExamined || 'N/A');
        console.log('返回结果数:', plan1.executionStats?.nReturned || 'N/A');
        console.log('执行时间:', plan1.executionStats?.executionTimeMillis || 'N/A', 'ms');

        console.log('\n8.2 带查询条件的执行计划');
        console.log('-'.repeat(80));
        const plan2 = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            query: { inStock: true },
            explain: 'executionStats'
        });

        console.log('查询阶段:', plan2.queryPlanner?.winningPlan?.stage || 'N/A');
        console.log('扫描文档数:', plan2.executionStats?.totalDocsExamined || 'N/A');
        console.log('执行时间:', plan2.executionStats?.executionTimeMillis || 'N/A', 'ms');
        console.log('使用索引:', plan2.queryPlanner?.winningPlan?.inputStage?.indexName || '无');

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 9: 实际应用场景
// ============================================================================

async function example09_practicalUseCases() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 9: 实际应用场景');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n9.1 构建筛选器选项（电商网站）');
        console.log('-'.repeat(80));
        const filterOptions = {
            categories: await collection(COLLECTIONS.PRODUCTS).distinct('category', {
                query: { inStock: true },
                cache: 5 * 60 * 1000  // 缓存5分钟
            }),
            brands: await collection(COLLECTIONS.PRODUCTS).distinct('brand', {
                query: { inStock: true },
                cache: 5 * 60 * 1000
            }),
            colors: await collection(COLLECTIONS.PRODUCTS).distinct('color', {
                query: { inStock: true },
                cache: 5 * 60 * 1000
            })
        };
        console.log('筛选器选项:', JSON.stringify(filterOptions, null, 2));

        console.log('\n9.2 获取用户管理面板的角色列表');
        console.log('-'.repeat(80));
        const adminRoles = await collection(COLLECTIONS.USERS).distinct('role', {
            cache: 10 * 60 * 1000  // 缓存10分钟
        });
        console.log('可用角色:', adminRoles);

        console.log('\n9.3 订单报表：获取所有订单年份（用于下拉选择）');
        console.log('-'.repeat(80));
        const orderYears = await collection(COLLECTIONS.ORDERS).distinct('year');
        console.log('订单年份:', orderYears.sort().reverse());  // 降序排列

        console.log('\n9.4 多语言内容统计');
        console.log('-'.repeat(80));
        const contentLanguages = await collection(COLLECTIONS.REVIEWS).distinct('language');
        console.log('支持的语言:', contentLanguages);
        console.log('语言数量:', contentLanguages.length);

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 示例 10: 错误处理和边界情况
// ============================================================================

async function example10_errorHandling() {
    console.log('\n' + '='.repeat(80));
    console.log('示例 10: 错误处理和边界情况');
    console.log('='.repeat(80));

    const msq = createMonSQLizeInstance();

    try {
        const { collection } = await msq.connect();
        const { needCleanup } = await prepareExampleData(msq);

        console.log('\n10.1 处理空结果');
        console.log('-'.repeat(80));
        const emptyResult = await collection(COLLECTIONS.PRODUCTS).distinct('category', {
            query: { price: { $gt: 999999 } }  // 不存在的条件
        });
        console.log('空结果:', emptyResult);
        console.log('结果类型:', Array.isArray(emptyResult) ? '数组' : typeof emptyResult);
        console.log('结果长度:', emptyResult.length);

        console.log('\n10.2 处理不存在的字段');
        console.log('-'.repeat(80));
        const nonExistField = await collection(COLLECTIONS.PRODUCTS).distinct('nonExistentField');
        console.log('不存在字段的结果:', nonExistField);
        console.log('结果长度:', nonExistField.length);

        console.log('\n10.3 处理null值');
        console.log('-'.repeat(80));
        // 插入一些包含 null 值的测试数据
        const db = msq._adapter.db;
        await db.collection('test_null').insertMany([
            { name: 'A', category: 'test1' },
            { name: 'B', category: null },
            { name: 'C', category: 'test2' },
            { name: 'D' }  // category 字段不存在
        ]);

        const categoriesWithNull = await collection('test_null').distinct('category');
        console.log('包含null的结果:', categoriesWithNull);
        console.log('说明: null 和 undefined 会被视为一个唯一值');

        // 排除 null 值的查询
        const categoriesWithoutNull = await collection('test_null').distinct('category', {
            query: { category: { $ne: null } }
        });
        console.log('排除null的结果:', categoriesWithoutNull);

        // 清理测试数据
        await db.collection('test_null').drop();

        console.log('\n10.4 超时处理');
        console.log('-'.repeat(80));
        try {
            await collection(COLLECTIONS.PRODUCTS).distinct('category', {
                maxTimeMS: 1  // 设置极短的超时时间
            });
        } catch (error) {
            console.log('捕获到超时错误:', error.message);
        }

        if (needCleanup) {
            await cleanupExampleData(msq);
        }
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
    }
}

// ============================================================================
// 主函数：运行所有示例
// ============================================================================

async function runAllExamples() {
    console.log('\n');
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(22) + 'distinct 方法完整示例集' + ' '.repeat(22) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');

    const examples = [
        { name: '示例 1: 基础去重查询', fn: example01_basicDistinct },
        { name: '示例 2: 带条件的去重查询', fn: example02_distinctWithQuery },
        { name: '示例 3: 嵌套字段去重', fn: example03_nestedFieldDistinct },
        { name: '示例 4: 数组字段去重', fn: example04_arrayFieldDistinct },
        { name: '示例 5: 不区分大小写的去重', fn: example05_caseInsensitiveDistinct },
        { name: '示例 6: 复杂查询条件', fn: example06_complexQueryDistinct },
        { name: '示例 7: 启用缓存', fn: example07_distinctWithCache },
        { name: '示例 8: 性能分析', fn: example08_distinctExplain },
        { name: '示例 9: 实际应用场景', fn: example09_practicalUseCases },
        { name: '示例 10: 错误处理', fn: example10_errorHandling }
    ];

    for (let i = 0; i < examples.length; i++) {
        try {
            await examples[i].fn();
        } catch (error) {
            console.error(`\n❌ ${examples[i].name} 执行失败:`, error.message);
        }

        if (i < examples.length - 1) {
            console.log('\n');
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ 所有示例执行完成！');
    console.log('='.repeat(80) + '\n');
}

// ============================================================================
// 执行示例
// ============================================================================

if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    example01_basicDistinct,
    example02_distinctWithQuery,
    example03_nestedFieldDistinct,
    example04_arrayFieldDistinct,
    example05_caseInsensitiveDistinct,
    example06_complexQueryDistinct,
    example07_distinctWithCache,
    example08_distinctExplain,
    example09_practicalUseCases,
    example10_errorHandling
};
