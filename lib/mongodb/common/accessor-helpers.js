// Mongo 适配器辅助工具：慢查询日志整形器（脱敏）和缓存键构建器
// - mongoSlowLogShaper: 通过组合通用的元信息与 Mongo 的结构，生成安全的慢查询日志附加字段
// - mongoKeyBuilder: 当 op==='findPage' 时，注入 pipelineHash（对 pipeline 进行 stableStringify 后再做 sha256）
//并在键值材料中省略原始 pipeline，以保持键的简短和稳定


const crypto = require('crypto');
const CacheFactory = require('../../cache');
const { buildCommonLogExtra } = require('../../common/shape-builders');
const { shapeQuery, shapeProjection, shapeSort } = require('./shape');

/**
 * Mongo 专属：慢日志去敏形状构造器
 * @param {object} options - 原始调用选项（仅读取形状/标记，不含具体值）
 * @returns {object} 去敏后的形状对象（仅字段集合/标记位）
 */
function mongoSlowLogShaper(options) {
    const extra = buildCommonLogExtra(options);
    if (options?.query)      extra.queryShape      = shapeQuery(options.query);
    if (options?.projection) extra.projectionShape = shapeProjection(options.projection);
    if (options?.sort)       extra.sortShape       = shapeSort(options.sort);
    return extra;
}

/**
 * Mongo 专属：缓存键构造器
 * 仅在 findPage 时：对 pipeline 做稳定串行化并 sha256 → pipelineHash；
 * 同时从参与键的 options 中去除原始 pipeline，避免键过长与不稳定。
 * @param {string} op
 * @param {object} options
 * @returns {object} 用于参与缓存键构造的 options 视图
 */
function mongoKeyBuilder(op, options) {
    const opts = options || {};
    if (op !== 'findPage') return opts;
    const pipelineHash = crypto
        .createHash('sha256')
        .update(CacheFactory.stableStringify(opts.pipeline || []))
        .digest('hex');
    const { pipeline, ...rest } = opts;
    return { ...rest, pipelineHash };
}

module.exports = { mongoSlowLogShaper, mongoKeyBuilder };
