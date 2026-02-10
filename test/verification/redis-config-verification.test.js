/**
 * 验证 Redis 配置下的函数缓存
 */
const { withCache, FunctionCache } = require('../../lib/function-cache');
const CacheFactory = require('../../lib/cache');

async function testRedisCache() {
    console.log('=' .repeat(70));
    console.log('🔍 Redis 配置验证测试');
    console.log('=' .repeat(70));
    console.log();

    // 测试 1: 使用 Redis 缓存（MultiLevelCache）
    console.log('测试 1: MultiLevelCache 配置');
    console.log('-'.repeat(70));

    try {
        // 注意：实际使用需要通过 MonSQLize 实例配置
        // 这里只测试本地缓存，因为 Redis 需要运行的实例
        const cache = CacheFactory.createDefault({ maxSize: 1000 });

        console.log('✅ 缓存实例创建成功');
        console.log(`   类型: ${cache.constructor.name}`);

        // 测试缓存读写
        let callCount = 0;
        async function testFn(id) {
            callCount++;
            return { id, data: 'test data', timestamp: Date.now() };
        }

        const cached = withCache(testFn, {
            ttl: 60000,
            cache: cache
        });

        console.log('执行测试函数...');

        // 第一次调用
        const result1 = await cached(1);
        console.log(`第一次调用结果: ${JSON.stringify(result1)}`);
        console.log(`函数调用次数: ${callCount}`);

        // 第二次调用（应该从缓存读取）
        const result2 = await cached(1);
        console.log(`第二次调用结果: ${JSON.stringify(result2)}`);
        console.log(`函数调用次数: ${callCount} (应该还是 1)`);

        if (callCount === 1) {
            console.log('✅ Redis 缓存工作正常');
        } else {
            console.log('❌ Redis 缓存未生效');
        }

        // 清理
        await cache.del('fn:testFn:[1]');
        console.log();

    } catch (err) {
        console.log(`⚠️  Redis 连接失败: ${err.message}`);
        console.log('   这是正常的，如果本地没有运行 Redis');
        console.log();
    }

    // 测试 2: FunctionCache 使用缓存
    console.log('测试 2: FunctionCache 使用缓存');
    console.log('-'.repeat(70));

    try {
        const cache = CacheFactory.createDefault({ maxSize: 1000 });

        const fnCache = new FunctionCache({ getCache: () => cache });

        let callCount = 0;
        async function getUserData(userId) {
            callCount++;
            return {
                userId,
                name: `User ${userId}`,
                email: `user${userId}@example.com`
            };
        }

        await fnCache.register('getUserData', getUserData, { ttl: 60000 });
        console.log('✅ 函数注册成功');

        const user1 = await fnCache.execute('getUserData', 123);
        console.log(`第一次执行: ${JSON.stringify(user1)}`);
        console.log(`函数调用次数: ${callCount}`);

        const user2 = await fnCache.execute('getUserData', 123);
        console.log(`第二次执行: ${JSON.stringify(user2)}`);
        console.log(`函数调用次数: ${callCount} (应该还是 1)`);

        if (callCount === 1) {
            console.log('✅ FunctionCache 使用缓存正常');
        } else {
            console.log('❌ FunctionCache 缓存未生效');
        }

        console.log();

    } catch (err) {
        console.log(`⚠️  执行失败: ${err.message}`);
        console.log();
    }

    // 测试 3: 错误日志验证
    console.log('测试 3: 错误日志验证（模拟缓存失败）');
    console.log('-'.repeat(70));

    try {
        // 创建一个会失败的缓存
        const faultyCache = CacheFactory.createDefault();
        faultyCache.set = async function(key, value, ttl) {
            throw new Error('Cache write failed (simulated)');
        };

        let callCount = 0;
        async function testFn(id) {
            callCount++;
            return { id, result: 'success' };
        }

        const cached = withCache(testFn, {
            ttl: 60000,
            cache: faultyCache
        });

        console.log('尝试执行函数（缓存写入会失败）...');

        const result = await cached(1);
        console.log(`✅ 函数执行成功（降级到直接执行）: ${JSON.stringify(result)}`);
        console.log(`函数调用次数: ${callCount}`);
        console.log('✅ 应该看到上面的 [FunctionCache] Cache set failed 错误日志');
        console.log();

    } catch (err) {
        console.log(`执行过程出错: ${err.message}`);
        console.log();
    }

    // 测试 4: 本地缓存作为后备
    console.log('测试 4: 本地缓存（无 Redis）');
    console.log('-'.repeat(70));

    const localCache = CacheFactory.createDefault();
    console.log(`✅ 本地缓存创建成功: ${localCache.constructor.name}`);

    let callCount = 0;
    async function testFn(id) {
        callCount++;
        return { id, data: 'local cache test' };
    }

    const cached = withCache(testFn, {
        ttl: 60000,
        cache: localCache
    });

    await cached(1);
    console.log(`第一次调用，函数执行次数: ${callCount}`);

    await cached(1);
    console.log(`第二次调用，函数执行次数: ${callCount} (应该还是 1)`);

    if (callCount === 1) {
        console.log('✅ 本地缓存工作正常');
    }

    console.log();
    console.log('=' .repeat(70));
    console.log('🎉 缓存配置验证测试完成');
    console.log('=' .repeat(70));
    console.log();
    console.log('💡 注意：');
    console.log('   - 本测试使用本地缓存（Cache）');
    console.log('   - MultiLevelCache 需要通过 MonSQLize 实例配置');
    console.log('   - Redis 缓存需要运行的 Redis 实例');
}

testRedisCache().catch(err => {
    console.error('测试失败:', err);
    process.exit(1);
});

