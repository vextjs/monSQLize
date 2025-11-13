/**
 * MongoDB 写操作模块入口
 * 统一导出所有写操作的工厂函数
 */

const { createInsertOneOps } = require("./insert-one");
const { createInsertManyOps } = require("./insert-many");
const { createInsertBatchOps } = require("./insert-batch");
const { createUpdateOneOps } = require("./update-one");
const { createUpdateManyOps } = require("./update-many");
const { createReplaceOneOps } = require("./replace-one");
const { createFindOneAndUpdateOps } = require("./find-one-and-update");
const { createFindOneAndReplaceOps } = require("./find-one-and-replace");
const { createDeleteOneOps } = require("./delete-one");
const { createDeleteManyOps } = require("./delete-many");
const { createFindOneAndDeleteOps } = require("./find-one-and-delete");

module.exports = {
    // Insert 操作
    createInsertOneOps,
    createInsertManyOps,
    createInsertBatchOps,

    // Update 操作
    createUpdateOneOps,
    createUpdateManyOps,
    createReplaceOneOps,

    // Find and Modify 操作
    createFindOneAndUpdateOps,
    createFindOneAndReplaceOps,

    // Delete 操作
    createDeleteOneOps,
    createDeleteManyOps,
    createFindOneAndDeleteOps,
};
