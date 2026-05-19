/**
 * Cache capability barrel file.
 *
 * After this refactor, all public cache capabilities delegate directly to
 * the native `cache-hub` implementation without a monSQLize wrapper layer.
 */

export { MemoryCache } from './memory-cache';
export { createRedisCacheAdapter } from './redis-cache-adapter';
export { DistributedCacheInvalidator } from './distributed-cache-invalidator';
export { MultiLevelCache } from 'cache-hub';

export type {
    CacheLike,
    CacheStats,
    LockManager as CacheLockLike,
    MemoryCacheOptions,
} from 'cache-hub';


export type {
    DistributedInvalidatorOptions as DistributedCacheInvalidatorOptions,
} from 'cache-hub/distributed';

import type { CacheLike } from 'cache-hub';

/**
 * Adapts a v1-style CacheLike object to the v2 CacheLike interface.
 *
 * v2 requires a `has()` method (missing from v1 implementations).
 * This helper adds `has()` by delegating to the existing `exists()`.
 * All other methods are forwarded as-is.
 *
 * @example
 * ```ts
 * const v2Cache = adaptLegacyCacheLike(myV1Cache);
 * const msq = new MonSQLize({ cache: v2Cache });
 * ```
 */
export function adaptLegacyCacheLike(v1Cache: Omit<CacheLike, 'has'>): CacheLike {
    if ('has' in v1Cache && typeof (v1Cache as CacheLike).has === 'function') {
        return v1Cache as CacheLike;
    }
    return new Proxy(v1Cache as CacheLike, {
        get(target, prop) {
            if (prop === 'has') {
                return (key: string) => target.exists(key);
            }
            const val = (target as unknown as Record<string | symbol, unknown>)[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        },
    });
}
