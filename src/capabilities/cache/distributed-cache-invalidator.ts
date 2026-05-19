/**
 * Thin re-export module for the cache-hub distributed invalidator.
 *
 * monSQLize no longer maintains a local/remote dual-cache compatibility wrapper;
 * the native constructor is exposed directly.
 */

export { DistributedCacheInvalidator } from 'cache-hub/distributed';
