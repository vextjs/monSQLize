import type { ChangeStreamDocument, Document, MongoClientOptions } from 'mongodb';

import type { LoggerLike } from './base';

export type SyncChangeEvent<TDocument extends Document = Document> = ChangeStreamDocument<TDocument> & {
    _id?: unknown;
    operationType: 'insert' | 'update' | 'replace' | 'delete';
    ns: {
        db: string;
        coll: string;
    };
    documentKey?: Record<string, unknown>;
    fullDocument?: TDocument;
};

export interface SyncTargetHealthCheckConfig {
    /** 是否启用健康检查，默认 true */
    enabled?: boolean;
    /** 健康检查间隔（毫秒），默认 30000 */
    interval?: number;
    /** 单次健康检查超时（毫秒），默认 5000 */
    timeout?: number;
    /** 失败后重试次数，默认 3 */
    retries?: number;
}

export interface SyncTargetConfig {
    name: string;
    uri?: string;
    pool?: string;
    databaseName?: string;
    collections?: string[];
    options?: MongoClientOptions;
    apply?: (event: SyncChangeEvent, document: Record<string, unknown> | undefined) => Promise<void>;
    /** 目标节点健康检查配置 @since v1.0.8 */
    healthCheck?: SyncTargetHealthCheckConfig;
}

export interface ResumeTokenRedisLike {
    get(key: string): Promise<string | null> | string | null;
    set(key: string, value: string): Promise<unknown> | unknown;
    del?(key: string): Promise<unknown> | unknown;
}

export interface ResumeTokenConfig {
    storage?: 'file' | 'redis';
    path?: string;
    redis?: ResumeTokenRedisLike;
    key?: string;
}

export interface SyncConfig {
    enabled: boolean;
    targets: SyncTargetConfig[];
    collections?: string[];
    resumeToken?: ResumeTokenConfig;
    filter?: (event: SyncChangeEvent) => boolean;
    transform?: (document: Record<string, unknown> | undefined, event: SyncChangeEvent) => Record<string, unknown> | undefined;
}

export interface SyncStats {
    isRunning: boolean;
    eventCount: number;
    syncedCount: number;
    errorCount: number;
    startTime: Date | null;
    lastEventTime: Date | null;
    targets: Array<{
        name: string;
        syncCount: number;
        errorCount: number;
        lastSyncTime: Date | null;
        lastError: Error | null;
        successRate: string;
    }>;
}

export declare function validateSyncConfig(config: SyncConfig): void;

export declare class ResumeTokenStore {
    constructor(options?: ResumeTokenConfig & { logger?: LoggerLike | null; });
    load(): Promise<unknown | null>;
    save(token: unknown): Promise<void>;
    clear(): Promise<void>;
}

export declare class ChangeStreamSyncManager {
    constructor(options: {
        db: unknown;
        poolManager?: unknown;
        config: SyncConfig;
        logger?: LoggerLike | null;
    });
    start(): Promise<void>;
    stop(): Promise<void>;
    getStats(): SyncStats;
}

