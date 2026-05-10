import type { LoggerLike } from './base';

export interface SyncChangeEvent {
    _id?: unknown;
    operationType: 'insert' | 'update' | 'replace' | 'delete';
    ns: {
        db: string;
        coll: string;
    };
    documentKey?: Record<string, unknown>;
    fullDocument?: Record<string, unknown>;
    updateDescription?: {
        updatedFields?: Record<string, unknown>;
        removedFields?: string[];
    };
}

export interface SyncTargetConfig {
    name: string;
    uri?: string;
    pool?: string;
    databaseName?: string;
    collections?: string[];
    options?: Record<string, unknown>;
    apply?: (event: SyncChangeEvent, document: Record<string, unknown> | undefined) => Promise<void>;
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

