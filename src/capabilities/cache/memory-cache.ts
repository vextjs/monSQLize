/**
 * Thin re-export module for cache-hub `MemoryCache`.
 *
 * monSQLize no longer maintains local wrapper logic; both internal and external
 * consumers connect directly to the native `cache-hub` implementation.
 */

export { MemoryCache } from 'cache-hub';
