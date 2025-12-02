/**
 * MongoDB Server 特性探测模块
 * 检测 MongoDB Server 版本和支持的特性
 *
 * 使用方式:
 * ```javascript
 * const ServerFeatures = require('./lib/common/server-features');
 *
 * // 方式 1: 传入 monSQLize 实例
 * const msq = new MonSQLize({ ... });
 * await msq.connect();
 * const features = new ServerFeatures(msq);
 * const report = await features.generateFeatureReport();
 *
 * // 方式 2: 传入原生 MongoDB client
 * const { MongoClient } = require('mongodb');
 * const client = await MongoClient.connect(uri);
 * const features = new ServerFeatures(client);
 * ```
 *
 * @module lib/common/server-features
 */

/**
 * Server 特性探测类
 */
class ServerFeatures {
  constructor(clientOrInstance) {
    // 智能识别输入类型
    if (clientOrInstance._adapter && clientOrInstance._adapter.client) {
      // monSQLize 实例（有 _adapter 属性）
      this.client = clientOrInstance._adapter.client;
    } else if (clientOrInstance.client && typeof clientOrInstance.client.db === 'function') {
      // adapter 实例（有 client 属性）
      this.client = clientOrInstance.client;
    } else if (typeof clientOrInstance.db === 'function') {
      // 原生 MongoDB client
      this.client = clientOrInstance;
    } else {
      // 无法识别的类型
      throw new Error('ServerFeatures: Invalid client type. Expected MongoClient, adapter, or monSQLize instance.');
    }

    this.serverVersion = null;
    this.serverInfo = null;
  }

  /**
   * 获取 MongoDB Server 版本信息
   * @returns {Promise<Object>} 版本信息
   */
  async getServerInfo() {
    if (this.serverInfo) {
      return this.serverInfo;
    }

    try {
      const admin = this.client.db().admin();
      const buildInfo = await admin.buildInfo();

      this.serverInfo = {
        version: buildInfo.version,
        versionArray: buildInfo.versionArray,
        gitVersion: buildInfo.gitVersion,
        bits: buildInfo.bits,
        maxBsonObjectSize: buildInfo.maxBsonObjectSize,
      };

      this.serverVersion = this.serverInfo.versionArray;

      return this.serverInfo;
    } catch (error) {
      console.error('获取 Server 信息失败:', error);
      return null;
    }
  }

  /**
   * 获取主版本号
   * @returns {Promise<number>} 主版本号
   */
  async getMajorVersion() {
    if (!this.serverVersion) {
      await this.getServerInfo();
    }
    return this.serverVersion ? this.serverVersion[0] : 0;
  }

  /**
   * 获取次版本号
   * @returns {Promise<number>} 次版本号
   */
  async getMinorVersion() {
    if (!this.serverVersion) {
      await this.getServerInfo();
    }
    return this.serverVersion ? this.serverVersion[1] : 0;
  }

  /**
   * 检查是否支持事务
   * @returns {Promise<boolean>}
   */
  async supportsTransactions() {
    const major = await this.getMajorVersion();
    // MongoDB 4.0+ 支持事务（副本集）
    return major >= 4;
  }

  /**
   * 检查是否支持多文档事务
   * @returns {Promise<boolean>}
   */
  async supportsMultiDocumentTransactions() {
    const major = await this.getMajorVersion();
    // MongoDB 4.0+ 副本集支持，4.2+ 分片集群支持
    return major >= 4;
  }

  /**
   * 检查是否支持通配符索引
   * @returns {Promise<boolean>}
   */
  async supportsWildcardIndexes() {
    const major = await this.getMajorVersion();
    const minor = await this.getMinorVersion();
    // MongoDB 4.2+ 支持通配符索引
    return major > 4 || (major === 4 && minor >= 2);
  }

  /**
   * 检查是否支持 $function 操作符
   * @returns {Promise<boolean>}
   */
  async supportsFunctionOperator() {
    const major = await this.getMajorVersion();
    const minor = await this.getMinorVersion();
    // MongoDB 4.4+ 支持 $function
    return major > 4 || (major === 4 && minor >= 4);
  }

  /**
   * 检查是否支持 $setWindowFields 操作符
   * @returns {Promise<boolean>}
   */
  async supportsSetWindowFields() {
    const major = await this.getMajorVersion();
    // MongoDB 5.0+ 支持 $setWindowFields
    return major >= 5;
  }

  /**
   * 检查是否支持时间序列集合
   * @returns {Promise<boolean>}
   */
  async supportsTimeSeriesCollections() {
    const major = await this.getMajorVersion();
    // MongoDB 5.0+ 支持时间序列集合
    return major >= 5;
  }

  /**
   * 检查是否支持加密字段
   * @returns {Promise<boolean>}
   */
  async supportsEncryptedFields() {
    const major = await this.getMajorVersion();
    // MongoDB 6.0+ 支持 Queryable Encryption
    return major >= 6;
  }

  /**
   * 检查是否支持聚合表达式
   * @param {string} expression - 表达式名称（如 '$dateAdd'）
   * @returns {Promise<boolean>}
   */
  async supportsAggregationExpression(expression) {
    const major = await this.getMajorVersion();
    const minor = await this.getMinorVersion();

    // 常见聚合表达式的版本要求
    const expressionVersions = {
      '$function': { major: 4, minor: 4 },
      '$setWindowFields': { major: 5, minor: 0 },
      '$dateAdd': { major: 5, minor: 0 },
      '$dateDiff': { major: 5, minor: 0 },
      '$dateSubtract': { major: 5, minor: 0 },
      '$dateTrunc': { major: 5, minor: 0 },
      '$getField': { major: 5, minor: 0 },
      '$setField': { major: 5, minor: 0 },
    };

    const required = expressionVersions[expression];
    if (!required) {
      // 未知表达式，假设支持
      return true;
    }

    return major > required.major ||
           (major === required.major && minor >= required.minor);
  }

  /**
   * 生成特性支持报告
   * @returns {Promise<Object>} 特性报告
   */
  async generateFeatureReport() {
    const info = await this.getServerInfo();

    return {
      serverVersion: info ? info.version : 'Unknown',
      features: {
        transactions: await this.supportsTransactions(),
        multiDocumentTransactions: await this.supportsMultiDocumentTransactions(),
        wildcardIndexes: await this.supportsWildcardIndexes(),
        functionOperator: await this.supportsFunctionOperator(),
        setWindowFields: await this.supportsSetWindowFields(),
        timeSeriesCollections: await this.supportsTimeSeriesCollections(),
        encryptedFields: await this.supportsEncryptedFields(),
      },
      aggregationExpressions: {
        '$function': await this.supportsAggregationExpression('$function'),
        '$setWindowFields': await this.supportsAggregationExpression('$setWindowFields'),
        '$dateAdd': await this.supportsAggregationExpression('$dateAdd'),
      },
    };
  }
}

module.exports = ServerFeatures;

