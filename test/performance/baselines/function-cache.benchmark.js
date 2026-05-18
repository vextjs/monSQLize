const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const MonSQLize = require('../../../lib/index.js');
const baseline = require('./function-cache.json');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measure(label, samples, runner) {
    const startedAt = performance.now();
    for (let index = 0; index < samples; index += 1) {
        await runner(index);
    }
    const totalMs = performance.now() - startedAt;
    return {
        label,
        samples,
        totalMs,
        averageMs: totalMs / samples,
    };
}

async function main() {
    const { targets } = baseline;

    let uncachedCalls = 0;
    async function slowAdd(left, right) {
        uncachedCalls += 1;
        await sleep(targets.simulatedLatencyMs);
        return left + right;
    }

    const uncached = await measure('uncached', targets.samples, () => slowAdd(2, 3));

    let cachedCalls = 0;
    async function slowAddForCache(left, right) {
        cachedCalls += 1;
        await sleep(targets.simulatedLatencyMs);
        return left + right;
    }

    const cache = new MonSQLize.MemoryCache();
    const cachedFn = MonSQLize.withCache(slowAddForCache, {
        cache,
        namespace: 'perf:function-cache',
        ttl: targets.ttlMs,
        enableStats: true,
    });

    const cached = await measure('cached', targets.samples, () => cachedFn(2, 3));
    const speedup = uncached.totalMs / cached.totalMs;
    const cacheStats = cachedFn.stats();

    let concurrentCalls = 0;
    const concurrentCached = MonSQLize.withCache(async (id) => {
        concurrentCalls += 1;
        await sleep(targets.concurrency.simulatedLatencyMs);
        return { id, call: concurrentCalls };
    }, {
        namespace: 'perf:function-cache:concurrency',
        ttl: targets.ttlMs,
    });

    const concurrentStartedAt = performance.now();
    const concurrentResults = await Promise.all(
        Array.from({ length: targets.concurrency.requests }, () => concurrentCached('same-key')),
    );
    const concurrentDurationMs = performance.now() - concurrentStartedAt;

    for (const item of concurrentResults) {
        assert.deepEqual(item, { id: 'same-key', call: 1 });
    }

    assert.equal(uncachedCalls, targets.samples);
    assert.equal(cachedCalls, 1);
    assert.ok(speedup >= targets.minSpeedup, `缓存热路径加速比不足：${speedup.toFixed(2)}x < ${targets.minSpeedup}x`);
    assert.ok(cached.averageMs <= targets.maxCachedAverageMs, `缓存命中平均耗时过高：${cached.averageMs.toFixed(3)}ms > ${targets.maxCachedAverageMs}ms`);
    assert.ok(concurrentCalls <= targets.concurrency.maxUnderlyingCalls, `并发去重失效：实际底层调用 ${concurrentCalls} 次`);
    assert.ok(concurrentDurationMs <= targets.concurrency.maxDurationMs, `并发场景耗时过高：${concurrentDurationMs.toFixed(3)}ms > ${targets.concurrency.maxDurationMs}ms`);

    const result = {
        scenario: baseline.scenario,
        uncached,
        cached,
        speedup,
        cacheStats,
        concurrency: {
            requests: targets.concurrency.requests,
            underlyingCalls: concurrentCalls,
            durationMs: concurrentDurationMs,
        },
    };

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

