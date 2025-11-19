/**
 * 事务优化示例
 * 演示只读优化和文档级别锁的使用
 */

const MonSQLize = require('..');

async function main() {
    // 1. 初始化（需要副本集）
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'transaction_optimizations_demo',
        config: {
            uri: 'mongodb://localhost:27017?replicaSet=rs0'
        },
        cache: {
            maxSize: 1000,
            defaultTTL: 60000
        }
    });

    const conn = await msq.connect();
    const collection = conn.collection;

    console.log('✅ 已连接到 MongoDB\n');

    // 清空测试数据
    await collection('users').deleteMany({});
    await collection('products').deleteMany({});

    // ==========================================
    // 示例1: 只读优化
    // ==========================================
    console.log('📖 示例1: 只读优化');
    console.log('─'.repeat(50));

    // 插入测试数据
    await collection('users').insertMany([
        { _id: 1, name: 'Alice', balance: 1000 },
        { _id: 2, name: 'Bob', balance: 2000 }
    ]);

    // 只读事务：不会失效缓存
    console.log('\n🔍 执行只读事务...');
    await msq.withTransaction(async (tx) => {
        const user1 = await collection('users').findOne(
            { _id: 1 },
            { session: tx.session }
        );

        const user2 = await collection('users').findOne(
            { _id: 2 },
            { session: tx.session }
        );

        console.log('  查询到用户:', user1.name, '余额:', user1.balance);
        console.log('  查询到用户:', user2.name, '余额:', user2.balance);

        // ✅ 只读事务：不失效缓存，不添加缓存锁
        console.log('  ✅ 只读事务完成（未失效缓存）');
    });

    // 写入事务：会失效缓存
    console.log('\n✏️  执行写入事务...');
    await msq.withTransaction(async (tx) => {
        await collection('users').updateOne(
            { _id: 1 },
            { $inc: { balance: 100 } },
            { session: tx.session }
        );

        console.log('  更新用户1的余额 +100');
        console.log('  ✅ 写入事务完成（已失效缓存）');
    });

    // 查看统计
    const stats1 = msq._transactionManager.getStats();
    console.log('\n📊 事务统计:');
    console.log(`  总事务数: ${stats1.totalTransactions}`);
    console.log(`  只读事务: ${stats1.readOnlyTransactions} (${stats1.readOnlyRatio})`);
    console.log(`  写入事务: ${stats1.writeTransactions}`);
    console.log(`  成功率: ${stats1.successRate}`);
    console.log(`  平均耗时: ${stats1.averageDuration.toFixed(2)}ms`);

    // ==========================================
    // 示例2: 文档级别锁（并发更新不同文档）
    // ==========================================
    console.log('\n\n🔒 示例2: 文档级别锁（并发更新不同文档）');
    console.log('─'.repeat(50));

    // 插入产品数据
    await collection('products').insertMany([
        { _id: 'SKU001', name: 'iPhone', stock: 100 },
        { _id: 'SKU002', name: 'iPad', stock: 200 },
        { _id: 'SKU003', name: 'MacBook', stock: 50 }
    ]);

    console.log('\n⚡ 并发更新3个不同产品的库存...');
    const startTime = Date.now();

    // 并发执行3个事务（更新不同产品）
    const results = await Promise.all([
        msq.withTransaction(async (tx) => {
            await collection('products').updateOne(
                { _id: 'SKU001' },
                { $inc: { stock: -10 } },
                { session: tx.session }
            );
            console.log('  ✅ 事务1: iPhone 库存 -10');
            return 'tx1-done';
        }),
        msq.withTransaction(async (tx) => {
            await collection('products').updateOne(
                { _id: 'SKU002' },
                { $inc: { stock: -20 } },
                { session: tx.session }
            );
            console.log('  ✅ 事务2: iPad 库存 -20');
            return 'tx2-done';
        }),
        msq.withTransaction(async (tx) => {
            await collection('products').updateOne(
                { _id: 'SKU003' },
                { $inc: { stock: -5 } },
                { session: tx.session }
            );
            console.log('  ✅ 事务3: MacBook 库存 -5');
            return 'tx3-done';
        })
    ]);

    const duration = Date.now() - startTime;
    console.log(`\n⚡ 3个事务并发执行完成，耗时: ${duration}ms`);
    console.log(`  结果: ${results.join(', ')}`);

    // 验证结果
    const products = await collection('products').find({}).toArray();
    console.log('\n📦 库存结果:');
    products.forEach(p => {
        console.log(`  ${p.name}: ${p.stock} 件`);
    });

    // ==========================================
    // 示例3: 文档级别锁（$in 查询）
    // ==========================================
    console.log('\n\n🔒 示例3: 文档级别锁（$in 查询）');
    console.log('─'.repeat(50));

    console.log('\n⚡ 批量更新多个产品...');
    await msq.withTransaction(async (tx) => {
        await collection('products').updateMany(
            { _id: { $in: ['SKU001', 'SKU002'] } },
            { $inc: { stock: 50 } },
            { session: tx.session }
        );
        console.log('  ✅ iPhone 和 iPad 库存各 +50');
    });

    // 验证结果
    const productsAfter = await collection('products').find({}).toArray();
    console.log('\n📦 更新后的库存:');
    productsAfter.forEach(p => {
        console.log(`  ${p.name}: ${p.stock} 件`);
    });

    // ==========================================
    // 示例4: 混合场景（只读 + 写入并发）
    // ==========================================
    console.log('\n\n🌈 示例4: 混合场景（只读 + 写入并发）');
    console.log('─'.repeat(50));

    console.log('\n⚡ 同时执行只读和写入事务...');
    const mixedResults = await Promise.all([
        // 只读事务：查询产品
        msq.withTransaction(async (tx) => {
            const product = await collection('products').findOne(
                { _id: 'SKU001' },
                { session: tx.session }
            );
            console.log(`  🔍 只读事务: 查询到 ${product.name} 库存 ${product.stock}`);
            return product.stock;
        }),
        // 写入事务：扣减库存
        msq.withTransaction(async (tx) => {
            await collection('products').updateOne(
                { _id: 'SKU002' },
                { $inc: { stock: -30 } },
                { session: tx.session }
            );
            console.log('  ✏️  写入事务: iPad 库存 -30');
            return 'deducted';
        })
    ]);

    console.log(`\n✅ 混合事务完成: 查询结果=${mixedResults[0]}, 扣减结果=${mixedResults[1]}`);

    // ==========================================
    // 示例5: 查看完整统计
    // ==========================================
    console.log('\n\n📊 完整事务统计');
    console.log('─'.repeat(50));

    const finalStats = msq._transactionManager.getStats();
    console.log(`总事务数: ${finalStats.totalTransactions}`);
    console.log(`成功事务: ${finalStats.successfulTransactions}`);
    console.log(`失败事务: ${finalStats.failedTransactions}`);
    console.log(`只读事务: ${finalStats.readOnlyTransactions} (${finalStats.readOnlyRatio})`);
    console.log(`写入事务: ${finalStats.writeTransactions}`);
    console.log(`成功率: ${finalStats.successRate}`);
    console.log(`\n性能指标:`);
    console.log(`  平均耗时: ${finalStats.averageDuration.toFixed(2)}ms`);
    console.log(`  P95 耗时: ${finalStats.p95Duration.toFixed(2)}ms`);
    console.log(`  P99 耗时: ${finalStats.p99Duration.toFixed(2)}ms`);
    console.log(`  样本数量: ${finalStats.sampleCount}`);

    // ==========================================
    // 示例6: 性能对比（集合锁 vs 文档锁）
    // ==========================================
    console.log('\n\n⚡ 示例6: 性能对比');
    console.log('─'.repeat(50));

    console.log('\n测试场景: 并发更新10个不同用户');
    console.log('优势: 文档级别锁允许并发执行，集合级别锁会串行执行\n');

    // 准备测试数据
    await collection('users').deleteMany({});
    await collection('users').insertMany(
        Array.from({ length: 10 }, (_, i) => ({
            _id: i + 1,
            name: `User${i + 1}`,
            balance: 1000
        }))
    );

    // 文档级别锁测试
    const docLockStart = Date.now();
    await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
            msq.withTransaction(async (tx) => {
                await collection('users').updateOne(
                    { _id: i + 1 },
                    { $inc: { balance: 100 } },
                    { session: tx.session }
                );
            })
        )
    );
    const docLockTime = Date.now() - docLockStart;

    console.log(`✅ 文档级别锁耗时: ${docLockTime}ms`);
    console.log(`\n💡 提示: 如果使用集合级别锁，这10个事务会串行执行，耗时会更长\n`);

    // 关闭连接
    await msq.close();
    console.log('✅ 已关闭连接\n');
}

main().catch(error => {
    console.error('❌ 错误:', error);
    process.exit(1);
});

