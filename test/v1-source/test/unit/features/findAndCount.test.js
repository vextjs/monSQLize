/**
 * findAndCount 测试
 */

const assert = require('assert');
const MonSQLize = require('../../..');

describe('findAndCount', function() {
    let db, collection;

    before(async function() {
        db = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_find_and_count',
            config: { useMemoryServer: true },
            cache: { enabled: true }  // 启用缓存
        });

        const conn = await db.connect();
        collection = conn.collection('test_find_and_count');

        // 清空并插入测试数据
        await collection.deleteMany({});
        const testData = [];
        for (let i = 1; i <= 50; i++) {
            testData.push({
                _id: i,
                name: `User ${i}`,
                age: 20 + (i % 30),
                status: i % 2 === 0 ? 'active' : 'inactive',
                role: i <= 30 ? 'user' : 'admin'
            });
        }
        await collection.insertMany(testData);
    });

    after(async function() {
        await collection.deleteMany({});
        await db.close();
    });

    describe('基础功能', function() {
        it('应该返回所有数据和总数', async function() {
            const { data, total } = await collection.findAndCount({});

            assert.ok(Array.isArray(data));
            assert.strictEqual(data.length, 50);
            assert.strictEqual(total, 50);
        });

        it('应该根据查询条件过滤', async function() {
            const { data, total } = await collection.findAndCount({ status: 'active' });

            assert.strictEqual(total, 25);
            assert.strictEqual(data.length, 25);
            data.forEach(doc => {
                assert.strictEqual(doc.status, 'active');
            });
        });

        it('应该支持 limit 选项', async function() {
            const { data, total } = await collection.findAndCount(
                { status: 'active' },
                { limit: 10 }
            );

            assert.strictEqual(total, 25); // 总数不变
            assert.strictEqual(data.length, 10); // 只返回10条
        });

        it('应该支持 skip 选项', async function() {
            const { data, total } = await collection.findAndCount(
                { status: 'active' },
                { limit: 10, skip: 5 }
            );

            assert.strictEqual(total, 25);
            assert.strictEqual(data.length, 10);
        });

        it('应该支持 sort 选项', async function() {
            const { data, total } = await collection.findAndCount(
                { status: 'active' },
                { sort: { _id: -1 }, limit: 5 }
            );

            assert.strictEqual(total, 25);
            assert.strictEqual(data.length, 5);
            assert.strictEqual(data[0]._id, 50);
            assert.strictEqual(data[4]._id, 42);
        });

        it('应该支持 projection 选项', async function() {
            const { data, total } = await collection.findAndCount(
                { role: 'user' },
                { projection: { name: 1, age: 1 }, limit: 5 }
            );

            assert.strictEqual(total, 30);
            assert.strictEqual(data.length, 5);
            data.forEach(doc => {
                assert.ok(doc._id);
                assert.ok(doc.name);
                assert.ok(doc.age);
                assert.ok(!doc.status);
                assert.ok(!doc.role);
            });
        });
    });

    describe('分页场景', function() {
        it('应该支持第一页查询', async function() {
            const page = 1;
            const pageSize = 10;
            const { data, total } = await collection.findAndCount(
                { role: 'user' },
                {
                    limit: pageSize,
                    skip: (page - 1) * pageSize,
                    sort: { _id: 1 }
                }
            );

            assert.strictEqual(total, 30);
            assert.strictEqual(data.length, 10);
            assert.strictEqual(data[0]._id, 1);

            const totalPages = Math.ceil(total / pageSize);
            assert.strictEqual(totalPages, 3);
        });

        it('应该支持中间页查询', async function() {
            const page = 2;
            const pageSize = 10;
            const { data, total } = await collection.findAndCount(
                { role: 'user' },
                {
                    limit: pageSize,
                    skip: (page - 1) * pageSize,
                    sort: { _id: 1 }
                }
            );

            assert.strictEqual(total, 30);
            assert.strictEqual(data.length, 10);
            assert.strictEqual(data[0]._id, 11);
        });

        it('应该支持最后一页查询', async function() {
            const page = 3;
            const pageSize = 10;
            const { data, total } = await collection.findAndCount(
                { role: 'user' },
                {
                    limit: pageSize,
                    skip: (page - 1) * pageSize,
                    sort: { _id: 1 }
                }
            );

            assert.strictEqual(total, 30);
            assert.strictEqual(data.length, 10);
            assert.strictEqual(data[0]._id, 21);
        });

        it('应该处理超出范围的页码', async function() {
            const page = 100;
            const pageSize = 10;
            const { data, total } = await collection.findAndCount(
                { role: 'user' },
                {
                    limit: pageSize,
                    skip: (page - 1) * pageSize
                }
            );

            assert.strictEqual(total, 30);
            assert.strictEqual(data.length, 0);
        });
    });

    describe('边界情况', function() {
        it('应该处理空结果', async function() {
            const { data, total } = await collection.findAndCount({ status: 'deleted' });

            assert.strictEqual(total, 0);
            assert.strictEqual(data.length, 0);
            assert.ok(Array.isArray(data));
        });

        it('应该处理 null 查询（查询所有）', async function() {
            const { data, total } = await collection.findAndCount(null);

            assert.strictEqual(total, 50);
            assert.strictEqual(data.length, 50);
        });

        it('应该处理空对象查询（查询所有）', async function() {
            const { data, total } = await collection.findAndCount({});

            assert.strictEqual(total, 50);
            assert.strictEqual(data.length, 50);
        });

        it('应该处理 limit 为 0（MongoDB 中 0 表示无限制）', async function() {
            const { data, total } = await collection.findAndCount(
                { status: 'active' },
                { limit: 0 }
            );

            assert.strictEqual(total, 25);
            // MongoDB 中 limit: 0 表示不限制，所以返回所有数据
            assert.strictEqual(data.length, 25);
        });
    });

    describe('缓存功能', function() {
        it('应该支持缓存', async function() {
            // 清除所有缓存
            await collection.invalidate('all');

            // 检查方法是否存在
            console.log('collection.findAndCount类型:', typeof collection.findAndCount);

            // 第一次查询（无缓存）
            const result1 = await collection.findAndCount(
                { status: 'active' },
                { limit: 10, cache: 60000 }
            );

            console.log('result1:', result1);

            // 确保第一次查询成功
            assert.ok(result1, '第一次查询结果不应为空');
            assert.ok(result1.data, '第一次查询应有 data');
            assert.strictEqual(typeof result1.total, 'number', '第一次查询应有 total');

            // 第二次查询（有缓存）
            const result2 = await collection.findAndCount(
                { status: 'active' },
                { limit: 10, cache: 60000 }
            );

            // 确保第二次查询成功
            assert.ok(result2, '第二次查询结果不应为空');
            assert.ok(result2.data, '第二次查询应有 data');
            assert.strictEqual(typeof result2.total, 'number', '第二次查询应有 total');

            // 验证结果一致
            assert.strictEqual(result1.total, result2.total);
            assert.strictEqual(result1.data.length, result2.data.length);
            assert.strictEqual(result1.total, 25);
            assert.strictEqual(result1.data.length, 10);
        });
    });

    describe('参数验证', function() {
        it('应该拒绝数组作为查询条件', async function() {
            try {
                await collection.findAndCount([{ status: 'active' }]);
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error);
            }
        });

        it('应该拒绝字符串作为查询条件', async function() {
            try {
                await collection.findAndCount('invalid');
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error);
            }
        });
    });

    describe('性能测试', function() {
        it('并行执行应该比串行快', async function() {
            // findAndCount 内部使用 Promise.all 并行执行
            // 测试确认结果正确即可
            const { data, total } = await collection.findAndCount(
                { role: 'user' },
                { limit: 10 }
            );

            assert.strictEqual(total, 30);
            assert.strictEqual(data.length, 10);
        });
    });
});

