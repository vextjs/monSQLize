/**
 * 函数缓存性能测试与复杂数据测试
 */
const { withCache, FunctionCache } = require('../../lib/function-cache');
const CacheFactory = require('../../lib/cache');

// 性能测试辅助函数
function formatTime(ms) {
    if (ms < 0.001) return `${(ms * 1000).toFixed(3)}μs`;
    if (ms < 1) return `${ms.toFixed(3)}ms`;
    return `${ms.toFixed(2)}ms`;
}

async function performanceTest() {
    console.log('=' .repeat(60));
    console.log('📊 函数缓存性能测试');
    console.log('=' .repeat(60));
    console.log();

    // 测试 1: 简单函数缓存性能
    console.log('测试 1: 简单函数缓存性能对比');
    console.log('-'.repeat(60));

    let callCount = 0;
    async function simpleCalc(x, y) {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 1)); // 模拟 1ms 延迟
        return x + y;
    }

    const cached = withCache(simpleCalc, { ttl: 60000 });

    // 无缓存性能测试
    console.log('无缓存执行 (10次):');
    callCount = 0;
    const start1 = process.hrtime.bigint();
    for (let i = 0; i < 10; i++) {
        await simpleCalc(5, 3);
    }
    const time1 = Number(process.hrtime.bigint() - start1) / 1000000;
    console.log(`  总耗时: ${formatTime(time1)}`);
    console.log(`  平均耗时: ${formatTime(time1 / 10)}`);
    console.log(`  函数调用次数: ${callCount}`);
    console.log();

    // 有缓存性能测试
    console.log('有缓存执行 (10次，相同参数):');
    callCount = 0;
    const start2 = process.hrtime.bigint();
    for (let i = 0; i < 10; i++) {
        await cached(5, 3);
    }
    const time2 = Number(process.hrtime.bigint() - start2) / 1000000;
    console.log(`  总耗时: ${formatTime(time2)}`);
    console.log(`  平均耗时: ${formatTime(time2 / 10)}`);
    console.log(`  函数调用次数: ${callCount}`);

    const speedup = time1 / time2;
    console.log(`  ⚡ 加速比: ${speedup.toFixed(1)}x`);
    console.log(`  ${speedup > 5 ? '✅' : '⚠️'} 性能提升: ${speedup > 5 ? '显著' : '一般'}`);
    console.log();

    // 测试 2: 缓存命中率测试
    console.log('测试 2: 缓存命中率分析');
    console.log('-'.repeat(60));

    callCount = 0;
    async function dataQuery(id) {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 1));
        return { id, data: `Data for ${id}` };
    }

    const cachedQuery = withCache(dataQuery, { ttl: 60000, enableStats: true });

    // 模拟混合查询模式（70% 重复，30% 新查询）
    const queries = [];
    for (let i = 0; i < 100; i++) {
        const id = Math.random() < 0.7 ? Math.floor(Math.random() * 10) : i;
        queries.push(id);
    }

    console.log(`执行 100 次查询 (70% 重复, 30% 新查询):`);
    const start3 = process.hrtime.bigint();
    for (const id of queries) {
        await cachedQuery(id);
    }
    const time3 = Number(process.hrtime.bigint() - start3) / 1000000;

    const stats = cachedQuery.getCacheStats();
    console.log(`  总耗时: ${formatTime(time3)}`);
    console.log(`  平均耗时: ${formatTime(time3 / 100)}`);
    console.log(`  函数调用次数: ${callCount}`);
    console.log(`  缓存命中次数: ${stats.hits}`);
    console.log(`  缓存未命中次数: ${stats.misses}`);
    console.log(`  缓存命中率: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`  ${stats.hitRate > 0.6 ? '✅' : '⚠️'} 命中率: ${stats.hitRate > 0.6 ? '优秀' : '需优化'}`);
    console.log();

    // 测试 3: 高并发缓存击穿防护
    console.log('测试 3: 高并发缓存击穿防护');
    console.log('-'.repeat(60));

    callCount = 0;
    async function slowQuery(id) {
        callCount++;
        await new Promise(resolve => setTimeout(resolve, 50)); // 模拟慢查询
        return { id, timestamp: Date.now() };
    }

    const cachedSlowQuery = withCache(slowQuery, { ttl: 60000 });

    console.log('10 个并发请求查询相同数据:');
    const start4 = process.hrtime.bigint();
    const promises = Array(10).fill(null).map(() => cachedSlowQuery(1));
    await Promise.all(promises);
    const time4 = Number(process.hrtime.bigint() - start4) / 1000000;

    console.log(`  总耗时: ${formatTime(time4)}`);
    console.log(`  函数实际调用次数: ${callCount}`);
    console.log(`  ${callCount === 1 ? '✅' : '❌'} 防护效果: ${callCount === 1 ? '完美' : '失败'}`);
    console.log(`  ${time4 < 100 ? '✅' : '⚠️'} 并发性能: ${time4 < 100 ? '优秀' : '需优化'}`);
    console.log();
}

async function complexDataTest() {
    console.log('=' .repeat(60));
    console.log('🔍 复杂数据类型测试');
    console.log('=' .repeat(60));
    console.log();

    // 测试 1: 深层嵌套对象
    console.log('测试 1: 深层嵌套对象缓存');
    console.log('-'.repeat(60));

    let callCount = 0;
    async function processNestedData(data) {
        callCount++;
        return { ...data, processed: true };
    }

    const cachedNested = withCache(processNestedData, { ttl: 60000 });

    const nestedData = {
        level1: {
            level2: {
                level3: {
                    level4: {
                        value: 'deep value',
                        array: [1, 2, 3, { nested: true }]
                    }
                }
            }
        },
        metadata: { created: new Date(), tags: ['tag1', 'tag2'] }
    };

    await cachedNested(nestedData);
    await cachedNested(nestedData); // 应该命中缓存

    console.log(`  调用次数: ${callCount} (期望: 1) - ${callCount === 1 ? '✅' : '❌'}`);
    console.log(`  ${callCount === 1 ? '✅' : '❌'} 深层嵌套对象缓存正常`);
    console.log();

    // 测试 2: 包含特殊类型的对象
    console.log('测试 2: 特殊类型对象缓存 (Date, RegExp, ObjectId)');
    console.log('-'.repeat(60));

    callCount = 0;
    async function processSpecialTypes(data) {
        callCount++;
        return data;
    }

    const cachedSpecial = withCache(processSpecialTypes, { ttl: 60000 });

    const specialData = {
        timestamp: new Date('2026-02-10T10:00:00Z'),
        pattern: /test-\d+/gi,
        values: [null, undefined, 0, false, ''],
        numbers: [NaN, Infinity, -Infinity]
    };

    await cachedSpecial(specialData);
    await cachedSpecial(specialData);

    console.log(`  调用次数: ${callCount} (期望: 1) - ${callCount === 1 ? '✅' : '❌'}`);
    console.log(`  ${callCount === 1 ? '✅' : '❌'} Date/RegExp/特殊值缓存正常`);
    console.log();

    // 测试 3: 大数组缓存
    console.log('测试 3: 大数组缓存');
    console.log('-'.repeat(60));

    callCount = 0;
    async function processLargeArray(arr) {
        callCount++;
        return arr.length;
    }

    const cachedArray = withCache(processLargeArray, { ttl: 60000 });

    const largeArray = Array(1000).fill(null).map((_, i) => ({
        id: i,
        name: `Item ${i}`,
        metadata: { created: new Date(), index: i }
    }));

    const start = process.hrtime.bigint();
    await cachedArray(largeArray);
    const time1 = Number(process.hrtime.bigint() - start) / 1000000;

    const start2 = process.hrtime.bigint();
    await cachedArray(largeArray);
    const time2 = Number(process.hrtime.bigint() - start2) / 1000000;

    console.log(`  首次调用耗时: ${formatTime(time1)}`);
    console.log(`  缓存命中耗时: ${formatTime(time2)}`);
    console.log(`  调用次数: ${callCount} (期望: 1) - ${callCount === 1 ? '✅' : '❌'}`);
    console.log(`  ⚡ 加速比: ${(time1 / time2).toFixed(1)}x`);
    console.log(`  ${callCount === 1 ? '✅' : '❌'} 大数组缓存正常`);
    console.log();

    // 测试 4: 循环引用处理
    console.log('测试 4: 循环引用对象处理');
    console.log('-'.repeat(60));

    callCount = 0;
    async function processCircular(obj) {
        callCount++;
        return 'processed';
    }

    const cachedCircular = withCache(processCircular, { ttl: 60000 });

    const circularObj = { name: 'test' };
    circularObj.self = circularObj; // 循环引用

    try {
        await cachedCircular(circularObj);
        await cachedCircular(circularObj);
        console.log(`  调用次数: ${callCount} (期望: 1) - ${callCount === 1 ? '✅' : '❌'}`);
        console.log(`  ${callCount === 1 ? '✅' : '❌'} 循环引用对象处理正常`);
    } catch (err) {
        console.log(`  ⚠️ 循环引用处理: ${err.message}`);
    }
    console.log();

    // 测试 5: 不同参数顺序的对象
    console.log('测试 5: 对象键顺序稳定性');
    console.log('-'.repeat(60));

    callCount = 0;
    async function processObject(obj) {
        callCount++;
        return obj;
    }

    const cachedObject = withCache(processObject, { ttl: 60000 });

    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, b: 2, a: 1 }; // 相同内容，不同顺序

    await cachedObject(obj1);
    await cachedObject(obj2); // 应该命中缓存（因为键会排序）

    console.log(`  调用次数: ${callCount} (期望: 1) - ${callCount === 1 ? '✅' : '❌'}`);
    console.log(`  ${callCount === 1 ? '✅' : '❌'} 对象键顺序稳定性正常`);
    console.log();

    // 测试 6: 超长键自动哈希
    console.log('测试 6: 超长缓存键自动哈希 (>1KB)');
    console.log('-'.repeat(60));

    callCount = 0;
    async function processHugeData(data) {
        callCount++;
        return 'processed';
    }

    const cachedHuge = withCache(processHugeData, { ttl: 60000 });

    // 创建超过 1KB 的参数
    const hugeData = {
        items: Array(100).fill(null).map((_, i) => ({
            id: i,
            description: 'x'.repeat(50), // 每个 50 字符
            metadata: { index: i, timestamp: new Date() }
        }))
    };

    await cachedHuge(hugeData);
    await cachedHuge(hugeData);

    console.log(`  调用次数: ${callCount} (期望: 1) - ${callCount === 1 ? '✅' : '❌'}`);
    console.log(`  ${callCount === 1 ? '✅' : '❌'} 超长键哈希处理正常`);
    console.log();
}

async function cacheMemoryTest() {
    console.log('=' .repeat(60));
    console.log('💾 缓存内存使用测试');
    console.log('=' .repeat(60));
    console.log();

    const cache = CacheFactory.createDefault({ maxSize: 1000 });
    const fnCache = new FunctionCache({ getCache: () => cache });

    let callCount = 0;
    async function dataFn(id) {
        callCount++;
        return { id, data: 'x'.repeat(100) };
    }

    await fnCache.register('dataFn', dataFn, { ttl: 60000 });

    console.log('测试: 缓存 500 个不同的数据项');
    console.log('-'.repeat(60));

    const initialStats = cache.getStats();
    console.log(`  初始状态:`);
    console.log(`    缓存条目数: ${initialStats.size}`);
    console.log(`    内存使用: ${initialStats.memoryUsageMB.toFixed(2)}MB`);
    console.log();

    // 写入 500 个数据项
    const start = process.hrtime.bigint();
    for (let i = 0; i < 500; i++) {
        await fnCache.execute('dataFn', i);
    }
    const time = Number(process.hrtime.bigint() - start) / 1000000;

    const afterStats = cache.getStats();
    console.log(`  写入 500 项后:`);
    console.log(`    缓存条目数: ${afterStats.size}`);
    console.log(`    内存使用: ${afterStats.memoryUsageMB.toFixed(2)}MB`);
    console.log(`    总耗时: ${formatTime(time)}`);
    console.log(`    平均耗时: ${formatTime(time / 500)}`);
    console.log(`    函数调用次数: ${callCount}`);
    console.log();

    // 命中测试
    callCount = 0;
    const start2 = process.hrtime.bigint();
    for (let i = 0; i < 500; i++) {
        await fnCache.execute('dataFn', i);
    }
    const time2 = Number(process.hrtime.bigint() - start2) / 1000000;

    console.log(`  读取 500 项 (全部命中):`);
    console.log(`    总耗时: ${formatTime(time2)}`);
    console.log(`    平均耗时: ${formatTime(time2 / 500)}`);
    console.log(`    函数调用次数: ${callCount} (期望: 0)`);
    console.log(`    ⚡ 加速比: ${(time / time2).toFixed(1)}x`);
    console.log(`    ${callCount === 0 ? '✅' : '❌'} 全部命中缓存`);
    console.log();
}

async function main() {
    try {
        await performanceTest();
        await complexDataTest();
        await cacheMemoryTest();

        console.log('=' .repeat(60));
        console.log('🎉 所有测试完成');
        console.log('=' .repeat(60));
    } catch (err) {
        console.error('\n❌ 测试失败:', err);
        console.error(err.stack);
        process.exit(1);
    }
}

main();

