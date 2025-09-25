/**
 * 通用慢查询日志工具
 * - getSlowQueryThreshold: 读取阈值（默认 500ms）
 * - withSlowQueryLog: 统一包装执行并在超阈值时输出去敏慢日志
 */

function getSlowQueryThreshold(defaults){
    const d = defaults || {};
    return (d.slowQueryMs && Number(d.slowQueryMs)) || 500;
}

/**
 *
 * @param {import('../..').LoggerLike} logger
 * @param {object} defaults
 * @param {string} op
 * @param {{iid?:string,type?:string,db:string,coll:string}} ns
 * @param {object} options
 * @param {() => Promise<any>} exec
 * @param {(options:any)=>object} [slowLogShaper]
 * @returns {Promise<any>}
 */
async function withSlowQueryLog(logger, defaults, op, ns, options, exec, slowLogShaper, onEmit){
    const t0 = Date.now();
    const res = await exec();
    const ms = Date.now() - t0;
    const threshold = getSlowQueryThreshold(defaults);
    if (ms > threshold) {
        const scope = defaults?.namespace?.scope;
        const iid = ns?.iid;
        const base = {
            event: (defaults?.log?.slowQueryTag?.event) || 'slow_query',
            code:  (defaults?.log?.slowQueryTag?.code)  || 'SLOW_QUERY',
            category: 'performance',
            type: ns?.type || 'mongodb',
            iid,
            scope,
            db: ns.db,
            coll: ns.coll,
            op,
            ms,
            threshold,
            ts: new Date().toISOString(),
            ...(typeof slowLogShaper === 'function' ? slowLogShaper(options) : {})
        };
        try {
            if (typeof defaults?.log?.formatSlowQuery === 'function') {
                const formatted = defaults.log.formatSlowQuery(base) || base;
                logger.warn('\u23f1\ufe0f Slow query', formatted);
                if (typeof onEmit === 'function') { try { onEmit(formatted); } catch(_) {} }
            } else {
                logger.warn('\u23f1\ufe0f Slow query', base);
                if (typeof onEmit === 'function') { try { onEmit(base); } catch(_) {} }
            }
        } catch (_) { /* ignore logging errors */ }
    }
    return res;
}

module.exports = { getSlowQueryThreshold, withSlowQueryLog };
