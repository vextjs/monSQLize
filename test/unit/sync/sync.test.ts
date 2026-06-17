import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type ChangeEvent = {
    _id: { token: number };
    operationType: string;
    ns: { db: string; coll: string };
    documentKey: { _id: number };
    fullDocument: { _id: number; name: string };
};

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('P4-C sync', () => {
    it('supports ResumeTokenStore file read/write round trip', async () => {
        const tokenPath = path.join(os.tmpdir(), `monsqlize-sync-${Date.now()}.json`);
        const store = new MonSQLize.ResumeTokenStore({
            storage: 'file',
            path: tokenPath,
        });

        await store.save({ token: 1 });
        assert.deepEqual(await store.load(), { token: 1 });
        await store.clear();
        assert.equal(await store.load(), null);
        await fs.rm(tokenPath, { force: true });
    });

    it('keeps a backup and rejects corrupted file tokens in strict mode', async () => {
        const tokenPath = path.join(os.tmpdir(), `monsqlize-sync-atomic-${Date.now()}.json`);
        const store = new MonSQLize.ResumeTokenStore({
            storage: 'file',
            path: tokenPath,
            logger: { warn: () => undefined, error: () => undefined },
        });

        await store.save({ token: 1 });
        await store.save({ token: 2 });
        assert.deepEqual(await store.load(), { token: 2 });
        assert.deepEqual(JSON.parse(await fs.readFile(`${tokenPath}.bak`, 'utf8')), { token: 1 });

        await fs.writeFile(tokenPath, '{ invalid json', 'utf8');
        await assert.rejects(() => store.load(), /failed to load resume token/i);

        const legacyStore = new MonSQLize.ResumeTokenStore({
            storage: 'file',
            path: tokenPath,
            strictLoad: false,
            logger: { warn: () => undefined, error: () => undefined },
        });
        assert.equal(await legacyStore.load(), null);

        await fs.rm(tokenPath, { force: true });
        await fs.rm(`${tokenPath}.bak`, { force: true });
    });

    it('supports minimal Change Stream manager start, event handling, and stats', async () => {
        let watchCount = 0;
        const liveStream = new EventEmitter() as EventEmitter & { close(): Promise<boolean> };
        liveStream.close = () => Promise.resolve(true);
        const applied: Array<{ event: ChangeEvent; document: ChangeEvent['fullDocument'] }> = [];
        let savedToken: ChangeEvent['_id'] | null = null;

        const db = {
            databaseName: 'source_db',
            watch() {
                watchCount += 1;
                if (watchCount === 1) {
                    return {
                        close: () => Promise.resolve(true),
                    };
                }
                return liveStream;
            },
        };

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                collections: ['users'],
                targets: [
                    {
                        name: 'backup-users',
                        apply: (event: ChangeEvent, document: ChangeEvent['fullDocument']) => {
                            applied.push({ event, document });
                            return Promise.resolve();
                        },
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(savedToken),
                save: (token: ChangeEvent['_id']) => {
                    savedToken = token;
                    return Promise.resolve();
                },
                clear: () => {
                    savedToken = null;
                    return Promise.resolve();
                },
            },
        });

        await manager.start();
        liveStream.emit('change', {
            _id: { token: 1 },
            operationType: 'insert',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada' },
        });

        await wait(20);

        const stats = manager.getStats();
        assert.equal(stats.isRunning, true);
        assert.equal(stats.eventCount, 1);
        assert.equal(stats.syncedCount, 1);
        assert.equal(applied.length, 1);
        assert.deepEqual(applied[0].document, { _id: 1, name: 'Ada' });
        assert.deepEqual(savedToken, { token: 1 });

        await manager.stop();
        assert.equal(manager.getStats().isRunning, false);
    });

    it('marks the manager stopped when the live change stream closes unexpectedly', async () => {
        let watchCount = 0;
        const liveStream = new EventEmitter() as EventEmitter & { close(): Promise<boolean> };
        liveStream.close = () => Promise.resolve(true);

        const db = {
            databaseName: 'source_db',
            watch() {
                watchCount += 1;
                if (watchCount === 1) {
                    return {
                        close: () => Promise.resolve(true),
                    };
                }
                return liveStream;
            },
        };

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                targets: [
                    {
                        name: 'backup-users',
                        apply: () => Promise.resolve(),
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(null),
                save: () => Promise.resolve(),
                clear: () => Promise.resolve(),
            },
            logger: { warn: () => undefined, error: () => undefined, info: () => undefined, debug: () => undefined },
        });

        await manager.start();
        liveStream.emit('close');

        const stats = manager.getStats();
        assert.equal(stats.isRunning, false);
        assert.equal(stats.errorCount, 1);
        assert.match(stats.lastError?.message ?? '', /closed unexpectedly/i);

        await manager.stop();
    });

    it('processes change events serially before saving resume tokens', async () => {
        const liveStream = new EventEmitter() as EventEmitter & { close(): Promise<boolean> };
        liveStream.close = () => Promise.resolve(true);
        const applied: number[] = [];
        const savedTokens: number[] = [];

        const db = {
            databaseName: 'source_db',
            watch(_pipeline: unknown[], options: Record<string, unknown>) {
                if (options?.maxAwaitTimeMS === 1) {
                    return { close: () => Promise.resolve(true) };
                }
                return liveStream;
            },
        };

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                collections: ['users'],
                targets: [
                    {
                        name: 'ordered-target',
                        apply: async (event: ChangeEvent) => {
                            if (event._id.token === 1) {
                                await wait(30);
                            }
                            applied.push(event._id.token);
                        },
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(null),
                save: (token: ChangeEvent['_id']) => {
                    savedTokens.push(token.token);
                    return Promise.resolve();
                },
                clear: () => Promise.resolve(),
            },
        });

        await manager.start();
        liveStream.emit('change', {
            _id: { token: 1 },
            operationType: 'insert',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada' },
        });
        liveStream.emit('change', {
            _id: { token: 2 },
            operationType: 'update',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada2' },
        });

        await manager.stop();
        assert.deepEqual(applied, [1, 2]);
        assert.deepEqual(savedTokens, [1, 2]);
    });

    it('does not save a shared resume token when any eligible target fails', async () => {
        const liveStream = new EventEmitter() as EventEmitter & { close(): Promise<boolean> };
        liveStream.close = () => Promise.resolve(true);
        const applied: string[] = [];
        const savedTokens: number[] = [];

        const db = {
            databaseName: 'source_db',
            watch(_pipeline: unknown[], options: Record<string, unknown>) {
                if (options?.maxAwaitTimeMS === 1) {
                    return { close: () => Promise.resolve(true) };
                }
                return liveStream;
            },
        };

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                collections: ['users'],
                targets: [
                    {
                        name: 'ok',
                        collections: ['users'],
                        apply: async () => {
                            applied.push('ok');
                        },
                    },
                    {
                        name: 'bad',
                        collections: ['users'],
                        apply: async () => {
                            throw new Error('target failed');
                        },
                    },
                    {
                        name: 'skipped',
                        collections: ['orders'],
                        apply: async () => {
                            applied.push('skipped');
                        },
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(null),
                save: (token: ChangeEvent['_id']) => {
                    savedTokens.push(token.token);
                    return Promise.resolve();
                },
                clear: () => Promise.resolve(),
            },
            logger: { error: () => undefined, warn: () => undefined, info: () => undefined, debug: () => undefined },
        });

        await manager.start();
        liveStream.emit('change', {
            _id: { token: 3 },
            operationType: 'insert',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada' },
        });

        await wait(20);
        await manager.stop();

        assert.deepEqual(applied, ['ok']);
        assert.deepEqual(savedTokens, []);
        const stats = manager.getStats();
        assert.equal(stats.syncedCount, 0);
        assert.equal(stats.errorCount, 1);
    });

    it('stops processing changes when resume token persistence fails', async () => {
        const liveStream = new EventEmitter() as EventEmitter & { close(): Promise<boolean> };
        let closed = false;
        liveStream.close = async () => {
            closed = true;
            return true;
        };
        const applied: number[] = [];

        const db = {
            databaseName: 'source_db',
            watch(_pipeline: unknown[], options: Record<string, unknown>) {
                if (options?.maxAwaitTimeMS === 1) {
                    return { close: () => Promise.resolve(true) };
                }
                return liveStream;
            },
        };

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                collections: ['users'],
                targets: [
                    {
                        name: 'strict-token-target',
                        apply: async (event: ChangeEvent) => {
                            applied.push(event._id.token);
                        },
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(null),
                save: () => Promise.reject(new Error('token store down')),
                clear: () => Promise.resolve(),
            },
            logger: { error: () => undefined, warn: () => undefined, info: () => undefined, debug: () => undefined },
        });

        await manager.start();
        liveStream.emit('change', {
            _id: { token: 6 },
            operationType: 'insert',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada' },
        });
        await wait(20);
        liveStream.emit('change', {
            _id: { token: 7 },
            operationType: 'update',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada2' },
        });
        await wait(20);

        const stats = manager.getStats();
        assert.deepEqual(applied, [6]);
        assert.equal(closed, true);
        assert.equal(stats.isRunning, false);
        assert.equal(stats.syncedCount, 0);
        assert.equal(stats.errorCount, 1);
        assert.equal(stats.tokenSaveErrorCount, 1);
        assert.ok(stats.lastTokenSaveError instanceof Error);

        await manager.stop();
    });

    it('applies the manager transform once and passes undefined documents for delete events', async () => {
        const liveStream = new EventEmitter() as EventEmitter & { close(): Promise<boolean> };
        liveStream.close = () => Promise.resolve(true);
        let transformCalls = 0;
        const seen: Array<{ target: string; document: unknown }> = [];

        const db = {
            databaseName: 'source_db',
            watch(_pipeline: unknown[], options: Record<string, unknown>) {
                if (options?.maxAwaitTimeMS === 1) {
                    return { close: () => Promise.resolve(true) };
                }
                return liveStream;
            },
        };

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                collections: ['users'],
                transform: (doc: unknown) => {
                    transformCalls += 1;
                    if (doc === undefined) {
                        return undefined;
                    }
                    return { ...(doc as Record<string, unknown>), transformed: true };
                },
                targets: [
                    {
                        name: 'a',
                        apply: async (_event: ChangeEvent, document: unknown) => {
                            seen.push({ target: 'a', document });
                        },
                    },
                    {
                        name: 'b',
                        apply: async (_event: ChangeEvent, document: unknown) => {
                            seen.push({ target: 'b', document });
                        },
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(null),
                save: () => Promise.resolve(),
                clear: () => Promise.resolve(),
            },
        });

        await manager.start();
        liveStream.emit('change', {
            _id: { token: 4 },
            operationType: 'insert',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: { _id: 1, name: 'Ada' },
        });
        liveStream.emit('change', {
            _id: { token: 5 },
            operationType: 'delete',
            ns: { db: 'source_db', coll: 'users' },
            documentKey: { _id: 1 },
            fullDocument: undefined as never,
        });

        await manager.stop();

        assert.equal(transformCalls, 2);
        assert.deepEqual(seen, [
            { target: 'a', document: { _id: 1, name: 'Ada', transformed: true } },
            { target: 'b', document: { _id: 1, name: 'Ada', transformed: true } },
            { target: 'a', document: undefined },
            { target: 'b', document: undefined },
        ]);
    });
});
