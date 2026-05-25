import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// Covers runtime-core-hosts.ts uncovered inner functions of createRuntimeCoreAdapterBridgeHost:
//   - get _client()            (bridge.client getter)
//   - get _iidCache()          (bridge._iidCache getter)
//   - set _iidCache(value)     (bridge._iidCache setter)
//   - get _slowQueryLogManager() (bridge.slowQueryLogManager getter)
//   - resolveAdapterCache      (bridge.cache getter)
//   - setAdapterCache          (bridge.cache setter)
//   - initializeSlowQueryLogManager (called inside createLegacyCollectionBridge via withSlowQuery)

describe('adapter bridge host — property access coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let runtime: any;
    let adapter: any;

    before(async () => {
        const { uri } = await bootstrap.setup();
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_bridge_cov', config: { uri } });
        await runtime.connect();
        adapter = runtime._adapter;
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('runtime._adapter is non-null after connect', () => {
        assert.ok(adapter !== null);
        assert.ok(typeof adapter === 'object');
    });

    it('adapter.client → triggers host._client getter', () => {
        // Accessing bridge.client calls config.getClient() → host._client getter
        const client = adapter.client;
        assert.ok(client !== null);
    });

    it('adapter.cache → triggers host.resolveAdapterCache()', () => {
        // Accessing bridge.cache calls config.getCache() → host.resolveAdapterCache() arrow
        const cache = adapter.cache;
        assert.ok(cache !== undefined);
    });

    it('adapter.cache = value → triggers host.setAdapterCache()', () => {
        // Setting bridge.cache calls config.setCache() → host.setAdapterCache() arrow
        const original = adapter.cache;
        adapter.cache = null;
        adapter.cache = original;
    });

    it('adapter._iidCache → triggers host._iidCache getter', () => {
        // Accessing bridge._iidCache calls config.getIidCache() → host._iidCache getter
        const iidCache = adapter._iidCache;
        // may be null if not yet initialised
        assert.ok(iidCache === null || typeof iidCache === 'object');
    });

    it('adapter._iidCache = value → triggers host._iidCache setter', () => {
        // Setting bridge._iidCache calls config.setIidCache() → host._iidCache setter
        const original = adapter._iidCache;
        adapter._iidCache = null;
        adapter._iidCache = original;
    });

    it('adapter.slowQueryLogManager → triggers host._slowQueryLogManager getter', () => {
        // Accessing bridge.slowQueryLogManager calls config.getSlowQueryLogManager() → host._slowQueryLogManager getter
        const sqm = adapter.slowQueryLogManager;
        assert.ok(sqm === null || typeof sqm === 'object');
    });

    it('adapter.collection() → triggers initializeSlowQueryLogManager inside withSlowQuery', async () => {
        // createLegacyCollectionBridge runs withSlowQuery on each operation,
        // which calls config.initializeSlowQueryLogManager() → host.initializeSlowQueryLogManager() arrow
        const legacyColl = adapter.collection('test_bridge_cov', 'bridge_test_col');
        assert.ok(typeof legacyColl.find === 'function');
        // Running a find triggers withSlowQuery → initializeSlowQueryLogManager
        const items = await legacyColl.find({});
        assert.ok(Array.isArray(items));
    });
});
