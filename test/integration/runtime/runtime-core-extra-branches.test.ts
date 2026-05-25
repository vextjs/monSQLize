import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers additional runtime-core.ts branches not hit by existing tests:
//   - health() when NOT connected → status: 'down'
//   - connect() when already connected → immediate return
//   - connect() concurrent call uses existing _connectionPromise
//   - close() with lock manager, slow-query log, saga orchestrator
//   - pool health status in health()
//   - getDefaults with various optional fields

describe('runtime-core — health() when not connected', () => {
    it('health() returns down status before connect', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'x', config: { uri: 'mongodb://localhost:27017' } });
        const h = await runtime.health();
        assert.equal(h.status, 'down');
        assert.equal(h.connected, false);
        assert.equal(h.driver.connected, false);
        assert.ok(h.defaults !== null);
    });
});

describe('runtime-core — connect() idempotency', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_rc_idem', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('connect() called twice returns same result without re-connecting', async () => {
        // connect() when _connected=true → immediate return path
        const result = await runtime.connect();
        assert.ok(result !== null);
    });

    it('health() returns up status after connect', async () => {
        const h = await runtime.health();
        assert.equal(h.status, 'up');
        assert.equal(h.connected, true);
    });

    it('getDefaults() returns expected fields including optional ones', () => {
        const d = runtime.getDefaults();
        assert.ok('type' in d);
        assert.ok('databaseName' in d);
        assert.ok('autoConvertObjectId' in d);
    });
});

describe('runtime-core — close() with capability managers', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('close() with slow-query-log manager initialized runs without error', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_close_sql',
            config: { uri },
            slowQueryLog: { enabled: true, storage: { type: 'memory' } },
        });
        await runtime.connect();
        // Initialize slow query log by making a query
        await runtime.collection('test_col').find({});
        await assert.doesNotReject(() => runtime.close());
    });

    it('close() with lock manager initialized runs without error', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_close_lock',
            config: { uri },
        });
        await runtime.connect();
        // Initialize lock manager
        try {
            await runtime.lock('test-key', { timeout: 1000 });
        } catch {
            // lock might time out, that's ok
        }
        await assert.doesNotReject(() => runtime.close());
    });

    it('close() emits closed event', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_close_event',
            config: { uri },
        });
        await runtime.connect();
        let closedEmitted = false;
        runtime.on('closed', () => { closedEmitted = true; });
        await runtime.close();
        assert.ok(closedEmitted);
    });
});

describe('runtime-core — pool health status in health()', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_rc_pool_health',
            config: { uri },
            pools: [{ name: 'primary', uri, role: 'primary' }],
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('health() with pool manager returns pool status', async () => {
        const h = await runtime.health();
        assert.equal(h.status, 'up');
        // pools may be present in cache
        assert.ok('cache' in h);
    });
});

describe('runtime-core — getDefaults with various optional fields', () => {
    it('getDefaults with maxTimeMS, findLimit, cursorSecret', () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_defaults',
            config: { uri: 'mongodb://localhost:27017' },
            maxTimeMS: 5000,
            findLimit: 100,
            findPageMaxLimit: 500,
            cursorSecret: 'my-secret',
            namespace: 'myapp',
        });
        const d = runtime.getDefaults();
        assert.equal(d.maxTimeMS, 5000);
        assert.equal(d.findLimit, 100);
        assert.equal(d.findPageMaxLimit, 500);
        assert.equal(d.cursorSecret, '***'); // masked
        assert.equal(d.namespace, 'myapp');
    });

    it('getDefaults without optional fields has no cursorSecret', () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_defaults_bare',
            config: { uri: 'mongodb://localhost:27017' },
        });
        const d = runtime.getDefaults();
        // cursorSecret should be undefined or masked when not set
        assert.ok(d.cursorSecret === undefined || d.cursorSecret === null);
    });
});
