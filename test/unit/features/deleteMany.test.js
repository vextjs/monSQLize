/**
 * deleteMany 方法测试套件
 * 测试批量删除功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('deleteMany 方法测试套件', function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_deletemany',
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;

        const db = msq._adapter.db;
        await db.collection('users').deleteMany({});
    });

    after(async () => {
        if (msq) await msq.close();
    });

    beforeEach(async () => {
        const db = msq._adapter.db;
        await db.collection('users').deleteMany({});
    });

    describe('基本功能测试', () => {
        it('应该成功删除所有匹配的文档', async () => {
            await collection('users').insertMany([
                { type: 'temp', name: 'User1' },
                { type: 'temp', name: 'User2' },
                { type: 'temp', name: 'User3' },
                { type: 'permanent', name: 'User4' }
            ]);

            const result = await collection('users').deleteMany({ type: 'temp' });

            assert.strictEqual(result.deletedCount, 3);
            assert.strictEqual(result.acknowledged, true);

            // 验证 permanent 文档仍然存在
            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({});
            assert.strictEqual(count, 1);
        });

        it('未找到匹配文档时应返回 deletedCount=0', async () => {
            const result = await collection('users').deleteMany({ userId: 'nonexistent' });

            assert.strictEqual(result.deletedCount, 0);
            assert.strictEqual(result.acknowledged, true);
        });

        it('空 filter 应该删除集合中的所有文档', async () => {
            await collection('users').insertMany([
                { userId: 'user1' },
                { userId: 'user2' },
                { userId: 'user3' }
            ]);

            const result = await collection('users').deleteMany({});

            assert.strictEqual(result.deletedCount, 3);

            // 验证集合为空
            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({});
            assert.strictEqual(count, 0);
        });

        it('应该能删除大量文档', async () => {
            const docs = Array.from({ length: 100 }, (_, i) => ({
                type: 'bulk',
                index: i
            }));
            await collection('users').insertMany(docs);

            const result = await collection('users').deleteMany({ type: 'bulk' });

            assert.strictEqual(result.deletedCount, 100);
        });
    });

    describe('复杂查询条件', () => {
        it('应该支持范围查询删除', async () => {
            const now = new Date();
            const docs = Array.from({ length: 10 }, (_, i) => ({
                createdAt: new Date(now.getTime() - i * 86400000), // i天前
                data: `data${i}`
            }));
            await collection('users').insertMany(docs);

            const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
            const result = await collection('users').deleteMany({
                createdAt: { $lt: threeDaysAgo }
            });

            assert.ok(result.deletedCount > 0);
            assert.ok(result.deletedCount <= 10);
        });

        it('应该支持逻辑运算符删除', async () => {
            await collection('users').insertMany([
                { status: 'inactive', lastLogin: new Date('2023-01-01') },
                { status: 'inactive', lastLogin: new Date('2024-01-01') },
                { status: 'active', lastLogin: new Date('2023-01-01') },
                { status: 'active', lastLogin: new Date('2024-01-01') }
            ]);

            const result = await collection('users').deleteMany({
                $or: [
                    { status: 'inactive' },
                    { lastLogin: { $lt: new Date('2024-01-01') } }
                ]
            });

            assert.ok(result.deletedCount >= 3);
        });

        it('应该支持数组操作符删除', async () => {
            await collection('users').insertMany([
                { tags: ['old', 'deprecated'] },
                { tags: ['new', 'active'] },
                { tags: ['old', 'active'] }
            ]);

            const result = await collection('users').deleteMany({
                tags: { $in: ['deprecated'] }
            });

            assert.strictEqual(result.deletedCount, 1);
        });
    });

    describe('选项参数测试', () => {
        it('应该支持 collation 选项', async () => {
            await collection('users').insertMany([
                { name: 'Alice' },
                { name: 'alice' },
                { name: 'Bob' }
            ]);

            const result = await collection('users').deleteMany(
                { name: 'alice' },
                { collation: { locale: 'en', strength: 2 } }
            );

            assert.strictEqual(result.deletedCount, 2);
        });


        it('应该支持 comment 选项', async () => {
            await collection('users').insertMany([
                { type: 'temp' },
                { type: 'temp' }
            ]);

            const result = await collection('users').deleteMany(
                { type: 'temp' },
                { comment: 'cleanup-temp-data' }
            );

            assert.strictEqual(result.deletedCount, 2);
        });
    });

    describe('参数验证测试', () => {
        it('应该在 filter 缺失时抛出错误', async () => {
            try {
                await collection('users').deleteMany();
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('filter'));
            }
        });

        it('应该在 filter 为 null 时抛出错误', async () => {
            try {
                await collection('users').deleteMany(null);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });

        it('应该在 filter 为数组时抛出错误', async () => {
            try {
                await collection('users').deleteMany([{ type: 'temp' }]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    describe('缓存失效测试', () => {
        it('应该在删除成功后自动失效缓存', async () => {
            await collection('users').insertMany([
                { type: 'temp', name: 'User1' },
                { type: 'temp', name: 'User2' }
            ]);

            // 先查询生成缓存
            await collection('users').find({ type: 'temp' }, { cache: 5000 });
            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0);

            // 批量删除
            await collection('users').deleteMany({ type: 'temp' });

            // 缓存应该被清除
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0);
        });

        it('未找到文档时不应失效缓存', async () => {
            await collection('users').insertOne({ userId: 'user1' });
            await collection('users').find({ userId: 'user1' }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            await collection('users').deleteMany({ userId: 'nonexistent' });

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1);
        });
    });

    describe('实际应用场景', () => {
        it('清理过期的日志记录', async () => {
            const now = new Date();
            const oldDate = new Date(now.getTime() - 30 * 86400000); // 30天前

            const logs = Array.from({ length: 50 }, (_, i) => ({
                level: 'info',
                timestamp: new Date(now.getTime() - i * 86400000), // i天前
                message: `Log ${i}`
            }));
            await collection('users').insertMany(logs);

            const result = await collection('users').deleteMany({
                timestamp: { $lt: oldDate }
            });

            // 应该删除31-49天前的日志，共19条（索引31到49）
            assert.ok(result.deletedCount >= 19);
            assert.ok(result.deletedCount <= 20);
        });

        it('批量删除用户账户', async () => {
            await collection('users').insertMany([
                { userId: 'user1', accountStatus: 'deleted_requested', requestedAt: new Date('2024-01-01') },
                { userId: 'user2', accountStatus: 'deleted_requested', requestedAt: new Date('2024-01-02') },
                { userId: 'user3', accountStatus: 'active', lastLogin: new Date() }
            ]);

            const result = await collection('users').deleteMany({
                accountStatus: 'deleted_requested'
            });

            assert.strictEqual(result.deletedCount, 2);

            // 验证活跃用户仍然存在
            const db = msq._adapter.db;
            const activeUser = await db.collection('users').findOne({ userId: 'user3' });
            assert.ok(activeUser);
        });

        it('清理测试数据', async () => {
            await collection('users').insertMany([
                { env: 'test', data: 'test1' },
                { env: 'test', data: 'test2' },
                { env: 'production', data: 'prod1' }
            ]);

            const result = await collection('users').deleteMany({ env: 'test' });

            assert.strictEqual(result.deletedCount, 2);
        });

        it('批量删除过期的会话', async () => {
            const now = new Date();
            const sessions = Array.from({ length: 10 }, (_, i) => ({
                sessionId: `session${i}`,
                expiresAt: new Date(now.getTime() - i * 3600000), // i小时前
                userId: `user${i}`
            }));
            await collection('users').insertMany(sessions);

            const result = await collection('users').deleteMany({
                expiresAt: { $lt: now }
            });

            assert.ok(result.deletedCount > 0);
        });
    });

    describe('边界用例测试', () => {
        it('应该能删除包含嵌套对象的文档', async () => {
            await collection('users').insertMany([
                { profile: { status: 'deprecated' }, name: 'User1' },
                { profile: { status: 'deprecated' }, name: 'User2' },
                { profile: { status: 'active' }, name: 'User3' }
            ]);

            const result = await collection('users').deleteMany({
                'profile.status': 'deprecated'
            });

            assert.strictEqual(result.deletedCount, 2);
        });

        it('应该能删除包含数组的文档', async () => {
            await collection('users').insertMany([
                { tags: ['old'] },
                { tags: ['old', 'deprecated'] },
                { tags: ['new'] }
            ]);

            const result = await collection('users').deleteMany({
                tags: 'old'
            });

            assert.strictEqual(result.deletedCount, 2);
        });

        it('连续多次删除应该正确累计', async () => {
            await collection('users').insertMany([
                { batch: 1, type: 'temp' },
                { batch: 2, type: 'temp' },
                { batch: 3, type: 'temp' }
            ]);

            let totalDeleted = 0;

            const result1 = await collection('users').deleteMany({ batch: 1 });
            totalDeleted += result1.deletedCount;

            const result2 = await collection('users').deleteMany({ batch: 2 });
            totalDeleted += result2.deletedCount;

            assert.strictEqual(totalDeleted, 2);

            // 验证还有1个文档
            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({});
            assert.strictEqual(count, 1);
        });
    });
});

