/**
 * 连接池管理能力（Connection Pool Management Capability）。
 *
 * 设计说明：
 * - 负责连接池配置契约、连接池生命周期管理、选择策略与健康检查。
 * - 公开类型与共享接口统一由 `types/pool.d.ts` 管理；
 *   本文件只保留运行时实现与内部辅助逻辑。
 * - 内部数据结构（PoolStatsData / PoolBufferItem）抽离在
 *   `types/internal/pool.ts`，方便跨模块复用且不污染公开 API。
 *
 * 核心子系统：
 * 1. PoolStatsManager — 按 poolName 聚合统计数据，采用批量缓冲策略
 *    减少 Map 写入频率，通过定时 flush 完成合并。
 * 2. PoolSelector — 实现 auto / roundRobin / leastConnections /
 *    weighted / manual 五种选择策略，基于 role + tags + 权重动态路由。
 * 3. HealthChecker — 定时 ping 并维护 status / latency / lastCheck，
 *    为 auto 选择策略提供降权/剔除依据。
 * 4. ConnectionPoolManager — 对外入口，装配以上三个子系统并管理
 *    多 pool 配置的生命周期（start / shutdown / getPoolStats 等）。
 */

import type { MongoClient } from 'mongodb';
import type { LoggerLike } from '../../core/logger';
import type {
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
} from '../../../types/pool';
import { HealthChecker } from './pool-health-checker';
import { PoolSelector } from './pool-selector';
import { PoolStatsManager } from './pool-stats-manager';
import {
    createEmptyPoolStats,
    defaultClientFactory,
    defaultHealthCheckFn,
    validatePoolConfig,
    validatePoolConfigInternal,
    validatePoolConfigSafe,
} from './pool-runtime-helpers';

export type {
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
} from '../../../types/pool';
export { HealthChecker } from './pool-health-checker';
export { PoolSelector } from './pool-selector';
export { PoolStatsManager } from './pool-stats-manager';
export { validatePoolConfig, validatePoolConfigSafe } from './pool-runtime-helpers';

// ─── ConnectionPoolManager ────────────────────────────────────────────────────

interface ManagedPool {
    client: MongoClient;
    config: PoolConfig;
    createdAt: number;
}

interface InternalPoolManagerOptions extends ConnectionPoolManagerOptions {
    clientFactory?: (config: PoolConfig) => Promise<MongoClient>;
    healthCheckFn?: (poolName: string, client: MongoClient, config: PoolConfig) => Promise<boolean>;
    fallback?: boolean | {
        enabled?: boolean;
        fallbackStrategy?: FallbackStrategy;
        retryDelay?: number;
        maxRetries?: number;
    };
}

const DEFAULT_HEALTH_CHECK = {
    enabled: true,
    interval: 5000,
    timeout: 3000,
    retries: 3,
};

/**
 * 连接池管理器（Connection Pool Manager）。
 *
 * 设计说明：
 * - 管理一组具名 MongoDB 连接池，提供健康检查、统计采集与自动故障转移能力。
 * - 内部持有三个独立子系统（健康检查 / 统计 / 选择器），
 *   均通过 _healthChecker / _statsManager / _selector 访问，
 *   以保证关注点分离，可独立替换实现。
 * - 故障转移策略（fallback）配置于构造器，
 *   当首选 pool 不可用时按 fallbackStrategy 重路由。
 * - 支持测试注入：通过 clientFactory / healthCheckFn 选项
 *   替换真实 MongoClient 及 ping 逻辑，方便单测 mock。
 * @since v1.5.0
 */
export class ConnectionPoolManager {
    private readonly pools = new Map<string, ManagedPool>();
    private readonly healthStatus = new Map<string, PoolHealthStatus>();
    private readonly stats = new Map<string, PoolStats>();
    private readonly intervals = new Map<string, NodeJS.Timeout>();
    private readonly logger: LoggerLike | null;
    private readonly maxPoolsCount: number;
    // allow _selector to modify strategy, cannot be readonly
    private strategy: PoolStrategy;
    private readonly fallback: { enabled: boolean; fallbackStrategy: FallbackStrategy; retryDelay: number; maxRetries: number; };
    private readonly clientFactory: (config: PoolConfig) => Promise<MongoClient>;
    private readonly healthCheckFn: (poolName: string, client: MongoClient, config: PoolConfig) => Promise<boolean>;

    // v1 compat properties
    _closed = false;
    readonly _configs = new Map<string, PoolConfig>();
    readonly _selector: PoolSelector;
    readonly _healthChecker: HealthChecker;
    readonly _stats: PoolStatsManager;
    readonly _fallbackConfig: { enabled: boolean; fallbackStrategy: FallbackStrategy; retryDelay: number; maxRetries: number; };
    readonly _fallback: { enabled: boolean; fallbackStrategy: FallbackStrategy; retryDelay: number; maxRetries: number; };
    readonly _pools: Map<string, ManagedPool>;
    private readonly _pendingAdds = new Set<string>();

    constructor(options: InternalPoolManagerOptions = {}) {
        this.logger = options.logger ?? null;
        this.maxPoolsCount = options.maxPoolsCount ?? 10;
        this.strategy = options.poolStrategy ?? 'auto';
        const rawFallback = options.fallback ?? options.poolFallback;
        const fallback = typeof rawFallback === 'boolean'
            ? { enabled: rawFallback, fallbackStrategy: 'error' as FallbackStrategy, retryDelay: 1000, maxRetries: 3 }
            : {
                enabled: rawFallback?.enabled ?? false,
                fallbackStrategy: rawFallback?.fallbackStrategy ?? 'error',
                retryDelay: rawFallback?.retryDelay ?? 1000,
                maxRetries: rawFallback?.maxRetries ?? 3,
            };
        this.fallback = fallback;
        this.clientFactory = options.clientFactory ?? defaultClientFactory;
        this.healthCheckFn = options.healthCheckFn ?? defaultHealthCheckFn;

        // v1 compat: initialize adapter properties
        this._fallbackConfig = this.fallback;
        this._fallback = this.fallback;
        this._pools = this.pools;
        this._selector = new PoolSelector({ strategy: this.strategy });
        this._healthChecker = new HealthChecker({ poolManager: this });
        this._stats = new PoolStatsManager({ logger: options.logger ?? undefined });
    }

    /**
     * Add a connection pool.
     * @since v1.0.8
     */
    async addPool(config: PoolConfig): Promise<void> {
        validatePoolConfigInternal(config);
        if (this.pools.has(config.name) || this._pendingAdds.has(config.name)) {
            throw new Error(`Pool '${config.name}' already exists`);
        }
        if (this.maxPoolsCount > 0 && this.pools.size >= this.maxPoolsCount) {
            throw new Error(`Maximum pool count (${this.maxPoolsCount}) reached`);
        }
        this._pendingAdds.add(config.name);
        try {
            const client = await this.clientFactory(config);
            if (this.pools.has(config.name)) {
                await client.close().catch(() => {});
                throw new Error(`Pool '${config.name}' already exists`);
            }
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
            // v1 compat
            this._configs.set(config.name, config);
            this._healthChecker.register(config.name, (config.healthCheck ?? {}) as Record<string, unknown>);
        } catch (err) {
            // v1 compat: ensure connection-level errors include 'connect'/'ETIMEDOUT'/'ECONNREFUSED'
            // so callers can detect network failures. MongoDB driver v6 wraps socket errors in
            // MongoServerSelectionError whose message says "Server selection timed out" without
            // the underlying network error keyword.
            const error = err as Error & { code?: unknown; name?: string };
            const msg = error.message ?? '';
            const hasNetworkKeyword = msg.includes('connect') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED');
            if (!hasNetworkKeyword && error.name && error.name.toLowerCase().includes('mongo')) {
                const enhanced = new Error(`connect ETIMEDOUT: ${msg}`) as Error & { code?: unknown };
                enhanced.name = error.name;
                enhanced.code = error.code;
                throw enhanced;
            }
            throw err;
        } finally {
            this._pendingAdds.delete(config.name);
        }
    }

    /**
     * Remove a connection pool.
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
        // v1 compat
        this._configs.delete(name);
        this._healthChecker.unregister(name);
    }

    /**
     * Get the native MongoClient for a pool.
     * @since v1.0.8
     */
    getPool(name: string): MongoClient | null {
        return this.pools.get(name)?.client ?? null;
    }

    /**
     * Select a connection pool.
     * @since v1.0.8
     */
    selectPool(
        operation: 'read' | 'write',
        options: { pool?: string; tags?: string[]; databaseName?: string; poolPreference?: { role?: string; tags?: string[] }; } = {},
    ): {
        name: string;
        client: MongoClient;
        db: (name?: string) => ReturnType<MongoClient['db']>;
        collection: (databaseName: string | undefined, collectionName: string) => ReturnType<ReturnType<MongoClient['db']>['collection']>;
    } {
        // manually specified pool
        if (options.pool) {
            const poolData = this.pools.get(options.pool);
            if (!poolData) throw new Error(`Pool '${options.pool}' not found`);
            return this._createPoolResult(options.pool, poolData.client);
        }

        // get healthy pool list (same logic as v1)
        let candidates = this._getHealthyPools();

        // all pools unavailable — use fallback strategy
        if (candidates.length === 0) {
            if (!this.fallback.enabled) {
                throw new Error('No available connection pool');
            }
            candidates = this._handleAllPoolsDown(operation);
            if (candidates.length === 0) {
                throw new Error('No available connection pool');
            }
        }

        // select pool name via selector
        const poolName = this._selector.select(candidates, {
            operation,
            stats: this._stats.getAllStats(),
            poolPreference: options.poolPreference,
        });

        const poolData = this.pools.get(poolName);
        if (!poolData) {
            throw new Error(`Selected pool '${poolName}' not available`);
        }

        this._stats.recordSelection(poolName, operation);
        this.recordSelection(poolName, true);
        return this._createPoolResult(poolName, poolData.client);
    }

    private _createPoolResult(name: string, client: MongoClient): {
        name: string;
        client: MongoClient;
        db: (n?: string) => ReturnType<MongoClient['db']>;
        collection: (databaseName: string | undefined, collectionName: string) => ReturnType<ReturnType<MongoClient['db']>['collection']>;
    } {
        return {
            name,
            client,
            db: (n?: string) => client.db(n),
            collection: (databaseName: string | undefined, collectionName: string) => client.db(databaseName).collection(collectionName),
        };
    }

    /**
     * Start health checks.
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
     * Stop health checks.
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
     * Get health status.
     * @since v1.0.8
     */
    getHealthStatus(): Record<string, PoolHealthStatus> {
        return Object.fromEntries(this.healthStatus.entries());
    }

    /**
     * Get all pool names.
     * @since v1.3.0
     */
    getPoolNames(): string[] {
        return Array.from(this.pools.keys());
    }

    /**
     * Get pool statistics.
     * @since v1.0.8
     */
    getPoolStats(): Record<string, any> {
        const result: Record<string, any> = {};
        for (const name of this.pools.keys()) {
            const healthStatus = this.healthStatus.get(name);
            const poolStats = this._stats.getStats(name);
            result[name] = {
                connections: poolStats?.connections || 0,
                available: poolStats?.available || 0,
                waiting: poolStats?.waiting || 0,
                status: healthStatus?.status || 'unknown',
                avgResponseTime: poolStats?.avgResponseTime || 0,
                totalRequests: poolStats?.totalRequests || 0,
                errorRate: poolStats?.errorRate || 0,
            };
        }
        return result;
    }

    /**
     * Close all connection pools.
     * @since v1.0.8
     */
    async close(): Promise<void> {
        this.stopHealthCheck();
        this._healthChecker.stop();
        this._stats.close();
        for (const pool of this.pools.values()) {
            await pool.client.close();
        }
        this.pools.clear();
        this.healthStatus.clear();
        this.stats.clear();
        this._closed = true;
    }

    // ─── v1 compat methods ───────────────────────────────────────────────────────────

    /** v1 compat: get pool health Map */
    getPoolHealth(): Map<string, PoolHealthStatus> { return new Map(this.healthStatus); }

    /** v1 compat: get healthy pool config list (iterates _configs, matches v1 logic) */
    _getHealthyPools(): PoolConfig[] {
        const result: PoolConfig[] = [];
        for (const [name, config] of this._configs.entries()) {
            const status = this._healthChecker.getStatus(name);
            if (!status || status.status !== 'down') {
                result.push(config);
            }
        }
        return result;
    }

    /** v1 compat: get raw MongoClient */
    _getPool(name: string): MongoClient | null { return this.pools.get(name)?.client ?? null; }

    /** v1 compat: get pool config list by role */
    _getPoolsByRole(role: PoolRole): PoolConfig[] {
        const result: PoolConfig[] = [];
        for (const [, config] of this._configs.entries()) {
            if (config.role === role) result.push(config);
        }
        return result;
    }

    /** v1 compat: fallback when all pools are down (synchronously returns candidate pool list) */
    _handleAllPoolsDown(operation: string): PoolConfig[] {
        this.logger?.warn?.(`[PoolManager] All pools down, fallback strategy: ${this.fallback.fallbackStrategy}`);
        const { fallbackStrategy } = this.fallback;
        if (fallbackStrategy === 'readonly') {
            if (operation === 'write') return [];
            return this._getPoolsByRole('secondary');
        }
        if (fallbackStrategy === 'secondary') {
            return this._getPoolsByRole('secondary');
        }
        return [];
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
        stats.errorRate = stats.totalRequests === 0 ? 0 : stats.errorCount / stats.totalRequests;
    }
}

