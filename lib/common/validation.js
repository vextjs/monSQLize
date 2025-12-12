/**
 * 通用校验工具
 * - validateLimitAfterBefore: 校验 limit 合法与 after/before 互斥
 * - assertCursorSortCompatible: 校验游标中的排序与当前排序一致（字段与方向完全一致）
 */

const { createValidationError, createCursorError } = require('../errors');

/**
 * @param {{limit?:number, after?:string, before?:string}} opts
 * @param {{maxLimit?:number}} cfg
 */
function validateLimitAfterBefore(opts, { maxLimit = 500 } = {}) {
    const { limit, after, before } = opts || {};
    if (!Number.isInteger(limit) || limit <= 0 || limit > maxLimit) {
        throw createValidationError([{ path:['limit'], type:'number.range', message:`1..${maxLimit}` }]);
    }
    if (after && before) {
        throw createValidationError([{ path:['after'], type:'any.conflict', message:'after/before 互斥' }]);
    }
}

/**
 * 校验游标排序与当前排序一致
 * @param {Record<string,1|-1>} currentSort
 * @param {Record<string,1|-1>|undefined} cursorSort
 */
function assertCursorSortCompatible(currentSort, cursorSort) {
    const k1 = Object.keys(currentSort || {});
    const k2 = Object.keys(cursorSort || {});
    const same = k1.length === k2.length && k1.every(k => cursorSort && cursorSort[k] === currentSort[k]);
    if (!same) {
        // 使用专门的 CURSOR_SORT_MISMATCH 错误码
        const { ErrorCodes, createError } = require('../errors');
        throw createError(
            ErrorCodes.CURSOR_SORT_MISMATCH,
            '游标排序不匹配：游标中的排序与当前查询的排序不一致',
            [{
                path: ['cursor'],
                type: 'cursor.sort.mismatch',
                message: 'cursor sort mismatches current sort',
                cursorSort,
                currentSort
            }]
        );
    }
}

/**
 * 验证数值范围
 * @param {number} value - 要验证的数值
 * @param {number} min - 最小值（包含）
 * @param {number} max - 最大值（包含）
 * @param {string} name - 参数名称（用于错误消息）
 * @returns {number} 验证通过后的值
 * @throws {Error} 当值不在有效范围内时抛出 INVALID_ARGUMENT 错误
 */
function validateRange(value, min, max, name) {
    const { ErrorCodes, createError } = require('../errors');

    // 检查是否为有效数字
    if (typeof value !== 'number' || isNaN(value)) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${name} 必须是一个有效的数字`
        );
    }

    // 检查是否为有限数（排除 Infinity）
    if (!isFinite(value)) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${name} 必须是有限数字`
        );
    }

    // 检查范围
    if (value < min || value > max) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${name} 必须在 ${min} 到 ${max} 之间，当前值: ${value}`
        );
    }

    return value;
}

/**
 * 验证正整数
 * @param {number} value - 要验证的数值
 * @param {string} name - 参数名称（用于错误消息）
 * @returns {number} 验证通过后的值
 * @throws {Error} 当值不是正整数时抛出错误
 */
function validatePositiveInteger(value, name) {
    const { ErrorCodes, createError } = require('../errors');

    if (!Number.isInteger(value) || value <= 0) {
        throw createError(
            ErrorCodes.INVALID_ARGUMENT,
            `${name} 必须是正整数，当前值: ${value}`
        );
    }
    return value;
}

module.exports = {
    validateLimitAfterBefore,
    assertCursorSortCompatible,
    validateRange,
    validatePositiveInteger
};
