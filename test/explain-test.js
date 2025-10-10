/**
 * Explain 功能单元测试
 * 测试 findOne、find、count、aggregate、distinct 方法的 explain 参数
 */

const MonSQLize = require('../lib');

const logger = {
    info: () => {},
    warn: () => {},
    error: console.error,
};

async function testExplain() {
    const mongo = new MonSQLize({
        type: 'mongodb',
        databaseName: 'testdb',
        config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
        logger,
        maxTimeMS: 5000
    });

    try {
        // 连接到测试数据库
        const { collection } = await mongo.connect();

        const testCol = collection('test_explain');

        // 插入测试数据
        try {
            await testCol.dropCollection();
        } catch (_) {}

        await testCol.createCollection();

        // 使用原生 MongoDB 驱动插入数据（通过 _adapter.client）
        const nativeCol = mongo._adapter.client.db('testdb').collection('test_explain');
        await nativeCol.insertMany([
            { name: 'Alice', age: 25, city: 'Beijing', status: 'active' },
            { name: 'Bob', age: 30, city: 'Shanghai', status: 'active' },
            { name: 'Charlie', age: 35, city: 'Beijing', status: 'inactive' },
            { name: 'David', age: 28, city: 'Shenzhen', status: 'active' },
        ]);

        console.log('✅ 测试数据已插入\n');

        // 测试 findOne explain
        console.log('1️⃣  测试 findOne explain');
        const explainFindOne = await testCol.findOne({
            query: { age: { $gt: 25 } },
            explain: true
        });
        console.assert(explainFindOne.queryPlanner, '❌ findOne explain 应该返回 queryPlanner');
        console.assert(!Array.isArray(explainFindOne), '❌ findOne explain 不应返回数组');
        console.log('✅ findOne explain 测试通过\n');

        // 测试 find explain
        console.log('2️⃣  测试 find explain');
        const explainFind = await testCol.find({
            query: { status: 'active' },
            limit: 2,
            explain: 'executionStats'
        });
        console.assert(explainFind.queryPlanner, '❌ find explain 应该返回 queryPlanner');
        console.assert(explainFind.executionStats, '❌ find explain 应该返回 executionStats');
        console.assert(!Array.isArray(explainFind), '❌ find explain 不应返回文档数组');
        console.log('✅ find explain 测试通过\n');

        // 测试 count explain
        console.log('3️⃣  测试 count explain');
        const explainCount = await testCol.count({
            query: { age: { $gte: 28 } },
            explain: true
        });
        console.assert(typeof explainCount === 'object', '❌ count explain 应该返回对象');
        console.assert(typeof explainCount !== 'number', '❌ count explain 不应返回数字');
        console.log('✅ count explain 测试通过\n');

        // 测试 count explain (空查询)
        console.log('4️⃣  测试 count explain (空查询)');
        const explainCountEmpty = await testCol.count({
            explain: true
        });
        console.assert(explainCountEmpty.queryPlanner || explainCountEmpty.command, '❌ count 空查询 explain 应该返回计划信息');
        console.log('✅ count 空查询 explain 测试通过\n');

        // 测试 aggregate explain
        console.log('5️⃣  测试 aggregate explain');
        const explainAggregate = await testCol.aggregate([
            { $match: { status: 'active' } },
            { $group: { _id: '$city', count: { $sum: 1 } } }
        ], {
            explain: 'executionStats'
        });
        console.assert(explainAggregate.queryPlanner || explainAggregate.stages, '❌ aggregate explain 应该返回计划信息');
        console.assert(!Array.isArray(explainAggregate) || explainAggregate.queryPlanner, '❌ aggregate explain 不应返回文档数组');
        console.log('✅ aggregate explain 测试通过\n');

        // 测试 distinct explain
        console.log('6️⃣  测试 distinct explain');
        const explainDistinct = await testCol.distinct('city', {
            query: { status: 'active' },
            explain: true
        });
        console.assert(typeof explainDistinct === 'object', '❌ distinct explain 应该返回对象');
        console.assert(!Array.isArray(explainDistinct) || explainDistinct.queryPlanner, '❌ distinct explain 不应返回值数组');
        console.log('✅ distinct explain 测试通过\n');

        // 测试不同 verbosity 级别
        console.log('7️⃣  测试 explain verbosity 级别');
        const queryPlannerLevel = await testCol.find({
            query: { age: { $gt: 20 } },
            explain: 'queryPlanner'
        });
        console.assert(queryPlannerLevel.queryPlanner, '❌ queryPlanner 级别应该有 queryPlanner 字段');

        const executionStatsLevel = await testCol.find({
            query: { age: { $gt: 20 } },
            explain: 'executionStats'
        });
        console.assert(executionStatsLevel.executionStats, '❌ executionStats 级别应该有 executionStats 字段');
        console.log('✅ explain verbosity 级别测试通过\n');

        // 验证 explain 不返回实际数据
        console.log('8️⃣  验证 explain 不返回实际数据');
        const normalFind = await testCol.find({ query: { status: 'active' } });
        const explainFindData = await testCol.find({ query: { status: 'active' }, explain: true });
        console.assert(Array.isArray(normalFind), '❌ 正常查询应该返回数组');
        console.assert(!Array.isArray(explainFindData) || explainFindData.queryPlanner, '❌ explain 查询不应返回文档数组');
        console.log('✅ explain 正确返回计划而非数据\n');

        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ 所有 explain 功能测试通过！');
        console.log('═══════════════════════════════════════════════════════');

        return true;

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
        return false;
    } finally {
        await mongo.close();
    }
}

// 运行测试
if (require.main === module) {
    testExplain()
        .then(success => process.exit(success ? 0 : 1))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}

module.exports = { testExplain };
