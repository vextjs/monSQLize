 /**
 * Virtual Fields Manager - 虚拟字段管理器
 *
 * 虚拟字段是计算属性，不存储在数据库中，但可以像普通字段一样访问
 *
 * 使用场景：
 * - 组合多个字段（如 firstName + lastName = fullName）
 * - 格式化显示（如日期格式化）
 * - 计算属性（如年龄从生日计算）
 *
 * @module lib/model/features/virtuals
 * @since v1.0.6
 */

/**
 * VirtualManager - 虚拟字段管理器
 */
class VirtualManager {
    /**
     * 构造函数
     * @param {Model} model - 所属的 Model 实例
     */
    constructor(model) {
        this.model = model;
        this.virtuals = new Map(); // 虚拟字段定义缓存
    }

    /**
     * 定义虚拟字段
     *
     * @param {string} name - 虚拟字段名称
     * @param {Object} config - 虚拟字段配置
     * @param {Function} config.get - getter 函数（必需）
     * @param {Function} [config.set] - setter 函数（可选）
     *
     * @example
     * virtuals.define('fullName', {
     *     get: function() {
     *         return `${this.firstName} ${this.lastName}`;
     *     },
     *     set: function(value) {
     *         const parts = value.split(' ');
     *         this.firstName = parts[0];
     *         this.lastName = parts[1];
     *     }
     * });
     */
    define(name, config) {
        // 验证参数
        if (!name || typeof name !== 'string') {
            throw new Error('虚拟字段名称必须是字符串');
        }

        if (!config || typeof config !== 'object') {
            throw new Error('虚拟字段配置必须是对象');
        }

        if (typeof config.get !== 'function') {
            throw new Error('虚拟字段配置必须包含 get 函数');
        }

        if (config.set && typeof config.set !== 'function') {
            throw new Error('虚拟字段的 set 必须是函数');
        }

        // 保存虚拟字段定义
        this.virtuals.set(name, {
            get: config.get,
            set: config.set || null
        });
    }

    /**
     * 获取虚拟字段定义
     * @param {string} name - 虚拟字段名称
     * @returns {Object|null} 虚拟字段配置，不存在返回 null
     */
    get(name) {
        return this.virtuals.get(name) || null;
    }

    /**
     * 获取所有虚拟字段
     * @returns {Map} 所有虚拟字段定义
     */
    getAll() {
        return this.virtuals;
    }

    /**
     * 检查虚拟字段是否存在
     * @param {string} name - 虚拟字段名称
     * @returns {boolean}
     */
    has(name) {
        return this.virtuals.has(name);
    }

    /**
     * 应用虚拟字段到文档
     *
     * @param {Object|Array} docs - 文档或文档数组
     * @returns {Object|Array} 应用虚拟字段后的文档
     */
    apply(docs) {
        if (!docs) {
            return docs;
        }

        // 处理数组
        if (Array.isArray(docs)) {
            return docs.map(doc => this.applyToDocument(doc));
        }

        // 处理单个文档
        return this.applyToDocument(docs);
    }

    /**
     * 应用虚拟字段到单个文档
     *
     * @private
     * @param {Object} doc - 文档对象
     * @returns {Object} 应用虚拟字段后的文档
     */
    applyToDocument(doc) {
        if (!doc || typeof doc !== 'object' || Buffer.isBuffer(doc)) {
            return doc;
        }

        // 为每个虚拟字段定义 getter/setter
        for (const [name, config] of this.virtuals.entries()) {
            // 使用 Object.defineProperty 定义虚拟字段
            Object.defineProperty(doc, name, {
                enumerable: true,   // 可枚举（会出现在 JSON.stringify 中）
                configurable: true, // 可配置
                get: function() {
                    // 绑定 this 到文档对象
                    return config.get.call(this);
                },
                set: config.set ? function(value) {
                    // 如果定义了 setter，绑定 this 到文档对象
                    config.set.call(this, value);
                } : undefined
            });
        }

        return doc;
    }

    /**
     * 从文档中移除虚拟字段（用于保存到数据库前）
     *
     * @param {Object} doc - 文档对象
     * @returns {Object} 移除虚拟字段后的文档
     */
    removeFromDocument(doc) {
        if (!doc || typeof doc !== 'object' || Buffer.isBuffer(doc)) {
            return doc;
        }

        const cleaned = { ...doc };

        // 删除所有虚拟字段
        for (const name of this.virtuals.keys()) {
            delete cleaned[name];
        }

        return cleaned;
    }
}

/**
 * 设置虚拟字段功能
 *
 * @param {ModelInstance} modelInstance - Model 实例
 * @param {Object} virtualsConfig - 虚拟字段配置
 *
 * @example
 * setupVirtuals(modelInstance, {
 *     fullName: {
 *         get: function() {
 *             return `${this.firstName} ${this.lastName}`;
 *         }
 *     }
 * });
 */
function setupVirtuals(modelInstance, virtualsConfig) {
    // 初始化 VirtualManager
    modelInstance._virtuals = new VirtualManager(modelInstance);

    // 注册虚拟字段
    if (virtualsConfig && typeof virtualsConfig === 'object') {
        for (const [name, config] of Object.entries(virtualsConfig)) {
            modelInstance._virtuals.define(name, config);
        }
    }

    // 扩展查询方法，自动应用虚拟字段
    const originalInjectMethods = modelInstance._injectInstanceMethods;
    modelInstance._injectInstanceMethods = function(result) {
        // 先应用原有的实例方法注入
        if (originalInjectMethods) {
            originalInjectMethods.call(this, result);
        }

        // 再应用虚拟字段
        if (this._virtuals) {
            this._virtuals.apply(result);
        }
    };
}

module.exports = {
    VirtualManager,
    setupVirtuals
};


