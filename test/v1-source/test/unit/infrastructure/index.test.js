/**
 * MonSQLize 主类测试
 * 测试构造函数边界情况和辅助方法
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

console.log('\n📦 MonSQLize 主类测试套件\n');

// 导出异步测试 Promise
module.exports = (async () => {
    console.log('📦 Suite 13: 构造函数边界测试');

    // 测试 1: 无效数据库类型 - null
    try {
        new MonSQLize({ type: null });
        assert.fail('应该抛出错误');
    } catch (err) {
        assert.ok(err.message.includes('Invalid database type'));
        console.log('  ✓ type: null 正确抛出错误');
    }

    // 测试 2: 无效数据库类型 - undefined
    try {
        new MonSQLize({});
        assert.fail('应该抛出错误');
    } catch (err) {
        assert.ok(err.message.includes('Invalid database type'));
        console.log('  ✓ type: undefined 正确抛出错误');
    }

    // 测试 3: 无效数据库类型 - 不支持的类型
    try {
        new MonSQLize({ type: 'postgresql' });
        assert.fail('应该抛出错误');
    } catch (err) {
        assert.ok(err.message.includes('Invalid database type'));
        console.log('  ✓ type: "postgresql" 正确抛出错误');
    }

    // 测试 4: deepMerge 边界 - null 值
    const instance1 = new MonSQLize({
        type: 'mongodb',
        maxTimeMS: null,
        namespace: { scope: 'connection' }
    });
    const defaults1 = instance1.getDefaults();
    assert.strictEqual(defaults1.maxTimeMS, null);
    console.log('  ✓ deepMerge 正确处理 null 值');

    // 测试 5: deepMerge 边界 - 嵌套对象合并
    const instance2 = new MonSQLize({
        type: 'mongodb',
        log: {
            slowQueryTag: {
                event: 'custom_event',
                severity: 'high'
            }
        }
    });
    const defaults2 = instance2.getDefaults();
    assert.strictEqual(defaults2.log.slowQueryTag.event, 'custom_event');
    assert.strictEqual(defaults2.log.slowQueryTag.severity, 'high');
    // 验证 code 字段从默认值继承
    assert.strictEqual(defaults2.log.slowQueryTag.code, 'SLOW_QUERY');
    console.log('  ✓ deepMerge 正确处理嵌套对象合并');

    // 测试 6: deepMerge 边界 - 数组不合并（直接覆盖）
    const instance3 = new MonSQLize({
        type: 'mongodb',
        namespace: { tags: ['tag1', 'tag2'] }
    });
    const defaults3 = instance3.getDefaults();
    assert.deepStrictEqual(defaults3.namespace.tags, ['tag1', 'tag2']);
    console.log('  ✓ deepMerge 正确处理数组（覆盖而非合并）');

    // 测试 7: 配置冻结验证
    const instance4 = new MonSQLize({ type: 'mongodb' });
    try {
        instance4.defaults.maxTimeMS = 9999;
        // 严格模式下会抛出错误，非严格模式下赋值无效
        assert.strictEqual(instance4.defaults.maxTimeMS, 2000);
        console.log('  ✓ 默认配置已冻结，无法修改');
    } catch (err) {
        // 严格模式下抛出 TypeError
        assert.ok(err instanceof TypeError);
        console.log('  ✓ 默认配置已冻结（严格模式抛出错误）');
    }

    console.log('\n📦 Suite 14: 辅助方法测试');

    // 测试 8: getCache() 方法
    const instance5 = new MonSQLize({ type: 'mongodb' });
    const cache = instance5.getCache();
    assert.ok(cache !== null);
    assert.ok(typeof cache.get === 'function');
    assert.ok(typeof cache.set === 'function');
    console.log('  ✓ getCache() 返回有效缓存实例');

    // 测试 9: getDefaults() 返回副本（不影响原配置）
    const instance6 = new MonSQLize({ type: 'mongodb', maxTimeMS: 5000 });
    const defaultsCopy = instance6.getDefaults();
    defaultsCopy.maxTimeMS = 9999;
    assert.strictEqual(instance6.defaults.maxTimeMS, 5000);
    console.log('  ✓ getDefaults() 返回配置副本');

    // 测试 10: close() 方法（未连接状态）
    const instance7 = new MonSQLize({ type: 'mongodb' });
    await instance7.close();
    assert.strictEqual(instance7._adapter, null);
    assert.strictEqual(instance7.dbInstance, null);
    console.log('  ✓ close() 在未连接状态正常工作');

    // 测试 11: health() 方法（未连接状态）
    const instance8 = new MonSQLize({ type: 'mongodb' });
    const health = await instance8.health();
    assert.strictEqual(health.status, 'down');
    assert.strictEqual(health.connected, false);
    console.log('  ✓ health() 未连接时返回 down 状态');

    // 测试 12: on() 和 off() 方法（未连接状态，不报错）
    const instance9 = new MonSQLize({ type: 'mongodb' });
    const handler = () => {};
    instance9.on('connected', handler); // 不应抛出错误
    instance9.off('connected', handler); // 不应抛出错误
    console.log('  ✓ on/off 在未连接状态不抛出错误');

    console.log('\n✅ MonSQLize 主类测试全部通过\n');
})();
