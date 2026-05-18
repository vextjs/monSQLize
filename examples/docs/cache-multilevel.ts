/**
 * Multi-level cache: L1 in-process MemoryCache + L2 Redis adapter + DistributedCacheInvalidator.
 * See: docs/cache-and-function-cache.md
 *
 * This example demonstrates the full cache hierarchy:
 *   L1 — MemoryCache (process-local, sub-millisecond)
 *   L2 — Redis adapter (cross-process, optional)
 *   Distributed invalidation — push a single signal to flush all nodes
 *
 * NOTE: Redis and actual network calls are stubbed with in-memory adapters
 * so this example runs without external dependencies while showing the same API
 * used in production.
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/cache-multilevel.js
 */
import MonSQLize from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface UserDoc { username: string; email: string; role: string; score: number; }

// ── Minimal Redis-compatible stub (no real Redis required) ────────────────────
// 完整模拟 Redis 客户端接口，支持 pub/sub on('message') 事件监听
class InMemoryRedisStub {
    constructor(private readonly peers: InMemoryRedisStub[] = []) {}
    private store = new Map<string, { value: string; exp?: number }>();
    // 事件处理器 Map：event → handlers[]
    private _handlers = new Map<string, Array<(...args: unknown[]) => void>>();

    async get(key: string): Promise<string | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.exp && Date.now() > entry.exp) { this.store.delete(key); return null; }
        return entry.value;
    }
    async set(key: string, value: string): Promise<'OK'> {
        this.store.set(key, { value });
        return 'OK';
    }
    async del(...keys: string[]): Promise<number> {
        let count = 0;
        for (const k of keys) if (this.store.delete(k)) count++;
        return count;
    }
    async exists(key: string): Promise<number> { return this.store.has(key) ? 1 : 0; }
    async scan(cursor: string, _matchKeyword: string, pattern: string): Promise<[string, string[]]> {
        const regex = new RegExp(`^${pattern.replaceAll('*', '.*')}$`);
        const keys = [...this.store.keys()].filter((key) => regex.test(key));
        return [cursor === '0' ? '0' : '0', keys];
    }
    async publish(channel: string, message: string): Promise<number> {
        for (const peer of this.peers) {
            const listeners = peer._handlers.get('message') ?? [];
            for (const listener of listeners) {
                listener(channel, message);
            }
        }
        return 1;
    }
    // subscribe: 立即回调 null（表示成功订阅）
    subscribe(_channel: string, cb?: (err?: Error | null) => void): void {
        if (cb) cb(null);
    }
    async unsubscribe(): Promise<void> {}
    async quit(): Promise<void> {}
    // on: 注册 EventEmitter 风格事件监听器（DistributedCacheInvalidator 需要）
    on(_event: string, _handler: (...args: unknown[]) => void): this {
        if (!this._handlers.has(_event)) this._handlers.set(_event, []);
        this._handlers.get(_event)!.push(_handler);
        return this;
    }
}

async function main() {
    const { msq, server } = await setupExample('example-cache-multilevel');

    // ── L1 cache — in-process MemoryCache ────────────────────────────────────
    const l1 = new MonSQLize.MemoryCache({ maxEntries: 500, defaultTtl: 60_000 });

    // ── L2 cache — Redis adapter (stubbed) ───────────────────────────────────
    const redisPeers = [] as InMemoryRedisStub[];
    const redisStub = new InMemoryRedisStub(redisPeers);
    const remoteRedisStub = new InMemoryRedisStub(redisPeers);
    redisPeers.push(redisStub, remoteRedisStub);
    const l2 = MonSQLize.createRedisCacheAdapter(
        redisStub as unknown as Parameters<typeof MonSQLize.createRedisCacheAdapter>[0],
    );

    // ── Distributed invalidator — broadcasts to all nodes ────────────────────
    // Constructor: new DistributedCacheInvalidator(options?)
    //   options.cache — 当前节点自己的本地缓存
    //   options._connections — 示例里注入的 pub/sub 连接（避免真实 Redis 依赖）
    //   options.channel — pub/sub channel name
    const remoteL1 = new MonSQLize.MemoryCache({ maxEntries: 500, defaultTtl: 60_000 });
    const invalidator = new MonSQLize.DistributedCacheInvalidator({
        cache: l1,
        channel: 'cache-invalidation',
        _connections: { pub: redisStub, sub: redisStub },
    });
    const remoteInvalidator = new MonSQLize.DistributedCacheInvalidator({
        cache: remoteL1,
        channel: 'cache-invalidation',
        _connections: { pub: remoteRedisStub, sub: remoteRedisStub },
    });

    const users = msq.collection<UserDoc>('users');

    // Seed data
    await users.insertMany([
        { username: 'alice', email: 'alice@example.com', role: 'admin', score: 95 },
        { username: 'bob',   email: 'bob@example.com',   role: 'user',  score: 72 },
        { username: 'carol', email: 'carol@example.com', role: 'user',  score: 88 },
    ]);

    // ── withCache: wraps a fetch function with L1 cache ───────────────────────
    console.log('=== withCache: L1 hit / miss ===');
    let fetchCount = 0;
    const getAdmins = MonSQLize.withCache(async () => {
        fetchCount++;
        return users.find({ role: 'admin' });
    }, { namespace: 'users:admins', ttl: 30_000, cache: l1 });

    const admins1 = await getAdmins();
    console.log(`  Fetch #1 (miss) — count: ${fetchCount}, results: ${admins1.length}`);

    const admins2 = await getAdmins();
    console.log(`  Fetch #2 (hit)  — count: ${fetchCount}, results: ${admins2.length}`);

    // ── FunctionCache: named-function registry ────────────────────────────────
    // FunctionCache(cacheOrDb, options?) — pass l1 as the cache backend
    console.log('\n=== FunctionCache: named functions ===');
    const fnCache = new MonSQLize.FunctionCache(l1, {
        namespace: 'user-service',
        ttl: 60_000,
    });

    // register(name, fn, options?) — fn must be (...args: unknown[]) => Promise<unknown>
    fnCache.register('getTopUsers', async (...args: unknown[]) => {
        const limit = args[0] as number;
        const all = await users.find({});
        return all.sort((a: UserDoc, b: UserDoc) => b.score - a.score).slice(0, limit);
    });

    const top3a = await fnCache.execute('getTopUsers', 3) as UserDoc[];
    console.log(`  Top 3 (miss): ${top3a.map(u => u.username).join(', ')}`);
    const top3b = await fnCache.execute('getTopUsers', 3) as UserDoc[];
    console.log(`  Top 3 (hit):  ${top3b.map(u => u.username).join(', ')}`);

    // ── Manual L2 set/get ─────────────────────────────────────────────────────
    console.log('\n=== L2 Redis adapter: direct set/get ===');
    await l2.set('leaderboard:global', [{ rank: 1, username: 'alice' }], 120_000);
    const board = await l2.get('leaderboard:global') as unknown[];
    console.log(`  L2 leaderboard entries: ${board?.length ?? 0}`);

    // ── Distributed invalidation ──────────────────────────────────────────────
    console.log('\n=== DistributedCacheInvalidator ===');
    // Populate two node-local caches
    await l1.set('shared:config', { theme: 'dark' }, 60_000);
    await remoteL1.set('shared:config', { theme: 'dark' }, 60_000);
    console.log(`  Before invalidate — local node has key: ${l1.get('shared:config') !== undefined}`);
    console.log(`  Before invalidate — remote node has key: ${remoteL1.get('shared:config') !== undefined}`);

    await invalidator.invalidate('shared:config');
    await new Promise((resolve) => setImmediate(resolve));
    console.log(`  After invalidate  — local node has key: ${l1.get('shared:config') !== undefined}`);
    console.log(`  After invalidate  — remote node has key: ${remoteL1.get('shared:config') !== undefined}`);

    // ── Cache stats ───────────────────────────────────────────────────────────
    console.log('\n=== MemoryCache stats ===');
    const stats = l1.getStats?.();
    if (stats) {
        // CacheStats: { hits, misses, hitRate, entries, sets, deletes, evictions, ... }
        console.log(`  Hits: ${stats.hits} | Misses: ${stats.misses} | Entries: ${stats.entries}`);
    }

    await invalidator.close();
    await remoteInvalidator.close();
    await teardownExample(msq, server);
    console.log('\n=== Multi-level cache example complete ===');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
