/**
 * 缓存系统测试
 * 测试基础缓存功能
 */

const assert = require('assert');
const CacheFactory = require('../../../lib/cache');

console.log('\n📦 缓存系统测试套件\n');

// 导出测试 Promise 供 test runner 等待
module.exports = (async () => {
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

    console.log('\n📦 7. BSON 类型序列化测试');

    // BSON ObjectId
    try {
        const BSON = require('bson');
        
        // ObjectId 序列化
        const objId = new BSON.ObjectId('507f1f77bcf86cd799439011');
        const key1 = CacheFactory.stableStringify({ id: objId });
        assert.ok(key1.includes('ObjectId'));
        console.log('  ✓ ObjectId 序列化');
        
        // Decimal128 序列化
        const decimal = BSON.Decimal128.fromString('123.456');
        const key2 = CacheFactory.stableStringify({ price: decimal });
        assert.ok(key2.includes('Decimal128'));
        console.log('  ✓ Decimal128 序列化');
        
        // Long 序列化
        const long = BSON.Long.fromNumber(9007199254740991);
        const key3 = CacheFactory.stableStringify({ count: long });
        assert.ok(key3.includes('Long'));
        console.log('  ✓ Long 序列化');
        
        // UUID 序列化（UUID 在 BSON 中是 Binary sub_type=4）
        const uuid = new BSON.UUID('123e4567-e89b-12d3-a456-426614174000');
        const key4 = CacheFactory.stableStringify({ uuid: uuid });
        assert.ok(key4.includes('Binary')); // UUID 被序列化为 Binary(4,...)
        console.log('  ✓ UUID 序列化 (Binary sub_type=4)');
        
        // Binary 序列化
        const binary = new BSON.Binary(Buffer.from('test'), 0);
        const key5 = CacheFactory.stableStringify({ data: binary });
        assert.ok(key5.includes('Binary'));
        console.log('  ✓ Binary 序列化');
        
        // 未知 BSON 类型兜底（模拟）
        const unknownBson = { _bsontype: 'CustomType', toString: () => 'custom' };
        const key6 = CacheFactory.stableStringify({ custom: unknownBson });
        assert.ok(key6.includes('CustomType'));
        console.log('  ✓ 未知 BSON 类型兜底');
        
        // BSON 序列化异常兜底（模拟抛出异常的 BSON 对象）
        const badBson = {
            _bsontype: 'BadType',
            toHexString() { throw new Error('Simulated BSON error'); },
            toString() { throw new Error('Simulated BSON error'); }
        };
        const key7 = CacheFactory.stableStringify({ bad: badBson });
        assert.ok(key7.includes('[BSON:BadType]'));
        console.log('  ✓ BSON 序列化异常兜底');
        
    } catch (err) {
        if (err.code !== 'MODULE_NOT_FOUND') throw err;
        console.log('  ⚠️  跳过 BSON 测试（bson 包未安装）');
    }

    console.log('\n📦 8. 循环引用与边界测试');

    // 循环引用对象
    const circular = { a: 1 };
    circular.self = circular;
    const key8 = CacheFactory.stableStringify({ obj: circular });
    assert.ok(key8.includes('[CIRCULAR]'));
    console.log('  ✓ 循环引用检测');

    // 深嵌套对象
    const deepNested = { a: { b: { c: { d: { e: 'value' } } } } };
    const key9 = CacheFactory.stableStringify(deepNested);
    assert.ok(key9.length > 0);
    console.log('  ✓ 深嵌套对象');

    // 混合 BSON 与循环引用
    try {
        const BSON = require('bson');
        const objId = new BSON.ObjectId('507f1f77bcf86cd799439011');
        const mixed = { id: objId, data: {} };
        mixed.data.self = mixed;
        const key10 = CacheFactory.stableStringify(mixed);
        assert.ok(key10.includes('ObjectId'));
        assert.ok(key10.includes('[CIRCULAR]'));
        console.log('  ✓ 混合 BSON 与循环引用');
    } catch (err) {
        if (err.code !== 'MODULE_NOT_FOUND') throw err;
        console.log('  ⚠️  跳过混合 BSON 测试（bson 包未安装）');
    }

    console.log('\n📦 9. 命名空间模式测试');

    // buildNamespacePattern
    const cache13 = CacheFactory.createDefault();
    const nsPattern = CacheFactory.buildNamespacePattern({
        iid: 'test-instance',
        type: 'mongodb',
        db: 'testdb',
        collection: 'users'
    });
    assert.ok(nsPattern.includes('monSQLize'));
    assert.ok(nsPattern.includes('test-instance'));
    assert.ok(nsPattern.includes('testdb'));
    assert.ok(nsPattern.includes('users'));
    console.log('  ✓ buildNamespacePattern 通配符生成');

    // buildNamespaceOpPattern (注意方法名)
    const opPattern = CacheFactory.buildNamespaceOpPattern({
        iid: 'test-instance',
        type: 'mongodb',
        db: 'testdb',
        collection: 'users'
    }, 'findOne');
    assert.ok(opPattern.includes('findOne'));
    console.log('  ✓ buildNamespaceOpPattern 操作模式生成');

    // delPattern 批量删除验证（通过 keys() 验证）
    const keyObj1 = CacheFactory.buildCacheKey({
        iid: 'test-instance',
        type: 'mongodb',
        db: 'testdb',
        collection: 'users',
        op: 'findOne',
        base: { id: 1 }
    });
    const keyObj2 = CacheFactory.buildCacheKey({
        iid: 'test-instance',
        type: 'mongodb',
        db: 'testdb',
        collection: 'users',
        op: 'find',
        base: { filter: {} }
    });
    
    await cache13.set(CacheFactory.stableStringify(keyObj1), 'value1');
    await cache13.set(CacheFactory.stableStringify(keyObj2), 'value2');
    
    const keys = cache13.keys();
    assert.ok(keys.length >= 2);
    
    // 使用 buildNamespacePattern 生成的模式删除（注意要 await）
    const deleted = await cache13.delPattern(nsPattern);
    assert.ok(deleted >= 2);
    assert.strictEqual(cache13.keys().length, 0);
    console.log('  ✓ delPattern 批量删除验证');

    console.log('\n✅ 缓存系统测试全部通过\n');
})();
