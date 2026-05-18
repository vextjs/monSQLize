/**
 * MultiLevelCache 单元测试
 * 重点覆盖 v1.1.9 修复：L2→L1 回填时携带 TTL，防止 null 值永久驻留 L1
 */

'use strict';

const assert = require('assert');
const MultiLevelCache = require('../../../lib/multi-level-cache');
const CacheFactory = require('../../../lib/cache');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('MultiLevelCache — 基础功能', () => {
    let local, remote, cache;

    beforeEach(() => {
        local = CacheFactory.createDefault({ maxSize: 100 });
        remote = CacheFactory.createDefault({ maxSize: 100 });
        cache = new MultiLevelCache({ local, remote });
    });

    it('L1 命中时直接返回，不查 L2', async () => {
        await local.set('k1', 'local-val', 5000);
        await remote.set('k1', 'remote-val', 5000);
        const result = await cache.get('k1');
        assert.strictEqual(result, 'local-val');
    });

    it('L1 miss → L2 hit → 返回 L2 值并回填 L1', async () => {
        await remote.set('k1', 'from-remote', 5000);
        const result = await cache.get('k1');
        assert.strictEqual(result, 'from-remote');
        // 验证回填发生
        assert.strictEqual(await local.get('k1'), 'from-remote');
    });

    it('L1 miss → L2 miss → 返回 undefined，不回填', async () => {
        const result = await cache.get('no-exist');
        assert.strictEqual(result, undefined);
        assert.strictEqual(await local.get('no-exist'), undefined);
    });

    it('set 写入 L1 和 L2', async () => {
        await cache.set('k1', 'v1', 5000);
        assert.strictEqual(await local.get('k1'), 'v1');
        assert.strictEqual(await remote.get('k1'), 'v1');
    });

    it('del 从 L1 和 L2 同时删除', async () => {
        await cache.set('k1', 'v1', 5000);
        await cache.del('k1');
        assert.strictEqual(await local.get('k1'), undefined);
        assert.strictEqual(await remote.get('k1'), undefined);
    });

    it('backfillLocalOnRemoteHit=false 时 L2 命中不回填', async () => {
        const c = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: false },
        });
        await remote.set('k1', 'val', 5000);
        await c.get('k1');
        assert.strictEqual(await local.get('k1'), undefined);
    });
});

describe('MultiLevelCache — backfillLocalTTL 修复 (v1.1.9)', () => {
    it('配置 backfillLocalTTL 时，回填后 L1 在 TTL 后过期', async () => {
        const local = CacheFactory.createDefault();
        const remote = CacheFactory.createDefault();
        const cache = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: true, backfillLocalTTL: 80 },
        });

        await remote.set('k1', 'value', 5000);
        const result = await cache.get('k1');
        assert.strictEqual(result, 'value');
        // 回填立即命中
        assert.strictEqual(await local.get('k1'), 'value');

        // TTL 过期后 L1 清除
        await sleep(120);
        assert.strictEqual(await local.get('k1'), undefined);
    });

    it('【核心回归】null 值 + backfillLocalTTL → 按 TTL 过期，不永久驻留 L1', async () => {
        const local = CacheFactory.createDefault();
        const remote = CacheFactory.createDefault();
        const cache = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: true, backfillLocalTTL: 80 },
        });

        // L2 缓存空结果（null）
        await remote.set('user:404', null, 5000);

        // L1 miss → L2 hit → 回填 null
        const result = await cache.get('user:404');
        assert.strictEqual(result, null, 'L2 命中的 null 应正确返回');

        // 回填后 L1 有 null（带 TTL）
        assert.strictEqual(await local.get('user:404'), null, '回填后 L1 应有 null 值');

        // TTL 过期后 null 不再驻留
        await sleep(120);
        assert.strictEqual(
            await local.get('user:404'),
            undefined,
            '【回归】backfillLocalTTL 过期后 null 不应永久驻留 L1'
        );
    });

    it('backfillLocalTTL=0（默认）时，回填无 TTL，向后兼容', async () => {
        const local = CacheFactory.createDefault();
        const remote = CacheFactory.createDefault();
        // 不配置 backfillLocalTTL，默认为 0
        const cache = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: true },
        });

        await remote.set('k1', 'val', 5000);
        await cache.get('k1');

        // backfillLocalTTL=0 → 回填无 TTL → 短暂等待后仍存在（向后兼容）
        await sleep(50);
        assert.strictEqual(await local.get('k1'), 'val', 'backfillLocalTTL=0 时非 null 回填应永久有效（向后兼容）');
    });

    it('【补充修复】backfillLocalTTL=0 + null → 跳过回填，无需配置即阻断 Bug', async () => {
        const local = CacheFactory.createDefault();
        const remote = CacheFactory.createDefault();
        // 不配置 backfillLocalTTL（默认 0）
        const cache = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: true },
        });

        // L2 缓存 null（空结果）
        await remote.set('user:deleted', null, 5000);

        // 触发回填
        const result = await cache.get('user:deleted');
        assert.strictEqual(result, null, 'L2 的 null 应正确返回');

        // 关键：backfillLocalTTL=0 + null → 跳过回填，L1 不应有 null
        assert.strictEqual(
            await local.get('user:deleted'),
            undefined,
            '【补充修复】backfillLocalTTL=0 时 null 值不应回填到 L1，防止永久驻留'
        );
    });

    it('policy.backfillLocalTTL 正确解析为数字 0 的默认值', () => {
        const local = CacheFactory.createDefault();
        const c1 = new MultiLevelCache({ local, policy: {} });
        assert.strictEqual(c1.policy.backfillLocalTTL, 0);

        const c2 = new MultiLevelCache({ local, policy: { backfillLocalTTL: 30000 } });
        assert.strictEqual(c2.policy.backfillLocalTTL, 30000);
    });
});

describe('MultiLevelCache — getWithTTL 方案 A (v1.1.9)', () => {
    it('remote 支持 getWithTTL 时，优先使用 L2 剩余 TTL 回填', async () => {
        const local = CacheFactory.createDefault();
        // Mock remote 支持 getWithTTL，返回 80ms 剩余 TTL
        const mockRemote = {
            get: async () => 'val',
            set: async () => {},
            del: async () => false,
            exists: async () => false,
            getMany: async () => ({}),
            setMany: async () => true,
            delMany: async () => 0,
            delPattern: async () => 0,
            clear: () => {},
            keys: () => [],
            getWithTTL: async (key) => ({ value: 'val-with-ttl', remainingTTL: 80 }),
        };

        const cache = new MultiLevelCache({
            local, remote: mockRemote,
            // backfillLocalTTL 兜底为 5000，但 getWithTTL 返回 80ms，应优先用 80ms
            policy: { backfillLocalOnRemoteHit: true, backfillLocalTTL: 5000 },
            remoteTimeoutMs: 500,
        });

        const result = await cache.get('k1');
        assert.strictEqual(result, 'val-with-ttl');
        assert.strictEqual(await local.get('k1'), 'val-with-ttl', '应回填到 L1');

        // 使用 L2 剩余 TTL（80ms），100ms 后应过期（而非 5000ms 兜底）
        await sleep(120);
        assert.strictEqual(
            await local.get('k1'),
            undefined,
            '应使用 L2 剩余 TTL（80ms）而非兜底 TTL（5000ms）'
        );
    });

    it('getWithTTL 返回 undefined（L2 无此 key）时不回填', async () => {
        const local = CacheFactory.createDefault();
        const mockRemote = {
            get: async () => undefined,
            set: async () => {},
            del: async () => false,
            exists: async () => false,
            getMany: async () => ({}),
            setMany: async () => true,
            delMany: async () => 0,
            delPattern: async () => 0,
            clear: () => {},
            keys: () => [],
            getWithTTL: async () => undefined, // key 不存在
        };

        const cache = new MultiLevelCache({
            local, remote: mockRemote,
            policy: { backfillLocalOnRemoteHit: true, backfillLocalTTL: 5000 },
            remoteTimeoutMs: 500,
        });

        const result = await cache.get('no-exist');
        assert.strictEqual(result, undefined);
        assert.strictEqual(await local.get('no-exist'), undefined, 'L2 miss 时不应回填');
    });

    it('getWithTTL 返回 remainingTTL=0 时降级到 backfillLocalTTL', async () => {
        const local = CacheFactory.createDefault();
        const mockRemote = {
            get: async () => 'val',
            set: async () => {},
            del: async () => false,
            exists: async () => false,
            getMany: async () => ({}),
            setMany: async () => true,
            delMany: async () => 0,
            delPattern: async () => 0,
            clear: () => {},
            keys: () => [],
            // PTTL=-1（永不过期）→ remainingTTL=0，降级到 backfillLocalTTL
            getWithTTL: async () => ({ value: 'val', remainingTTL: 0 }),
        };

        const cache = new MultiLevelCache({
            local, remote: mockRemote,
            policy: { backfillLocalOnRemoteHit: true, backfillLocalTTL: 80 },
            remoteTimeoutMs: 500,
        });

        await cache.get('k1');
        assert.strictEqual(await local.get('k1'), 'val');

        // remainingTTL=0 → 降级用 backfillLocalTTL=80ms → 过期
        await sleep(120);
        assert.strictEqual(await local.get('k1'), undefined, '降级到 backfillLocalTTL 后应按该 TTL 过期');
    });
});

describe('MultiLevelCache — getMany 回填 (v1.1.9)', () => {
    it('getMany 回填携带 backfillLocalTTL，null 值不永久驻留', async () => {
        const local = CacheFactory.createDefault();
        const remote = CacheFactory.createDefault();
        const cache = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: true, backfillLocalTTL: 80 },
        });

        await remote.set('k1', null, 5000);
        await remote.set('k2', 'val2', 5000);

        const res = await cache.getMany(['k1', 'k2', 'k3']);
        assert.strictEqual(res.k1, null);
        assert.strictEqual(res.k2, 'val2');
        assert.strictEqual(res.k3, undefined);

        // 等待 fire-and-forget setMany 完成
        await sleep(20);
        assert.strictEqual(await local.get('k1'), null, 'getMany 回填后 L1 应有 null 值（有 TTL）');
        assert.strictEqual(await local.get('k2'), 'val2', 'getMany 回填后 L1 应有 val2');

        // TTL 过期后清除
        await sleep(100);
        assert.strictEqual(await local.get('k1'), undefined, '【回归】getMany 回填的 null 应按 TTL 过期');
        assert.strictEqual(await local.get('k2'), undefined, 'getMany 回填的值应按 TTL 过期');
    });

    it('【补充修复】getMany backfillLocalTTL=0 时 null 值不回填，非 null 值正常回填', async () => {
        const local = CacheFactory.createDefault();
        const remote = CacheFactory.createDefault();
        // 不配置 backfillLocalTTL（默认 0）
        const cache = new MultiLevelCache({
            local, remote,
            policy: { backfillLocalOnRemoteHit: true },
        });

        await remote.set('k1', null, 5000);
        await remote.set('k2', 'val2', 5000);

        const res = await cache.getMany(['k1', 'k2']);
        assert.strictEqual(res.k1, null);
        assert.strictEqual(res.k2, 'val2');

        await sleep(20); // 让 fire-and-forget 完成

        // null 值不应回填（防止永久驻留）
        assert.strictEqual(await local.get('k1'), undefined, '【补充修复】backfillLocalTTL=0 时 null 不应回填');
        // 非 null 值应正常回填（向后兼容）
        assert.strictEqual(await local.get('k2'), 'val2', 'backfillLocalTTL=0 时非 null 值应正常回填');
    });
});

