/**
 * Bookmark 管理模块
 * @description 提供书签缓存的预热、列表和清除功能
 */

const { ensureStableSort } = require('../common/sort');
const { normalizeSort } = require('../../common/normalize');
const { bookmarkKey, buildKeyDimsAuto } = require('../queries/find-page');

/**
 * 创建 Bookmark 管理操作
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 prewarmBookmarks, listBookmarks, clearBookmarks 方法
 */
function createBookmarkOps(context) {
    const { getCache, instanceId, type, effectiveDbName, collection, logger, getCollectionMethods } = context;

    // 构建命名空间字符串
    const ns = `${instanceId}:${type}:${effectiveDbName}:${collection.collectionName}`;

    return {
        /**
         * 预热书签（缓存指定页面）
         * @param {Object} keyDims - 查询维度
         * @param {number[]} pages - 要预热的页码数组
         * @returns {Promise<Object>} 预热结果统计
         */
        prewarmBookmarks: async (keyDims = {}, pages = []) => {
            const cache = getCache(); // 动态获取 cache
            if (!cache) {
                const err = new Error('CACHE_UNAVAILABLE: Cache is required for bookmark operations');
                err.code = 'CACHE_UNAVAILABLE';
                throw err;
            }

            if (!Array.isArray(pages) || pages.length === 0) {
                const err = new Error('INVALID_PAGES: pages must be a non-empty array');
                err.code = 'INVALID_PAGES';
                throw err;
            }

            const accessor = getCollectionMethods();
            const results = { warmed: 0, failed: 0, keys: [] };

            for (const page of pages) {
                if (!Number.isInteger(page) || page < 1) {
                    results.failed++;
                    try {
                        logger?.warn?.(`跳过无效页码: ${page}`);
                    } catch (_) { /* ignore */ }
                    continue;
                }

                try {
                    // 使用 jump.step=1 确保 bookmark 被缓存
                    const result = await accessor.findPage({
                        ...keyDims,
                        page,
                        totals: false,
                        jump: { step: 1 }
                    });

                    // 检查是否返回了数据
                    if (result.items && result.items.length > 0) {
                        results.warmed++;
                    } else {
                        results.failed++;
                        try {
                            logger?.warn?.(`页面 ${page} 无数据（可能超出范围）`);
                        } catch (_) { /* ignore */ }
                    }
                } catch (error) {
                    results.failed++;
                    try {
                        logger?.error?.(`预热页面 ${page} 失败:`, error);
                    } catch (_) { /* ignore */ }
                }
            }

            results.keys = await cache.keys(`${ns}:bm:*`);
            return results;
        },

        /**
         * 列出所有书签
         * @param {Object} [keyDims] - 可选的查询维度过滤
         * @returns {Promise<Object>} 书签列表
         */
        listBookmarks: async (keyDims) => {
            const cache = getCache(); // 动态获取 cache
            if (!cache) {
                const err = new Error('CACHE_UNAVAILABLE: Cache is required for bookmark operations');
                err.code = 'CACHE_UNAVAILABLE';
                throw err;
            }

            let pattern;
            if (keyDims) {
                // 确保 sort 与 findPage 内部处理一致
                const stableSort = ensureStableSort(normalizeSort(keyDims.sort) || { _id: 1 });
                const normalizedKeyDims = buildKeyDimsAuto({
                    db: effectiveDbName,
                    coll: collection.collectionName,
                    sort: stableSort,
                    limit: keyDims.limit,
                    query: keyDims.query,
                    pipeline: keyDims.pipeline
                });
                const baseKey = bookmarkKey(ns, normalizedKeyDims);
                pattern = `${baseKey}:*`;
            } else {
                pattern = `${ns}:bm:*`;
            }

            const keys = await cache.keys(pattern);
            const pages = keys
                .map((key) => {
                    const match = key.match(/:(\d+)$/);
                    return match ? parseInt(match[1], 10) : null;
                })
                .filter((page) => page !== null)
                .sort((a, b) => a - b);

            return { count: pages.length, pages, keys };
        },

        /**
         * 清除书签
         * @param {Object} [keyDims] - 可选的查询维度过滤
         * @returns {Promise<Object>} 清除结果统计
         */
        clearBookmarks: async (keyDims) => {
            const cache = getCache(); // 动态获取 cache
            if (!cache) {
                const err = new Error('CACHE_UNAVAILABLE: Cache is required for bookmark operations');
                err.code = 'CACHE_UNAVAILABLE';
                throw err;
            }

            let pattern;
            if (keyDims) {
                // 确保 sort 与 findPage 内部处理一致
                const stableSort = ensureStableSort(normalizeSort(keyDims.sort) || { _id: 1 });
                const normalizedKeyDims = buildKeyDimsAuto({
                    db: effectiveDbName,
                    coll: collection.collectionName,
                    sort: stableSort,
                    limit: keyDims.limit,
                    query: keyDims.query,
                    pipeline: keyDims.pipeline
                });
                const baseKey = bookmarkKey(ns, normalizedKeyDims);
                pattern = `${baseKey}:*`;
            } else {
                pattern = `${ns}:bm:*`;
            }

            const keysBefore = await cache.keys(pattern);
            const cleared = await cache.delPattern(pattern);

            return { cleared, pattern, keysBefore: keysBefore.length };
        }
    };
}

module.exports = createBookmarkOps;
