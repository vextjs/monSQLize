/**
 * 缓存系统测试
 * 测试基础缓存功能
 */

const assert = require('assert');
const CacheFactory = require('../../../lib/cache');

console.log('\n📦 缓存系统测试套件\n');

(async () => {
    console.log('📦 1. 基础功能测试');
    
    // 测试 set/get
    const cache1 = CacheFactory.createDefault({ maxSize: 100 });
    await cache1.set('key1', 'value1');
    assert.strictEqual(await cache1.get('key1'), 'value1');
    console.log('  ✓ 基础 set/get');
    
    // 测试 del
    const cache2 = CacheFactory.createDefault();
    await cache2.set('key1', 'value1');
    await cache2.del('key1');
    assert.strictEqual(await cache2.get('key1'), undefined);
    console.log('  ✓ del 删除');
    
    // 测试 clear
    const cache3 = CacheFactory.createDefault();
    await cache3.set('key1', 'value1');
    await cache3.set('key2', 'value2');
    cache3.clear();
    assert.strictEqual(await cache3.get('key1'), undefined);
    console.log('  ✓ clear 清空');
    
    console.log('\n📦 2. TTL 过期测试');
    
    // TTL 过期
    const cache4 = CacheFactory.createDefault();
    await cache4.set('key1', 'value1', 100);
    assert.strictEqual(await cache4.get('key1'), 'value1');
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.strictEqual(await cache4.get('key1'), undefined);
    console.log('  ✓ TTL 自动过期');
    
    // 无 TTL
    const cache5 = CacheFactory.createDefault();
    await cache5.set('key1', 'value1');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(await cache5.get('key1'), 'value1');
    console.log('  ✓ 无 TTL 永久缓存');
    
    console.log('\n📦 3. LRU 淘汰测试');
    
    // LRU 淘汰
    const cache6 = CacheFactory.createDefault({ maxSize: 3 });
    await cache6.set('key1', 'value1');
    await cache6.set('key2', 'value2');
    await cache6.set('key3', 'value3');
    await cache6.get('key1'); // 刷新 key1
    await cache6.set('key4', 'value4'); // 应淘汰 key2
    assert.strictEqual(await cache6.get('key1'), 'value1');
    assert.strictEqual(await cache6.get('key2'), undefined);
    console.log('  ✓ LRU 淘汰最少使用');
    
    console.log('\n📦 4. 统计功能测试');
    
    // 启用统计
    const cache7 = CacheFactory.createDefault({ enableStats: true });
    await cache7.set('key1', 'value1');
    await cache7.get('key1');
    await cache7.get('key2');
    const stats = cache7.getStats();
    assert.ok(stats.hits >= 1);
    assert.ok(stats.misses >= 1);
    console.log('  ✓ 启用统计');
    
    console.log('\n📦 5. 批量操作测试');
    
    // getMany
    const cache8 = CacheFactory.createDefault();
    await cache8.set('key1', 'value1');
    await cache8.set('key2', 'value2');
    const results = await cache8.getMany(['key1', 'key2', 'key3']);
    assert.strictEqual(results.key1, 'value1');
    assert.strictEqual(results.key2, 'value2');
    assert.strictEqual(results.key3, undefined);
    console.log('  ✓ getMany 批量获取');

    // setMany
    const cache9 = CacheFactory.createDefault();
    await cache9.setMany({ key1: 'value1', key2: 'value2' });
    assert.strictEqual(await cache9.get('key1'), 'value1');
    console.log('  ✓ setMany 批量设置');

    console.log('\n📦 6. exists 测试');

    // exists
    const cache10 = CacheFactory.createDefault();
    await cache10.set('key1', 'value1');
    assert.strictEqual(await cache10.exists('key1'), true);
    assert.strictEqual(await cache10.exists('key2'), false);
    console.log('  ✓ exists 检查存在');

    console.log('\n✅ 缓存系统测试全部通过\n');
})();

