/**
 * 管理模块统一导出
 * @module management
 */

module.exports = {
    createNamespaceOps: require('./namespace'),
    createCollectionOps: require('./collection-ops'),
    createCacheOps: require('./cache-ops'),
    createBookmarkOps: require('./bookmark-ops'),
    createIndexOps: require('./index-ops'),
    // 新增管理方法 (v0.3.0+)
    createAdminOps: require('./admin-ops').createAdminOps,
    createDatabaseOps: require('./database-ops').createDatabaseOps,
    createValidationOps: require('./validation-ops').createValidationOps
};

