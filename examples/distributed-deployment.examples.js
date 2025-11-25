/**
 * 分布式部署示例：多实例环境下的缓存一致性和事务隔离
 * 
 * 运行前准备：
 * 1. 启动 MongoDB 副本集: mongod --replSet rs0
 * 2. 初始化副本集: rs.initiate()
 * 3. 启动 Redis: redis-server
 * 4. 安装 ioredis: npm install ioredis
 * 5. 运行: node examples/distributed-deployment.examples.js
 *
 * 配置说明：
 *
 * 1. Redis 实例配置
 *    - remote: 远端缓存（存储查询结果数据）
 *    - distributed.redis: 分布式广播（Pub/Sub 消息通知）
 *    - 💡 推荐：复用同一个 Redis 实例
 *
 * 2. instanceId（实例标识符）
 *    - 用途：标识每个应用实例，防止收到自己的广播后重复失效
 *    - 可选：不配置会自动生成唯一ID
 *    - 推荐：生产环境使用环境变量 process.env.INSTANCE_ID
 *
 * 3. channel（Pub/Sub 频道名）
 *    - 用途：隔离不同应用的广播消息
 *    - 默认：'monsqlize:cache:invalidate'
 *    - 推荐：多应用共享 Redis 时自定义频道名
 *
 * 详细说明：docs/distributed-config-guide.md
 */

const MonSQLize = require('../lib/index');
const Redis = require('ioredis');

// ============================================
// Redis 连接测试辅助函数
// ============================================

async function testRedisConnection() {
    try {
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: 0,
            retryStrategy: () => null,
            lazyConnect: true,
            connectTimeout: 2000,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 0
        });

        redis.on('error', () => { });
        await redis.connect();
        await redis.ping();
        await redis.quit();
        return true;
    } catch (error) {
        return false;
    }
}

// ============================================
// 示例 1：分布式缓存失效（推荐：一般应用）
// ============================================

async function example1_distributedCacheInvalidation() {
    console.log('\n=== 示例 1：分布式缓存失效 ===\n');
    console.log('场景：多实例环境，实例 A 更新数据后，实例 B 能实时感知');
    console.log('方案：使用 Redis Pub/Sub 广播缓存失效消息');
    console.log('\n工作原理：');
    console.log('  1. 实例 A 更新数据 → 调用 cache.delPattern()');
    console.log('  2. MultiLevelCache.delPattern() 触发 publish 回调');
    console.log('  3. DistributedCacheInvalidator.invalidate() 广播消息');
    console.log('  4. Redis Pub/Sub 传播消息到所有实例');
    console.log('  5. 实例 B 收到消息 → 失效本地缓存');
    console.log('  6. 实例 B 下次查询 → 从 MongoDB 读取最新数据\n');

    // 💡 推荐方式：复用同一个 Redis 实例（缓存 + 广播 + 锁）
    const Redis = require('ioredis');
    const redis = new Redis('redis://localhost:6379');

    // 模拟实例 A
    const instanceA = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_distributed',
        config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' },
        
        cache: {
            multiLevel: true,
            local: { maxSize: 1000, enableStats: true },
            remote: MonSQLize.createRedisCacheAdapter(redis),

            // 🆕 分布式缓存失效
            distributed: {
                enabled: true,
                instanceId: 'instance-A'
                // redis 自动从 remote 复用
            }
        }
    });

    // 模拟实例 B
    const instanceB = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_distributed',
        config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' },
        
        cache: {
            multiLevel: true,
            local: { maxSize: 1000, enableStats: true },
            remote: MonSQLize.createRedisCacheAdapter(redis),

            distributed: {
                enabled: true,
                instanceId: 'instance-B'
                // redis 自动从 remote 复用
            }
        }
    });

    try {
        const { collection: collA } = await instanceA.connect();
        const { collection: collB } = await instanceB.connect();
        const db = instanceA._adapter.db;

        // 准备测试数据
        await db.collection('accounts').deleteMany({});
        await db.collection('accounts').insertOne({
            userId: 'alice',
            balance: 1000
        });

        console.log('步骤 1: 实例 A 和 B 都查询 Alice 的余额（写入各自本地缓存）');
        const resultA1 = await collA('accounts').findOne({
            query: { userId: 'alice' },
            cache: 60000
        });
        const resultB1 = await collB('accounts').findOne({
            query: { userId: 'alice' },
            cache: 60000
        });
        console.log(`  - 实例 A 查询: balance = ${resultA1.balance}`);
        console.log(`  - 实例 B 查询: balance = ${resultB1.balance}`);

        // 等待一下，确保缓存写入
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('\n步骤 2: 实例 A 更新 Alice 的余额为 1500');
        await collA('accounts').updateOne(
            { userId: 'alice' },
            { $set: { balance: 1500 } }
        );
        console.log('  - 更新完成，分布式缓存失效消息已广播');

        // 等待广播传播
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('\n步骤 3: 实例 B 再次查询 Alice 的余额');
        const resultB2 = await collB('accounts').findOne({
            query: { userId: 'alice' },
            cache: 60000
        });
        console.log(`  - 实例 B 查询: balance = ${resultB2.balance}`);
        
        if (resultB2.balance === 1500) {
            console.log('  ✅ 成功！实例 B 读到了最新数据（本地缓存已失效）');
        } else {
            console.log('  ❌ 失败！实例 B 仍读到旧数据（分布式失效未生效）');
        }

        // 查看统计
        console.log('\n缓存失效器统计:');
        if (instanceA._cacheInvalidator) {
            const stats = instanceA._cacheInvalidator.getStats();
            console.log(`  - 实例 A: 发送 ${stats.messagesSent} 条，接收 ${stats.messagesReceived} 条`);
        }
        if (instanceB._cacheInvalidator) {
            const stats = instanceB._cacheInvalidator.getStats();
            console.log(`  - 实例 B: 发送 ${stats.messagesSent} 条，接收 ${stats.messagesReceived} 条`);
        }

        // 清理
        await db.collection('accounts').deleteMany({});
        console.log('\n✅ 示例 1 完成\n');
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await instanceA.close();
        await instanceB.close();
        await redis.quit();  // 关闭 Redis 连接
    }
}

// ============================================
// 示例 2：分布式事务锁（推荐：金融/交易）
// ============================================

async function example2_distributedTransactionLock() {
    console.log('\n=== 示例 2：分布式事务锁 ===\n');
    console.log('场景：转账事务期间，防止其他实例读到中间状态');
    console.log('方案：使用 Redis 分布式锁\n');

    // 💡 复用同一个 Redis 实例（缓存 + 广播 + 锁）
    const Redis = require('ioredis');
    const redis = new Redis('redis://localhost:6379');

    // 模拟实例 A（执行转账）
    const instanceA = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_distributed',
        config: { uri: 'mongodb://localhost:27017?replicaSet=rs0' },
        
        cache: {
            multiLevel: true,
            local: { maxSize: 1000 },
            remote: MonSQLize.createRedisCacheAdapter(redis),  // 复用

            distributed: {
                enabled: true
                // redis 自动从 remote 复用
            },
            
            // 🆕 启用分布式事务锁
            transaction: {
                distributedLock: {
                    redis,  // ES6 简写
                    keyPrefix: 'myapp:cache:lock:'
                }
            }
        }
    });

    // 模拟实例 B（查询余额）
    const instanceB = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_distributed',
        config: { uri: 'mongodb://localhost:27017?replicaSet=rs0' },
        
        cache: {
            multiLevel: true,
            local: { maxSize: 1000 },
            remote: MonSQLize.createRedisCacheAdapter(redis),

            distributed: {
                enabled: true
                // redis 自动从 remote 复用
            },
            
            // 🆕 启用分布式事务锁
            transaction: {
                distributedLock: {
                    redis,  // ES6 简写
                    keyPrefix: 'myapp:cache:lock:'
                }
            }
        }
    });

    try {
        const { collection: collA } = await instanceA.connect();
        const { collection: collB } = await instanceB.connect();
        const db = instanceA._adapter.db;

        // 准备测试数据
        await db.collection('accounts').deleteMany({});
        await db.collection('accounts').insertMany([
            { userId: 'alice', balance: 1000 },
            { userId: 'bob', balance: 500 }
        ]);

        console.log('初始状态:');
        console.log('  - Alice: 1000');
        console.log('  - Bob: 500');

        console.log('\n步骤 1: 实例 A 开始转账事务（Alice → Bob 转账 300）');
        
        // 使用 Promise 模拟并发操作
        const transferPromise = instanceA.withTransaction(async (tx) => {
            console.log('  - [实例 A] 事务开始，锁定缓存');
            
            // 扣款
            await collA('accounts').updateOne(
                { userId: 'alice' },
                { $inc: { balance: -300 } },
                { session: tx.session }
            );
            console.log('  - [实例 A] Alice 扣款 300');
            
            // 模拟延迟（让实例 B 有机会查询）
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 加款
            await collA('accounts').updateOne(
                { userId: 'bob' },
                { $inc: { balance: 300 } },
                { session: tx.session }
            );
            console.log('  - [实例 A] Bob 加款 300');
            
            console.log('  - [实例 A] 事务提交，释放锁');
        });

        // 等待事务开始
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log('\n步骤 2: 事务期间，实例 B 查询 Alice 余额');
        const resultB = await collB('accounts').findOne({
            query: { userId: 'alice' },
            cache: 60000
        });
        console.log(`  - [实例 B] 查询到 Alice balance = ${resultB.balance}`);

        if (resultB.balance === 1000) {
            console.log('  ✅ 正确！未写入缓存（因为检测到分布式锁）');
        } else if (resultB.balance === 700) {
            console.log('  ❌ 错误！读到了中间状态并写入了缓存');
        }

        // 等待事务完成
        await transferPromise;

        console.log('\n步骤 3: 事务完成后，实例 B 再次查询');
        // 清除缓存，模拟新查询
        instanceB.getCache().clear();
        const resultB2 = await collB('accounts').findOne({
            query: { userId: 'alice' },
            cache: 60000
        });
        console.log(`  - [实例 B] 查询到 Alice balance = ${resultB2.balance}`);
        console.log('  ✅ 现在可以安全写入缓存');

        // 验证最终余额
        const finalAlice = await db.collection('accounts').findOne({ userId: 'alice' });
        const finalBob = await db.collection('accounts').findOne({ userId: 'bob' });
        console.log('\n最终余额:');
        console.log(`  - Alice: ${finalAlice.balance} (预期 700)`);
        console.log(`  - Bob: ${finalBob.balance} (预期 800)`);

        // 清理
        await db.collection('accounts').deleteMany({});
        console.log('\n✅ 示例 2 完成\n');
    } catch (error) {
        console.error('❌ 错误:', error.message);
        if (error.message.includes('replica set')) {
            console.log('\n💡 提示：MongoDB 副本集未配置，事务功能需要副本集');
            console.log('   请参考文档配置副本集\n');
        }
    } finally {
        await instanceA.close();
        await instanceB.close();
        await redis.quit();  // 关闭手动创建的 Redis 连接
    }
}

// ============================================
// 示例 3：完整配置（缓存失效 + 事务锁）
// ============================================

async function example3_fullConfiguration() {
    console.log('\n=== 示例 3：完整配置（生产环境推荐）===\n');

    const redis = new Redis({
        host: 'localhost',
        port: 6379,
        db: 0,
        retryStrategy: (times) => {
            return Math.min(times * 50, 2000);
        }
    });

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_distributed',
        config: { 
            uri: 'mongodb://localhost:27017?replicaSet=rs0'
        },
        
        cache: {
            // 多层缓存
            multiLevel: true,
            
            // 本地缓存配置
            local: {
                maxSize: 1000,
                maxMemory: 0,
                enableStats: true
            },
            
            // 远端 Redis 缓存
            remote: MonSQLize.createRedisCacheAdapter(redis),
            
            // 缓存策略
            policy: {
                writePolicy: 'both',
                backfillLocalOnRemoteHit: true
            },
            
            // 🆕 分布式缓存失效
            distributed: {
                enabled: true,
                // redis 自动从 remote 复用
                channel: 'myapp:cache:invalidate',
                instanceId: process.env.INSTANCE_ID || 'instance-1'
            },
            
            // 🆕 分布式事务锁
            transaction: {
                distributedLock: {
                    redis,  // ES6 简写
                    keyPrefix: 'myapp:cache:lock:',
                    maxDuration: 300000
                }
            }
        },
        
        // 日志配置
        logger: {
            level: 'info'
        }
    });

    try {
        const { collection } = await msq.connect();
        
        console.log('✅ 连接成功！已启用：');
        console.log('  - 多层缓存（本地 + Redis）');
        console.log('  - 分布式缓存失效广播');
        console.log('  - 分布式事务锁');
        
        // 查看配置
        const cache = msq.getCache();
        console.log('\n缓存配置:');
        console.log('  - 本地缓存大小:', cache.local.maxSize);
        console.log('  - 远端缓存:', cache.remote ? '已启用' : '未启用');
        
        if (msq._cacheInvalidator) {
            const stats = msq._cacheInvalidator.getStats();
            console.log('  - 分布式失效器:', stats.channel);
        }
        
        if (msq._lockManager) {
            console.log('  - 事务锁管理器:', msq._lockManager.constructor.name);
        }

        console.log('\n✅ 示例 3 完成\n');
    } catch (error) {
        console.error('❌ 错误:', error.message);
    } finally {
        await msq.close();
        await redis.quit();
    }
}

// ============================================
// 运行所有示例
// ============================================

async function runAllExamples() {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║       monSQLize 分布式部署示例                            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');

    // 检查 Redis 连接
    console.log('\n检查 Redis 连接...');
    const redisAvailable = await testRedisConnection();
    
    if (!redisAvailable) {
        console.error('❌ Redis 未运行或连接失败');
        console.log('\n请确保：');
        console.log('  1. Redis 已安装: https://redis.io/download');
        console.log('  2. Redis 正在运行: redis-server');
        console.log('  3. ioredis 已安装: npm install ioredis\n');
        process.exit(1);
    }
    console.log('✅ Redis 连接正常');

    try {
        // 运行示例
        await example1_distributedCacheInvalidation();
        await example2_distributedTransactionLock();
        await example3_fullConfiguration();

        console.log('╔═══════════════════════════════════════════════════════════╗');
        console.log('║  所有示例运行完成！                                       ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
    } catch (error) {
        console.error('\n❌ 示例运行失败:', error);
        process.exit(1);
    }
}

// 运行示例（如果直接执行此文件）
if (require.main === module) {
    runAllExamples().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    example1_distributedCacheInvalidation,
    example2_distributedTransactionLock,
    example3_fullConfiguration
};

