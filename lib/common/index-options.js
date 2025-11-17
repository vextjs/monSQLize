/**
 * 索引选项验证和归一化工具
 *
 * @module common/index-options
 * @since 2025-11-17
 */

const { createError } = require('../errors');

/**
 * 验证索引键定义
 *
 * @param {Object} keys - 索引键定义
 * @throws {Error} 如果索引键无效
 *
 * @example
 * validateIndexKeys({ email: 1 });  // ✓
 * validateIndexKeys({ age: -1 });   // ✓
 * validateIndexKeys({ name: "text" }); // ✓
 * validateIndexKeys({ "$**": 1 });  // ✓ 通配符索引
 * validateIndexKeys({});            // ✗ 抛出错误
 * validateIndexKeys({ email: 2 }); // ✗ 抛出错误
 */
function validateIndexKeys(keys) {
    if (!keys || typeof keys !== 'object') {
        throw createError(
            'INVALID_ARGUMENT',
            '索引键必须是对象',
            { keys }
        );
    }

    const keyNames = Object.keys(keys);

    if (keyNames.length === 0) {
        throw createError(
            'INVALID_ARGUMENT',
            '索引键不能为空',
            { keys }
        );
    }

    // 验证每个键的值
    for (const key of keyNames) {
        const value = keys[key];

        // 允许的值：1（升序）、-1（降序）、"text"（文本索引）、"2d"（地理索引）、"2dsphere"、"hashed"、"columnstore"
        const validValues = [1, -1, '1', '-1', 'text', '2d', '2dsphere', 'geoHaystack', 'hashed', 'columnstore'];

        if (!validValues.includes(value)) {
            throw createError(
                'INVALID_ARGUMENT',
                `索引键 "${key}" 的值无效，允许的值: 1, -1, "text", "2d", "2dsphere", "hashed", "columnstore"`,
                { key, value, validValues }
            );
        }
    }

    return true;
}

/**
 * 归一化索引选项
 * 验证并转换为 MongoDB 驱动接受的格式
 *
 * @param {Object} options - 用户提供的索引选项
 * @returns {Object} 归一化后的选项
 *
 * @example
 * normalizeIndexOptions({ unique: true, name: "email_idx" });
 * // 返回: { unique: true, name: "email_idx" }
 */
function normalizeIndexOptions(options = {}) {
    const normalized = {};

    // 允许的选项列表
    const allowedOptions = [
        // 通用选项
        'name',                      // 索引名称
        'unique',                    // 唯一索引
        'sparse',                    // 稀疏索引
        'background',                // 后台创建（已废弃但保留兼容）

        // TTL 索引
        'expireAfterSeconds',        // 文档过期时间

        // 部分索引
        'partialFilterExpression',   // 部分索引表达式

        // 排序规则
        'collation',                 // 排序规则

        // 高级选项
        'hidden',                    // 隐藏索引（MongoDB 4.4+）
        'wildcardProjection',        // 通配符投影

        // 存储引擎
        'storageEngine',             // 存储引擎配置

        // 文本索引
        'weights',                   // 文本权重
        'default_language',          // 默认语言
        'language_override',         // 语言覆盖字段
        'textIndexVersion',          // 文本索引版本

        // 2dsphere 索引
        '2dsphereIndexVersion',      // 2dsphere 索引版本

        // 其他
        'bits',                      // 2d 索引精度
        'min',                       // 2d 索引最小值
        'max',                       // 2d 索引最大值
        'bucketSize'                 // geoHaystack 索引桶大小
    ];

    // 复制允许的选项
    for (const option of allowedOptions) {
        if (options.hasOwnProperty(option)) {
            normalized[option] = options[option];
        }
    }

    // 特殊处理：background 已废弃，但保留兼容性
    if (normalized.background !== undefined) {
        // MongoDB 4.2+ 会忽略 background 选项，但不会报错
        // 可以添加警告日志（如果有 logger）
    }

    // 验证特定选项
    if (normalized.unique !== undefined && typeof normalized.unique !== 'boolean') {
        throw createError(
            'INVALID_ARGUMENT',
            'unique 选项必须是布尔值',
            { unique: normalized.unique }
        );
    }

    if (normalized.sparse !== undefined && typeof normalized.sparse !== 'boolean') {
        throw createError(
            'INVALID_ARGUMENT',
            'sparse 选项必须是布尔值',
            { sparse: normalized.sparse }
        );
    }

    if (normalized.hidden !== undefined && typeof normalized.hidden !== 'boolean') {
        throw createError(
            'INVALID_ARGUMENT',
            'hidden 选项必须是布尔值',
            { hidden: normalized.hidden }
        );
    }

    if (normalized.expireAfterSeconds !== undefined) {
        const ttl = normalized.expireAfterSeconds;
        if (typeof ttl !== 'number' || ttl < 0 || !Number.isInteger(ttl)) {
            throw createError(
                'INVALID_ARGUMENT',
                'expireAfterSeconds 必须是非负整数',
                { expireAfterSeconds: ttl }
            );
        }
    }

    if (normalized.name !== undefined && typeof normalized.name !== 'string') {
        throw createError(
            'INVALID_ARGUMENT',
            'name 选项必须是字符串',
            { name: normalized.name }
        );
    }

    if (normalized.partialFilterExpression !== undefined) {
        if (typeof normalized.partialFilterExpression !== 'object' || normalized.partialFilterExpression === null) {
            throw createError(
                'INVALID_ARGUMENT',
                'partialFilterExpression 必须是对象',
                { partialFilterExpression: normalized.partialFilterExpression }
            );
        }
    }

    if (normalized.collation !== undefined) {
        if (typeof normalized.collation !== 'object' || normalized.collation === null) {
            throw createError(
                'INVALID_ARGUMENT',
                'collation 必须是对象',
                { collation: normalized.collation }
            );
        }
    }

    return normalized;
}

/**
 * 生成索引名称（当用户未指定时）
 *
 * @param {Object} keys - 索引键定义
 * @returns {string} 生成的索引名称
 *
 * @example
 * generateIndexName({ email: 1 });  // "email_1"
 * generateIndexName({ userId: 1, status: -1 });  // "userId_1_status_-1"
 * generateIndexName({ name: "text" });  // "name_text"
 */
function generateIndexName(keys) {
    const parts = [];

    for (const [field, direction] of Object.entries(keys)) {
        parts.push(`${field}_${direction}`);
    }

    return parts.join('_');
}

module.exports = {
    validateIndexKeys,
    normalizeIndexOptions,
    generateIndexName
};

