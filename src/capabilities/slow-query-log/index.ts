/**
 * P4-C slow-query-log 能力。
 *
 * 说明：
 * - 当前模块负责慢查询配置合并、队列聚合、存储抽象与运行时 façade。
 * - 公开与共享类型统一由 `types/slow-query-log.d.ts` 承接；此处只保留运行时实现与内部归一化状态。
 */

import { createHash } from 'node:crypto';
import type { Collection, MongoClient, MongoClientOptions } from 'mongodb';
import { MongoClient as MongoDriverClient } from 'mongodb';
import { ErrorCodes, createError } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type {
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorage,
    SlowQueryLogStorageConfig,
} from '../../../types/slow-query-log';

export type {
    SlowQueryLogConfig,
    SlowQueryLogConfigInput,
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorage,
    SlowQueryLogStorageConfig,
} from '../../../types/slow-query-log';

type NormalizedSlowQueryLogStorageConfig = SlowQueryLogStorageConfig & {
    database: string;
    collection: string;
    ttl: number;
};

export const DEFAULT_SLOW_QUERY_LOG_CONFIG: SlowQueryLogConfig = {
    enabled: false,
    storage: {
        type: 'mongodb',
        useBusinessConnection: true,
        uri: null,
        database: 'admin',
        collection: 'slow_query_logs',
        ttl: 7 * 24 * 3600,
    },
    batch: {
        enabled: true,
        size: 10,
        interval: 5000,
        maxBufferSize: 100,
    },
    filter: {
        excludeDatabases: [],
        excludeCollections: [],
        excludeOperations: [],
        minExecutionTimeMs: 0,
    },
    advanced: {
        errorHandling: 'log',
        autoCreateIndexes: true,
    },
};

export function generateQueryHash(input: unknown): string {
    return createHash('sha1').update(stableStringify(input)).digest('hex');
}

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

    /**
     * 添加日志到队列。
     * @since v1.3.1
     */
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

    /**
     * 刷新缓冲区。
     * @since v1.3.1
     */
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

    /**
     * 关闭队列并刷新残留日志。
     * @since v1.3.1
     */
    async close(): Promise<void> {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        await this.flush();
    }
}

export class SlowQueryLogMemoryStorage implements SlowQueryLogStorage {
    private readonly records = new Map<string, SlowQueryLogRecord>();

    async initialize(): Promise<void> {
        return undefined;
    }

    async save(log: SlowQueryLogEntry): Promise<void> {
        this.upsertRecord(log);
    }

    async saveBatch(logs: SlowQueryLogEntry[]): Promise<void> {
        for (const log of logs) {
            this.upsertRecord(log);
        }
    }

    async query(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        let records = [...this.records.values()].filter((record) => matchesFilter(record, filter));
        records = sortRecords(records, options.sort);
        if (options.skip) {
            records = records.slice(options.skip);
        }
        if (options.limit) {
            records = records.slice(0, options.limit);
        }
        return records.map(cloneRecord);
    }

    async close(): Promise<void> {
        return undefined;
    }

    private upsertRecord(log: SlowQueryLogEntry): void {
        const normalized = normalizeSlowQueryLogEntry(log);
        const key = recordKey(normalized);
        const existing = this.records.get(key);
        this.records.set(key, mergeRecord(existing, normalized));
    }
}

export class MongoDBSlowQueryLogStorage implements SlowQueryLogStorage {
    private readonly logger: LoggerLike | null;
    private readonly businessClient: MongoClient | null;
    private readonly config: NormalizedSlowQueryLogStorageConfig;
    private readonly clientFactory: (uri: string, options?: MongoClientOptions) => Promise<MongoClient>;
    private client: MongoClient | null = null;
    private collectionRef: Collection | null = null;

    constructor(
        config: SlowQueryLogStorageConfig = {},
        businessClient: MongoClient | null = null,
        logger: LoggerLike | null = null,
        clientFactory: (uri: string, options?: MongoClientOptions) => Promise<MongoClient> = defaultClientFactory,
    ) {
        this.logger = logger;
        this.businessClient = businessClient;
        this.clientFactory = clientFactory;
        this.config = {
            ...config,
            database: config.database ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.storage.database ?? 'admin',
            collection: config.collection ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.storage.collection ?? 'slow_query_logs',
            ttl: config.ttl ?? DEFAULT_SLOW_QUERY_LOG_CONFIG.storage.ttl ?? 7 * 24 * 3600,
        };
    }

    async initialize(): Promise<void> {
        if (this.collectionRef) {
            return;
        }

        const client = await this.resolveClient();
        this.collectionRef = client.db(this.config.database).collection(this.config.collection);
        if (this.config.ttl && this.config.ttl > 0) {
            await this.collectionRef.createIndex({ lastSeen: 1 }, { expireAfterSeconds: this.config.ttl, name: 'slow_query_lastSeen_ttl' });
        }
        await this.collectionRef.createIndex(
            { queryHash: 1, database: 1, collection: 1, operation: 1 },
            { unique: true, name: 'slow_query_log_unique' },
        );
    }

    async save(log: SlowQueryLogEntry): Promise<void> {
        await this.initialize();
        const record = normalizeSlowQueryLogEntry(log);
        await this.collectionRef!.updateOne(
            {
                queryHash: record.queryHash,
                database: record.database,
                collection: record.collection,
                operation: record.operation,
            },
            {
                $setOnInsert: {
                    queryHash: record.queryHash,
                    database: record.database,
                    collection: record.collection,
                    operation: record.operation,
                    firstSeen: record.firstSeen,
                    minTimeMs: record.minTimeMs,
                    maxTimeMs: record.maxTimeMs,
                    count: 0,
                    totalTimeMs: 0,
                },
                $set: {
                    lastSeen: record.lastSeen,
                    sampleQuery: record.sampleQuery,
                    metadata: record.metadata,
                },
                $inc: {
                    count: 1,
                    totalTimeMs: record.totalTimeMs,
                },
                $min: {
                    minTimeMs: record.minTimeMs,
                },
                $max: {
                    maxTimeMs: record.maxTimeMs,
                },
            },
            { upsert: true },
        );
    }

    async saveBatch(logs: SlowQueryLogEntry[]): Promise<void> {
        for (const log of logs) {
            await this.save(log);
        }
    }

    async query(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        await this.initialize();
        const cursor = this.collectionRef!
            .find(toMongoFilter(filter))
            .sort(options.sort ?? { lastSeen: -1 });
        if (options.skip) {
            cursor.skip(options.skip);
        }
        if (options.limit) {
            cursor.limit(options.limit);
        }
        const rows = await cursor.toArray();
        return rows.map((row) => ({
            queryHash: String(row.queryHash),
            database: String(row.database),
            collection: String(row.collection),
            operation: String(row.operation),
            count: Number(row.count ?? 0),
            totalTimeMs: Number(row.totalTimeMs ?? 0),
            avgTimeMs: Number(row.count ?? 0) > 0 ? Number(row.totalTimeMs ?? 0) / Number(row.count ?? 1) : 0,
            maxTimeMs: Number(row.maxTimeMs ?? 0),
            minTimeMs: Number(row.minTimeMs ?? 0),
            firstSeen: new Date(row.firstSeen),
            lastSeen: new Date(row.lastSeen),
            sampleQuery: row.sampleQuery,
            metadata: row.metadata,
        }));
    }

    async close(): Promise<void> {
        if (this.client && this.client !== this.businessClient) {
            await this.client.close();
        }
        this.client = null;
        this.collectionRef = null;
    }

    private async resolveClient(): Promise<MongoClient> {
        if (this.client) {
            return this.client;
        }
        if (this.config.useBusinessConnection !== false && this.businessClient) {
            this.client = this.businessClient;
            return this.client;
        }
        if (!this.config.uri) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'slowQueryLog.storage.uri is required when useBusinessConnection is false.');
        }
        this.client = await this.clientFactory(this.config.uri, this.config.options);
        return this.client;
    }
}

export class SlowQueryLogConfigManager {
    static mergeConfig(userConfig?: SlowQueryLogConfigInput, businessType = 'mongodb'): SlowQueryLogConfig {
        if (userConfig === undefined || userConfig === null) {
            return deepClone(DEFAULT_SLOW_QUERY_LOG_CONFIG);
        }
        if (typeof userConfig === 'boolean') {
            const config = deepClone(DEFAULT_SLOW_QUERY_LOG_CONFIG);
            config.enabled = userConfig;
            config.storage.type = businessType === 'mongodb' ? 'mongodb' : 'memory';
            return config;
        }
        const merged = mergeSlowQueryLogConfig(deepClone(DEFAULT_SLOW_QUERY_LOG_CONFIG), userConfig);
        if (merged.storage.type === undefined) {
            merged.storage.type = businessType === 'mongodb' ? 'mongodb' : 'memory';
        }
        if (userConfig.storage && merged.enabled === false) {
            merged.enabled = true;
        }
        return merged;
    }

    static validate(config: SlowQueryLogConfig, businessType = 'mongodb'): boolean {
        if (!config || typeof config !== 'object') {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] config must be an object.');
        }
        if (!config.enabled) {
            return true;
        }
        if (!['memory', 'mongodb'].includes(config.storage.type ?? 'memory')) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] storage.type must be memory or mongodb.');
        }
        if (config.storage.type === 'mongodb' && config.storage.useBusinessConnection === false && !config.storage.uri) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] storage.uri is required when mongodb storage does not reuse business connection.');
        }
        if (config.storage.type === 'memory' && businessType !== 'mongodb') {
            return true;
        }
        if (!Number.isInteger(config.batch.size) || config.batch.size < 1) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] batch.size must be >= 1.');
        }
        if (!Number.isInteger(config.batch.interval) || config.batch.interval < 50) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] batch.interval must be >= 50ms.');
        }
        if (!Number.isInteger(config.batch.maxBufferSize) || config.batch.maxBufferSize < config.batch.size) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] batch.maxBufferSize must be >= batch.size.');
        }
        if (config.filter.minExecutionTimeMs < 0) {
            throw createError(ErrorCodes.INVALID_CONFIG, '[SlowQueryLog] filter.minExecutionTimeMs must be >= 0.');
        }
        return true;
    }
}

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
        options: { storage?: SlowQueryLogStorage; } = {},
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

    /**
     * 初始化管理器。
     * @since v1.3.1
     */
    async initialize(): Promise<void> {
        if (this.initialized || !this.config.enabled) {
            return;
        }
        await this.storage.initialize();
        this.initialized = true;
    }

    /**
     * 保存单条慢查询日志。
     * @since v1.3.1
     */
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
            handleError(this.logger, this.config.advanced.errorHandling, error);
        }
    }

    /**
     * 查询已聚合的慢查询日志。
     * @since v1.3.1
     */
    async query(filter: SlowQueryLogFilter = {}, options: SlowQueryLogQueryOptions = {}): Promise<SlowQueryLogRecord[]> {
        await this.initialize();
        return this.storage.query(filter, options);
    }

    /**
     * 关闭管理器。
     * @since v1.3.1
     */
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

function handleError(logger: LoggerLike | null, policy: SlowQueryLogConfig['advanced']['errorHandling'], error: unknown): void {
    if (policy === 'throw') {
        throw error instanceof Error ? error : new Error(String(error));
    }
    if (policy === 'log') {
        logger?.error?.('[SlowQueryLog] operation failed', error);
    }
}

function toMongoFilter(filter: SlowQueryLogFilter): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    if (filter.database) {
        query.database = filter.database;
    }
    if (filter.collection) {
        query.collection = filter.collection;
    }
    if (filter.operation) {
        query.operation = filter.operation;
    }
    if (filter.queryHash) {
        query.queryHash = filter.queryHash;
    }
    return query;
}

function normalizeSlowQueryLogEntry(log: SlowQueryLogEntry): SlowQueryLogRecord {
    if (!log.database || !log.collection || !log.operation) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, '[SlowQueryLog] database / collection / operation are required.');
    }
    if (!Number.isFinite(log.durationMs) || log.durationMs < 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, '[SlowQueryLog] durationMs must be a non-negative number.');
    }
    const timestamp = log.timestamp ?? new Date();
    return {
        queryHash: log.queryHash ?? generateQueryHash({
            database: log.database,
            collection: log.collection,
            operation: log.operation,
            query: log.query,
        }),
        database: log.database,
        collection: log.collection,
        operation: log.operation,
        count: 1,
        totalTimeMs: log.durationMs,
        avgTimeMs: log.durationMs,
        maxTimeMs: log.durationMs,
        minTimeMs: log.durationMs,
        firstSeen: timestamp,
        lastSeen: timestamp,
        sampleQuery: log.query,
        metadata: log.metadata,
    };
}

function mergeRecord(existing: SlowQueryLogRecord | undefined, incoming: SlowQueryLogRecord): SlowQueryLogRecord {
    if (!existing) {
        return incoming;
    }
    const count = existing.count + incoming.count;
    const totalTimeMs = existing.totalTimeMs + incoming.totalTimeMs;
    return {
        ...existing,
        count,
        totalTimeMs,
        avgTimeMs: totalTimeMs / count,
        maxTimeMs: Math.max(existing.maxTimeMs, incoming.maxTimeMs),
        minTimeMs: Math.min(existing.minTimeMs, incoming.minTimeMs),
        firstSeen: existing.firstSeen < incoming.firstSeen ? existing.firstSeen : incoming.firstSeen,
        lastSeen: existing.lastSeen > incoming.lastSeen ? existing.lastSeen : incoming.lastSeen,
        sampleQuery: incoming.sampleQuery ?? existing.sampleQuery,
        metadata: incoming.metadata ?? existing.metadata,
    };
}

function recordKey(record: Pick<SlowQueryLogRecord, 'queryHash' | 'database' | 'collection' | 'operation'>): string {
    return `${record.queryHash}:${record.database}:${record.collection}:${record.operation}`;
}

function matchesFilter(record: SlowQueryLogRecord, filter: SlowQueryLogFilter): boolean {
    if (filter.database && record.database !== filter.database) {
        return false;
    }
    if (filter.collection && record.collection !== filter.collection) {
        return false;
    }
    if (filter.operation && record.operation !== filter.operation) {
        return false;
    }
    if (filter.queryHash && record.queryHash !== filter.queryHash) {
        return false;
    }
    return true;
}

function sortRecords(records: SlowQueryLogRecord[], sort: Record<string, 1 | -1> = { lastSeen: -1 }): SlowQueryLogRecord[] {
    const entries = Object.entries(sort);
    return [...records].sort((left, right) => {
        for (const [field, direction] of entries) {
            const leftValue = left[field as keyof SlowQueryLogRecord];
            const rightValue = right[field as keyof SlowQueryLogRecord];
            if (leftValue === rightValue) {
                continue;
            }
            return (leftValue! > rightValue! ? 1 : -1) * direction;
        }
        return 0;
    });
}

function cloneRecord(record: SlowQueryLogRecord): SlowQueryLogRecord {
    return {
        ...record,
        firstSeen: new Date(record.firstSeen),
        lastSeen: new Date(record.lastSeen),
    };
}

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_key, current) => current instanceof Date ? current.toISOString() : current));
}

function mergeSlowQueryLogConfig(target: SlowQueryLogConfig, source: Partial<SlowQueryLogConfig>): SlowQueryLogConfig {
    return {
        ...target,
        ...source,
        storage: {
            ...target.storage,
            ...(source.storage ?? {}),
        },
        batch: {
            ...target.batch,
            ...(source.batch ?? {}),
        },
        filter: {
            ...target.filter,
            ...(source.filter ?? {}),
        },
        advanced: {
            ...target.advanced,
            ...(source.advanced ?? {}),
        },
    };
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, current]) => `${JSON.stringify(key)}:${stableStringify(current)}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function defaultClientFactory(uri: string, options?: MongoClientOptions): Promise<MongoClient> {
    const client = new MongoDriverClient(uri, options);
    await client.connect();
    return client;
}

