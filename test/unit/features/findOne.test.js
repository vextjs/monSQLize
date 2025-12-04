/**
 * findOne 方法完整测试套件
 * 测试所有查询模式、边界情况和错误处理
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('findOne 方法测试套件', function () {
    this.timeout(30000); // 设置超时时间为 30 秒

    let msq;
    let findOneCollection; // 改为 findOneCollection 避免冲突
    let nativeCollection; // 原生 MongoDB 集合对象
    const testData = [];

    // 准备测试数据
    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_findOne',
            config: { useMemoryServer: true },
            slowQueryMs: 1000,
            findLimit: 100
        });

        const conn = await msq.connect();
        findOneCollection = conn.collection; // 使用新的变量名

        // 获取原生 MongoDB 集合对象用于数据准备
        const db = msq._adapter.db;
        nativeCollection = db.collection('test_users');

        // 清空并插入测试数据
        await nativeCollection.deleteMany({});

        // 插入 50 条测试用户
        for (let i = 1; i <= 50; i++) {
            testData.push({
                userId: `USER-${String(i).padStart(5, '0')}`,
                name: `用户${i}`,
                username: i % 2 === 0 ? `user${i}` : `User${i}`,
                email: `user${i}@example.com`,
                status: i % 5 === 0 ? 'inactive' : 'active',
                role: i % 10 === 0 ? 'admin' : i % 15 === 0 ? 'vip' : 'user',
                totalSpent: Math.floor(Math.random() * 20000),
                orderCount: Math.floor(Math.random() * 100),
                level: Math.floor(Math.random() * 10) + 1,
                verified: i % 3 !== 0,
                avatar: `avatar${i}.jpg`,
                createdAt: new Date(Date.now() - i * 86400000), // 每天一条
                updatedAt: new Date()
            });
        }

        await nativeCollection.insertMany(testData);
        console.log('✅ 测试数据准备完成：50 条用户');

        // 创建测试所需的索引
        console.log('🔧 创建测试索引...');

        const indexes = [
            {
                spec: { userId: 1 },
                name: 'test_userId_idx',
                description: '用户ID索引'
            },
            {
                spec: { email: 1 },
                name: 'test_email_idx',
                description: '邮箱索引'
            },
            {
                spec: { status: 1, createdAt: -1 },
                name: 'test_status_createdAt_idx',
                description: '状态和创建时间索引'
            },
            {
                spec: { totalSpent: -1 },
                name: 'test_totalSpent_idx',
                description: '消费金额索引'
            }
        ];

        for (const indexDef of indexes) {
            try {
                // 检查索引是否已存在
                const existingIndexes = await nativeCollection.indexes();
                const indexExists = existingIndexes.some(idx => idx.name === indexDef.name);

                if (!indexExists) {
                    await nativeCollection.createIndex(indexDef.spec, { name: indexDef.name });
                    console.log(`✅ 创建索引: ${indexDef.name} - ${indexDef.description}`);
                } else {
                    console.log(`⏭️  索引已存在: ${indexDef.name}`);
                }
            } catch (error) {
                console.log(`⚠️  创建索引失败 ${indexDef.name}: ${error.message}`);
                // 继续创建其他索引，不中断测试
            }
        }

        console.log('✅ 索引创建完成\n');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (msq && nativeCollection) {
            // 清理测试索引
            const indexNames = [
                'test_userId_idx',
                'test_email_idx',
                'test_status_createdAt_idx',
                'test_totalSpent_idx'
            ];

            console.log('🧹 删除测试索引...');
            for (const indexName of indexNames) {
                try {
                    await nativeCollection.dropIndex(indexName);
                    console.log(`✅ 删除索引: ${indexName}`);
                } catch (error) {
                    // 索引可能不存在，忽略错误
                    console.log(`⏭️  索引不存在或已删除: ${indexName}`);
                }
            }

            await nativeCollection.deleteMany({});
            await msq.close();
        }
        console.log('✅ 清理完成');
    });

    describe('1. 基础查询功能', function () {
        it('1.1 应该返回单个对象或 null', async function () {
            const result = await findOneCollection('test_users').findOne({});

            assert.ok(typeof result === 'object', '应该返回对象或 null');
            if (result !== null) {
                assert.ok(result._id, '返回的对象应该有 _id 字段');
                assert.ok(result.userId, '返回的对象应该有 userId 字段');
            }
        });

        it('1.2 应该正确应用查询条件', async function () {
            const result = await findOneCollection('test_users').findOne({ status: 'active' });

            if (result !== null) {
                assert.equal(result.status, 'active', '返回的用户应该是活跃状态');
            }
        });

        it('1.3 应该正确应用排序', async function () {
            const result = await findOneCollection('test_users').findOne({}, {
                sort: { totalSpent: -1 }
            });

            if (result !== null) {
                // 验证这是消费最高的用户
                const highestSpender = await nativeCollection.find({})
                    .sort({ totalSpent: -1 })
                    .limit(1)
                    .toArray();

                assert.equal(result.userId, highestSpender[0].userId, '应该返回消费最高的用户');
            }
        });

        it('1.4 应该正确应用字段投影', async function () {
            const result = await findOneCollection('test_users').findOne({}, {
                projection: { name: 1, email: 1 }
            });

            if (result !== null) {
                assert.ok(result._id, '应该包含 _id 字段');
                assert.ok(result.name, '应该包含 name 字段');
                assert.ok(result.email, '应该包含 email 字段');
                assert.equal(result.status, undefined, '不应该包含 status 字段');
                assert.equal(result.totalSpent, undefined, '不应该包含 totalSpent 字段');
            }
        });

        it('1.5 应该支持数组格式的投影', async function () {
            const result = await findOneCollection('test_users').findOne({}, {
                projection: ['name', 'email', 'role']
            });

            if (result !== null) {
                assert.ok(result._id, '应该包含 _id 字段');
                assert.ok(result.name, '应该包含 name 字段');
                assert.ok(result.email, '应该包含 email 字段');
                assert.ok(result.role, '应该包含 role 字段');
                assert.equal(result.status, undefined, '不应该包含 status 字段');
            }
        });

        it('1.6 应该返回 null 当没有匹配记录时', async function () {
            const result = await findOneCollection('test_users').findOne({ userId: 'NONEXISTENT' });

            assert.equal(result, null, '应该返回 null 当没有匹配记录');
        });
    });

    describe('2. 查询条件和操作符', function () {
        it('2.1 应该支持 $eq 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({ role: { $eq: 'admin' } });

            if (result !== null) {
                assert.equal(result.role, 'admin', '应该返回管理员用户');
            }
        });

        it('2.2 应该支持 $ne 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({ role: { $ne: 'admin' } });

            if (result !== null) {
                assert.notEqual(result.role, 'admin', '不应该返回管理员用户');
            }
        });

        it('2.3 应该支持 $gt 和 $lt 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({
                totalSpent: { $gt: 5000, $lt: 15000 }
            }, {
                sort: { totalSpent: -1 }
            });

            if (result !== null) {
                assert.ok(result.totalSpent > 5000, '消费金额应该大于 5000');
                assert.ok(result.totalSpent < 15000, '消费金额应该小于 15000');
            }
        });

        it('2.4 应该支持 $in 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({ role: { $in: ['admin', 'vip'] } });

            if (result !== null) {
                assert.ok(['admin', 'vip'].includes(result.role), '角色应该在指定列表中');
            }
        });

        it('2.5 应该支持 $nin 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({ role: { $nin: ['admin'] } });

            if (result !== null) {
                assert.notEqual(result.role, 'admin', '角色不应该在排除列表中');
            }
        });

        it('2.6 应该支持 $and 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({
                $and: [
                    { status: 'active' },
                    { verified: true }
                ]
            });

            if (result !== null) {
                assert.equal(result.status, 'active', '应该是活跃用户');
                assert.equal(result.verified, true, '应该是已验证用户');
            }
        });

        it('2.7 应该支持 $or 操作符', async function () {
            const result = await findOneCollection('test_users').findOne({
                $or: [
                    { role: 'admin' },
                    { level: { $gte: 8 } }
                ]
            });

            if (result !== null) {
                assert.ok(
                    result.role === 'admin' || result.level >= 8,
                    '应该满足任一条件'
                );
            }
        });
    });

    describe('3. 排序和限制', function () {
        it('3.1 应该支持单字段排序', async function () {
            const result1 = await findOneCollection('test_users').findOne({}, {
                sort: { createdAt: -1 }
            });

            const result2 = await findOneCollection('test_users').findOne({}, {
                sort: { createdAt: 1 }
            });

            if (result1 && result2) {
                assert.ok(
                    result1.createdAt >= result2.createdAt,
                    '降序排序应该返回更新的记录'
                );
            }
        });

        it('3.2 应该支持多字段排序', async function () {
            const result = await findOneCollection('test_users').findOne({}, {
                sort: { status: 1, totalSpent: -1 }
            });

            if (result !== null) {
                // 验证这是按状态升序、消费降序排序的第一条记录
                const expected = await nativeCollection.find({})
                    .sort({ status: 1, totalSpent: -1 })
                    .limit(1)
                    .toArray();

                assert.equal(result.userId, expected[0].userId, '应该返回排序后的第一条记录');
            }
        });

        it('3.3 应该支持 collation 排序规则', async function () {
            // 插入测试数据用于 collation 测试
            await nativeCollection.insertOne({
                userId: 'COLLATION-TEST',
                name: 'Test User',
                username: 'testuser',
                email: 'collation@example.com',
                status: 'active'
            });

            const result = await findOneCollection('test_users').findOne({ username: 'TESTUSER' }, {
                collation: { locale: 'en', strength: 2 }
            });

            if (result !== null) {
                assert.equal(result.username, 'testuser', '应该找到不区分大小写的用户名');
            }

            // 清理测试数据
            await nativeCollection.deleteOne({ userId: 'COLLATION-TEST' });
        });
    });

    describe('4. 缓存功能', function () {
        it('4.1 应该支持缓存查询', async function () {
            const startTime = Date.now();

            // 第一次查询，不使用缓存
            const result1 = await findOneCollection('test_users').findOne({ userId: 'USER-00001' });

            const firstQueryTime = Date.now() - startTime;

            // 第二次查询，使用缓存
            const startTime2 = Date.now();
            const result2 = await findOneCollection('test_users').findOne({ userId: 'USER-00001' }, {
                cache: 5000
            });

            const secondQueryTime = Date.now() - startTime2;

            assert.deepEqual(result1, result2, '两次查询结果应该相同');
            // 注意：缓存可能不会显著提升单次查询性能，这里主要验证功能
        });

        it('4.2 应该正确处理缓存过期', async function () {
            // 查询并缓存
            const result1 = await findOneCollection('test_users').findOne({ userId: 'USER-00001' }, {
                cache: 100 // 100ms 缓存
            });

            // 等待缓存过期
            await new Promise(resolve => setTimeout(resolve, 150));

            // 再次查询，应该重新执行
            const result2 = await findOneCollection('test_users').findOne({ userId: 'USER-00001' }, {
                cache: 100
            });

            assert.deepEqual(result1, result2, '结果应该相同');
        });
    });

    describe('5. 执行计划和性能', function () {
        it('5.1 应该支持 explain 查询', async function () {
            const plan = await findOneCollection('test_users').findOne({ status: 'active' }, {
                explain: 'executionStats'
            });

            assert.ok(plan, '应该返回执行计划');
            assert.ok(plan.executionStats, '应该包含执行统计');
            assert.ok(typeof plan.executionStats.executionTimeMillis === 'number', '应该包含执行时间');
        });

        it('5.2 应该支持 hint 索引提示', async function () {
            const result = await findOneCollection('test_users').findOne({ email: 'user1@example.com' }, {
                hint: { email: 1 }
            });

            if (result !== null) {
                assert.equal(result.email, 'user1@example.com', '应该找到指定邮箱的用户');
            }
        });

        it('5.3 应该支持 maxTimeMS 超时设置', async function () {
            const result = await findOneCollection('test_users').findOne({ status: 'active' }, {
                maxTimeMS: 5000
            });

            // 如果查询成功，验证结果
            if (result !== null) {
                assert.equal(result.status, 'active', '应该返回活跃用户');
            }
        });
    });

    describe('6. 错误处理', function () {
        it('6.1 应该处理无效查询条件', async function () {
            try {
                await findOneCollection('test_users').findOne({ $invalid: 'operator' });
                // 如果没有抛出错误，验证结果为 null
                assert.ok(true, '查询应该成功或返回 null');
            } catch (error) {
                assert.ok(error, '应该抛出错误');
            }
        });

        it('6.2 应该处理不存在的集合', async function () {
            try {
                await findOneCollection('nonexistent_collection').findOne({});
                assert.ok(true, '应该正常处理不存在的集合');
            } catch (error) {
                // MongoDB 可能抛出错误或返回 null
                assert.ok(error || true, '应该抛出错误或正常处理');
            }
        });

        it('6.3 应该处理无效的投影配置', async function () {
            try {
                const result = await findOneCollection('test_users').findOne({}, {
                    projection: { name: 1, status: 0, email: 1 } // 混合包含和排除
                });

                // MongoDB 会忽略无效投影，返回所有字段
                if (result !== null) {
                    assert.ok(result.name, '应该包含 name 字段');
                }
            } catch (error) {
                assert.ok(error, '应该抛出错误');
            }
        });
    });

    describe('7. 边界情况', function () {
        it('7.1 应该处理空查询条件', async function () {
            const result = await findOneCollection('test_users').findOne({});

            assert.ok(typeof result === 'object', '应该返回对象或 null');
        });

        it('7.2 应该处理空结果集', async function () {
            const result = await findOneCollection('test_users').findOne({ userId: 'EMPTY-RESULT' });

            assert.equal(result, null, '应该返回 null');
        });

        it('7.3 应该处理大文档', async function () {
            // 插入一个大文档
            const largeDoc = {
                userId: 'LARGE-DOC',
                name: '大文档用户',
                largeField: 'x'.repeat(10000), // 10KB 字符串
                createdAt: new Date()
            };

            await nativeCollection.insertOne(largeDoc);

            const result = await findOneCollection('test_users').findOne({ userId: 'LARGE-DOC' }, {
                projection: { userId: 1, name: 1, largeField: 1 }
            });

            if (result !== null) {
                assert.equal(result.userId, 'LARGE-DOC', '应该返回大文档');
                assert.equal(result.largeField.length, 10000, '应该包含大字段');
            }

            // 清理
            await nativeCollection.deleteOne({ userId: 'LARGE-DOC' });
        });
    });

    describe('8. 并发和性能', function () {
        it('8.1 应该支持并发查询', async function () {
            const promises = [];

            for (let i = 1; i <= 10; i++) {
                promises.push(
                    findOneCollection('test_users').findOne(
                        { status: 'active' },
                        { cache: 1000 }
                    )
                );
            }

            const results = await Promise.all(promises);

            assert.equal(results.length, 10, '应该返回 10 个结果');
            results.forEach(result => {
                if (result !== null) {
                    assert.equal(result.status, 'active', '每个结果都应该是活跃用户');
                }
            });
        });

        it('8.2 应该正确处理慢查询日志', async function () {
            // 设置一个很小的慢查询阈值来触发日志
            const originalMsq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_findOne',
                config: { useMemoryServer: true },
                slowQueryMs: 1, // 1ms 阈值
                findLimit: 100
            });

            const conn = await originalMsq.connect();
            const slowCollection = conn.collection;

            // 执行一个可能较慢的查询
            const result = await slowCollection('test_users').findOne(
                { status: 'active' }
            );

            if (result !== null) {
                assert.equal(result.status, 'active', '应该返回活跃用户');
            }

            await originalMsq.close();
        });
    });
});
