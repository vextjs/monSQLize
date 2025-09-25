/**
 * 通用分页结果计算
 * - 采用 limit+1 探测是否有更多，然后裁剪为 `items` 与 `pageInfo`。
 * - 游标生成委托给适配器提供的 `pickAnchor`（用于从行/文档提取锚点字段值）。
 */

const { encodeCursor } = require('./cursor');

/**
 * 生成分页结果
 * @param {any[]} rows - 后端返回的数组（长度可能为 limit 或 limit+1）
 * @param {object} ctx
 * @param {number} ctx.limit
 * @param {Record<string,1|-1>} ctx.stableSort
 * @param {'after'|'before'|null} ctx.direction
 * @param {boolean} ctx.hasCursor
 * @param {(doc:any, sort:Record<string,1|-1>)=>Record<string,any>} ctx.pickAnchor
 * @returns {{ items:any[], pageInfo:{ hasNext:boolean, hasPrev:boolean, startCursor:string|null, endCursor:string|null } }}
 */
function makePageResult(rows, { limit, stableSort, direction, hasCursor, pickAnchor }) {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    const first = items[0] || null;
    const last = items[items.length - 1] || null;

    const makeCur = (doc) => encodeCursor({ v: 1, s: stableSort, a: pickAnchor(doc, stableSort), d: 'after' });

    return {
        items,
        pageInfo: {
            hasNext: direction === 'before' ? Boolean(hasCursor) : hasMore,
            hasPrev: direction === 'before' ? hasMore : Boolean(hasCursor),
            startCursor: first ? makeCur(first) : null,
            endCursor: last ? makeCur(last) : null,
        }
    };
}

module.exports = { makePageResult };
