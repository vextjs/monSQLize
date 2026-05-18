/**
 * 事务集成测试运行器
 * 使用本地 MongoDB 副本集
 */

const MonSQLize = require('../../lib');
const assert = require('assert').strict;

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m'
};

function log(color, ...args) {
    console.log(colors[color], ...args, colors.reset);
}

async function runTests() {
    log('cyan', '\n═══════════════════════════════════════════');
    log('cyan', '🧪 事务集成测试');
    log('cyan', '═══════════════════════════════════════════\n');

    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017?replicaSet=rs0';

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_transaction_integration',
        config: { uri },
        cache: { enabled: true, ttl: 60000 }
    });

    let testsPassed = 0;
    let testsFailed = 0;

    try {
        const { collection } = await msq.connect();
        log('green', '✅ MongoDB 连接成功（副本集）\n');

        // 清空测试数据
        const users = collection('users');
        const products = collection('products');
        await users.deleteMany({});
        await products.deleteMany({});

        // 测试1: 只读优化
        log('yellow', '测试1: 只读优化');
        try {
            await users.insertMany([
                { _id: 1, name: 'Alice', balance: 1000 },
                { _id: 2, name: 'Bob', balance: 2000 }
            ]);

            await msq.withTransaction(async (tx) => {
                const user1 = await users.findOne({ _id: 1 }, { session: tx.session });
                const user2 = await users.findOne({ _id: 2 }, { session: tx.session });
                assert.strictEqual(user1.name, 'Alice');
                assert.strictEqual(user2.name, 'Bob');
            });

            const stats = msq._transactionManager.getStats();
            assert.ok(stats.readOnlyTransactions > 0, '应该有只读事务记录');

            log('green', '  ✅ 只读优化测试通过');
            testsPassed++;
        } catch (error) {
            log('red', '  ❌ 只读优化测试失败:', error.message);
            testsFailed++;
        }

        // 测试2: 文档级别锁
        log('yellow', '\n测试2: 文档级别锁');
        try {
            await users.deleteMany({});
            await users.insertMany([
                { _id: 1, name: 'Alice', balance: 1000 },
                { _id: 2, name: 'Bob', balance: 2000 }
            ]);

            // 并发更新不同文档
            const results = await Promise.all([
                msq.withTransaction(async (tx) => {
                    await users.updateOne(
                        { _id: 1 },
                        { $inc: { balance: 100 } },
                        { session: tx.session }
                    );
                    return 'tx1';
                }),
                msq.withTransaction(async (tx) => {
                    await users.updateOne(
                        { _id: 2 },
                        { $inc: { balance: 200 } },
                        { session: tx.session }
                    );
                    return 'tx2';
                })
            ]);

            assert.deepStrictEqual(results, ['tx1', 'tx2']);

            const user1 = await users.findOne({ _id: 1 });
            const user2 = await users.findOne({ _id: 2 });
            assert.strictEqual(user1.balance, 1100);
            assert.strictEqual(user2.balance, 2200);

            log('green', '  ✅ 文档级别锁测试通过');
            testsPassed++;
        } catch (error) {
            log('red', '  ❌ 文档级别锁测试失败:', error.message);
            testsFailed++;
        }

        // 测试3: 事务回滚
        log('yellow', '\n测试3: 事务回滚');
        try {
            await users.deleteMany({});
            await users.insertOne({ _id: 1, name: 'Alice', balance: 1000 });

            try {
                await msq.withTransaction(async (tx) => {
                    await users.updateOne(
                        { _id: 1 },
                        { $inc: { balance: -100 } },
                        { session: tx.session }
                    );

                    // 故意抛出错误触发回滚
                    throw new Error('测试回滚');
                });
            } catch (error) {
                // 预期的错误
            }

            const user = await users.findOne({ _id: 1 });
            assert.strictEqual(user.balance, 1000, '余额应该回滚到原始值');

            log('green', '  ✅ 事务回滚测试通过');
            testsPassed++;
        } catch (error) {
            log('red', '  ❌ 事务回滚测试失败:', error.message);
            testsFailed++;
        }

        // 测试4: 批量文档锁
        log('yellow', '\n测试4: 批量文档锁（$in 查询）');
        try {
            await products.deleteMany({});
            await products.insertMany([
                { _id: 1, name: 'Product 1', stock: 100 },
                { _id: 2, name: 'Product 2', stock: 200 },
                { _id: 3, name: 'Product 3', stock: 300 }
            ]);

            await msq.withTransaction(async (tx) => {
                await products.updateMany(
                    { _id: { $in: [1, 2, 3] } },
                    { $inc: { stock: -10 } },
                    { session: tx.session }
                );
            });

            const prods = await products.find({ _id: { $in: [1, 2, 3] } });
            assert.strictEqual(prods[0].stock, 90);
            assert.strictEqual(prods[1].stock, 190);
            assert.strictEqual(prods[2].stock, 290);

            log('green', '  ✅ 批量文档锁测试通过');
            testsPassed++;
        } catch (error) {
            log('red', '  ❌ 批量文档锁测试失败:', error.message);
            testsFailed++;
        }

        // 输出统计
        log('cyan', '\n═══════════════════════════════════════════');
        log('cyan', '📊 测试结果');
        log('cyan', '═══════════════════════════════════════════\n');

        const txStats = msq._transactionManager.getStats();
        log('cyan', '事务统计:');
        console.log('  总事务数:', txStats.totalTransactions);
        console.log('  只读事务:', txStats.readOnlyTransactions);
        console.log('  写入事务:', txStats.writeTransactions);
        console.log('  只读比例:', txStats.readOnlyRatio);
        console.log('  成功率:', txStats.successRate);

        console.log('');
        log('green', `✅ 通过: ${testsPassed} 个测试`);
        if (testsFailed > 0) {
            log('red', `❌ 失败: ${testsFailed} 个测试`);
        }

        // 清理
        await users.deleteMany({});
        await products.deleteMany({});

    } catch (error) {
        log('red', '\n❌ 测试失败:', error);
        process.exit(1);
    } finally {
        await msq.close();
    }

    if (testsFailed > 0) {
        process.exit(1);
    }

    log('green', '\n✅ 所有集成测试通过！\n');
}

// 运行测试
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };

