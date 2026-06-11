/**
 * CountQueue example: concurrency caps, queue-full rejection, and live stats.
 * See: docs/count-queue.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/count-queue.js
 */
import MonSQLize from 'monsqlize';

type CountQueueConstructor = new (options?: {
    concurrency?: number;
    maxQueueSize?: number;
    timeout?: number;
}) => {
    execute<T>(fn: () => Promise<T>): Promise<T>;
    getStats(): {
        executed: number;
        queued: number;
        rejected: number;
        running: number;
        queuedNow: number;
        concurrency: number;
        maxQueueSize: number;
    };
    resetStats(): void;
};

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => { resolve = res; });
    return { promise, resolve };
}

async function main() {
    const CountQueue = (MonSQLize as unknown as { CountQueue: CountQueueConstructor }).CountQueue;
    const queue = new CountQueue({ concurrency: 2, maxQueueSize: 4, timeout: 1000 });

    let running = 0;
    let maxRunning = 0;
    const runCount = async (label: string) => queue.execute(async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await sleep(15);
        running -= 1;
        return label;
    });

    const results = await Promise.all([
        runCount('active-users'),
        runCount('archived-users'),
        runCount('orders'),
        runCount('events'),
    ]);

    const stats = queue.getStats();
    console.log('CountQueue results:', results.join(', '));
    console.log('Max concurrent executions:', maxRunning);
    console.log('Queued requests:', stats.queued);
    console.log('Executed requests:', stats.executed);

    const limited = new CountQueue({ concurrency: 1, maxQueueSize: 1, timeout: 1000 });
    const unblock = deferred<number>();
    const first = limited.execute(() => unblock.promise);
    await sleep(0);
    const second = limited.execute(async () => 2);
    await sleep(0);

    let rejected = false;
    try {
        await limited.execute(async () => 3);
    } catch {
        rejected = true;
    }

    unblock.resolve(1);
    await Promise.all([first, second]);

    const limitedStats = limited.getStats();
    console.log('Queue full rejected:', rejected);
    console.log('Rejected count:', limitedStats.rejected);

    queue.resetStats();
    console.log('Stats after reset:', queue.getStats().executed);
    console.log('CountQueue example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
