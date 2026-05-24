import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const MonSQLize = require('../../../dist/cjs/index.cjs');
const baseline = require('./function-cache.json') as Baseline;

type Baseline = {
    scenario: string;
    targets: {
        samples: number;
        simulatedLatencyMs: number;
        ttlMs: number;
        minSpeedup: number;
        maxCachedAverageMs: number;
        concurrency: {
            requests: number;
            simulatedLatencyMs: number;
            maxUnderlyingCalls: number;
            maxDurationMs: number;
        };
    };
};

type Measurement = {
    label: string;
    samples: number;
    totalMs: number;
    averageMs: number;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function measure(label: string, samples: number, runner: (index: number) => Promise<unknown>): Promise<Measurement> {
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

async function main(): Promise<void> {
    const { targets } = baseline;

    let uncachedCalls = 0;
    async function slowAdd(left: number, right: number): Promise<number> {
        uncachedCalls += 1;
        await sleep(targets.simulatedLatencyMs);
        return left + right;
    }

    const uncached = await measure('uncached', targets.samples, () => slowAdd(2, 3));

    let cachedCalls = 0;
    async function slowAddForCache(left: number, right: number): Promise<number> {
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
    const concurrentCached = MonSQLize.withCache(async (id: string) => {
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
    assert.ok(speedup >= targets.minSpeedup, `Cache hot-path speedup is too low: ${speedup.toFixed(2)}x < ${targets.minSpeedup}x`);
    assert.ok(cached.averageMs <= targets.maxCachedAverageMs, `Cache hit average latency is too high: ${cached.averageMs.toFixed(3)}ms > ${targets.maxCachedAverageMs}ms`);
    assert.ok(concurrentCalls <= targets.concurrency.maxUnderlyingCalls, `Concurrent dedupe failed: ${concurrentCalls} underlying call(s)`);
    assert.ok(concurrentDurationMs <= targets.concurrency.maxDurationMs, `Concurrent scenario latency is too high: ${concurrentDurationMs.toFixed(3)}ms > ${targets.concurrency.maxDurationMs}ms`);

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

main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});