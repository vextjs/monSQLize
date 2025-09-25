/**
 * 通用校验工具
 * - validateLimitAfterBefore: 校验 limit 合法与 after/before 互斥
 * - assertCursorSortCompatible: 校验游标中的排序与当前排序一致（字段与方向完全一致）
 */

function makeValidationError(details) {
    const err = new Error('参数校验失败');
    err.code = 'VALIDATION_ERROR';
    if (details) err.details = details;
    return err;
}

/**
 * @param {{limit?:number, after?:string, before?:string}} opts
 * @param {{maxLimit?:number}} cfg
 */
function validateLimitAfterBefore(opts, { maxLimit = 500 } = {}) {
    const { limit, after, before } = opts || {};
    if (!Number.isInteger(limit) || limit <= 0 || limit > maxLimit) {
        throw makeValidationError([{ path:['limit'], type:'number.range', message:`1..${maxLimit}` }]);
    }
    if (after && before) {
        throw makeValidationError([{ path:['after'], type:'any.conflict', message:'after/before 互斥' }]);
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
        const err = new Error('游标无效');
        err.code = 'INVALID_CURSOR';
        err.details = [{ path:['cursor'], type:'cursor.sort.mismatch', message:'cursor sort mismatches current sort' }];
        throw err;
    }
}

module.exports = { validateLimitAfterBefore, assertCursorSortCompatible };
