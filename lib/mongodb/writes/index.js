/**
 * MongoDB 写操作模块入口
 * 统一导出所有写操作的工厂函数
 */

const { createInsertOneOps } = require('./insert-one');
const { createInsertManyOps } = require('./insert-many');

module.exports = {
    // Insert 操作
    createInsertOneOps,
    createInsertManyOps,
};
