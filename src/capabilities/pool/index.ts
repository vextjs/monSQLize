/**
 * Connection pool management capability.
 *
 * Description:
 * - Responsible for pool config contracts, connection pool management, selection strategy, and health checks.
 * - Public and shared types are managed by `types/pool.d.ts`; only runtime implementation and internal helper types are kept here.
 */

import type { MongoClient } from 'mongodb';
import { MongoClient as MongoDriverClient } from 'mongodb';
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

export type {
    ConnectionPoolManagerOptions,
    FallbackStrategy,
    PoolConfig,
    PoolHealthStatus,
    PoolRole,
    PoolStats,
    PoolStrategy,
} from '../../../types/pool';

// ─── PoolStats class (v1 compat) ─────────────────────────────────────────────────

interface PoolStatsData {
    connections: number;
    available: number;
    waiting: number;
    totalRequests: number;
    successRequests: number;
    failedRequests: number;
    totalResponseTime: number;
    avgResponseTime: number;
    errorRate: number;
}

interface BufferItem {
    poolName: string;
    type: 'selection' | 'request';
    operation?: string;
    responseTime?: number;
    success?: boolean;
    timestamp: number;
}

/**
 * Tracks per-pool connection statistics and buffers batch events.
 * @since v1.5.0
 */
export class PoolStatsManager {
    private readonly _stats = new Map<string, PoolStatsData>();
    private _buffer: BufferItem[] = [];
    private _batchInterval: ReturnType<typeof setInterval> | null;
    private readonly _logger: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; };

    constructor(options: { logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; }; } = {}) {
        this._logger = options.logger ?? console;
        this._batchInterval = setInterval(() => { this._flush(); }, 100);
        (this._batchInterval as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();
    }

    recordSelection(poolName: string, operation: string): void {
        this._buffer.push({ poolName, type: 'selection', operation, timestamp: Date.now() });
        this._flush();
    }

    async recordQuery(poolName: string, responseTime: number, error: Error | null): Promise<void> {
        this.recordRequest(poolName, responseTime, !error);
        this._flush();
    }

    recordConnections(poolName: string, count: number): void {
        let stats = this._stats.get(poolName);
        if (!stats) {
            stats = this._emptyStats();
            this._stats.set(poolName, stats);
        }
        stats.connections = count;
    }

    recordRequest(poolName: string, responseTime: number, success: boolean): void {
        this._buffer.push({ poolName, type: 'request', responseTime, success, timestamp: Date.now() });
    }

    private _flush(): void {
        if (this._buffer.length === 0) return;
        const batch = this._buffer.splice(0);
        for (const item of batch) {
            this._updateStats(item);
        }
    }

    private _updateStats(item: BufferItem): void {
        let stats = this._stats.get(item.poolName);
        if (!stats) { stats = this._emptyStats(); this._stats.set(item.poolName, stats); }
        if (item.type === 'selection') {
            // Count selections as requests so getPoolStats().totalRequests reflects pool usage
            stats.totalRequests++;
        } else if (item.type === 'request') {
            stats.totalRequests++;
            if (item.success) { stats.successRequests++; } else { stats.failedRequests++; }
            stats.totalResponseTime += item.responseTime ?? 0;
            stats.avgResponseTime = stats.totalResponseTime / stats.totalRequests;
            stats.errorRate = stats.failedRequests / stats.totalRequests;
        }
    }

    private _emptyStats(): PoolStatsData {
        return { connections: 0, available: 0, waiting: 0, totalRequests: 0, successRequests: 0, failedRequests: 0, totalResponseTime: 0, avgResponseTime: 0, errorRate: 0 };
    }

    getStats(poolName: string): PoolStatsData {
        return { ...(this._stats.get(poolName) ?? this._emptyStats()) };
    }

    getAllStats(): Record<string, PoolStatsData> {
        const result: Record<string, PoolStatsData> = {};
        for (const [poolName, stats] of this._stats.entries()) { result[poolName] = { ...stats }; }
        return result;
    }

    reset(poolName?: string): void {
        if (poolName) { this._stats.delete(poolName); } else { this._stats.clear(); }
    }

    resetAll(): void { this._stats.clear(); this._buffer = []; }

    close(): void {
        if (this._batchInterval) { clearInterval(this._batchInterval); this._batchInterval = null; }
        this._flush();
    }
}

// ─── PoolSelector class (v1 compat, bug fix) ──────────────────────────────────────

type SelectorPoolConfig = { name: string; role?: string; weight?: number; status?: string; tags?: string[]; };
type SelectorContext = { operation?: string; stats?: Record<string, { connections?: number; }>; poolPreference?: { role?: string; tags?: string[]; }; };

/**
 * Selects a connection pool from the registry using a configurable strategy
 * (auto, round-robin, least-connections, random, primary-first).
 * @since v1.5.0
 */
export class PoolSelector {
    private _strategy: string;
    private readonly _logger: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void; };
    private readonly _roundRobinIndex = new Map<string, number>();

    constructor(options: { strategy?: string; logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void; }; } = {}) {
        this._strategy = options.strategy ?? 'auto';
        this._logger = options.logger ?? console;
    }

    select(pools: SelectorPoolConfig[], context: SelectorContext): string {
        if (!pools || pools.length === 0) throw new Error('No available pools');
        switch (this._strategy) {
            case 'auto':       return this._selectByAuto(pools, context);
            case 'roundRobin': return this._selectByRoundRobin(pools, context);
            case 'leastConnections': return this._selectByLeastConnections(pools, context);
            case 'weighted':   return this._selectByWeighted(pools, context);
            case 'manual':     return pools[0].name;
            default:
                this._logger.warn?.(`[PoolSelector] Unknown strategy: ${this._strategy}, falling back to auto`);
                return this._selectByAuto(pools, context);
        }
    }

    private _selectByAuto(pools: SelectorPoolConfig[], context: SelectorContext): string {
        const { operation, poolPreference } = context;
        let candidates = pools;

        if (operation === 'read') {
            const secondaries = pools.filter(p => p.role === 'secondary');
            if (secondaries.length > 0) candidates = secondaries;
        } else if (operation === 'write') {
            const primaries = pools.filter(p => p.role === 'primary');
            if (primaries.length > 0) candidates = primaries;
        }

        if (poolPreference) {
            if (poolPreference.role) {
                const filtered = candidates.filter(p => p.role === poolPreference.role);
                if (filtered.length > 0) candidates = filtered;
            }
            if (poolPreference.tags && poolPreference.tags.length > 0) {
                const tags = poolPreference.tags;
                // multiple tags: require all tags (every); single tag: some is sufficient
                const filtered = candidates.filter(p => {
                    if (!p.tags) return false;
                    return tags.length === 1
                        ? tags.some(tag => p.tags!.includes(tag))
                        : tags.every(tag => p.tags!.includes(tag));
                });
                if (filtered.length > 0) candidates = filtered;
            }
        }

        if (candidates.length === 1) return candidates[0].name;
        return this._selectByWeighted(candidates, context);
    }

    private _selectByRoundRobin(pools: SelectorPoolConfig[], context: SelectorContext): string {
        // Apply role-based filtering (same as _selectByAuto) before round-robin selection
        let candidates = pools;
        if (context.operation === 'read') {
            const nonPrimary = pools.filter(p => p.role === 'secondary' || p.role === 'analytics');
            if (nonPrimary.length > 0) candidates = nonPrimary;
        } else if (context.operation === 'write') {
            const primaries = pools.filter(p => (p.role ?? 'primary') === 'primary');
            if (primaries.length > 0) candidates = primaries;
        }
        const key = context.operation ?? 'default';
        const index = this._roundRobinIndex.get(key) ?? 0;
        const pool = candidates[index % candidates.length];
        this._roundRobinIndex.set(key, (index + 1) % candidates.length);
        return pool.name;
    }

    private _selectByLeastConnections(pools: SelectorPoolConfig[], context: SelectorContext): string {
        const { stats } = context;
        if (!stats) return this._selectByRoundRobin(pools, context);

        let minConnections = Infinity;
        let selectedPool = pools[0];

        for (const pool of pools) {
            const poolStats = stats[pool.name];
            if (!poolStats) continue;
            const connections = poolStats.connections ?? 0;
            if (connections < minConnections) {
                minConnections = connections;
                selectedPool = pool;
            }
        }

        return selectedPool.name;
    }

    private _selectByWeighted(pools: SelectorPoolConfig[], _context: SelectorContext): string {
        let totalWeight = 0;
        for (const pool of pools) totalWeight += (pool.weight ?? 1);
        let random = Math.random() * totalWeight;
        for (const pool of pools) {
            random -= (pool.weight ?? 1);
            if (random <= 0) return pool.name;
        }
        return pools[0].name;
    }

    setStrategy(strategy: string): void {
        this._strategy = strategy;
        this._logger.info?.(`[PoolSelector] Strategy changed: ${strategy}`);
    }

    getStrategy(): string { return this._strategy; }
}

// ─── HealthChecker class (v1 compat, bug fix) ──────────────────────────────────────

interface HealthStatus {
    status: 'up' | 'down' | 'checking' | 'unknown';
    lastCheck: Date;
    consecutiveFailures: number;
    lastError?: Error | null;
}

interface HealthCheckerPoolManager {
    _getPool(name: string): { db: (name: string) => { command: (cmd: Record<string, unknown>) => Promise<unknown> }; } | null;
}

/**
 * Periodically pings each registered pool and updates health status.
 * @since v1.5.0
 */
export class HealthChecker {
    private readonly _poolManager: HealthCheckerPoolManager | null;
    private readonly _logger: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; };
    private readonly _healthStatus = new Map<string, HealthStatus>();
    private readonly _checkConfigs = new Map<string, Record<string, unknown>>();
    private readonly _clients = new Map<string, unknown>();
    private readonly _intervals = new Map<string, ReturnType<typeof setInterval>>();
    _started = false;

    constructor(options: { poolManager?: HealthCheckerPoolManager; logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; }; } = {}) {
        this._poolManager = options.poolManager ?? null;
        this._logger = options.logger ?? console;
    }

    register(poolNameOrConfig: string | Record<string, unknown>, configOrClient?: Record<string, unknown> | null | unknown): void {
        let poolName: string;
        let healthCheckConfig: Record<string, unknown>;
        let client: unknown = null;

        if (typeof poolNameOrConfig === 'string') {
            // register(poolName, config) — internal poolManager usage
            poolName = poolNameOrConfig;
            healthCheckConfig = (configOrClient as Record<string, unknown>) ?? {};
        } else {
            // register({ name, healthCheck }, client) — v1 standalone usage
            poolName = poolNameOrConfig.name as string;
            healthCheckConfig = (poolNameOrConfig.healthCheck as Record<string, unknown>) ?? {};
            client = configOrClient ?? null;
        }

        this._checkConfigs.set(poolName, healthCheckConfig);
        if (client !== null) this._clients.set(poolName, client);
        // Pool manager mode (string key): initial 'up'; standalone mode (object): initial 'unknown'
        const initialStatus: 'up' | 'down' | 'checking' | 'unknown' = typeof poolNameOrConfig === 'string' ? 'up' : 'unknown';
        this._healthStatus.set(poolName, { status: initialStatus, lastCheck: new Date(), consecutiveFailures: 0 });
        if (this._started) this._startCheckForPool(poolName, healthCheckConfig);
    }

    unregister(poolName: string): void {
        this._stopCheckForPool(poolName);
        this._healthStatus.delete(poolName);
        this._checkConfigs.delete(poolName);
        this._clients.delete(poolName);
    }

    start(): void {
        if (this._started) return;
        this._started = true;
        for (const [poolName, config] of this._checkConfigs.entries()) {
            this._startCheckForPool(poolName, config);
        }
        this._logger.info?.('[HealthChecker] Health check started');
    }

    stop(): void {
        if (!this._started) return;
        this._started = false;
        for (const poolName of this._intervals.keys()) this._stopCheckForPool(poolName);
        this._logger.info?.('[HealthChecker] Health check stopped');
    }

    /** Public single-check method (fixes v1 bug: v1 only had private _checkPool) */
    async checkPool(poolName: string): Promise<void> {
        const config = this._checkConfigs.get(poolName) ?? {};
        await this._checkPool(poolName, config);
    }

    private _startCheckForPool(poolName: string, config: Record<string, unknown>): void {
        if (config.enabled === false) return; // skip disabled pools
        this._stopCheckForPool(poolName);
        const interval = (config.interval as number) ?? 5000;
        const timer = setInterval(async () => { await this._checkPool(poolName, config); }, interval);
        (timer as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();
        this._intervals.set(poolName, timer);
        setImmediate(async () => { await this._checkPool(poolName, config); });
    }

    private _stopCheckForPool(poolName: string): void {
        const timer = this._intervals.get(poolName);
        if (timer) { clearInterval(timer); this._intervals.delete(poolName); }
    }

    private async _checkPool(poolName: string, config: Record<string, unknown>): Promise<void> {
        const status = this._healthStatus.get(poolName);
        if (!status) return;

        status.status = 'checking';
        status.lastCheck = new Date();

        const retries = (config.retries as number) ?? 3;

        // Each invocation makes ONE ping attempt; `retries` = max consecutive failures before marking down.
        // This matches the v1 test expectation: each interval tick increments consecutiveFailures by 1.
        let success = false;
        let lastError: Error | null = null;

        try {
            await this._pingPool(poolName, (config.timeout as number) ?? 3000);
            success = true;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }

        if (success) {
            status.status = 'up';
            status.consecutiveFailures = 0;
            delete status.lastError;
        } else {
            status.consecutiveFailures++;
            if (lastError) status.lastError = lastError;
            if (status.consecutiveFailures >= retries) {
                status.status = 'down';
            }
        }
    }

    private async _pingPool(poolName: string, timeout: number): Promise<void> {
        const stored = this._clients.get(poolName);
        const client = (stored ?? this._poolManager?._getPool(poolName)) as {
            db: (name: string) => { command?: (cmd: Record<string, unknown>) => Promise<unknown>; admin?: () => { ping: () => Promise<unknown> }; };
        } | null | undefined;
        if (!client) throw new Error(`No client for pool: ${poolName}`);
        const db = client.db('admin');
        const pingFn = db.command
            ? () => db.command!({ ping: 1 })
            : () => db.admin!().ping();
        const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), timeout));
        await Promise.race([pingFn(), timeoutPromise]);
    }

    private _sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

    getStatus(poolName: string): HealthStatus | null {
        return this._healthStatus.get(poolName) ?? null;
    }

    getAllStatus(): Map<string, HealthStatus> { return new Map(this._healthStatus); }
}

// ─── PoolConfig validation functions (v1 compat) ────────────────────────────────────────────

/**
 * Validates a pool configuration object and throws on the first error.
 * @param config - Raw pool configuration to validate.
 * @throws {Error} When any required field is missing or invalid.
 * @since v1.5.0
 */
export function validatePoolConfig(config: Record<string, unknown>): void {
    if (!config || typeof config !== 'object') throw new Error('Pool config must be an object');
    if (!config.name || typeof config.name !== 'string') throw new Error('Pool config.name is required and must be a string');
    if (!config.uri || typeof config.uri !== 'string') throw new Error('Pool config.uri is required and must be a string');
    if (!(config.uri as string).startsWith('mongodb://') && !(config.uri as string).startsWith('mongodb+srv://')) {
        throw new Error('Pool config.uri must start with mongodb:// or mongodb+srv://');
    }
    if (config.role) {
        const validRoles = ['primary', 'secondary', 'analytics', 'custom'];
        if (!validRoles.includes(config.role as string)) throw new Error(`Pool config.role must be one of: ${validRoles.join(', ')}`);
    }
    if (config.weight !== undefined) {
        if (typeof config.weight !== 'number') throw new Error('Pool config.weight must be a number');
        if ((config.weight as number) < 0) throw new Error('Pool config.weight must be a non-negative number');
    }
    if (config.options !== undefined) {
        if (typeof config.options !== 'object' || Array.isArray(config.options)) throw new Error('Pool config.options must be an object');
        const opts = config.options as Record<string, unknown>;
        for (const key of ['maxPoolSize', 'minPoolSize', 'maxIdleTimeMS', 'waitQueueTimeoutMS', 'connectTimeoutMS', 'serverSelectionTimeoutMS']) {
            if (opts[key] !== undefined && (typeof opts[key] !== 'number' || (opts[key] as number) < 0)) {
                throw new Error(`Pool config.options.${key} must be a non-negative number`);
            }
        }
    }
    if (config.healthCheck !== undefined) {
        if (typeof config.healthCheck !== 'object' || Array.isArray(config.healthCheck)) throw new Error('Pool config.healthCheck must be an object');
        const hc = config.healthCheck as Record<string, unknown>;
        if (hc.enabled !== undefined && typeof hc.enabled !== 'boolean') throw new Error('Pool config.healthCheck.enabled must be a boolean');
        for (const key of ['interval', 'timeout', 'retries']) {
            if (hc[key] !== undefined && (typeof hc[key] !== 'number' || (hc[key] as number) < 0)) {
                throw new Error(`Pool config.healthCheck.${key} must be a non-negative number`);
            }
        }
    }
    if (config.tags !== undefined) {
        if (!Array.isArray(config.tags)) throw new Error('Pool config.tags must be an array');
        for (const tag of config.tags as unknown[]) {
            if (typeof tag !== 'string') throw new Error('Pool config.tags must be an array of strings');
        }
    }
}

/**
 * Validates a pool configuration object and returns an array of error messages
 * instead of throwing.
 * @param config - Raw pool configuration to validate.
 * @returns Array of validation error strings; empty when valid.
 * @since v1.5.0
 */
export function validatePoolConfigSafe(config: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (!config || typeof config !== 'object') { errors.push('Pool config must be an object'); return errors; }
    if (!config.name || typeof config.name !== 'string') errors.push('Pool config.name is required and must be a string');
    if (!config.uri || typeof config.uri !== 'string') {
        errors.push('Pool config.uri is required and must be a string');
    } else if (!(config.uri as string).startsWith('mongodb://') && !(config.uri as string).startsWith('mongodb+srv://')) {
        errors.push('Pool config.uri must start with mongodb:// or mongodb+srv://');
    }
    if (config.role) {
        const validRoles = ['primary', 'secondary', 'analytics', 'custom'];
        if (!validRoles.includes(config.role as string)) errors.push(`Pool config.role must be one of: ${validRoles.join(', ')}`);
    }
    if (config.weight !== undefined && (typeof config.weight !== 'number' || (config.weight as number) < 0)) {
        errors.push('Pool config.weight must be a non-negative number');
    }
    if (config.options && typeof config.options !== 'object') errors.push('Pool config.options must be an object');
    if (config.options && typeof config.options === 'object') {
        const opts = config.options as Record<string, unknown>;
        if (opts.maxPoolSize !== undefined && (typeof opts.maxPoolSize !== 'number' || (opts.maxPoolSize as number) < 0)) {
            errors.push('Pool config.options.maxPoolSize must be a non-negative number');
        }
    }
    if (config.healthCheck) {
        if (typeof config.healthCheck !== 'object') {
            errors.push('Pool config.healthCheck must be an object');
        } else {
            const hc = config.healthCheck as Record<string, unknown>;
            if (hc.enabled !== undefined && typeof hc.enabled !== 'boolean') errors.push('Pool config.healthCheck.enabled must be a boolean');
            for (const key of ['interval', 'timeout', 'retries']) {
                if (hc[key] !== undefined && (typeof hc[key] !== 'number' || (hc[key] as number) < 0)) {
                    errors.push(`Pool config.healthCheck.${key} must be a non-negative number`);
                }
            }
        }
    }
    if (config.tags) {
        if (!Array.isArray(config.tags)) { errors.push('Pool config.tags must be an array'); }
        else { for (const tag of config.tags as unknown[]) { if (typeof tag !== 'string') { errors.push('Pool config.tags must be an array of strings'); break; } } }
    }
    return errors;
}

// ─── ConnectionPoolManager ────────────────────────────────────────────────────

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

/**
 * Manages a named set of MongoDB connection pools with health-checking,
 * statistics, and automatic failover.
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
    private readonly roundRobinIndex = new Map<string, number>();

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
        const rawFallback = (options as any).fallback ?? options.poolFallback;
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
        _validatePoolConfigInternal(config);
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
        } catch (err: any) {
            // v1 compat: ensure connection-level errors include 'connect'/'ETIMEDOUT'/'ECONNREFUSED'
            // so callers can detect network failures. MongoDB driver v6 wraps socket errors in
            // MongoServerSelectionError whose message says "Server selection timed out" without
            // the underlying network error keyword.
            const msg: string = err?.message ?? '';
            const hasNetworkKeyword = msg.includes('connect') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED');
            if (!hasNetworkKeyword && err?.name && err.name.toLowerCase().includes('mongo')) {
                const enhanced = new Error(`connect ETIMEDOUT: ${msg}`);
                enhanced.name = err.name;
                (enhanced as any).code = err.code;
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

function _validatePoolConfigInternal(config: PoolConfig): void {
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

