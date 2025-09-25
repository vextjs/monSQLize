const CacheFactory = require('../cache');
const { withSlowQueryLog } = require('./log');

/**
 * 统一执行器：包装缓存与慢日志
 * @param {import('../..').CacheLike|any} cache
 * @param {{iid:string, type:string, db:string, collection:string}} nsAll
 * @param {import('../..').LoggerLike} logger
 * @param {object} defaults
 * @param {{ keyBuilder?: (op:string, options:any)=>any, slowLogShaper?: (options:any)=>object, onSlowQueryEmit?: (meta:any)=>void }} hooks
 */
function createCachedRunner(cache, nsAll, logger, defaults, hooks = {}) {
    const cached = CacheFactory.createCachedReader(cache, nsAll);
    return (op, options, exec) => {
        const optsForKey = typeof hooks.keyBuilder === 'function' ? hooks.keyBuilder(op, options || {}) : (options || {});
        const runExec = () => cached(op, optsForKey, exec);
        return withSlowQueryLog(logger, defaults, op, { db: nsAll.db, coll: nsAll.collection, iid: nsAll.iid, type: nsAll.type }, options, runExec, hooks.slowLogShaper, hooks.onSlowQueryEmit);
    };
}

module.exports = { createCachedRunner };
