/**
 * 管理模块统一导出
 * @module management
 */

module.exports = {
    createNamespaceOps: require('./namespace'),
    createCollectionOps: require('./collection-ops'),
    createCacheOps: require('./cache-ops'),
    createBookmarkOps: require('./bookmark-ops')
};
