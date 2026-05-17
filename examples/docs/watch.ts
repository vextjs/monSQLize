/**
 * Change stream example — watch insert/update events with an in-memory replica-set.
 * See: docs/watch.md
 */
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupReplicaSetExample('example-watch');
    const users = msq.collection('users');
    const watcher = users.watch([{ $match: { operationType: { $in: ['insert', 'update'] } } }], {
        fullDocument: 'updateLookup',
    }) as {
        on(event: string, handler: (payload: Record<string, unknown>) => void): void;
        close(): Promise<void>;
        getStats?: () => { totalChanges?: number };
        getResumeToken?: () => unknown;
    };

    const changes = new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const events: Array<Record<string, unknown>> = [];
        const timer = setTimeout(() => reject(new Error('Timed out waiting for change stream events.')), 10000);

        watcher.on('change', (change: Record<string, unknown>) => {
            events.push(change);
            if (events.length >= 2) {
                clearTimeout(timer);
                resolve(events);
            }
        });
        watcher.on('error', (error: Record<string, unknown>) => {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
        });
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const inserted = await users.insertOne({ name: 'Alice', age: 25, status: 'active' });
    await users.updateOne({ _id: inserted.insertedId }, { $set: { age: 26 } });

    const received = await changes;
    const stats = typeof watcher.getStats === 'function' ? watcher.getStats() : null;
    const resumeToken = typeof watcher.getResumeToken === 'function' ? watcher.getResumeToken() : null;

    console.log('watch events:', received.map((item) => item.operationType).join(', '));
    console.log('resume token exists:', resumeToken ? 'yes' : 'unavailable');
    console.log('total changes seen:', stats?.totalChanges ?? received.length);

    await watcher.close();
    await teardownExample(msq, server);
    console.log('✅ Watch example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
