/**
 * 慢查询日志管理器（SlowQueryLogManager）。
 *
 * 负责慢查询日志的生命周期管理：初始化存储后端、委托记录写入、
 * 提供查询与清理接口。
 */
import type { MongoClient } from 'mongodb';
import type { LoggerLike } from '../../core/logger';
import type {
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorage,
} from '../../../types/slow-query-log';
import { BatchQueue } from './slow-query-log-batch-queue';
import { SlowQueryLogConfigManager } from './slow-query-log-config';
import { handleSlowQueryLogError } from './slow-query-log-records';
import { MongoDBSlowQueryLogStorage, SlowQueryLogMemoryStorage } from './slow-query-log-storage';

export class SlowQueryLogManager {
    readonly config: SlowQueryLogConfig;
    readonly storage: SlowQueryLogStorage;
    readonly queue: BatchQueue | null;
    private readonly logger: LoggerLike | null;
    private initialized = false;

    constructor(
        userConfig?: SlowQueryLogConfigInput,
        businessClient: MongoClient | null = null,
        businessType = 'mongodb',
        logger: LoggerLike | null = null,
        options: { storage?: SlowQueryLogStorage } = {},
    ) {
        this.logger = logger;
        this.config = SlowQueryLogConfigManager.mergeConfig(userConfig, businessType);
        SlowQueryLogConfigManager.validate(this.config, businessType);
        this.storage = options.storage
            ?? (this.config.storage.type === 'memory'
                ? new SlowQueryLogMemoryStorage()
                : new MongoDBSlowQueryLogStorage(this.config.storage, businessClient, logger));
        this.queue = this.config.batch.enabled ? new BatchQueue(this.storage, this.config.batch, logger) : null;
    }

    async initialize(): Promise<void> {
        if (this.initialized || !this.config.enabled) {
            return;
        }
        await this.storage.initialize();
        this.initialized = true;
    }

    async save(log: SlowQueryLogEntry): Promise<void> {
        if (!this.config.enabled || this.shouldFilter(log)) {
            return;
        }
        await this.initialize();
        try {
            if (this.queue) {
                await this.queue.add(log);
            } else {
                await this.storage.save(log);
            }
        } catch (error) {
            handleSlowQueryLogError(this.logger, this.config.advanced.errorHandling, error);
        }
    }

    async query(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        await this.initialize();
        return this.storage.query(filter, options);
    }

    async close(): Promise<void> {
        await this.queue?.close();
        await this.storage.close();
        this.initialized = false;
    }

    private shouldFilter(log: SlowQueryLogEntry): boolean {
        const { filter } = this.config;
        if (filter.excludeDatabases.includes(log.database)) {
            return true;
        }
        if (filter.excludeCollections.includes(log.collection)) {
            return true;
        }
        if (filter.excludeOperations.includes(log.operation)) {
            return true;
        }
        if (log.durationMs < filter.minExecutionTimeMs) {
            return true;
        }
        return false;
    }
}
