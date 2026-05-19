/**
 * Thin re-export module for the cache-hub Redis adapter.
 *
 * monSQLize no longer maintains prefix/fake-redis compatibility wrappers;
 * the native factory function is exposed directly.
 */

export { createRedisCacheAdapter } from 'cache-hub/redis';
