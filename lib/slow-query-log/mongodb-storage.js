/**
 * MongoDB慢查询日志存储实现
 * 实现方案B（更新记录去重）
 *
 * @version 1.3.0
 * @since 2025-12-22
 */

const { ISlowQueryLogStorage } = require('./base-storage');
const { generateQueryHash } = require('./query-hash');

class MongoDBSlowQueryLogStorage extends ISlowQueryLogStorage {
  /**
   * 创建MongoDB存储实例
   * @param {Object} config - 存储配置
   * @param {string} [config.uri] - MongoDB连接URI（独立连接时）
   * @param {string} [config.database='admin'] - 存储数据库
   * @param {string} [config.collection='slow_query_logs'] - 存储集合
   * @param {number} [config.ttl=604800] - TTL过期时间（秒）
   * @param {string} [config.ttlField='lastSeen'] - TTL字段
   * @param {Object} [client] - MongoDB客户端（复用连接时）
   * @param {Object} [logger] - 日志记录器
   */
  constructor(config, client, logger) {
    super();
    this.config = config;
    this.client = client;  // 可能是复用的业务连接
    this.ownClient = null;  // 独立连接（如果创建）
    this.collection = null;
    this.logger = logger || console;
    this.initialized = false;
  }

  /**
   * 初始化存储（连接+创建索引）
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 如果没有传入client，创建独立连接
      if (!this.client) {
        if (!this.config.uri) {
          throw new Error('MongoDB URI is required when client is not provided');
        }

        const { MongoClient } = require('mongodb');
        this.ownClient = await MongoClient.connect(this.config.uri);
        this.client = this.ownClient;

        if (this.logger.info) {
          this.logger.info(`[SlowQueryLog] Connected to MongoDB: ${this.config.uri}`);
        }
      }

      // 获取数据库和集合
      const dbName = this.config.database || 'admin';
      const collName = this.config.collection || 'slow_query_logs';

      this.db = this.client.db(dbName);
      this.collection = this.db.collection(collName);

      // 创建索引
      await this.setupIndexes();

      this.initialized = true;

      if (this.logger.info) {
        this.logger.info(
          `[SlowQueryLog] Initialized MongoDB storage: ${dbName}.${collName}`
        );
      }
    } catch (err) {
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to initialize MongoDB storage:', err);
      }
      throw err;
    }
  }

  /**
   * 创建索引
   * @returns {Promise<void>}
   */
  async setupIndexes() {
    try {
      // 索引1：queryHash唯一索引（去重关键）
      await this.collection.createIndex(
        { queryHash: 1 },
        { unique: true, name: 'idx_queryHash_unique' }
      );

      // 索引2：lastSeen TTL索引（自动过期）
      const ttl = this.config.ttl || 7 * 24 * 3600;
      const ttlField = this.config.ttlField || 'lastSeen';

      await this.collection.createIndex(
        { [ttlField]: 1 },
        {
          name: 'idx_lastSeen_ttl',
          expireAfterSeconds: ttl
        }
      );

      // 索引3：按集合查询（辅助索引）
      await this.collection.createIndex(
        { db: 1, collection: 1 },
        { name: 'idx_db_collection' }
      );

      // 索引4：按执行次数查询（找高频慢查询）
      await this.collection.createIndex(
        { count: -1 },
        { name: 'idx_count_desc' }
      );

      if (this.logger.debug) {
        this.logger.debug('[SlowQueryLog] MongoDB indexes created successfully');
      }
    } catch (err) {
      // 索引创建失败不应该阻塞功能
      if (this.logger.warn) {
        this.logger.warn('[SlowQueryLog] Failed to create some indexes:', err.message);
      }
    }
  }

  /**
   * 保存单条慢查询日志（upsert）
   * @param {Object} log - 慢查询日志对象
   * @returns {Promise<void>}
   */
  async save(log) {
    if (!this.initialized) {
      await this.initialize();
    }

    const queryHash = generateQueryHash(log);
    await this.upsert(queryHash, log);
  }

  /**
   * 批量保存慢查询日志（bulkWrite + upsert）
   * @param {Object[]} logs - 慢查询日志数组
   * @returns {Promise<void>}
   */
  async saveBatch(logs) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!logs || logs.length === 0) {
      return;
    }

    try {
      // 构建bulkWrite操作数组
      const operations = logs.map(log => {
        const queryHash = generateQueryHash(log);
        const timestamp = log.timestamp || new Date();
        const executionTimeMs = log.executionTimeMs || log.ms || 0;

        return {
          updateOne: {
            filter: { queryHash },
            update: {
              $set: {
                lastSeen: timestamp,
                lastExecution: {
                  executionTimeMs,
                  timestamp,
                  metadata: log.metadata || {}
                }
              },
              $inc: {
                count: 1,
                totalTimeMs: executionTimeMs
              },
              $min: { minTimeMs: executionTimeMs },
              $max: { maxTimeMs: executionTimeMs },
              $setOnInsert: {
                queryHash,
                db: log.db,
                collection: log.collection || log.coll,
                operation: log.operation || log.op,
                queryShape: log.queryShape || {},
                type: log.type || 'mongodb',
                firstSeen: timestamp
              }
            },
            upsert: true
          }
        };
      });

      // 批量写入（ordered=false 允许部分失败）
      const result = await this.collection.bulkWrite(operations, { ordered: false });

      if (this.logger.debug) {
        this.logger.debug(
          `[SlowQueryLog] Batch saved: ${result.upsertedCount} inserted, ` +
          `${result.modifiedCount} updated`
        );
      }
    } catch (err) {
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to save batch:', err);
      }
      throw err;
    }
  }

  /**
   * 单条upsert操作
   * @param {string} queryHash - 查询Hash
   * @param {Object} log - 慢查询日志对象
   * @returns {Promise<void>}
   */
  async upsert(queryHash, log) {
    const timestamp = log.timestamp || new Date();
    const executionTimeMs = log.executionTimeMs || log.ms || 0;

    await this.collection.updateOne(
      { queryHash },
      {
        $set: {
          lastSeen: timestamp,
          lastExecution: {
            executionTimeMs,
            timestamp,
            metadata: log.metadata || {}
          }
        },
        $inc: {
          count: 1,
          totalTimeMs: executionTimeMs
        },
        $min: { minTimeMs: executionTimeMs },
        $max: { maxTimeMs: executionTimeMs },
        $setOnInsert: {
          queryHash,
          db: log.db,
          collection: log.collection || log.coll,
          operation: log.operation || log.op,
          queryShape: log.queryShape || {},
          type: log.type || 'mongodb',
          firstSeen: timestamp
        }
      },
      { upsert: true }
    );
  }

  /**
   * 查询慢查询日志
   * @param {Object} filter - 查询条件
   * @param {Object} options - 查询选项
   * @returns {Promise<Object[]>}
   */
  async query(filter = {}, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const cursor = this.collection.find(filter);

      if (options.sort) {
        cursor.sort(options.sort);
      }
      if (options.limit) {
        cursor.limit(options.limit);
      }
      if (options.skip) {
        cursor.skip(options.skip);
      }

      const results = await cursor.toArray();

      // 计算avgTimeMs（动态计算）
      return results.map(doc => ({
        ...doc,
        avgTimeMs: doc.count > 0 ? Math.round(doc.totalTimeMs / doc.count) : 0
      }));
    } catch (err) {
      if (this.logger.error) {
        this.logger.error('[SlowQueryLog] Failed to query:', err);
      }
      return [];
    }
  }

  /**
   * 关闭连接
   * @returns {Promise<void>}
   */
  async close() {
    // 只关闭自己创建的连接，不关闭复用的连接
    if (this.ownClient) {
      try {
        await this.ownClient.close();
        if (this.logger.info) {
          this.logger.info('[SlowQueryLog] MongoDB connection closed');
        }
      } catch (err) {
        if (this.logger.error) {
          this.logger.error('[SlowQueryLog] Failed to close MongoDB connection:', err);
        }
      }
      this.ownClient = null;
    }

    this.client = null;
    this.collection = null;
    this.initialized = false;
  }
}

module.exports = { MongoDBSlowQueryLogStorage };

