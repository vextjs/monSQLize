const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const MonSQLize = require('../../../lib/index.js');

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('P4-C sync', () => {
    it('应支持 ResumeTokenStore 文件读写闭环', async () => {
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

    it('应支持最小 Change Stream manager 启动、处理事件与统计', async () => {
        let watchCount = 0;
        const liveStream = new EventEmitter();
        liveStream.close = () => Promise.resolve(true);
        const applied = [];
        let savedToken = null;

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
                        apply: (event, document) => {
                            applied.push({ event, document });
                            return Promise.resolve();
                        },
                    },
                ],
            },
            tokenStore: {
                load: () => Promise.resolve(savedToken),
                save: (token) => {
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

