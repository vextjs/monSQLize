const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { MongoClient } = require('mongodb');

const MonSQLize = require('../../../lib/index.js');
const { createReplSetBootstrap } = require('../../bootstrap/replset-server');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertOneWithRetry(uri, dbName, collectionName, document, timeoutMs = 10000, intervalMs = 250) {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
        const writer = new MongoClient(uri);
        try {
            await writer.connect();
            await writer.db(dbName).collection(collectionName).insertOne(document);
            return;
        } catch (error) {
            lastError = error;
            await sleep(intervalMs);
        } finally {
            await writer.close().catch(() => {});
        }
    }
    throw lastError ?? new Error('insert writer did not succeed in time');
}

async function waitFor(check, message, timeoutMs = 5000, intervalMs = 25) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = check();
        if (result) {
            return result;
        }
        await sleep(intervalMs);
    }
    throw new Error(message);
}

function createResumeTokenPath(label) {
    return path.join(
        os.tmpdir(),
        `monsqlize-sync-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
}

describe('P4-C sync integration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_p4c_sync' });
    let uri;
    const syncStatsIt = process.env.MONSQLIZE_MATRIX_MODE === '1' ? it.skip : it;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('应在真实 replica set 上自动启动并停止 sync manager', async () => {
        const resumeTokenPath = createResumeTokenPath('lifecycle');
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'primary_app',
            config: { uri },
            sync: {
                enabled: true,
                collections: ['users'],
                resumeToken: {
                    storage: 'file',
                    path: resumeTokenPath,
                },
                targets: [
                    {
                        name: 'audit-target',
                        apply() {
                            return Promise.resolve();
                        },
                    },
                ],
            },
        });

        try {
            await runtime.connect();
            const manager = runtime.getSyncManager();
            assert.notEqual(manager, null);

            const startedStats = runtime.getSyncStats();
            assert.notEqual(startedStats, null);
            assert.equal(startedStats.isRunning, true);

            await runtime.stopSync();
            const stoppedStats = runtime.getSyncStats();
            assert.notEqual(stoppedStats, null);
            assert.equal(stoppedStats.isRunning, false);

            await runtime.startSync();
            const restartedStats = runtime.getSyncStats();
            assert.notEqual(restartedStats, null);
            assert.equal(restartedStats.isRunning, true);
        } finally {
            await runtime.close();
            await fs.rm(resumeTokenPath, { force: true });
        }
    });

    syncStatsIt('应在真实 replica set 上把变更事件同步到 target 并更新统计', async () => {
        const resumeTokenPath = createResumeTokenPath('target-stats');
        let resolveInsert;
        let rejectInsert;
        const insertPromise = new Promise((resolve, reject) => {
            resolveInsert = resolve;
            rejectInsert = reject;
        });
        const timeout = setTimeout(() => {
            rejectInsert(new Error('sync target did not receive insert event in time'));
        }, 10000);

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'primary_app',
            config: { uri },
            sync: {
                enabled: true,
                collections: ['users'],
                resumeToken: {
                    storage: 'file',
                    path: resumeTokenPath,
                },
                targets: [
                    {
                        name: 'capture-target',
                        apply(event, document) {
                            if (event.operationType === 'insert') {
                                resolveInsert({ event, document });
                            }
                            return Promise.resolve();
                        },
                    },
                ],
            },
        });

        try {
            await runtime.connect();
            await waitFor(
                () => {
                    const stats = runtime.getSyncStats();
                    return stats && stats.isRunning && stats.targets.length === 1 ? stats : null;
                },
                'sync manager was not ready in time',
            );
            await sleep(300);
            const expectedName = `Lin-${Date.now()}`;
            await insertOneWithRetry(uri, 'primary_app', 'users', { name: expectedName, role: 'writer' });

            const payload = await insertPromise;
            clearTimeout(timeout);

            assert.equal(payload.event.operationType, 'insert');
            assert.equal(payload.document.name, expectedName);

            const stats = await waitFor(
                () => {
                    const current = runtime.getSyncStats();
                    return current && current.syncedCount >= 1 && current.targets[0]?.syncCount >= 1
                        ? current
                        : null;
                },
                'sync stats were not updated in time',
            );
            assert.notEqual(stats, null);
            assert.equal(stats.eventCount >= 1, true);
            assert.equal(stats.syncedCount >= 1, true);
            assert.equal(stats.targets.length, 1);
            assert.equal(stats.targets[0].name, 'capture-target');
            assert.equal(stats.targets[0].syncCount >= 1, true);
            assert.equal(stats.targets[0].lastSyncTime instanceof Date, true);
        } finally {
            clearTimeout(timeout);
            await runtime.close();
            await fs.rm(resumeTokenPath, { force: true });
        }
    });
});

