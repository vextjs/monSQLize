/**
 * P3-B function-cache。
 *
 * 说明：
 * - 本阶段恢复 `withCache()` 与 `FunctionCache` 的最小闭环。
 * - 更完整的多级缓存回填、分布式协同与高级监控在后续阶段继续补齐。
 */

import { createError, ErrorCodes } from '../../core/errors';
import { MemoryCache, type CacheLike } from '../cache';
import type {
    CachedFunction,
    FunctionCacheOptions,
    WithCacheOptions,
} from '../../../types/runtime';

export type {
    CachedFunction,
    FunctionCacheOptions,
    WithCacheOptions,
} from '../../../types/runtime';

interface FunctionCacheEntryStats {
    hits: number;
    misses: number;
    errors: number;
    calls: number;
    totalTime: number;
}

const inflightFunctions = new Map<string, Promise<unknown>>();

/**
 * 为异步函数创建一个带缓存能力的包装器。
 *
 * 典型用途：
 * - 为热点查询函数追加 TTL 缓存
 * - 为外部 API 请求增加并发去重
 * - 在不改动原函数签名的前提下复用 `CacheLike` 能力
 *
 * @template {unknown[]} TArgs
 * @template TResult
 * @param {(...args: TArgs) => Promise<TResult>} fn - 原始异步函数。
 * @param {WithCacheOptions} [options={}] - 缓存选项，包括 TTL、命名空间、缓存实例、keyBuilder 与条件缓存策略。
 * @returns {CachedFunction<TArgs, TResult>} 返回保持原始调用签名的缓存包装函数，并附带 `invalidate()` 与 `getCacheStats()`。
 * @throws {Error} 当 `fn` 不是函数、`ttl` 为负数，或 `keyBuilder` / `condition` 类型非法时抛出参数错误。
 * @since v1.3.0
 * @example
 * const cachedGetUser = withCache(getUser, {
 *     namespace: 'user',
 *     ttl: 60_000,
 * });
 *
 * const user = await cachedGetUser('u1');
 */
export function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: WithCacheOptions = {},
): CachedFunction<TArgs, TResult> {
    if (typeof fn !== 'function') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: fn must be a function.');
    }

    const {
        ttl = 60_000,
        namespace = 'fn',
        cache = new MemoryCache(),
        keyBuilder,
        condition,
        enableStats = true,
    } = options;

    if (ttl < 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: ttl must be a non-negative number.');
    }
    if (keyBuilder && typeof keyBuilder !== 'function') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: keyBuilder must be a function.');
    }
    if (condition && typeof condition !== 'function') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: condition must be a function.');
    }

    const stats: FunctionCacheEntryStats = {
        hits: 0,
        misses: 0,
        errors: 0,
        calls: 0,
        totalTime: 0,
    };

    const buildKey = (...args: TArgs): string => {
        const suffix = keyBuilder
            ? keyBuilder(...args)
            : `${fn.name || 'anonymous'}:${stableStringify(args)}`;
        return `${namespace}:${suffix}`;
    };

    const wrapped = (async (...args: TArgs) => {
        const startedAt = Date.now();
        const cacheKey = buildKey(...args);

        try {
            const cached = await cache.get(cacheKey);
            const exists = cached !== undefined || await Promise.resolve(cache.exists?.(cacheKey) ?? false);
            if (exists) {
                if (enableStats) {
                    stats.hits += 1;
                    stats.calls += 1;
                    stats.totalTime += Date.now() - startedAt;
                }
                return cached as TResult;
            }
        } catch {
            if (enableStats) {
                stats.errors += 1;
            }
        }

        if (inflightFunctions.has(cacheKey)) {
            const pending = inflightFunctions.get(cacheKey) as Promise<TResult>;
            const result = await pending;
            if (enableStats) {
                stats.hits += 1;
                stats.calls += 1;
                stats.totalTime += Date.now() - startedAt;
            }
            return result;
        }

        const runner = (async () => {
            try {
                const result = await fn(...args);
                const shouldCache = condition ? condition(result) : true;
                if (shouldCache) {
                    await Promise.resolve(cache.set(cacheKey, result, ttl));
                }
                return result;
            } finally {
                inflightFunctions.delete(cacheKey);
            }
        })();

        inflightFunctions.set(cacheKey, runner);

        try {
            const result = await runner;
            if (enableStats) {
                stats.misses += 1;
                stats.calls += 1;
                stats.totalTime += Date.now() - startedAt;
            }
            return result;
        } catch (cause) {
            if (enableStats) {
                stats.errors += 1;
                stats.calls += 1;
            }
            throw cause;
        }
    }) as CachedFunction<TArgs, TResult>;

    wrapped.invalidate = async (...args: TArgs) => {
        const cacheKey = buildKey(...args);
        const result = await Promise.resolve(cache.del?.(cacheKey) ?? cache.delete?.(cacheKey) ?? false);
        return typeof result === 'boolean' ? result : Number(result) > 0;
    };

    wrapped.getCacheStats = () => ({
        hits: stats.hits,
        misses: stats.misses,
        calls: stats.calls,
        hitRate: stats.calls > 0 ? stats.hits / stats.calls : 0,
        errors: stats.errors,
        avgTime: stats.calls > 0 ? stats.totalTime / stats.calls : 0,
    });

    return wrapped;
}


/**
 * 多函数缓存管理器。
 *
 * 适用于需要为一组命名业务函数统一注册、执行、统计与失效缓存的场景。
 * `cacheOrDb` 既可以是直接的 `CacheLike`，也可以是带 `getCache()` 的 runtime 实例。
 *
 * @since v1.3.0
 */
export class FunctionCache {
    private readonly cache: CacheLike;
    private readonly functions = new Map<string, CachedFunction<unknown[], unknown>>();

    constructor(
        cacheOrDb: unknown,
        private readonly options: FunctionCacheOptions = {},
    ) {
        this.cache = resolveCache(cacheOrDb);
        if ((this.options.defaultTTL ?? 60_000) < 0) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'FunctionCache: defaultTTL must be a non-negative number.');
        }
    }

    /**
     * 注册一个可缓存的异步函数。
     *
     * @template {unknown[]} TArgs
     * @template TResult
     * @param {string} name - 注册名；后续通过 `execute()` / `invalidate()` 按该名称访问。
     * @param {(...args: TArgs) => Promise<TResult>} fn - 原始异步函数。
     * @param {WithCacheOptions} [options={}] - 针对该函数的局部缓存配置。
     * @returns {void}
     * @throws {Error} 当名称为空时抛出参数错误。
     * @since v1.3.0
     */
    register<TArgs extends unknown[], TResult>(
        name: string,
        fn: (...args: TArgs) => Promise<TResult>,
        options: WithCacheOptions = {},
    ): void {
        if (!name?.trim()) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'FunctionCache.register: name must be a non-empty string.');
        }
        const cachedFn = withCache(fn, {
            ...options,
            cache: options.cache ?? this.cache,
            namespace: `${this.options.namespace ?? 'action'}:${name}`,
            ttl: options.ttl ?? this.options.defaultTTL ?? 60_000,
            enableStats: options.enableStats ?? this.options.enableStats ?? true,
        }) as CachedFunction<unknown[], unknown>;
        this.functions.set(name, cachedFn);
    }

    /**
     * 执行已注册函数。
     *
     * @param {string} name - 已注册函数名。
     * @param {...unknown[]} args - 原函数参数。
     * @returns {Promise<unknown>} 返回原函数或缓存命中的结果。
     * @throws {Error} 当函数未注册时抛出 `FUNCTION_NOT_REGISTERED`。
     * @since v1.3.0
     */
    async execute(name: string, ...args: unknown[]): Promise<unknown> {
        const fn = this.functions.get(name);
        if (!fn) {
            throw createError('FUNCTION_NOT_REGISTERED', `Function not registered: ${name}`);
        }
        return fn(...args);
    }

    /**
     * 失效某个已注册函数在指定参数下的缓存结果。
     *
     * @param {string} name - 已注册函数名。
     * @param {...unknown[]} args - 用于重建缓存键的原函数参数。
     * @returns {Promise<boolean>} 成功删除缓存时返回 `true`。
     * @throws {Error} 当函数未注册时抛出 `FUNCTION_NOT_REGISTERED`。
     * @since v1.3.0
     */
    async invalidate(name: string, ...args: unknown[]): Promise<boolean> {
        const fn = this.functions.get(name);
        if (!fn) {
            throw createError('FUNCTION_NOT_REGISTERED', `Function not registered: ${name}`);
        }
        return fn.invalidate(...args);
    }

    /**
     * 按模式批量失效当前命名空间下的缓存键。
     *
     * @param {string} pattern - 通配符模式，不包含命名空间前缀时会自动补齐。
     * @returns {Promise<number>} 实际删除的缓存键数量。
     * @throws {Error} 当模式为空时抛出参数错误。
     * @since v1.3.0
     */
    async invalidatePattern(pattern: string): Promise<number> {
        if (!pattern?.trim()) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'FunctionCache.invalidatePattern: pattern must be a non-empty string.');
        }
        return Number(await Promise.resolve(this.cache.delPattern?.(`${this.options.namespace ?? 'action'}:${pattern}`) ?? 0));
    }

    /**
     * 获取统计信息。
     *
     * @param {string} [name] - 传入时只返回某个已注册函数的统计信息；不传则返回全部。
     * @returns {Record<string, unknown>} 统计对象。
     * @since v1.3.0
     */
    getStats(name?: string): Record<string, unknown> {
        if (name) {
            const stats = this.functions.get(name)?.getCacheStats();
            return stats ? { ...stats } : {};
        }
        return Object.fromEntries(
            [...this.functions.entries()].map(([functionName, fn]) => [functionName, fn.getCacheStats()]),
        );
    }

    /**
     * 列出所有已注册函数名。
     *
     * @returns {string[]}
     * @since v1.3.0
     */
    list(): string[] {
        return [...this.functions.keys()];
    }

    /**
     * 重置一个或全部已注册函数的统计信息。
     *
     * @param {string} [name] - 传入时仅重置指定函数；否则重置全部。
     * @returns {void}
     * @since v1.3.0
     */
    resetStats(name?: string): void {
        const names = name ? [name] : [...this.functions.keys()];
        for (const functionName of names) {
            const fn = this.functions.get(functionName);
            if (!fn) {
                continue;
            }
            const replacement = withCache(async (...args: unknown[]) => fn(...args), {
                cache: this.cache,
                namespace: `${this.options.namespace ?? 'action'}:${functionName}:reset`,
                ttl: 0,
            }) as CachedFunction<unknown[], unknown>;
            replacement.invalidate = fn.invalidate;
            this.functions.set(functionName, replacement);
        }
    }

    /**
     * 清空所有已注册函数定义。
     *
     * @returns {void}
     * @since v1.3.0
     */
    clear(): void {
        this.functions.clear();
    }
}

function resolveCache(cacheOrDb: unknown): CacheLike {
    if (cacheOrDb && typeof cacheOrDb === 'object' && typeof (cacheOrDb as { getCache?: () => CacheLike; }).getCache === 'function') {
        return (cacheOrDb as { getCache: () => CacheLike; }).getCache();
    }
    if (cacheOrDb && typeof cacheOrDb === 'object' && typeof (cacheOrDb as CacheLike).get === 'function' && typeof (cacheOrDb as CacheLike).set === 'function') {
        return cacheOrDb as CacheLike;
    }
    return new MemoryCache();
}

function stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
        return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value);
}

