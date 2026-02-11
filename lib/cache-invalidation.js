/**
 * 缓存精准失效引擎
 * @description 提供精准缓存失效功能，只清除受影响的查询缓存
 * @module lib/cache-invalidation
 */

const CacheFactory = require('./cache');

/**
 * 缓存精准失效引擎
 * @class
 */
class CacheInvalidationEngine {
  /**
   * 判断文档字段值是否匹配查询条件
   * @param {any} docValue - 文档字段值
   * @param {any} queryValue - 查询条件值
   * @returns {boolean} true=匹配, false=不匹配
   *
   * @example
   * matchesField('active', 'active') // → true
   * matchesField(25, { $gt: 20 }) // → true
   * matchesField('test', { $in: ['test', 'demo'] }) // → true
   */
  static matchesField(docValue, queryValue) {
    // 1. 简单等值匹配
    if (typeof queryValue !== 'object' || queryValue === null) {
      return docValue === queryValue;
    }

    // 2. $in 操作符
    if (queryValue.$in && Array.isArray(queryValue.$in)) {
      return queryValue.$in.includes(docValue);
    }

    // 3. $gt/$gte/$lt/$lte 操作符
    if (queryValue.$gt !== undefined) {
      return docValue > queryValue.$gt;
    }
    if (queryValue.$gte !== undefined) {
      return docValue >= queryValue.$gte;
    }
    if (queryValue.$lt !== undefined) {
      return docValue < queryValue.$lt;
    }
    if (queryValue.$lte !== undefined) {
      return docValue <= queryValue.$lte;
    }

    // 4. $ne 操作符
    if (queryValue.$ne !== undefined) {
      return docValue !== queryValue.$ne;
    }

    // 5. $exists 操作符
    if (queryValue.$exists !== undefined) {
      const exists = docValue !== undefined;
      return queryValue.$exists ? exists : !exists;
    }

    // 6. $eq 操作符（显式等值）
    if (queryValue.$eq !== undefined) {
      return docValue === queryValue.$eq;
    }

    // 7. 不支持的操作符 → 返回 false（跳过匹配）
    return false;
  }

  /**
   * 判断文档是否匹配查询条件
   * @param {Object} doc - 写入的文档
   * @param {Object} query - 查询条件
   * @returns {boolean} true=匹配(需要失效), false=不匹配
   *
   * @example
   * matchesQuery({ status: 'active' }, { status: 'active' }) // → true
   * matchesQuery({ status: 'inactive' }, { status: 'active' }) // → false
   * matchesQuery({ age: 25 }, { age: { $gt: 20 } }) // → true
   */
  static matchesQuery(doc, query) {
    // 1. 空查询或 null/undefined → 匹配所有
    if (!query || Object.keys(query).length === 0) {
      return true;
    }

    // 2. 逐字段检查（AND 逻辑）
    for (const [field, value] of Object.entries(query)) {
      if (!this.matchesField(doc[field], value)) {
        return false;  // 任何字段不匹配 → 不失效
      }
    }

    // 3. 所有字段都匹配 → 失效
    return true;
  }

  /**
   * 检测查询是否包含复杂操作符
   * @param {Object} query - 查询条件
   * @returns {boolean} true=包含复杂操作符
   *
   * @example
   * hasComplexOperators({ $or: [...] }) // → true
   * hasComplexOperators({ status: 'active' }) // → false
   */
  static hasComplexOperators(query) {
    if (!query || typeof query !== 'object') {
      return false;
    }

    // 复杂操作符列表（不支持精准失效）
    const complexOps = [
      '$or',        // 逻辑或
      '$nor',       // 逻辑非或
      '$and',       // 逻辑与（保守跳过，可选支持）
      '$expr',      // 表达式求值
      '$where',     // JavaScript 函数
      '$text',      // 全文检索
      '$regex',     // 正则匹配
      '$jsonSchema' // Schema 验证
    ];

    return complexOps.some(op => query[op] !== undefined);
  }

  /**
   * 从缓存键中提取查询条件
   * @param {string} cacheKey - 缓存键（stableStringify 序列化后的）
   * @returns {Object|null} 查询条件对象，无法解析返回 null
   *
   * @example
   * const key = '{"ns":{...},"op":"find","query":{"status":"active"},...}';
   * extractQueryFromKey(key) // → { status: 'active' }
   */
  static extractQueryFromKey(cacheKey) {
    try {
      // 缓存键格式: stableStringify({ns, op, query, projection, ...})
      // 注意：stableStringify 可能输出 undefined（不是有效 JSON），需要先替换
      const sanitizedKey = cacheKey.replace(/:undefined/g, ':null');
      const keyObj = JSON.parse(sanitizedKey);

      // 提取 query 字段
      if (keyObj && typeof keyObj === 'object' && keyObj.query !== undefined && keyObj.query !== null) {
        return keyObj.query;
      }

      return null;
    } catch (err) {
      // 解析失败，返回 null
      return null;
    }
  }

  /**
   * 合并 filter 和 update 构造文档（用于 upsert）
   * @param {Object} filter - 查询条件
   * @param {Object} update - 更新操作
   * @returns {Object} 合并后的文档
   *
   * @example
   * mergeFilterAndUpdate(
   *   { userId: 'user123' },
   *   { $set: { name: 'Alice', age: 25 } }
   * ) // → { userId: 'user123', name: 'Alice', age: 25 }
   */
  static mergeFilterAndUpdate(filter, update) {
    const doc = { ...filter };

    if (!update || typeof update !== 'object') {
      return doc;
    }

    // 提取 $set 字段
    if (update.$set && typeof update.$set === 'object') {
      Object.assign(doc, update.$set);
    }

    // 提取 $inc 字段（简化处理：假设增量字段也可能匹配）
    if (update.$inc && typeof update.$inc === 'object') {
      Object.assign(doc, update.$inc);
    }

    // 提取 $setOnInsert 字段（仅插入时）
    if (update.$setOnInsert && typeof update.$setOnInsert === 'object') {
      Object.assign(doc, update.$setOnInsert);
    }

    // 提取 $unset 字段（设为 undefined）
    if (update.$unset && typeof update.$unset === 'object') {
      for (const key of Object.keys(update.$unset)) {
        doc[key] = undefined;
      }
    }

    return doc;
  }

  /**
   * 精准失效缓存
   * @param {Object} cache - 缓存实例
   * @param {Object} context - 失效上下文
   * @param {string} context.instanceId - 实例ID
   * @param {string} context.type - 数据库类型
   * @param {string} context.db - 数据库名
   * @param {string} context.collection - 集合名
   * @param {Object} context.document - 受影响的文档
   * @param {string} context.operation - 操作类型
   * @returns {Promise<number>} 删除的缓存键数量
   *
   * @example
   * await invalidatePrecise(cache, {
   *   instanceId: 'test',
   *   type: 'mongodb',
   *   db: 'shop',
   *   collection: 'users',
   *   document: { status: 'active', name: 'Alice' },
   *   operation: 'insertOne'
   * })
   */
  static async invalidatePrecise(cache, context) {
    const { instanceId, type, db, collection, document, operation } = context;

    // 🆕 v1.1.6: 规范化 document 中的 ObjectId 为字符串
    // 确保与缓存键中的 query 格式一致（缓存键生成时已规范化）
    const CacheFactory = require('./cache');
    const normalizedDocument = CacheFactory._normalizeObjectIds(document);

    // Step 1: 构建 namespace 模式，获取集合的所有缓存键
    const pattern = CacheFactory.buildNamespacePattern({
      iid: instanceId,
      type,
      db,
      collection
    });
    const allKeys = cache.keys(pattern);

    // 没有缓存，直接返回
    if (!allKeys || allKeys.length === 0) {
      return 0;
    }

    // Step 2: 遍历每个缓存键，判断是否需要失效
    const keysToDelete = [];

    for (const key of allKeys) {
      // Step 2.1: 解析查询条件
      const query = this.extractQueryFromKey(key);
      if (query === null) {
        // 解析失败（返回 null），跳过该键
        continue;
      }

      // Step 2.2: 检测是否包含复杂操作符
      if (this.hasComplexOperators(query)) {
        // 复杂查询，跳过失效（按 TTL 自然过期）
        continue;
      }

      // Step 2.3: 判断文档是否匹配查询条件
      if (this.matchesQuery(normalizedDocument, query)) {
        // 匹配成功，标记为需要失效
        keysToDelete.push(key);
      }
    }

    // Step 3: 批量删除匹配的缓存键
    if (keysToDelete.length > 0) {
      const deleted = await cache.delMany(keysToDelete);
      return deleted;
    }

    return 0;
  }
}

module.exports = CacheInvalidationEngine;


