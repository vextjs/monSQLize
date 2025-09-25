/**
 * 通用慢日志形状构造器（去敏）
 * 仅保留安全元信息与标记位；真正的 query/projection/sort 形状由适配器层注入。
 */

function buildCommonLogExtra(options) {
    const pick = (obj, fields) => Object.fromEntries((fields || []).filter(k => obj && k in obj).map(k => [k, obj[k]]));
    const meta = pick(options || {}, ['limit', 'skip', 'maxTimeMS', 'cache']);

    // 聚合阶段名（仅名称，避免输出参数）
    if (options?.pipeline && Array.isArray(options.pipeline)) {
        try {
            meta.pipelineStages = options.pipeline.map(p => Object.keys(p)[0]).slice(0, 30);
        } catch (_) { /* ignore */ }
    }

    // 游标标记
    if (options?.after || options?.before) {
        meta.hasCursor = true;
        meta.cursorDirection = options.after ? 'after' : 'before';
    }

    return meta;
}

module.exports = { buildCommonLogExtra };
