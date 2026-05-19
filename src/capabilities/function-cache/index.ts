/**
 * Function cache capability barrel file.
 *
 * After this refactor, `withCache` / `FunctionCache` delegate directly to the
 * native `cache-hub/function-cache` implementation; only thin type aliases for
 * monSQLize public names are retained.
 */

export { withCache, FunctionCache } from 'cache-hub/function-cache';

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
> = WrappedFunction<(...args: TArgs) => Promise<TResult>>;

export type FunctionCacheOptions = HubFunctionCacheOptions;

export type {
    FunctionCacheStats,
    WithCacheStats,
};
