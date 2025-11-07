/**
 * readPreference 副本集读偏好配置示例
 * 
 * 功能说明：
 * - readPreference 用于控制 MongoDB 副本集中读操作的节点选择策略
 * - 适用场景：副本集部署、读写分离、降低主节点负载
 * - 仅全局配置（连接级别），不支持查询级别覆盖
 * 
 * ⚠️ 注意事项：
 * - 读从节点可能有复制延迟（数据不是最新的）
 * - 需要 MongoDB 副本集环境（单机模式无效）
 * - 跨数据库兼容性：MongoDB 专属，PostgreSQL/MySQL 无对应概念
 * 
 * 最佳实践：
 * - 读多写少场景：使用 secondaryPreferred 降低主节点负载
 * - 强一致性场景：使用 primary（默认）
 * - 低延迟场景：使用 nearest（就近读取）
 */

const MonSQLize = require('monsqlize');

// ============================================
// 示例 1: 默认读偏好（primary，读主节点）
// ============================================
async function example1_primary() {
    console.log('\n=== 示例 1: 默认读偏好（primary）===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_db',
        config: {
            uri: 'mongodb://localhost:27017',
            // 不配置 readPreference，默认为 'primary'（仅读主节点）
        }
    });

    await msq.connect();
    const { collection } = msq;

    // 查询操作会自动从主节点读取
    const users = await collection('users').find({ query: {} });
    console.log(`✅ 从主节点读取到 ${users.length} 条数据`);

    await msq.close();
}

// ============================================
// 示例 2: secondaryPreferred（优先读从节点）
// ============================================
async function example2_secondaryPreferred() {
    console.log('\n=== 示例 2: secondaryPreferred（优先读从节点）===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_db',
        config: {
            uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
            readPreference: 'secondaryPreferred'  // ← 优先读从节点
        }
    });

    await msq.connect();
    const { collection } = msq;

    // 查询优先从从节点读取（降低主节点负载）
    const products = await collection('products').find({
        query: { category: 'electronics' }
    });
    console.log(`✅ 从从节点读取到 ${products.length} 条产品数据`);

    // ⚠️ 注意：从节点可能有复制延迟
    console.log('⚠️  注意：从节点数据可能有几毫秒到几秒的延迟');

    await msq.close();
}

// ============================================
// 示例 3: secondary（仅读从节点）
// ============================================
async function example3_secondary() {
    console.log('\n=== 示例 3: secondary（仅读从节点）===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'analytics_db',
        config: {
            uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
            readPreference: 'secondary'  // ← 仅读从节点
        }
    });

    await msq.connect();
    const { collection } = msq;

    // 适用场景：分析/报表查询，完全隔离主节点写负载
    const reports = await collection('sales').aggregate([
        { $match: { date: { $gte: new Date('2025-01-01') } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } }
    ]);
    console.log(`✅ 从从节点生成 ${reports.length} 条报表数据`);
    console.log('✅ 主节点不受影响，专注处理写操作');

    await msq.close();
}

// ============================================
// 示例 4: primaryPreferred（优先读主节点）
// ============================================
async function example4_primaryPreferred() {
    console.log('\n=== 示例 4: primaryPreferred（优先读主节点）===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_db',
        config: {
            uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
            readPreference: 'primaryPreferred'  // ← 优先读主节点，主节点故障时读从节点
        }
    });

    await msq.connect();
    const { collection } = msq;

    // 适用场景：需要强一致性，但希望主节点故障时有备用方案
    const orders = await collection('orders').find({
        query: { status: 'pending' }
    });
    console.log(`✅ 优先从主节点读取 ${orders.length} 条订单`);
    console.log('✅ 如果主节点故障，自动切换到从节点');

    await msq.close();
}

// ============================================
// 示例 5: nearest（就近读取，低延迟）
// ============================================
async function example5_nearest() {
    console.log('\n=== 示例 5: nearest（就近读取）===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_db',
        config: {
            uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
            readPreference: 'nearest'  // ← 读延迟最低的节点（主或从）
        }
    });

    await msq.connect();
    const { collection } = msq;

    // 适用场景：全球分布式部署，就近读取降低延迟
    const articles = await collection('articles').find({
        query: { published: true },
        limit: 10
    });
    console.log(`✅ 从延迟最低的节点读取 ${articles.length} 篇文章`);
    console.log('✅ 适用于全球分布式部署场景');

    await msq.close();
}

// ============================================
// 示例 6: 结合其他选项使用
// ============================================
async function example6_combined() {
    console.log('\n=== 示例 6: 结合其他选项使用 ===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_db',
        config: {
            uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
            readPreference: 'secondaryPreferred'  // ← 读偏好
        },
        maxTimeMS: 3000,  // 查询超时
        slowQueryMs: 500  // 慢查询阈值
    });

    await msq.connect();
    const { collection } = msq;

    // readPreference 与其他选项（hint, collation, comment）兼容
    const results = await collection('products').find({
        query: { price: { $gt: 100 } },
        hint: { category: 1, price: 1 },  // 索引提示
        comment: 'expensive-products-query',  // 查询注释
        maxTimeMS: 2000  // 单次查询超时
    });
    console.log(`✅ 使用多个选项组合查询: ${results.length} 条结果`);

    await msq.close();
}

// ============================================
// 示例 7: 错误场景（单机模式无效）
// ============================================
async function example7_standalone() {
    console.log('\n=== 示例 7: 单机模式下 readPreference 无效 ===');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_db',
        config: {
            uri: 'mongodb://localhost:27017',  // ← 单机模式（无副本集）
            readPreference: 'secondary'  // ← 配置无效，仍然读主节点
        }
    });

    await msq.connect();
    const { collection } = msq;

    // 单机模式下，readPreference 被忽略，始终读唯一的节点
    const users = await collection('users').find({ query: {} });
    console.log(`⚠️  单机模式: readPreference 配置无效，读取 ${users.length} 条数据`);
    console.log('⚠️  需要副本集环境才能生效');

    await msq.close();
}

// ============================================
// 运行所有示例
// ============================================
async function runAllExamples() {
    console.log('========================================');
    console.log('  readPreference 副本集读偏好示例');
    console.log('========================================');

    try {
        await example1_primary();
        await example2_secondaryPreferred();
        // await example3_secondary();  // 需要副本集环境
        // await example4_primaryPreferred();  // 需要副本集环境
        // await example5_nearest();  // 需要副本集环境
        await example6_combined();
        await example7_standalone();
    } catch (error) {
        console.error('❌ 示例运行失败:', error.message);
        console.error('💡 提示: 部分示例需要 MongoDB 副本集环境');
    }

    console.log('\n========================================');
    console.log('  所有示例运行完成');
    console.log('========================================');
}

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
    runAllExamples().catch(console.error);
}

module.exports = {
    example1_primary,
    example2_secondaryPreferred,
    example3_secondary,
    example4_primaryPreferred,
    example5_nearest,
    example6_combined,
    example7_standalone
};
