/**
 * 事务功能示例
 * 演示 monSQLize 的事务管理功能
 */

const MonSQLize = require('../lib');

// ============================================================================
// 配置与连接
// ============================================================================

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'bank_db',
    config: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
        options: {
            // MongoDB 连接选项
        }
    },
    // 缓存配置
    cache: {
        ttl: 60,
        maxSize: 100
    },
    // 事务配置
    transaction: {
        maxRetries: 3, // 最大重试次数
        defaultReadConcern: { level: 'snapshot' } // 默认读关注
    }
});

// ============================================================================
// 示例 1: 手动事务管理（完整控制）
// ============================================================================

async function example1_ManualTransaction() {
    console.log('\n=== 示例 1: 手动事务管理 ===\n');

    const { collection } = await msq.connect();
    const accounts = collection('accounts');

    // 准备测试数据
    await accounts.native().deleteMany({});
    await accounts.insertMany([
        { _id: 'alice', balance: 1000 },
        { _id: 'bob', balance: 500 }
    ]);

    console.log('初始状态:');
    console.log('  Alice:', await accounts.findOne({ _id: 'alice' }));
    console.log('  Bob:', await accounts.findOne({ _id: 'bob' }));

    // 创建事务
    const tx = await msq.startTransaction({
        readConcern: { level: 'snapshot' },
        maxDuration: 10000 // 10秒超时
    });

    try {
        console.log('\n开始事务...');

        // Alice 转账 200 给 Bob
        await accounts.updateOne(
            { _id: 'alice' },
            { $inc: { balance: -200 } },
            { session: tx.session }
        );
        console.log('  Alice 扣款 200');

        await accounts.updateOne(
            { _id: 'bob' },
            { $inc: { balance: 200 } },
            { session: tx.session }
        );
        console.log('  Bob 收款 200');

        // 提交事务
        await tx.commit();
        console.log('\n事务已提交 ✅');

        // 验证结果
        console.log('\n最终状态:');
        console.log('  Alice:', await accounts.findOne({ _id: 'alice' }));
        console.log('  Bob:', await accounts.findOne({ _id: 'bob' }));

    } catch (error) {
        console.error('\n事务失败，正在回滚...', error.message);
        await tx.abort();
        console.log('事务已回滚 ❌');
    }
}

// ============================================================================
// 示例 2: 自动事务管理（推荐方式）
// ============================================================================

async function example2_AutoTransaction() {
    console.log('\n=== 示例 2: 自动事务管理（推荐） ===\n');

    const { collection } = await msq.connect();
    const accounts = collection('accounts');

    // 准备测试数据
    await accounts.native().deleteMany({});
    await accounts.insertMany([
        { _id: 'alice', balance: 1000 },
        { _id: 'bob', balance: 500 }
    ]);

    console.log('初始状态:');
    console.log('  Alice:', await accounts.findOne({ _id: 'alice' }));
    console.log('  Bob:', await accounts.findOne({ _id: 'bob' }));

    try {
        // 使用 withTransaction 自动管理事务生命周期
        const result = await msq.withTransaction(async (tx) => {
            console.log('\n事务自动开始...');

            // Alice 转账 300 给 Bob
            await accounts.updateOne(
                { _id: 'alice' },
                { $inc: { balance: -300 } },
                { session: tx.session }
            );
            console.log('  Alice 扣款 300');

            await accounts.updateOne(
                { _id: 'bob' },
                { $inc: { balance: 300 } },
                { session: tx.session }
            );
            console.log('  Bob 收款 300');

            // 返回值会传递给调用者
            return {
                from: 'alice',
                to: 'bob',
                amount: 300,
                timestamp: new Date()
            };
        });

        console.log('\n事务自动提交 ✅');
        console.log('转账记录:', result);

        // 验证结果
        console.log('\n最终状态:');
        console.log('  Alice:', await accounts.findOne({ _id: 'alice' }));
        console.log('  Bob:', await accounts.findOne({ _id: 'bob' }));

    } catch (error) {
        console.error('\n事务失败并自动回滚 ❌', error.message);
    }
}

// ============================================================================
// 示例 3: 事务回滚（业务逻辑验证）
// ============================================================================

async function example3_TransactionRollback() {
    console.log('\n=== 示例 3: 事务回滚 ===\n');

    const { collection } = await msq.connect();
    const accounts = collection('accounts');

    // 准备测试数据
    await accounts.native().deleteMany({});
    await accounts.insertMany([
        { _id: 'alice', balance: 100 }, // 余额不足
        { _id: 'bob', balance: 500 }
    ]);

    console.log('初始状态:');
    const initialAlice = await accounts.findOne({ _id: 'alice' });
    const initialBob = await accounts.findOne({ _id: 'bob' });
    console.log('  Alice:', initialAlice);
    console.log('  Bob:', initialBob);

    try {
        await msq.withTransaction(async (tx) => {
            console.log('\n尝试转账 200（余额不足）...');

            // Alice 尝试转账 200（但余额只有 100）
            await accounts.updateOne(
                { _id: 'alice' },
                { $inc: { balance: -200 } },
                { session: tx.session }
            );

            // 检查余额（业务逻辑验证）
            const alice = await accounts.findOne(
                { _id: 'alice' },
                { session: tx.session }
            );

            if (alice.balance < 0) {
                throw new Error('余额不足，无法完成转账');
            }

            await accounts.updateOne(
                { _id: 'bob' },
                { $inc: { balance: 200 } },
                { session: tx.session }
            );
        });
    } catch (error) {
        console.error('\n业务验证失败:', error.message);
        console.log('事务已自动回滚 ❌');
    }

    // 验证回滚
    console.log('\n回滚后的状态（应该与初始状态相同）:');
    console.log('  Alice:', await accounts.findOne({ _id: 'alice' }));
    console.log('  Bob:', await accounts.findOne({ _id: 'bob' }));
}

// ============================================================================
// 示例 4: 自动重试机制
// ============================================================================

async function example4_AutoRetry() {
    console.log('\n=== 示例 4: 自动重试机制 ===\n');

    const { collection } = await msq.connect();
    const accounts = collection('accounts');

    // 准备测试数据
    await accounts.native().deleteMany({});
    await accounts.insertMany([
        { _id: 'alice', balance: 1000 },
        { _id: 'bob', balance: 500 }
    ]);

    let attemptCount = 0;

    try {
        const result = await msq.withTransaction(async (tx) => {
            attemptCount++;
            console.log(`\n尝试 #${attemptCount}...`);

            // 模拟：前2次失败，第3次成功
            if (attemptCount < 3) {
                const error = new Error('TransientTransactionError (模拟)');
                error.errorLabels = ['TransientTransactionError'];
                console.log('  模拟瞬态错误，将自动重试...');
                throw error;
            }

            // 第3次成功执行
            await accounts.updateOne(
                { _id: 'alice' },
                { $inc: { balance: -100 } },
                { session: tx.session }
            );
            console.log('  操作成功 ✅');

            return { attempts: attemptCount };
        }, {
            enableRetry: true, // 启用自动重试
            maxRetries: 5 // 最多重试5次
        });

        console.log(`\n事务在第 ${result.attempts} 次尝试后成功 ✅`);

    } catch (error) {
        console.error('\n重试失败:', error.message);
    }
}

// ============================================================================
// 示例 5: 多集合事务（跨集合原子操作）
// ============================================================================

async function example5_MultiCollection() {
    console.log('\n=== 示例 5: 多集合事务 ===\n');

    const { collection } = await msq.connect();
    const accounts = collection('accounts');
    const orders = collection('orders');

    // 准备测试数据
    await accounts.native().deleteMany({});
    await orders.native().deleteMany({});
    await accounts.insertOne({ _id: 'alice', balance: 1000 });
    await orders.insertOne({ _id: 'order123', userId: 'alice', total: 0, status: 'pending' });

    console.log('初始状态:');
    console.log('  账户:', await accounts.findOne({ _id: 'alice' }));
    console.log('  订单:', await orders.findOne({ _id: 'order123' }));

    try {
        await msq.withTransaction(async (tx) => {
            console.log('\n处理订单（跨集合原子操作）...');

            const orderAmount = 250;

            // 1. 扣除账户余额
            await accounts.updateOne(
                { _id: 'alice' },
                { $inc: { balance: -orderAmount } },
                { session: tx.session }
            );
            console.log(`  扣除余额: ${orderAmount}`);

            // 2. 更新订单状态
            await orders.updateOne(
                { _id: 'order123' },
                {
                    $set: {
                        total: orderAmount,
                        status: 'completed',
                        completedAt: new Date()
                    }
                },
                { session: tx.session }
            );
            console.log('  订单已完成');

            console.log('\n两个集合的更改将同时提交 ✅');
        });

        console.log('\n最终状态:');
        console.log('  账户:', await accounts.findOne({ _id: 'alice' }));
        console.log('  订单:', await orders.findOne({ _id: 'order123' }));

    } catch (error) {
        console.error('\n订单处理失败:', error.message);
    }
}

// ============================================================================
// 示例 6: 事务隔离性演示
// ============================================================================

async function example6_Isolation() {
    console.log('\n=== 示例 6: 事务隔离性 ===\n');

    const { collection } = await msq.connect();
    const accounts = collection('accounts');

    // 准备测试数据
    await accounts.native().deleteMany({});
    await accounts.insertOne({ _id: 'alice', balance: 1000 });

    const initialBalance = (await accounts.findOne({ _id: 'alice' })).balance;
    console.log('初始余额:', initialBalance);

    // 创建事务但不提交
    const tx = await msq.startTransaction();

    try {
        // 在事务中更新
        await accounts.updateOne(
            { _id: 'alice' },
            { $set: { balance: 5000 } },
            { session: tx.session }
        );
        console.log('\n事务内部更新余额为 5000');

        // 事务内部查询（可以看到更改）
        const internalView = await accounts.findOne(
            { _id: 'alice' },
            { session: tx.session }
        );
        console.log('  事务内部查询:', internalView.balance, '✅');

        // 外部查询（看不到事务中的更改）
        const externalView = await accounts.findOne({ _id: 'alice' });
        console.log('  外部查询（隔离）:', externalView.balance, '✅');

        console.log('\n提交事务...');
        await tx.commit();

        // 提交后，外部查询可以看到更改
        const afterCommit = await accounts.findOne({ _id: 'alice' });
        console.log('提交后查询:', afterCommit.balance, '✅');

    } catch (error) {
        await tx.abort();
        throw error;
    }
}

// ============================================================================
// 运行所有示例
// ============================================================================

async function main() {
    try {
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║      monSQLize 事务功能示例                             ║');
        console.log('╚═══════════════════════════════════════════════════════╝');

        await example1_ManualTransaction();
        await example2_AutoTransaction();
        await example3_TransactionRollback();
        await example4_AutoRetry();
        await example5_MultiCollection();
        await example6_Isolation();

        console.log('\n\n✅ 所有示例运行完成！');

    } catch (error) {
        console.error('\n❌ 示例运行失败:', error);
        throw error;
    } finally {
        // 关闭连接
        await msq.close();
        console.log('\n数据库连接已关闭');
    }
}

// 运行
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    example1_ManualTransaction,
    example2_AutoTransaction,
    example3_TransactionRollback,
    example4_AutoRetry,
    example5_MultiCollection,
    example6_Isolation
};

