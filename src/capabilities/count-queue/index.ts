/**
 * CountQueue — concurrent queue controller for count operations
 *
 * Limits the number of concurrently executing countDocuments calls to avoid
 * overloading the database under high concurrency.
 *
 * Features:
 * - Concurrency control: caps the number of simultaneous count executions
 * - Queue management: requests exceeding the concurrency limit wait in queue
 * - Timeout protection: prevents requests from blocking indefinitely
 * - Statistics monitoring: provides queue state and statistics
 *
 * @since v1.0.0
 */

import { cpus } from 'node:os';
import { ErrorCodes, createError } from '../../core/errors';

/** Options accepted by the {@link CountQueue} constructor. */
export interface CountQueueOptions {
    /** Maximum concurrent count operations (default: max(4, min(cpuCount, 16))) */
    concurrency?: number;
    /** Maximum queue length (default: 10000) */
    maxQueueSize?: number;
    /** Total wait + execution timeout per request (ms, default: 60000) */
    timeout?: number;
}

/** Live statistics snapshot returned by {@link CountQueue.getStats}. */
export interface CountQueueStats {
    /** Total executions completed */
    executed: number;
    /** Total times requests were queued */
    queued: number;
    /** Total timeouts */
    timeout: number;
    /** Total rejections (queue full) */
    rejected: number;
    /** Average wait time (ms) */
    avgWaitTime: number;
    /** Maximum wait time (ms) */
    maxWaitTime: number;
    /** Number of currently executing requests */
    running: number;
    /** Number of currently queued requests */
    queuedNow: number;
    /** Concurrency cap */
    concurrency: number;
    /** Queue capacity */
    maxQueueSize: number;
}

interface QueueEntry {
    resolve: () => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    startTime: number;
}

/**
 * Concurrent queue controller for count operations.
 *
 * @example
 * ```ts
 * const queue = new CountQueue({ concurrency: 8 });
 * const total = await queue.execute(() => collection.countDocuments(filter));
 * ```
 */
export class CountQueue {
    private readonly concurrency: number;
    private readonly maxQueueSize: number;
    private readonly timeout: number;
    private running = 0;
    private readonly queue: QueueEntry[] = [];
    private stats = {
        executed: 0,
        queued: 0,
        timeout: 0,
        rejected: 0,
        avgWaitTime: 0,
        maxWaitTime: 0,
    };

    constructor(options: CountQueueOptions = {}) {
        const cpuCount = cpus().length;
        const defaultConcurrency = Math.max(4, Math.min(cpuCount, 16));
        this.concurrency = options.concurrency ?? defaultConcurrency;
        this.maxQueueSize = options.maxQueueSize ?? 10000;
        this.timeout = options.timeout ?? 60000;
    }

    /**
     * Execute a count operation with queue control.
     *
     * @param fn - The count function to execute (returns Promise<number>)
     * @returns The count result
     * @throws When the queue is full or the wait times out
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        const startTime = Date.now();

        if (this.running >= this.concurrency) {
            if (this.queue.length >= this.maxQueueSize) {
                this.stats.rejected++;
                throw createError(ErrorCodes.INVALID_OPERATION, `Count queue is full (${this.maxQueueSize})`);
            }            this.stats.queued++;
            await this._waitInQueue(startTime);
        }

        this.running++;
        this.stats.executed++;

        try {
            return await this._executeWithTimeout(fn);
        } finally {
            this.running--;
            this._wakeNext();
        }
    }

    /**
     * Get queue statistics (including live state).
     */
    getStats(): CountQueueStats {
        return {
            ...this.stats,
            running: this.running,
            queuedNow: this.queue.length,
            concurrency: this.concurrency,
            maxQueueSize: this.maxQueueSize,
        };
    }

    /**
     * Reset accumulated statistics (does not affect in-flight requests).
     */
    resetStats(): void {
        this.stats = {
            executed: 0,
            queued: 0,
            timeout: 0,
            rejected: 0,
            avgWaitTime: 0,
            maxWaitTime: 0,
        };
    }

    /**
     * Reject and clear all queued pending requests (use with caution).
     */
    clear(): void {
        while (this.queue.length > 0) {
            const entry = this.queue.shift();
            if (entry) {
                clearTimeout(entry.timer);
        entry.reject(createError(ErrorCodes.INVALID_OPERATION, 'Count queue cleared'));
            }
        }
    }

    private _waitInQueue(startTime: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = this.queue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    this.stats.timeout++;
                    reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count queue wait timeout (${this.timeout}ms)`));
                }
            }, this.timeout);

            this.queue.push({
                resolve: () => {
                    const waitTime = Date.now() - startTime;
                    this._updateWaitTimeStats(waitTime);
                    resolve();
                },
                reject,
                timer,
                startTime,
            });
        });
    }

    private _wakeNext(): void {
        if (this.queue.length > 0) {
            const entry = this.queue.shift();
            if (entry) {
                clearTimeout(entry.timer);
                entry.resolve();
            }
        }
    }

    private _executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
        return Promise.race([
            fn(),
            new Promise<never>((_, reject) =>
                setTimeout(
                    () => reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count execution timeout (${this.timeout}ms)`)),
                    this.timeout,
                )
            ),
        ]);
    }

    private _updateWaitTimeStats(waitTime: number): void {
        const totalQueued = this.stats.queued;
        this.stats.avgWaitTime = (this.stats.avgWaitTime * (totalQueued - 1) + waitTime) / totalQueued;
        if (waitTime > this.stats.maxWaitTime) {
            this.stats.maxWaitTime = waitTime;
        }
    }
}
