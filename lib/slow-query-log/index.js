/**
 * 慢查询日志模块导出
 *
 * @version 1.3.0
 * @since 2025-12-22
 */

const { ISlowQueryLogStorage } = require('./base-storage');
const { MongoDBSlowQueryLogStorage } = require('./mongodb-storage');
const { BatchQueue } = require('./batch-queue');
const { generateQueryHash } = require('./query-hash');
const { SlowQueryLogConfigManager, DEFAULT_CONFIG } = require('./config-manager');

/**
 * 慢查询日志管理器
 * 统一管理存储、队列、配置
 */
class SlowQueryLogManager {
  /**
   * 创建慢查询日志管理器
   * @param {Object} userConfig - 用户配置
   * @param {Object} [businessClient] - 业务数据库客户端（复用连接时）
   * @param {string} businessType - 业务数据库类型
   * @param {Object} logger - 日志记录器
   */
  constructor(userConfig, businessClient, businessType, logger) {
    this.logger = logger || console;

    // 合并配置
    this.config = SlowQueryLogConfigManager.mergeConfig(userConfig, businessType);

    // 验证配置
    SlowQueryLogConfigManager.validate(this.config, businessType);

    // 初始化存储适配器
    this.storage = this.createStorage(businessClient);

    // 初始化批量队列
    if (this.config.batch.enabled) {
      this.queue = new BatchQueue(this.storage, this.config.batch, this.logger);
    } else {
      this.queue = null;
    }

    this.initialized = false;
  }

  /**
   * 创建存储适配器
   * @param {Object} businessClient - 业务数据库客户端
   * @returns {ISlowQueryLogStorage}
   */
  createStorage(businessClient) {
    const { storage } = this.config;

    // 根据存储类型创建适配器
    switch (storage.type) {
      case 'mongodb': {
        const client = storage.useBusinessConnection ? businessClient : null;
        return new MongoDBSlowQueryLogStorage(
          storage.mongodb,
          client,
          this.logger
        );
      }

      case 'postgresql':
      case 'mysql':
      case 'file':
      case 'custom':
        throw new Error(
          `Storage type '${storage.type}' is not yet implemented. ` +
          `Currently only 'mongodb' is supported in v1.3`
        );

      default:
        throw new Error(`Unknown storage type: ${storage.type}`);
    }
  }

  /**
   * 初始化（延迟初始化）
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      await this.storage.initialize();
      this.initialized = true;

      if (this.logger.info) {
        this.logger.info('[SlowQueryLog] Manager initialized successfully');
      }
    } catch (err) {
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to initialize manager:', err);
      }

      // 根据错误处理策略决定是否抛出异常
      if (this.config.advanced.errorHandling === 'throw') {
        throw err;
      }
    }
  }

  /**
   * 保存慢查询日志
   * @param {Object} log - 慢查询日志对象
   * @returns {Promise<void>}
   */
  async save(log) {
    // 延迟初始化
    if (!this.initialized) {
      await this.initialize();
    }

    // 过滤检查
    if (this.shouldFilter(log)) {
      return;
    }

    try {
      if (this.queue) {
        // 批量模式：添加到队列
        await this.queue.add(log);
      } else {
        // 实时模式：直接保存
        await this.storage.save(log);
      }
    } catch (err) {
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to save log:', err);
      }

      // 保存失败不抛异常（不影响主流程）
      if (this.config.advanced.errorHandling === 'throw') {
        throw err;
      }
    }
  }

  /**
   * 检查是否应该过滤该日志
   * @param {Object} log - 慢查询日志对象
   * @returns {boolean}
   */
  shouldFilter(log) {
    const { filter } = this.config;

    // 检查数据库过滤
    if (filter.excludeDatabases.length > 0) {
      if (filter.excludeDatabases.includes(log.db)) {
        return true;
      }
    }

    // 检查集合过滤
    if (filter.excludeCollections.length > 0) {
      const coll = log.collection || log.coll;
      if (filter.excludeCollections.includes(coll)) {
        return true;
      }
    }

    // 检查操作类型过滤
    if (filter.excludeOperations.length > 0) {
      const op = log.operation || log.op;
      if (filter.excludeOperations.includes(op)) {
        return true;
      }
    }

    // 检查最小执行时间
    if (filter.minExecutionTimeMs > 0) {
      const ms = log.executionTimeMs || log.ms || 0;
      if (ms < filter.minExecutionTimeMs) {
        return true;
      }
    }

    return false;
  }

  /**
   * 查询慢查询日志
   * @param {Object} filter - 查询条件
   * @param {Object} options - 查询选项
   * @returns {Promise<Object[]>}
   */
  async query(filter, options) {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.storage.query(filter, options);
  }

  /**
   * 关闭管理器
   * @returns {Promise<void>}
   */
  async close() {
    try {
      // 关闭队列（确保数据不丢失）
      if (this.queue) {
        await this.queue.close();
      }

      // 关闭存储
      await this.storage.close();

      this.initialized = false;

      if (this.logger.info) {
        this.logger.info('[SlowQueryLog] Manager closed');
      }
    } catch (err) {
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to close manager:', err);
      }
    }
  }
}

module.exports = {
  SlowQueryLogManager,
  SlowQueryLogConfigManager,
  MongoDBSlowQueryLogStorage,
  BatchQueue,
  generateQueryHash,
  DEFAULT_CONFIG,
  ISlowQueryLogStorage
};

