/**
 * Function cache decorator.
 *
 * Description:
 * - Provides the withCache() decorator and FunctionCache class to add a cache layer to async functions.
 * - Supports custom TTL, namespace, keyBuilder, conditional hits, and call statistics.
 */

import { createHash } from 'node:crypto';
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
 * Create a cache-enabled wrapper for an async function.
 *
 * Typical use cases:
 * - Attach TTL caching to hot-path query functions
 * - Add in-flight deduplication for external API requests
 * - Reuse `CacheLike` without modifying the original function signature
 *
 * @template {unknown[]} TArgs
 * @template TResult
 * @param {(...args: TArgs) => Promise<TResult>} fn - The original async function.
 * @param {WithCacheOptions} [options={}] - Cache options including TTL, namespace, cache instance, keyBuilder, and conditional caching strategy.
 * @returns {CachedFunction<TArgs, TResult>} Returns a cache-wrapped function with the same signature, plus `invalidate()` and `getCacheStats()`.
 * @throws {Error} When `fn` is not a function, `ttl` is negative, or `keyBuilder` / `condition` has an invalid type.
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

    if (typeof ttl !== 'number' || ttl < 0) {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: ttl must be a non-negative number.');
    }
    if (keyBuilder && typeof keyBuilder !== 'function') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: keyBuilder must be a function.');
    }
    if (condition && typeof condition !== 'function') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: condition must be a function.');
    }
    if (typeof (cache as CacheLike).get !== 'function' || typeof (cache as CacheLike).set !== 'function') {
        throw createError(ErrorCodes.INVALID_ARGUMENT, 'withCache: Invalid cache instance: must implement CacheLike interface');
    }

    const stats: FunctionCacheEntryStats = {
        hits: 0,
        misses: 0,
        errors: 0,
        calls: 0,
        totalTime: 0,
    };


    const wrapped = (async (...args: TArgs) => {
        const startedAt = Date.now();

        // 1. Build cache key — failures fall back to direct execution (no caching)
        let cacheKey: string;
        try {
            const baseKey = keyBuilder
                ? `${namespace}:${keyBuilder(...args)}`
                : `${namespace}:${fn.name || 'anonymous'}:${stableStringify(args)}`;
            if (baseKey.length > 1024) {
                const hash = createHash('sha256').update(baseKey).digest('hex');
                cacheKey = `${namespace}:${fn.name || 'anonymous'}:hash:${hash}`;
            } else {
                cacheKey = baseKey;
            }
        } catch {
            if (enableStats) stats.errors += 1;
            return fn(...args);
        }

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
                let shouldCache = true;
                if (condition) {
                    try {
                        shouldCache = condition(result);
                    } catch {
                        if (enableStats) stats.errors += 1;
                        shouldCache = true;
                    }
                }
                if (shouldCache) {
                    try {
                        await Promise.resolve(cache.set(cacheKey, result, ttl));
                    } catch {
                        if (enableStats) stats.errors += 1;
                    }
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
        let cacheKey: string;
        try {
            const baseKey = keyBuilder
                ? `${namespace}:${keyBuilder(...args)}`
                : `${namespace}:${fn.name || 'anonymous'}:${stableStringify(args)}`;
            if (baseKey.length > 1024) {
                const hash = createHash('sha256').update(baseKey).digest('hex');
                cacheKey = `${namespace}:${fn.name || 'anonymous'}:hash:${hash}`;
            } else {
                cacheKey = baseKey;
            }
        } catch {
            return false;
        }
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
 * Multi-function cache manager.
 *
 * Suitable for scenarios that need unified registration, execution, statistics, and cache invalidation for a set of named business functions.
 * `cacheOrDb` can be either a direct `CacheLike` or a runtime instance with `getCache()`.
 *
 * @since v1.3.0
 */
export class FunctionCache {
    private readonly cache: CacheLike;
    private readonly options: FunctionCacheOptions;
    private readonly functions = new Map<string, CachedFunction<unknown[], unknown>>();

    constructor(
        cacheOrDb: unknown,
        options: FunctionCacheOptions = {},
    ) {
        if (options !== null && typeof options !== 'object') {
            throw new Error('options must be an object');
        }
        const namespace = (options as Record<string, unknown>).namespace;
        if (namespace !== undefined && typeof namespace !== 'string') {
            throw new Error('namespace must be a string');
        }
        this.options = options as FunctionCacheOptions;
        this.cache = resolveCache(cacheOrDb);
        if ((this.options.defaultTTL ?? 60_000) < 0) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'FunctionCache: defaultTTL must be a non-negative number.');
        }
    }

    /**
     * Register a cacheable async function.
     *
     * @template {unknown[]} TArgs
     * @template TResult
     * @param {string} name - Registration name; accessed later via `execute()` / `invalidate()`.
     * @param {(...args: TArgs) => Promise<TResult>} fn - The original async function.
     * @param {WithCacheOptions} [options={}] - Per-function local cache configuration.
     * @returns {void}
     * @throws {Error} Throws an argument error when the name is empty.
     * @since v1.3.0
     */
    register<TArgs extends unknown[], TResult>(
        name: string,
        fn: (...args: TArgs) => Promise<TResult>,
        options: WithCacheOptions = {},
    ): void {
        if (!name?.trim()) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'Function name must be a non-empty string');
        }
        if (typeof fn !== 'function') {
            throw new Error('fn must be a function');
        }
        if (options && typeof options !== 'object') {
            throw new Error('options must be an object');
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
     * Execute a registered function.
     *
     * @param {string} name - Name of the registered function.
     * @param {...unknown[]} args - Arguments to pass to the original function.
     * @returns {Promise<unknown>} Returns the result from the original function or a cache hit.
     * @throws {Error} Throws `FUNCTION_NOT_REGISTERED` when the function is not registered.
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
     * Invalidate the cached result for a registered function under the given arguments.
     *
     * @param {string} name - Name of the registered function.
     * @param {...unknown[]} args - Original function arguments used to reconstruct the cache key.
     * @returns {Promise<boolean>} Returns `true` when the cache entry was successfully deleted.
     * @throws {Error} Throws `FUNCTION_NOT_REGISTERED` when the function is not registered.
     * @since v1.3.0
     */
    async invalidate(name: string, ...args: unknown[]): Promise<boolean> {
        if (!name || typeof name !== 'string') {
            throw new Error('Function name must be a non-empty string');
        }
        const fn = this.functions.get(name);
        if (!fn) {
            throw createError('FUNCTION_NOT_REGISTERED', `Function not registered: ${name}`);
        }
        return fn.invalidate(...args);
    }

    /**
     * Bulk-invalidate cache keys under the current namespace matching a pattern.
     *
     * @param {string} pattern - Wildcard pattern; the namespace prefix is prepended automatically when absent.
     * @returns {Promise<number>} Number of cache keys actually deleted.
     * @throws {Error} Throws an argument error when the pattern is empty.
     * @since v1.3.0
     */
    async invalidatePattern(pattern: string): Promise<number> {
        if (!pattern?.trim()) {
            throw createError(ErrorCodes.INVALID_ARGUMENT, 'Pattern must be a non-empty string');
        }
        return Number(await Promise.resolve(this.cache.delPattern?.(`${this.options.namespace ?? 'action'}:${pattern}`) ?? 0));
    }

    /**
     * Get statistics.
     *
     * @param {string} [name] - When provided, returns stats for that specific registered function only; otherwise returns all.
     * @returns {Record<string, unknown>} Statistics object.
     * @since v1.3.0
     */
    getStats(name?: string): Record<string, unknown> | null {
        if (name) {
            if (this.options.enableStats === false) return null;
            const stats = this.functions.get(name)?.getCacheStats();
            return stats ? { ...stats } : null;
        }
        return Object.fromEntries(
            [...this.functions.entries()].map(([functionName, fn]) => [functionName, fn.getCacheStats()]),
        );
    }

    /**
     * List all registered function names.
     *
     * @returns {string[]}
     * @since v1.3.0
     */
    list(): string[] {
        return [...this.functions.keys()];
    }

    /**
     * Reset statistics for one or all registered functions.
     *
     * @param {string} [name] - When provided, resets only the specified function; otherwise resets all.
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
     * Clear all registered function definitions.
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

function stableStringify(value: unknown, _seen = new WeakSet<object>()): string {
    if (typeof value === 'function' || typeof value === 'symbol') {
        return JSON.stringify('[UNSUPPORTED]');
    }
    if (typeof value === 'number' && Number.isNaN(value)) {
        return JSON.stringify('NaN');
    }
    if (value instanceof RegExp) {
        return JSON.stringify(value.toString());
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item, _seen)).join(',')}]`;
    }
    if (_seen.has(value)) {
        return JSON.stringify('[CIRCULAR]');
    }
    _seen.add(value);
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const result = `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k], _seen)}`).join(',')}}`;
    _seen.delete(value);
    return result;
}

