/**
 * 慢查询日志配置管理器
 * 负责配置合并、验证和默认值处理
 *
 * @version 1.3.0
 * @since 2025-12-22
 */

// 默认配置
const DEFAULT_CONFIG = {
  enabled: false,

  storage: {
    type: null,  // null = 自动推断
    useBusinessConnection: true,
    uri: null,

    mongodb: {
      database: 'admin',
      collection: 'slow_query_logs',
      ttl: 7 * 24 * 3600,  // 7天
      ttlField: 'lastSeen'
    }
  },

  deduplication: {
    enabled: true,
    strategy: 'aggregate',
    keepRecentExecutions: 0
  },

  batch: {
    enabled: true,
    size: 10,
    interval: 5000,
    maxBufferSize: 100
  },

  filter: {
    excludeDatabases: [],
    excludeCollections: [],
    excludeOperations: [],
    minExecutionTimeMs: 0
  },

  advanced: {
    autoCreateIndexes: true,
    validateConnection: true,
    errorHandling: 'log',  // log | throw | silent
    debug: false
  }
};

class SlowQueryLogConfigManager {
  /**
   * 合并用户配置与默认配置
   * @param {*} userConfig - 用户配置（可以是boolean或object）
   * @param {string} businessType - 业务库类型
   * @returns {Object} 合并后的完整配置
   */
  static mergeConfig(userConfig, businessType) {
    // 场景1：未配置（默认禁用）
    if (userConfig === undefined || userConfig === null) {
      return { ...deepClone(DEFAULT_CONFIG), enabled: false };
    }

    // 场景2：boolean快捷配置
    if (typeof userConfig === 'boolean') {
      const config = deepClone(DEFAULT_CONFIG);
      config.enabled = userConfig;

      // 自动推断storage.type
      if (userConfig && businessType) {
        config.storage.type = businessType;
      }

      return config;
    }

    // 场景3：对象配置（深度合并）
    if (typeof userConfig === 'object') {
      const merged = deepMerge(deepClone(DEFAULT_CONFIG), userConfig);

      // 智能推断：如果提供了storage配置，自动启用
      if (userConfig.storage && merged.enabled === false) {
        merged.enabled = true;
      }

      // 自动推断storage.type
      if (merged.storage.type === null && businessType) {
        if (merged.storage.useBusinessConnection) {
          merged.storage.type = businessType;
        } else {
          merged.storage.type = 'mongodb';  // 独立连接默认MongoDB
        }
      }

      return merged;
    }

    throw new Error('Invalid slowQueryLog config type. Expected boolean or object');
  }

  /**
   * 验证配置合法性
   * @param {Object} config - 配置对象
   * @param {string} businessType - 业务库类型
   * @throws {Error} 配置错误时抛出异常
   */
  static validate(config, businessType) {
    const { storage } = config;

    // 验证storage.type
    const validTypes = ['mongodb', 'postgresql', 'mysql', 'file', 'custom'];
    if (storage.type && !validTypes.includes(storage.type)) {
      throw new Error(
        `Invalid storage.type: ${storage.type}. ` +
        `Valid types are: ${validTypes.join(', ')}`
      );
    }

    // 验证复用连接的类型一致性
    if (storage.useBusinessConnection === true) {
      if (storage.type && storage.type !== businessType) {
        throw new Error(
          `Cannot use business connection when storage type (${storage.type}) ` +
          `differs from business type (${businessType}). ` +
          `Set useBusinessConnection=false and provide storage.uri`
        );
      }
    } else {
      // 验证独立连接的uri
      if (!storage.uri) {
        throw new Error(
          'storage.uri is required when useBusinessConnection=false'
        );
      }
    }

    // 验证deduplication.strategy
    const validStrategies = ['aggregate', 'none'];
    if (!validStrategies.includes(config.deduplication.strategy)) {
      throw new Error(
        `Invalid deduplication.strategy: ${config.deduplication.strategy}. ` +
        `Valid strategies are: ${validStrategies.join(', ')}`
      );
    }

    // 验证TTL
    if (storage.mongodb.ttl < 0) {
      throw new Error('storage.mongodb.ttl must be positive');
    }

    // 验证batch配置
    if (config.batch.size < 1 || config.batch.size > 1000) {
      throw new Error('batch.size must be between 1 and 1000');
    }

    if (config.batch.interval < 100) {
      throw new Error('batch.interval must be >= 100ms');
    }

    return true;
  }
}

/**
 * 深度克隆对象
 * @param {Object} obj - 源对象
 * @returns {Object} 克隆后的对象
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 深度合并对象
 * @param {Object} target - 目标对象
 * @param {Object} source - 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

module.exports = { SlowQueryLogConfigManager, DEFAULT_CONFIG };


