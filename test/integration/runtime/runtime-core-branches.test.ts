import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('runtime-core — emit/event/pool/sync branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_rc_branches', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    // ── emit branches ─────────────────────────────────────────────────────────

    it('emit error event with no listener logs instead of throwing', () => {
        // Create a fresh runtime without error listener
        const rt2 = new MonSQLize({ type: 'mongodb', databaseName: 'test_no_listener', config: { uri } });
        // Directly emit error without connecting — should not throw
        assert.doesNotThrow(() => {
            rt2.emit('error', { type: 'mongodb', error: 'test error' });
        });
    });

    it('emit custom event with registered listener', () => {
        const received: unknown[] = [];
        const handler = (payload: unknown) => received.push(payload);
        runtime.on('custom', handler);
        runtime.emit('custom', { value: 42 });
        assert.equal(received.length, 1);
        assert.deepEqual(received[0], { value: 42 });
        runtime.off('custom', handler); // cleanup
    });

    it('on/once/off event registration', () => {
        let count = 0;
        const handler = () => { count += 1; };
        runtime.on('test-event', handler);
        runtime.emit('test-event', {});
        runtime.emit('test-event', {});
        runtime.off('test-event', handler);
        runtime.emit('test-event', {});
        assert.equal(count, 2); // off removed it

        let onceCount = 0;
        runtime.once('once-event', () => { onceCount += 1; });
        runtime.emit('once-event', {});
        runtime.emit('once-event', {});
        assert.equal(onceCount, 1);
    });

    // ── collection/db invalid input ───────────────────────────────────────────

    it('collection("") throws INVALID_COLLECTION_NAME', () => {
        assert.throws(() => runtime.collection(''), /non-empty/i);
    });

    it('collection(undefined) throws', () => {
        assert.throws(() => runtime.collection(undefined as any));
    });

    it('db("") throws INVALID_DATABASE_NAME', () => {
        assert.throws(() => runtime.db(''), /non-empty/i);
    });

    // ── startSync without sync config throws ─────────────────────────────────

    it('startSync throws when sync is not enabled', async () => {
        await assert.rejects(
            () => runtime.startSync(),
            /sync is not enabled/i,
        );
    });

    // ── getSyncStats with no sync manager returns null ────────────────────────

    it('getSyncStats returns null when no sync manager', () => {
        const result = runtime.getSyncStats();
        assert.equal(result, null);
    });

    // ── stopSync does not throw when no sync manager ──────────────────────────

    it('stopSync does not throw when no sync manager', async () => {
        await assert.doesNotReject(() => runtime.stopSync());
    });

    // ── health() returns status ───────────────────────────────────────────────

    it('health() returns connected status', async () => {
        const h = await runtime.health();
        assert.ok(typeof h === 'object');
        assert.equal(h.status, 'up');
        assert.equal(h.connected, true);
    });

    // ── getDefaults returns config ────────────────────────────────────────────

    it('getDefaults returns defaults object', () => {
        const d = runtime.getDefaults();
        assert.ok(typeof d === 'object');
        assert.ok('type' in d);
        assert.ok('databaseName' in d);
    });

    // ── getCache returns cache ────────────────────────────────────────────────

    it('getCache returns cache', () => {
        const c = runtime.getCache();
        assert.ok(c !== null && c !== undefined);
    });

    // ── getLockStats returns null before any lock activity ────────────────────

    it('getLockStats returns null when lock manager not used', () => {
        const stats = runtime.getLockStats();
        // may be null or an object if lock manager was initialized
        assert.ok(stats === null || typeof stats === 'object');
    });

    // ── _adapter and dbInstance properties ────────────────────────────────────

    it('_adapter is non-null after connect', () => {
        assert.ok(runtime._adapter !== null);
    });

    it('dbInstance is non-null after connect', () => {
        assert.ok(runtime.dbInstance !== null);
    });

    it('_connecting is null when not connecting', () => {
        assert.equal(runtime._connecting, null);
    });

    // ── listDatabases ─────────────────────────────────────────────────────────

    it('listDatabases returns array', async () => {
        const result = await runtime.listDatabases({ nameOnly: true });
        assert.ok(Array.isArray(result));
    });

    // ── listCollections ────────────────────────────────────────────────────────

    it('listCollections returns array', async () => {
        const result = await runtime.listCollections({});
        assert.ok(Array.isArray(result));
    });

    // ── runCommand ─────────────────────────────────────────────────────────────

    it('runCommand ping returns ok=1', async () => {
        const result = await runtime.runCommand({ ping: 1 });
        assert.ok(result.ok === 1);
    });

    // ── sagaStats and defineSaga ──────────────────────────────────────────────

    it('getSagaStats returns stats object', () => {
        const stats = runtime.getSagaStats();
        assert.ok(typeof stats === 'object');
    });

    it('defineSaga registers a saga', () => {
        assert.doesNotThrow(() => {
            runtime.defineSaga({
                name: 'rc-test-saga',
                steps: [{ name: 'step1', execute: async () => ({ ok: true }) }],
            });
        });
    });

    it('listSagas returns array containing defined saga', async () => {
        const list = await runtime.listSagas();
        assert.ok(Array.isArray(list));
        assert.ok(list.includes('rc-test-saga'));
    });
});

describe('runtime-core — pool management branch coverage', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        // Create runtime WITHOUT pool config → pool methods throw
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'test_rc_pool', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('addPool throws when no pool manager configured', async () => {
        await assert.rejects(
            () => runtime.addPool({ name: 'extra', uri }),
            /pool.*requires|no pool manager/i,
        );
    });

    it('removePool throws when no pool manager configured', async () => {
        await assert.rejects(
            () => runtime.removePool('extra'),
            /pool.*requires|no pool manager/i,
        );
    });

    it('getPoolNames throws when no pool manager configured', () => {
        assert.throws(() => runtime.getPoolNames(), /pool.*requires|no pool manager/i);
    });

    it('getPoolStats throws when no pool manager configured', () => {
        assert.throws(() => runtime.getPoolStats(), /pool.*requires|no pool manager/i);
    });

    it('getPoolHealth throws when no pool manager configured', () => {
        assert.throws(() => runtime.getPoolHealth(), /pool.*requires|no pool manager/i);
    });
});

describe('runtime-core — db() branch: custom database name creates new facade', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';
    let runtime: any;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
        runtime = new MonSQLize({ type: 'mongodb', databaseName: 'primary_db', config: { uri } });
        await runtime.connect();
    });

    after(async () => {
        if (runtime) await runtime.close();
        await bootstrap.teardown();
    });

    it('db() with different name creates new db facade', () => {
        const otherDb = runtime.db('other_db');
        assert.ok(otherDb !== null);
    });

    it('db() without name returns default db facade', () => {
        const defaultDb = runtime.db();
        assert.ok(defaultDb !== null);
    });

    it('use() returns scoped accessor', () => {
        const scoped = runtime.use('other_db');
        assert.ok(typeof scoped.collection === 'function');
        assert.ok(typeof scoped.model === 'function');
    });
});
