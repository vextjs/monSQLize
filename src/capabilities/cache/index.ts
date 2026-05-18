/**
 * 缓存能力桶文件。
 *
 * 本轮改造后，缓存相关公开能力直接转向 `cache-hub` 原生实现，
 * 不再通过 monSQLize 本地包装层承载行为逻辑。
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
