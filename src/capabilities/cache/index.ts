/**
 * 缓存能力桶文件。
 *
 * 说明：
 * - `memory-cache.ts` 负责基于 cache-hub 的内存缓存兼容包装。
 * - `redis-cache-adapter.ts` 负责基于 cache-hub 的 Redis 适配器兼容包装。
 * - `distributed-cache-invalidator.ts` 负责基于 cache-hub 的分布式失效兼容包装。
 */

export type {
    CacheLike,
    CacheLockLike,
    CacheStats,
    MemoryCacheOptions,
    RedisCacheAdapterOptions,
    RedisLike,
    DistributedCacheInvalidatorOptions,
} from '../../../types/runtime';
export { MemoryCache } from './memory-cache';
export { createRedisCacheAdapter } from './redis-cache-adapter';
export { DistributedCacheInvalidator } from './distributed-cache-invalidator';
