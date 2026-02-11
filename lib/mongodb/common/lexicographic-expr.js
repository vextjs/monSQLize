/**
 * Mongo 专属：构造 $expr 的词典序比较表达式（lexicographic compare）
 * 场景：按复合排序键（含 `_id` 兜底）进行游标分页的"锚点之后/之前"过滤。
 * 例：sort={k1:1,k2:-1,_id:1}, anchor={k1:...,k2:...,_id:...}
 * 生成：{$or:[ {$gt:['$k1',a.k1]}, {$and:[{$eq:['$k1',a.k1]},{$lt:['$k2',a.k2]}]}, ...]}
 */

const { ObjectId } = require('mongodb');

/**
 * 转换锚点值，处理特殊类型
 * @param {any} value - 锚点值
 * @param {string} fieldName - 字段名
 * @returns {any} 转换后的值
 */
function convertAnchorValue(value, fieldName) {
    // 如果是 _id 字段且值是字符串，转换为 ObjectId
    if (fieldName === '_id' && typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
        return new ObjectId(value);
    }

    // 如果值是 ISO 日期字符串，转换为 Date 对象
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)) {
        return new Date(value);
    }

    return value;
}

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
        for (let j = 0; j < i; j++) {
            and.push({ $eq: [ `$${keys[j]}`, convertAnchorValue(anchor[keys[j]], keys[j]) ] });
        }
        const dir = sort[keys[i]];
        const op = dir === 1 ? '$gt' : '$lt';
        and.push({ [op]: [ `$${keys[i]}`, convertAnchorValue(anchor[keys[i]], keys[i]) ] });
        or.push(and.length === 1 ? and[0] : { $and: and });
    }
    return { $or: or };
}

module.exports = { buildLexiExpr };

