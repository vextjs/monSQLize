/**
 * Change Stream sync capability.
 *
 * Description:
 * - Responsible for sync config validation, resume token persistence, and manager lifecycle.
 * - Public and shared types are managed by `types/sync.d.ts`; only runtime implementation and internal helper types are kept here.
 */

import { copyFile, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ChangeStream, Db, Document, MongoClient, MongoClientOptions } from 'mongodb';
import { MongoClient as MongoDriverClient } from 'mongodb';
import { ErrorCodes, createError } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type { ConnectionPoolManager } from '../pool';
import type {
    ResumeTokenConfig,
    ResumeTokenRedisLike,
    SyncChangeEvent,
    SyncConfig,
    SyncStats,
    SyncTargetConfig,
} from '../../../types/sync';

export type {
    ResumeTokenConfig,
    ResumeTokenRedisLike,
    SyncChangeEvent,
    SyncConfig,
    SyncStats,
    SyncTargetConfig,
} from '../../../types/sync';

interface ResolvedTarget {
    name: string;
    apply(event: SyncChangeEvent, document: Document | undefined): Promise<void>;
    close(): Promise<void>;
    collections: Set<string> | null;
    stats: {
        syncCount: number;
        errorCount: number;
        lastSyncTime: Date | null;
        lastError: Error | null;
    };
}

interface ResumeTokenStoreLike {
    load(): Promise<unknown | null>;
    save(token: unknown): Promise<void>;
    clear(): Promise<void>;
}

interface ChangeStreamSyncManagerOptions {
    db: Db;
    poolManager?: ConnectionPoolManager | null;
    config: SyncConfig;
    logger?: LoggerLike | null;
    tokenStore?: ResumeTokenStoreLike;
    clientFactory?: (uri: string, options?: MongoClientOptions) => Promise<MongoClient>;
}

function normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function delay(ms: number): Promise<void> {
    if (ms <= 0) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}

function normalizeCollectionFilter(collections: string[] | undefined): Set<string> | null {
    if (!collections?.length || collections.includes('*')) {
        return null;
    }
    return new Set(collections);
}

async function syncDirectory(directory: string): Promise<void> {
    try {
        const handle = await open(directory, 'r');
        try {
            await handle.sync();
        } finally {
            await handle.close();
        }
    } catch {
        // Directory fsync is best-effort and unsupported on some platforms.
    }
}

/**
 * Validates a single sync target configuration entry.
 * @param target - Target config to validate.
 * @param index  - Position in the targets array (used in error messages).
 * @throws {MonSQLizeError} When the target configuration is invalid.
 * @since v1.7.0
 */
export function validateTargetConfig(target: SyncTargetConfig | null | undefined, index: number): void {
    if (!target || typeof target !== 'object') {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}] must be an object.`);
    }
    if (typeof target.name !== 'string' || target.name.trim() === '') {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].name must be a non-empty string.`);
    }
    if (!target.apply && !target.uri && !target.pool) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}] requires one of apply / uri / pool.`);
    }
    if (target.uri !== undefined && (typeof target.uri !== 'string' || target.uri.trim() === '')) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].uri must be a non-empty string when provided.`);
    }
    if (target.pool !== undefined && (typeof target.pool !== 'string' || target.pool.trim() === '')) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].pool must be a non-empty string when provided.`);
    }
    if (target.databaseName !== undefined && (typeof target.databaseName !== 'string' || target.databaseName.trim() === '')) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].databaseName must be a non-empty string when provided.`);
    }
    if (target.collections !== undefined && (!Array.isArray(target.collections) || target.collections.length === 0)) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].collections must be a non-empty array when provided.`);
    }
    if (target.collections?.some((item) => typeof item !== 'string' || item.trim() === '')) {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].collections must contain non-empty strings.`);
    }
    if (target.apply !== undefined && typeof target.apply !== 'function') {
        throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] targets[${index}].apply must be a function when provided.`);
    }
}

/**
 * Validates a resume token configuration object.
 * @param config - Resume token config to validate.
 * @throws {MonSQLizeError} When the configuration is invalid.
 * @since v1.7.0
 */
export function validateResumeTokenConfig(config: ResumeTokenConfig | null | undefined): void {
    if (!config || typeof config !== 'object') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken must be an object.');
    }
    const storage = config.storage ?? 'file';
    if (!['file', 'redis'].includes(storage)) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.storage must be file or redis.');
    }
    if (storage === 'file' && config.path !== undefined && typeof config.path !== 'string') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.path must be a string.');
    }
    if (storage === 'redis' && !config.redis) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.redis is required when storage is redis.');
    }
    if (storage === 'redis' && config.redis && typeof config.redis !== 'object') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.redis must be an object.');
    }
    if (config.strictSave !== undefined && typeof config.strictSave !== 'boolean') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.strictSave must be a boolean.');
    }
    if (config.strictLoad !== undefined && typeof config.strictLoad !== 'boolean') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.strictLoad must be a boolean.');
    }
    if (config.saveRetries !== undefined && (!Number.isInteger(config.saveRetries) || config.saveRetries < 0)) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.saveRetries must be a non-negative integer.');
    }
    if (config.saveRetryDelayMs !== undefined && (!Number.isInteger(config.saveRetryDelayMs) || config.saveRetryDelayMs < 0)) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] resumeToken.saveRetryDelayMs must be a non-negative integer.');
    }
}

/**
 * Validates a {@link SyncConfig} object and throws a descriptive error on failure.
 * @param config - Sync configuration to validate.
 * @throws {MonSQLizeError} When the configuration is invalid.
 * @since v1.7.0
 */
export function validateSyncConfig(config: SyncConfig): void {
    if (!config || typeof config !== 'object') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] config must be an object.');
    }
    if (typeof config.enabled !== 'boolean') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] enabled must be a boolean.');
    }
    if (!config.enabled) {
        return;
    }
    if (!Array.isArray(config.targets) || config.targets.length === 0) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] targets must be a non-empty array.');
    }
    if (config.collections !== undefined && (!Array.isArray(config.collections) || config.collections.length === 0)) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] collections must be a non-empty array when provided.');
    }
    if (config.collections?.some((item) => typeof item !== 'string' || item.trim() === '')) {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] collections must contain non-empty strings.');
    }
    if (config.filter !== undefined && typeof config.filter !== 'function') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] filter must be a function.');
    }
    if (config.transform !== undefined && typeof config.transform !== 'function') {
        throw createError(ErrorCodes.INVALID_CONFIG, '[Sync] transform must be a function.');
    }

    config.targets.forEach((target, index) => {
        validateTargetConfig(target as SyncTargetConfig | null, index);
    });

    if (config.resumeToken) {
        validateResumeTokenConfig(config.resumeToken);
    }
}

/**
 * Persists and retrieves change-stream resume tokens using either the file system
 * or a Redis key-value store.
 * @since v1.7.0
 */
export class ResumeTokenStore implements ResumeTokenStoreLike {
    private readonly storage: 'file' | 'redis';
    public readonly path: string;
    private readonly redis?: ResumeTokenRedisLike;
    private readonly redisKey: string;
    private readonly logger: LoggerLike | null;
    private readonly strictLoad: boolean;
    private readonly strictSave: boolean;
    private readonly saveRetries: number;
    private readonly saveRetryDelayMs: number;

    constructor(options: ResumeTokenConfig & { logger?: LoggerLike | null; } = {}) {
        this.storage = options.storage ?? 'file';
        this.path = options.path ?? './.sync-resume-token';
        this.redis = options.redis;
        this.redisKey = options.key ?? 'monsqlize:sync:resume-token';
        this.logger = options.logger ?? null;
        this.strictSave = options.strictSave ?? true;
        this.strictLoad = options.strictLoad ?? this.strictSave;
        this.saveRetries = options.saveRetries ?? 0;
        this.saveRetryDelayMs = options.saveRetryDelayMs ?? 100;
        validateResumeTokenConfig(options);
    }

    async load(): Promise<unknown | null> {
        try {
            if (this.storage === 'redis' && this.redis) {
                const payload = await Promise.resolve(this.redis.get(this.redisKey));
                return payload ? JSON.parse(String(payload)) : null;
            }
            const payload = await readFile(this.path, 'utf8');
            return JSON.parse(payload);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code !== 'ENOENT') {
                this.logger?.warn?.('[Sync] failed to load resume token', error);
            }
            if (code !== 'ENOENT' && this.strictLoad) {
                throw createError(
                    ErrorCodes.DATABASE_ERROR,
                    '[Sync] failed to load resume token',
                    undefined,
                    normalizeError(error),
                );
            }
            return null;
        }
    }

    async save(token: unknown): Promise<void> {
        const payload = JSON.stringify(token, null, 2);
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.saveRetries; attempt += 1) {
            try {
                await this.writePayload(payload);
                return;
            } catch (error) {
                lastError = normalizeError(error);
                if (attempt < this.saveRetries) {
                    this.logger?.warn?.('[Sync] failed to save resume token; retrying', {
                        attempt: attempt + 1,
                        retries: this.saveRetries,
                        error: lastError,
                    });
                    await delay(this.saveRetryDelayMs);
                }
            }
        }

        this.logger?.error?.('[Sync] failed to save resume token', lastError);
        if (this.strictSave) {
            throw createError(
                ErrorCodes.DATABASE_ERROR,
                '[Sync] failed to save resume token',
                undefined,
                lastError ?? undefined,
            );
        }
    }

    private async writePayload(payload: string): Promise<void> {
        if (this.storage === 'redis' && this.redis) {
            await Promise.resolve(this.redis.set(this.redisKey, payload));
            return;
        }
        const directory = path.dirname(this.path);
        const basename = path.basename(this.path);
        const tempPath = path.join(directory, `.${basename}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);

        await mkdir(directory, { recursive: true });
        try {
            const handle = await open(tempPath, 'w');
            try {
                await handle.writeFile(payload, 'utf8');
                await handle.sync();
            } finally {
                await handle.close();
            }
            await this.backupCurrentFile();
            await rename(tempPath, this.path);
            await syncDirectory(directory);
        } catch (error) {
            await unlink(tempPath).catch(() => undefined);
            throw error;
        }
    }

    private async backupCurrentFile(): Promise<void> {
        try {
            await copyFile(this.path, `${this.path}.bak`);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code !== 'ENOENT') {
                throw error;
            }
        }
    }

    async clear(): Promise<void> {
        try {
            if (this.storage === 'redis' && this.redis) {
                await Promise.resolve(this.redis.del?.(this.redisKey));
                return;
            }
            await unlink(this.path);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code !== 'ENOENT') {
                this.logger?.warn?.('[Sync] failed to clear resume token', error);
            }
        }
    }
}

/**
 * Watches a MongoDB change stream and fans out change events to configured
 * sync targets (remote MongoDB, Redis pub/sub, or custom callbacks).
 * @since v1.7.0
 */
export class ChangeStreamSyncManager {
    private readonly db: Db;
    private readonly poolManager: ConnectionPoolManager | null;
    private readonly config: SyncConfig;
    private readonly logger: LoggerLike | null;
    private readonly tokenStore: ResumeTokenStoreLike;
    private readonly clientFactory: (uri: string, options?: MongoClientOptions) => Promise<MongoClient>;
    private readonly targets: ResolvedTarget[] = [];
    private changeStream: ChangeStream | null = null;
    private changeQueue: Promise<void> = Promise.resolve();
    private running = false;
    private fatalSyncError: Error | null = null;
    private readonly stats = {
        eventCount: 0,
        syncedCount: 0,
        errorCount: 0,
        startTime: null as Date | null,
        lastEventTime: null as Date | null,
        lastError: null as Error | null,
        tokenSaveErrorCount: 0,
        lastTokenSaveError: null as Error | null,
    };

    constructor(options: ChangeStreamSyncManagerOptions) {
        validateSyncConfig(options.config);
        this.db = options.db;
        this.poolManager = options.poolManager ?? null;
        this.config = options.config;
        this.logger = options.logger ?? null;
        this.tokenStore = options.tokenStore ?? new ResumeTokenStore({
            ...options.config.resumeToken,
            logger: options.logger ?? null,
        });
        this.clientFactory = options.clientFactory ?? defaultClientFactory;
    }

    /**
     * Start Change Stream synchronization.
     * @since v1.0.9
     */
    async start(): Promise<void> {
        if (this.running || !this.config.enabled) {
            return;
        }
        this.fatalSyncError = null;

        await this.validateEnvironment();
        await this.initializeTargets();

        const resumeAfter = await this.tokenStore.load();
        const options: Record<string, unknown> = {
            fullDocument: 'updateLookup',
        };
        if (resumeAfter) {
            options.resumeAfter = resumeAfter;
        }

        const stream = this.db.watch(this.buildPipeline(), options as Parameters<Db['watch']>[1]);
        stream.on('change', (event) => {
            this.enqueueChange(event as SyncChangeEvent<Document>);
        });
        stream.on('error', (error) => {
            const normalized = normalizeError(error);
            this.stats.errorCount += 1;
            this.stats.lastError = normalized;
            this.logger?.error?.('[Sync] change stream error', normalized);
        });
        stream.on('close', () => {
            if (!this.running || this.changeStream !== stream) {
                this.logger?.debug?.('[Sync] change stream closed');
                return;
            }
            const error = createError(ErrorCodes.CONNECTION_CLOSED, '[Sync] change stream closed unexpectedly');
            this.running = false;
            this.changeStream = null;
            this.stats.errorCount += 1;
            this.stats.lastError = error;
            this.logger?.warn?.('[Sync] change stream closed unexpectedly', error);
        });

        this.changeStream = stream;
        this.running = true;
        this.stats.startTime = new Date();
    }

    /**
     * Stop Change Stream synchronization.
     * @since v1.0.9
     */
    async stop(): Promise<void> {
        this.running = false;
        if (this.changeStream) {
            await this.changeStream.close();
            this.changeStream = null;
        }
        await this.changeQueue.catch(() => undefined);
        while (this.targets.length > 0) {
            const target = this.targets.pop();
            await target?.close();
        }
    }

    /**
     * Get current statistics.
     * @since v1.0.9
     */
    getStats(): SyncStats {
        return {
            isRunning: this.running,
            eventCount: this.stats.eventCount,
            syncedCount: this.stats.syncedCount,
            errorCount: this.stats.errorCount,
            startTime: this.stats.startTime,
            lastEventTime: this.stats.lastEventTime,
            lastError: this.stats.lastError,
            tokenSaveErrorCount: this.stats.tokenSaveErrorCount,
            lastTokenSaveError: this.stats.lastTokenSaveError,
            targets: this.targets.map((target) => ({
                name: target.name,
                syncCount: target.stats.syncCount,
                errorCount: target.stats.errorCount,
                lastSyncTime: target.stats.lastSyncTime,
                lastError: target.stats.lastError,
                successRate: target.stats.syncCount + target.stats.errorCount === 0
                    ? '0%'
                    : `${((target.stats.syncCount / (target.stats.syncCount + target.stats.errorCount)) * 100).toFixed(2)}%`,
            })),
        };
    }

    private async validateEnvironment(): Promise<void> {
        try {
            const probe = this.db.watch([], { maxAwaitTimeMS: 1 });
            await probe.close();
        } catch (error) {
            throw createError(
                ErrorCodes.INVALID_CONFIG,
                'Change Stream requires a MongoDB replica set or sharded cluster.',
                undefined,
                error instanceof Error ? error : undefined,
            );
        }
    }

    private buildPipeline(): Document[] {
        const pipeline: Document[] = [
            {
                $match: {
                    operationType: {
                        $in: ['insert', 'update', 'replace', 'delete'],
                    },
                },
            },
        ];

        const collections = normalizeCollectionFilter(this.config.collections);
        if (collections) {
            pipeline.unshift({
                $match: {
                    'ns.coll': { $in: [...collections] },
                },
            });
        }

        return pipeline;
    }

    private async initializeTargets(): Promise<void> {
        if (this.targets.length > 0) {
            return;
        }
        for (const target of this.config.targets) {
            this.targets.push(await this.resolveTarget(target));
        }
    }

    private async resolveTarget(target: SyncTargetConfig): Promise<ResolvedTarget> {
        const collections = normalizeCollectionFilter(target.collections);
        if (target.apply) {
            return {
                name: target.name,
                collections,
                apply: target.apply,
                close: async () => {},
                stats: {
                    syncCount: 0,
                    errorCount: 0,
                    lastSyncTime: null,
                    lastError: null,
                },
            };
        }

        if (target.pool) {
            if (!this.poolManager) {
                throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] target '${target.name}' requires poolManager when pool is provided.`);
            }
            const selected = this.poolManager.selectPool('write', {
                pool: target.pool,
                databaseName: target.databaseName ?? this.db.databaseName,
            });
            return createMongoTarget(target.name, collections, selected.client, target.databaseName ?? this.db.databaseName, false);
        }

        if (!target.uri) {
            throw createError(ErrorCodes.INVALID_CONFIG, `[Sync] target '${target.name}' requires uri when pool/apply are not provided.`);
        }

        const client = await this.clientFactory(target.uri, target.options);
        return createMongoTarget(target.name, collections, client, target.databaseName ?? this.db.databaseName, true);
    }

    private async handleChange(event: SyncChangeEvent<Document>): Promise<void> {
        if (this.fatalSyncError) {
            this.logger?.warn?.('[Sync] skipping queued change after fatal sync error', this.fatalSyncError);
            return;
        }
        this.stats.eventCount += 1;
        this.stats.lastEventTime = new Date();

        if (this.config.filter && !this.config.filter(event)) {
            return;
        }

        let document = event.fullDocument as Document | undefined;
        if (this.config.transform) {
            document = this.config.transform(document, event);
        }

        let eligibleTargets = 0;
        let succeeded = 0;
        const targetErrors: Error[] = [];
        for (const target of this.targets) {
            if (target.collections && !target.collections.has(event.ns.coll)) {
                continue;
            }
            eligibleTargets += 1;
            try {
                await target.apply(event, document);
                target.stats.syncCount += 1;
                target.stats.lastSyncTime = new Date();
                target.stats.lastError = null;
                succeeded += 1;
            } catch (error) {
                const normalized = error instanceof Error ? error : new Error(String(error));
                target.stats.errorCount += 1;
                target.stats.lastError = normalized;
                this.stats.errorCount += 1;
                this.stats.lastError = normalized;
                this.logger?.error?.('[Sync] target apply failed', {
                    target: target.name,
                    error: normalized,
                });
                targetErrors.push(normalized);
            }
        }

        if (targetErrors.length > 0) {
            return;
        }

        if (eligibleTargets > 0 && succeeded === eligibleTargets) {
            try {
                await this.tokenStore.save(event._id);
            } catch (error) {
                const normalized = normalizeError(error);
                this.stats.tokenSaveErrorCount += 1;
                this.stats.lastTokenSaveError = normalized;
                this.stats.lastError = normalized;
                this.stopAfterFatalSyncError(normalized);
                throw normalized;
            }
            this.stats.syncedCount += 1;
        }
    }

    private stopAfterFatalSyncError(error: Error): void {
        this.fatalSyncError = error;
        this.running = false;
        const stream = this.changeStream;
        this.changeStream = null;
        if (stream) {
            void stream.close().catch((closeError) => {
                this.logger?.warn?.('[Sync] failed to close change stream after fatal error', closeError);
            });
        }
    }

    private enqueueChange(event: SyncChangeEvent<Document>): void {
        this.changeQueue = this.changeQueue
            .then(() => this.handleChange(event))
            .catch((error) => {
                const normalized = normalizeError(error);
                this.stats.errorCount += 1;
                this.stats.lastError = normalized;
                this.logger?.error?.('[Sync] change handling failed', normalized);
            });
    }
}


function createMongoTarget(
    name: string,
    collections: Set<string> | null,
    client: MongoClient,
    databaseName: string,
    ownsConnection: boolean,
): ResolvedTarget {
    return {
        name,
        collections,
        async apply(event, document) {
            const collection = client.db(databaseName).collection(event.ns.coll);
            if (event.operationType === 'delete') {
                await collection.deleteOne(event.documentKey as Document);
                return;
            }
            if (!document) {
                return;
            }
            const key = event.documentKey as Document | undefined;
            const filter = key && Object.keys(key).length > 0
                ? key
                : { _id: document._id };
            await collection.replaceOne(filter, document, { upsert: true });
        },
        async close() {
            if (ownsConnection) {
                await client.close();
            }
        },
        stats: {
            syncCount: 0,
            errorCount: 0,
            lastSyncTime: null,
            lastError: null,
        },
    };
}

async function defaultClientFactory(uri: string, options?: MongoClientOptions): Promise<MongoClient> {
    const client = new MongoDriverClient(uri, options);
    await client.connect();
    return client;
}

