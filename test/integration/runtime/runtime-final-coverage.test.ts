import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers 4 remaining uncovered single-block functions:
//   1. runtime-core-hosts.ts emit arrow (line 68) — via slow query emission
//   2. runtime-core.ts onStartFailure (line 746) — via sync startup failure
//   3. model-instance-config.ts value arrow (line 72) — via v2 statics invocation
//   4. pool/index.ts _createPoolResult.db arrow (line 291) — via selectPool().db()

// ── 1. emit arrow via slow query path ────────────────────────────────────────

describe('emit arrow in runtime-core-hosts.ts — slow query path', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;
    let adapter: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_emit_cov',
            config: { uri },
            slowQueryMs: 0,
            slowQueryLog: {
                enabled: true,
                storage: { type: 'memory' },
                batch: { enabled: false },
            },
        });
        await runtime.connect();
        adapter = runtime._adapter;
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('legacy bridge find with slowQueryMs:0 triggers config.emit → host.emit arrow at line 68', async () => {
        // Every query is "slow" (threshold=0) so withSlowQuery always calls config.emit
        const legacyColl = adapter.collection('test_emit_cov', 'emit_test_col');
        const items = await legacyColl.find({});
        assert.ok(Array.isArray(items));
    });
});

// ── 2. onStartFailure via sync startup failure ────────────────────────────────

describe('onStartFailure in runtime-core.ts — sync target without uri/pool/apply', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri: string;

    before(async () => {
        ({ uri } = await bootstrap.setup());
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('connect() with pool target and no poolManager triggers onStartFailure (swallows error)', async () => {
        // Target has pool: 'nonexistent' — passes validateSyncConfig (pool is provided)
        // But inside start() → initializeTargets() → resolveTarget throws (no poolManager)
        // initializeRuntimeSyncManager catches that error and calls onStartFailure
        // onStartFailure logs/emits 'error' but does NOT propagate, so connect() succeeds
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_syncfail_cov',
            config: { uri },
            sync: {
                enabled: true,
                targets: [{ name: 'tgt', pool: 'nonexistent-pool' }],
            },
        });
        await runtime.connect();
        await runtime.close();
    });
});

// ── 3. value arrow via v2 statics invocation ─────────────────────────────────

describe('value arrow in model-instance-config.ts — v2 statics', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        MonSQLize.Model._clear();
        MonSQLize.Model.define('CovStaticsModel', {
            schema: {},
            statics: {
                findActive: () => ['active-item'],
            },
        });
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_statics_cov',
            config: { uri },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    it('calling v2 static method invokes value arrow at model-instance-config.ts:72', () => {
        const m = runtime.model('CovStaticsModel');
        const result = m.findActive();
        assert.deepEqual(result, ['active-item']);
    });
});

// ── 4. _createPoolResult.db via selectPool().db() ────────────────────────────

describe('_createPoolResult.db in pool/index.ts — selectPool().db()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_pool_db_cov',
            config: { uri },
            pools: [{ name: 'main', uri, role: 'primary' }],
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('selectPool().db() calls the db arrow at pool/index.ts:291', () => {
        const pm = runtime._poolManager;
        assert.ok(pm !== null, '_poolManager should be set when pools option is used');
        const selected = pm.selectPool('read', { pool: 'main' });
        const db = selected.db('test_pool_db_cov');
        assert.ok(db !== null);
    });
});
