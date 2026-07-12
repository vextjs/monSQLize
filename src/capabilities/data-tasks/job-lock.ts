import { randomUUID } from 'node:crypto';
import { DataTaskJobError } from './job-normalizer';
import { isRecord, type DataTaskRuntimeHost } from './support';

const LOCK_COLLECTION = '_monsqlize_data_task_locks';
const LOCK_KEY = 'data-task:global';

export interface DataTaskLease {
    assertHeld(): void;
    release(): Promise<void>;
}

function resultCount(result: unknown, key: string): number {
    return isRecord(result) && typeof result[key] === 'number' ? result[key] as number : 0;
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function acquireDataTaskLease(
    host: DataTaskRuntimeHost,
    options: { ttlMs: number; waitTimeoutMs: number },
): Promise<DataTaskLease> {
    const collection = host.collection(LOCK_COLLECTION);
    if (!collection.findOneAndUpdate || !collection.deleteOne) {
        throw new DataTaskJobError('LOCK_NOT_ACQUIRED', 'target runtime does not support lease lock operations.', 'lock');
    }
    const owner = randomUUID();
    const deadline = Date.now() + options.waitTimeoutMs;
    let acquired = false;
    do {
        const now = new Date();
        try {
            const value = await collection.findOneAndUpdate(
                { _id: LOCK_KEY, $or: [{ expiresAt: { $lte: now } }, { owner }] },
                { $set: { owner, expiresAt: new Date(now.getTime() + options.ttlMs), updatedAt: now }, $setOnInsert: { createdAt: now } },
                { upsert: true, returnDocument: 'after' },
            );
            acquired = value?.owner === owner;
        } catch (error) {
            const code = isRecord(error) ? error.code : undefined;
            if (code !== 11000) throw new DataTaskJobError('LOCK_NOT_ACQUIRED', `lease acquisition failed: ${error instanceof Error ? error.message : String(error)}`, 'lock');
        }
        if (!acquired && Date.now() < deadline) await wait(Math.min(100, Math.max(1, deadline - Date.now())));
    } while (!acquired && Date.now() < deadline);
    if (!acquired) throw new DataTaskJobError('LOCK_NOT_ACQUIRED', 'another data task holds the target database lease.', 'lock');

    let released = false;
    let lost: DataTaskJobError | null = null;
    let renewing: Promise<void> | null = null;
    const interval = setInterval(() => {
        if (released || renewing) return;
        const expiresAt = new Date(Date.now() + options.ttlMs);
        renewing = collection.updateOne({ _id: LOCK_KEY, owner }, { $set: { expiresAt, updatedAt: new Date() } })
            .then((result) => {
                if (resultCount(result, 'matchedCount') !== 1) lost = new DataTaskJobError('LOCK_LOST', 'target database lease ownership was lost.', 'lock');
            })
            .catch((error) => { lost = new DataTaskJobError('LOCK_LOST', `lease renewal failed: ${error instanceof Error ? error.message : String(error)}`, 'lock'); })
            .finally(() => { renewing = null; });
    }, Math.max(250, Math.floor(options.ttlMs / 4)));
    interval.unref?.();

    return {
        assertHeld() {
            if (lost) throw lost;
            if (released) throw new DataTaskJobError('LOCK_LOST', 'target database lease was already released.', 'lock');
        },
        async release() {
            if (released) return;
            released = true;
            clearInterval(interval);
            await renewing;
            await collection.deleteOne!({ _id: LOCK_KEY, owner });
        },
    };
}
