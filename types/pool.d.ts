import type { MongoClientOptions } from 'mongodb';

import type { LoggerLike } from './base';

export type PoolRole = 'primary' | 'secondary' | 'analytics' | 'custom';
export type PoolStrategy = 'auto' | 'roundRobin' | 'weighted' | 'leastConnections' | 'manual';
export type FallbackStrategy = 'error' | 'readonly' | 'primary' | 'secondary';

export interface PoolConfig {
    name: string;
    uri: string;
    role?: PoolRole;
    weight?: number;
    tags?: string[];
    options?: MongoClientOptions;
    healthCheck?: {
        enabled?: boolean;
        interval?: number;
        timeout?: number;
        retries?: number;
    };
}

export interface ConnectionPoolManagerOptions {
    pools?: PoolConfig[];
    maxPoolsCount?: number;
    poolStrategy?: PoolStrategy;
    poolFallback?: boolean | {
        enabled?: boolean;
        fallbackStrategy?: FallbackStrategy;
        retryDelay?: number;
        maxRetries?: number;
    };
    logger?: LoggerLike | null;
}

export interface PoolHealthStatus {
    status: 'up' | 'down' | 'degraded';
    consecutiveFailures: number;
    lastCheckTime: Date | null;
    lastError: Error | null;
    uptime: number;
}

export interface PoolStats {
    name: string;
    /** Current active connections (reported by MongoDB driver). */
    connections: number;
    /** Available (idle) connections in the pool. */
    available: number;
    /** Requests currently waiting for a connection. */
    waiting: number;
    /** Health status from the last health check. */
    status: 'up' | 'down' | 'degraded' | 'unknown';
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    errorRate: number;
    lastRequestTime: Date | null;
}

export declare class ConnectionPoolManager {
    constructor(options?: ConnectionPoolManagerOptions);
    addPool(config: PoolConfig): Promise<void>;
    removePool(name: string): Promise<void>;
    getPool(name: string): unknown | null;
    getPoolNames(): string[];
    selectPool(operation: 'read' | 'write', options?: { pool?: string; tags?: string[]; databaseName?: string; }): {
        name: string;
        client: unknown;
        db: (name?: string) => unknown;
        collection: (databaseName: string | undefined, collectionName: string) => unknown;
    };
    startHealthCheck(name?: string): void;
    stopHealthCheck(name?: string): void;
    getPoolHealth(): Map<string, PoolHealthStatus>;
    getHealthStatus(): Record<string, PoolHealthStatus>;
    getPoolStats(): Record<string, PoolStats>;
    close(): Promise<void>;
}

