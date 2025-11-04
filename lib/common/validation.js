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

module.exports = { validateLimitAfterBefore, assertCursorSortCompatible };
