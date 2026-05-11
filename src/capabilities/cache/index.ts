/**
 * P3-A cache façade。
 *
 * 说明：
 * - 本阶段恢复 MemoryCache、Redis cache adapter 与最小 distributed invalidator。
 * - function-cache、transaction/lock 主体与更完整多级缓存策略在后续阶段继续回补。
 */

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
 * 基于内存的 L1 缓存实现。
 *
 * 适用场景：
 * - 本地热点查询缓存
 * - `withCache()` / `FunctionCache` 的默认缓存后端
 * - 需要按 TTL、LRU 或通配符批量失效的轻量场景
 *
 * @implements {CacheLike}
 * @since v1.3.0
 */
export class MemoryCache implements CacheLike {
    private readonly store = new Map<string, { value: unknown; size: number; expireAt: number | null; }>();
    private lockManager: CacheLockLike | null = null;
    private readonly stats = {
        hits: 0,
        misses: 0,
        calls: 0,
        sets: 0,
        deletes: 0,
        evictions: 0,
        memoryUsage: 0,
    };

    constructor(private readonly options: MemoryCacheOptions = {}) {}

    /**
     * 设置缓存锁管理器。
     * @since v1.3.0
     */
    setLockManager(lockManager: CacheLockLike | null): void {
        this.lockManager = lockManager;
    }

    /**
     * 获取缓存锁管理器。
     * @since v1.3.0
     */
    getLockManager(): CacheLockLike | null {
        return this.lockManager;
    }

    /**
     * 获取缓存值。
     * @since v1.3.0
     */
    get(key: string): unknown {
        this.stats.calls += 1;
        const entry = this.store.get(key);
        if (!entry) {
            this.stats.misses += 1;
            return undefined;
        }

        if (entry.expireAt !== null && entry.expireAt <= Date.now()) {
            this.delete(key);
            this.stats.misses += 1;
            return undefined;
        }

        this.store.delete(key);
        this.store.set(key, entry);
        this.stats.hits += 1;
        return entry.value;
    }

    /**
     * 写入缓存值。
     * @since v1.3.0
     */
    set(key: string, value: unknown, ttl = 0): boolean {
        if (this.lockManager?.isLocked(key)) {
            return false;
        }

        const existing = this.store.get(key);
        if (existing) {
            this.stats.memoryUsage -= existing.size;
            this.store.delete(key);
        }

        const entry = {
            value,
            size: estimateEntrySize(key, value),
            expireAt: ttl > 0 ? Date.now() + ttl : null,
        };
        this.store.set(key, entry);
        this.stats.sets += 1;
        this.stats.memoryUsage += entry.size;
        this.enforceLimits();
        return true;
    }

    /**
     * 删除缓存值。
     * @since v1.3.0
     */
    delete(key: string): boolean {
        const entry = this.store.get(key);
        if (!entry) {
            return false;
        }
        this.store.delete(key);
        this.stats.deletes += 1;
        this.stats.memoryUsage -= entry.size;
        return true;
    }

    /**
     * `del()` 兼容别名。
     * @since v1.3.0
     */
    del(key: string): boolean {
        return this.delete(key);
    }

    /**
     * 检查缓存键是否存在。
     * @since v1.3.0
     */
    exists(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * 批量读取缓存。
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
     * 批量写入缓存。
     * @since v1.3.0
     */
    setMany(values: Record<string, unknown>, ttl = 0): boolean {
        for (const [key, value] of Object.entries(values)) {
            this.set(key, value, ttl);
        }
        return true;
    }

    /**
     * 批量删除缓存。
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
     * 清空缓存。
     * @since v1.3.0
     */
    clear(): void {
        this.store.clear();
        this.stats.memoryUsage = 0;
    }

    /**
     * 按通配符列出缓存键。
     * @since v1.3.0
     */
    keys(pattern = '*'): string[] {
        const matcher = createWildcardMatcher(pattern);
        return [...this.store.keys()].filter((key) => matcher.test(key));
    }

    /**
     * 按通配符删除缓存键。
     * @since v1.3.0
     */
    delPattern(pattern = '*'): number {
        return this.delMany(this.keys(pattern));
    }

    /**
     * 获取缓存统计信息。
     * @since v1.3.0
     */
    getStats(): CacheStats {
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            calls: this.stats.calls,
            hitRate: this.stats.calls > 0 ? this.stats.hits / this.stats.calls : 0,
            sets: this.stats.sets,
            deletes: this.stats.deletes,
            evictions: this.stats.evictions,
            size: this.store.size,
            memoryUsage: this.stats.memoryUsage,
            memoryUsageMB: this.stats.memoryUsage / (1024 * 1024),
        };
    }

    /**
     * 重置缓存统计信息。
     * @since v1.3.0
     */
    resetStats(): void {
        this.stats.hits = 0;
        this.stats.misses = 0;
        this.stats.calls = 0;
        this.stats.sets = 0;
        this.stats.deletes = 0;
        this.stats.evictions = 0;
    }

    /**
     * 获取或创建缓存实例。
     * @since v1.3.0
     */
    static getOrCreateCache(cache?: Record<string, unknown> | MemoryCache): MemoryCache {
        return cache instanceof MemoryCache ? cache : new MemoryCache(cache as MemoryCacheOptions);
    }

    private enforceLimits(): void {
        const maxSize = this.options.maxSize ?? 100000;
        while (this.store.size > maxSize) {
            const oldestKey = this.store.keys().next().value;
            if (!oldestKey) {
                break;
            }
            this.delete(oldestKey);
            this.stats.evictions += 1;
        }

        const maxMemory = this.options.maxMemory ?? 0;
        if (maxMemory > 0) {
            while (this.stats.memoryUsage > maxMemory) {
                const oldestKey = this.store.keys().next().value;
                if (!oldestKey) {
                    break;
                }
                this.delete(oldestKey);
                this.stats.evictions += 1;
            }
        }
    }
}

/**
 * 创建一个符合 `CacheLike` 契约的 Redis 适配器。
 *
 * 该适配器主要用于：
 * - 为 `MemoryCache` 提供 L2 远端缓存能力
 * - 给 `withCache()` / `FunctionCache` 提供可共享的缓存后端
 * - 与 `DistributedCacheInvalidator` 组合实现跨实例缓存失效
 *
 * @param {string | RedisLike | RedisCacheAdapterOptions} redisUrlOrInstance - Redis URL、现有客户端实例，或包含 `client/prefix` 的适配器配置。
 * @param {Record<string, unknown>} [adapterOptions={}] - 附加适配器选项；当首参是 URL 或配置对象时，可用于补充 `prefix` 等信息。
 * @returns {CacheLike & { getRedisInstance(): RedisLike; }} 返回实现了 `CacheLike` 的 Redis 适配器，并暴露底层 Redis 实例。
 * @throws {Error} 当底层客户端不支持 `scan()` 且调用 `keys()` / `delPattern()` 时抛出配置错误。
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
            return undefined;
        }
        try {
            return JSON.parse(String(value));
        } catch {
            return undefined;
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

export interface DistributedCacheInvalidatorOptions {
    cache?: CacheLike | { local?: CacheLike; remote?: CacheLike; };
    channel?: string;
    instanceId?: string;
    logger?: LoggerLike | null;
    pub?: RedisLike;
    sub?: RedisLike;
}

/**
 * 分布式缓存失效协调器。
 *
 * 负责将本地缓存失效动作扩展为“本地清理 + 广播通知 + 远端实例消费消息”，
 * 适用于多实例部署下的缓存一致性控制。
 *
 * @since v1.3.0
 */
export class DistributedCacheInvalidator {
    private readonly channel: string;
    private readonly instanceId: string;
    private readonly logger?: LoggerLike | null;
    private readonly local?: CacheLike;
    private readonly remote?: CacheLike;
    private readonly pub?: RedisLike;
    private readonly sub?: RedisLike;
    private readonly stats = {
        messagesSent: 0,
        messagesReceived: 0,
        invalidationsTriggered: 0,
        errors: 0,
    };

    constructor(options: DistributedCacheInvalidatorOptions = {}) {
        if (!options.cache) {
            throw createError(ErrorCodes.INVALID_CONFIG, 'DistributedCacheInvalidator requires a cache instance.');
        }

        this.channel = options.channel ?? 'monsqlize:cache:invalidate';
        this.instanceId = options.instanceId ?? `instance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.logger = options.logger;
        if ('local' in (options.cache as object) || 'remote' in (options.cache as object)) {
            const scopedCache = options.cache as { local?: CacheLike; remote?: CacheLike; };
            this.local = scopedCache.local;
            this.remote = scopedCache.remote;
        } else {
            this.local = options.cache as CacheLike;
        }
        this.pub = options.pub;
        this.sub = options.sub;
    }

    /**
     * 按模式触发缓存失效，并在配置了 `pub.publish()` 时向其他实例广播消息。
     *
     * @param {string} pattern - 通配符模式；为空时直接忽略。
     * @returns {Promise<void>}
     * @since v1.3.0
     */
    async invalidate(pattern: string): Promise<void> {
        if (!pattern) {
            return;
        }

        await this.invalidateCache(pattern);

        if (this.pub?.publish) {
            await Promise.resolve(this.pub.publish(this.channel, JSON.stringify({
                type: 'invalidate',
                pattern,
                instanceId: this.instanceId,
                timestamp: Date.now(),
            })));
            this.stats.messagesSent += 1;
        }
    }

    /**
     * 处理来自订阅通道的广播消息。
     *
     * 仅当消息：
     * - 来自当前通道
     * - 类型为 `invalidate`
     * - 且不是本实例自己发送
     * 时才会触发本地失效。
     *
     * @param {string} channel - 收到消息的通道名。
     * @param {string} message - JSON 字符串消息体。
     * @returns {Promise<void>}
     * @since v1.3.0
     */
    async handleMessage(channel: string, message: string): Promise<void> {
        if (channel !== this.channel) {
            return;
        }
        this.stats.messagesReceived += 1;
        try {
            const data = JSON.parse(message) as { type?: string; pattern?: string; instanceId?: string; };
            if (data.instanceId === this.instanceId || data.type !== 'invalidate' || !data.pattern) {
                return;
            }
            await this.invalidateCache(data.pattern);
        } catch (cause) {
            this.stats.errors += 1;
            this.logger?.error?.('[DistributedCacheInvalidator] Failed to parse message', cause);
        }
    }

    /**
     * 返回当前失效协调器的运行统计。
     *
     * @returns {Record<string, unknown>} 包含消息收发次数、触发次数、错误数、通道与实例标识。
     * @since v1.3.0
     */
    getStats(): Record<string, unknown> {
        return {
            ...this.stats,
            channel: this.channel,
            instanceId: this.instanceId,
        };
    }

    /**
     * 关闭分布式失效器。
     * @since v1.3.0
     */
    async close(): Promise<void> {
        if (this.sub?.unsubscribe) {
            await Promise.resolve(this.sub.unsubscribe(this.channel));
        }
        if (this.pub?.quit) {
            await Promise.resolve(this.pub.quit());
        }
        if (this.sub && this.sub !== this.pub && this.sub.quit) {
            await Promise.resolve(this.sub.quit());
        }
    }

    private async invalidateCache(pattern: string): Promise<void> {
        let deleted = 0;
        if (this.local?.delPattern) {
            deleted += Number(await Promise.resolve(this.local.delPattern(pattern)));
        }
        if (this.remote?.delPattern) {
            deleted += Number(await Promise.resolve(this.remote.delPattern(pattern)));
        }
        this.stats.invalidationsTriggered += 1;
        this.logger?.debug?.('[DistributedCacheInvalidator] invalidate', { pattern, deleted });
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

function estimateEntrySize(key: string, value: unknown): number {
    const keySize = key.length * 2;
    let valueSize = 8;
    if (typeof value === 'string') {
        valueSize = value.length * 2;
    } else if (typeof value === 'object' && value !== null) {
        try {
            valueSize = JSON.stringify(value).length * 2;
        } catch {
            valueSize = 100;
        }
    }
    return keySize + valueSize;
}

function createWildcardMatcher(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
        .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
}

