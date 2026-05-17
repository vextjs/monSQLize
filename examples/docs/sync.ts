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
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';
import MonSQLize from 'monsqlize';

interface EventDoc { type: string; payload: Record<string, unknown>; processedAt: Date; }

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-sync');

    const events = msq.collection<EventDoc>('events');

    // ── ResumeTokenStore — file-based ────────────────────────────────────────
    console.log('=== ResumeTokenStore ===');
    const tokenPath = path.join(os.tmpdir(), 'example-sync-token.json');
    // storage: 'file' | 'redis'  (default: 'file')
    const tokenStore = new MonSQLize.ResumeTokenStore({
        storage: 'file',
        path: tokenPath,
    });

    // Initially empty
    const initial = await tokenStore.load();
    console.log(`  Token on start: ${initial === null ? 'null (fresh start)' : JSON.stringify(initial)}`);

    // Simulate saving a token (would normally come from a ChangeStream event)
    const fakeToken = { _data: 'fakeResume0000000000000000000000000000000000' };
    await tokenStore.save(fakeToken);
    const loaded = await tokenStore.load();
    console.log(`  Token after save: ${JSON.stringify(loaded)}`);

    // Clear it
    await tokenStore.clear();
    console.log(`  Token after clear: ${await tokenStore.load() === null ? 'null' : 'exists'}`);

    // ── ChangeStreamSyncManager — no-op in-memory target ─────────────────────
    console.log('\n=== ChangeStreamSyncManager lifecycle ===');

    // We use the MonSQLize-internal db handle to build the manager
    const dbHandle = (msq as any)._db ?? (msq as any).dbInstance ?? (msq as any)._adapter?.db;

    if (!dbHandle) {
        console.log('  Could not resolve internal db handle — skipping sync manager demo');
    } else {
        const syncedEvents: unknown[] = [];

        const syncManager = new MonSQLize.ChangeStreamSyncManager({
            db: dbHandle,
            config: {
                enabled: true,
                collections: ['events'],
                targets: [
                    {
                        name: 'in-memory-target',
                        uri: server.getUri(),   // required by SyncTargetConfig; apply override below
                        apply: async (event: unknown) => {
                            syncedEvents.push(event);
                        },
                    },
                ],
            },
        });

        await syncManager.start();
        console.log('  SyncManager started');

        // Insert some events — change stream will capture them
        await events.insertMany([
            { type: 'user.signup', payload: { userId: 'u1' }, processedAt: new Date() },
            { type: 'order.placed', payload: { orderId: 'o1', amount: 99 }, processedAt: new Date() },
        ]);

        // Give the change stream a moment to propagate
        await new Promise(r => setTimeout(r, 300));

        const stats = syncManager.getStats();
        console.log(`  Running: ${stats.isRunning}`);
        console.log(`  Events received: ${stats.eventCount}`);
        console.log(`  Targets: ${stats.targets.map(t => t.name).join(', ')}`);

        await syncManager.stop();
        console.log('  SyncManager stopped');
        console.log(`  Total events synced: ${syncedEvents.length}`);
    }

    // ── Manual watch with resumeToken passthrough ────────────────────────────
    console.log('\n=== Manual watch with ResumeTokenStore integration ===');
    // Use default file storage (storage defaults to 'file')
    const watchTokenStore = new MonSQLize.ResumeTokenStore({
        path: path.join(os.tmpdir(), 'example-sync-watch-token.json'),
    });

    const nativeEvents = (msq as any)._adapter?.db?.collection('events')
        ?? (msq as any).dbInstance?.collection('events');

    if (nativeEvents) {
        const pipeline = [{ $match: { operationType: { $in: ['insert', 'update', 'delete'] } } }];
        const savedToken = await watchTokenStore.load();
        const watchOpts: Record<string, unknown> = { fullDocument: 'updateLookup' };
        if (savedToken) watchOpts.resumeAfter = savedToken;

        const cs = nativeEvents.watch(pipeline, watchOpts);
        const captured: string[] = [];

        cs.on('change', async (change: { operationType: string; _id: unknown }) => {
            captured.push(change.operationType);
            if (change._id) await watchTokenStore.save(change._id);
        });

        // Produce a change
        await events.insertOne({ type: 'test.watch', payload: {}, processedAt: new Date() });
        await new Promise(r => setTimeout(r, 300));

        await cs.close();
        const finalToken = await watchTokenStore.load();
        console.log(`  Change types captured: ${captured.join(', ') || '(none in window)'}`);
        console.log(`  Resume token saved: ${finalToken !== null}`);
    } else {
        console.log('  Skipping manual watch demo (native collection handle not available)');
    }

    await teardownExample(msq, server);
    console.log('\n=== Sync / ResumeTokenStore example complete ===');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});