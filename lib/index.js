const Logger = require("./logger");
const ConnectionManager = require("./connect");
const MemoryCache = require("./cache");
const { createRedisCacheAdapter } = require("./redis-cache-adapter");
const TransactionManager = require("./transaction/TransactionManager");
const CacheLockManager = require("./transaction/CacheLockManager");
const DistributedCacheInvalidator = require("./distributed-cache-invalidator");
const { validateRange } = require("./common/validation");
const ConnectionPoolManager = require("./infrastructure/ConnectionPoolManager");
const SagaOrchestrator = require("./saga/SagaOrchestrator");
const { ChangeStreamSyncManager } = require("./sync");

module.exports = class {
  /**
   * 初始化数据库连接配置
   * @param {Object} options - 数据库连接配置选项
   * @param {string} options.type - 数据库类型,支持 mongodb
   * @param {Object} options.config - 数据库连接配置
   * @param {Object} [options.cache] - 缓存配置选项
   * @param {Object} [options.logger] - 日志记录器
   * @param {number} [options.maxTimeMS] - 全局默认查询超时时间（毫秒）
   * @param {{instanceId?: string}} [options.namespace] - 命名空间设置（用于缓存隔离）
   * @throws {Error} 如果数据库类型无效则抛出错误
   */
  constructor(options) {
    if (!options.type || !["mongodb"].includes(options.type)) {
      throw new Error("Invalid database type. Supported types are: mongodb");
    }
    const { type = "mongodb", databaseName, config, cache, logger } = options;
    this.type = type;
    this.databaseName = databaseName;
    this.config = config;

    // ✅ v1.3.0: 自动 ObjectId 转换配置
    this.autoConvertConfig = this._initAutoConvertConfig(
      options.autoConvertObjectId,
      options.type,
    );

    // 🔧 修复：保存 distributed 配置到单独的变量
    this._cacheConfig = cache;

    // 🆕 v1.0.8: 多连接池配置
    this._poolsConfig = options.pools;
    this._poolStrategy = options.poolStrategy || "auto";
    this._poolFallback = options.poolFallback;
    this._maxPoolsCount = options.maxPoolsCount;
    this._poolManager = null; // 连接时初始化

    // Count 队列配置（高并发控制，避免压垮数据库）
    // 默认值：
    //   - enabled: true (默认启用)
    //   - concurrency: CPU 核心数（最少 4，最多 16）
    //   - maxQueueSize: 10000
    //   - timeout: 60000ms (1分钟)
    this.countQueue =
      options.countQueue !== undefined
        ? options.countQueue
        : {
            enabled: true, // 默认启用
            concurrency: undefined, // undefined 则使用 CPU 核心数
            maxQueueSize: 10000, // 队列最大 10000
            timeout: 60000, // 超时 60 秒
          };

    // 使用缓存工厂获取有效的缓存实例
    this.cache = MemoryCache.getOrCreateCache(cache);

    // 🆕 v1.1.6: 精准缓存失效配置
    const cacheConfig = cache || {};
    this.cacheAutoInvalidate =
      cacheConfig.autoInvalidate !== undefined
        ? cacheConfig.autoInvalidate
        : false; // 默认 false（不自动失效）

    // 使用 Logger 工具类创建日志记录器
    this.logger = Logger.create(logger);

    // 🔒 参数验证：防止 DoS 攻击（允许null值用于显式禁用）
    if (options.maxTimeMS !== undefined && options.maxTimeMS !== null) {
      validateRange(options.maxTimeMS, 1, 300000, "maxTimeMS");
    }
    if (options.findLimit !== undefined && options.findLimit !== null) {
      validateRange(options.findLimit, 1, 10000, "findLimit");
    }
    if (
      options.findPageMaxLimit !== undefined &&
      options.findPageMaxLimit !== null
    ) {
      validateRange(options.findPageMaxLimit, 1, 10000, "findPageMaxLimit");
    }
    if (
      options.slowQueryMs !== undefined &&
      options.slowQueryMs !== null &&
      options.slowQueryMs !== -1
    ) {
      validateRange(options.slowQueryMs, 0, 60000, "slowQueryMs");
    }

    // 集中默认配置（库内默认 + 用户覆盖）
    const DEFAULTS = {
      maxTimeMS: 2000,
      findLimit: 10,
      slowQueryMs: 500,
      namespace: { scope: "database" },
      // 深分页/聚合相关
      findPageMaxLimit: 500,
      cursorSecret: undefined,
      // 慢日志扩展
      log: { slowQueryTag: { event: "slow_query", code: "SLOW_QUERY" } },
    };
    const deepMerge = (base, patch) => {
      const out = { ...base };
      for (const k of Object.keys(patch || {})) {
        const v = patch[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          out[k] = deepMerge(base[k] || {}, v);
        } else if (v !== undefined) {
          out[k] = v;
        }
      }
      return out;
    };
    this.defaults = deepMerge(DEFAULTS, {
      maxTimeMS: options.maxTimeMS,
      findLimit: options.findLimit,
      namespace: options.namespace,
      slowQueryMs: options.slowQueryMs,
      // 新增可选项
      findPageMaxLimit: options.findPageMaxLimit,
      cursorSecret: options.cursorSecret,
      log: options.log,
      // 🔴 v1.3.1: 慢查询日志持久化存储配置
      slowQueryLog: options.slowQueryLog,
      // 🆕 v1.1.6: 精准缓存失效配置
      cacheAutoInvalidate: this.cacheAutoInvalidate,
    });
    // 冻结默认配置，避免运行期被意外修改
    this.defaults = Object.freeze(this.defaults);

    // 🆕 v1.4.0: 保存 Model 自动加载配置
    this._modelsConfig = options.models;

    // 🆕 v1.1.0: 初始化 Saga 协调器
    this._sagaOrchestrator = new SagaOrchestrator({
      cache: this.cache,
      logger: this.logger,
    });

    // 🆕 v1.0.9: 保存同步配置
    this._syncConfig = options.sync;
    this._syncManager = null;
  }

  /**
   * 连接数据库并返回访问集合/表的对象
   * @returns {{collection: Function, db: Function}} 返回包含 collection 与 db 方法的对象
   * @throws {Error} 当连接失败时抛出错误
   */
  async connect() {
    // 如果已经有连接，直接返回访问对象
    if (this.dbInstance) {
      return this.dbInstance;
    }

    // 防止并发连接：使用连接锁
    if (this._connecting) {
      return this._connecting;
    }

    try {
      this._connecting = (async () => {
        // 🆕 v1.0.8: 如果配置了多连接池，先初始化 ConnectionPoolManager
        if (
          this._poolsConfig &&
          Array.isArray(this._poolsConfig) &&
          this._poolsConfig.length > 0
        ) {
          this._poolManager = new ConnectionPoolManager({
            pools: [], // 先创建空管理器
            poolStrategy: this._poolStrategy,
            poolFallback: this._poolFallback,
            maxPoolsCount: this._maxPoolsCount,
            logger: this.logger,
          });

          // 添加所有配置的连接池
          for (const poolConfig of this._poolsConfig) {
            await this._poolManager.addPool(poolConfig);
          }

          // 启动健康检查
          this._poolManager.startHealthCheck();

          this.logger.info("[MonSQLize] 多连接池已初始化", {
            poolCount: this._poolsConfig.length,
            strategy: this._poolStrategy,
          });
        }

        // 使用 ConnectionManager 建立连接（单连接池模式或默认连接池）
        const { collection, db, instance } = await ConnectionManager.connect(
          this.type,
          this.databaseName,
          this.config,
          this.cache,
          this.logger,
          this.defaults,
          this._poolManager, // 传递 poolManager
        );

        // 保存连接状态（关键：缓存对象，保证多次调用幂等返回同一形态/引用）
        this.dbInstance = { collection, db };
        this._adapter = instance;

        // 初始化分布式缓存失效器（如果配置了）
        // 🔧 修复：使用 _cacheConfig 读取 distributed 配置
        if (
          this._cacheConfig &&
          typeof this._cacheConfig.distributed === "object" &&
          this._cacheConfig.distributed.enabled !== false
        ) {
          try {
            // 🆕 自动从 cache.remote 提取 Redis 实例（如果未配置）
            let redis = this._cacheConfig.distributed.redis;
            if (!redis && !this._cacheConfig.distributed.redisUrl) {
              // 尝试从 remote 缓存适配器中获取 Redis 实例
              if (
                this.cache.remote &&
                typeof this.cache.remote.getRedisInstance === "function"
              ) {
                redis = this.cache.remote.getRedisInstance();
                if (this.logger) {
                  this.logger.info(
                    "[DistributedCache] Auto-detected Redis from cache.remote",
                  );
                }
              }
            }

            this._cacheInvalidator = new DistributedCacheInvalidator({
              redisUrl: this._cacheConfig.distributed.redisUrl,
              redis,
              channel: this._cacheConfig.distributed.channel,
              instanceId: this._cacheConfig.distributed.instanceId,
              cache: this.cache,
              logger: this.logger,
            });

            // 🆕 关键：将 invalidate 方法注入到 MultiLevelCache
            if (this.cache && typeof this.cache.setPublish === "function") {
              this.cache.setPublish((msg) => {
                if (msg && msg.type === "invalidate" && msg.pattern) {
                  this._cacheInvalidator
                    .invalidate(msg.pattern)
                    .catch((err) => {
                      this.logger.error(
                        "❌ Broadcast invalidation failed:",
                        err.message,
                      );
                    });
                }
              });
              this.logger.info("✅ Distributed cache invalidator initialized", {
                channel: this._cacheInvalidator.channel,
                integrated: true,
              });
            } else {
              this.logger.warn(
                "⚠️  Cache does not support setPublish, distributed invalidation disabled",
              );
            }
          } catch (error) {
            this.logger.error(
              "❌ Failed to initialize distributed cache invalidator:",
              error.message,
            );
          }
        }

        // 初始化事务管理器和缓存锁管理器
        if (this.type === "mongodb" && instance.client) {
          // 检查是否配置了分布式事务锁
          const useDistributedLock =
            this._cacheConfig &&
            typeof this._cacheConfig.transaction === "object" &&
            this._cacheConfig.transaction.distributedLock &&
            this._cacheConfig.transaction.distributedLock.redis;

          if (useDistributedLock) {
            // 使用分布式缓存锁管理器
            const DistributedCacheLockManager = require("./transaction/DistributedCacheLockManager");
            this._lockManager = new DistributedCacheLockManager({
              redis: this._cacheConfig.transaction.distributedLock.redis,
              lockKeyPrefix:
                this._cacheConfig.transaction.distributedLock.keyPrefix ||
                "monsqlize:cache:lock:",
              maxDuration: 300000,
              logger: this.logger,
            });
            this.logger.info("✅ Distributed cache lock manager initialized");
          } else {
            // 使用本地缓存锁管理器
            this._lockManager = new CacheLockManager({
              logger: this.logger,
              maxDuration: 300000, // 锁最长持续5分钟
              cleanupInterval: 10000, // 每10秒清理一次
            });
          }

          // 将锁管理器注入到缓存
          if (this.cache && typeof this.cache.setLockManager === "function") {
            this.cache.setLockManager(this._lockManager);
          }

          // 创建事务管理器
          this._transactionManager = new TransactionManager(
            instance, // 传入完整的 adapter 实例
            this.cache,
            this.logger,
            {
              lockManager: this._lockManager,
            },
          );

          this.logger.info("✅ Transaction manager initialized", {
            hasClient: !!instance.client,
            hasLockManager: !!this._lockManager,
            isDistributed: useDistributedLock,
          });

          // 🆕 v1.4.0: 挂载业务锁 API（仅在使用分布式锁时可用）
          if (
            this._lockManager &&
            typeof this._lockManager.withLock === "function"
          ) {
            this.dbInstance.withLock = (key, callback, opts) =>
              this._lockManager.withLock(key, callback, opts);
            this.dbInstance.acquireLock = (key, opts) =>
              this._lockManager.acquireLock(key, opts);
            this.dbInstance.tryAcquireLock = (key, opts) =>
              this._lockManager.tryAcquireLock(key, opts);
            this.dbInstance.getLockStats = () => this._lockManager.getStats();

            this.logger.info("✅ Business lock API initialized", {
              isDistributed: useDistributedLock,
            });
          } else {
            this.logger.warn(
              "⚠️  Business lock API not available (Redis required)",
              {
                hasLockManager: !!this._lockManager,
                isDistributed: useDistributedLock,
              },
            );
          }
        } else {
          this.logger.warn("⚠️  Transaction manager not initialized", {
            type: this.type,
            hasClient: !!instance.client,
          });
        }

        // 🆕 v1.4.0: 自动加载 Model
        if (this._modelsConfig) {
          await this._loadModels();
        }

        // 🆕 v1.0.9: 启动 Change Stream 同步
        if (this._syncConfig && this._syncConfig.enabled) {
          try {
            this._syncManager = new ChangeStreamSyncManager({
              db: instance.getNativeDb(), // 获取原生 MongoDB DB 对象
              poolManager: this._poolManager,
              config: this._syncConfig,
              logger: this.logger,
            });

            await this._syncManager.start();

            this.logger.info("[MonSQLize] Change Stream 同步已启动", {
              targets: this._syncConfig.targets.length,
            });
          } catch (error) {
            this.logger.error("[MonSQLize] Change Stream 同步启动失败", {
              error: error.message,
            });
            // 同步启动失败不影响主库连接
          }
        }

        return this.dbInstance;
      })();

      const result = await this._connecting;
      this._connecting = null;
      return result;
    } catch (err) {
      this._connecting = null;
      throw err;
    }
  }

  /**
   * 获取底层缓存实例（用于查看统计或手动失效）
   * @returns {Object} 缓存实例
   */
  getCache() {
    return this.cache;
  }

  /**
   * 获取当前实例的默认配置（只读视图）
   * @returns {{maxTimeMS?:number, findLimit?:number, namespace?:object, slowQueryMs?:number}}
   */
  getDefaults() {
    return { ...this.defaults };
  }

  /**
   * 关闭底层数据库连接（释放资源）
   */
  async close() {
    // 清理分布式缓存失效器
    if (
      this._cacheInvalidator &&
      typeof this._cacheInvalidator.close === "function"
    ) {
      await this._cacheInvalidator.close();
      this._cacheInvalidator = null;
    }

    // 清理事务管理器
    if (
      this._transactionManager &&
      typeof this._transactionManager.destroy === "function"
    ) {
      await this._transactionManager.destroy();
      this._transactionManager = null;
    }

    // 清理锁管理器
    if (this._lockManager && typeof this._lockManager.destroy === "function") {
      this._lockManager.destroy();
      this._lockManager = null;
    }

    // 🆕 v1.0.8: 关闭多连接池
    if (this._poolManager) {
      await this._poolManager.close();
      this._poolManager = null;
    }

    // 关闭数据库连接
    if (this._adapter && typeof this._adapter.close === "function") {
      await this._adapter.close();
    }

    // 清理状态
    this.dbInstance = null;
    this._adapter = null;
    this._connecting = null;
  }

  /**
   * 健康检查（适配器透传）
   */
  async health() {
    if (this._adapter && typeof this._adapter.health === "function") {
      return this._adapter.health();
    }
    return { status: "down", connected: false };
  }

  /**
   * 查询慢查询日志（v1.3.1+）
   * @param {Object} filter - 查询条件 { db, collection, operation }
   * @param {Object} options - 查询选项 { sort, limit, skip }
   * @returns {Promise<Array>} 慢查询日志列表
   */
  async getSlowQueryLogs(filter, options) {
    if (this._adapter && typeof this._adapter.getSlowQueryLogs === "function") {
      return this._adapter.getSlowQueryLogs(filter, options);
    }
    throw new Error("Slow query log feature is not enabled or not supported");
  }

  /**
   * 事件订阅（适配器透传）
   * @param {'connected'|'closed'|'error'|'slow-query'} event
   * @param {(payload:any)=>void} handler
   */
  on(event, handler) {
    if (this._adapter && typeof this._adapter.on === "function") {
      this._adapter.on(event, handler);
    }
  }

  /**
   * 启动一个事务会话（手动管理）
   * @param {Object} options - 事务选项
   * @param {Object} [options.readConcern] - 读关注级别 { level: 'majority' | 'local' | 'snapshot' }
   * @param {string} [options.readPreference] - 读偏好
   * @param {boolean} [options.causalConsistency=true] - 因果一致性
   * @param {number} [options.timeout=30000] - 事务超时时间（毫秒）
   * @returns {Promise<Transaction>}
   */
  async startSession(options = {}) {
    if (!this._transactionManager) {
      throw new Error("Connection not established. Call connect() first.");
    }
    return this._transactionManager.startSession(options);
  }

  /**
   * 使用事务执行操作（自动管理，推荐）
   * @param {Function} callback - 事务回调函数，接收 Transaction 对象作为参数
   * @param {Object} options - 事务选项（同 startSession）
   * @param {number} [options.maxRetries=3] - 最大重试次数
   * @param {number} [options.retryDelay=100] - 重试延迟（毫秒）
   * @param {number} [options.retryBackoff=2] - 重试退避系数
   * @param {string} [options.pool] - 指定连接池名称（v1.0.8+，修复问题10）
   * @returns {Promise<any>} 返回 callback 的返回值
   */
  async withTransaction(callback, options = {}) {
    if (!this._transactionManager) {
      throw new Error("Connection not established. Call connect() first.");
    }

    // 🔴 修复问题10：事务需要确保在同一连接池执行
    const poolName = options.pool || "primary";

    // 如果使用了多连接池，需要锁定到指定连接池
    if (this._poolManager) {
      const pool = this._poolManager._getPool(poolName);
      if (!pool) {
        throw new Error(`Transaction pool '${poolName}' not found`);
      }

      this.logger.info("[Transaction] 使用连接池执行事务", { pool: poolName });

      // 传递连接池信息给 TransactionManager
      return this._transactionManager.withTransaction(callback, {
        ...options,
        _poolClient: pool,
      });
    }

    // 单连接池模式，正常执行
    return this._transactionManager.withTransaction(callback, options);
  }

  // ========== 多连接池 API（v1.0.8+）==========

  /**
   * 添加连接池
   * @param {Object} config - 连接池配置
   * @returns {Promise<void>}
   */
  async addPool(config) {
    if (!this._poolManager) {
      throw new Error(
        "Multi-pool is not enabled. Configure pools in constructor options.",
      );
    }
    return this._poolManager.addPool(config);
  }

  /**
   * 移除连接池
   * @param {string} name - 连接池名称
   * @returns {Promise<void>}
   */
  async removePool(name) {
    if (!this._poolManager) {
      throw new Error("Multi-pool is not enabled.");
    }
    return this._poolManager.removePool(name);
  }

  /**
   * 获取所有连接池名称
   * @returns {string[]}
   */
  getPoolNames() {
    if (!this._poolManager) {
      return [];
    }
    return this._poolManager.getPoolNames();
  }

  /**
   * 获取连接池统计信息
   * @returns {Object}
   */
  getPoolStats() {
    if (!this._poolManager) {
      return {};
    }
    return this._poolManager.getPoolStats();
  }

  /**
   * 获取连接池健康状态
   * @returns {Map<string, HealthStatus>}
   */
  getPoolHealth() {
    if (!this._poolManager) {
      return new Map();
    }
    return this._poolManager.getPoolHealth();
  }

  /** 取消事件订阅（适配器透传） */
  off(event, handler) {
    if (this._adapter && typeof this._adapter.off === "function") {
      this._adapter.off(event, handler);
    }
  }

  /**
   * 导出工具函数：创建 Redis 缓存适配器
   * @static
   * @param {import('ioredis').Redis | import('ioredis').Cluster} client - Redis客户端
   * @param {Object} [options] - 配置选项
   * @returns {import('./cache').CacheLike} Redis缓存适配器
   */
  static createRedisCacheAdapter(client, options) {
    return createRedisCacheAdapter(client, options);
  }

  /**
   * 初始化 ObjectId 自动转换配置
   * @private
   * @param {boolean|Object} config - 用户配置
   * @param {string} dbType - 数据库类型
   * @returns {Object} 配置对象
   */
  _initAutoConvertConfig(config, dbType) {
    // 只在 MongoDB 类型下启用
    if (dbType !== "mongodb") {
      return { enabled: false };
    }

    // 默认配置
    const defaults = {
      enabled: true,
      excludeFields: [],
      customFieldPatterns: [],
      maxDepth: 10,
      logLevel: "warn",
    };

    // 用户禁用
    if (config === false) {
      return { enabled: false };
    }

    // 用户自定义配置
    if (typeof config === "object" && config !== null) {
      return {
        enabled: config.enabled !== false,
        excludeFields: Array.isArray(config.excludeFields)
          ? config.excludeFields
          : defaults.excludeFields,
        customFieldPatterns: Array.isArray(config.customFieldPatterns)
          ? config.customFieldPatterns
          : defaults.customFieldPatterns,
        maxDepth:
          typeof config.maxDepth === "number"
            ? config.maxDepth
            : defaults.maxDepth,
        logLevel: config.logLevel || defaults.logLevel,
      };
    }

    return defaults;
  }

  /**
   * 获取 Model 实例（缓存复用）
   *
   * 同一 collectionName 多次调用返回同一实例。
   * Model.redefine() / Model.undefine() 后自动失效，close() 后全部清空。
   *
   * @param {string} collectionName - 集合名称
   * @returns {ModelInstance} Model 实例
   * @throws {Error} Model 未定义
   * @throws {Error} 数据库未连接
   *
   * @example
   * // 1. 定义 Model
   * const { Model } = require('monsqlize');
   * Model.define('users', {
   *   schema: (dsl) => dsl({ username: 'string!' })
   * });
   *
   * // 2. 连接数据库并获取 Model 实例
   * const msq = new MonSQLize({ ... });
   * await msq.connect();
   * const User = msq.model('users');
   *
   * // 3. 使用 Model
   * const result = await User.find({ status: 'active' });
   */
  model(collectionName) {
    // 检查数据库是否已连接
    if (!this.dbInstance) {
      const err = new Error(
        "Database is not connected. Call connect() before accessing models.",
      );
      err.code = "NOT_CONNECTED";
      throw err;
    }

    const Model = require("./model");

    // 缓存命中 + redefine 失效检查
    if (this._modelInstances && this._modelInstances.has(collectionName)) {
      if (!Model._redefinedNames.has(collectionName)) {
        return this._modelInstances.get(collectionName);
      }
      // redefine 后需要重建实例
      this._modelInstances.delete(collectionName);
      Model._redefinedNames.delete(collectionName);
    }

    // 检查 Model 是否已定义
    if (!Model.has(collectionName)) {
      const err = new Error(
        `Model '${collectionName}' is not defined. Call Model.define() first.`,
      );
      err.code = "MODEL_NOT_DEFINED";
      throw err;
    }

    // 获取 Model 定义
    const modelDef = Model.get(collectionName);

    // 获取 collection 实例（v1.2.2+ 支持 connection 路由）
    const connection = modelDef.definition.connection;
    const collection = (connection && (connection.pool || connection.database))
      ? this._resolveModelCollection(collectionName, connection)
      : this.dbInstance.collection(collectionName);

    // 创建 ModelInstance 并缓存
    const instance = new Model.ModelInstance(collection, modelDef.definition, this);

    if (!this._modelInstances) this._modelInstances = new Map();
    this._modelInstances.set(collectionName, instance);

    return instance;
  }

  /**
   * 解析 Model 绑定的 collection（内部方法）
   *
   * 根据 Model 定义中的 connection 配置，将请求路由到正确的连接池和数据库。
   *
   * 四种组合：
   *   1. pool + database → 指定池、指定数据库
   *   2. pool 只配置  → 指定池、实例默认 databaseName
   *   3. database 只配置 → 默认连接池、指定数据库
   *   4. 均未配置   → 原逻辑（此方法不会被调用）
   *
   * @private
   * @param {string} collectionName - 集合名称
   * @param {{ pool?: string, database?: string }} connection - Model 的 connection 配置
   * @returns {Object} monSQLize 包装 collection 对象
   * @since v1.2.2
   */
  _resolveModelCollection(collectionName, connection) {
    const poolName = connection.pool;
    const dbName   = connection.database || this.databaseName;

    if (poolName) {
      if (!this._poolManager) {
        const err = new Error(
          `Model '${collectionName}' requires pool '${poolName}' but no pools are configured. ` +
          `Add 'pools' to MonSQLize constructor options.`
        );
        err.code = 'NO_POOL_MANAGER';
        throw err;
      }

      const client = this._poolManager._getPool(poolName);
      if (!client) {
        const availablePools = this._poolManager.getPoolNames().join(', ');
        const err = new Error(
          `Pool '${poolName}' not found. Available pools: [${availablePools}]`
        );
        err.code = 'POOL_NOT_FOUND';
        throw err;
      }

      // 指定池 + 数据库：通过 adapter 的 collectionFromClient 复用包装逻辑
      return this._adapter.collectionFromClient(client, dbName, collectionName);
    }

    // 只切换数据库，用默认连接
    return this.dbInstance.db(dbName).collection(collectionName);
  }

  /**
   * 获取集合实例（代理方法）
   *
   * @param {string} collectionName - 集合名称
   * @returns {Object} 集合实例
   * @throws {Error} 数据库未连接
   *
   * @example
   * const users = msq.collection('users');
   * const docs = await users.find({}).toArray();
   */
  collection(collectionName) {
    if (!this.dbInstance) {
      const err = new Error(
        "Database is not connected. Call connect() before accessing collections.",
      );
      err.code = "NOT_CONNECTED";
      throw err;
    }
    return this.dbInstance.collection(collectionName);
  }

  /**
   * 自动加载 Model 文件
   *
   * @private
   * @returns {Promise<void>}
   *
   * @example
   * // 配置示例
   * {
   *   models: {
   *     path: './models',           // Model 文件目录（必需）
   *     pattern: '*.model.js',      // 文件名模式（可选，默认 '*.model.{js,ts,mjs,cjs}'）
   *     recursive: true             // 是否递归扫描子目录（可选，默认 false）
   *   }
   * }
   *
   * // 或简化配置（仅指定目录）
   * {
   *   models: './models'  // 自动使用默认 pattern
   * }
   */
  async _loadModels(options = {}) {
    const { reload = false } = options;
    const fs = require("fs");
    const path = require("path");

    // 解析配置
    let modelsPath, pattern, recursive;

    if (typeof this._modelsConfig === "string") {
      // 简化配置：models: './models'
      modelsPath = this._modelsConfig;
      pattern = "*.model.{js,ts,mjs,cjs}";
      recursive = false;
    } else if (
      typeof this._modelsConfig === "object" &&
      this._modelsConfig.path
    ) {
      // 完整配置
      modelsPath = this._modelsConfig.path;
      pattern = this._modelsConfig.pattern || "*.model.{js,ts,mjs,cjs}";
      recursive = this._modelsConfig.recursive || false;
    } else {
      this.logger.warn("[Model] Invalid models config, skipping auto-load");
      return;
    }

    // 解析绝对路径
    const absolutePath = path.isAbsolute(modelsPath)
      ? modelsPath
      : path.resolve(process.cwd(), modelsPath);

    // 检查目录是否存在
    if (!fs.existsSync(absolutePath)) {
      this.logger.warn(`[Model] Models directory not found: ${absolutePath}`);
      return;
    }

    // 解析 pattern（支持 glob 格式）
    const globPattern = pattern
      .replace(/\./g, "\\.")
      .replace(/\*/g, ".*")
      .replace(/\{([^}]+)\}/g, "($1)")
      .replace(/,/g, "|");
    const regex = new RegExp(`^${globPattern}$`);

    // 扫描文件
    const files = [];
    const scanDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          scanDir(fullPath);
        } else if (entry.isFile() && regex.test(entry.name)) {
          files.push(fullPath);
        }
      }
    };

    try {
      scanDir(absolutePath);
    } catch (err) {
      this.logger.error(
        `[Model] Failed to scan directory: ${absolutePath}`,
        err,
      );
      return;
    }

    if (this.logger) {
      this.logger.info(`[Model] Scanning models from: ${absolutePath}`, {
        pattern,
        recursive,
        filesFound: files.length,
      });
    }

    // 加载每个文件
    const Model = require("./model");
    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
      try {
        // 清除 require 缓存（支持热重载）
        delete require.cache[require.resolve(file)];

        // 加载 Model 定义
        const modelDef = require(file);

        // 验证 Model 定义
        if (!modelDef) {
          this.logger.warn(
            `[Model] Skipping ${file}: export is null or undefined`,
          );
          errorCount++;
          continue;
        }

        if (!modelDef.name) {
          this.logger.warn(`[Model] Skipping ${file}: missing 'name' property`);
          errorCount++;
          continue;
        }

        if (typeof modelDef.name !== "string" || modelDef.name.trim() === "") {
          this.logger.warn(
            `[Model] Skipping ${file}: 'name' must be a non-empty string`,
          );
          errorCount++;
          continue;
        }

        // 检查是否已注册
        if (Model.has(modelDef.name)) {
          if (reload) {
            // 🆕 v1.1.7: reload 模式 — 替换已有定义
            Model.redefine(modelDef.name, modelDef);
            successCount++;
            if (this.logger) {
              this.logger.debug(
                `[Model] 🔄 Reloaded: ${modelDef.name} from ${path.relative(process.cwd(), file)}`,
              );
            }
          } else {
            // 默认模式：跳过（保持原有行为）
            this.logger.debug(
              `[Model] Model '${modelDef.name}' already registered, skipping ${file}`,
            );
          }
          continue;
        }

        // 注册 Model
        Model.define(modelDef.name, modelDef);
        successCount++;

        if (this.logger) {
          this.logger.debug(
            `[Model] ✅ Loaded: ${modelDef.name} from ${path.relative(process.cwd(), file)}`,
          );
        }
      } catch (err) {
        errorCount++;
        if (this.logger) {
          this.logger.error(
            `[Model] ❌ Failed to load ${path.relative(process.cwd(), file)}:`,
            err.message,
          );
        }
      }
    }

    if (this.logger) {
      this.logger.info(`[Model] Auto-load complete`, {
        scanned: files.length,
        success: successCount,
        errors: errorCount,
        totalModels: Model.list().length,
        reload,
      });
    }
  }

  /**
   * 定义 Saga
   * @param {Object} config - Saga 配置
   * @param {string} config.name - Saga 名称
   * @param {Array} config.steps - Saga 步骤列表
   * @returns {SagaDefinition} Saga 定义实例
   */
  defineSaga(config) {
    return this._sagaOrchestrator.defineSaga(config);
  }

  /**
   * 执行 Saga
   * @param {string} sagaName - Saga 名称
   * @param {Object} data - 执行数据
   * @returns {Promise<Object>} 执行结果
   */
  async executeSaga(sagaName, data) {
    return await this._sagaOrchestrator.execute(sagaName, data);
  }

  /**
   * 列出所有已定义的 Saga
   * @returns {Promise<string[]>} Saga 名称列表
   */
  async listSagas() {
    return await this._sagaOrchestrator.listSagas();
  }

  /**
   * 获取 Saga 统计信息
   * @returns {Object} 统计信息
   */
  getSagaStats() {
    return this._sagaOrchestrator.getStats();
  }

  /**
   * 关闭数据库连接和同步
   * @returns {Promise<void>}
   */
  async close() {
    // 停止 Change Stream 同步
    if (this._syncManager) {
      await this._syncManager.stop();
      this._syncManager = null;
      this.logger.info("[MonSQLize] Change Stream 同步已停止");
    }

    // 关闭多连接池
    if (this._poolManager) {
      await this._poolManager.close();
      this._poolManager = null;
      this.logger.info("[MonSQLize] 连接池已关闭");
    }

    // 关闭主连接
    if (this._adapter && typeof this._adapter.close === "function") {
      await this._adapter.close();
      this.logger.info("[MonSQLize] 数据库连接已关闭");
    }

    // 清理所有引用，防止内存泄漏
    this._adapter = null;
    this.dbInstance = null;
    this._connecting = null;

    // 清理 ModelInstance 缓存
    if (this._modelInstances) {
      this._modelInstances.clear();
      this._modelInstances = null;
    }

    return null;
  }
};

// ========== 导出 Model 类 ==========
module.exports.Model = require("./model");

// ========== 导出 ConnectionPoolManager ==========
// 🆕 v1.0.8: 多连接池管理
module.exports.ConnectionPoolManager = require("./infrastructure/ConnectionPoolManager");

// ========== 导出表达式工厂函数 ==========
// 🆕 v1.0.9: 统一表达式语法
const createExpression = require("./expression");

// 导出表达式创建函数
module.exports.expr = createExpression; // v1.0.9: 统一表达式语法 ⭐
module.exports.createExpression = createExpression; // 完整版别名

// ========== 导出函数缓存 ==========
// 🆕 v1.1.4: 通用函数缓存
const { withCache, FunctionCache } = require("./function-cache");

module.exports.withCache = withCache;
module.exports.FunctionCache = FunctionCache;
