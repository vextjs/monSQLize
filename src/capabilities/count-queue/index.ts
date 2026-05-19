/**
 * CountQueue — 计数操作并发队列控制器（Concurrent Queue Controller for Count Operations）。
 *
 * 设计说明：
 * - 限制 countDocuments 操作的最大并发数，防止高并发下数据库过载。
 *
 * 核心特性：
 * 1. 并发控制 — concurrency 参数限制同时执行的 count 数量，
 *    默认取 max(4, min(cpuCount, 16))，自动适配 CPU 核数。
 * 2. 队列管理 — 超出并发限制的请求进入等待队列；
 *    队列满（maxQueueSize）时直接拒绝并记录统计。
 * 3. 超时保护 — timeout 限制单次请求的等待+执行总时长，
 *    超时后从队列移除并抛出 OPERATION_TIMEOUT 错误。
 * 4. 统计监控 — getStats() 返回实时队列状态（running / queuedNow）
 *    和累计统计（executed / queued / timeout / rejected / avgWaitTime / maxWaitTime）。
 * 5. 优雅清空 — clear() 将队列中所有等待请求以 'cleared' 原因 resolve，
 *    避免关闭时留下悬挂的 Promise。
 *
 * 使用模式：
 * - execute() 自动根据当前 running 数决定立即执行还是入队等待。
 * - 被包装的 fn 只在获得"执行令牌"后才运行，执行完成后自动释放令牌
 *   并唤醒下一个等待请求（_wakeNext）。
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
 * 执行一个受队列控制的 count 操作。
 *
 * 执行逻辑：
 * - 若 running < concurrency：直接执行 fn（"快路径"）。
 * - 若 running >= concurrency：
 *   - 队列未满 → 入队等待，等待时长计入统计。
 *   - 队列已满 → 拒绝，rejected++ 并抛出 INVALID_OPERATION 错误。
 * - fn 执行完成（无论成功或异常）后自动 running--
 *   并调用 _wakeNext() 唤醒下一个等待请求。
 *
 * @param fn - 需要受并发保护的 count 函数（返回 Promise<T>）
 * @returns fn 的执行结果
 * @throws 队列满或等待超时时抛出受控错误
 */
async execute<T>(fn: () => Promise<T>): Promise<T> {
        const startTime = Date.now();

        if (this.running >= this.concurrency) {
            if (this.queue.length >= this.maxQueueSize) {
                this.stats.rejected++;
                throw createError(ErrorCodes.INVALID_OPERATION, `Count queue is full (${this.maxQueueSize})`);
            }
            this.stats.queued++;
            const waitResult = await this._waitInQueue(startTime);
            if (waitResult === 'cleared') {
                return undefined as T;
            }
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
                    this.stats.timeout++;
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

    private _executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(createError(ErrorCodes.OPERATION_TIMEOUT, `Count execution timeout (${this.timeout}ms)`)),
                this.timeout,
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
