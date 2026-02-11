/**
 * Default Values Manager - 默认值管理器
 *
 * 为字段提供默认值功能，在插入文档时自动填充
 *
 * 支持：
 * - 静态默认值（如 status: 'active'）
 * - 函数默认值（如 createdAt: () => new Date()）
 * - 上下文默认值（如 createdBy: (ctx) => ctx.userId）
 *
 * @module lib/model/features/defaults
 * @since v1.0.6
 */

/**
 * DefaultsManager - 默认值管理器
 */
class DefaultsManager {
    /**
     * 构造函数
     * @param {Model} model - 所属的 Model 实例
     */
    constructor(model) {
        this.model = model;
        this.defaults = new Map(); // 默认值定义缓存
    }

    /**
     * 定义字段默认值
     *
     * @param {string} field - 字段名
     * @param {*|Function} value - 默认值或默认值函数
     *
     * @example
     * // 静态默认值
     * defaults.define('status', 'active');
     *
     * // 函数默认值
     * defaults.define('createdAt', () => new Date());
     *
     * // 上下文默认值
     * defaults.define('createdBy', (ctx) => ctx.userId);
     */
    define(field, value) {
        if (!field || typeof field !== 'string') {
            throw new Error('字段名必须是字符串');
        }

        this.defaults.set(field, value);
    }

    /**
     * 获取字段默认值
     * @param {string} field - 字段名
     * @returns {*} 默认值
     */
    get(field) {
        return this.defaults.get(field);
    }

    /**
     * 获取所有默认值定义
     * @returns {Map} 所有默认值
     */
    getAll() {
        return this.defaults;
    }

    /**
     * 检查字段是否有默认值
     * @param {string} field - 字段名
     * @returns {boolean}
     */
    has(field) {
        return this.defaults.has(field);
    }

    /**
     * 应用默认值到文档
     *
     * @param {Object|Array} docs - 文档或文档数组
     * @param {Object} [context] - 上下文对象（可选）
     * @returns {Object|Array} 应用默认值后的文档
     */
    apply(docs, context = {}) {
        if (!docs) {
            return docs;
        }

        // 处理数组
        if (Array.isArray(docs)) {
            return docs.map(doc => this.applyToDocument(doc, context));
        }

        // 处理单个文档
        return this.applyToDocument(docs, context);
    }

    /**
     * 应用默认值到单个文档
     *
     * @private
     * @param {Object} doc - 文档对象
     * @param {Object} context - 上下文对象
     * @returns {Object} 应用默认值后的文档
     */
    applyToDocument(doc, context) {
        if (!doc || typeof doc !== 'object' || Buffer.isBuffer(doc)) {
            return doc;
        }

        const result = { ...doc };

        // 遍历所有默认值定义
        for (const [field, defaultValue] of this.defaults.entries()) {
            // 只在字段不存在或为 undefined 时应用默认值
            if (result[field] === undefined) {
                // 如果默认值是函数，调用函数获取值
                if (typeof defaultValue === 'function') {
                    result[field] = defaultValue(context, doc);
                } else {
                    result[field] = defaultValue;
                }
            }
        }

        return result;
    }
}

/**
 * 设置默认值功能
 *
 * @param {ModelInstance} modelInstance - Model 实例
 * @param {Object} defaultsConfig - 默认值配置
 *
 * @example
 * setupDefaults(modelInstance, {
 *     status: 'active',
 *     createdAt: () => new Date(),
 *     score: 0
 * });
 */
function setupDefaults(modelInstance, defaultsConfig) {
    // 初始化 DefaultsManager
    modelInstance._defaults = new DefaultsManager(modelInstance);

    // 注册默认值
    if (defaultsConfig && typeof defaultsConfig === 'object') {
        for (const [field, value] of Object.entries(defaultsConfig)) {
            modelInstance._defaults.define(field, value);
        }
    }
}

module.exports = {
    DefaultsManager,
    setupDefaults
};


