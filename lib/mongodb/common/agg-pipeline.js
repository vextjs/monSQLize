/**
 * Mongo 聚合分页管道构造器（方案 A：先分页后联表）
 * 流程：$match(query) → $match($expr-游标比较) → $sort(sort) → $limit(limit+1) → 页内 $lookup →
 *       若为 before 方向，再 $sort(反转) 恢复视觉顺序。
 */

const { buildLexiExpr } = require('./lexicographic-expr');
const { reverseSort } = require('./sort');

/**
 * 构造方案 A 的聚合管道
 * @param {object} params
 * @param {object} [params.query]
 * @param {Record<string,1|-1>} params.sort - 查询阶段使用的排序（before 方向已反转）
 * @param {number} params.limit - 页大小
 * @param {{a:object,s:object}|null} [params.cursor] - 解析后的游标对象
 * @param {'after'|'before'|null} [params.direction]
 * @param {object[]} [params.lookupPipeline] - 页内联表等追加管道
 * @param {Record<string,any>} [params.projection] - 已计算的有效投影（调用方负责保护排序字段）
 * @returns {object[]} 聚合管道数组
 */
function buildPagePipelineA({ query = {}, sort, limit, cursor, direction, lookupPipeline = [], projection }) {
    const pipeline = [];
    if (query && Object.keys(query).length) pipeline.push({ $match: query });
    if (cursor) pipeline.push({ $match: { $expr: buildLexiExpr(sort, cursor.a) } });
    pipeline.push({ $sort: sort });
    pipeline.push({ $limit: limit + 1 });
    if (lookupPipeline && lookupPipeline.length) pipeline.push(...lookupPipeline);
    // 🆕 v1.2.0: 在 lookup 之后、方向恢复之前注入 $project（调用方已确保排序字段存在）
    if (projection) pipeline.push({ $project: projection });
    if (direction === 'before') pipeline.push({ $sort: reverseSort(sort) });
    return pipeline;
}

module.exports = { buildPagePipelineA };

