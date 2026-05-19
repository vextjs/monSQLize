/**
 * Cache capability barrel file.
 *
 * After this refactor, all public cache capabilities delegate directly to
 * the native `cache-hub` implementation without a monSQLize wrapper layer.
 */

export { MemoryCache } from './memory-cache';
export { createRedisCacheAdapter } from './redis-cache-adapter';
export { DistributedCacheInvalidator } from './distributed-cache-invalidator';

export type {
    CacheLike,
    CacheStats,
    LockManager as CacheLockLike,
    MemoryCacheOptions,
} from 'cache-hub';


export type {
    DistributedInvalidatorOptions as DistributedCacheInvalidatorOptions,
} from 'cache-hub/distributed';
