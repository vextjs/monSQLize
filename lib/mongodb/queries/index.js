/**
 * 查询模块统一导出
 * @module queries
 */

const { createFindPage, bookmarkKey, buildKeyDimsAuto } = require('./find-page');

/**
 * 创建 findPage 操作（工厂函数包装）
 * @param {Object} context - 上下文对象
 * @returns {Object} 包含 findPage 方法
 */
function createFindPageOps(context) {
    const { collection, getCache, instanceId, type, effectiveDbName, defaults, logger, run } = context;

    // 预构建 ns 字符串，确保书签键稳定
    const nsStr = `${instanceId}:${type}:${effectiveDbName}:${collection.collectionName}`;

    const findPageImpl = createFindPage({
        collection,
        getCache,  // 直接传递 getCache 回调
        getNamespace: () => ({ ns: nsStr, db: effectiveDbName, coll: collection.collectionName }),
        defaults,
        logger,
        databaseName: effectiveDbName,
        collectionName: collection.collectionName,
        run
    });

    return {
        findPage: async (options = {}) => findPageImpl(options)
    };
}

module.exports = {
    createFindOps: require('./find'),
    createFindOneOps: require('./find-one'),
    createFindOneByIdOps: require('./find-one-by-id').createFindOneByIdOps,  // findOneById 便利方法
    createFindByIdsOps: require('./find-by-ids').createFindByIdsOps,  // findByIds 便利方法
    createFindAndCountOps: require('./find-and-count').createFindAndCountOps,  // 新增：findAndCount 便利方法
    createCountOps: require('./count'),
    createAggregateOps: require('./aggregate'),
    createDistinctOps: require('./distinct'),
    createFindPageOps,  // 新增工厂函数
    createWatchOps: require('./watch').createWatchOps,  // 🆕 watch 方法
    // 导出原始函数和辅助函数供 bookmark 模块使用
    createFindPage,
    bookmarkKey,
    buildKeyDimsAuto
};

