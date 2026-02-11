/**
 * 命名空间管理模块
 * @module management/namespace
 */

/**
 * 创建命名空间操作方法
 * @param {Object} context - 上下文对象
 * @param {string} context.instanceId - 实例ID
 * @param {string} context.type - 数据库类型
 * @param {string} context.effectiveDbName - 数据库名称
 * @param {Object} context.collection - MongoDB集合实例
 * @returns {Object} 命名空间操作方法
 */
module.exports = function createNamespaceOps(context) {
    const { instanceId, type, effectiveDbName, collection } = context;

    return {
        /**
         * 返回当前访问器的命名空间信息
         * @returns {Object} 命名空间信息
         */
        getNamespace: () => ({
            iid: instanceId,
            type,
            db: effectiveDbName,
            collection: collection.collectionName
        })
    };
};

