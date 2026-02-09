/**
 * 精确性能测试 - 无日志干扰
 */

const { withCache } = require('./lib/function-cache');
const CacheFactory = require('./lib/cache');

// 禁用所有日志
const originalLog = console.log;
const originalWarn = console.warn;
const originalDebug = console.debug;
console.log = () => {};
console.warn = () => {};
console.debug = () => {};

async function test() {
    // 恢复console用于输出结果
    const print = originalLog;

    print('\n═══ 精确性能测试 ═══\n');

    // ============================================================
    // 测试 1: 纯缓存命中性能
    // ============================================================
    print('📊 测试 1: 纯缓存命中性能\n');

    const cache = CacheFactory.createDefault();

    async function simpleFunc(x) {
        return x * 2;
    }

    const cached = withCache(simpleFunc, {
        ttl: 60000,
        cache: cache,
        enableStats: false  // 禁用统计以减少开销
    });

    // 预热
    await cached(100);

    // 测试原函数
    const iterations = 10000;

    let start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        await simpleFunc(100);
    }
    let end = process.hrtime.bigint();
    const noCacheTime = Number(end - start) / 1000000;

    // 测试缓存命中
    start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
        await cached(100);  // 相同参数，命中缓存
    }
    end = process.hrtime.bigint();
    const withCacheTime = Number(end - start) / 1000000;

    print(`  原函数   : ${noCacheTime.toFixed(2)}ms (${(noCacheTime/iterations).toFixed(4)}ms/次)`);
    print(`  缓存命中 : ${withCacheTime.toFixed(2)}ms (${(withCacheTime/iterations).toFixed(4)}ms/次)`);

    if (withCacheTime < noCacheTime) {
        print(`  ✅ 加速: ${(noCacheTime/withCacheTime).toFixed(2)}x`);
    } else {
        print(`  ❌ 变慢: ${(withCacheTime/noCacheTime).toFixed(2)}x`);
    }

    // ============================================================
    // 测试 2: 单次缓存命中时间
    // ============================================================
    print('\n📊 测试 2: 单次缓存命中微基准测试\n');

    const times = [];
    for (let i = 0; i < 1000; i++) {
        const start = process.hrtime.bigint();
        await cached(100);
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1000000);
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = times[0];
    const max = times[times.length - 1];
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];

    print(`  平均: ${avg.toFixed(4)}ms`);
    print(`  最小: ${min.toFixed(4)}ms`);
    print(`  中位: ${median.toFixed(4)}ms`);
    print(`  P95:  ${p95.toFixed(4)}ms`);
    print(`  最大: ${max.toFixed(4)}ms`);

    // ============================================================
    // 测试 3: 缓存开销细分
    // ============================================================
    print('\n📊 测试 3: 缓存开销细分\n');

    // 直接测试缓存 get 性能
    await cache.set('testKey', 42, 60000);

    start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
        await cache.get('testKey');
    }
    end = process.hrtime.bigint();
    const cacheGetTime = Number(end - start) / 1000000 / 1000;

    print(`  cache.get() 平均: ${cacheGetTime.toFixed(4)}ms`);
    print(`  估算缓存总开销: ${(cacheGetTime + 0.001).toFixed(4)}ms (get + 序列化)`);

    print('\n═══════════════════════════════════\n');
}

test().then(() => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.debug = originalDebug;
    process.exit(0);
}).catch(err => {
    console.log = originalLog;
    console.error('Error:', err);
    process.exit(1);
});

