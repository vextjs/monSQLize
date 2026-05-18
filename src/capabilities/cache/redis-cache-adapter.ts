/**
 * cache-hub Redis adapter 的薄转发模块。
 *
 * monSQLize 不再维护 prefix / fake-redis 兼容包装，直接暴露原生工厂函数。
 */

export { createRedisCacheAdapter } from 'cache-hub/redis';
