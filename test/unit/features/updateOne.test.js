/**
 * updateOne 方法测试套件
 * 测试单文档更新功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('updateOne 方法测试套件', function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_updateone',
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;

        // 清空测试集合
        const db = msq._adapter.db;
        await db.collection('users').deleteMany({});
    });

    after(async () => {
        if (msq) await msq.close();
    });

    beforeEach(async () => {
        // 每个测试前清空集合
        const db = msq._adapter.db;
        await db.collection('users').deleteMany({});
    });

    describe('基本功能测试', () => {
        it('应该成功更新单个文档', async () => {
            // 先插入测试数据
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice',
                status: 'inactive'
            });

            // 更新文档
            const result = await collection('users').updateOne(
                { userId: 'user1' },
                { $set: { status: 'active', updatedAt: new Date() } }
            );

            assert.ok(result, '返回结果不应为空');
            assert.strictEqual(result.acknowledged, true, 'acknowledged 应该为 true');
            assert.strictEqual(result.matchedCount, 1, 'matchedCount 应该为 1');
            assert.strictEqual(result.modifiedCount, 1, 'modifiedCount 应该为 1');

            // 验证更新成功
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc.status, 'active');
            assert.ok(doc.updatedAt instanceof Date);
        });

        it('应该支持 $inc 操作符', async () => {
            await collection('users').insertOne({
                userId: 'user2',
                name: 'Bob',
                loginCount: 5
            });

            const result = await collection('users').updateOne(
                { userId: 'user2' },
                { $inc: { loginCount: 1 } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user2' });
            assert.strictEqual(doc.loginCount, 6);
        });

        it('应该支持 $push 操作符（数组）', async () => {
            await collection('users').insertOne({
                userId: 'user3',
                name: 'Charlie',
                tags: ['developer']
            });

            const result = await collection('users').updateOne(
                { userId: 'user3' },
                { $push: { tags: 'nodejs' } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user3' });
            assert.deepStrictEqual(doc.tags, ['developer', 'nodejs']);
        });

        it('应该支持 $unset 操作符（删除字段）', async () => {
            await collection('users').insertOne({
                userId: 'user4',
                name: 'David',
                tempField: 'temp'
            });

            const result = await collection('users').updateOne(
                { userId: 'user4' },
                { $unset: { tempField: '' } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user4' });
            assert.strictEqual(doc.tempField, undefined);
        });

        it('应该支持多个更新操作符组合', async () => {
            await collection('users').insertOne({
                userId: 'user5',
                name: 'Eve',
                age: 25,
                loginCount: 10,
                tags: []
            });

            const result = await collection('users').updateOne(
                { userId: 'user5' },
                {
                    $set: { name: 'Eve Updated' },
                    $inc: { loginCount: 1 },
                    $push: { tags: 'admin' }
                }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user5' });
            assert.strictEqual(doc.name, 'Eve Updated');
            assert.strictEqual(doc.loginCount, 11);
            assert.deepStrictEqual(doc.tags, ['admin']);
        });
    });

    describe('匹配和修改计数', () => {
        it('匹配但未修改时 modifiedCount 应为 0', async () => {
            await collection('users').insertOne({
                userId: 'user6',
                name: 'Frank',
                status: 'active'
            });

            // 更新为相同的值
            const result = await collection('users').updateOne(
                { userId: 'user6' },
                { $set: { status: 'active' } }
            );

            assert.strictEqual(result.matchedCount, 1, '应该匹配 1 个文档');
            assert.strictEqual(result.modifiedCount, 0, '未修改时应该为 0');
        });

        it('未匹配时 matchedCount 和 modifiedCount 都应为 0', async () => {
            const result = await collection('users').updateOne(
                { userId: 'nonexistent' },
                { $set: { status: 'active' } }
            );

            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
        });

        it('只更新第一个匹配的文档', async () => {
            // 插入多个相同状态的文档
            await collection('users').insertMany([
                { userId: 'user7', name: 'G1', status: 'inactive' },
                { userId: 'user8', name: 'G2', status: 'inactive' },
                { userId: 'user9', name: 'G3', status: 'inactive' }
            ]);

            const result = await collection('users').updateOne(
                { status: 'inactive' },
                { $set: { status: 'active' } }
            );

            assert.strictEqual(result.matchedCount, 1, '只匹配 1 个');
            assert.strictEqual(result.modifiedCount, 1, '只修改 1 个');

            // 验证只有一个被更新
            const db = msq._adapter.db;
            const activeCount = await db.collection('users').countDocuments({ status: 'active' });
            assert.strictEqual(activeCount, 1);
        });
    });

    describe('upsert 选项测试', () => {
        it('upsert=true 且未匹配时应插入新文档', async () => {
            const result = await collection('users').updateOne(
                { userId: 'newuser' },
                { $set: { name: 'New User', status: 'active' } },
                { upsert: true }
            );

            assert.strictEqual(result.matchedCount, 0, '未匹配');
            assert.strictEqual(result.upsertedCount, 1, '应该插入 1 个');
            assert.ok(result.upsertedId, '应该有 upsertedId');

            // 验证插入成功
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'newuser' });
            assert.ok(doc);
            assert.strictEqual(doc.name, 'New User');
        });

        it('upsert=true 且有匹配时应更新', async () => {
            await collection('users').insertOne({
                userId: 'user10',
                name: 'Original'
            });

            const result = await collection('users').updateOne(
                { userId: 'user10' },
                { $set: { name: 'Updated' } },
                { upsert: true }
            );

            assert.strictEqual(result.matchedCount, 1);
            assert.strictEqual(result.modifiedCount, 1);
            assert.strictEqual(result.upsertedCount, 0, 'upsertedCount 应为 0');
        });

        it('upsert=false（默认）时未匹配不应插入', async () => {
            const result = await collection('users').updateOne(
                { userId: 'nonexistent2' },
                { $set: { name: 'Test' } }
            );

            assert.strictEqual(result.matchedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
            assert.strictEqual(result.upsertedCount, 0);
        });
    });

    describe('参数验证测试', () => {
        it('应该在 filter 缺失时抛出错误', async () => {
            try {
                await collection('users').updateOne();
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('filter'));
            }
        });

        it('应该在 filter 为 null 时抛出错误', async () => {
            try {
                await collection('users').updateOne(null, { $set: { name: 'Test' } });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });

        it('应该在 update 缺失时抛出错误', async () => {
            try {
                await collection('users').updateOne({ userId: 'test' });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('update'));
            }
        });

        it('应该在 update 不包含操作符时抛出错误', async () => {
            try {
                await collection('users').updateOne(
                    { userId: 'test' },
                    { name: 'Test', age: 25 } // 缺少 $ 操作符
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('更新操作符'));
            }
        });

        it('应该在 filter 为数组时抛出错误', async () => {
            try {
                await collection('users').updateOne([], { $set: { name: 'Test' } });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });

        it('应该在 update 为数组时抛出错误', async () => {
            try {
                await collection('users').updateOne({ userId: 'test' }, [{ $set: { name: 'Test' } }]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    describe('缓存失效测试', () => {
        it('应该在更新后自动失效缓存', async () => {
            // 插入初始数据
            await collection('users').insertOne({
                userId: 'user11',
                name: 'Initial',
                status: 'inactive'
            });

            // 查询并缓存
            await collection('users').find({ userId: 'user11' }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;
            assert.ok(size1 > 0, '应该有缓存');

            // 更新文档
            await collection('users').updateOne(
                { userId: 'user11' },
                { $set: { status: 'active' } }
            );

            // 验证缓存已清空
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0, '更新后缓存应该被清空');
        });

        it('未修改文档时不应失效缓存', async () => {
            await collection('users').insertOne({
                userId: 'user12',
                status: 'active'
            });

            // 查询并缓存
            await collection('users').find({ userId: 'user12' }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            // 更新为相同值（不会修改）
            await collection('users').updateOne(
                { userId: 'user12' },
                { $set: { status: 'active' } }
            );

            // 缓存应该不变（因为 modifiedCount = 0）
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1, '未修改时缓存不应失效');
        });
    });

    describe('选项参数测试', () => {
        it('应该支持 comment 参数', async () => {
            await collection('users').insertOne({
                userId: 'user13',
                name: 'Test'
            });

            const result = await collection('users').updateOne(
                { userId: 'user13' },
                { $set: { name: 'Updated' } },
                { comment: 'test update' }
            );

            assert.strictEqual(result.modifiedCount, 1);
        });

        it('应该支持 writeConcern 参数', async () => {
            await collection('users').insertOne({
                userId: 'user14',
                name: 'Test'
            });

            const result = await collection('users').updateOne(
                { userId: 'user14' },
                { $set: { name: 'Updated' } },
                { writeConcern: { w: 1 } }
            );

            assert.strictEqual(result.modifiedCount, 1);
        });
    });

    describe('边界用例测试', () => {
        it('应该能更新嵌套字段', async () => {
            await collection('users').insertOne({
                userId: 'user15',
                profile: {
                    name: 'Original',
                    age: 25
                }
            });

            const result = await collection('users').updateOne(
                { userId: 'user15' },
                { $set: { 'profile.name': 'Updated' } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user15' });
            assert.strictEqual(doc.profile.name, 'Updated');
            assert.strictEqual(doc.profile.age, 25, '其他字段不应变');
        });

        it('应该能使用复杂的筛选条件', async () => {
            await collection('users').insertOne({
                userId: 'user16',
                age: 30,
                status: 'active'
            });

            const result = await collection('users').updateOne(
                { userId: 'user16', age: { $gte: 18 }, status: 'active' },
                { $inc: { age: 1 } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user16' });
            assert.strictEqual(doc.age, 31);
        });

        it('应该能更新包含特殊字符的字段', async () => {
            await collection('users').insertOne({
                userId: 'user17',
                'field-with-dash': 'original'
            });

            const result = await collection('users').updateOne(
                { userId: 'user17' },
                { $set: { 'field-with-dash': 'updated' } }
            );

            assert.strictEqual(result.modifiedCount, 1);
        });
    });
});

