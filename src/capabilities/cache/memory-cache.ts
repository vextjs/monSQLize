/**
 * cache-hub `MemoryCache` 的薄转发模块。
 *
 * monSQLize 不再维护本地包装逻辑；对外与对内统一直连 `cache-hub` 原生实现。
 */

export { MemoryCache } from 'cache-hub';
