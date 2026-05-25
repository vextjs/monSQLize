import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('function-cache behavior', () => {

    // ── withCache: TTL expiry ────────────────────────────────────────────────

    describe('withCache TTL expiry', () => {
        it('returns stale-cached value within TTL', async () => {
            let calls = 0;
            const cached = MonSQLize.withCache(async () => { calls += 1; return calls; }, {
                ttl: 2000,
            });

            const first = await cached();
            const second = await cached();
            assert.equal(first, 1);
            assert.equal(second, 1);
            assert.equal(calls, 1);
        });

        it('re-executes after TTL expiry', async () => {
            let calls = 0;
            const cached = MonSQLize.withCache(async () => { calls += 1; return calls; }, {
                ttl: 30,
            });

            const first = await cached();
            await new Promise((r) => setTimeout(r, 60));
            const second = await cached();
            assert.equal(first, 1);
            assert.equal(second, 2);
            assert.equal(calls, 2);
        });
    });

    // ── withCache: getCacheStats() v1 alias ──────────────────────────────────

    describe('withCache getCacheStats() v1 alias', () => {
        it('getCacheStats() returns same result as stats()', async () => {
            const cached = MonSQLize.withCache(async (x: number) => x * 2, {
                ttl: 5000,
                enableStats: true,
            });
            await cached(1);
            await cached(1);
            const via_stats = cached.stats();
            const via_getCacheStats = cached.getCacheStats();
            assert.deepEqual(via_stats, via_getCacheStats);
        });

        it('getCacheStats() returns zeros when enableStats is false', async () => {
            const cached = MonSQLize.withCache(async (x: number) => x, {
                ttl: 5000,
                enableStats: false,
            });
            await cached(1);
            const stats = cached.getCacheStats();
            assert.equal(stats.hits, 0);
            assert.equal(stats.misses, 0);
            assert.equal(stats.calls, 0);
        });
    });

    // ── withCache: validation errors ─────────────────────────────────────────

    describe('withCache validation', () => {
        it('throws when fn is not a function', () => {
            assert.throws(
                () => MonSQLize.withCache('not-a-function' as any, {}),
                (e: unknown) => e instanceof Error && /fn must be a function/.test((e as Error).message),
            );
        });

        it('throws when ttl is negative', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => {}, { ttl: -1 }),
                (e: unknown) => e instanceof Error && /ttl/.test((e as Error).message),
            );
        });

        it('throws when keyBuilder is not a function', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => {}, { keyBuilder: 'bad' as any }),
                (e: unknown) => e instanceof Error && /keyBuilder/.test((e as Error).message),
            );
        });

        it('throws when condition is not a function', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => {}, { condition: 'bad' as any }),
                (e: unknown) => e instanceof Error && /condition/.test((e as Error).message),
            );
        });

        it('throws when cache is invalid', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => {}, { cache: { notACache: true } as any }),
                (e: unknown) => e instanceof Error && /cache/.test((e as Error).message),
            );
        });
    });

    // ── FunctionCache: defaultTTL alias ──────────────────────────────────────

    describe('FunctionCache defaultTTL constructor alias', () => {
        it('defaultTTL is accepted as alias for ttl', async () => {
            let calls = 0;
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'test-dtl',
                defaultTTL: 5000,
            });
            fc.register('fn', async () => { calls += 1; return calls; });

            const first = await fc.execute('fn');
            const second = await fc.execute('fn');
            assert.equal(first, 1);
            assert.equal(second, 1);
            assert.equal(calls, 1);
        });
    });

    // ── FunctionCache: per-function stats ────────────────────────────────────

    describe('FunctionCache getStats()', () => {
        it('getStats(name) returns per-function stats', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'stats-test',
                ttl: 5000,
                enableStats: true,
            });
            fc.register('fn', async (x: unknown) => x);
            await fc.execute('fn', 'a');
            await fc.execute('fn', 'a');

            const stats = fc.getStats('fn') as { hits: number; misses: number; calls: number };
            assert.ok(stats.hits >= 1);
            assert.ok(stats.calls >= 2);
        });

        it('getStats() returns null when enableStats is false', () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'stats-disabled',
                enableStats: false,
            });
            fc.register('fn', async () => 1);
            assert.equal(fc.getStats(), null);
        });

        it('resetStats() clears per-function counters', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'reset-test',
                ttl: 5000,
                enableStats: true,
            });
            fc.register('fn', async (x: unknown) => x);
            await fc.execute('fn', 'x');
            await fc.execute('fn', 'x');

            fc.resetStats('fn');
            const stats = fc.getStats('fn') as { calls: number };
            assert.equal(stats.calls, 0);
        });
    });

    // ── FunctionCache: validation errors ─────────────────────────────────────

    describe('FunctionCache validation', () => {
        it('throws when registering with non-string name', () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache());
            assert.throws(
                () => fc.register('' as string, async () => 1),
                (e: unknown) => e instanceof Error && /name/.test((e as Error).message),
            );
        });

        it('throws when registering with non-function fn', () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache());
            assert.throws(
                () => fc.register('fn', 'not-a-fn' as any),
                (e: unknown) => e instanceof Error && /fn/.test((e as Error).message),
            );
        });

        it('throws invalidate() with empty name', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache());
            await assert.rejects(
                () => fc.invalidate(''),
                (e: unknown) => e instanceof Error && /name/.test((e as Error).message),
            );
        });

        it('throws invalidatePattern() with empty pattern', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache());
            await assert.rejects(
                () => fc.invalidatePattern(''),
                (e: unknown) => e instanceof Error && /[Pp]attern/.test((e as Error).message),
            );
        });
    });
});
