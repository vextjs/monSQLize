/**
 * 多层缓存示例：本地内存 + Redis 远端缓存
 * 
 * 运行前准备：
 * 1. 启动 MongoDB: mongod
 * 2. 启动 Redis: redis-server
 * 3. 安装 ioredis: npm install ioredis
 * 4. 运行: node examples/multi-level-cache.examples.js
 */

const MonSQLize = require('../lib/index');

// ============================================
// Redis 连接测试辅助函数
// ============================================

async function testRedisConnection() {
    try {
        const Redis = require('ioredis');
        const redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: 0,
            retryStrategy: () => null,  // 不重试
            lazyConnect: true,
            connectTimeout: 2000,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 0
        });

        // 抑制错误事件，避免未处理错误警告
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
// 示例 1：使用内置 Redis 适配器（推荐）
// ============================================

async function example1_builtinAdapter() {
    console.log('\n=== 示例 1：使用内置 Redis 适配器 ===\n');

    // 创建 MonSQLize 实例，配置多层缓存
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test_multi_cache',
        config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' },

        cache: {
            multiLevel: true,                   // 启用多层缓存

            // 本地缓存配置
            local: {
                maxSize: 1000,                  // 本地缓存 1000 条
                enableStats: true               // 启用统计
            },

            // 远端 Redis 缓存（自动创建适配器）
            remote: MonSQLize.createRedisCacheAdapter(
                process.env.REDIS_URL || 'redis://localhost:6379/0'
            ),

            // 缓存策略
            policy: {
                writePolicy: 'both',            // 本地 + 远端双写
                backfillLocalOnRemoteHit: true  // 远端命中时回填本地
            }
        }
    });

    try {
        const { collection } = await msq.connect();
        const db = msq._adapter.db;  // 获取原生 MongoDB db 对象

        // 插入测试数据
        await db.collection('products').insertMany([
            { name: 'Product A', price: 100, category: 'electronics' },
            { name: 'Product B', price: 200, category: 'electronics' },
            { name: 'Product C', price: 300, category: 'books' }
        ]);

        console.log('第 1 次查询（缓存 miss，从 MongoDB 读取）:');
        const start1 = Date.now();
        const result1 = await collection('products').find({
            query: { category: 'electronics' },
            cache: 10000,                       // 缓存 10 秒
            maxTimeMS: 3000
        });
        console.log(`  - 结果数量: ${result1.length}`);
        console.log(`  - 耗时: ${Date.now() - start1}ms`);

        console.log('\n第 2 次查询（本地缓存命中）:');
        const start2 = Date.now();
        const result2 = await collection('products').find({
            query: { category: 'electronics' },
            cache: 10000,
            maxTimeMS: 3000
        });
        console.log(`  - 结果数量: ${result2.length}`);
        console.log(`  - 耗时: ${Date.now() - start2}ms`);
        console.log(`  - 加速: ${((Date.now() - start1) / (Date.now() - start2)).toFixed(1)}x`);

        // 清理测试数据
        await db.collection('products').deleteMany({});

        console.log('\n✅ 示例 1 完成\n');
    } catch (error) {
        console.error('❌ 错误:', error.message);
        if (error.message.includes('ioredis')) {
            console.log('\n💡 提示：请先安装 ioredis');
            console.log('   npm install ioredis\n');
        }
    } finally {
        await msq.close();
    }
}

// ============================================
// 示例 2：使用已创建的 Redis 实例
// ============================================

async function example2_existingRedisInstance() {
    console.log('\n=== 示例 2：使用已创建的 Redis 实例 ===\n');

    let redis;
    try {
        // 创建 Redis 实例（带自定义配置）
        const Redis = require('ioredis');
        redis = new Redis({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: 0,
            retryStrategy: (times) => {
                return Math.min(times * 50, 2000);
            }
        });

        // 创建 MonSQLize 实例
        const msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_multi_cache',
            config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' },

            cache: {
                multiLevel: true,
                local: { maxSize: 1000, enableStats: true },

                // 传入已创建的 Redis 实例
                remote: MonSQLize.createRedisCacheAdapter(redis),

                policy: {
                    writePolicy: 'local-first-async-remote',  // 本地优先，异步写入远端
                    backfillLocalOnRemoteHit: true
                }
            }
        });

        const { collection } = await msq.connect();
        const db = msq._adapter.db;  // 获取原生 MongoDB db 对象

        // 插入测试数据
        await db.collection('users').insertMany([
            { name: 'Alice', age: 25, city: 'Beijing' },
            { name: 'Bob', age: 30, city: 'Shanghai' },
            { name: 'Charlie', age: 35, city: 'Beijing' }
        ]);

        console.log('查询 1（缓存 miss）:');
        const result1 = await collection('users').find({
            query: { city: 'Beijing' },
            cache: 5000,
            maxTimeMS: 3000
        });
        console.log(`  - 找到 ${result1.length} 个用户`);

        console.log('\n查询 2（本地缓存命中）:');
        const result2 = await collection('users').find({
            query: { city: 'Beijing' },
            cache: 5000,
            maxTimeMS: 3000
        });
        console.log(`  - 找到 ${result2.length} 个用户（从本地缓存）`);

        // 获取缓存统计
        const cache = msq.getCache();
        const stats = cache.local.getStats();
        console.log('\n缓存统计:');
        console.log(`  - 命中率: ${stats.hitRate}`);
        console.log(`  - 命中次数: ${stats.hits}`);
        console.log(`  - 未命中次数: ${stats.misses}`);

        // 清理测试数据
        await db.collection('users').deleteMany({});

        console.log('\n✅ 示例 2 完成\n');

        await msq.close();
    } catch (error) {
        console.error('❌ 错误:', error.message);
        if (error.message.includes('ioredis')) {
            console.log('\n💡 提示：请先安装 ioredis');
            console.log('   npm install ioredis\n');
        }
    } finally {
        if (redis) {
            await redis.quit();
        }
    }
}

// ============================================
// 示例 3：多层缓存策略对比
// ============================================

async function example3_policyComparison() {
    console.log('\n=== 示例 3：缓存策略对比 ===\n');

    try {
        // 策略 1: 双写（both）
        console.log('策略 1: writePolicy = "both" (本地 + 远端双写)');
        const msq1 = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_multi_cache',
            config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' },
            cache: {
                multiLevel: true,
                local: { maxSize: 1000 },
                remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0'),
                policy: { writePolicy: 'both' }
            }
        });

        const { collection: col1 } = await msq1.connect();
        const db1 = msq1._adapter.db;  // 获取原生 MongoDB db 对象
        await db1.collection('test').insertOne({ value: 1 });

        const start1 = Date.now();
        await col1('test').find({ query: {}, cache: 5000, maxTimeMS: 3000 });
        console.log(`  - 写入耗时: ${Date.now() - start1}ms（同步写入本地 + 远端）\n`);

        await db1.collection('test').deleteMany({});
        await msq1.close();

        // 策略 2: 本地优先（local-first-async-remote）
        console.log('策略 2: writePolicy = "local-first-async-remote" (本地优先，远端异步)');
        const msq2 = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_multi_cache',
            config: { uri: process.env.MONGODB_URI || 'mongodb://localhost:27017' },
            cache: {
                multiLevel: true,
                local: { maxSize: 1000 },
                remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0'),
                policy: { writePolicy: 'local-first-async-remote' }
            }
        });

        const { collection: col2 } = await msq2.connect();
        const db2 = msq2._adapter.db;  // 获取原生 MongoDB db 对象
        await db2.collection('test').insertOne({ value: 2 });

        const start2 = Date.now();
        await col2('test').find({ query: {}, cache: 5000, maxTimeMS: 3000 });
        console.log(`  - 写入耗时: ${Date.now() - start2}ms（同步写入本地，异步写入远端）\n`);

        await db2.collection('test').deleteMany({});
        await msq2.close();

        console.log('✅ 示例 3 完成\n');
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

// ============================================
// 运行所有示例
// ============================================

(async () => {
    console.log('=======================================');
    console.log('  多层缓存示例（本地 + Redis）');
    console.log('=======================================');

    // 检查 Redis 是否可用
    console.log('\n🔍 检查 Redis 连接...');
    const redisAvailable = await testRedisConnection();

    if (!redisAvailable) {
        console.log('⚠️  Redis 不可用，跳过需要 Redis 的示例');
        console.log('💡 提示：请启动 Redis 服务以运行完整示例');
        console.log('   Windows: redis-server.exe');
        console.log('   Linux/Mac: redis-server\n');
        console.log('=======================================');
        console.log('  示例已跳过（需要 Redis）');
        console.log('=======================================\n');
        process.exit(0);
    }

    console.log('✅ Redis 连接正常\n');

    await example1_builtinAdapter();
    await example2_existingRedisInstance();
    await example3_policyComparison();

    console.log('=======================================');
    console.log('  所有示例完成！');
    console.log('=======================================\n');

    process.exit(0);
})();
