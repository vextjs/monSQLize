import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import MonSQLize from 'monsqlize';

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Stage B sync primitives TS migration', () => {
    it('validateSyncConfig 应校验 enabled/targets/filter 边界', () => {
        assert.doesNotThrow(() => {
            MonSQLize.validateSyncConfig({
                enabled: true,
                collections: ['users'],
                targets: [
                    {
                        name: 'backup-users',
                        uri: 'mongodb://localhost:27017/backup',
                        collections: ['users'],
                    },
                ],
                filter: () => true,
            });
        });

        assert.throws(() => {
            MonSQLize.validateSyncConfig({
                enabled: true,
                targets: [],
            });
        }, /targets must be a non-empty array/);

        assert.throws(() => {
            MonSQLize.validateSyncConfig({
                enabled: true,
                targets: [
                    {
                        name: 'backup-users',
                        uri: 'mongodb://localhost:27017/backup',
                    },
                ],
                filter: 'not-a-function' as unknown as () => boolean,
            });
        }, /filter must be a function/);
    });

    it('ResumeTokenStore 应支持 file 与 redis 两种存储闭环', async () => {
        const tokenPath = path.join(os.tmpdir(), `monsqlize-stage-b-sync-${Date.now()}.json`);
        const fileStore = new MonSQLize.ResumeTokenStore({
            storage: 'file',
            path: tokenPath,
        });

        await fileStore.save({ token: 1 });
        assert.deepEqual(await fileStore.load(), { token: 1 });
        await fileStore.clear();
        assert.equal(await fileStore.load(), null);

        const storage = new Map<string, string>();
        const redisStore = new MonSQLize.ResumeTokenStore({
            storage: 'redis',
            redis: {
                get: async (key: string) => storage.get(key) ?? null,
                set: async (key: string, value: string) => {
                    storage.set(key, value);
                },
                del: async (key: string) => {
                    storage.delete(key);
                },
            },
        });

        await redisStore.save({ token: 2 });
        assert.deepEqual(await redisStore.load(), { token: 2 });
        await redisStore.clear();
        assert.equal(await redisStore.load(), null);

        await fs.rm(tokenPath, { force: true });
    });

    it('ChangeStreamSyncManager 应支持最小启动、事件处理与统计', async () => {
        const tokenPath = path.join(os.tmpdir(), `monsqlize-stage-b-manager-${Date.now()}.json`);
        let watchCount = 0;
        const liveStream = new EventEmitter() as EventEmitter & { close: () => Promise<boolean>; };
        liveStream.close = () => Promise.resolve(true);

        const applied: Array<{ event: unknown; document: unknown; }> = [];

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
        } as unknown;

        const manager = new MonSQLize.ChangeStreamSyncManager({
            db,
            config: {
                enabled: true,
                collections: ['users'],
                resumeToken: {
                    storage: 'file',
                    path: tokenPath,
                },
                targets: [
                    {
                        name: 'backup-users',
                        apply: async (event, document) => {
                            applied.push({ event, document });
                        },
                    },
                ],
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
        assert.deepEqual(applied[0]?.document, { _id: 1, name: 'Ada' });
        assert.deepEqual(JSON.parse(await fs.readFile(tokenPath, 'utf8')), { token: 1 });

        await manager.stop();
        assert.equal(manager.getStats().isRunning, false);
        await fs.rm(tokenPath, { force: true });
    });
});