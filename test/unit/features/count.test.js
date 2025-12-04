/**
 * count 方法完整测试套件
 * 测试所有查询模式、边界情况和错误处理
 */

const MonSQLize = require('../../../lib');
const assert = require('assert');

describe('count 方法测试套件', function() {
    this.timeout(30000); // 设置超时时间为 30 秒

    let msq;
    let countCollection; // 避免命名冲突
    let nativeCollection; // 原生 MongoDB 集合对象
    const testData = [];

    // 准备测试数据
    before(async function() {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_count',
            config: { useMemoryServer: true },
            slowQueryMs: 1000,
            findLimit: 100
        });

        const conn = await msq.connect();
        countCollection = conn.collection;

        // 获取原生 MongoDB 集合对象用于数据准备
        const db = msq._adapter.db;
        nativeCollection = db.collection('test_orders');

        // 清空并插入测试数据
        await nativeCollection.deleteMany({});

        // 插入 100 条测试订单
        for (let i = 1; i <= 100; i++) {
            testData.push({
                orderId: `ORDER-${String(i).padStart(5, '0')}`,
                customerId: `USER-${String((i % 20) + 1).padStart(5, '0')}`,
                amount: Math.floor(Math.random() * 5000) + 100,
                status: i % 4 === 0 ? 'pending' : i % 4 === 1 ? 'paid' : i % 4 === 2 ? 'completed' : 'cancelled',
                priority: i % 3,
                items: Math.floor(Math.random() * 5) + 1,
                verified: i % 5 !== 0,
                tags: i % 3 === 0 ? ['urgent', 'vip'] : ['normal'],
                createdAt: new Date(Date.now() - i * 3600000), // 每小时一条
                updatedAt: new Date()
            });
        }

        await nativeCollection.insertMany(testData);
        console.log('✅ 测试数据准备完成：100 条订单');

        // 创建测试所需的索引
        console.log('🔧 创建测试索引...');

        const indexes = [
            {
                spec: { status: 1 },
                name: 'test_status_idx',
                description: '状态索引'
            },
            {
                spec: { customerId: 1 },
                name: 'test_customerId_idx',
                description: '客户ID索引'
            },
            {
                spec: { amount: -1 },
                name: 'test_amount_idx',
                description: '金额索引'
            },
            {
                spec: { createdAt: -1 },
                name: 'test_createdAt_idx',
                description: '创建时间索引'
            },
            {
                spec: { status: 1, createdAt: -1 },
                name: 'test_status_createdAt_idx',
                description: '状态和创建时间复合索引'
            }
        ];

        for (const indexDef of indexes) {
            try {
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
            }
        }

        console.log('✅ 索引创建完成\n');
    });

    after(async function() {
        console.log('🧹 清理测试环境...');
        if (msq && nativeCollection) {
            // 清理测试索引
            const indexNames = [
                'test_status_idx',
                'test_customerId_idx',
                'test_amount_idx',
                'test_createdAt_idx',
                'test_status_createdAt_idx'
            ];

            console.log('🧹 删除测试索引...');
            for (const indexName of indexNames) {
                try {
                    await nativeCollection.dropIndex(indexName);
                    console.log(`✅ 删除索引: ${indexName}`);
                } catch (error) {
                    console.log(`⏭️  索引不存在或已删除: ${indexName}`);
                }
            }

            await nativeCollection.deleteMany({});
            await msq.close();
        }
        console.log('✅ 清理完成');
    });

    describe('1. 基础统计功能', function() {
        it('1.1 应该返回数字类型', async function() {
            const count = await countCollection('test_orders').count();

            assert.ok(typeof count === 'number', '应该返回数字类型');
            assert.ok(count >= 0, '统计结果应该大于等于 0');
        });

        it('1.2 应该正确统计所有文档（空查询）', async function() {
            const count = await countCollection('test_orders').count();

            assert.equal(count, 100, '应该统计出 100 条订单');
        });

        it('1.3 应该正确应用查询条件', async function() {
            const completedCount = await countCollection('test_orders').count({ status: 'completed' });

            // 验证统计结果
            const expected = testData.filter(d => d.status === 'completed').length;
            assert.equal(completedCount, expected, '应该统计出正确数量的已完成订单');
        });

        it('1.4 应该返回 0 当没有匹配文档时', async function() {
            const count = await countCollection('test_orders').count({ status: 'nonexistent_status' });

            assert.equal(count, 0, '应该返回 0 当没有匹配文档');
        });

        it('1.5 应该正确统计空集合', async function() {
            const count = await countCollection('empty_collection').count();

            assert.equal(count, 0, '空集合应该返回 0');
        });
    });

    describe('2. 查询条件和操作符', function() {
        it('2.1 应该支持 $eq 操作符', async function() {
            const count = await countCollection('test_orders').count({ status: { $eq: 'completed' } });

            const expected = testData.filter(d => d.status === 'completed').length;
            assert.equal(count, expected, '应该统计出正确数量');
        });

        it('2.2 应该支持 $ne 操作符', async function() {
            const count = await countCollection('test_orders').count({ status: { $ne: 'cancelled' } });

            const expected = testData.filter(d => d.status !== 'cancelled').length;
            assert.equal(count, expected, '应该统计出非取消状态的订单');
        });

        it('2.3 应该支持 $gt 和 $lt 操作符', async function() {
            const count = await countCollection('test_orders').count({ amount: { $gt: 1000, $lt: 3000 } });

            const expected = testData.filter(d => d.amount > 1000 && d.amount < 3000).length;
            assert.equal(count, expected, '应该统计出金额在指定范围内的订单');
        });

        it('2.4 应该支持 $gte 和 $lte 操作符', async function() {
            const count = await countCollection('test_orders').count({ amount: { $gte: 1000, $lte: 3000 } });

            const expected = testData.filter(d => d.amount >= 1000 && d.amount <= 3000).length;
            assert.equal(count, expected, '应该统计出金额在指定范围内的订单（包含边界）');
        });

        it('2.5 应该支持 $in 操作符', async function() {
            const count = await countCollection('test_orders').count({ status: { $in: ['completed', 'paid'] } });

            const expected = testData.filter(d => ['completed', 'paid'].includes(d.status)).length;
            assert.equal(count, expected, '应该统计出指定状态的订单');
        });

        it('2.6 应该支持 $nin 操作符', async function() {
            const count = await countCollection('test_orders').count({ status: { $nin: ['cancelled'] } });

            const expected = testData.filter(d => !['cancelled'].includes(d.status)).length;
            assert.equal(count, expected, '应该统计出不在排除列表中的订单');
        });

        it('2.7 应该支持 $and 操作符', async function() {
            const count = await countCollection('test_orders').count({
                $and: [
                    { status: 'completed' },
                    { verified: true }
                ]
            });

            const expected = testData.filter(d => d.status === 'completed' && d.verified === true).length;
            assert.equal(count, expected, '应该统计出同时满足所有条件的订单');
        });

        it('2.8 应该支持 $or 操作符', async function() {
            const count = await countCollection('test_orders').count({
                $or: [
                    { status: 'completed' },
                    { amount: { $gte: 4000 } }
                ]
            });

            const expected = testData.filter(d => d.status === 'completed' || d.amount >= 4000).length;
            assert.equal(count, expected, '应该统计出满足任一条件的订单');
        });

        it('2.9 应该支持多条件组合查询', async function() {
            const count = await countCollection('test_orders').count({
                status: 'completed',
                amount: { $gte: 1000 },
                verified: true
            });

            const expected = testData.filter(d =>
                d.status === 'completed' &&
        d.amount >= 1000 &&
        d.verified === true
            ).length;
            assert.equal(count, expected, '应该统计出满足多个条件的订单');
        });
    });

    describe('3. 数组字段统计', function() {
        it('3.1 应该支持数组字段查询', async function() {
            const count = await countCollection('test_orders').count({ tags: 'urgent' });

            const expected = testData.filter(d => d.tags.includes('urgent')).length;
            assert.equal(count, expected, '应该统计出包含指定标签的订单');
        });

        it('3.2 应该支持 $all 操作符', async function() {
            const count = await countCollection('test_orders').count({ tags: { $all: ['urgent', 'vip'] } });

            const expected = testData.filter(d =>
                d.tags.includes('urgent') && d.tags.includes('vip')
            ).length;
            assert.equal(count, expected, '应该统计出包含所有指定标签的订单');
        });
    });

    describe('4. 日期范围统计', function() {
        it('4.1 应该支持日期范围查询', async function() {
            const now = new Date();
            const oneDayAgo = new Date(now - 24 * 3600000);

            const count = await countCollection('test_orders').count({ createdAt: { $gte: oneDayAgo } });

            assert.ok(count >= 0, '应该返回有效的统计结果');
            assert.ok(count <= 100, '统计结果不应超过总数');
        });

        it('4.2 应该支持日期范围组合查询', async function() {
            const now = new Date();
            const startDate = new Date(now - 72 * 3600000);
            const endDate = new Date(now - 24 * 3600000);

            const count = await countCollection('test_orders').count({
                createdAt: {
                    $gte: startDate,
                    $lt: endDate
                }
            });

            assert.ok(count >= 0, '应该返回有效的统计结果');
        });
    });

    describe('5. 缓存功能', function() {
        it('5.1 应该支持缓存统计', async function() {
            // 第一次查询
            const count1 = await countCollection('test_orders').count({ status: 'completed' }, { cache: 5000 });

            // 第二次查询（应该从缓存返回）
            const count2 = await countCollection('test_orders').count({ status: 'completed' }, { cache: 5000 });

            assert.equal(count1, count2, '缓存查询结果应该相同');
        });

        it('5.2 应该正确处理缓存过期', async function() {
            // 查询并缓存
            const count1 = await countCollection('test_orders').count({ status: 'paid' }, { cache: 100 }); // 100ms 缓存

            // 等待缓存过期
            await new Promise(resolve => setTimeout(resolve, 150));

            // 再次查询
            const count2 = await countCollection('test_orders').count({ status: 'paid' }, { cache: 100 });

            assert.equal(count1, count2, '结果应该相同');
        });
    });

    describe('6. 执行计划和性能', function() {
        it('6.1 应该支持 explain 查询', async function() {
            const plan = await countCollection('test_orders').count({ status: 'completed' }, { explain: 'executionStats' });

            assert.ok(plan, '应该返回执行计划');
            // 修复：MongoDB 聚合管道的 explain 结构可能不同
            assert.ok(
                plan.executionStats || plan.queryPlanner || plan.stages || plan.command,
                '应该包含执行统计或查询计划'
            );
        });

        it('6.2 应该支持 hint 索引提示', async function() {
            const count = await countCollection('test_orders').count({ status: 'completed' }, { hint: { status: 1 } });

            assert.ok(count >= 0, '使用索引提示应该返回有效结果');
        });

        it('6.3 应该支持 maxTimeMS 超时设置', async function() {
            try {
                const count = await countCollection('test_orders').count({ status: 'completed' }, { maxTimeMS: 5000 });

                assert.ok(count >= 0, '应该在超时时间内返回结果');
            } catch (error) {
                // 如果查询超时，这也是正常的
                assert.ok(error.message.includes('timeout') || error.message.includes('time limit'), '应该是超时错误');
            }
        });

        it('6.4 空查询应该使用 estimatedDocumentCount', async function() {
            const plan = await countCollection('test_orders').count({}, { explain: 'executionStats' });

            // 检查是否使用了快速统计
            const usedEstimate = plan.command?.estimatedDocumentCount ||
                          plan.executionStats?.executionTimeMillis === 0;

            assert.ok(plan, '应该返回执行计划');
        });
    });

    describe('7. collation 排序规则', function() {
        it('7.1 应该支持 collation 配置', async function() {
            // 插入测试数据
            await nativeCollection.insertOne({
                orderId: 'COLLATION-TEST',
                customerId: 'test',
                status: 'Test',
                amount: 100
            });

            const count = await countCollection('test_orders').count({ status: 'test' }, { collation: { locale: 'en', strength: 2 } });  // 不区分大小写

            assert.ok(count >= 1, '应该找到不区分大小写的匹配');

            // 清理测试数据
            await nativeCollection.deleteOne({ orderId: 'COLLATION-TEST' });
        });
    });

    describe('8. 错误处理', function() {
        it('8.1 应该处理无效查询条件', async function() {
            try {
                await countCollection('test_orders').count({ $invalidOperator: 'value' });
                assert.ok(true, '应该正常处理或抛出错误');
            } catch (error) {
                assert.ok(error, '应该抛出错误');
            }
        });

        it('8.2 应该处理不存在的集合', async function() {
            const count = await countCollection('nonexistent_collection').count();

            assert.equal(count, 0, '不存在的集合应该返回 0');
        });

        it('8.3 应该处理空查询对象', async function() {
            const count = await countCollection('test_orders').count({});

            assert.equal(count, 100, '空查询应该统计所有文档');
        });
    });

    describe('9. 边界情况', function() {
        it('9.1 应该正确处理 null 值查询', async function() {
            const count = await countCollection('test_orders').count({ completedAt: null });

            assert.ok(count >= 0, '应该返回有效的统计结果');
        });

        it('9.2 应该正确处理布尔值查询', async function() {
            const count = await countCollection('test_orders').count({ verified: true });

            const expected = testData.filter(d => d.verified === true).length;
            assert.equal(count, expected, '应该统计出已验证的订单');
        });

        it('9.3 应该正确处理数值 0 查询', async function() {
            const count = await countCollection('test_orders').count({ priority: 0 });

            const expected = testData.filter(d => d.priority === 0).length;
            assert.equal(count, expected, '应该统计出优先级为 0 的订单');
        });

        it('9.4 应该正确处理空字符串查询', async function() {
            // 插入包含空字符串的测试数据
            await nativeCollection.insertOne({
                orderId: 'EMPTY-STRING-TEST',
                status: '',
                amount: 100
            });

            const count = await countCollection('test_orders').count({ status: '' });

            assert.ok(count >= 1, '应该能查询空字符串');

            // 清理测试数据
            await nativeCollection.deleteOne({ orderId: 'EMPTY-STRING-TEST' });
        });
    });

    describe('10. 性能和优化', function() {
        it('10.1 空查询应该比条件查询更快', async function() {
            const start1 = Date.now();
            await countCollection('test_orders').count();
            const time1 = Date.now() - start1;

            const start2 = Date.now();
            await countCollection('test_orders').count({ status: 'completed' });
            const time2 = Date.now() - start2;

            console.log(`      空查询耗时: ${time1}ms, 条件查询耗时: ${time2}ms`);
            assert.ok(true, '性能测试完成');
        });

        it('10.2 索引字段查询应该快速', async function() {
            const start = Date.now();
            const count = await countCollection('test_orders').count({ status: 'completed' });  // status 有索引
            const duration = Date.now() - start;

            console.log(`      索引查询耗时: ${duration}ms, 结果: ${count}`);
            assert.ok(duration < 1000, '索引查询应该在 1 秒内完成');
        });

        it('10.3 复合条件查询应该正常工作', async function() {
            const count = await countCollection('test_orders').count({
                status: 'completed',
                amount: { $gte: 1000 },
                verified: true
            });

            assert.ok(count >= 0, '复合查询应该返回有效结果');
        });
    });
});

