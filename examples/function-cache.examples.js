/**
 * 函数缓存使用示例
 * 演示 withCache 和 FunctionCache 的各种使用场景
 */

const MonSQLize = require('../lib/index');
const { withCache, FunctionCache } = require('../lib/index');

// ============================================
// 示例配置
// ============================================

const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'function_cache_examples',
    config: { useMemoryServer: true },
    cache: {
        multiLevel: false,  // 使用本地缓存演示
        local: {
            maxSize: 1000,
            enableStats: true
        }
    }
};

// ============================================
// 示例 1：基础装饰器用法
// ============================================

async function example1_basicDecorator() {
    console.log('\n=== 示例 1：基础装饰器用法 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    // 业务函数：查询用户资料
    async function getUserProfile(userId) {
        console.log(`  📊 从数据库查询用户: ${userId}`);
        const user = await msq.collection('users').findOne({ _id: userId });
        return user || { _id: userId, name: `User ${userId}`, email: `user${userId}@example.com` };
    }

    // 应用缓存（5秒 TTL）
    const cachedGetUserProfile = withCache(getUserProfile, {
        ttl: 5000,
        cache: msq.getCache()
    });

    console.log('第1次调用（缓存 miss）:');
    const result1 = await cachedGetUserProfile('user123');
    console.log('  结果:', result1);

    console.log('\n第2次调用（缓存 hit）:');
    const result2 = await cachedGetUserProfile('user123');
    console.log('  结果:', result2);

    console.log('\n缓存统计:');
    console.log(cachedGetUserProfile.getCacheStats());

    await msq.close();
    console.log('\n✅ 示例 1 完成\n');
}

// ============================================
// 示例 2：自定义键生成器
// ============================================

async function example2_customKeyBuilder() {
    console.log('\n=== 示例 2：自定义键生成器 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    // 业务函数：获取用户订单统计
    async function getUserOrderStats(userId, year) {
        console.log(`  📊 计算用户订单统计: ${userId}, ${year}`);
        return {
            userId,
            year,
            totalOrders: Math.floor(Math.random() * 100),
            totalAmount: Math.floor(Math.random() * 10000)
        };
    }

    // 使用自定义键生成器
    const cachedGetStats = withCache(getUserOrderStats, {
        ttl: 60000,
        keyBuilder: (userId, year) => `stats:${userId}:${year}`,
        cache: msq.getCache()
    });

    console.log('查询 user123 的 2024 年统计:');
    const stats1 = await cachedGetStats('user123', 2024);
    console.log('  结果:', stats1);

    console.log('\n再次查询（缓存命中）:');
    const stats2 = await cachedGetStats('user123', 2024);
    console.log('  结果:', stats2);

    await msq.close();
    console.log('\n✅ 示例 2 完成\n');
}

// ============================================
// 示例 3：条件缓存
// ============================================

async function example3_conditionalCache() {
    console.log('\n=== 示例 3：条件缓存 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    // 业务函数：搜索活跃用户
    async function findActiveUsers(minAge) {
        console.log(`  📊 搜索活跃用户（年龄 >= ${minAge}）`);
        if (minAge < 18) {
            return []; // 未成年用户不返回
        }
        return [
            { name: 'Alice', age: 25 },
            { name: 'Bob', age: 30 }
        ];
    }

    // 只缓存非空结果
    const cachedFindUsers = withCache(findActiveUsers, {
        ttl: 60000,
        condition: (result) => result && result.length > 0,
        cache: msq.getCache()
    });

    console.log('查询成年用户（会被缓存）:');
    await cachedFindUsers(18);
    await cachedFindUsers(18);
    console.log('  调用次数: 1（第二次命中缓存）');

    console.log('\n查询未成年用户（不会被缓存）:');
    await cachedFindUsers(10);
    await cachedFindUsers(10);
    console.log('  调用次数: 2（每次都重新查询）');

    await msq.close();
    console.log('\n✅ 示例 3 完成\n');
}

// ============================================
// 示例 4：FunctionCache 类管理多个函数
// ============================================

async function example4_functionCacheClass() {
    console.log('\n=== 示例 4：FunctionCache 类 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    // 创建函数缓存管理器
    const fnCache = new FunctionCache(msq, {
        namespace: 'myApp',
        defaultTTL: 60000
    });

    // 注册多个业务函数
    fnCache.register('getUserProfile', async (userId) => {
        console.log(`  📊 获取用户资料: ${userId}`);
        return { userId, name: `User ${userId}` };
    }, { ttl: 300000 }); // 5分钟

    fnCache.register('getOrderCount', async (userId) => {
        console.log(`  📊 获取订单数量: ${userId}`);
        return { userId, count: Math.floor(Math.random() * 100) };
    }, { ttl: 60000 }); // 1分钟

    // 执行函数
    console.log('执行 getUserProfile:');
    await fnCache.execute('getUserProfile', 'user123');
    await fnCache.execute('getUserProfile', 'user123'); // 缓存命中

    console.log('\n执行 getOrderCount:');
    await fnCache.execute('getOrderCount', 'user123');
    await fnCache.execute('getOrderCount', 'user123'); // 缓存命中

    console.log('\n列出所有已注册的函数:');
    console.log('  ', fnCache.list());

    console.log('\n查看统计信息:');
    console.log('  getUserProfile:', fnCache.getStats('getUserProfile'));
    console.log('  getOrderCount:', fnCache.getStats('getOrderCount'));

    await msq.close();
    console.log('\n✅ 示例 4 完成\n');
}

// ============================================
// 示例 5：缓存失效
// ============================================

async function example5_cacheInvalidation() {
    console.log('\n=== 示例 5：缓存失效 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    const fnCache = new FunctionCache(msq, {
        namespace: 'myApp',
        defaultTTL: 60000
    });

    let callCount = 0;
    fnCache.register('getUser', async (userId) => {
        callCount++;
        console.log(`  📊 查询用户（第 ${callCount} 次）: ${userId}`);
        return { userId, name: `User ${userId}`, version: callCount };
    });

    console.log('首次查询:');
    const result1 = await fnCache.execute('getUser', 'user123');
    console.log('  结果:', result1);

    console.log('\n再次查询（缓存命中）:');
    const result2 = await fnCache.execute('getUser', 'user123');
    console.log('  结果:', result2);

    console.log('\n失效缓存:');
    await fnCache.invalidate('getUser', 'user123');
    console.log('  ✅ 缓存已失效');

    console.log('\n再次查询（重新从数据库获取）:');
    const result3 = await fnCache.execute('getUser', 'user123');
    console.log('  结果:', result3);

    await msq.close();
    console.log('\n✅ 示例 5 完成\n');
}

// ============================================
// 示例 6：复杂参数场景
// ============================================

async function example6_complexParameters() {
    console.log('\n=== 示例 6：复杂参数场景 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    // 业务函数：搜索商品
    async function searchProducts(filters, options) {
        console.log('  📊 搜索商品:', JSON.stringify(filters));
        return [
            { id: 1, name: 'Product A', price: 100 },
            { id: 2, name: 'Product B', price: 200 }
        ];
    }

    // 应用缓存（自动序列化复杂参数）
    const cachedSearch = withCache(searchProducts, {
        ttl: 60000,
        cache: msq.getCache()
    });

    console.log('首次搜索:');
    await cachedSearch(
        { category: 'electronics', priceRange: { min: 100, max: 500 } },
        { sort: { price: 1 }, limit: 10 }
    );

    console.log('\n再次搜索（键顺序不同，但内容相同）:');
    await cachedSearch(
        { priceRange: { min: 100, max: 500 }, category: 'electronics' }, // 键顺序不同
        { limit: 10, sort: { price: 1 } }
    );
    console.log('  ✅ 缓存命中（对象键自动排序）');

    await msq.close();
    console.log('\n✅ 示例 6 完成\n');
}

// ============================================
// 示例 7：命名空间隔离
// ============================================

async function example7_namespaceIsolation() {
    console.log('\n=== 示例 7：命名空间隔离 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    // 创建不同命名空间的缓存管理器
    const userCache = new FunctionCache(msq, {
        namespace: 'user',
        defaultTTL: 300000
    });

    const productCache = new FunctionCache(msq, {
        namespace: 'product',
        defaultTTL: 60000
    });

    // 注册同名函数（不同命名空间）
    userCache.register('getProfile', async (id) => {
        console.log(`  📊 [USER] 获取资料: ${id}`);
        return { type: 'user', id };
    });

    productCache.register('getProfile', async (id) => {
        console.log(`  📊 [PRODUCT] 获取资料: ${id}`);
        return { type: 'product', id };
    });

    console.log('执行用户缓存:');
    await userCache.execute('getProfile', '123');

    console.log('\n执行商品缓存:');
    await productCache.execute('getProfile', '123');

    console.log('\n✅ 不同命名空间，缓存相互隔离');

    await msq.close();
    console.log('\n✅ 示例 7 完成\n');
}

// ============================================
// 示例 8：并发控制
// ============================================

async function example8_concurrencyControl() {
    console.log('\n=== 示例 8：并发控制（防止缓存击穿）===\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    let callCount = 0;
    async function slowQuery(userId) {
        callCount++;
        console.log(`  📊 执行慢查询（第 ${callCount} 次）: ${userId}`);
        await new Promise(resolve => setTimeout(resolve, 100)); // 模拟慢查询
        return { userId, data: 'result' };
    }

    const cachedSlowQuery = withCache(slowQuery, {
        ttl: 60000,
        cache: msq.getCache()
    });

    console.log('并发发起 5 个相同请求:');
    const startTime = Date.now();
    const results = await Promise.all([
        cachedSlowQuery('user123'),
        cachedSlowQuery('user123'),
        cachedSlowQuery('user123'),
        cachedSlowQuery('user123'),
        cachedSlowQuery('user123')
    ]);
    const duration = Date.now() - startTime;

    console.log(`  耗时: ${duration}ms`);
    console.log(`  实际调用次数: ${callCount} 次（只调用一次）`);
    console.log('  ✅ 并发请求共享结果，防止缓存击穿');

    await msq.close();
    console.log('\n✅ 示例 8 完成\n');
}

// ============================================
// 主函数：运行所有示例
// ============================================

async function main() {
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     monSQLize 函数缓存功能使用示例            ║');
    console.log('╚════════════════════════════════════════════════╝');

    try {
        await example1_basicDecorator();
        await example2_customKeyBuilder();
        await example3_conditionalCache();
        await example4_functionCacheClass();
        await example5_cacheInvalidation();
        await example6_complexParameters();
        await example7_namespaceIsolation();
        await example8_concurrencyControl();

        console.log('╔════════════════════════════════════════════════╗');
        console.log('║     所有示例执行完成！                        ║');
        console.log('╚════════════════════════════════════════════════╝');

        // 关闭 MongoDB Memory Server
        const { stopMemoryServer } = require('../lib/mongodb/connect');
        await stopMemoryServer();
        console.log('\n✅ MongoDB Memory Server 已关闭');

        // 强制退出进程
        process.exit(0);
    } catch (error) {
        console.error('❌ 错误:', error);
        process.exit(1);
    }
}

// 运行示例
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ 未捕获的错误:', error);
        process.exit(1);
    });
}

module.exports = {
    example1_basicDecorator,
    example2_customKeyBuilder,
    example3_conditionalCache,
    example4_functionCacheClass,
    example5_cacheInvalidation,
    example6_complexParameters,
    example7_namespaceIsolation,
    example8_concurrencyControl
};

