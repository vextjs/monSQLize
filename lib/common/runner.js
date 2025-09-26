const CacheFactory = require('../cache');
const { withSlowQueryLog } = require('./log');

/**
 * 统一执行器：包装缓存与慢日志，并可选返回 meta（耗时等）与发出 query 事件
 * @param {import('../..').CacheLike|any} cache
 * @param {{iid:string, type:string, db:string, collection:string}} nsAll
 * @param {import('../..').LoggerLike} logger
 * @param {object} defaults
 * @param {{ keyBuilder?: (op:string, options:any)=>any, slowLogShaper?: (options:any)=>object, onSlowQueryEmit?: (meta:any)=>void, onQueryEmit?: (meta:any)=>void }} hooks
 */
function createCachedRunner(cache, nsAll, logger, defaults, hooks = {}) {
    const cached = CacheFactory.createCachedReader(cache, nsAll);
    return async (op, options = {}, exec) => {
        const optsForKey = typeof hooks.keyBuilder === 'function' ? hooks.keyBuilder(op, options || {}) : (options || {});
        const runExec = () => cached(op, optsForKey, exec);
        const ns = { db: nsAll.db, coll: nsAll.collection, iid: nsAll.iid, type: nsAll.type };
        const t0 = Date.now();
        let res;
        let err;
        try {
            res = await withSlowQueryLog(logger, defaults, op, ns, options, runExec, hooks.slowLogShaper, hooks.onSlowQueryEmit);
        } catch (e) {
            err = e;
            throw e;
        } finally {
            const endTs = Date.now();
            const durationMs = endTs - t0;
            const wantMeta = !!options.meta;
            const meta = {
                op,
                ns,
                startTs: endTs - durationMs,
                endTs,
                durationMs,
                maxTimeMS: options && options.maxTimeMS,
            };
            if (err) meta.error = { code: err.code, message: String(err && (err.message || err)) };
            // emit query event if enabled
            if (defaults && defaults.metrics && defaults.metrics.emitQueryEvent && typeof hooks.onQueryEmit === 'function') {
                try { hooks.onQueryEmit(meta); } catch (_) {}
            }
            if (wantMeta) {
                // 按方法统一返回：findPage 在对象上挂 meta，其它读 API 返回 { data, meta }
                if (op === 'findPage' && res && typeof res === 'object') {
                    res.meta = meta;
                } else {
                    res = { data: res, meta };
                }
            }
        }
        return res;
    };
}

module.exports = { createCachedRunner };
