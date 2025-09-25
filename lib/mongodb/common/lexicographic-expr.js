/**
 * Mongo 专属：构造 $expr 的词典序比较表达式（lexicographic compare）
 * 场景：按复合排序键（含 `_id` 兜底）进行游标分页的“锚点之后/之前”过滤。
 * 例：sort={k1:1,k2:-1,_id:1}, anchor={k1:...,k2:...,_id:...}
 * 生成：{$or:[ {$gt:['$k1',a.k1]}, {$and:[{$eq:['$k1',a.k1]},{$lt:['$k2',a.k2]}]}, ...]}
 */

/**
 * 构造 $expr 词典序比较
 * @param {Record<string,1|-1>} sort - 稳定排序（含 `_id`）
 * @param {Record<string,any>} anchor - 锚点值对象
 * @returns {object} Mongo $expr 表达式对象
 */
function buildLexiExpr(sort, anchor) {
    const keys = Object.keys(sort || {});
    const or = [];
    for (let i = 0; i < keys.length; i++) {
        const and = [];
        for (let j = 0; j < i; j++) and.push({ $eq: [ `$${keys[j]}`, anchor[keys[j]] ] });
        const dir = sort[keys[i]];
        const op = dir === 1 ? '$gt' : '$lt';
        and.push({ [op]: [ `$${keys[i]}`, anchor[keys[i]] ] });
        or.push(and.length === 1 ? and[0] : { $and: and });
    }
    return { $or: or };
}

module.exports = { buildLexiExpr };
