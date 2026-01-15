/**
 * 聚合管道验证工具
 * 用于验证 update 操作中的聚合管道格式
 */

const { createError, ErrorCodes } = require('../../errors');

/**
 * 支持的聚合管道操作符（用于 update 操作）
 * MongoDB 4.2+ 支持在 update 中使用以下聚合操作符
 */
const SUPPORTED_UPDATE_PIPELINE_OPERATORS = new Set([
    '$addFields',     // 添加字段
    '$set',           // 设置字段（$addFields 的别名）
    '$project',       // 字段投影
    '$unset',         // 删除字段
    '$replaceRoot',   // 替换根文档
    '$replaceWith'    // 替换文档（$replaceRoot 的别名）
]);

/**
 * 验证聚合管道格式
 * @param {Array} pipeline - 聚合管道数组
 * @param {Object} [options] - 验证选项
 * @param {boolean} [options.strictValidation=false] - 是否启用严格验证（检查操作符是否支持）
 * @throws {Error} 当管道格式无效时抛出错误
 */
function validateAggregationPipeline(pipeline, options = {}) {
    const { strictValidation = false } = options;

    // 1. 验证是否为数组
    if (!Array.isArray(pipeline)) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'update 聚合管道必须是数组',
            [{ field: 'update', type: 'array.required', message: '聚合管道必须使用数组格式，如 [{ $set: {...} }]' }]
        );
    }

    // 2. 验证不能为空
    if (pipeline.length === 0) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            'update 聚合管道不能为空数组',
            [{ field: 'update', type: 'array.empty', message: '聚合管道至少需要包含一个阶段' }]
        );
    }

    // 3. 验证每个阶段
    for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i];

        // 3.1 必须是对象
        if (typeof stage !== 'object' || stage === null || Array.isArray(stage)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `聚合管道第 ${i + 1} 个阶段必须是对象`,
                [{
                    field: `update[${i}]`,
                    type: 'object.required',
                    message: `第 ${i + 1} 个阶段必须是对象格式，如 { $set: {...} }`
                }]
            );
        }

        // 3.2 不能为空对象
        const stageKeys = Object.keys(stage);
        if (stageKeys.length === 0) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `聚合管道第 ${i + 1} 个阶段不能为空对象`,
                [{
                    field: `update[${i}]`,
                    type: 'object.empty',
                    message: `第 ${i + 1} 个阶段必须包含聚合操作符，如 $set、$unset 等`
                }]
            );
        }

        // 3.3 必须是有效的聚合操作符（以 $ 开头）
        const operator = stageKeys[0];
        if (!operator.startsWith('$')) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `聚合管道第 ${i + 1} 个阶段的操作符必须以 $ 开头`,
                [{
                    field: `update[${i}]`,
                    type: 'operator.invalid',
                    message: `操作符 "${operator}" 无效，必须以 $ 开头，如 $set、$unset、$addFields 等`,
                    currentValue: operator
                }]
            );
        }

        // 3.4 严格模式：检查是否是支持的操作符
        if (strictValidation && !SUPPORTED_UPDATE_PIPELINE_OPERATORS.has(operator)) {
            throw createError(
                ErrorCodes.INVALID_ARGUMENT,
                `聚合管道第 ${i + 1} 个阶段使用了不支持的操作符`,
                [{
                    field: `update[${i}]`,
                    type: 'operator.unsupported',
                    message: `操作符 "${operator}" 不支持在 update 操作中使用`,
                    currentValue: operator,
                    supportedOperators: Array.from(SUPPORTED_UPDATE_PIPELINE_OPERATORS)
                }]
            );
        }
    }
}

/**
 * 检测是否是聚合管道格式
 * @param {*} update - update 参数
 * @returns {boolean}
 */
function isAggregationPipeline(update) {
    return Array.isArray(update);
}

module.exports = {
    validateAggregationPipeline,
    isAggregationPipeline,
    SUPPORTED_UPDATE_PIPELINE_OPERATORS
};

