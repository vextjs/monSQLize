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
        const plan = await collection('users').explain({
            query: { status: 'active' }
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.strictEqual(plan.queryPlanner.namespace, 'test_explain.users');
        console.log('  ✓ 返回基本查询计划，包含 queryPlanner 字段');
    });

    it('应该支持 verbosity=executionStats 返回执行统计', async function() {
        const plan = await collection('users').explain({
            query: { age: { $gte: 30 } },
            verbosity: 'executionStats'
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.ok(plan.executionStats);
        assert.ok(typeof plan.executionStats.executionTimeMillis === 'number');
        assert.ok(typeof plan.executionStats.totalDocsExamined === 'number');
        console.log(`  ✓ 执行统计 - 耗时: ${plan.executionStats.executionTimeMillis}ms, 扫描文档: ${plan.executionStats.totalDocsExamined}`);
    });

    it('应该支持 verbosity=allPlansExecution 返回所有候选计划', async function() {
        const plan = await collection('users').explain({
            query: { age: { $gte: 30 }, status: 'active' },
            verbosity: 'allPlansExecution'
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        assert.ok(plan.executionStats);
        assert.ok(plan.executionStats.allPlansExecution);
        console.log(`  ✓ 返回 ${plan.executionStats.allPlansExecution.length} 个候选执行计划`);
    });

    it('应该支持带 hint 的查询计划', async function() {
        const plan = await collection('users').explain({
            query: { email: 'user50@example.com' },
            hint: { email: 1 }
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        // 验证使用了指定的索引
        const winningPlan = plan.queryPlanner.winningPlan;
        if (winningPlan.inputStage) {
            assert.ok(winningPlan.inputStage.indexName === 'email_1' || 
                     winningPlan.inputStage.stage === 'IXSCAN');
        }
        console.log('  ✓ 使用 hint 强制索引查询计划');
    });

    it('应该支持带 sort 的查询计划', async function() {
        const plan = await collection('users').explain({
            query: { status: 'active' },
            sort: { createdAt: -1 },
            limit: 20
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带排序的查询计划');
    });

    it('应该支持带 projection 的查询计划', async function() {
        const plan = await collection('users').explain({
            query: { age: { $gte: 30 } },
            projection: { name: 1, email: 1, age: 1 }
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带字段投影的查询计划');
    });

    it('应该支持带 limit 和 skip 的查询计划', async function() {
        const plan = await collection('users').explain({
            query: { status: 'active' },
            limit: 10,
            skip: 20
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带分页参数的查询计划');
    });

    it('应该支持带 collation 的查询计划', async function() {
        const plan = await collection('users').explain({
            query: { name: { $regex: '^用户' } },
            collation: { locale: 'zh', strength: 2 }
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带排序规则的查询计划');
    });

    it('应该支持 maxTimeMS 超时设置', async function() {
        const plan = await collection('users').explain({
            query: { age: { $gte: 20 } },
            maxTimeMS: 5000
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 带超时设置的查询计划');
    });

    it('应该在无效 verbosity 时抛出错误', async function() {
        try {
            await collection('users').explain({
                query: { status: 'active' },
                verbosity: 'invalid'
            });
            assert.fail('应该抛出错误');
        } catch (err) {
            assert.strictEqual(err.code, 'INVALID_EXPLAIN_VERBOSITY');
            assert.ok(err.message.includes('Invalid verbosity'));
            console.log('  ✓ 无效 verbosity 正确抛出错误');
        }
    });

    it('应该分析复杂查询的执行计划', async function() {
        const plan = await collection('users').explain({
            query: {
                $and: [
                    { age: { $gte: 25, $lte: 45 } },
                    { status: 'active' },
                    { level: { $in: [2, 3, 4] } }
                ]
            },
            sort: { age: 1, createdAt: -1 },
            limit: 50,
            verbosity: 'executionStats'
        });

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
        const indexedPlan = await collection('users').explain({
            query: { email: 'user50@example.com' },
            verbosity: 'executionStats'
        });

        // 全表扫描的查询
        const fullScanPlan = await collection('users').explain({
            query: { name: { $regex: '用户5' } },
            verbosity: 'executionStats'
        });

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
        // 注意：在 Memory Server 环境下，查询通常很快，不太可能触发慢查询日志
        // 这个测试主要验证 explain 方法不会因为慢查询日志而报错
        
        const plan = await collection('users').explain({
            query: { status: 'active' },
            sort: { createdAt: -1 },
            limit: 100,
            verbosity: 'executionStats'
        });

        assert.ok(plan);
        assert.ok(plan.executionStats);
        console.log(`  ✓ 查询耗时: ${plan.executionStats.executionTimeMillis}ms (慢查询阈值: 500ms)`);
    });

    it('应该处理空查询', async function() {
        const plan = await collection('users').explain({
            query: {}
        });

        assert.ok(plan);
        assert.ok(plan.queryPlanner);
        console.log('  ✓ 空查询返回执行计划');
    });

    it('应该处理查询失败的情况', async function() {
        try {
            // 使用不存在的集合
            await collection('nonexistent_collection').explain({
                query: { test: 'value' }
            });
            // 注意：MongoDB 对不存在的集合也会返回执行计划，不会报错
            console.log('  ✓ 不存在的集合返回执行计划（MongoDB 行为）');
        } catch (err) {
            // 如果抛出错误，也是正常的
            assert.ok(err);
            console.log('  ✓ 不存在的集合正确处理错误');
        }
    });
});
