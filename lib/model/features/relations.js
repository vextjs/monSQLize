/**
 * RelationManager - 关系定义管理器
 *
 * 职责：
 * - 注册和管理 Model 之间的关系定义
 * - 验证关系配置的正确性
 * - 提供关系查询接口
 *
 * @class RelationManager
 */
class RelationManager {
  /**
   * 构造函数
   * @param {Model} model - 所属的 Model 实例
   */
  constructor(model) {
    this.model = model;
    this.relations = new Map(); // 关系定义缓存
  }

  /**
   * 注册关系定义
   * @param {string} name - 关系名称
   * @param {Object} config - 关系配置
   * @param {string} config.from - 关联的集合名称（MongoDB 原生）
   * @param {string} config.localField - 本地字段名
   * @param {string} config.foreignField - 外部字段名
   * @param {boolean} [config.single=false] - 是否返回单个文档
   */
  define(name, config) {
    this.validate(config); // 验证配置
    this.relations.set(name, this.normalize(config));
  }

  /**
   * 标准化配置（设置默认值）
   * @param {Object} config - 原始配置
   * @returns {Object} 标准化后的配置
   */
  normalize(config) {
    return {
      from: config.from,
      localField: config.localField,
      foreignField: config.foreignField,
      single: config.single !== undefined ? config.single : false // 默认返回数组
    };
  }

  /**
   * 获取关系定义
   * @param {string} name - 关系名称
   * @returns {Object|null} 关系配置，不存在返回 null
   */
  get(name) {
    return this.relations.get(name) || null;
  }

  /**
   * 验证关系配置
   * @param {Object} config - 关系配置
   * @throws {Error} 配置不合法时抛出错误
   */
  validate(config) {
    // 验证必需字段
    const required = ['from', 'localField', 'foreignField'];
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`relations 配置缺少必需字段: ${field}`);
      }
    }

    // 验证 from 必须是字符串（集合名）
    if (typeof config.from !== 'string') {
      throw new Error('relations.from 必须是字符串（集合名称）');
    }

    // 验证 localField 和 foreignField 必须是字符串
    if (typeof config.localField !== 'string') {
      throw new Error('relations.localField 必须是字符串');
    }

    if (typeof config.foreignField !== 'string') {
      throw new Error('relations.foreignField 必须是字符串');
    }

    // 验证 single 必须是布尔值（如果提供）
    if (config.single !== undefined && typeof config.single !== 'boolean') {
      throw new Error('relations.single 必须是布尔值');
    }
  }

  /**
   * 获取所有关系定义
   * @returns {Map} 所有关系定义
   */
  getAll() {
    return this.relations;
  }

  /**
   * 检查关系是否存在
   * @param {string} name - 关系名称
   * @returns {boolean}
   */
  has(name) {
    return this.relations.has(name);
  }

  /**
   * 获取所有关系名称
   * @returns {string[]}
   */
  getNames() {
    return Array.from(this.relations.keys());
  }
}

module.exports = RelationManager;


