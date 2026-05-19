/**
 * Function cache capability barrel file.
 *
 * `FunctionCache` is a thin re-export from cache-hub.
 *
 * `withCache` is wrapped to add a v1 backward-compat `getCacheStats()` alias
 * that delegates to the native `stats()` method.
 */

import { withCache as hubWithCache, FunctionCache } from 'cache-hub/function-cache';

export { FunctionCache };

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

export type FunctionCacheOptions = HubFunctionCacheOptions;

export type {
    FunctionCacheStats,
    WithCacheStats,
};

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
