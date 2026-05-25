import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers runtime-core.ts uncovered branches:
//   - connect() when already _connected (line 276-278)
//   - connect() concurrent call (line 280-282)
//   - emit('error', ...) with no listener → logger.error path (line 690-692)
//   - _adapter getter when _client === null (line 451)
//   - dbInstance getter when _client === null (line 467)
//   - scopedCollection with !pool && !database (line 537-539)
//   - runtime.on/once/off event handlers (lines 686-688)
//   - getDefaults() branches (lines 371-388)
//   - health() when not connected (line 436)

describe('runtime-core — connect() already connected branch', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_conn', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('calling connect() twice → second call returns immediately (already connected)', async () => {
        // _connected=true → returns createRuntimeCoreAccessors immediately (line 276-278)
        const result = await runtime.connect();
        assert.ok(result !== null);
    });

    it('concurrent connect() calls → _connectionPromise branch', async () => {
        // First disconnect then test concurrent connect
        const bootstrapB = createMemoryServerBootstrap();
        const { uri } = await bootstrapB.setup();
        const rtB = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_concurrent', config: { uri } });
        // Start two concurrent connects
        const [result1, result2] = await Promise.all([rtB.connect(), rtB.connect()]);
        assert.ok(result1 !== null);
        assert.ok(result2 !== null);
        await rtB.close();
        await bootstrapB.teardown();
    });
});

describe('runtime-core — _adapter and dbInstance getters before connect', () => {
    it('_adapter is null when not connected', () => {
        // Create a runtime but don't connect → _client === null → _adapter returns null
        const rt = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_nconn', config: { uri: 'mongodb://localhost:27017' } });
        const adapter = rt._adapter;
        assert.equal(adapter, null);
    });

    it('dbInstance is null when not connected', () => {
        const rt = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_nconn2', config: { uri: 'mongodb://localhost:27017' } });
        const dbInst = rt.dbInstance;
        assert.equal(dbInst, null);
    });
});

describe('runtime-core — emit without error listener → logger fallback', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;
    const errorLogs: unknown[] = [];

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_rt_emit',
            config: { uri },
            logger: {
                error: (...args: unknown[]) => { errorLogs.push(args); },
                warn: () => {},
                info: () => {},
                debug: () => {},
            },
        });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('emit("error", ...) with no listener → logs to logger (line 690-692)', () => {
        // No 'error' event listener registered → goes through logger path
        runtime.emit('error', { message: 'test error from unit test' });
        // Logger error should have been called
        assert.ok(errorLogs.length >= 1);
    });

    it('emit("error", ...) with listener → calls listener normally', () => {
        const received: unknown[] = [];
        const handler = (payload: unknown) => { received.push(payload); };
        runtime.on('error', handler);
        runtime.emit('error', { message: 'handled error' });
        assert.ok(received.length >= 1);
        runtime.off('error', handler);
    });

    it('emit non-error events → calls listener', () => {
        const received: unknown[] = [];
        const handler = (payload: unknown) => { received.push(payload); };
        runtime.on('test-event', handler);
        runtime.emit('test-event', { data: 123 });
        assert.equal(received.length, 1);
        runtime.off('test-event', handler);
    });

    it('once() handler fires once then is removed', () => {
        const received: unknown[] = [];
        runtime.once('once-event', (payload: unknown) => { received.push(payload); });
        runtime.emit('once-event', { x: 1 });
        runtime.emit('once-event', { x: 2 });
        assert.equal(received.length, 1);
    });
});

describe('runtime-core — scopedCollection with no pool/database → direct collection', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_scoped', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('scopedCollection with empty options → returns direct collection', () => {
        // !pool && !database → returns this.collection(name) (line 537-539)
        const coll = runtime.scopedCollection('test_sc');
        assert.ok(coll !== null);
        assert.ok(typeof coll.findOne === 'function');
    });

    it('scopedCollection with database option → returns db-scoped collection', () => {
        const coll = runtime.scopedCollection('test_sc_db', { database: 'test_rt_scoped' });
        assert.ok(coll !== null);
    });

    it('getDefaults() returns runtime options snapshot', () => {
        const defaults = runtime.getDefaults();
        assert.ok(typeof defaults === 'object');
        assert.equal(defaults.type, 'mongodb');
        assert.equal(defaults.databaseName, 'test_rt_scoped');
    });

    it('health() when connected → status=up', async () => {
        const health = await runtime.health();
        assert.equal(health.status, 'up');
        assert.equal(health.connected, true);
    });
});

describe('runtime-core — getDefaults with various options', () => {
    it('getDefaults with cursorSecret → shows *** mask', async () => {
        const bootstrapD = createMemoryServerBootstrap();
        const { uri } = await bootstrapD.setup();
        const rtD = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_rt_csr',
            config: { uri },
            cursorSecret: 'mysecret',
        });
        await rtD.connect();
        try {
            const defaults = rtD.getDefaults();
            assert.equal(defaults.cursorSecret, '***');
        } finally {
            await rtD.close();
            await bootstrapD.teardown();
        }
    });

    it('getDefaults without cursorSecret → cursorSecret is undefined', async () => {
        const bootstrapE = createMemoryServerBootstrap();
        const { uri } = await bootstrapE.setup();
        const rtE = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_nocsr', config: { uri } });
        await rtE.connect();
        try {
            const defaults = rtE.getDefaults();
            assert.equal(defaults.cursorSecret, undefined);
        } finally {
            await rtE.close();
            await bootstrapE.teardown();
        }
    });
});

describe('runtime-core — health() when not connected', () => {
    it('health() before connect → status=down', async () => {
        const rt = new MonSQLize({ type: 'mongodb', databaseName: 'test_rt_health_down', config: { uri: 'mongodb://localhost:27017' } });
        const health = await rt.health();
        assert.equal(health.status, 'down');
        assert.equal(health.connected, false);
    });
});
