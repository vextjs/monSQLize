/**
 * 通用规范化工具
 * - normalizeProjection: 将数组形式的投影转换为对象形式；对象原样返回；其他为 undefined。
 * - normalizeSort: 仅当为对象时返回；否则 undefined。
 */

/**
 * 规范化投影参数
 * @param {string[]|Record<string, any>|undefined} p
 * @returns {Record<string, 1>|undefined}
 */
function normalizeProjection(p) {
    if (!p) return undefined;
    if (Array.isArray(p)) {
        const obj = {};
        for (const k of p) {
            if (typeof k === 'string') obj[k] = 1;
        }
        return Object.keys(obj).length ? obj : undefined;
    }
    return (p && typeof p === 'object') ? p : undefined;
}

/**
 * 规范化排序参数
 * @param {Record<string, 1|-1>|undefined} s
 * @returns {Record<string, 1|-1>|undefined}
 */
function normalizeSort(s) {
    return (s && typeof s === 'object') ? s : undefined;
}

module.exports = { normalizeProjection, normalizeSort };
