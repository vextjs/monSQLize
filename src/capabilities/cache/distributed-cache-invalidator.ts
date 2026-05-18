/**
 * cache-hub 分布式失效器的薄转发模块。
 *
 * monSQLize 不再维护 local/remote 双缓存兼容包装，直接暴露原生构造器。
 */

export { DistributedCacheInvalidator } from 'cache-hub/distributed';
