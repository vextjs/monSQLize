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
});