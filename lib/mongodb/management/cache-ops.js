/**
 * cache-ops 缓存管理模块
 * @description 提供缓存失效和管理功能
 */

const CacheFactory = require('../../cache');

/**
 * 创建缓存管理操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 invalidate 方法的对象
 */
function createCacheOps(context) {
    const { cache, instanceId, effectiveDbName, collection, logger } = context;

    return {
        /**
         * 失效缓存
         * @description 使指定集合的查询缓存失效（通过模式匹配删除）
         * @param {('find'|'findOne'|'count'|'findPage')} [op] - 可选：指定仅失效某操作
         * @returns {Promise<number>} 删除的键数量
         */
        invalidate: async (op) => {
            const ns = {
                iid: instanceId,
                type: context.type,
                db: effectiveDbName,
                collection: collection.collectionName,
            };
            const pattern = CacheFactory.buildNamespaceOpPattern(ns, op);
            try {
                const deleted = await cache.delPattern(pattern);
                try {
                    logger?.info?.('🗑️ Cache invalidated', { ns, op, deleted });
                } catch (_) { /* ignore logging error */
                }
                return deleted;
            } catch (_) {
                try {
                    logger?.warn?.('🗑️ Cache invalidation failed', { ns, op });
                } catch (_) {
                }
                return 0;
            }
        }
    };
}

module.exports = createCacheOps;

