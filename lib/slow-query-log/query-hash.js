/**
 * 慢查询Hash生成工具
 * 用于生成queryHash（去重标识）
 *
 * @version 1.3.0
 * @since 2025-12-22
 */

const crypto = require('crypto');

/**
 * 生成慢查询的唯一Hash标识
 * @param {Object} log - 慢查询日志对象
 * @param {string} log.db - 数据库名
 * @param {string} log.collection - 集合名
 * @param {string} log.operation - 操作类型
 * @param {Object} log.queryShape - 查询模式（已脱敏）
 * @returns {string} 16位Hash字符串
 */
function generateQueryHash(log) {
  // 构建唯一键（不包含executionTimeMs、timestamp等动态字段）
  const key = JSON.stringify({
    db: log.db || '',
    collection: log.collection || log.coll || '',
    operation: log.operation || log.op || '',
    queryShape: log.queryShape || {}
  });

  // 生成SHA256 Hash，取前16位
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex')
    .substring(0, 16);
}

module.exports = { generateQueryHash };


