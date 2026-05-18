/**
 * 慢查询日志存储后端实现。
 *
 * 提供两种存储实现：内存存储（SlowQueryLogMemoryStorage）
 * 与 MongoDB 持久化存储（MongoDBSlowQueryLogStorage）。
 */
import type { Collection, MongoClient, MongoClientOptions } from 'mongodb';
import { MongoClient as MongoDriverClient } from 'mongodb';
import { ErrorCodes, createError } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type {
    SlowQueryLogEntry,
    SlowQueryLogFilter,
    SlowQueryLogQueryOptions,
    SlowQueryLogRecord,
    SlowQueryLogStorage,
    SlowQueryLogStorageConfig,
} from '../../../types/slow-query-log';
import { DEFAULT_SLOW_QUERY_LOG_CONFIG, type NormalizedSlowQueryLogStorageConfig } from './slow-query-log-config';
import {
    cloneSlowQueryLogRecord,
    matchesSlowQueryLogFilter,
    mergeSlowQueryLogRecord,
    normalizeSlowQueryLogEntry,
    recordKey,
    sortSlowQueryLogRecords,
    toMongoFilter,
} from './slow-query-log-records';

async function defaultClientFactory(uri: string, options?: MongoClientOptions): Promise<MongoClient> {
    const client = new MongoDriverClient(uri, options);
    await client.connect();
    return client;
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
        let records = [...this.records.values()].filter((record) => matchesSlowQueryLogFilter(record, filter));
        records = sortSlowQueryLogRecords(records, options.sort);
        if (options.skip) {
            records = records.slice(options.skip);
        }
        if (options.limit) {
            records = records.slice(0, options.limit);
        }
        return records.map(cloneSlowQueryLogRecord);
    }

    async close(): Promise<void> {
        return undefined;
    }

    private upsertRecord(log: SlowQueryLogEntry): void {
        const normalized = normalizeSlowQueryLogEntry(log);
        const key = recordKey(normalized);
        const existing = this.records.get(key);
        this.records.set(key, mergeSlowQueryLogRecord(existing, normalized));
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
