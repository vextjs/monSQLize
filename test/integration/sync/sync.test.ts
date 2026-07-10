import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { createReplSetBootstrap } from '../../bootstrap/replset-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertOneWithRetry(uri: string, dbName: string, collectionName: string, document: Record<string, unknown>, timeoutMs = 10000, intervalMs = 250): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = null;
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

async function waitFor<T>(check: () => T | null, message: string, timeoutMs = 5000, intervalMs = 25): Promise<T> {
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

function createResumeTokenPath(label: string): string {
    return path.join(os.tmpdir(), `monsqlize-sync-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

describe('P4-C sync integration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_p4c_sync' });
    let uri = '';
    const syncStatsIt = process.env.MONSQLIZE_MATRIX_MODE === '1' ? it.skip : it;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('automatically starts and stops sync manager on a real replica set', async () => {
        const resumeTokenPath = createResumeTokenPath('lifecycle');
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'primary_app',
            config: { uri },
            sync: {
                enabled: true,
                collections: ['users'],
                resumeToken: { storage: 'file', path: resumeTokenPath },
                targets: [{ name: 'audit-target', apply: () => Promise.resolve() }],
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

    it('restarts after a fatal target failure without racing the previous stream close', async () => {
        const resumeTokenPath = createResumeTokenPath('fatal-restart');
        let failOnce = true;
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'sync_restart_app',
            config: { uri },
            sync: {
                enabled: true,
                collections: ['restart_events'],
                resumeToken: { storage: 'file', path: resumeTokenPath },
                targets: [{
                    name: 'flaky-target',
                    apply() {
                        if (failOnce) {
                            failOnce = false;
                            return Promise.reject(new Error('target failed once'));
                        }
                        return Promise.resolve();
                    },
                }],
            },
        });

        try {
            await runtime.connect();
            await insertOneWithRetry(uri, 'sync_restart_app', 'restart_events', { name: 'first' });
            await waitFor(() => {
                const stats = runtime.getSyncStats();
                return stats && stats.errorCount >= 1 && stats.isRunning === false ? stats : null;
            }, 'sync manager did not enter the failed state in time', 10000);

            await runtime.startSync();
            assert.equal(runtime.getSyncStats()?.isRunning, true);
            await insertOneWithRetry(uri, 'sync_restart_app', 'restart_events', { name: 'second' });
            const recovered = await waitFor(() => {
                const stats = runtime.getSyncStats();
                return stats && stats.syncedCount >= 1 && stats.targets[0]?.syncCount >= 1 ? stats : null;
            }, 'sync manager did not recover in time', 10000);
            assert.equal(recovered.isRunning, true);
        } finally {
            await runtime.close();
            await fs.rm(resumeTokenPath, { force: true });
        }
    });

    syncStatsIt('syncs change events to target and updates stats on a real replica set', async () => {
        const resumeTokenPath = createResumeTokenPath('target-stats');
        let resolveInsert: (value: any) => void = () => {};
        let rejectInsert: (error: Error) => void = () => {};
        const insertPromise = new Promise<any>((resolve, reject) => {
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
                resumeToken: { storage: 'file', path: resumeTokenPath },
                targets: [
                    {
                        name: 'capture-target',
                        apply(event: any, document: any) {
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
            await waitFor(() => {
                const stats = runtime.getSyncStats();
                return stats && stats.isRunning && stats.targets.length === 1 ? stats : null;
            }, 'sync manager was not ready in time');
            await sleep(300);
            const expectedName = `Lin-${Date.now()}`;
            await insertOneWithRetry(uri, 'primary_app', 'users', { name: expectedName, role: 'writer' });

            const payload = await insertPromise;
            clearTimeout(timeout);

            assert.equal(payload.event.operationType, 'insert');
            assert.equal(payload.document.name, expectedName);

            const stats = await waitFor(() => {
                const current = runtime.getSyncStats();
                return current && current.syncedCount >= 1 && current.targets[0]?.syncCount >= 1 ? current : null;
            }, 'sync stats were not updated in time');
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
