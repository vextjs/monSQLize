/**
 * Mongo 专属：稳定排序与锚点选择
 * - ensureStableSort：确保排序键（sort）末尾包含 `_id`（稳定排序兜底）。
 * - reverseSort：将排序方向整体反转（1 ↔ -1），用于 before 方向的查询阶段。
 * - pickAnchor：按排序键顺序从文档中提取锚点字段值对象（含 `_id`）。
 */

/**
 * 确保排序对象包含稳定键 `_id`
 * @param {Record<string, 1|-1>|undefined} sort - 排序对象
 * @returns {Record<string, 1|-1>} 新的排序对象（若缺 `_id` 自动追加 `_id:1`）
 */
function ensureStableSort(sort) {
    const s = { ...(sort || {}) };
    if (!('_id' in s)) s._id = 1;
    return s;
}

/**
 * 反转排序方向（1 ↔ -1）
 * @param {Record<string, 1|-1>} sort
 * @returns {Record<string, 1|-1>}
 */
function reverseSort(sort) {
    const r = {}; for (const k of Object.keys(sort || {})) r[k] = sort[k] === 1 ? -1 : 1; return r;
}

/**
 * 提取锚点：按排序键顺序从文档取值（含 `_id`）
 * @param {any} doc - 文档
 * @param {Record<string, 1|-1>} sort - 稳定排序（含 `_id`）
 * @returns {Record<string, any>} 锚点值对象 { k1: v1, k2: v2, _id: id }
 */
function pickAnchor(doc, sort) {
    const a = {}; for (const k of Object.keys(sort || {})) a[k] = doc ? doc[k] : undefined; return a;
}

module.exports = { ensureStableSort, reverseSort, pickAnchor };
