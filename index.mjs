/**
 * monSQLize ES Module Entry Point
 *
 * 使用方式:
 * ```javascript
 * import MonSQLize from 'monsqlize';
 * // 或
 * import { MonSQLize } from 'monsqlize';
 *
 * const db = new MonSQLize({
 *   type: 'mongodb',
 *   config: { uri: 'mongodb://localhost:27017/mydb' }
 * });
 *
 * await db.connect();
 * ```
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// 使用 require 导入 CommonJS 模块
const MonSQLizeClass = require('./lib/index.js');
const Logger = require('./lib/logger.js');
const MemoryCache = require('./lib/cache.js');
const { createRedisCacheAdapter } = require('./lib/redis-cache-adapter.js');
const TransactionManager = require('./lib/transaction/TransactionManager.js');
const CacheLockManager = require('./lib/transaction/CacheLockManager.js');
const DistributedCacheInvalidator = require('./lib/distributed-cache-invalidator.js');

// 默认导出
export default MonSQLizeClass;

// 命名导出
export {
  MonSQLizeClass as MonSQLize,
  Logger,
  MemoryCache,
  createRedisCacheAdapter,
  TransactionManager,
  CacheLockManager,
  DistributedCacheInvalidator
};

