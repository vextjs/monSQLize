/**
 * 表达式编译缓存
 * 使用 LRU 缓存策略
 */

class ExpressionCache {
  /**
   * @param {Object} options - 缓存配置
   * @param {number} options.maxSize - 最大缓存数量，默认 1000
   * @param {boolean} options.enabled - 是否启用缓存，默认 true
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 1000;
    this.enabled = options.enabled !== false;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * 生成缓存键
   * @param {string} expression - 表达式字符串
   * @param {string} targetDB - 目标数据库
   * @returns {string} 缓存键
   */
  _generateKey(expression, targetDB = 'mongodb') {
    return `${targetDB}:${expression}`;
  }

  /**
   * 获取缓存
   * @param {string} expression - 表达式字符串
   * @param {string} targetDB - 目标数据库
   * @returns {*} 缓存的编译结果，不存在则返回 null
   */
  get(expression, targetDB = 'mongodb') {
    if (!this.enabled) {
      return null;
    }

    const key = this._generateKey(expression, targetDB);

    if (this.cache.has(key)) {
      this.stats.hits++;
      // LRU: 将访问的项移到最后
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * 设置缓存
   * @param {string} expression - 表达式字符串
   * @param {*} compiled - 编译结果
   * @param {string} targetDB - 目标数据库
   */
  set(expression, compiled, targetDB = 'mongodb') {
    if (!this.enabled) {
      return;
    }

    const key = this._generateKey(expression, targetDB);

    // 如果缓存已满，删除最旧的项（Map 的第一个项）
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      this.stats.evictions++;
    }

    this.cache.set(key, compiled);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  /**
   * 获取缓存统计
   * @returns {Object} 缓存统计
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(2) : '0.00';

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: `${hitRate}%`,
      enabled: this.enabled
    };
  }
}

module.exports = ExpressionCache;

