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

    await msq.connect();

    // ✅ 所有方法自动转换 ObjectId 字符串

    // 查询：使用字符串 _id
    const user = await msq.collection('users').findOne({
        _id: '507f1f77bcf86cd799439011' // ✅ 自动转换为 ObjectId
    });
    console.log('查询用户:', user);

    // 插入：文档中的 ObjectId 字符串自动转换
    await msq.collection('users').insertOne({
        name: 'Alice',
        managerId: '507f1f77bcf86cd799439012', // ✅ 自动转换
        departmentId: '507f1f77bcf86cd799439013' // ✅ 自动转换
    });

    // 更新：filter 和 update 中的 ObjectId 都转换
    await msq.collection('users').updateOne(
        { _id: '507f1f77bcf86cd799439011' }, // ✅ 自动转换
        { $set: { managerId: '507f1f77bcf86cd799439014' } } // ✅ 自动转换
    );

    // 聚合：pipeline 中的 ObjectId 自动转换
    const results = await msq.collection('orders').aggregate([
        { $match: { userId: '507f1f77bcf86cd799439011' } }, // ✅ 自动转换
        { $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
        }}
    ]);

    await msq.close();
}

// ============================================
// 示例2: 解决 ObjectId 混存问题
// ============================================

async function example2_mixedObjectIds() {
    console.log('\n=== 示例2: 解决 ObjectId 混存问题 ===\n');

    const msq = new MonSQLize(DB_CONFIG);

    await msq.connect();

    // 场景：数据库中 ObjectId 混存
    // 有些文档的 userId 是 ObjectId 类型
    // 有些文档的 userId 是 String 类型

    // 问题：之前需要分别查询
    // const objectIdUsers = await find({ userId: new ObjectId('507f...') });
    // const stringUsers = await find({ userId: '507f...' });

    // ✅ 现在：统一使用字符串，自动转换
    const allUsers = await msq.collection('users').find({
        userId: '507f1f77bcf86cd799439011' // 自动转换，能匹配 ObjectId 类型
    });

    console.log('找到的用户:', allUsers.length);

    // ✅ 新插入的数据自动统一为 ObjectId 类型
    await msq.collection('users').insertOne({
        name: 'Bob',
        userId: '507f1f77bcf86cd799439012' // 存储为 ObjectId，统一数据类型
    });

    await msq.close();
}

// ============================================
// 示例3: 批量操作
// ============================================

async function example3_batchOperations() {
    console.log('\n=== 示例3: 批量操作 ===\n');

    const msq = new MonSQLize(DB_CONFIG);

    await msq.connect();

    // 批量插入：所有 ObjectId 字符串自动转换
    const result = await msq.collection('users').insertMany([
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
    await msq.collection('users').updateMany(
        { departmentId: '507f1f77bcf86cd799439012' }, // ✅ 自动转换
        { $set: { status: 'active' } }
    );

    // 批量删除
    await msq.collection('users').deleteMany({
        managerId: '507f1f77bcf86cd799439011' // ✅ 自动转换
    });

    await msq.close();
}

// ============================================
// 示例4: 嵌套对象和数组
// ============================================

async function example4_nestedObjects() {
    console.log('\n=== 示例4: 嵌套对象和数组 ===\n');

    const msq = new MonSQLize(DB_CONFIG);

    await msq.connect();

    // 嵌套对象中的 ObjectId 自动转换
    await msq.collection('users').insertOne({
        name: 'Charlie',
        profile: {
            managerId: '507f1f77bcf86cd799439011', // ✅ 自动转换
            settings: {
                defaultProjectId: '507f1f77bcf86cd799439012' // ✅ 自动转换
            }
        }
    });

    // 数组中的 ObjectId 自动转换
    await msq.collection('users').insertOne({
        name: 'David',
        friendIds: [
            '507f1f77bcf86cd799439011', // ✅ 自动转换
            '507f1f77bcf86cd799439012', // ✅ 自动转换
            '507f1f77bcf86cd799439013'  // ✅ 自动转换
        ]
    });

    // 查询嵌套字段
    const users = await msq.collection('users').find({
        'profile.managerId': '507f1f77bcf86cd799439011' // ✅ 自动转换
    });

    console.log('找到的用户:', users.length);

    await msq.close();
}

// ============================================
// 示例5: 自定义配置
// ============================================

async function example5_customConfig() {
    console.log('\n=== 示例5: 自定义配置 ===\n');

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

    await msq.connect();

    // code 和 sku 字段不会被转换（即使格式像 ObjectId）
    await msq.collection('products').insertOne({
        name: 'Product 1',
        code: '507f1f77bcf86cd799439011', // ❌ 不转换，保持字符串
        sku: '507f1f77bcf86cd799439012',  // ❌ 不转换，保持字符串
        categoryId: '507f1f77bcf86cd799439013' // ✅ 转换
    });

    await msq.close();
}

// ============================================
// 示例6: 禁用自动转换
// ============================================

async function example6_disableConversion() {
    console.log('\n=== 示例6: 禁用自动转换 ===\n');

    const msq = new MonSQLize({
        ...DB_CONFIG,
        autoConvertObjectId: false // 禁用自动转换
    });

    await msq.connect();

    // 需要手动转换 ObjectId
    const { ObjectId } = require('mongodb');

    const user = await msq.collection('users').findOne({
        _id: new ObjectId('507f1f77bcf86cd799439011') // 手动转换
    });

    await msq.close();
}

// ============================================
// 示例7: 链式调用
// ============================================

async function example7_chainedCalls() {
    console.log('\n=== 示例7: 链式调用 ===\n');

    const msq = new MonSQLize(DB_CONFIG);

    await msq.connect();

    // 链式调用中的 ObjectId 自动转换
    const users = await msq.collection('users')
        .find({
            departmentId: '507f1f77bcf86cd799439011' // ✅ 自动转换
        })
        .limit(10)
        .sort({ createdAt: -1 });

    console.log('找到的用户:', users.length);

    await msq.close();
}

// ============================================
// 示例8: 原子操作
// ============================================

async function example8_atomicOperations() {
    console.log('\n=== 示例8: 原子操作 ===\n');

    const msq = new MonSQLize(DB_CONFIG);

    await msq.connect();

    // findOneAndUpdate
    const updatedUser = await msq.collection('users').findOneAndUpdate(
        { _id: '507f1f77bcf86cd799439011' }, // ✅ 自动转换
        { $set: { managerId: '507f1f77bcf86cd799439012' } }, // ✅ 自动转换
        { returnDocument: 'after' }
    );

    // findOneAndReplace
    const replacedUser = await msq.collection('users').findOneAndReplace(
        { _id: '507f1f77bcf86cd799439011' }, // ✅ 自动转换
        {
            name: 'Updated Name',
            managerId: '507f1f77bcf86cd799439013' // ✅ 自动转换
        }
    );

    // findOneAndDelete
    const deletedUser = await msq.collection('users').findOneAndDelete({
        _id: '507f1f77bcf86cd799439011' // ✅ 自动转换
    });

    await msq.close();
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
    try {
        await example1_basicUsage();
        await example2_mixedObjectIds();
        await example3_batchOperations();
        await example4_nestedObjects();
        await example5_customConfig();
        await example6_disableConversion();
        await example7_chainedCalls();
        await example8_atomicOperations();

        console.log('\n✅ 所有示例运行完成！\n');
    } catch (error) {
        console.error('❌ 示例运行失败:', error);
    }
}

// 导出示例函数
module.exports = {
    example1_basicUsage,
    example2_mixedObjectIds,
    example3_batchOperations,
    example4_nestedObjects,
    example5_customConfig,
    example6_disableConversion,
    example7_chainedCalls,
    example8_atomicOperations,
    runAllExamples
};

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples().catch(console.error);
}

