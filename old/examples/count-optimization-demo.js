/**
 * count 方法性能优化示例
 *
 * 展示 estimatedDocumentCount vs countDocuments 的性能差异
 */

const MonSQLize = require('../../lib');

async function main() {
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'example',
        config: { uri: 'mongodb://localhost:27017' },
        maxTimeMS: 5000,
    });

    const { collection } = await msq.connect();
    const orders = collection('orders');

    console.log('🔍 count 方法性能优化示例\n');
    console.log('=' .repeat(60));

    // ============================================================
    // 示例 1: 无查询条件 - 自动使用 estimatedDocumentCount
    // ============================================================
    console.log('\n📊 示例 1: 统计所有文档（无查询条件）');
    console.log('使用方法：estimatedDocumentCount（基于元数据，速度快）\n');

    try {
        // 方式 1: 不传 query
        const start1 = Date.now();
        const count1 = await orders.count({ meta: true });
        console.log('不传 query:', count1.data);
        console.log('耗时:', count1.meta.durationMs, 'ms');

        // 方式 2: 传空对象
        const start2 = Date.now();
        const count2 = await orders.count({ query: {}, meta: true });
        console.log('\n传 query: {}:', count2.data);
        console.log('耗时:', count2.meta.durationMs, 'ms');

        console.log('\n✅ 两种方式都会自动使用 estimatedDocumentCount');
        console.log('   特点：速度极快，基于集合元数据，不扫描文档');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60));

    // ============================================================
    // 示例 2: 有查询条件 - 自动使用 countDocuments
    // ============================================================
    console.log('\n📊 示例 2: 统计特定条件的文档（有查询条件）');
    console.log('使用方法：countDocuments（精确统计，扫描文档）\n');

    try {
        const start = Date.now();
        const count = await orders.count({
            query: { status: 'paid' },
            meta: true
        });
        console.log('已支付订单数:', count.data);
        console.log('耗时:', count.meta.durationMs, 'ms');

        console.log('\n✅ 有查询条件时自动使用 countDocuments');
        console.log('   特点：精确统计，但需要扫描匹配的文档');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60));

    // ============================================================
    // 示例 3: 性能对比（如果数据量大）
    // ============================================================
    console.log('\n⚡ 示例 3: 性能对比');

    try {
        // 测试 1: 空查询（使用 estimatedDocumentCount）
        const start1 = Date.now();
        const fast = await orders.count({ meta: true });
        const time1 = Date.now() - start1;

        // 测试 2: 复杂查询（使用 countDocuments）
        const start2 = Date.now();
        const slow = await orders.count({
            query: {
                status: { $in: ['paid', 'shipped', 'completed'] },
                createdAt: { $gte: new Date('2024-01-01') }
            },
            meta: true
        });
        const time2 = Date.now() - start2;

        console.log('\n空查询（估算）:');
        console.log('  结果:', fast.data);
        console.log('  耗时:', fast.meta.durationMs, 'ms');

        console.log('\n复杂查询（精确）:');
        console.log('  结果:', slow.data);
        console.log('  耗时:', slow.meta.durationMs, 'ms');

        console.log('\n性能提升:', ((time2 / time1) * 100).toFixed(0) + '%');
        console.log('💡 在大数据集上，estimatedDocumentCount 可能快 100-1000 倍');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60));

    // ============================================================
    // 示例 4: 配合缓存使用
    // ============================================================
    console.log('\n💾 示例 4: 配合缓存使用');

    try {
        // 第一次查询（写入缓存）
        console.log('\n第一次查询（无缓存）:');
        const first = await orders.count({
            query: { status: 'paid' },
            cache: 60000,  // 缓存 60 秒
            meta: true
        });
        console.log('  结果:', first.data);
        console.log('  耗时:', first.meta.durationMs, 'ms');
        console.log('  来自缓存:', first.meta.fromCache);

        // 第二次查询（命中缓存）
        console.log('\n第二次查询（命中缓存）:');
        const second = await orders.count({
            query: { status: 'paid' },
            cache: 60000,
            meta: true
        });
        console.log('  结果:', second.data);
        console.log('  耗时:', second.meta.durationMs, 'ms');
        console.log('  来自缓存:', second.meta.fromCache);

        console.log('\n✅ 缓存进一步提升性能，适合高频查询场景');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60));

    // ============================================================
    // 示例 5: 使用索引提示优化 countDocuments
    // ============================================================
    console.log('\n🎯 示例 5: 使用索引提示优化 countDocuments');

    try {
        const count = await orders.count({
            query: { status: 'paid', createdAt: { $gte: new Date('2024-01-01') } },
            hint: { status: 1, createdAt: -1 },  // 指定索引
            meta: true
        });
        console.log('\n使用索引提示:');
        console.log('  结果:', count.data);
        console.log('  耗时:', count.meta.durationMs, 'ms');

        console.log('\n✅ 对于复杂查询，指定正确的索引可以显著提升性能');
    } catch (error) {
        console.error('错误:', error.message);
    }

    console.log('\n' + '='.repeat(60));

    // ============================================================
    // 最佳实践总结
    // ============================================================
    console.log('\n📋 最佳实践总结：');
    console.log('');
    console.log('1. 统计全部文档');
    console.log('   ✅ 使用: count() 或 count({ query: {} })');
    console.log('   ⚡ 自动使用 estimatedDocumentCount（速度快）');
    console.log('');
    console.log('2. 统计特定条件文档');
    console.log('   ✅ 使用: count({ query: { status: "paid" } })');
    console.log('   ⚡ 自动使用 countDocuments（精确统计）');
    console.log('');
    console.log('3. 高频查询场景');
    console.log('   ✅ 添加缓存: count({ query: {...}, cache: 60000 })');
    console.log('   ⚡ 避免重复扫描，提升性能');
    console.log('');
    console.log('4. 复杂查询优化');
    console.log('   ✅ 使用索引提示: count({ query: {...}, hint: { field: 1 } })');
    console.log('   ⚡ 确保查询使用正确的索引');
    console.log('');
    console.log('5. 精确度要求');
    console.log('   ⚠️  estimatedDocumentCount 返回近似值（基于元数据）');
    console.log('   ✅ 对于实时精确统计，传入查询条件强制使用 countDocuments');
    console.log('');

    // 查看缓存统计
    console.log('='.repeat(60));
    console.log('\n📊 缓存统计:');
    const cache = msq.getCache();
    const stats = cache.getStats && cache.getStats();
    if (stats) {
        console.log('  命中率:', (stats.hitRate * 100).toFixed(2) + '%');
        console.log('  命中次数:', stats.hits);
        console.log('  未命中次数:', stats.misses);
        console.log('  缓存大小:', stats.size);
    }

    await msq.close();
    console.log('\n✅ 示例运行完成\n');
}

main().catch(error => {
    console.error('❌ 程序执行出错:', error);
    process.exit(1);
});

