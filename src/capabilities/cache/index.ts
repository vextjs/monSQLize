/**
 * Cache façade.
 *
 * Description:
 * - MemoryCache wraps cache-hub's HubMemoryCache using composition, preserving the v1 public contract.
 * - Exposes the CacheLike interface, createRedisCacheAdapter, and DistributedCacheInvalidator.
 */

import { MemoryCache as HubMemoryCache } from 'cache-hub';
import { createError, ErrorCodes } from '../../core/errors';
import type { LoggerLike } from '../../core/logger';
import type {
    CacheLike,
    CacheLockLike,
    CacheStats,
    MemoryCacheOptions,
    RedisCacheAdapterOptions,
} from '../../../types/runtime';

export type {
    CacheLike,
    CacheLockLike,
    CacheStats,
    MemoryCacheOptions,
    RedisCacheAdapterOptions,
} from '../../../types/runtime';

interface RedisLike {
    get(key: string): Promise<string | null> | string | null;
    pttl?(key: string): Promise<number> | number;
    set(key: string, value: string): Promise<unknown> | unknown;
    psetex?(key: string, ttl: number, value: string): Promise<unknown> | unknown;
    del(...keys: string[]): Promise<number> | number;
    exists(key: string): Promise<number | boolean> | number | boolean;
    mget?(keys: string[]): Promise<Array<string | null>> | Array<string | null>;
    scan?(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]> | [string, string[]];
    flushdb?(): Promise<unknown> | unknown;
    quit?(): Promise<unknown> | unknown;
    on?(event: string, handler: (...args: unknown[]) => void): void;
    publish?(channel: string, message: string): Promise<unknown> | unknown;
    subscribe?(channel: string, handler?: (error?: Error | null) => void): Promise<unknown> | unknown;
    unsubscribe?(channel: string): Promise<unknown> | unknown;
    pipeline?(): {
        get(key: string): unknown;
        pttl(key: string): unknown;
        set(key: string, value: string): unknown;
        psetex(key: string, ttl: number, value: string): unknown;
        exec(): Promise<Array<[unknown, unknown]>> | Array<[unknown, unknown]>;
    };
}

/**
 * In-memory L1 cache implementation.
 *
 * Use cases:
 * - Local hot-path query caching
 * - Default cache backend for `withCache()` / `FunctionCache`
 * - Lightweight scenarios requiring TTL, LRU, or wildcard bulk invalidation
 *
 * Implementation: wraps cache-hub's MemoryCache engine using composition,
 * maintaining the full v1 public contract (setLockManager/getLockManager/
 * getStats.calls/set returns boolean, etc.).
 *
 * @implements {CacheLike}
 * @since v1.3.0
 */
export class MemoryCache implements CacheLike {
    private readonly _hub: HubMemoryCache;
    private _lockManager: CacheLockLike | null = null;
    private _calls = 0;

    constructor(options: MemoryCacheOptions = {}) {
        const { maxSize, ...rest } = options as MemoryCacheOptions & { maxSize?: number };
        this._hub = new HubMemoryCache({
            ...rest,
            // v1 uses maxSize, cache-hub uses maxEntries — map for compat
            maxEntries: (rest as Record<string, unknown>).maxEntries as number | undefined ?? maxSize,
        });
    }

    /**
     * Set the cache lock manager.
     * @since v1.3.0
     */
    setLockManager(lockManager: CacheLockLike | null): void {
        this._lockManager = lockManager;
    }

    /**
     * Get the cache lock manager.
     * @since v1.3.0
     */
    getLockManager(): CacheLockLike | null {
        return this._lockManager;
    }

    /**
     * Get a cached value. Every call is counted in `calls` stats.
     * @since v1.3.0
     */
    get(key: string): unknown {
        this._calls += 1;
        return this._hub.get(key);
    }

    /**
     * Write a cached value. Returns false if the key is locked by the lock manager.
     * @since v1.3.0
     */
    set(key: string, value: unknown, ttl = 0): boolean {
        if (this._lockManager?.isLocked(key)) {
            return false;
        }
        this._hub.set(key, value, ttl);
        return true;
    }

    /**
     * Delete a cached value.
     * @since v1.3.0
     */
    delete(key: string): boolean {
        return this._hub.del(key);
    }

    /**
     * Alias for `delete()`.
     * @since v1.3.0
     */
    del(key: string): boolean {
        return this.delete(key);
    }

    /**
     * Check whether a cache key exists (also counted in calls stats).
     * @since v1.3.0
     */
    exists(key: string): boolean {
        return this._hub.exists(key);
    }

    /**
     * Read multiple cache entries (each key is counted in calls stats).
     * @since v1.3.0
     */
    getMany(keys: string[]): Record<string, unknown> {
        const output: Record<string, unknown> = {};
        for (const key of keys) {
            const value = this.get(key);
            if (value !== undefined) {
                output[key] = value;
            }
        }
        return output;
    }

    /**
     * Write multiple cache entries (each key is checked against the lock manager).
     * @since v1.3.0
     */
    setMany(values: Record<string, unknown>, ttl = 0): boolean {
        for (const [key, value] of Object.entries(values)) {
            this.set(key, value, ttl);
        }
        return true;
    }

    /**
     * Delete multiple cache entries.
     * @since v1.3.0
     */
    delMany(keys: string[]): number {
        let deleted = 0;
        for (const key of keys) {
            if (this.delete(key)) {
                deleted += 1;
            }
        }
        return deleted;
    }

    /**
     * Clear the cache.
     * @since v1.3.0
     */
    clear(): void {
        this._hub.clear();
    }

    /**
     * List cache keys matching a wildcard pattern.
     * @since v1.3.0
     */
    keys(pattern = '*'): string[] {
        return this._hub.keys(pattern);
    }

    /**
     * Delete cache keys matching a wildcard pattern.
     * @since v1.3.0
     */
    delPattern(pattern = '*'): number {
        return this._hub.delPattern(pattern);
    }

    /**
     * Get cache statistics (including the `calls` field required by v1).
     * @since v1.3.0
     */
    getStats(): CacheStats {
        const s = this._hub.getStats();
        const calls = this._calls;
        return {
            hits: s.hits,
            misses: s.misses,
            calls,
            hitRate: calls > 0 ? s.hits / calls : 0,
            sets: s.sets,
            deletes: s.deletes,
            evictions: s.evictions,
            size: s.entries,
            memoryUsage: s.memoryUsage,
            memoryUsageMB: s.memoryUsageMB,
        };
    }

    /**
     * Reset cache statistics (including calls).
     * @since v1.3.0
     */
    resetStats(): void {
        this._hub.resetStats();
        this._calls = 0;
    }

    /**
     * Get or create a cache instance.
     * @since v1.3.0
     */
    static getOrCreateCache(cache?: Record<string, unknown> | MemoryCache): MemoryCache {
        return cache instanceof MemoryCache ? cache : new MemoryCache(cache as MemoryCacheOptions);
    }
}

/**
 * Create a Redis adapter that conforms to the `CacheLike` contract.
 *
 * Primary use cases:
 * - Provide L2 remote cache capability to `MemoryCache`
 * - Supply a shareable cache backend for `withCache()` / `FunctionCache`
 * - Combine with `DistributedCacheInvalidator` to achieve cross-instance cache invalidation
 *
 * @param {string | RedisLike | RedisCacheAdapterOptions} redisUrlOrInstance - A Redis URL, an existing client instance, or an adapter config object containing `client` / `prefix`.
 * @param {Record<string, unknown>} [adapterOptions={}] - Additional adapter options; can supply `prefix` and similar fields when the first argument is a URL or config object.
 * @returns {CacheLike & { getRedisInstance(): RedisLike; }} A Redis adapter implementing `CacheLike`, with the underlying Redis instance exposed.
 * @throws {Error} When the underlying client does not support `scan()` and `keys()` / `delPattern()` is called.
 * @since v1.3.0
 */
export function createRedisCacheAdapter(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions: Record<string, unknown> = {},
): CacheLike & { getRedisInstance(): RedisLike; } {
    const { client, prefix, ownsConnection } = resolveRedisClient(redisUrlOrInstance, adapterOptions);
    const withPrefix = (key: string) => `${prefix}${key}`;
    const stripPrefix = (key: string) => key.startsWith(prefix) ? key.slice(prefix.length) : key;

    const getValue = async (key: string) => {
        const value = await Promise.resolve(client.get(withPrefix(key)));
        if (value === null || value === undefined) {
            return null;
        }
        try {
            return JSON.parse(String(value));
        } catch {
            return null;
        }
    };

    const keysFn = async (pattern = '*') => {
        const prefixedPattern = withPrefix(pattern);
        const keys: string[] = [];
        if (client.scan) {
            let cursor = '0';
            do {
                const [nextCursor, foundKeys] = await Promise.resolve(client.scan(cursor, 'MATCH', prefixedPattern, 'COUNT', 100));
                cursor = nextCursor;
                keys.push(...foundKeys.map(stripPrefix));
            } while (cursor !== '0');
            return keys;
        }

        throw createError(ErrorCodes.INVALID_CONFIG, 'Redis cache adapter requires scan() support for keys().');
    };

    const delManyFn = async (keys: string[]) => {
        if (keys.length === 0) {
            return 0;
        }
        return Number(await Promise.resolve(client.del(...keys.map(withPrefix))));
    };

    return {
        get: getValue,
        async set(key: string, value: unknown, ttl = 0) {
            const payload = JSON.stringify(value);
            if (ttl > 0 && client.psetex) {
                await Promise.resolve(client.psetex(withPrefix(key), ttl, payload));
            } else {
                await Promise.resolve(client.set(withPrefix(key), payload));
            }
            return true;
        },
        async del(key: string) {
            const deleted = await Promise.resolve(client.del(withPrefix(key)));
            return Number(deleted) > 0;
        },
        async delete(key: string) {
            const deleted = await Promise.resolve(client.del(withPrefix(key)));
            return Number(deleted) > 0;
        },
        async exists(key: string) {
            const exists = await Promise.resolve(client.exists(withPrefix(key)));
            return typeof exists === 'boolean' ? exists : Number(exists) > 0;
        },
        async getMany(keys: string[]) {
            const values: Record<string, unknown> = {};
            if (keys.length === 0) {
                return values;
            }

            if (client.mget) {
                const response = await Promise.resolve(client.mget(keys.map(withPrefix)));
                keys.forEach((key, index) => {
                    const raw = response[index];
                    if (raw === null || raw === undefined) {
                        return;
                    }
                    try {
                        values[key] = JSON.parse(String(raw));
                    } catch {
                        // ignore broken value
                    }
                });
                return values;
            }

            for (const key of keys) {
                const value = await getValue(key);
                if (value !== undefined) {
                    values[key] = value;
                }
            }
            return values;
        },
        async setMany(values: Record<string, unknown>, ttl = 0) {
            for (const [key, value] of Object.entries(values)) {
                await this.set(key, value, ttl);
            }
            return true;
        },
        delMany: delManyFn,
        async delPattern(pattern: string) {
            const keys = await keysFn(pattern);
            return delManyFn(keys);
        },
        async clear() {
            if (client.flushdb) {
                await Promise.resolve(client.flushdb());
            } else {
                const keys = await keysFn('*');
                await delManyFn(keys);
            }
        },
        keys: keysFn,
        async close() {
            if (ownsConnection && client.quit) {
                await Promise.resolve(client.quit());
            }
        },
        getRedisInstance() {
            return client;
        },
    };
}

/**
 * Options for {@link DistributedCacheInvalidator}.
 * Supports both a shared Redis connection and separate pub/sub connections.
 */
export interface DistributedCacheInvalidatorOptions {
    cache?: CacheLike | { local?: CacheLike; remote?: CacheLike; };
    channel?: string;
    instanceId?: string;
    logger?: LoggerLike | null;
    /** v1 compat: pass an existing Redis instance (pub/sub share the same connection) */
    redis?: RedisLike;
    /** v1 compat: create a dedicated pub/sub connection from a URL (requires ioredis) */
    redisUrl?: string;
    /** Legacy API: explicitly specify the pub connection */
    pub?: RedisLike;
    /** Legacy API: explicitly specify the sub connection */
    sub?: RedisLike;
}

/**
 * Distributed cache invalidation coordinator.
 *
 * Implements cross-instance cache invalidation notifications via Redis Pub/Sub,
 * suitable for cache consistency control in multi-instance deployments.
 *
 * @since v1.3.0
 */
export class DistributedCacheInvalidator {
    channel: string;
    instanceId: string;
    private logger?: LoggerLike | null;
    private local?: CacheLike;
    private remote?: CacheLike;
    pub?: RedisLike;
    sub?: RedisLike;
    private _ownsConnections: boolean = false;
    private stats = {
        messagesSent: 0,
        messagesReceived: 0,
        invalidationsTriggered: 0,
        errors: 0,
    };

    constructor(options: DistributedCacheInvalidatorOptions = {}) {
        if (!options.cache) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires a cache instance');
        }

        this.channel = options.channel ?? 'monsqlize:cache:invalidate';
        this.instanceId = options.instanceId ?? `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.logger = options.logger;

        const cache = options.cache as Record<string, unknown>;
        if ('local' in cache || 'remote' in cache) {
            const scopedCache = options.cache as { local?: CacheLike; remote?: CacheLike; };
            this.local = scopedCache.local;
            this.remote = scopedCache.remote;
        } else {
            this.local = options.cache as CacheLike;
        }

        if (options.redis) {
            // v1 API: use same instance for pub/sub (test-friendly: mockRedis === both)
            this.pub = options.redis;
            this.sub = options.redis;
            this._ownsConnections = false;
        } else if (options.redisUrl) {
            // v1 API: create independent connections via URL
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const IoRedis = require('ioredis');
            this.pub = new IoRedis(options.redisUrl) as RedisLike;
            this.sub = new IoRedis(options.redisUrl) as RedisLike;
            this._ownsConnections = true;
        } else {
            // legacy API: explicit pub/sub
            this.pub = options.pub;
            this.sub = options.sub;
        }

        if (this.pub && this.pub.on) {
            this.pub.on('error', (err: unknown) => {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Redis pub error:', (err as Error).message);
            });
        }
        if (this.sub && this.sub !== this.pub && this.sub.on) {
            this.sub.on('error', (err: unknown) => {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Redis sub error:', (err as Error).message);
            });
        }

        if (this.sub) {
            this._setupSubscription();
        }
    }

    private _setupSubscription(): void {
        this.sub!.subscribe!(this.channel, (err?: Error | null) => {
            if (err) {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Subscribe error:', err.message);
            } else {
                this.logger?.info?.(`[DistributedCacheInvalidator] Subscribed to channel: ${this.channel}`);
            }
        });

        this.sub!.on!('message', async (channel: unknown, message: unknown) => {
            if (channel !== this.channel) return;
            this.stats.messagesReceived++;
            try {
                const data = JSON.parse(message as string) as { type?: string; pattern?: string; instanceId?: string; };
                if (data.instanceId === this.instanceId) return;
                if (data.type === 'invalidate' && data.pattern) {
                    await this._handleInvalidation(data.pattern);
                }
            } catch (error) {
                this.stats.errors++;
                this.logger?.error?.('[DistributedCacheInvalidator] Message parse error:', (error as Error).message);
            }
        });
    }

    private async _handleInvalidation(pattern: string): Promise<void> {
        try {
            if (this.local?.delPattern) {
                const localDeleted = Number(await Promise.resolve(this.local.delPattern(pattern)));
                this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated local cache: ${pattern}, deleted: ${localDeleted} keys`);
            }
            if (this.remote?.delPattern) {
                const remoteDeleted = Number(await Promise.resolve(this.remote.delPattern(pattern)));
                this.logger?.debug?.(`[DistributedCacheInvalidator] Invalidated remote cache: ${pattern}, deleted: ${remoteDeleted} keys`);
            }
            this.stats.invalidationsTriggered++;
        } catch (error) {
            this.stats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Invalidation error:', (error as Error).message);
        }
    }

    /**
     * Broadcast a cache invalidation message to other instances.
     * Only publishes — local cache of the sending instance is NOT cleared here.
     * (Cache clearing happens in _handleInvalidation when OTHER instances receive the message.)
     */
    async invalidate(pattern: string): Promise<void> {
        if (!pattern) return;

        // Clear local and remote caches immediately on the sending instance
        await this._handleInvalidation(pattern);

        // Only broadcast via Redis if a pub connection is configured
        if (!this.pub) return;

        const message = JSON.stringify({
            type: 'invalidate',
            pattern,
            instanceId: this.instanceId,
            timestamp: Date.now(),
        });

        try {
            await Promise.resolve(this.pub.publish!(this.channel, message));
            this.stats.messagesSent++;
            this.logger?.debug?.(`[DistributedCacheInvalidator] Published invalidation: ${pattern}`);
        } catch (error) {
            this.stats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Publish error:', (error as Error).message);
            throw error;
        }
    }

    /**
     * Manually handle a message from the subscription channel (for external message routing).
     */
    async handleMessage(channel: string, message: string): Promise<void> {
        if (channel !== this.channel) return;
        this.stats.messagesReceived++;
        try {
            const data = JSON.parse(message) as { type?: string; pattern?: string; instanceId?: string; };
            if (data.instanceId === this.instanceId || data.type !== 'invalidate' || !data.pattern) return;
            await this._handleInvalidation(data.pattern);
        } catch (cause) {
            this.stats.errors++;
            this.logger?.error?.('[DistributedCacheInvalidator] Failed to parse message', cause);
        }
    }

    getStats(): Record<string, unknown> {
        return {
            ...this.stats,
            channel: this.channel,
            instanceId: this.instanceId,
        };
    }

    async close(): Promise<void> {
        try {
            if (this.sub?.unsubscribe) {
                await Promise.resolve(this.sub.unsubscribe(this.channel));
            }
            if (this.pub?.quit) {
                await Promise.resolve(this.pub.quit());
            }
            if (this.sub?.quit) {
                await Promise.resolve(this.sub.quit());
            }
            this.logger?.info?.('[DistributedCacheInvalidator] Closed');
        } catch (error) {
            this.logger?.error?.('[DistributedCacheInvalidator] Close error:', (error as Error).message);
        }
    }
}
function resolveRedisClient(
    redisUrlOrInstance: string | RedisLike | RedisCacheAdapterOptions,
    adapterOptions: Record<string, unknown>,
): { client: RedisLike; prefix: string; ownsConnection: boolean; } {
    if (typeof redisUrlOrInstance === 'string') {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const IORedis = require('ioredis');
            return {
                client: new IORedis(redisUrlOrInstance),
                prefix: String(adapterOptions.prefix ?? ''),
                ownsConnection: true,
            };
        } catch {
            throw createError(ErrorCodes.INVALID_CONFIG, 'ioredis is required to create a Redis cache adapter from URL.');
        }
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object' && 'client' in redisUrlOrInstance && (redisUrlOrInstance as RedisCacheAdapterOptions).client) {
        const options = redisUrlOrInstance as RedisCacheAdapterOptions;
        return {
            client: options.client as RedisLike,
            prefix: String(options.prefix ?? ''),
            ownsConnection: false,
        };
    }

    if (redisUrlOrInstance && typeof redisUrlOrInstance === 'object') {
        return {
            client: redisUrlOrInstance as RedisLike,
            prefix: String(adapterOptions.prefix ?? ''),
            ownsConnection: false,
        };
    }

    throw createError(ErrorCodes.INVALID_ARGUMENT, 'redisUrlOrInstance must be a Redis URL string or Redis client instance.');
}


