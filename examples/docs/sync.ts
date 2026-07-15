/**
 * Change Stream sync: ChangeStreamSyncManager + ResumeTokenStore.
 * See: docs/sync-backup.md
 *
 * This example demonstrates:
 * - ResumeTokenStore: persisting and loading Change Stream resume tokens
 * - ChangeStreamSyncManager lifecycle (start / getStats / stop)
 * - Watching a collection and processing change events
 *
 * NOTE: ChangeStreamSyncManager normally syncs to an external MongoDB target.
 * Here we use a minimal config so the example runs self-contained while
 * demonstrating the same API surface used in production.
 *
 * Requirements: MongoDB Replica Set (uses setupReplicaSetExample).
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/sync.js
 */
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';
import MonSQLize from 'monsqlize';

interface EventDoc { type: string; payload: Record<string, unknown>; processedAt: Date; }

async function waitFor(
    check: () => boolean,
    timeoutMs = 8000,
    intervalMs = 50,
) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (check()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timed out waiting for sync manager stats to settle');
}

async function clearResumeTokenArtifacts(tokenPath: string) {
    await Promise.all([
        rm(tokenPath, { force: true }),
        rm(`${tokenPath}.bak`, { force: true }),
    ]);
}

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-sync');
    const events = msq.collection<EventDoc>('events');
    const tokenPath = path.join(os.tmpdir(), `example-sync-token-${process.pid}.json`);
    const watchTokenPath = path.join(os.tmpdir(), `example-sync-watch-token-${process.pid}.json`);
    const syncManagerTokenPath = path.join(os.tmpdir(), `example-sync-manager-token-${process.pid}.json`);

    const tokenStore = new MonSQLize.ResumeTokenStore({
        storage: 'file',
        path: tokenPath,
    });
    const watchTokenStore = new MonSQLize.ResumeTokenStore({
        path: watchTokenPath,
    });

    try {
        console.log('=== ResumeTokenStore ===');
        const initial = await tokenStore.load();
        console.log(`  Token on start: ${initial === null ? 'null (fresh start)' : JSON.stringify(initial)}`);

        const fakeToken = { _data: 'fakeResume0000000000000000000000000000000000' };
        await tokenStore.save(fakeToken);
        console.log(`  Token after save: ${JSON.stringify(await tokenStore.load())}`);

        await tokenStore.clear();
        console.log(`  Token after clear: ${await tokenStore.load() === null ? 'null' : 'exists'}`);

        console.log('\n=== ChangeStreamSyncManager lifecycle ===');
        const dbHandle = (msq as any)._adapter?.db ?? null;

        if (!dbHandle) {
            console.log('  Could not resolve internal db handle — skipping sync manager demo');
        } else {
            const syncedEvents: unknown[] = [];
            const syncManager = new MonSQLize.ChangeStreamSyncManager({
                db: dbHandle,
                config: {
                    enabled: true,
                    collections: ['events'],
                    resumeToken: { storage: 'file', path: syncManagerTokenPath },
                    targets: [
                        {
                            name: 'in-memory-target',
                            uri: server.getUri(),
                            apply: async (event: unknown) => {
                                syncedEvents.push(event);
                            },
                        },
                    ],
                },
            });

            await syncManager.start();
            console.log('  SyncManager started');
            await waitFor(() => {
                const stats = syncManager.getStats();
                return stats.isRunning && stats.startTime !== null && stats.targets.length === 1;
            });

            await events.insertMany([
                { type: 'user.signup', payload: { userId: 'u1' }, processedAt: new Date() },
                { type: 'order.placed', payload: { orderId: 'o1', amount: 99 }, processedAt: new Date() },
            ]);

            await new Promise((resolve) => setTimeout(resolve, 800));

            const stats = syncManager.getStats();
            console.log(`  Running: ${stats.isRunning}`);
            console.log(`  Events received: ${stats.eventCount}`);
            console.log(`  Events synced: ${stats.syncedCount}`);
            console.log(`  Targets: ${stats.targets.map((target) => target.name).join(', ')}`);
            if (stats.startTime === null || stats.targets.length !== 1) {
                throw new Error('SyncManager lifecycle stats did not initialize as expected');
            }

            await syncManager.stop();
            console.log('  SyncManager stopped');
            console.log(`  Total events synced: ${syncedEvents.length}`);
        }

        console.log('\n=== Manual watch with ResumeTokenStore integration ===');
        await watchTokenStore.clear();

        const nativeEvents = (msq as any)._adapter?.db?.collection('events')
            ?? (msq as any).dbInstance?.collection('events');

        if (nativeEvents) {
            const pipeline = [{ $match: { operationType: { $in: ['insert', 'update', 'delete'] } } }];

            const runWatchSession = async (
                resumeAfter: unknown,
                expectedCount: number,
                performWrites: () => Promise<void>,
            ) => {
                const captured: string[] = [];
                const watchErrors: string[] = [];
                const watchOptions: Record<string, unknown> = { fullDocument: 'updateLookup' };
                if (resumeAfter) {
                    watchOptions.resumeAfter = resumeAfter;
                }

                const changeStream = nativeEvents.watch(pipeline, watchOptions);
                const waitForChanges = new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Timed out waiting for change stream events')), 10000);
                    changeStream.on('change', async (change: { operationType: string; _id?: unknown }) => {
                        captured.push(change.operationType);
                        if (change._id) {
                            await watchTokenStore.save(change._id);
                        }
                        if (captured.length >= expectedCount) {
                            clearTimeout(timeout);
                            resolve();
                        }
                    });
                    changeStream.on('error', (error: unknown) => {
                        watchErrors.push(error instanceof Error ? error.message : String(error));
                        clearTimeout(timeout);
                        reject(error instanceof Error ? error : new Error(String(error)));
                    });
                });

                try {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                    await performWrites();
                    await waitForChanges;
                } finally {
                    await changeStream.close();
                }

                return {
                    captured,
                    watchErrors,
                    token: await watchTokenStore.load(),
                };
            };

            await watchTokenStore.clear();

            const firstSession = await runWatchSession(null, 1, async () => {
                await events.insertOne({
                    type: 'test.watch.first',
                    payload: { step: 1 },
                    processedAt: new Date(),
                });
            });

            const resumedToken = firstSession.token;
            const secondSession = await runWatchSession(resumedToken, 1, async () => {
                await events.insertOne({
                    type: 'test.watch.second',
                    payload: { step: 2 },
                    processedAt: new Date(),
                });
            });

            console.log(`  First session changes: ${firstSession.captured.join(', ') || '(none)'}`);
            console.log(`  Resume token persisted: ${resumedToken !== null}`);
            console.log(`  Second session changes after resume: ${secondSession.captured.join(', ') || '(none)'}`);
            if (firstSession.watchErrors.length || secondSession.watchErrors.length) {
                console.log(`  Watch errors handled: ${firstSession.watchErrors.length + secondSession.watchErrors.length}`);
            }
        } else {
            console.log('  Skipping manual watch demo (native collection handle not available)');
        }

        console.log('\n=== Sync / ResumeTokenStore example complete ===');
    } finally {
        await tokenStore.clear();
        await watchTokenStore.clear();
        await Promise.all([
            clearResumeTokenArtifacts(tokenPath),
            clearResumeTokenArtifacts(watchTokenPath),
            clearResumeTokenArtifacts(syncManagerTokenPath),
        ]);
        await teardownExample(msq, server);
    }
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
