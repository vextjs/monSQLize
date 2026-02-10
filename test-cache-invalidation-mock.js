/**
 * Mock 版本测试：验证缓存失效逻辑（不需要 MongoDB）
 * 此版本用于验证缓存失效的逻辑是否正确实现
 */

const MemoryCache = require('./lib/cache');

/**
 * 等待指定的时间（毫秒）
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCacheLogic() {
    console.log('🚀 开始测试缓存逻辑（Mock版本）\n');

    // 创建缓存实例
    const cache = MemoryCache.createDefault({
        maxSize: 1000,
        enableStats: true
    });

    try {
        // =====================================================
        // 测试 1: TTL 自动过期
        // =====================================================
        console.log('=== 测试 1: TTL 自动过期 ===');
        
        // 清空缓存
        await cache.clear();
        
        // 第一次设置（TTL = 2 秒）
        await cache.set('test:key1', { data: 'test data' }, 2000);
        console.log('第一次设置缓存 (TTL = 2秒)');
        
        // 立即获取（应该命中）
        let value = await cache.get('test:key1');
        const stats1 = cache.stats;
        console.log(`立即获取: ${value ? '缓存 HIT' : '缓存 MISS'} (hits: ${stats1.hits}, misses: ${stats1.misses})`);
        
        if (!value) {
            throw new Error('TTL测试失败：立即获取应该命中缓存');
        }
        
        // 等待 2.5 秒让 TTL 过期
        console.log('等待 2.5 秒...');
        await sleep(2500);
        
        // 再次获取（应该过期）
        value = await cache.get('test:key1');
        const stats2 = cache.stats;
        console.log(`TTL过期后获取: ${value ? '缓存 HIT' : '缓存 MISS'} (hits: ${stats2.hits}, misses: ${stats2.misses})`);
        
        if (value) {
            throw new Error('TTL测试失败：过期后不应该命中缓存');
        }
        
        console.log('✓ TTL 自动过期测试通过\n');

        // =====================================================
        // 测试 2: 模式匹配删除（模拟写操作失效）
        // =====================================================
        console.log('=== 测试 2: 模式匹配删除（写操作失效） ===');
        
        // 清空缓存并设置多个键
        await cache.clear();
        
        // 模拟同一集合的不同查询缓存
        await cache.set('test:collection:users:find:query1', { count: 2 }, 60000);
        await cache.set('test:collection:users:find:query2', { count: 3 }, 60000);
        await cache.set('test:collection:users:findOne:query1', { user: 'Alice' }, 60000);
        await cache.set('test:collection:other:find:query1', { count: 5 }, 60000);
        
        console.log('设置了 4 个缓存键');
        
        // 验证所有键都存在
        let exists1 = await cache.exists('test:collection:users:find:query1');
        let exists2 = await cache.exists('test:collection:users:find:query2');
        let exists3 = await cache.exists('test:collection:users:findOne:query1');
        let exists4 = await cache.exists('test:collection:other:find:query1');
        
        console.log(`缓存状态: users查询1=${exists1}, users查询2=${exists2}, users查询3=${exists3}, other查询=${exists4}`);
        
        // 模拟写操作：删除 users 集合的所有缓存
        const deleted = await cache.delPattern('*collection:users*');
        console.log(`执行模式删除 (*collection:users*): 删除了 ${deleted} 个键`);
        
        // 验证只有 users 相关的缓存被删除
        exists1 = await cache.exists('test:collection:users:find:query1');
        exists2 = await cache.exists('test:collection:users:find:query2');
        exists3 = await cache.exists('test:collection:users:findOne:query1');
        exists4 = await cache.exists('test:collection:other:find:query1');
        
        console.log(`删除后状态: users查询1=${exists1}, users查询2=${exists2}, users查询3=${exists3}, other查询=${exists4}`);
        
        if (exists1 || exists2 || exists3) {
            throw new Error('模式匹配删除测试失败：users相关缓存应该被删除');
        }
        
        if (!exists4) {
            throw new Error('模式匹配删除测试失败：other集合的缓存不应该被删除');
        }
        
        console.log('✓ 模式匹配删除测试通过\n');

        // =====================================================
        // 测试 3: 缓存统计信息
        // =====================================================
        console.log('=== 测试 3: 缓存统计信息 ===');
        
        // 创建新的缓存实例以获得干净的统计
        const testCache = MemoryCache.createDefault({
            maxSize: 1000,
            enableStats: true
        });
        
        const initialStats = testCache.stats;
        console.log(`初始统计: hits=${initialStats.hits}, misses=${initialStats.misses}, sets=${initialStats.sets}, deletes=${initialStats.deletes}`);
        
        // 执行一系列操作
        await testCache.set('key1', 'value1', 60000);  // sets +1
        await testCache.set('key2', 'value2', 60000);  // sets +1
        await testCache.get('key1');                    // hits +1
        await testCache.get('key1');                    // hits +1
        await testCache.get('key3');                    // misses +1
        await testCache.del('key1');                    // deletes +1
        
        const finalStats = testCache.stats;
        console.log(`最终统计: hits=${finalStats.hits}, misses=${finalStats.misses}, sets=${finalStats.sets}, deletes=${finalStats.deletes}`);
        
        // 验证统计数据（由于是新实例，直接比较绝对值）
        if (finalStats.hits !== 2) {
            throw new Error(`统计测试失败：期望 hits = 2，实际 = ${finalStats.hits}`);
        }
        if (finalStats.misses !== 1) {
            throw new Error(`统计测试失败：期望 misses = 1，实际 = ${finalStats.misses}`);
        }
        if (finalStats.sets !== 2) {
            throw new Error(`统计测试失败：期望 sets = 2，实际 = ${finalStats.sets}`);
        }
        if (finalStats.deletes !== 1) {
            throw new Error(`统计测试失败：期望 deletes = 1，实际 = ${finalStats.deletes}`);
        }
        
        console.log('✓ 缓存统计信息测试通过\n');

        console.log('✅ 所有缓存逻辑测试通过！');
        console.log('\n💡 提示：运行完整的集成测试请使用 `node test-cache-invalidation.js`');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        process.exit(1);
    }
}

testCacheLogic();
