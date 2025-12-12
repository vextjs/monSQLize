/**
 * 自动 ObjectId 转换 - 使用示例
 * @description 展示如何使用自动 ObjectId 转换功能
 */

const MonSQLize = require('../lib');
const { stopMemoryServer } = require('../lib/mongodb/connect');

// ============================================================================
// 常量配置
// ============================================================================

// MongoDB 连接配置
// 优先使用环境变量 MONGODB_URI，否则使用 Memory Server
const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'test_objectid_conversion',
    config: { useMemoryServer: true }
};

// ============================================
// 示例1: 基础使用（默认启用）
// ============================================

async function example1_basicUsage() {
    console.log('\n=== 示例1: 基础使用 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();

    // ✅ 所有方法自动转换 ObjectId 字符串

    // 插入测试数据
    await collection('users').insertOne({
        _id: '507f1f77bcf86cd799439011',
        name: 'Alice',
        managerId: '507f1f77bcf86cd799439012',
        departmentId: '507f1f77bcf86cd799439013'
    });

    // 查询：使用字符串 _id
    const user = await collection('users').findOne({
        _id: '507f1f77bcf86cd799439011' // ✅ 自动转换为 ObjectId
    });
    console.log('查询用户:', user ? user.name : null);

    // 更新：filter 和 update 中的 ObjectId 都转换
    await collection('users').updateOne(
        { _id: '507f1f77bcf86cd799439011' }, // ✅ 自动转换
        { $set: { managerId: '507f1f77bcf86cd799439014' } } // ✅ 自动转换
    );
    console.log('更新成功');

    // 聚合：pipeline 中的 ObjectId 自动转换
    const results = await collection('users').aggregate([
        { $match: { _id: '507f1f77bcf86cd799439011' } }, // ✅ 自动转换
        { $project: { name: 1 } }
    ]);
    console.log('聚合结果:', results.length);

    await msq.close();
}

// ============================================
// 示例2: 批量操作
// ============================================

async function example2_batchOperations() {
    console.log('\n=== 示例2: 批量操作 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();

    // 批量插入：所有 ObjectId 字符串自动转换
    const result = await collection('users').insertMany([
        {
            name: 'User1',
            managerId: '507f1f77bcf86cd799439011',
            departmentId: '507f1f77bcf86cd799439012'
        },
        {
            name: 'User2',
            managerId: '507f1f77bcf86cd799439013',
            departmentId: '507f1f77bcf86cd799439012'
        },
        {
            name: 'User3',
            managerId: '507f1f77bcf86cd799439014',
            departmentId: '507f1f77bcf86cd799439015'
        }
    ]);

    console.log('插入记录数:', result.insertedCount);

    // 批量更新
    await collection('users').updateMany(
        { departmentId: '507f1f77bcf86cd799439012' }, // ✅ 自动转换
        { $set: { status: 'active' } }
    );
    console.log('批量更新成功');

    // 批量删除
    const deleteResult = await collection('users').deleteMany({
        managerId: '507f1f77bcf86cd799439011' // ✅ 自动转换
    });
    console.log('删除记录数:', deleteResult.deletedCount);

    await msq.close();
}

// ============================================
// 示例3: 嵌套对象和数组
// ============================================

async function example3_nestedObjects() {
    console.log('\n=== 示例3: 嵌套对象和数组 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();

    // 嵌套对象中的 ObjectId 自动转换
    await collection('users').insertOne({
        name: 'Charlie',
        profile: {
            managerId: '507f1f77bcf86cd799439011', // ✅ 自动转换
            settings: {
                defaultProjectId: '507f1f77bcf86cd799439012' // ✅ 自动转换
            }
        }
    });
    console.log('嵌套对象插入成功');

    // 数组中的 ObjectId 自动转换
    await collection('users').insertOne({
        name: 'David',
        friendIds: [
            '507f1f77bcf86cd799439011', // ✅ 自动转换
            '507f1f77bcf86cd799439012', // ✅ 自动转换
            '507f1f77bcf86cd799439013'  // ✅ 自动转换
        ]
    });
    console.log('数组插入成功');

    // 查询嵌套字段
    const users = await collection('users').find({
        'profile.managerId': '507f1f77bcf86cd799439011' // ✅ 自动转换
    });

    console.log('找到的用户:', users.length);

    await msq.close();
}

// ============================================
// 示例4: 自定义配置
// ============================================

async function example4_customConfig() {
    console.log('\n=== 示例4: 自定义配置 ===\n');

    const msq = new MonSQLize({
        ...DB_CONFIG,
        autoConvertObjectId: {
            enabled: true,
            excludeFields: ['code', 'sku'], // 业务编码字段不转换
            customFieldPatterns: [/^ref.*$/], // 自定义匹配模式
            maxDepth: 10,
            logLevel: 'warn'
        }
    });
    const { collection } = await msq.connect();

    // code 和 sku 字段不会被转换（即使格式像 ObjectId）
    await collection('products').insertOne({
        name: 'Product 1',
        code: '507f1f77bcf86cd799439011', // ❌ 不转换，保持字符串
        sku: '507f1f77bcf86cd799439012',  // ❌ 不转换，保持字符串
        categoryId: '507f1f77bcf86cd799439013' // ✅ 转换
    });
    console.log('自定义配置插入成功');

    await msq.close();
}

// ============================================
// 示例5: 禁用自动转换
// ============================================

async function example5_disableConversion() {
    console.log('\n=== 示例5: 禁用自动转换 ===\n');

    const msq = new MonSQLize({
        ...DB_CONFIG,
        autoConvertObjectId: false // 禁用自动转换
    });
    const { collection } = await msq.connect();

    // 需要手动转换 ObjectId
    const { ObjectId } = require('mongodb');

    await collection('users').insertOne({
        _id: new ObjectId('507f1f77bcf86cd799439011'), // 手动转换
        name: 'Manual Test'
    });
    console.log('手动转换插入成功');

    await msq.close();
}

// ============================================
// 示例6: 链式调用
// ============================================

async function example6_chainedCalls() {
    console.log('\n=== 示例6: 链式调用 ===\n');

    const msq = new MonSQLize(DB_CONFIG);
    const { collection } = await msq.connect();

    // 插入测试数据
    await collection('users').insertMany([
        { departmentId: '507f1f77bcf86cd799439011', name: 'User1', age: 25 },
        { departmentId: '507f1f77bcf86cd799439011', name: 'User2', age: 30 }
    ]);

    // 链式调用中的 ObjectId 自动转换
    const users = await collection('users')
        .find({
            departmentId: '507f1f77bcf86cd799439011' // ✅ 自动转换
        })
        .limit(10)
        .sort({ age: -1 });

    console.log('找到的用户:', users.length);

    await msq.close();
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
    try {
        await example1_basicUsage();
        await example2_batchOperations();
        await example3_nestedObjects();
        await example4_customConfig();
        await example5_disableConversion();
        await example6_chainedCalls();

        console.log('\n✅ 所有示例运行完成！\n');
    } catch (error) {
        console.error('❌ 示例运行失败:', error);
    } finally {
        // 停止内存数据库
        await stopMemoryServer(console);
    }
}

// 导出示例函数
module.exports = {
    example1_basicUsage,
    example2_batchOperations,
    example3_nestedObjects,
    example4_customConfig,
    example5_disableConversion,
    example6_chainedCalls,
    runAllExamples
};

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples().catch(console.error);
}

