/**
 * Count 队列控制示例
 *
 * 演示如何使用 monSQLize 的 Count 队列功能来控制高并发场景下的数据库压力
 */

const MonSQLize = require('../lib/index');

async function main() {
    console.log('='.repeat(60));
    console.log('Count 队列控制示例');
    console.log('='.repeat(60));
    console.log();

    // ============================================
    // 示例 1: 基本配置（默认配置）
    // ============================================
    console.log('📋 示例 1: 基本配置（默认启用）');
    console.log('-'.repeat(60));

    const db1 = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test'
        }
        // countQueue 默认配置:
        // - enabled: true
        // - concurrency: CPU 核心数（4-16）
        // - maxQueueSize: 10000
        // - timeout: 60000ms
    });

    await db1.connect();
    const collection1 = db1.collection('users');

    console.log('✅ Count 队列已启用（默认配置）');
    console.log();

    // ============================================
    // 示例 2: 自定义配置
    // ============================================
    console.log('📋 示例 2: 自定义配置');
    console.log('-'.repeat(60));

    const db2 = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test'
        },
        countQueue: {
            enabled: true,
            concurrency: 8,      // 同时最多 8 个 count
            maxQueueSize: 5000,  // 队列最大 5000
            timeout: 30000       // 超时 30 秒
        }
    });

    await db2.connect();
    const collection2 = db2.collection('users');

    console.log('✅ Count 队列配置:');
    console.log('   - 并发数: 8');
    console.log('   - 队列大小: 5000');
    console.log('   - 超时时间: 30 秒');
    console.log();

    // ============================================
    // 示例 3: 高并发场景（自动队列控制）
    // ============================================
    console.log('📋 示例 3: 高并发场景测试');
    console.log('-'.repeat(60));

    // 模拟高并发：同时发起 100 个 findPage 请求
    console.log('🚀 发起 100 个并发 findPage 请求...');
    const startTime = Date.now();

    const promises = [];
    for (let i = 0; i < 100; i++) {
        promises.push(
            collection2.findPage({
                query: { status: 'active' },
                limit: 20,
                totals: {
                    mode: 'async'  // 使用异步 count（会被队列控制）
                }
            })
        );
    }

    const results = await Promise.all(promises);
    const duration = Date.now() - startTime;

    console.log(`✅ 所有请求完成！耗时: ${duration}ms`);
    console.log(`   平均每个请求: ${(duration / 100).toFixed(2)}ms`);
    console.log();

    // ============================================
    // 示例 4: 禁用队列（对比）
    // ============================================
    console.log('📋 示例 4: 禁用队列（对比测试）');
    console.log('-'.repeat(60));

    const db3 = new MonSQLize({
        type: 'mongodb',
        config: {
            uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test'
        },
        countQueue: {
            enabled: false  // 禁用队列
        }
    });

    await db3.connect();
    const collection3 = db3.collection('users');

    console.log('⚠️  Count 队列已禁用');
    console.log('   （不推荐在高并发场景下禁用）');
    console.log();

    // ============================================
    // 示例 5: 获取队列统计信息
    // ============================================
    console.log('📋 示例 5: 队列统计信息');
    console.log('-'.repeat(60));

    // 注意：实际应用中需要通过内部 API 获取统计
    // 这里仅作演示说明
    console.log('队列统计信息包含:');
    console.log('  - executed: 已执行的 count 总数');
    console.log('  - queued: 曾排队的请求总数');
    console.log('  - timeout: 超时的请求数');
    console.log('  - rejected: 被拒绝的请求数（队列满）');
    console.log('  - avgWaitTime: 平均等待时间（ms）');
    console.log('  - maxWaitTime: 最大等待时间（ms）');
    console.log('  - running: 当前执行中的 count 数');
    console.log('  - queuedNow: 当前排队中的请求数');
    console.log();

    // ============================================
    // 示例 6: 最佳实践建议
    // ============================================
    console.log('📋 示例 6: 最佳实践');
    console.log('-'.repeat(60));
    console.log();

    console.log('💡 小型应用（单实例）:');
    console.log('   countQueue: { enabled: true, concurrency: 4 }');
    console.log();

    console.log('💡 中型应用（多实例）:');
    console.log('   countQueue: { enabled: true, concurrency: 8 }');
    console.log('   + 推荐配合分布式锁使用');
    console.log();

    console.log('💡 大型应用（高并发）:');
    console.log('   countQueue: { enabled: true, concurrency: 16 }');
    console.log('   + 必须配合分布式锁');
    console.log('   + 建议使用 Redis 缓存');
    console.log();

    console.log('='.repeat(60));
    console.log('示例完成！');
    console.log('='.repeat(60));

    process.exit(0);
}

// 运行示例
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 错误:', error);
        process.exit(1);
    });
}

module.exports = { main };

