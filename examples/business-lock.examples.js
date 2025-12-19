/**
 * 业务级分布式锁使用示例
 *
 * 确保已安装并配置 Redis：
 * npm install ioredis
 */

const MonSQLize = require('monsqlize');
const Redis = require('ioredis');

// 初始化 Redis
const redis = new Redis('redis://localhost:6379');

// 初始化 monSQLize（带 Redis 配置）
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test',
    config: {
        uri: 'mongodb://localhost:27017'
    },
    cache: {
        multiLevel: true,
        remote: MonSQLize.createRedisCacheAdapter(redis),
        transaction: {
            distributedLock: {
                redis,
                keyPrefix: 'example:lock:'
            }
        }
    }
});

// ==================== 示例1：库存扣减 ====================
async function example1_inventoryDeduction() {
    console.log('\n=== 示例1：库存扣减 ===');

    const db = await msq.connect();
    const inventory = db.collection('inventory');

    // 初始化测试数据
    await inventory.deleteMany({});
    await inventory.insertOne({ sku: 'SKU123', stock: 10 });

    try {
        // 使用业务锁保护库存扣减
        await db.withLock('inventory:SKU123', async () => {
            const product = await inventory.findOne({ sku: 'SKU123' });
            console.log(`当前库存: ${product.stock}`);

            if (product.stock >= 1) {
                await inventory.updateOne(
                    { sku: 'SKU123' },
                    { $inc: { stock: -1 } }
                );
                console.log('✅ 扣减成功');
            } else {
                throw new Error('库存不足');
            }
        }, {
            ttl: 5000,        // 锁5秒过期
            retryTimes: 3,    // 重试3次
            retryDelay: 100   // 每次重试间隔100ms
        });

        const result = await inventory.findOne({ sku: 'SKU123' });
        console.log(`最终库存: ${result.stock}`);
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

// ==================== 示例2：订单创建 + 事务 ====================
async function example2_orderCreation() {
    console.log('\n=== 示例2：订单创建 + 事务 ===');

    const db = await msq.connect();
    const inventory = db.collection('inventory');
    const orders = db.collection('orders');

    // 初始化测试数据
    await inventory.deleteMany({});
    await orders.deleteMany({});
    await inventory.insertOne({ sku: 'SKU456', stock: 5 });

    const userId = 'user123';
    const sku = 'SKU456';

    try {
        // 锁 + 事务组合
        await db.withLock(`order:create:${userId}:${sku}`, async () => {
            await db.withTransaction(async (tx) => {
                // 扣减库存
                const updateResult = await inventory.updateOne(
                    { sku, stock: { $gte: 1 } },
                    { $inc: { stock: -1 } },
                    { session: tx.session }
                );

                if (updateResult.modifiedCount === 0) {
                    throw new Error('库存不足');
                }

                // 创建订单
                await orders.insertOne({
                    userId,
                    sku,
                    quantity: 1,
                    createdAt: new Date()
                }, { session: tx.session });

                console.log('✅ 订单创建成功');
            });
        });
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

// ==================== 示例3：定时任务防重 ====================
async function example3_cronTaskLock() {
    console.log('\n=== 示例3：定时任务防重 ===');

    const db = await msq.connect();

    // 模拟定时任务
    async function dailyReportTask() {
        const lock = await db.tryAcquireLock('cron:daily-report', {
            ttl: 60000  // 60秒
        });

        if (!lock) {
            console.log('⚠️  其他实例正在执行，跳过');
            return;
        }

        try {
            console.log('🔄 开始执行日报任务...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟任务
            console.log('✅ 日报任务完成');
        } finally {
            await lock.release();
        }
    }

    // 模拟多实例同时触发
    await Promise.all([
        dailyReportTask(),
        dailyReportTask(),
        dailyReportTask()
    ]);
}

// ==================== 示例4：手动锁管理 ====================
async function example4_manualLock() {
    console.log('\n=== 示例4：手动锁管理 ===');

    const db = await msq.connect();

    const lock = await db.acquireLock('manual:resource', {
        ttl: 5000,
        retryTimes: 3
    });

    try {
        console.log('🔒 已获取锁');

        // 执行业务逻辑
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ 业务逻辑执行完成');

        // 可选：续期
        await lock.renew(5000);
        console.log('🔄 锁续期成功');

    } finally {
        await lock.release();
        console.log('🔓 已释放锁');
    }
}

// ==================== 示例5：错误处理 ====================
async function example5_errorHandling() {
    console.log('\n=== 示例5：错误处理 ===');

    const db = await msq.connect();
    const { LockAcquireError } = require('monsqlize/errors');

    try {
        // 先获取一个锁
        const firstLock = await db.acquireLock('test:resource', { ttl: 10000 });

        try {
            // 尝试再次获取同一个锁（会失败）
            await db.acquireLock('test:resource', {
                ttl: 5000,
                retryTimes: 2,
                retryDelay: 50
            });
        } catch (error) {
            if (error instanceof LockAcquireError) {
                console.log('⚠️  预期的错误：锁被占用');
                console.log(`错误码: ${error.code}`);
            } else {
                throw error;
            }
        } finally {
            await firstLock.release();
        }

    } catch (error) {
        console.error('❌ 意外错误:', error.message);
    }
}

// ==================== 示例6：锁统计信息 ====================
async function example6_lockStats() {
    console.log('\n=== 示例6：锁统计信息 ===');

    const db = await msq.connect();

    // 执行一些锁操作
    await db.withLock('stats:test1', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    await db.withLock('stats:test2', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    // 获取统计信息
    const stats = db.getLockStats();
    console.log('📊 锁统计信息:', JSON.stringify(stats, null, 2));
}

// ==================== 运行所有示例 ====================
async function runAllExamples() {
    try {
        // 检查 Redis 是否连接
        console.log('🔍 检查 Redis 连接...');
        try {
            await redis.ping();
            console.log('✅ Redis 连接正常\n');
        } catch (error) {
            console.error('❌ Redis 未连接！');
            console.error('   请确保 Redis 服务已启动');
            console.error('   Windows: 下载并运行 Redis (https://github.com/microsoftarchive/redis/releases)');
            console.error('   Linux/Mac: redis-server');
            process.exit(1);
        }

        await example1_inventoryDeduction();
        await example2_orderCreation();
        await example3_cronTaskLock();
        await example4_manualLock();
        await example5_errorHandling();
        await example6_lockStats();

        console.log('\n✅ 所有示例执行完成');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ 示例执行失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    runAllExamples();
}

module.exports = {
    example1_inventoryDeduction,
    example2_orderCreation,
    example3_cronTaskLock,
    example4_manualLock,
    example5_errorHandling,
    example6_lockStats
};

