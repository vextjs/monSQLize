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
        it('stats before first call use zero average time', () => {
            const cached = MonSQLize.withCache(async (x: number) => x, {});
            const stats = cached.stats();
            assert.equal(stats.calls, 0);
            assert.equal(stats.avgTime, 0);
        });

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
            assert.equal(typeof via_stats.totalTime, 'number');
            assert.equal(typeof via_stats.avgTime, 'number');
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
            assert.equal(stats.totalTime, 0);
            assert.equal(stats.avgTime, 0);
        });
    });

    // ── FunctionCache: v1 constructor and namespace defaults ────────────────

    describe('FunctionCache v1 constructor defaults', () => {
        it('supports no-argument construction', async () => {
            const fc = new MonSQLize.FunctionCache();
            assert.equal(typeof fc.register('fn', async () => 42).then, 'function');
            assert.equal(await fc.execute('fn'), 42);
        });

        it('defaults namespace to action', async () => {
            const memory = new MonSQLize.MemoryCache();
            const fc = new MonSQLize.FunctionCache(memory, { ttl: 5000 });
            await fc.register('loadUser', async (id: string) => ({ id }));

            await fc.execute('loadUser', 'u1');
            const keys = memory.keys('*');
            assert.ok(keys.some((key: string) => key.startsWith('action:loadUser:')));
        });

        it('accepts a MonSQLize-like getCache source', async () => {
            const memory = new MonSQLize.MemoryCache();
            const fc = new MonSQLize.FunctionCache({ getCache: () => memory }, { namespace: 'source-test' });
            await fc.register('fn', async () => 'ok');
            assert.equal(await fc.execute('fn'), 'ok');
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
                () => MonSQLize.withCache(async () => { }, { ttl: -1 }),
                (e: unknown) => e instanceof Error && /ttl/.test((e as Error).message),
            );
        });

        it('throws when keyBuilder is not a function', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => { }, { keyBuilder: 'bad' as any }),
                (e: unknown) => e instanceof Error && /keyBuilder/.test((e as Error).message),
            );
        });

        it('throws when condition is not a function', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => { }, { condition: 'bad' as any }),
                (e: unknown) => e instanceof Error && /condition/.test((e as Error).message),
            );
        });

        it('throws when cache is invalid', () => {
            assert.throws(
                () => MonSQLize.withCache(async () => { }, { cache: { notACache: true } as any }),
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
        it('getStats() before registrations returns an empty stats map', () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'stats-empty',
                enableStats: true,
            });

            assert.deepEqual(fc.getStats(), {});
        });

        it('getStats(name) returns per-function stats', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'stats-test',
                ttl: 5000,
                enableStats: true,
            });
            fc.register('fn', async (x: unknown) => x);
            await fc.execute('fn', 'a');
            await fc.execute('fn', 'a');

            const stats = fc.getStats('fn') as { hits: number; misses: number; calls: number; totalTime: number; avgTime: number };
            assert.ok(stats.hits >= 1);
            assert.ok(stats.calls >= 2);
            assert.equal(typeof stats.totalTime, 'number');
            assert.equal(typeof stats.avgTime, 'number');
        });

        it('getStats() returns null when enableStats is false', () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'stats-disabled',
                enableStats: false,
            });
            fc.register('fn', async () => 1);
            assert.equal(fc.getStats(), null);
        });

        it('getStats(name) returns zero counters for an unknown function', () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'stats-missing',
                enableStats: true,
            });
            const stats = fc.getStats('missing') as { calls: number; totalTime: number };
            assert.equal(stats.calls, 0);
            assert.equal(stats.totalTime, 0);
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
        it('throws when constructor options are not an object', () => {
            assert.throws(
                () => new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), 'bad' as any),
                (e: unknown) => e instanceof Error && /options/.test((e as Error).message),
            );
        });

        it('throws when cache source is invalid', () => {
            assert.throws(
                () => new MonSQLize.FunctionCache({} as any),
                (e: unknown) => e instanceof Error && /Invalid cache/.test((e as Error).message),
            );
        });

        it('throws when getCache returns an invalid cache', () => {
            assert.throws(
                () => new MonSQLize.FunctionCache({ getCache: () => ({}) } as any),
                (e: unknown) => e instanceof Error && /Invalid cache/.test((e as Error).message),
            );
        });

        it('throws when namespace is not a string', () => {
            assert.throws(
                () => new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), { namespace: 1 as any }),
                (e: unknown) => e instanceof Error && /namespace/.test((e as Error).message),
            );
        });

        it('throws when defaultTTL is NaN', () => {
            assert.throws(
                () => new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), { defaultTTL: Number.NaN }),
                (e: unknown) => e instanceof Error && /defaultTTL/.test((e as Error).message),
            );
        });

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

        it('resetStats() clears all registered function counters', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'reset-all-test',
                ttl: 5000,
            });
            fc.register('one', async (x: unknown) => x);
            fc.register('two', async (x: unknown) => x);
            await fc.execute('one', 'a');
            await fc.execute('two', 'b');

            fc.resetStats();
            const stats = fc.getStats() as Record<string, { calls: number; totalTime: number }>;
            assert.equal(stats.one.calls, 0);
            assert.equal(stats.two.calls, 0);
            assert.equal(stats.one.totalTime, 0);
            assert.equal(stats.two.totalTime, 0);
        });

        it('register() accepts per-function defaultTTL, keyBuilder, and condition options', async () => {
            const fc = new MonSQLize.FunctionCache(new MonSQLize.MemoryCache(), {
                namespace: 'per-fn-opts',
            });
            let calls = 0;

            fc.register(
                'load',
                async (id: string, skip: boolean) => {
                    calls += 1;
                    return skip ? null : { id, calls };
                },
                {
                    defaultTTL: 5_000,
                    keyBuilder: (id: string) => `id:${id}`,
                    condition: (value: unknown) => value !== null,
                },
            );

            const first = await fc.execute('load', 'u1', false);
            const second = await fc.execute('load', 'u1', false);
            const skippedOne = await fc.execute('load', 'u2', true);
            const skippedTwo = await fc.execute('load', 'u2', true);

            assert.deepEqual(first, second);
            assert.equal(skippedOne, null);
            assert.equal(skippedTwo, null);
            assert.equal(calls, 3);
        });
    });
});
