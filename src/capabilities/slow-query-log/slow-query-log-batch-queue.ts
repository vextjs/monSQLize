/**
 * 慢查询日志批量刷写队列（BatchQueue）。
 *
 * 采用缓冲策略暂存日志条目，按批次大小或定时间隔自动 flush
 * 到后端存储，降低高频查询场景的存储压力。
 */
import type { LoggerLike } from '../../core/logger';
import type { SlowQueryLogConfig, SlowQueryLogEntry, SlowQueryLogStorage } from '../../../types/slow-query-log';
import { DEFAULT_SLOW_QUERY_LOG_CONFIG } from './slow-query-log-config';

export class BatchQueue {
    private readonly buffer: SlowQueryLogEntry[] = [];
    private readonly batchSize: number;
    private readonly flushInterval: number;
    private readonly maxBufferSize: number;
    private readonly logger: LoggerLike | null;
    private timer: NodeJS.Timeout | null = null;
    private flushing = false;

    constructor(
        private readonly storage: Pick<SlowQueryLogStorage, 'saveBatch'>,
        options: Partial<SlowQueryLogConfig['batch']> = {},
        logger: LoggerLike | null = null,
    ) {
        this.batchSize = options.size ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.batch.size;
        this.flushInterval = options.interval ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.batch.interval;
        this.maxBufferSize = options.maxBufferSize ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.batch.maxBufferSize;
        this.logger = logger;
    }

    async add(log: SlowQueryLogEntry): Promise<void> {
        this.buffer.push(log);
        if (this.buffer.length >= this.maxBufferSize || this.buffer.length >= this.batchSize) {
            await this.flush();
            return;
        }
        if (!this.timer) {
            this.timer = setTimeout(() => {
                void this.flush();
            }, this.flushInterval);
            this.timer.unref?.();
        }
    }

    async flush(): Promise<void> {
        if (this.flushing || this.buffer.length === 0) {
            return;
        }

        this.flushing = true;
        const payload = this.buffer.splice(0, this.buffer.length);
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        try {
            await this.storage.saveBatch(payload);
            this.logger?.debug?.('[SlowQueryLog] batch flushed', { count: payload.length });
        } catch (error) {
            this.logger?.error?.('[SlowQueryLog] batch flush failed', error);
        } finally {
            this.flushing = false;
        }
    }

    async close(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        await this.flush();
    }
}
