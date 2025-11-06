/**
 * 模块化重构验证脚本
 * 验证新创建的模块是否可以正常工作
 */

const path = require('path');

// 测试 namespace 模块
const createNamespaceOps = require('./lib/mongodb/management/namespace');
const namespaceOps = createNamespaceOps({
    instanceId: 'test-iid',
    type: 'mongodb',
    db: 'test_db',
    collection: 'test_collection'
});

console.log('✓ namespace 模块加载成功');
console.log('  getNamespace():', namespaceOps.getNamespace());

// 测试 collection-ops 模块（模拟 db 和 collection 对象）
const createCollectionOps = require('./lib/mongodb/management/collection-ops');
const mockCollection = {
    collectionName: 'test_collection',
    drop: async () => true
};
const mockDb = {
    createCollection: async (name, options) => {
        console.log(`  模拟创建集合: ${name}`, options ? `(options: ${JSON.stringify(options)})` : '');
        return true;
    }
};

const collectionOps = createCollectionOps({
    db: mockDb,
    collection: mockCollection
});

console.log('\n✓ collection-ops 模块加载成功');

// 测试方法
(async () => {
    try {
        await collectionOps.createCollection('new_collection');
        await collectionOps.createView('test_view', 'source_collection', [{ $match: { status: 'active' } }]);

        console.log('\n✅ 所有模块验证通过！');
        console.log('\n📋 已完成的模块:');
        console.log('  1. management/namespace.js ✓');
        console.log('  2. management/collection-ops.js ✓');
        console.log('\n📝 下一步: 继续创建其他模块或运行完整测试');
    } catch (err) {
        console.error('\n❌ 验证失败:', err.message);
        process.exit(1);
    }
})();
