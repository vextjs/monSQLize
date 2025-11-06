/**
 * 集合管理操作模块
 * @module management/collection-ops
 */

/**
 * 创建集合管理操作方法
 * @param {Object} context - 上下文对象
 * @param {Object} context.db - MongoDB 数据库实例
 * @param {Object} context.collection - MongoDB 集合实例
 * @returns {Object} 集合管理操作方法
 */
module.exports = function createCollectionOps(context) {
    const { db, collection } = context;

    return {
        /**
         * 删除集合
         * @returns {Promise<boolean>} 删除操作的结果
         */
        dropCollection: async () => {
            return await collection.drop();
        },

        /**
         * 创建集合
         * @param {string} [name] - 集合名称；省略则使用当前绑定的集合名
         * @param {Object} [options={}] - 创建集合的配置选项
         * @returns {Promise<boolean>} 创建成功返回true
         */
        createCollection: async (name, options = {}) => {
            const collName = name || collection.collectionName;
            await db.createCollection(collName, options);
            return true;
        },

        /**
         * 创建视图集合
         * @param {string} name - 视图名称
         * @param {string} source - 源集合名称
         * @param {Array} [pipeline=[]] - 聚合管道数组
         * @returns {Promise<boolean>} 创建成功返回true
         */
        createView: async (name, source, pipeline = []) => {
            await db.createCollection(name, {
                viewOn: source,
                pipeline: pipeline || []
            });
            return true;
        }
    };
};
