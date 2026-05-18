/**
 * Cache façade barrel.
 *
 * Description:
 * - `memory-cache.ts` owns the in-memory v1-compatible cache wrapper.
 * - `redis-cache-adapter.ts` owns Redis adapter creation and Redis client resolution.
 * - `distributed-cache-invalidator.ts` owns cross-instance invalidation orchestration.
 */

export type {
    CacheLike,
    CacheLockLike,
    CacheStats,
    MemoryCacheOptions,
    RedisCacheAdapterOptions,
} from '../../../types/runtime';
export { MemoryCache } from './memory-cache';
export { createRedisCacheAdapter } from './redis-cache-adapter';
export type { RedisLike } from './redis-cache-adapter';
export { DistributedCacheInvalidator } from './distributed-cache-invalidator';
export type { DistributedCacheInvalidatorOptions } from './distributed-cache-invalidator';
