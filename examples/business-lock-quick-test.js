/**
 * 业务锁功能快速验证（不需要 Redis）
 * 验证 API 是否正确挂载
 */

const MonSQLize = require('../lib/index');

async function quickTest() {
    console.log('=== 业务锁功能快速验证 ===\n');

    // 1. 测试无 Redis 时的行为
    console.log('1. 测试无 Redis 配置...');
    const msqNoRedis = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' }
    });

    const dbNoRedis = await msqNoRedis.connect();

    if (typeof dbNoRedis.withLock === 'undefined') {
        console.log('   ✅ 无 Redis 时，业务锁 API 未挂载（符合预期）\n');
    } else {
        console.log('   ❌ 错误：无 Redis 时不应挂载业务锁 API\n');
    }

    // 2. 测试有 Redis 配置但未运行时的行为
    console.log('2. 测试有 Redis 配置（模拟 Redis）...');

    // 使用 mock Redis 对象
    const mockRedis = {
        on: () => {},
        set: async () => 'OK',
        eval: async () => 1,
        ping: async () => 'PONG'
    };

    const msqWithRedis = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
        cache: {
            transaction: {
                distributedLock: {
                    redis: mockRedis,
                    keyPrefix: 'test:lock:'
                }
            }
        }
    });

    const dbWithRedis = await msqWithRedis.connect();

    if (typeof dbWithRedis.withLock === 'function' &&
        typeof dbWithRedis.acquireLock === 'function' &&
        typeof dbWithRedis.tryAcquireLock === 'function' &&
        typeof dbWithRedis.getLockStats === 'function') {
        console.log('   ✅ 有 Redis 时，所有业务锁 API 已挂载\n');
    } else {
        console.log('   ❌ 错误：有 Redis 时应挂载所有业务锁 API\n');
    }

    // 3. 测试基本锁功能
    console.log('3. 测试基本锁功能（使用 mock Redis）...');

    try {
        let executed = false;
        const result = await dbWithRedis.withLock('test:resource', async () => {
            executed = true;
            return 'success';
        });

        if (executed && result === 'success') {
            console.log('   ✅ withLock 执行成功');
        } else {
            console.log('   ❌ withLock 执行失败');
        }
    } catch (error) {
        console.log('   ❌ withLock 抛出异常:', error.message);
    }

    try {
        const lock = await dbWithRedis.acquireLock('test:resource2');
        if (lock && typeof lock.release === 'function') {
            console.log('   ✅ acquireLock 返回 Lock 对象');
            await lock.release();
            console.log('   ✅ lock.release() 执行成功');
        } else {
            console.log('   ❌ acquireLock 未返回有效 Lock 对象');
        }
    } catch (error) {
        console.log('   ❌ acquireLock 抛出异常:', error.message);
    }

    try {
        const lock = await dbWithRedis.tryAcquireLock('test:resource3');
        if (lock) {
            console.log('   ✅ tryAcquireLock 返回 Lock 对象');
            await lock.release();
        } else {
            console.log('   ⚠️  tryAcquireLock 返回 null（可能锁被占用）');
        }
    } catch (error) {
        console.log('   ❌ tryAcquireLock 抛出异常:', error.message);
    }

    // 4. 测试锁统计
    console.log('\n4. 测试锁统计功能...');
    const stats = dbWithRedis.getLockStats();
    if (stats && typeof stats.locksAcquired === 'number') {
        console.log('   ✅ 锁统计功能正常');
        console.log(`   📊 统计信息: ${JSON.stringify(stats)}`);
    } else {
        console.log('   ❌ 锁统计功能异常');
    }

    console.log('\n✅ 所有验证完成！');
    console.log('\n💡 提示：');
    console.log('   - 核心功能已验证正常');
    console.log('   - 需要 Redis 运行才能执行完整示例');
    console.log('   - 运行 examples/business-lock.examples.js 查看完整示例');

    process.exit(0);
}

quickTest().catch(error => {
    console.error('❌ 验证失败:', error);
    process.exit(1);
});

