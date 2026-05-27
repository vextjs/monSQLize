import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const MonSQLize = require('../../../dist/cjs/index.cjs');

// ── Constructor edge cases ─────────────────────────────────────────────────────

describe('MonSQLize constructor — unsupported type', () => {
    it('throws UNSUPPORTED_DATABASE for type=postgresql', () => {
        assert.throws(
            () => new MonSQLize({ type: 'postgresql', databaseName: 'db', config: { uri: 'mongodb://localhost' } }),
            (err: unknown) => {
                assert.ok(err instanceof Error);
                assert.ok((err as NodeJS.ErrnoException).message.includes('Supported types'));
                return true;
            },
        );
    });

    it('throws UNSUPPORTED_DATABASE for type=mysql', () => {
        assert.throws(
            () => new MonSQLize({ type: 'mysql' as unknown as 'mongodb', databaseName: 'db', config: { uri: 'mongodb://localhost' } }),
        );
    });
});

// ── Pre-connect method calls ──────────────────────────────────────────────────

describe('MonSQLize pre-connect method calls', () => {
    function makeRuntime() {
        return new MonSQLize({ type: 'mongodb', databaseName: 'test', config: { uri: 'mongodb://localhost:27999' } });
    }

    it('collection() throws NOT_CONNECTED before connect()', () => {
        const r = makeRuntime();
        assert.throws(() => r.collection('col'), /not connected|NOT_CONNECTED/i);
    });

    it('collection() with empty string throws INVALID_COLLECTION_NAME', () => {
        const r = makeRuntime();
        // Even before connect, invalid name is caught first
        assert.throws(() => r.collection(''), /INVALID_COLLECTION_NAME|non-empty/i);
    });

    it('collection() with whitespace-only throws INVALID_COLLECTION_NAME', () => {
        const r = makeRuntime();
        assert.throws(() => r.collection('   '), /INVALID_COLLECTION_NAME|non-empty/i);
    });

    it('db() throws NOT_CONNECTED before connect()', () => {
        const r = makeRuntime();
        assert.throws(() => r.db(), /not connected|NOT_CONNECTED/i);
    });

    it('db(\'\') with empty string throws INVALID_DATABASE_NAME', () => {
        const r = makeRuntime();
        // db() with an invalid name throws the INVALID_DATABASE_NAME error (before NOT_CONNECTED check)
        assert.throws(() => r.db(''), /INVALID_DATABASE_NAME|non-empty/i);
    });

    it('withLock() rejects when not connected', async () => {
        const r = makeRuntime();
        await assert.rejects(() => r.withLock('key', async () => 'done'), /not connected|NOT_CONNECTED/i);
    });

    it('acquireLock() rejects when not connected', async () => {
        const r = makeRuntime();
        await assert.rejects(() => r.acquireLock('key'), /not connected|NOT_CONNECTED/i);
    });

    it('startSession() rejects when not connected', async () => {
        const r = makeRuntime();
        await assert.rejects(() => r.startSession(), /not connected|NOT_CONNECTED/i);
    });

    it('recordSlowQuery() rejects when not connected', async () => {
        const r = makeRuntime();
        await assert.rejects(
            () => r.recordSlowQuery({ database: 'db', collection: 'col', operation: 'find', durationMs: 100 }),
            /not connected|NOT_CONNECTED/i,
        );
    });

    it('getSlowQueryLogs() rejects when not connected', async () => {
        const r = makeRuntime();
        await assert.rejects(() => r.getSlowQueryLogs(), /not connected|NOT_CONNECTED/i);
    });

    it('startSync() rejects when not connected', async () => {
        const r = makeRuntime();
        await assert.rejects(() => r.startSync(), /not connected|NOT_CONNECTED/i);
    });

    it('getDefaults() returns cursorSecret masked as *** when set', () => {
        const r = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test',
            config: { uri: 'mongodb://localhost:27999' },
            cursorSecret: 'my-super-secret',
        });
        const defaults = r.getDefaults();
        assert.equal(defaults.cursorSecret, '***');
    });

    it('getDefaults() returns undefined cursorSecret when not set', () => {
        const r = makeRuntime();
        const defaults = r.getDefaults();
        assert.equal(defaults.cursorSecret, undefined);
    });

    it('getSyncStats() returns null when sync manager not initialized', () => {
        const r = makeRuntime();
        const stats = r.getSyncStats();
        assert.equal(stats, null);
    });

    it('getLockStats() returns null when lock manager not initialized', () => {
        const r = makeRuntime();
        const stats = r.getLockStats();
        assert.equal(stats, null);
    });

    it('health() returns down status when not connected', async () => {
        const r = makeRuntime();
        const h = await r.health();
        assert.equal(h.connected, false);
        assert.equal(h.status, 'down');
    });

    it('emit("error") with no listener logs instead of throwing', () => {
        const r = makeRuntime();
        // Should not throw even with no listeners
        assert.doesNotThrow(() => r.emit('error', new Error('test error')));
    });

    it('on/off event handlers', () => {
        const r = makeRuntime();
        const received: unknown[] = [];
        const handler = (payload: unknown) => received.push(payload);
        r.on('test-event', handler);
        r.emit('test-event', { data: 1 });
        assert.equal(received.length, 1);
        r.off('test-event', handler);
        r.emit('test-event', { data: 2 });
        assert.equal(received.length, 1); // no more events after off
    });

    it('once event handler fires only once', () => {
        const r = makeRuntime();
        const received: unknown[] = [];
        r.once('once-event', (payload: unknown) => received.push(payload));
        r.emit('once-event', 1);
        r.emit('once-event', 2);
        assert.equal(received.length, 1);
    });

    it('saga methods work before connect', () => {
        const r = makeRuntime();
        assert.doesNotThrow(() => r.defineSaga({
            name: 'test-saga',
            steps: [{ name: 's1', execute: async () => {} }],
        }));
        const stats = r.getSagaStats();
        assert.equal(typeof stats, 'object');
    });

    it('listSagas() works without connect', async () => {
        const r = makeRuntime();
        const sagas = await r.listSagas();
        assert.ok(Array.isArray(sagas));
    });

    it('getSlowQueryLogManager() returns null before connect', () => {
        const r = makeRuntime();
        const mgr = r.getSlowQueryLogManager();
        assert.equal(mgr, null);
    });

    it('getSyncManager() returns null before connect', () => {
        const r = makeRuntime();
        const mgr = r.getSyncManager();
        assert.equal(mgr, null);
    });
});

// ── autoConvertObjectId config branches ──────────────────────────────────────

describe('MonSQLize autoConvertObjectId config', () => {
    it('autoConvertObjectId=false disables conversion', () => {
        const r = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test',
            config: { uri: 'mongodb://localhost:27999' },
            autoConvertObjectId: false,
        });
        const defaults = r.getDefaults();
        assert.equal(defaults.autoConvertObjectId, false);
    });

    it('autoConvertObjectId=true enables conversion', () => {
        const r = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test',
            config: { uri: 'mongodb://localhost:27999' },
            autoConvertObjectId: true,
        });
        const defaults = r.getDefaults();
        assert.equal(defaults.autoConvertObjectId, true);
    });

    it('autoConvertObjectId as object with enabled=false', () => {
        const r = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test',
            config: { uri: 'mongodb://localhost:27999' },
            autoConvertObjectId: { enabled: false },
        });
        const defaults = r.getDefaults();
        assert.equal(defaults.autoConvertObjectId?.enabled ?? defaults.autoConvertObjectId, false);
    });
});
