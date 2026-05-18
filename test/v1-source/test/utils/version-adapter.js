/**
 * 版本适配器 - 处理不同 Node.js 和 MongoDB Driver 版本的差异
 * @module test/utils/version-adapter
 */

const semver = require('semver');

/**
 * 版本适配器类
 */
class VersionAdapter {
  constructor() {
    this.nodeVersion = process.version;
    this.mongodbDriverVersion = this._getMongoDBDriverVersion();
  }

  /**
   * 获取 MongoDB Driver 版本
   * @private
   * @returns {string} 驱动版本号
   */
  _getMongoDBDriverVersion() {
    try {
      const mongodb = require('mongodb');
      // mongodb 包没有直接暴露版本号，需要从 package.json 读取
      const mongodbPackage = require('mongodb/package.json');
      return mongodbPackage.version;
    } catch (error) {
      console.warn('⚠️  无法获取 MongoDB Driver 版本:', error.message);
      return '0.0.0';
    }
  }

  /**
   * 检测当前 Node.js 版本
   * @returns {Object} 版本信息
   */
  getNodeInfo() {
    return {
      version: this.nodeVersion,
      major: parseInt(this.nodeVersion.split('.')[0].slice(1)),
      raw: process.version,
    };
  }

  /**
   * 检测当前 MongoDB Driver 版本
   * @returns {Object} 版本信息
   */
  getDriverInfo() {
    return {
      version: this.mongodbDriverVersion,
      major: parseInt(this.mongodbDriverVersion.split('.')[0]),
      raw: this.mongodbDriverVersion,
    };
  }

  /**
   * 判断是否支持 Worker Threads
   * @returns {boolean}
   */
  supportsWorkerThreads() {
    const nodeInfo = this.getNodeInfo();
    return nodeInfo.major >= 16;
  }

  /**
   * 判断是否支持性能计时 API (performance.now)
   * @returns {boolean}
   */
  supportsPerformanceNow() {
    try {
      const { performance } = require('perf_hooks');
      return typeof performance.now === 'function';
    } catch {
      return false;
    }
  }

  /**
   * 判断是否支持 Promise.allSettled
   * @returns {boolean}
   */
  supportsPromiseAllSettled() {
    return typeof Promise.allSettled === 'function';
  }

  /**
   * 适配 findOneAndUpdate 返回值
   * MongoDB Driver 6.x 默认返回文档，5.x 返回 { value, ok, lastErrorObject }
   * @param {Object} result - 原始结果
   * @param {Object} options - 查询选项
   * @returns {Object} 统一格式的结果
   */
  adaptFindOneAndUpdateResult(result, options = {}) {
    const driverInfo = this.getDriverInfo();

    // Driver 6.x: 默认返回文档，除非设置 includeResultMetadata: true
    if (driverInfo.major >= 6) {
      if (options.includeResultMetadata === true) {
        // 已经是完整元数据格式
        return result;
      } else {
        // 直接返回文档，包装成统一格式
        return {
          value: result,
          ok: result ? 1 : 0,
        };
      }
    }

    // Driver 5.x 及更早：默认返回完整元数据
    if (result && typeof result === 'object' && 'value' in result) {
      return result;
    }

    // 兜底：假设返回的是文档
    return {
      value: result,
      ok: result ? 1 : 0,
    };
  }

  /**
   * 适配 findOneAndReplace 返回值
   * @param {Object} result - 原始结果
   * @param {Object} options - 查询选项
   * @returns {Object} 统一格式的结果
   */
  adaptFindOneAndReplaceResult(result, options = {}) {
    return this.adaptFindOneAndUpdateResult(result, options);
  }

  /**
   * 适配 findOneAndDelete 返回值
   * @param {Object} result - 原始结果
   * @param {Object} options - 查询选项
   * @returns {Object} 统一格式的结果
   */
  adaptFindOneAndDeleteResult(result, options = {}) {
    return this.adaptFindOneAndUpdateResult(result, options);
  }

  /**
   * 获取推荐的连接选项
   * Driver 4.x 需要 useNewUrlParser 等选项，6.x 会忽略
   * @returns {Object} 连接选项
   */
  getRecommendedConnectionOptions() {
    const driverInfo = this.getDriverInfo();

    if (driverInfo.major >= 6) {
      // Driver 6.x: 简化选项（这些选项已被忽略）
      return {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      };
    } else if (driverInfo.major >= 5) {
      // Driver 5.x
      return {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      };
    } else {
      // Driver 4.x: 必须设置这些选项
      return {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        poolSize: 10,
        serverSelectionTimeoutMS: 5000,
      };
    }
  }

  /**
   * 生成版本报告
   * @returns {Object} 版本信息报告
   */
  generateReport() {
    const nodeInfo = this.getNodeInfo();
    const driverInfo = this.getDriverInfo();

    return {
      node: {
        version: nodeInfo.version,
        major: nodeInfo.major,
        features: {
          workerThreads: this.supportsWorkerThreads(),
          performanceNow: this.supportsPerformanceNow(),
          promiseAllSettled: this.supportsPromiseAllSettled(),
        },
      },
      mongodbDriver: {
        version: driverInfo.version,
        major: driverInfo.major,
        features: {
          simplifiedFindOneAnd: driverInfo.major >= 6,
          modernConnectionOptions: driverInfo.major >= 6,
        },
      },
      compatibility: {
        recommendedConnectionOptions: this.getRecommendedConnectionOptions(),
        needsFindOneAndAdaptation: driverInfo.major >= 6,
      },
    };
  }
}

// 导出单例实例
module.exports = new VersionAdapter();
module.exports.VersionAdapter = VersionAdapter;

