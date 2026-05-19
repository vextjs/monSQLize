/**
 * CountQueue — Concurrent Queue Controller for Count Operations.
 *
 * Design notes:
 * - Caps the maximum concurrency of countDocuments operations to prevent
 *   database overload under high traffic.
 *
 * Key features:
 * 1. Concurrency control — the `concurrency` option limits simultaneous count
 *    operations; defaults to max(4, min(cpuCount, 16)).
 * 2. Queue management — requests exceeding the concurrency cap are queued;
 *    when the queue is full (maxQueueSize) new requests are rejected immediately.
 * 3. Timeout protection — `timeout` caps the total wait + execution time per
 *    request; timed-out requests are removed from the queue and throw OPERATION_TIMEOUT.
 * 4. Stats monitoring — getStats() returns live state (running / queuedNow) plus
 *    cumulative counters (executed / queued / timeout / rejected / avgWaitTime / maxWaitTime).
 * 5. Graceful drain — clear() resolves all queued requests with reason 'cleared'
 *    to avoid dangling Promises on shutdown.
 *
 * Usage pattern:
 * - execute() decides automatically whether to run immediately or enqueue based
 *   on the current `running` count.
 * - The wrapped `fn` only runs once it acquires an execution token; the token is
 *   released automatically on completion, waking the next queued request (_wakeNext).
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
    resolve: (reason: 'run' | 'cleared') => void;
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
 * Execute a queue-controlled count operation.
 *
 * Execution logic:
 * - If running < concurrency: execute fn immediately (fast path).
 * - If running >= concurrency:
 *   - Queue not full → enqueue and wait; wait time is recorded in stats.
 *   - Queue full → reject, increment rejected counter, throw INVALID_OPERATION.
 * - After fn completes (success or error), running is decremented and
 *   _wakeNext() is called to unblock the next queued request.
 *
 * @param fn - The count function to guard with concurrency control (returns Promise<T>)
 * @returns The result of fn
 * @throws A controlled error when the queue is full or the wait times out
 */
async execute<T>(fn: () => Promise<T>): Promise<T> {
        const startTime = Date.now();

        if (this.running >= this.concurrency) {
            if (this.queue.length >= this.maxQueueSize) {
                this.stats.rejected += 1;
                throw createError(ErrorCodes.INVALID_OPERATION, `Count queue is full (${this.maxQueueSize})`);
            }
            this.stats.queued += 1;
            const waitResult = await this._waitInQueue(startTime);
            if (waitResult === 'cleared') {
                return undefined as T;
            }
        }

        this.running += 1;
        this.stats.executed += 1;

        try {
            const elapsed = Date.now() - startTime;
            const remainingMs = Math.max(1, this.timeout - elapsed);
            return await this._executeWithTimeout(fn, remainingMs);
        } finally {
            this.running -= 1;
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
     * Clear all queued pending requests without executing them.
     */
    clear(): void {
        while (this.queue.length > 0) {
            const entry = this.queue.shift();
            if (entry) {
                clearTimeout(entry.timer);
                entry.resolve('cleared');
            }
        }
    }

    private _waitInQueue(startTime: number): Promise<'run' | 'cleared'> {
        return new Promise<'run' | 'cleared'>((resolve, reject) => {
            const timer = setTimeout(() => {
                const index = this.queue.findIndex(item => item.resolve === resolve);
                if (index !== -1) {
                    this.queue.splice(index, 1);
                    this.stats.timeout += 1;
                    reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count queue wait timeout (${this.timeout}ms)`));
                }
            }, this.timeout);

            this.queue.push({
                resolve: (reason) => {
                    const waitTime = Date.now() - startTime;
                    this._updateWaitTimeStats(waitTime);
                    resolve(reason);
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
                entry.resolve('run');
            }
        }
    }

    private _executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs = this.timeout): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count execution timeout (${this.timeout}ms)`)),
                timeoutMs,
            );
        });
        return Promise.race([fn(), timeoutPromise]).finally(() => {
            if (timer !== null) clearTimeout(timer);
        });
    }

    private _updateWaitTimeStats(waitTime: number): void {
        const totalQueued = this.stats.queued;
        this.stats.avgWaitTime = (this.stats.avgWaitTime * (totalQueued - 1) + waitTime) / totalQueued;
        if (waitTime > this.stats.maxWaitTime) {
            this.stats.maxWaitTime = waitTime;
        }
    }
}
