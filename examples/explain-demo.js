/**
 * Explain 功能演示
 * 展示如何在 findOne、find、count、aggregate、distinct 方法中使用 explain 参数
 */

const MonSQLize = require('../lib');

// 简单日志工具
const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};

async function runExplainDemo() {
    // 创建 MongoDB 客户端实例
    const mongo = new MonSQLize({
        type: 'mongodb',
        databaseName: 'testdb',
        config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
        logger,
        maxTimeMS: 5000,
        slowQueryMs: 100,
    });

    try {
        // 连接到 MongoDB
        const { collection } = await mongo.connect();
        console.log('✅ 已连接到 MongoDB\n');

        // 获取测试集合
        const users = collection('users');

        console.log('═══════════════════════════════════════════════════════');
        console.log('1️⃣  测试 findOne 的 explain 功能');
        console.log('═══════════════════════════════════════════════════════\n');

        // 1. findOne - 基础 explain (queryPlanner)
        console.log('📋 1.1 基础 explain (explain: true)');
        const explainFindOne = await users.findOne({
            query: { age: { $gt: 25 } },
            sort: { createdAt: -1 },
            explain: true // 返回 queryPlanner 级别
        });
        console.log('Query Planner:', JSON.stringify(explainFindOne.queryPlanner, null, 2));
        console.log();

        // 1.2 findOne - executionStats 级别
        console.log('📋 1.2 详细执行统计 (explain: "executionStats")');
        const explainFindOneStats = await users.findOne({
            query: { status: 'active' },
            explain: 'executionStats'
        });
        console.log('Execution Stats:', JSON.stringify(explainFindOneStats.executionStats, null, 2));
        console.log();

        console.log('═══════════════════════════════════════════════════════');
        console.log('2️⃣  测试 find 的 explain 功能');
        console.log('═══════════════════════════════════════════════════════\n');

        // 2. find - 基础 explain
        console.log('📋 2.1 find 查询计划');
        const explainFind = await users.find({
            query: { age: { $gte: 18, $lte: 65 } },
            sort: { name: 1 },
            limit: 10,
            explain: true
        });
        console.log('Find Query Planner:', JSON.stringify(explainFind.queryPlanner?.winningPlan, null, 2));
        console.log();

        // 2.2 find - allPlansExecution 级别
        console.log('📋 2.2 所有计划执行详情 (explain: "allPlansExecution")');
        const explainFindAll = await users.find({
            query: { city: 'Beijing' },
            explain: 'allPlansExecution'
        });
        console.log('All Plans:', explainFindAll.executionStats?.allPlansExecution?.length || 0, 'plans');
        console.log();

        console.log('═══════════════════════════════════════════════════════');
        console.log('3️⃣  测试 count 的 explain 功能');
        console.log('═══════════════════════════════════════════════════════\n');

        // 3.1 count - 有查询条件
        console.log('📋 3.1 count 带条件查询');
        const explainCount = await users.count({
            query: { status: 'active', age: { $gte: 18 } },
            explain: 'executionStats'
        });
        console.log('Count Execution Stats:', JSON.stringify(explainCount.executionStats, null, 2));
        console.log();

        // 3.2 count - 空查询（estimatedDocumentCount）
        console.log('📋 3.2 count 无条件查询（估算）');
        const explainCountEmpty = await users.count({
            explain: true
        });
        console.log('Estimated Count Info:', JSON.stringify(explainCountEmpty, null, 2));
        console.log();

        console.log('═══════════════════════════════════════════════════════');
        console.log('4️⃣  测试 aggregate 的 explain 功能');
        console.log('════════════════════════════════════════════════════��══\n');

        // 4. aggregate - 聚合管道 explain
        console.log('📋 4.1 聚合管道执行计划');
        const explainAggregate = await users.aggregate([
            { $match: { age: { $gte: 18 } } },
            { $group: { _id: '$city', count: { $sum: 1 }, avgAge: { $avg: '$age' } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ], {
            explain: 'executionStats'
        });
        console.log('Aggregate Stages:', explainAggregate.stages?.length || 0, 'stages');
        console.log('Execution Stats:', JSON.stringify(explainAggregate.executionStats, null, 2));
        console.log();

        console.log('═══════════════════════════════════════════════════════');
        console.log('5️⃣  测试 distinct 的 explain 功能');
        console.log('═══════════════════════════════════════════════════════\n');

        // 5.1 distinct - 基础 explain
        console.log('📋 5.1 distinct 字段去重');
        const explainDistinct = await users.distinct('city', {
            query: { status: 'active' },
            explain: true
        });
        console.log('Distinct Query Planner:', JSON.stringify(explainDistinct.queryPlanner, null, 2));
        console.log();

        // 5.2 distinct - 带索引提示
        console.log('📋 5.2 distinct 带索引提示');
        const explainDistinctHint = await users.distinct('status', {
            query: { age: { $gte: 18 } },
            hint: { age: 1 },
            explain: 'executionStats'
        });
        console.log('Distinct Execution Stats:', JSON.stringify(explainDistinctHint.executionStats, null, 2));
        console.log();

        console.log('═══════════════════════════════════════════════════════');
        console.log('📊 Explain 级别对比');
        console.log('═══════════════════════════════════════════════════════\n');

        const queryOptions = {
            query: { age: { $gte: 25 } },
            sort: { createdAt: -1 },
            limit: 10
        };

        // 对比三个级别
        console.log('📌 queryPlanner 级别（最快）');
        const planner = await users.find({ ...queryOptions, explain: 'queryPlanner' });
        console.log('  - 包含字段:', Object.keys(planner).join(', '));

        console.log('\n📌 executionStats 级别（推荐）');
        const execStats = await users.find({ ...queryOptions, explain: 'executionStats' });
        console.log('  - 包含字段:', Object.keys(execStats).join(', '));

        console.log('\n📌 allPlansExecution 级别（最详细）');
        const allPlans = await users.find({ ...queryOptions, explain: 'allPlansExecution' });
        console.log('  - 包含字段:', Object.keys(allPlans).join(', '));

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('✅ 所有 explain 功能测试完成！');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('💡 使用说明：');
        console.log('  - explain: true          → 返回 queryPlanner（最快，仅计划）');
        console.log('  - explain: "queryPlanner" → 同上');
        console.log('  - explain: "executionStats" → 返回执行统计（推荐，包含实际执行数据）');
        console.log('  - explain: "allPlansExecution" → 返回所有计划详情（最慢，调试用）');
        console.log();
        console.log('⚠️  注意事项：');
        console.log('  - explain 模式下不会执行实际查询，不返回文档');
        console.log('  - explain 结果不会被缓存');
        console.log('  - stream 模式不支持 explain（互斥）');
        console.log();

    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.error(error);
    } finally {
        // 关闭连接
        await mongo.close();
        console.log('👋 已断开 MongoDB 连接');
    }
}

// 运行演示
if (require.main === module) {
    runExplainDemo().catch(console.error);
}

module.exports = { runExplainDemo };
