/**
 * Sync target failure / recovery example.
 * See: docs/failure-recovery-examples.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/sync-target-failure.js
 */
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import MonSQLize from 'monsqlize';
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface EventDoc {
    type: string;
    payload: Record<string, unknown>;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(check: () => T | null, message: string, timeoutMs = 8000, intervalMs = 50) {
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

async function main() {
    const { server } = await setupReplicaSetExample('example-sync-target-failure');
    const tokenPath = path.join(os.tmpdir(), `example-sync-target-failure-${process.pid}.json`);
    let failOnce = true;

    const runtime = new MonSQLize({
        type: 'mongodb',
        databaseName: 'example-sync-target-failure',
        config: { uri: server.getUri() },
        sync: {
            enabled: true,
            collections: ['events'],
            resumeToken: { storage: 'file', path: tokenPath },
            targets: [
                {
                    name: 'flaky-target',
                    apply(event) {
                        if (event.operationType === 'insert' && failOnce) {
                            failOnce = false;
                            return Promise.reject(new Error('Simulated target outage'));
                        }
                        return Promise.resolve();
                    },
                },
            ],
        },
    });

    try {
        await runtime.connect();
        const events = runtime.collection<EventDoc>('events');

        console.log('=== Sync target failure / recovery ===');
        await events.insertOne({ type: 'sync.failed-once', payload: { step: 1 } });

        const failedStats = await waitFor(
            () => {
                const stats = runtime.getSyncStats();
                return stats && stats.errorCount >= 1 ? stats : null;
            },
            'sync manager did not record target failure in time',
        );

        await events.insertOne({ type: 'sync.recovered', payload: { step: 2 } });

        const recoveredStats = await waitFor(
            () => {
                const stats = runtime.getSyncStats();
                return stats && stats.syncedCount >= 1 && stats.targets[0]?.syncCount >= 1 ? stats : null;
            },
            'sync manager did not recover in time',
        );

        console.log(`  Error count after first event: ${failedStats.errorCount}`);
        console.log(`  Synced count after recovery: ${recoveredStats.syncedCount}`);
        console.log(`  Target success count: ${recoveredStats.targets[0]?.syncCount ?? 0}`);
        console.log(`  Target error count: ${recoveredStats.targets[0]?.errorCount ?? 0}`);
        console.log('✅ Sync target failure example complete');
    } finally {
        await runtime.stopSync().catch(() => {});
        await runtime.close();
        await server.stop();
        await rm(tokenPath, { force: true }).catch(() => {});
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Example failed:', error);
        process.exit(1);
    });
