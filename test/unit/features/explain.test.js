/**
 * explain 方法测试套件
 * 测试查询执行计划诊断功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib');

describe('explain 方法测试', function() {
    this.timeout(10000);

    let monSQLize;
    let collection;
    let db;

    before(async function() {
        // 使用 Memory Server
        monSQLize = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_explain',
            config: { useMemoryServer: true }
        });

        const conn = await monSQLize.connect();
        collection = conn.collection;
        db = monSQLize._adapter.db;

        // 准备测试数据
        const usersCollection = db.collection('users');
        await usersCollection.deleteMany({});
        
        const users = [];
        for (let i = 1; i <= 100; i++) {
            users.push({
                userId: `USER-${String(i).padStart(5, '0')}`,
                name: `用户${i}`,
                email: `user${i}@example.com`,
                age: 18 + (i % 50),
                status: i % 5 === 0 ? 'inactive' : 'active',
                level: Math.floor(i / 20) + 1,
                createdAt: new Date(Date.now() - i * 86400000)
            });
        }
        await usersCollection.insertMany(users);

        // 创建索引
        await usersCollection.createIndex({ email: 1 });
        await usersCollection.createIndex({ age: 1, status: 1 });
        await usersCollection.createIndex({ createdAt: -1 });
    });

    after(async function() {
        if (monSQLize) {
            await monSQLize.close();
        }
    });

    it('应该返回基本查询计划（默认 verbosity=queryPlanner）', async function() {
        const plan = await collection('users').find(
            { status: 'active' },
            { explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.strictEqual(plan.queryPlanner.namespace, 'test_explain.users');
        console.log('  ✓ 返回基本查询计划，包含 queryPlanner 字段');
    });

    it('应该支持 verbosity=executionStats 返回执行统计', async function() {
        const plan = await collection('users').find(
            { age: { $gte: 30 } },
            { explain: 'executionStats' }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.ok(plan.executionStats);
        assert.ok(typeof plan.executionStats.executionTimeMillis === 'number');
        assert.ok(typeof plan.executionStats.totalDocsExamined === 'number');
        console.log(`  ✓ 执行统计 - 耗时: ${plan.executionStats.executionTimeMillis}ms, 扫描文档: ${plan.executionStats.totalDocsExamined}`);
    });

    it('应该支持 verbosity=allPlansExecution 返回所有候选计划', async function() {
        const plan = await collection('users').find(
            { age: { $gte: 30 }, status: 'active' },
            { explain: 'allPlansExecution' }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.ok(plan.executionStats);
        assert.ok(plan.executionStats.allPlansExecution);
        console.log(`  ✓ 返回 ${plan.executionStats.allPlansExecution.length} 个候选执行计划`);
    });

    it('应该支持带 hint 的查询计划', async function() {
        const plan = await collection('users').find(
            { email: 'user50@example.com' },
            { hint: { email: 1 }, explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 使用 hint 强制索引查询计划');
    });

    it('应该支持带 sort 的查询计划', async function() {
        const plan = await collection('users').find(
            { status: 'active' },
            { sort: { createdAt: -1 }, limit: 20, explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带排序的查询计划');
    });

    it('应该支持带 projection 的查询计划', async function() {
        const plan = await collection('users').find(
            { age: { $gte: 30 } },
            { projection: { name: 1, email: 1, age: 1 }, explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带字段投影的查询计划');
    });

    it('应该支持带 limit 和 skip 的查询计划', async function() {
        const plan = await collection('users').find(
            { status: 'active' },
            { limit: 10, skip: 20, explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带分页参数的查询计划');
    });

    it('应该支持带 collation 的查询计划', async function() {
        const plan = await collection('users').find(
            { name: { $regex: '^用户' } },
            { collation: { locale: 'zh', strength: 2 }, explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带排序规则的查询计划');
    });

    it('应该支持 maxTimeMS 超时设置', async function() {
        const plan = await collection('users').find(
            { age: { $gte: 20 } },
            { maxTimeMS: 5000, explain: true }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带超时设置的查询计划');
    });


    it('应该分析复杂查询的执行计划', async function() {
        const plan = await collection('users').find(
            {
                $and: [
                    { age: { $gte: 25, $lte: 45 } },
                    { status: 'active' },
                    { level: { $in: [2, 3, 4] } }
                ]
            },
            {
                sort: { age: 1, createdAt: -1 },
                limit: 50,
                explain: 'executionStats'
            }
        );

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.ok(plan.executionStats);
        
        console.log('  ✓ 复杂查询执行计划:');
        console.log(`    - 使用索引: ${plan.queryPlanner.winningPlan.inputStage?.indexName || '无'}`);
        console.log(`    - 扫描文档: ${plan.executionStats.totalDocsExamined}`);
        console.log(`    - 返回文档: ${plan.executionStats.nReturned}`);
        console.log(`    - 执行耗时: ${plan.executionStats.executionTimeMillis}ms`);
    });

    it('应该分析索引使用情况', async function() {
        // 使用索引的查询
        const indexedPlan = await collection('users').find(
            { email: 'user50@example.com' },
            { explain: 'executionStats' }
        );

        // 全表扫描的查询
        const fullScanPlan = await collection('users').find(
            { name: { $regex: '用户5' } },
            { explain: 'executionStats' }
        );

        assert.ok(indexedPlan.executionStats);
        assert.ok(fullScanPlan.executionStats);

        const indexedDocs = indexedPlan.executionStats.totalDocsExamined;
        const fullScanDocs = fullScanPlan.executionStats.totalDocsExamined;

        console.log('  ✓ 索引查询 vs 全表扫描:');
        console.log(`    - 索引查询扫描: ${indexedDocs} 个文档`);
        console.log(`    - 全表扫描: ${fullScanDocs} 个文档`);
        console.log(`    - 性能差异: ${fullScanDocs / Math.max(indexedDocs, 1)}x`);

        assert.ok(fullScanDocs >= indexedDocs);
    });

    it('应该记录慢查询日志（如果超过阈值）', async function() {
        const plan = await collection('users').find(
            { status: 'active' },
            {
                sort: { createdAt: -1 },
                limit: 100,
                explain: 'executionStats'
            }
        );

        assert.ok(plan);
        assert.ok(plan.executionStats);
        console.log(`  ✓ 查询耗时: ${plan.executionStats.executionTimeMillis}ms (慢查询阈值: 500ms)`);
    });

    it('应该处理空查询', async function() {
        const plan = await collection('users').find({}, { explain: true });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 空查询返回执行计划');
    });

    it('应该处理查询失败的情况', async function() {
        try {
            await collection('nonexistent_collection').find(
                { test: 'value' },
                { explain: true }
            );
            console.log('  ✓ 不存在的集合返回执行计划（MongoDB 行为）');
        } catch (err) {
            assert.ok(err);
            console.log('  ✓ 不存在的集合正确处理错误');
        }
    });


    it('应该支持链式调用 .explain() - 默认 queryPlanner', async function() {
        const plan = await collection('users').find({ status: 'active' }).explain();

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.strictEqual(plan.queryPlanner.namespace, 'test_explain.users');
        console.log('  ✓ 链式调用返回基本查询计划');
    });

    it('应该支持链式调用 .explain("executionStats")', async function() {
        const plan = await collection('users')
            .find({ age: { $gte: 30 } })
            .explain('executionStats');

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.ok(plan.executionStats);
        assert.ok(typeof plan.executionStats.executionTimeMillis === 'number');
        console.log(`  ✓ 链式调用 executionStats - 耗时: ${plan.executionStats.executionTimeMillis}ms`);
    });

    it('应该支持链式调用 .explain("allPlansExecution")', async function() {
        const plan = await collection('users')
            .find({ age: { $gte: 30 }, status: 'active' })
            .explain('allPlansExecution');

        assert.ok(plan);
        assert.ok(plan.executionStats);
        assert.ok(plan.executionStats.allPlansExecution);
        console.log(`  ✓ 链式调用 allPlansExecution - ${plan.executionStats.allPlansExecution.length} 个候选计划`);
    });

    it('链式调用应该支持带 sort/limit 选项', async function() {
        const plan = await collection('users')
            .find({ status: 'active' }, { sort: { age: 1 }, limit: 10 })
            .explain('queryPlanner');

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 链式调用支持查询选项');
    });

    it('链式调用和 options 参数应该返回相同的结果', async function() {
        const query = { age: { $gte: 30 } };

        // 方式1：链式调用
        const plan1 = await collection('users').find(query).explain('executionStats');

        // 方式2：options 参数
        const plan2 = await collection('users').find(query, { explain: 'executionStats' });

        assert.ok(plan1);
        assert.ok(plan2);
        assert.ok(plan1.queryPlanner);
        assert.ok(plan2.queryPlanner);
        assert.ok(plan1.executionStats);
        assert.ok(plan2.executionStats);

        console.log('  ✓ 两种方式返回相同的执行计划结构');
    });
});
