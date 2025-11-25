 /**
 * 快速测试：分布式缓存失效
 *
 * 运行前确保：
 * 1. MongoDB 运行中: mongod
 * 2. Redis 运行中: redis-server
 * 3. 已安装依赖: npm install && npm install ioredis
 *
 * 运行: node examples/quick-test-distributed.js
 */

const MonSQLize = require('../lib/index');

async function quickTest() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   分布式缓存失效快速测试                      ║');
    console.log('╚══════════════════════════════════════════════╝\n');

    // 💡 复用同一个 Redis 实例
    const Redis = require('ioredis');
    const redis = new Redis('redis://localhost:6379');

    // 创建两个实例
    console.log('📦 创建实例 A 和 B...');
    const instanceA = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_quick',
        config: { uri: 'mongodb://localhost:27017' },
        cache: {
            multiLevel: true,
            local: { maxSize: 100 },
            remote: MonSQLize.createRedisCacheAdapter(redis),
            distributed: {
                enabled: true,
                redis: redis,
                instanceId: 'quick-test-A'
            }
        },
        logger: { level: 'info' }
    });

    const instanceB = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_quick',
        config: { uri: 'mongodb://localhost:27017' },
        cache: {
            multiLevel: true,
            local: { maxSize: 100 },
            remote: MonSQLize.createRedisCacheAdapter(redis),
            distributed: {
                enabled: true,
                redis: redis,
                instanceId: 'quick-test-B'
            }
        },
        logger: { level: 'info' }
    });

    try {
        console.log('🔌 连接中...\n');
        const { collection: collA } = await instanceA.connect();
        const { collection: collB } = await instanceB.connect();
        const db = instanceA._adapter.db;

        console.log('✅ 连接成功！');

        // 🔍 调试：检查分布式失效器
        console.log('\n🔍 调试信息:');
        console.log('  实例A _cacheInvalidator:', !!instanceA._cacheInvalidator);
        console.log('  实例B _cacheInvalidator:', !!instanceB._cacheInvalidator);
        if (instanceA._cacheInvalidator) {
            console.log('  实例A 频道:', instanceA._cacheInvalidator.channel);
            console.log('  实例A instanceId:', instanceA._cacheInvalidator.instanceId);
        }
        if (instanceB._cacheInvalidator) {
            console.log('  实例B instanceId:', instanceB._cacheInvalidator.instanceId);
        }
        console.log('');

        // 清理 + 插入测试数据
        await db.collection('quick_test').deleteMany({});
        await db.collection('quick_test').insertOne({
            id: 1,
            value: 'initial',
            timestamp: new Date()
        });

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('测试开始');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // 步骤1：两个实例都查询（写入本地缓存）
        console.log('步骤1️⃣ : 实例A 和 B 都查询数据（写入各自本地缓存）');
        const dataA1 = await collA('quick_test').findOne(
            { id: 1 },
            { cache: 60000 }
        );
        const dataB1 = await collB('quick_test').findOne(
            { id: 1 },
            { cache: 60000 }
        );
        console.log(`       实例A: value = "${dataA1.value}"`);
        console.log(`       实例B: value = "${dataB1.value}"\n`);

        // 等待缓存写入
        await new Promise(r => setTimeout(r, 50));

        // 步骤2：实例A 更新数据
        console.log('步骤2️⃣ : 实例A 更新数据为 "updated"');
        await collA('quick_test').updateOne(
            { id: 1 },
            { $set: { value: 'updated', timestamp: new Date() } }
        );
        console.log('       ✅ 更新完成');
        console.log('       📡 广播消息已发送\n');

        // 等待广播传播（增加到200ms）
        await new Promise(r => setTimeout(r, 200));

        // 步骤3：实例B 再次查询
        console.log('步骤3️⃣ : 实例B 再次查询（验证是否读到最新数据）');
        const dataB2 = await collB('quick_test').findOne(
            { id: 1 },
            { cache: 60000 }
        );
        console.log(`       实例B: value = "${dataB2.value}"\n`);

        // 验证结果
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('测试结果');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (dataB2.value === 'updated') {
            console.log('✅ 测试通过！');
            console.log('   ✓ 实例B 的本地缓存已被广播消息失效');
            console.log('   ✓ 读取到了 MongoDB 中的最新数据');
            console.log('   ✓ 分布式缓存失效机制工作正常\n');
        } else {
            console.log('❌ 测试失败！');
            console.log(`   ✗ 实例B 仍读到旧数据: "${dataB2.value}"`);
            console.log('   ✗ 预期: "updated"');
            console.log('   ✗ 分布式缓存失效可能未生效\n');
        }

        // 显示统计
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('广播统计');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        if (instanceA._cacheInvalidator) {
            const statsA = instanceA._cacheInvalidator.getStats();
            console.log('实例A:');
            console.log(`  发送消息: ${statsA.messagesSent} 条`);
            console.log(`  接收消息: ${statsA.messagesReceived} 条`);
            console.log(`  失效触发: ${statsA.invalidationsTriggered} 次`);
            console.log(`  错误次数: ${statsA.errors} 次\n`);
        }

        if (instanceB._cacheInvalidator) {
            const statsB = instanceB._cacheInvalidator.getStats();
            console.log('实例B:');
            console.log(`  发送消息: ${statsB.messagesSent} 条`);
            console.log(`  接收消息: ${statsB.messagesReceived} 条`);
            console.log(`  失效触发: ${statsB.invalidationsTriggered} 次`);
            console.log(`  错误次数: ${statsB.errors} 次\n`);
        }

        // 清理
        await db.collection('quick_test').deleteMany({});

    } catch (error) {
        console.error('\n❌ 测试失败:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 提示：');
            if (error.message.includes('27017')) {
                console.log('   MongoDB 未运行，请先启动: mongod');
            } else if (error.message.includes('6379')) {
                console.log('   Redis 未运行，请先启动: redis-server');
            }
        } else if (error.message.includes('ioredis')) {
            console.log('\n💡 提示：');
            console.log('   ioredis 未安装，请运行: npm install ioredis');
        }

        console.log('');
    } finally {
        console.log('🧹 清理连接...');
        await instanceA.close();
        await instanceB.close();
        await redis.quit();  // 关闭 Redis 连接
        console.log('✅ 清理完成\n');
    }
}

// 运行测试
if (require.main === module) {
    quickTest().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = quickTest;

