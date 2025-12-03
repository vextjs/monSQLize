/**
 * watch 方法完整示例集
 * 演示各种使用场景和最佳实践
 */

const MonSQLize = require('../lib/index');

// ============================================================================
// 常量配置
// ============================================================================

const DB_CONFIG = {
    type: 'mongodb',
    databaseName: 'watch_examples',
    config: {
        useMemoryServer: true,
        memoryServerOptions: {
            instance: {
                replSet: 'rs0'  // 启用副本集（支持 Change Streams 和事务）
            }
        }
    }
};

// ============================================================================
// 示例 1: 基础监听
// ============================================================================

async function example1_basicWatch() {
    console.log('\n=== 示例 1: 基础监听 ===\n');
    console.log('场景：监听集合的所有数据变更');
    console.log('用途：实时数据同步、业务事件响应\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    const collection = msq.dbInstance.collection('users');

    // 创建 watcher
    const watcher = collection.watch();

    // 监听变更事件
    watcher.on('change', (change) => {
        console.log('✅ 数据变更:');
        console.log('  操作类型:', change.operationType);
        console.log('  文档ID:', change.documentKey?._id);
        console.log('  完整文档:', change.fullDocument);
    });

    // 插入测试数据
    console.log('插入测试数据...\n');
    await collection.insertOne({ name: 'Alice', age: 25 });
    await collection.insertOne({ name: 'Bob', age: 30 });

    // 等待事件处理
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 关闭
    await watcher.close();
    await msq.close();

    console.log('\n✅ 示例 1 完成\n');
}

// ============================================================================
// 示例 2: 过滤事件
// ============================================================================

async function example2_filterEvents() {
    console.log('\n=== 示例 2: 过滤事件 ===\n');
    console.log('场景：只监听特定类型的操作');
    console.log('用途：减少不必要的事件处理，提高效率\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    const collection = msq.dbInstance.collection('products');

    // 只监听 insert 和 update
    const watcher = collection.watch([
        { $match: { operationType: { $in: ['insert', 'update'] } } }
    ]);

    watcher.on('change', (change) => {
        console.log('✅ 新增或修改:');
        console.log('  操作:', change.operationType);
        console.log('  产品:', change.fullDocument?.name);
    });

    // 测试
    console.log('插入产品...\n');
    const result = await collection.insertOne({ name: 'iPhone', price: 999 });

    console.log('更新产品...\n');
    await collection.updateOne(
        { _id: result.insertedId },
        { $set: { price: 899 } }
    );

    console.log('删除产品（不会触发事件）...\n');
    await collection.deleteOne({ _id: result.insertedId });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await watcher.close();
    await msq.close();

    console.log('\n✅ 示例 2 完成\n');
}

// ============================================================================
// 示例 3: 自动缓存失效
// ============================================================================

async function example3_cacheInvalidation() {
    console.log('\n=== 示例 3: 自动缓存失效 ===\n');
    console.log('场景：数据变更时自动失效相关缓存');
    console.log('用途：保持缓存数据新鲜，避免脏读\n');

    const msq = new MonSQLize({
        ...DB_CONFIG,
        cache: { maxSize: 100, ttl: 60000 }
    });
    await msq.connect();

    const collection = msq.dbInstance.collection('users');

    // 创建 watcher（自动失效缓存）
    const watcher = collection.watch([], {
        autoInvalidateCache: true  // 默认就是 true
    });

    watcher.on('change', (change) => {
        console.log('✅ 数据变更，自动失效缓存');
        console.log('  操作:', change.operationType);
    });

    // 插入数据
    console.log('1. 插入用户...\n');
    await collection.insertOne({ name: 'Charlie', age: 35 });

    // 查询（写入缓存）
    console.log('2. 查询用户（写入缓存）...\n');
    const users1 = await collection.find({}, { cache: 60000 });
    console.log('  查询结果:', users1.length, '个用户');

    // 再次查询（缓存命中）
    console.log('3. 再次查询（缓存命中）...\n');
    const users2 = await collection.find({}, { cache: 60000 });
    console.log('  查询结果:', users2.length, '个用户');

    // 更新数据（触发缓存失效）
    console.log('4. 更新用户（触发缓存失效）...\n');
    await collection.updateOne(
        { name: 'Charlie' },
        { $set: { age: 36 } }
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    // 再次查询（缓存已失效，从 DB 读取）
    console.log('5. 再次查询（缓存已失效）...\n');
    const users3 = await collection.find({}, { cache: 60000 });
    console.log('  查询结果:', users3.length, '个用户');
    console.log('  年龄已更新:', users3[0].age);

    await watcher.close();
    await msq.close();

    console.log('\n✅ 示例 3 完成\n');
}

// ============================================================================
// 示例 4: 错误处理
// ============================================================================

async function example4_errorHandling() {
    console.log('\n=== 示例 4: 错误处理 ===\n');
    console.log('场景：处理 watch 过程中的各种错误');
    console.log('用途：提高系统稳定性和可靠性\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    const collection = msq.dbInstance.collection('orders');

    const watcher = collection.watch();

    // 监听持久性错误
    watcher.on('error', (error) => {
        console.warn('⚠️ 持久性错误（已自动清除 token）:');
        console.warn('  错误:', error.message);
    });

    // 监听重连
    watcher.on('reconnect', (info) => {
        console.log('🔄 重连中...');
        console.log('  第', info.attempt, '次尝试');
        console.log('  延迟:', info.delay, 'ms');
    });

    // 监听恢复
    watcher.on('resume', (token) => {
        console.log('✅ 已恢复监听');
    });

    // 监听致命错误
    watcher.on('fatal', (error) => {
        console.error('💥 致命错误（无法恢复）:');
        console.error('  错误:', error.message);
        // 通知运维
    });

    watcher.on('change', (change) => {
        console.log('✅ 数据变更:', change.operationType);
    });

    // 插入测试数据
    await collection.insertOne({ orderId: 'ORD001', total: 100 });

    await new Promise(resolve => setTimeout(resolve, 1000));

    await watcher.close();
    await msq.close();

    console.log('\n✅ 示例 4 完成\n');
}

// ============================================================================
// 示例 5: 统计监控
// ============================================================================

async function example5_statistics() {
    console.log('\n=== 示例 5: 统计监控 ===\n');
    console.log('场景：监控 watch 的运行状态');
    console.log('用途：运维监控、性能分析\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    const collection = msq.dbInstance.collection('logs');

    const watcher = collection.watch();

    watcher.on('change', (change) => {
        console.log('✅ 日志变更:', change.operationType);
    });

    // 定期输出统计信息
    const statsInterval = setInterval(() => {
        const stats = watcher.getStats();
        console.log('\n📊 运行统计:');
        console.log('  总变更数:', stats.totalChanges);
        console.log('  重连次数:', stats.reconnectAttempts);
        console.log('  运行时长:', Math.round(stats.uptime / 1000), '秒');
        console.log('  活跃状态:', stats.isActive ? '✅' : '❌');
        console.log('  缓存失效次数:', stats.cacheInvalidations);
        console.log('  错误次数:', stats.errors);
    }, 2000);

    // 插入多条日志
    console.log('插入测试日志...\n');
    for (let i = 0; i < 5; i++) {
        await collection.insertOne({
            level: 'info',
            message: `Test log ${i}`,
            timestamp: new Date()
        });
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    clearInterval(statsInterval);
    await watcher.close();
    await msq.close();

    console.log('\n✅ 示例 5 完成\n');
}

// ============================================================================
// 示例 6: 优雅关闭
// ============================================================================

async function example6_gracefulShutdown() {
    console.log('\n=== 示例 6: 优雅关闭 ===\n');
    console.log('场景：应用退出时正确关闭 watcher');
    console.log('用途：避免资源泄漏，确保数据完整\n');

    const msq = new MonSQLize(DB_CONFIG);
    await msq.connect();

    const collection = msq.dbInstance.collection('sessions');

    const watcher = collection.watch();

    watcher.on('change', (change) => {
        console.log('✅ 会话变更:', change.operationType);
    });

    watcher.on('close', () => {
        console.log('✅ watcher 已关闭');
    });

    // 模拟 SIGTERM 信号
    console.log('模拟应用关闭...\n');

    // 插入数据
    await collection.insertOne({ sessionId: 'SES001', userId: 'USER001' });

    await new Promise(resolve => setTimeout(resolve, 500));

    // 优雅关闭
    console.log('正在关闭 watcher...');
    await watcher.close();
    console.log('正在关闭数据库连接...');
    await msq.close();

    console.log('\n✅ 示例 6 完成\n');
}

// ============================================================================
// 主函数
// ============================================================================

async function main() {
    console.log('\n================================================');
    console.log('       monSQLize watch() 方法示例集');
    console.log('================================================\n');

    try {
        await example1_basicWatch();
        await example2_filterEvents();
        await example3_cacheInvalidation();
        await example4_errorHandling();
        await example5_statistics();
        await example6_gracefulShutdown();

        console.log('================================================');
        console.log('           所有示例运行完成！');
        console.log('================================================\n');
    } catch (error) {
        console.error('示例运行失败:', error);
        process.exit(1);
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    example1_basicWatch,
    example2_filterEvents,
    example3_cacheInvalidation,
    example4_errorHandling,
    example5_statistics,
    example6_gracefulShutdown
};

