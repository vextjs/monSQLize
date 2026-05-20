/**
 * Function cache capability barrel file.
 *
 * `FunctionCache` wraps cache-hub's class to add v1 backward-compat:
 *   - `defaultTTL` constructor option is mapped to `ttl`
 *
 * `withCache` is wrapped to add a v1 backward-compat `getCacheStats()` alias
 * that delegates to the native `stats()` method.
 */

import { withCache as hubWithCache, FunctionCache as HubFunctionCache } from 'cache-hub/function-cache';
import type { CacheLike } from 'cache-hub';

import type {
    FunctionCacheOptions as HubFunctionCacheOptions,
    FunctionCacheStats,
    WithCacheOptions as HubWithCacheOptions,
    WithCacheStats,
    WrappedFunction,
} from 'cache-hub/function-cache';

export type WithCacheOptions<
    T extends (...args: any[]) => Promise<any> = (...args: unknown[]) => Promise<unknown>,
> = HubWithCacheOptions<T>;

export type CachedFunction<
    TArgs extends unknown[] = unknown[],
    TResult = unknown,
> = WrappedFunction<(...args: TArgs) => Promise<TResult>> & {
    /** @deprecated Use `stats()`. v1 backward-compat alias. */
    getCacheStats(): WithCacheStats;
};

export interface FunctionCacheOptions extends HubFunctionCacheOptions {
    /** @deprecated v1 alias for `ttl`. Use `ttl` instead. */
    defaultTTL?: number;
}

export type {
    FunctionCacheStats,
    WithCacheStats,
};

/** v1-compat wrapper around HubFunctionCache that maps `defaultTTL` → `ttl`. */
export class FunctionCache extends HubFunctionCache {
    constructor(
        cacheOrDb: CacheLike | { getCache(): CacheLike },
        options?: FunctionCacheOptions,
    ) {
        let normalizedOptions: HubFunctionCacheOptions | undefined = options;
        if (options?.defaultTTL !== undefined && options.ttl === undefined) {
            const { defaultTTL, ...rest } = options;
            normalizedOptions = { ...rest, ttl: defaultTTL };
        }
        super(cacheOrDb, normalizedOptions);
    }
}

/**
 * Wraps an async function with a cache layer.
 * Adds a v1 backward-compat `getCacheStats()` shim alongside the native `stats()`.
 */
export function withCache<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options?: HubWithCacheOptions<(...args: TArgs) => Promise<TResult>>,
): CachedFunction<TArgs, TResult> {
    const wrapped = hubWithCache(fn, options) as CachedFunction<TArgs, TResult>;
    // v1 compat shim: getCacheStats() → stats()
    wrapped.getCacheStats = () => wrapped.stats();
    return wrapped;
}
