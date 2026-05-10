import type { MongoClient, MongoClientOptions } from 'mongodb';
import { MongoClient as MongoDriverClient } from 'mongodb';
import type { LoggerLike } from '../../core/logger';

export type PoolRole = 'primary' | 'secondary' | 'analytics' | 'custom';
export type PoolStrategy = 'auto' | 'roundRobin' | 'weighted' | 'leastConnections' | 'manual';
export type FallbackStrategy = 'error' | 'readonly' | 'primary';

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
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    errorRate: number;
    lastRequestTime: Date | null;
}

interface ManagedPool {
    client: MongoClient;
    config: PoolConfig;
    createdAt: number;
}

interface InternalPoolManagerOptions extends ConnectionPoolManagerOptions {
    clientFactory?: (config: PoolConfig) => Promise<MongoClient>;
    healthCheckFn?: (poolName: string, client: MongoClient, config: PoolConfig) => Promise<boolean>;
}

const DEFAULT_HEALTH_CHECK = {
    enabled: true,
    interval: 5000,
    timeout: 3000,
    retries: 3,
};

export class ConnectionPoolManager {
    private readonly pools = new Map<string, ManagedPool>();
    private readonly healthStatus = new Map<string, PoolHealthStatus>();
    private readonly stats = new Map<string, PoolStats>();
    private readonly intervals = new Map<string, NodeJS.Timeout>();
    private readonly logger: LoggerLike | null;
    private readonly maxPoolsCount: number;
    private readonly strategy: PoolStrategy;
    private readonly fallback: { enabled: boolean; fallbackStrategy: FallbackStrategy; retryDelay: number; maxRetries: number; };
    private readonly clientFactory: (config: PoolConfig) => Promise<MongoClient>;
    private readonly healthCheckFn: (poolName: string, client: MongoClient, config: PoolConfig) => Promise<boolean>;
    private readonly roundRobinIndex = new Map<string, number>();

    constructor(options: InternalPoolManagerOptions = {}) {
        this.logger = options.logger ?? null;
        this.maxPoolsCount = options.maxPoolsCount ?? 10;
        this.strategy = options.poolStrategy ?? 'auto';
        const fallback = typeof options.poolFallback === 'boolean'
            ? { enabled: options.poolFallback, fallbackStrategy: 'error' as FallbackStrategy, retryDelay: 1000, maxRetries: 3 }
            : {
                enabled: options.poolFallback?.enabled ?? false,
                fallbackStrategy: options.poolFallback?.fallbackStrategy ?? 'error',
                retryDelay: options.poolFallback?.retryDelay ?? 1000,
                maxRetries: options.poolFallback?.maxRetries ?? 3,
            };
        this.fallback = fallback;
        this.clientFactory = options.clientFactory ?? defaultClientFactory;
        this.healthCheckFn = options.healthCheckFn ?? defaultHealthCheckFn;
    }

    /**
     * 添加连接池。
     * @since v1.0.8
     */
    async addPool(config: PoolConfig): Promise<void> {
        validatePoolConfig(config);
        if (this.pools.has(config.name)) {
            throw new Error(`Pool '${config.name}' already exists`);
        }
        if (this.pools.size >= this.maxPoolsCount) {
            throw new Error(`Maximum pool count (${this.maxPoolsCount}) reached`);
        }

        const client = await this.clientFactory(config);
        this.pools.set(config.name, {
            client,
            config,
            createdAt: Date.now(),
        });
        this.healthStatus.set(config.name, {
            status: 'up',
            consecutiveFailures: 0,
            lastCheckTime: null,
            lastError: null,
            uptime: 0,
        });
        this.stats.set(config.name, createEmptyPoolStats(config.name));
    }

    /**
     * 移除连接池。
     * @since v1.0.8
     */
    async removePool(name: string): Promise<void> {
        const pool = this.pools.get(name);
        if (!pool) {
            throw new Error(`Pool '${name}' not found`);
        }
        this.stopHealthCheck(name);
        await pool.client.close();
        this.pools.delete(name);
        this.healthStatus.delete(name);
        this.stats.delete(name);
    }

    /**
     * 获取连接池原生 client。
     * @since v1.0.8
     */
    getPool(name: string): MongoClient | null {
        return this.pools.get(name)?.client ?? null;
    }

    /**
     * 选择连接池。
     * @since v1.0.8
     */
    selectPool(
        operation: 'read' | 'write',
        options: { pool?: string; tags?: string[]; databaseName?: string; } = {},
    ): {
        name: string;
        client: MongoClient;
        db: (name?: string) => ReturnType<MongoClient['db']>;
        collection: (databaseName: string | undefined, collectionName: string) => ReturnType<ReturnType<MongoClient['db']>['collection']>;
    } {
        const candidateNames = this.getCandidatePools(operation, options);
        if (candidateNames.length === 0) {
            throw new Error('No available connection pool');
        }
        const selectedName = this.selectPoolName(candidateNames, operation);
        const selected = this.pools.get(selectedName);
        if (!selected) {
            throw new Error(`Selected pool '${selectedName}' not available`);
        }
        this.recordSelection(selectedName, true);
        return {
            name: selectedName,
            client: selected.client,
            db: (name?: string) => selected.client.db(name),
            collection: (databaseName: string | undefined, collectionName: string) => selected.client.db(databaseName).collection(collectionName),
        };
    }

    /**
     * 启动健康检查。
     * @since v1.0.8
     */
    startHealthCheck(name?: string): void {
        const targets = name ? [name] : [...this.pools.keys()];
        for (const poolName of targets) {
            const managed = this.pools.get(poolName);
            if (!managed) {
                continue;
            }
            const healthConfig = {
                ...DEFAULT_HEALTH_CHECK,
                ...managed.config.healthCheck,
            };
            if (!healthConfig.enabled) {
                continue;
            }
            this.stopHealthCheck(poolName);
            const timer = setInterval(() => {
                void this.checkPoolHealth(poolName);
            }, healthConfig.interval);
            timer.unref?.();
            this.intervals.set(poolName, timer);
            void this.checkPoolHealth(poolName);
        }
    }

    /**
     * 停止健康检查。
     * @since v1.0.8
     */
    stopHealthCheck(name?: string): void {
        const targets = name ? [name] : [...this.intervals.keys()];
        for (const poolName of targets) {
            const timer = this.intervals.get(poolName);
            if (!timer) {
                continue;
            }
            clearInterval(timer);
            this.intervals.delete(poolName);
        }
    }

    /**
     * 获取健康状态。
     * @since v1.0.8
     */
    getHealthStatus(): Record<string, PoolHealthStatus> {
        return Object.fromEntries(this.healthStatus.entries());
    }

    /**
     * 获取连接池统计。
     * @since v1.0.8
     */
    getPoolStats(): Record<string, PoolStats> {
        return Object.fromEntries(this.stats.entries());
    }

    /**
     * 关闭全部连接池。
     * @since v1.0.8
     */
    async close(): Promise<void> {
        this.stopHealthCheck();
        for (const pool of this.pools.values()) {
            await pool.client.close();
        }
        this.pools.clear();
        this.healthStatus.clear();
        this.stats.clear();
    }

    private getCandidatePools(operation: 'read' | 'write', options: { pool?: string; tags?: string[]; }): string[] {
        if (options.pool) {
            const pool = this.pools.get(options.pool);
            if (!pool) {
                throw new Error(`Pool '${options.pool}' not found`);
            }
            return [options.pool];
        }

        let candidates = [...this.pools.entries()]
            .filter(([name]) => (this.healthStatus.get(name)?.status ?? 'down') !== 'down');

        if (candidates.length === 0 && this.fallback.enabled) {
            candidates = [...this.pools.entries()];
        }

        if (operation === 'write') {
            const primaries = candidates.filter(([, pool]) => (pool.config.role ?? 'primary') === 'primary');
            if (primaries.length > 0) {
                candidates = primaries;
            }
        } else {
            const secondaries = candidates.filter(([, pool]) => pool.config.role === 'secondary' || pool.config.role === 'analytics');
            if (secondaries.length > 0) {
                candidates = secondaries;
            }
        }

        if (options.tags?.length) {
            const tagged = candidates.filter(([, pool]) => options.tags?.some((tag) => pool.config.tags?.includes(tag)));
            if (tagged.length > 0) {
                candidates = tagged;
            }
        }

        return candidates.map(([name]) => name);
    }

    private selectPoolName(candidateNames: string[], operation: 'read' | 'write'): string {
        if (candidateNames.length === 1) {
            return candidateNames[0];
        }
        if (this.strategy === 'roundRobin') {
            const current = this.roundRobinIndex.get(operation) ?? 0;
            const selected = candidateNames[current % candidateNames.length];
            this.roundRobinIndex.set(operation, current + 1);
            return selected;
        }
        if (this.strategy === 'leastConnections') {
            return [...candidateNames].sort((left, right) => {
                const leftStats = this.stats.get(left)?.totalRequests ?? 0;
                const rightStats = this.stats.get(right)?.totalRequests ?? 0;
                return leftStats - rightStats;
            })[0];
        }
        if (this.strategy === 'weighted' || this.strategy === 'auto') {
            const weighted = candidateNames.flatMap((name) => {
                const weight = this.pools.get(name)?.config.weight ?? 1;
                return Array.from({ length: weight }, () => name);
            });
            return weighted[Math.floor(Math.random() * weighted.length)] ?? candidateNames[0];
        }
        return candidateNames[0];
    }

    private async checkPoolHealth(poolName: string): Promise<void> {
        const managed = this.pools.get(poolName);
        const current = this.healthStatus.get(poolName);
        if (!managed || !current) {
            return;
        }

        try {
            const healthy = await this.healthCheckFn(poolName, managed.client, managed.config);
            current.lastCheckTime = new Date();
            current.uptime = Date.now() - managed.createdAt;
            if (healthy) {
                current.status = 'up';
                current.consecutiveFailures = 0;
                current.lastError = null;
                return;
            }
            current.consecutiveFailures += 1;
            current.status = current.consecutiveFailures > 1 ? 'down' : 'degraded';
        } catch (error) {
            current.lastCheckTime = new Date();
            current.uptime = Date.now() - managed.createdAt;
            current.consecutiveFailures += 1;
            current.lastError = error instanceof Error ? error : new Error(String(error));
            current.status = current.consecutiveFailures > 1 ? 'down' : 'degraded';
            this.logger?.warn?.(`[PoolManager] health check failed for ${poolName}`, current.lastError);
        }
    }

    private recordSelection(poolName: string, success: boolean): void {
        const stats = this.stats.get(poolName);
        if (!stats) {
            return;
        }
        stats.totalRequests += 1;
        if (success) {
            stats.successCount += 1;
        } else {
            stats.errorCount += 1;
        }
        stats.lastRequestTime = new Date();
        const samples = [stats.minResponseTime, stats.maxResponseTime].filter((value) => value > 0);
        stats.avgResponseTime = samples.length === 0 ? 0 : samples.reduce((sum, value) => sum + value, 0) / samples.length;
        stats.errorRate = stats.totalRequests === 0 ? 0 : stats.errorCount / stats.totalRequests;
    }
}

function validatePoolConfig(config: PoolConfig): void {
    if (!config.name?.trim()) {
        throw new Error('Pool config requires a non-empty name');
    }
    if (!config.uri?.trim()) {
        throw new Error('Pool config requires a non-empty uri');
    }
}

function createEmptyPoolStats(name: string): PoolStats {
    return {
        name,
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        errorRate: 0,
        lastRequestTime: null,
    };
}

async function defaultClientFactory(config: PoolConfig): Promise<MongoClient> {
    const client = new MongoDriverClient(config.uri, config.options);
    await client.connect();
    return client;
}

async function defaultHealthCheckFn(_poolName: string, client: MongoClient): Promise<boolean> {
    await client.db('admin').command({ ping: 1 });
    return true;
}

