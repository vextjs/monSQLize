/**
 * 函数缓存能力桶文件。
 *
 * 本轮改造后，`withCache` / `FunctionCache` 直接转向 `cache-hub/function-cache`
 * 原生实现，仅保留 monSQLize 公开类型名的薄别名。
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
