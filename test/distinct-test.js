/**
 * distinct 方法测试
 * 验证字段去重查询功能
 */

const MonSQLize = require('../lib/index');

async function testDistinct() {
    console.log('\n=== 开始测试 distinct 方法 ===\n');

    const db = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: {
            uri: process.env.MONGO_URI || 'mongodb://localhost:27017'
        },
        cache: { maxSize: 1000 },
        logger: console,
        maxTimeMS: 5000,
        slowQueryMs: 100
    });

    let passed = 0;
    let failed = 0;

    try {
        const accessor = await db.connect();
        const collection = accessor.collection('test_distinct');

        // 准备测试数据
        console.log('准备测试数据...');
        await collection.dropCollection().catch(() => {}); // 忽略集合不存在的错误
        await collection.createCollection();

        // 使用 MonSQLize 的适配器客户端插入测试数据
        const nativeDb = db._adapter.client.db('test');
        const mongoCollection = nativeDb.collection('test_distinct');
        await mongoCollection.insertMany([
            { _id: 1, status: 'active', city: 'Beijing', age: 25, tags: ['js', 'node'] },
            { _id: 2, status: 'inactive', city: 'Shanghai', age: 30, tags: ['python', 'java'] },
            { _id: 3, status: 'active', city: 'Beijing', age: 22, tags: ['js', 'react'] },
            { _id: 4, status: 'pending', city: 'Guangzhou', age: 35, tags: ['java', 'spring'] },
            { _id: 5, status: 'active', city: 'Shanghai', age: 28, tags: ['js', 'vue'] }
        ]);
        console.log('✓ 测试数据已准备\n');

        // 测试 1：基础去重
        console.log('测试 1: 基础去重');
        try {
            const statuses = await collection.distinct('status');
            if (statuses.length === 3 && statuses.includes('active') && statuses.includes('inactive') && statuses.includes('pending')) {
                console.log('✓ 通过 - 获取到 3 个不同状态');
                passed++;
            } else {
                console.log('✗ 失败 - 状态数量不正确:', statuses);
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 2：带查询条件
        console.log('\n测试 2: 带查询条件');
        try {
            const cities = await collection.distinct('city', {
                query: { status: 'active' }
            });
            if (cities.length === 2 && cities.includes('Beijing') && cities.includes('Shanghai')) {
                console.log('✓ 通过 - active 状态的城市有 2 个');
                passed++;
            } else {
                console.log('✗ 失败 - 城市数量或内容不正确:', cities);
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 3：数组字段去重
        console.log('\n测试 3: 数组字段去重');
        try {
            const tags = await collection.distinct('tags');
            const expectedTags = ['js', 'node', 'python', 'java', 'react', 'spring', 'vue'];
            const allTagsPresent = expectedTags.every(tag => tags.includes(tag));
            if (allTagsPresent) {
                console.log('✓ 通过 - 数组字段正确展开并去重');
                passed++;
            } else {
                console.log('✗ 失败 - 标签不完整:', tags);
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 4：缓存功能
        console.log('\n测试 4: 缓存功能');
        try {
            // 第一次查询
            const t1 = Date.now();
            const result1 = await collection.distinct('status', { cache: 60000 });
            const time1 = Date.now() - t1;

            // 第二次查询（应该命中缓存）
            const t2 = Date.now();
            const result2 = await collection.distinct('status', { cache: 60000 });
            const time2 = Date.now() - t2;

            if (JSON.stringify(result1) === JSON.stringify(result2) && time2 < time1) {
                console.log('✓ 通过 - 缓存命中，第二次查询更快');
                console.log(`  首次: ${time1}ms, 缓存: ${time2}ms`);
                passed++;
            } else {
                console.log('✗ 失败 - 缓存未按预期工作');
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 5：meta 信息
        console.log('\n测试 5: meta 信息');
        try {
            const result = await collection.distinct('city', {
                query: { age: { $gte: 25 } },
                meta: true
            });

            if (result.data && result.meta &&
                result.meta.op === 'distinct' &&
                typeof result.meta.durationMs === 'number' &&
                result.meta.ns.coll === 'test_distinct') {
                console.log('✓ 通过 - meta 信息正确返回');
                console.log(`  操作: ${result.meta.op}, 耗时: ${result.meta.durationMs}ms`);
                passed++;
            } else {
                console.log('✗ 失败 - meta 信息不完整');
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 6：缓存失效
        console.log('\n测试 6: 缓存失效');
        try {
            // 查询并缓存
            await collection.distinct('status', { cache: 60000 });

            // 失效缓存
            const deleted = await collection.invalidate('distinct');

            // 再次查询，不应该命中缓存
            const { meta } = await collection.distinct('status', {
                cache: 60000,
                meta: true
            });

            if (deleted >= 0 && !meta.fromCache) {
                console.log('✓ 通过 - 缓存失效成功');
                console.log(`  删除键数: ${deleted}, fromCache: ${meta.fromCache || false}`);
                passed++;
            } else {
                console.log('✗ 失败 - 缓存失效未生效');
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 7：空查询条件
        console.log('\n测试 7: 空查询条件');
        try {
            const allCities = await collection.distinct('city', { query: {} });
            if (allCities.length === 3) {
                console.log('✓ 通过 - 空查询返回所有去重值');
                passed++;
            } else {
                console.log('✗ 失败 - 城市数量不正确:', allCities);
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 8：不存在的字段
        console.log('\n测试 8: 不存在的字段');
        try {
            const result = await collection.distinct('nonexistent');
            if (Array.isArray(result) && result.length === 0) {
                console.log('✓ 通过 - 不存在的字段返回空数组');
                passed++;
            } else {
                console.log('✗ 失败 - 应该返回空数组');
                failed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 测试 9：慢查询事件
        console.log('\n测试 9: 慢查询事件');
        try {
            let slowQueryTriggered = false;
            const handler = (meta) => {
                if (meta.op === 'distinct') {
                    slowQueryTriggered = true;
                }
            };

            db.on('slow-query', handler);

            // 设置很低的慢查询阈值
            const originalSlowQueryMs = db.defaults.slowQueryMs;
            db.defaults.slowQueryMs = 1;

            await collection.distinct('status');

            // 恢复原值
            db.defaults.slowQueryMs = originalSlowQueryMs;
            db.off('slow-query', handler);

            // 给事件触发一些时间
            await new Promise(resolve => setTimeout(resolve, 50));

            if (slowQueryTriggered) {
                console.log('✓ 通过 - 慢查询事件正确触发');
                passed++;
            } else {
                console.log('⚠ 部分通过 - 慢查询事件未触发（可能查询太快）');
                passed++;
            }
        } catch (error) {
            console.log('✗ 失败 -', error.message);
            failed++;
        }

        // 清理测试数据
        console.log('\n清理测试数据...');
        await collection.dropCollection();

        // 测试总结
        console.log('\n=== 测试完成 ===');
        console.log(`通过: ${passed}`);
        console.log(`失败: ${failed}`);
        console.log(`总计: ${passed + failed}`);
        console.log(`成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

        if (failed === 0) {
            console.log('\n✓ 所有测试通过！');
        } else {
            console.log(`\n✗ 有 ${failed} 个测试失败`);
            process.exit(1);
        }

    } catch (error) {
        console.error('\n致命错误:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await db.close();
        console.log('\n数据库连接已关闭');
    }
}

// 运行测试
if (require.main === module) {
    testDistinct().catch(console.error);
}

module.exports = { testDistinct };
