/**
 * 慢查询日志存储接口
 * 所有存储适配器必须实现此接口
 *
 * @version 1.3.0
 * @since 2025-12-22
 */

class ISlowQueryLogStorage {
  /**
   * 初始化存储（创建集合/表、索引等）
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('ISlowQueryLogStorage.initialize() must be implemented');
  }

  /**
   * 保存单条慢查询日志
   * @param {Object} log - 慢查询日志对象
   * @param {string} log.db - 数据库名
   * @param {string} log.collection - 集合名
   * @param {string} log.operation - 操作类型
   * @param {Object} log.queryShape - 查询模式（已脱敏）
   * @param {number} log.executionTimeMs - 执行时间（毫秒）
   * @param {Date} log.timestamp - 时间戳
   * @param {Object} [log.metadata] - 扩展元数据
   * @returns {Promise<void>}
   */
  async save(log) {
    throw new Error('ISlowQueryLogStorage.save() must be implemented');
  }

  /**
   * 批量保存慢查询日志
   * @param {Object[]} logs - 慢查询日志数组
   * @returns {Promise<void>}
   */
  async saveBatch(logs) {
    throw new Error('ISlowQueryLogStorage.saveBatch() must be implemented');
  }

  /**
   * 查询慢查询日志
   * @param {Object} filter - 查询条件
   * @param {string} [filter.db] - 数据库名
   * @param {string} [filter.collection] - 集合名
   * @param {string} [filter.operation] - 操作类型
   * @param {Object} options - 查询选项
   * @param {Object} [options.sort] - 排序规则
   * @param {number} [options.limit] - 限制数量
   * @param {number} [options.skip] - 跳过数量
   * @returns {Promise<Object[]>}
   */
  async query(filter, options) {
    throw new Error('ISlowQueryLogStorage.query() must be implemented');
  }

  /**
   * 关闭连接
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('ISlowQueryLogStorage.close() must be implemented');
  }
}

module.exports = { ISlowQueryLogStorage };

