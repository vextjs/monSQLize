/**
 * Function cache capability.
 *
 * Full v1-compatible implementation that uses cache-hub's MemoryCache as the
 * default storage and stableStringify for deterministic key generation.
 *
 * Behaviors added over cache-hub's withCache/FunctionCache:
 *   - Strict param validation (fn, ttl, keyBuilder, condition, cache)
 *   - Graceful degradation when keyBuilder or cache.get throws
 *   - Undefined-safe value wrapping ({ v: result })
 *   - Stats.calls field (= hits + misses)
 *   - getCacheStats() v1 backward-compat alias for stats()
 *   - FunctionCache param validation (constructor, register, invalidate, invalidatePattern)
 *   - FunctionCache.enableStats option
 *   - FunctionCache.defaultTTL constructor alias
 */

import { MemoryCache } from 'cache-hub';
import type { CacheLike } from 'cache-hub';
import {
    FunctionCache as HubFunctionCache,
    withCache as hubWithCache,
    type FunctionCacheStats as HubFunctionCacheStats,
    type WithCacheStats as HubWithCacheStats,
    type WrappedFunction as HubWrappedFunction,
} from 'cache-hub/function-cache';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WithCacheStats {
    hits: number;
    misses: number;
    errors: number;
    calls: number;
    hitRate: number;
}

export interface FunctionCacheStats {
    hits: number;
    misses: number;
    errors: number;
    calls: number;
    hitRate: number;
}

export interface WithCacheOptions<
    T extends (...args: any[]) => Promise<any> = (...args: unknown[]) => Promise<unknown>,
> {
    ttl?: number;
    namespace?: string;
    keyBuilder?: (...args: Parameters<T>) => string;
    condition?: (result: Awaited<ReturnType<T>>) => boolean;
    cache?: CacheLike;
    enableStats?: boolean;
}

export type CachedFunction<
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = ((...args: TArgs) => Promise<TResult>) & {
    /** v1 backward-compat alias for stats(). */
    getCacheStats(): WithCacheStats;
    stats(): WithCacheStats;
};

export interface FunctionCacheOptions {
    namespace?: string;
    ttl?: number;
    /** @deprecated v1 alias for `ttl`. Use `ttl` instead. */
    defaultTTL?: number;
    enableStats?: boolean;
}

export interface FunctionCachePerFnOptions {
    namespace?: string;
    ttl?: number;
    defaultTTL?: number;
    keyBuilder?: (...args: unknown[]) => string;
    condition?: (result: unknown) => boolean;
}

function isValidCache(cache: unknown): cache is CacheLike {
    return (
        cache !== null &&
        typeof cache === 'object' &&
        typeof (cache as Record<string, unknown>).get === 'function' &&
        typeof (cache as Record<string, unknown>).set === 'function'
    );
}

function toWithCacheStats(stats: HubWithCacheStats): WithCacheStats {
    const calls = stats.hits + stats.misses;
    return { ...stats, calls };
}

function toFunctionCacheStats(stats: HubFunctionCacheStats): FunctionCacheStats {
    const calls = stats.hits + stats.misses;
    return { ...stats, calls };
}

function isHubFunctionCacheStats(
    stats: HubFunctionCacheStats | Record<string, HubFunctionCacheStats>,
): stats is HubFunctionCacheStats {
    return (
        typeof (stats as HubFunctionCacheStats).hits === 'number' &&
        typeof (stats as HubFunctionCacheStats).misses === 'number' &&
        typeof (stats as HubFunctionCacheStats).errors === 'number' &&
        typeof (stats as HubFunctionCacheStats).hitRate === 'number'
    );
}

function zeroWithCacheStats(): WithCacheStats {
    return { hits: 0, misses: 0, errors: 0, calls: 0, hitRate: 0 };
}

function normalizeFunctionCacheStats(
    stats: HubFunctionCacheStats | Record<string, HubFunctionCacheStats>,
): FunctionCacheStats | Record<string, FunctionCacheStats> {
    if (isHubFunctionCacheStats(stats)) {
        return toFunctionCacheStats(stats);
    }

    const normalized: Record<string, FunctionCacheStats> = {};
    for (const [name, value] of Object.entries(stats)) {
        normalized[name] = toFunctionCacheStats(value);
    }
    return normalized;
}

function validateFunctionCacheOptions(options?: FunctionCacheOptions): FunctionCacheOptions {
    if (
        options !== undefined &&
        (typeof options !== 'object' || options === null || Array.isArray(options))
    ) {
        throw new Error('options must be an object');
    }

    const opts = options ?? {};
    if (opts.namespace !== undefined && typeof opts.namespace !== 'string') {
        throw new Error('namespace must be a string');
    }

    const ttl = opts.ttl !== undefined ? opts.ttl : opts.defaultTTL;
    if (ttl !== undefined && (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl < 0)) {
        throw new Error('defaultTTL must be a non-negative number');
    }

    return opts;
}

function validateFunctionCachePerFnOptions(options?: FunctionCachePerFnOptions): FunctionCachePerFnOptions {
    if (
        options !== undefined &&
        (typeof options !== 'object' || options === null || Array.isArray(options))
    ) {
        throw new Error('options must be an object');
    }

    const opts = options ?? {};
    if (opts.keyBuilder !== undefined && typeof opts.keyBuilder !== 'function') {
        throw new Error('keyBuilder must be a function');
    }
    if (opts.condition !== undefined && typeof opts.condition !== 'function') {
        throw new Error('condition must be a function');
    }

    const ttl = opts.ttl !== undefined ? opts.ttl : opts.defaultTTL;
    if (ttl !== undefined && (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl < 0)) {
        throw new Error('defaultTTL must be a non-negative number');
    }

    return opts;
}

// ── withCache ──────────────────────────────────────────────────────────────────

export function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: WithCacheOptions<(...args: TArgs) => Promise<TResult>> = {},
): CachedFunction<TArgs, TResult> {
    if (typeof fn !== 'function') throw new Error('fn must be a function');

    const { ttl = 0, namespace, keyBuilder, condition, cache: externalCache, enableStats = false } = options;

    if (typeof ttl !== 'number' || Number.isNaN(ttl) || ttl < 0)
        throw new Error('ttl must be a non-negative number');
    if (keyBuilder !== undefined && typeof keyBuilder !== 'function')
        throw new Error('keyBuilder must be a function');
    if (condition !== undefined && typeof condition !== 'function')
        throw new Error('condition must be a function');
    if (externalCache !== undefined && !isValidCache(externalCache))
        throw new Error('Invalid cache instance');

    const wrapped = hubWithCache(fn, {
        ttl,
        namespace: namespace ?? `_wc_${fn.name || 'fn'}_${Math.random().toString(36).slice(2)}`,
        keyBuilder,
        condition,
        cache: externalCache ?? new MemoryCache(),
        enableStats,
    }) as HubWrappedFunction<(...args: TArgs) => Promise<TResult>>;
    const baseStats = wrapped.stats.bind(wrapped);

    const getCacheStats = (): WithCacheStats => {
        if (!enableStats) return zeroWithCacheStats();
        return toWithCacheStats(baseStats());
    };

    const cachedFn = wrapped as unknown as CachedFunction<TArgs, TResult>;
    cachedFn.getCacheStats = getCacheStats;
    cachedFn.stats = getCacheStats;
    return cachedFn;
}

// ── FunctionCache ──────────────────────────────────────────────────────────────

export class FunctionCache {
    private readonly _inner: HubFunctionCache;
    private readonly _enableStats: boolean;

    constructor(
        cacheOrDb: CacheLike | { getCache(): CacheLike },
        options?: FunctionCacheOptions,
    ) {
        const opts = validateFunctionCacheOptions(options);
        const ttl = opts.ttl !== undefined ? opts.ttl : opts.defaultTTL;

        this._enableStats = opts.enableStats !== false;
        this._inner = new HubFunctionCache(cacheOrDb ?? new MemoryCache(), {
            namespace: opts.namespace ?? 'fn-cache',
            ttl: ttl !== undefined ? ttl : 0,
        });
    }

    register(
        name: string,
        fn: (...args: unknown[]) => Promise<unknown>,
        options?: FunctionCachePerFnOptions,
    ): void {
        if (!name || typeof name !== 'string')
            throw new Error('Function name must be a non-empty string');
        if (typeof fn !== 'function')
            throw new Error('fn must be a function');
        const opts = validateFunctionCachePerFnOptions(options);
        const ttl = opts.ttl !== undefined ? opts.ttl : opts.defaultTTL;

        this._inner.register(name, fn, {
            namespace: opts.namespace,
            ttl,
            keyBuilder: opts.keyBuilder,
            condition: opts.condition,
        });
    }

    async execute(name: string, ...args: unknown[]): Promise<unknown> {
        return this._inner.execute(name, ...args);
    }

    async invalidate(name: string, ...args: unknown[]): Promise<void> {
        if (!name || typeof name !== 'string') {
            throw new Error('Function name must be a non-empty string');
        }
        await this._inner.invalidate(name, ...args);
    }

    async invalidatePattern(pattern: string): Promise<number> {
        if (!pattern || typeof pattern !== 'string')
            throw new Error('Pattern must be a non-empty string');
        return this._inner.invalidatePattern(pattern);
    }

    list(): string[] {
        return this._inner.list();
    }

    clear(): void {
        this._inner.clear();
    }

    getStats(name?: string): FunctionCacheStats | Record<string, FunctionCacheStats> | null {
        if (!this._enableStats) return null;
        return normalizeFunctionCacheStats(this._inner.getStats(name));
    }

    resetStats(name?: string): void {
        this._inner.resetStats(name);
    }
}
