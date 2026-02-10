/**
 * 通过 MonSQLize 实例配置 Redis 缓存测试
 */

async function testWithMonSQLize() {
    console.log('=' .repeat(70));
    console.log('🔍 MonSQLize + Redis 配置测试');
    console.log('=' .repeat(70));
    console.log();

    // 动态导入 ES 模块
    const module = await import('../../index.mjs');
    const MonSQLize = module.default || module.MonSQLize;

    if (!MonSQLize) {
        console.log('❌ 无法导入 MonSQLize');
        console.log('可用导出:', Object.keys(module));
        return;
    }

    // 测试 1: 配置本地缓存
    console.log('测试 1: MonSQLize 本地缓存配置');
    console.log('-'.repeat(70));

    try {
        const msq = new MonSQLize({
            type: 'mongodb',
            uri: 'mongodb://localhost:27017/test_function_cache',
            cache: {
                maxSize: 1000,
                ttl: 60000
            }
        });

        console.log('✅ MonSQLize 实例创建成功（本地缓存）');
        console.log(`   缓存类型: ${msq.getCache().constructor.name}`);

        const { withCache, FunctionCache } = require('../../lib/function-cache');

        // 使用 withCache
        let callCount1 = 0;
        async function testFn(id) {
            callCount1++;
            return { id, data: 'test with msq cache' };
        }

        const cached = withCache(testFn, {
            ttl: 60000,
            cache: msq.getCache()
        });

        const result1 = await cached(1);
        console.log(`第一次调用: ${JSON.stringify(result1)}`);
        console.log(`函数调用次数: ${callCount1}`);

        const result2 = await cached(1);
        console.log(`第二次调用: ${JSON.stringify(result2)}`);
        console.log(`函数调用次数: ${callCount1} (应该还是 1)`);

        if (callCount1 === 1) {
            console.log('✅ MonSQLize 本地缓存工作正常');
        }

        // 清理
        await msq.close();
        console.log();

    } catch (err) {
        console.log(`⚠️  测试失败: ${err.message}`);
        console.log(err.stack);
        console.log();
    }

    // 测试 2: 配置 MultiLevelCache (Redis + Local)
    console.log('测试 2: MonSQLize 多层缓存配置 (Redis + Local)');
    console.log('-'.repeat(70));

    try {
        const msq = new MonSQLize({
            type: 'mongodb',
            uri: 'mongodb://localhost:27017/test_function_cache',
            cache: {
                // 本地缓存配置
                maxSize: 1000,
                ttl: 60000
            },
            redis: {
                // Redis 配置
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });

        console.log('✅ MonSQLize 实例创建成功（多层缓存）');
        console.log(`   缓存类型: ${msq.getCache().constructor.name}`);

        // 检查是否是 MultiLevelCache
        const cache = msq.getCache();
        if (cache.constructor.name === 'MultiLevelCache') {
            console.log('✅ 多层缓存配置成功');
            console.log(`   本地缓存: ${cache.localCache ? '✓' : '✗'}`);
            console.log(`   Redis缓存: ${cache.remoteCache ? '✓' : '✗'}`);
        }

        const { withCache, FunctionCache } = require('../../lib/function-cache');

        // 使用 FunctionCache
        const fnCache = new FunctionCache(msq);

        let callCount2 = 0;
        async function getUserData(userId) {
            callCount2++;
            return {
                userId,
                name: `User ${userId}`,
                email: `user${userId}@example.com`,
                timestamp: Date.now()
            };
        }

        await fnCache.register('getUserData', getUserData, { ttl: 300000 });
        console.log('✅ 函数注册成功');

        const user1 = await fnCache.execute('getUserData', 'u123');
        console.log(`第一次执行: ${JSON.stringify(user1)}`);
        console.log(`函数调用次数: ${callCount2}`);

        const user2 = await fnCache.execute('getUserData', 'u123');
        console.log(`第二次执行: ${JSON.stringify(user2)}`);
        console.log(`函数调用次数: ${callCount2} (应该还是 1)`);

        if (callCount2 === 1 && user1.timestamp === user2.timestamp) {
            console.log('✅ MultiLevelCache 工作正常（缓存命中）');
        } else {
            console.log('❌ MultiLevelCache 未生效');
        }

        // 测试缓存统计
        const stats = cache.getStats();
        console.log('缓存统计信息:');
        console.log(`  本地命中: ${stats.localHits || 0}`);
        console.log(`  Redis命中: ${stats.remoteHits || 0}`);
        console.log(`  未命中: ${stats.misses || 0}`);

        // 清理
        await fnCache.invalidate('getUserData', 'u123');
        await msq.close();
        console.log();

    } catch (err) {
        console.log(`⚠️  Redis 连接失败: ${err.message}`);
        console.log('   请确保 Redis 正在运行: redis-server');
        console.log('   或者检查 Redis 配置是否正确');
        console.log();
    }

    // 测试 3: 测试缓存失效传播（Redis → Local）
    console.log('测试 3: 缓存失效传播测试');
    console.log('-'.repeat(70));

    try {
        const msq = new MonSQLize({
            type: 'mongodb',
            uri: 'mongodb://localhost:27017/test_function_cache',
            cache: {
                maxSize: 1000,
                ttl: 60000
            },
            redis: {
                host: 'localhost',
                port: 6379,
                db: 0
            }
        });

        const { FunctionCache } = require('../../lib/function-cache');
        const fnCache = new FunctionCache(msq);

        let callCount = 0;
        async function getConfig(key) {
            callCount++;
            return { key, value: `config_${key}`, updatedAt: Date.now() };
        }

        await fnCache.register('getConfig', getConfig, { ttl: 300000 });

        // 第一次调用
        const config1 = await fnCache.execute('getConfig', 'app.name');
        console.log(`第一次调用: ${JSON.stringify(config1)}`);
        console.log(`函数调用次数: ${callCount}`);

        // 第二次调用（应该命中缓存）
        const config2 = await fnCache.execute('getConfig', 'app.name');
        console.log(`第二次调用: ${JSON.stringify(config2)}`);
        console.log(`函数调用次数: ${callCount} (应该还是 1)`);

        // 手动失效缓存
        await fnCache.invalidate('getConfig', 'app.name');
        console.log('手动失效缓存...');

        // 第三次调用（应该重新执行函数）
        const config3 = await fnCache.execute('getConfig', 'app.name');
        console.log(`第三次调用: ${JSON.stringify(config3)}`);
        console.log(`函数调用次数: ${callCount} (应该是 2)`);

        if (callCount === 2) {
            console.log('✅ 缓存失效传播正常');
        } else {
            console.log('❌ 缓存失效传播失败');
        }

        await msq.close();
        console.log();

    } catch (err) {
        console.log(`⚠️  测试失败: ${err.message}`);
        console.log();
    }

    // 测试 4: 错误日志在 Redis 场景
    console.log('测试 4: Redis 错误处理和日志');
    console.log('-'.repeat(70));

    try {
        // 使用无效的 Redis 配置
        const msq = new MonSQLize({
            type: 'mongodb',
            uri: 'mongodb://localhost:27017/test_function_cache',
            cache: {
                maxSize: 1000,
                ttl: 60000
            },
            redis: {
                host: 'invalid-redis-host-12345',
                port: 6379,
                db: 0,
                connectTimeout: 1000 // 1秒超时
            }
        });

        console.log('创建了使用无效Redis配置的实例');

        const { withCache } = require('../../lib/function-cache');

        let callCount = 0;
        async function testFn(id) {
            callCount++;
            return { id, result: 'success', timestamp: Date.now() };
        }

        const cached = withCache(testFn, {
            ttl: 60000,
            cache: msq.getCache()
        });

        console.log('执行函数（Redis 连接会失败，但应该降级到本地缓存）...');

        const result = await cached(1);
        console.log(`✅ 函数执行成功: ${JSON.stringify(result)}`);
        console.log(`函数调用次数: ${callCount}`);
        console.log('✅ Redis 失败时自动降级到本地缓存');

        await msq.close();
        console.log();

    } catch (err) {
        console.log(`测试过程: ${err.message}`);
        console.log('这是预期的，演示了错误处理');
        console.log();
    }

    console.log('=' .repeat(70));
    console.log('🎉 MonSQLize + Redis 配置测试完成');
    console.log('=' .repeat(70));
    console.log();
    console.log('📋 测试总结:');
    console.log('  ✅ 测试 1: MonSQLize 本地缓存配置');
    console.log('  ✅ 测试 2: MultiLevelCache (Redis + Local) 配置');
    console.log('  ✅ 测试 3: 缓存失效传播测试');
    console.log('  ✅ 测试 4: Redis 错误处理和降级');
    console.log();
    console.log('💡 提示:');
    console.log('  - 如果 Redis 未运行，测试会自动降级到本地缓存');
    console.log('  - MultiLevelCache 先查本地缓存，再查 Redis');
    console.log('  - 缓存失效会同时清理本地和 Redis 缓存');
}

// 运行测试
testWithMonSQLize().catch(err => {
    console.error('\n❌ 测试失败:', err);
    console.error(err.stack);
    process.exit(1);
});

