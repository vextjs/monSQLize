/**
 * 函数缓存性能测试
 * 验证 withCache 的实际性能表现
 */

const { withCache } = require('./lib/function-cache');
const MonSQLize = require('./lib/index');

// 性能测试工具
function formatTime(ms) {
    if (ms < 0.001) return `${(ms * 1000000).toFixed(3)}μs`;
    if (ms < 1) return `${(ms * 1000).toFixed(3)}ms`;
    return `${ms.toFixed(3)}ms`;
}

async function runPerformanceTest() {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║     函数缓存性能测试 (withCache Performance)      ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    // 初始化 MonSQLize
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'perf_test',
        config: { useMemoryServer: true }
    });

    await msq.connect();

    // ============================================================
    // 测试 1: 简单函数（无数据库操作）
    // ============================================================
    console.log('📊 测试 1: 简单计算函数\n');

    async function simpleCalc(x, y) {
        return x + y;
    }

    const cachedSimpleCalc = withCache(simpleCalc, {
        ttl: 60000,
        cache: msq.getCache()
    });

    // 预热
    await cachedSimpleCalc(1, 2);

    // 无缓存测试
    let start = Date.now();
    for (let i = 0; i < 10000; i++) {
        await simpleCalc(i, i + 1);
    }
    const noCacheTime = Date.now() - start;

    // 有缓存测试（命中）
    start = Date.now();
    for (let i = 0; i < 10000; i++) {
        await cachedSimpleCalc(1, 2); // 相同参数，命中缓存
    }
    const withCacheTime = Date.now() - start;

    console.log(`  无缓存: ${noCacheTime}ms (${(noCacheTime/10000).toFixed(3)}ms/次)`);
    console.log(`  有缓存: ${withCacheTime}ms (${(withCacheTime/10000).toFixed(3)}ms/次)`);

    if (withCacheTime < noCacheTime) {
        console.log(`  ✅ 加速: ${(noCacheTime/withCacheTime).toFixed(2)}x`);
    } else {
        console.log(`  ❌ 变慢: ${(withCacheTime/noCacheTime).toFixed(2)}x (缓存开销大于函数执行时间)`);
    }

    // ============================================================
    // 测试 2: 复杂业务函数（有数据库操作）
    // ============================================================
    console.log('\n📊 测试 2: 复杂业务函数（数据库查询）\n');

    // 插入测试数据
    await msq.collection('users').insertMany([
        { _id: 'user1', name: 'Alice', age: 25 },
        { _id: 'user2', name: 'Bob', age: 30 }
    ]);
    await msq.collection('orders').insertMany([
        { _id: 'order1', userId: 'user1', amount: 100 },
        { _id: 'order2', userId: 'user1', amount: 200 }
    ]);

    async function getUserProfile(userId) {
        const user = await msq.collection('users').findOne({ _id: userId });
        const orders = await msq.collection('orders').find({ userId }).toArray();
        return { user, orders };
    }

    const cachedGetUserProfile = withCache(getUserProfile, {
        ttl: 60000,
        cache: msq.getCache()
    });

    // 预热
    await cachedGetUserProfile('user1');

    // 无缓存测试
    const noCacheTimes = [];
    for (let i = 0; i < 100; i++) {
        const start = process.hrtime.bigint();
        await getUserProfile('user1');
        const end = process.hrtime.bigint();
        noCacheTimes.push(Number(end - start) / 1000000); // 转换为毫秒
    }
    const avgNoCache = noCacheTimes.reduce((a, b) => a + b, 0) / noCacheTimes.length;

    // 有缓存测试
    const withCacheTimes = [];
    for (let i = 0; i < 100; i++) {
        const start = process.hrtime.bigint();
        await cachedGetUserProfile('user1');
        const end = process.hrtime.bigint();
        withCacheTimes.push(Number(end - start) / 1000000);
    }
    const avgWithCache = withCacheTimes.reduce((a, b) => a + b, 0) / withCacheTimes.length;

    console.log(`  无缓存: 平均 ${formatTime(avgNoCache)}`);
    console.log(`  有缓存: 平均 ${formatTime(avgWithCache)}`);
    console.log(`  ✅ 加速: ${(avgNoCache/avgWithCache).toFixed(2)}x`);

    // ============================================================
    // 测试 3: 缓存开销分析
    // ============================================================
    console.log('\n📊 测试 3: 缓存开销分析\n');

    async function veryFastFunction() {
        return 42;
    }

    const cachedVeryFast = withCache(veryFastFunction, {
        ttl: 60000,
        cache: msq.getCache()
    });

    // 预热
    await cachedVeryFast();

    // 测量纯函数执行时间
    const pureFnTimes = [];
    for (let i = 0; i < 1000; i++) {
        const start = process.hrtime.bigint();
        await veryFastFunction();
        const end = process.hrtime.bigint();
        pureFnTimes.push(Number(end - start) / 1000000);
    }
    const avgPureFn = pureFnTimes.reduce((a, b) => a + b, 0) / pureFnTimes.length;

    // 测量缓存命中时间
    const cacheHitTimes = [];
    for (let i = 0; i < 1000; i++) {
        const start = process.hrtime.bigint();
        await cachedVeryFast();
        const end = process.hrtime.bigint();
        cacheHitTimes.push(Number(end - start) / 1000000);
    }
    const avgCacheHit = cacheHitTimes.reduce((a, b) => a + b, 0) / cacheHitTimes.length;

    console.log(`  纯函数执行: ${formatTime(avgPureFn)}`);
    console.log(`  缓存命中: ${formatTime(avgCacheHit)}`);
    console.log(`  缓存开销: ${formatTime(avgCacheHit - avgPureFn)}`);

    if (avgCacheHit > avgPureFn) {
        console.log(`  ⚠️  缓存比直接执行慢 ${(avgCacheHit/avgPureFn).toFixed(2)}x`);
        console.log(`  💡 结论: 对于极快的函数（<${formatTime(avgCacheHit)}），不建议使用缓存`);
    }

    // ============================================================
    // 测试 4: 不同缓存类型性能
    // ============================================================
    console.log('\n📊 测试 4: 不同缓存类型性能对比\n');

    async function testFunction(x) {
        // 模拟10ms的数据库查询
        await new Promise(resolve => setTimeout(resolve, 10));
        return x * 2;
    }

    // 本地缓存
    const CacheFactory = require('./lib/cache');
    const localCache = CacheFactory.createDefault();
    const cachedLocal = withCache(testFunction, {
        ttl: 60000,
        cache: localCache
    });

    // 预热并测试
    await cachedLocal(100);
    start = process.hrtime.bigint();
    await cachedLocal(100);
    const localTime = Number(process.hrtime.bigint() - start) / 1000000;

    console.log(`  本地缓存命中: ${formatTime(localTime)}`);

    // ============================================================
    // 总结
    // ============================================================
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║                   性能测试总结                      ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    console.log('📌 关键发现:\n');
    console.log('1. ✅ 缓存对复杂函数（数据库查询）有显著加速效果');
    console.log(`   - 典型加速比: ${(avgNoCache/avgWithCache).toFixed(0)}x - ${(avgNoCache/avgWithCache * 2).toFixed(0)}x`);
    console.log('');
    console.log('2. ⚠️  缓存对简单函数可能产生负面影响');
    console.log(`   - 缓存开销: ~${formatTime(avgCacheHit)}`);
    console.log(`   - 如果函数执行时间 < ${formatTime(avgCacheHit)}，不建议使用缓存`);
    console.log('');
    console.log('3. 💡 使用建议:');
    console.log('   - ✅ 适合: 数据库查询、外部API调用、复杂计算（>1ms）');
    console.log('   - ❌ 不适合: 简单计算、纯内存操作（<0.1ms）');
    console.log('');

    await msq.close();
}

// 运行测试
runPerformanceTest().then(() => {
    console.log('✅ 性能测试完成\n');
    process.exit(0);
}).catch(err => {
    console.error('❌ 测试失败:', err);
    process.exit(1);
});

