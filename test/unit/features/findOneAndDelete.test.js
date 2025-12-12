/**
 * findOneAndDelete 方法测试套件
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('findOneAndDelete 方法测试套件', function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_findoneanddelete',
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
        it('应该原子地查找并删除文档', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice',
                status: 'active'
            });

            const deletedDoc = await collection('users').findOneAndDelete({
                userId: 'user1'
            });

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.userId, 'user1');
            assert.strictEqual(deletedDoc.name, 'Alice');

            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ userId: 'user1' });
            assert.strictEqual(doc, null);
        });

        it('未找到文档时应返回 null', async () => {
            const result = await collection('users').findOneAndDelete({
                userId: 'nonexistent'
            });

            assert.strictEqual(result, null);
        });

        it('有多个匹配文档时应只删除一个', async () => {
            await collection('users').insertMany([
                { type: 'temp', name: 'User1', priority: 1 },
                { type: 'temp', name: 'User2', priority: 2 },
                { type: 'temp', name: 'User3', priority: 3 }
            ]);

            const deletedDoc = await collection('users').findOneAndDelete({
                type: 'temp'
            });

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.type, 'temp');

            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({ type: 'temp' });
            assert.strictEqual(count, 2);
        });
    });

    describe('排序功能', () => {
        it('应该支持 sort 选项（删除最旧的）', async () => {
            await collection('users').insertMany([
                { type: 'task', name: 'Task1', createdAt: new Date('2024-01-01') },
                { type: 'task', name: 'Task2', createdAt: new Date('2024-01-02') },
                { type: 'task', name: 'Task3', createdAt: new Date('2024-01-03') }
            ]);

            const deletedDoc = await collection('users').findOneAndDelete(
                { type: 'task' },
                { sort: { createdAt: 1 } }
            );

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.name, 'Task1');
        });

        it('应该支持 sort 选项（删除最新的）', async () => {
            await collection('users').insertMany([
                { type: 'task', priority: 1 },
                { type: 'task', priority: 2 },
                { type: 'task', priority: 3 }
            ]);

            const deletedDoc = await collection('users').findOneAndDelete(
                { type: 'task' },
                { sort: { priority: -1 } }
            );

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.priority, 3);
        });
    });

    describe('projection 选项测试', () => {
        it('应该支持字段投影', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice',
                email: 'alice@example.com',
                password: 'secret'
            });

            const deletedDoc = await collection('users').findOneAndDelete(
                { userId: 'user1' },
                { projection: { userId: 1, name: 1 } }
            );

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.name, 'Alice');
            assert.strictEqual(deletedDoc.email, undefined);
            assert.strictEqual(deletedDoc.password, undefined);
        });
    });

    describe('includeResultMetadata 选项', () => {
        it('应该返回完整结果元数据', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice'
            });

            const result = await collection('users').findOneAndDelete(
                { userId: 'user1' },
                { includeResultMetadata: true }
            );

            assert.ok(result);
            assert.strictEqual(result.ok, 1);
            assert.ok(result.value);
            assert.strictEqual(result.value.userId, 'user1');
        });

        it('元数据应包含 lastErrorObject', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice'
            });

            const result = await collection('users').findOneAndDelete(
                { userId: 'user1' },
                { includeResultMetadata: true }
            );

            assert.ok(result.lastErrorObject);
        });
    });

    describe('参数验证测试', () => {
        it('应该在 filter 缺失时抛出错误', async () => {
            try {
                await collection('users').findOneAndDelete();
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });

        it('应该在 filter 为 null 时抛出错误', async () => {
            try {
                await collection('users').findOneAndDelete(null);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });

        it('应该在 filter 为数组时抛出错误', async () => {
            try {
                await collection('users').findOneAndDelete([{ userId: 'user1' }]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    describe('缓存失效测试', () => {
        it('应该在删除成功后自动失效缓存', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                name: 'Alice'
            });

            await collection('users').find({ userId: 'user1' }, { cache: 5000 });
            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size > 0);

            await collection('users').findOneAndDelete({ userId: 'user1' });

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0);
        });

        it('未找到文档时不应失效缓存', async () => {
            await collection('users').insertOne({ userId: 'user1' });
            await collection('users').find({ userId: 'user1' }, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;

            await collection('users').findOneAndDelete({ userId: 'nonexistent' });

            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, size1);
        });
    });

    describe('实际应用场景', () => {
        it('队列任务消费（获取并删除）', async () => {
            await collection('users').insertMany([
                { taskId: 'task1', status: 'pending', priority: 1 },
                { taskId: 'task2', status: 'pending', priority: 2 },
                { taskId: 'task3', status: 'pending', priority: 3 }
            ]);

            const task = await collection('users').findOneAndDelete(
                { status: 'pending' },
                { sort: { priority: -1 } }
            );

            assert.ok(task);
            assert.strictEqual(task.taskId, 'task3');
            assert.strictEqual(task.priority, 3);

            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({ status: 'pending' });
            assert.strictEqual(count, 2);
        });

        it('过期会话清理（获取旧会话信息后删除）', async () => {
            const now = new Date();
            const expired = new Date(now.getTime() - 86400000);

            await collection('users').insertMany([
                { sessionId: 's1', expiresAt: expired, userId: 'user1', data: 'session1' },
                { sessionId: 's2', expiresAt: now, userId: 'user2' }
            ]);

            const expiredSession = await collection('users').findOneAndDelete(
                { expiresAt: { $lt: now } }
            );

            assert.ok(expiredSession);
            assert.strictEqual(expiredSession.sessionId, 's1');
        });

        it('获取并删除锁记录', async () => {
            await collection('users').insertOne({
                lockKey: 'resource-lock',
                ownerId: 'worker-1',
                acquiredAt: new Date()
            });

            const lock = await collection('users').findOneAndDelete({
                lockKey: 'resource-lock',
                ownerId: 'worker-1'
            });

            assert.ok(lock);
            assert.strictEqual(lock.lockKey, 'resource-lock');

            const db = msq._adapter.db;
            const remaining = await db.collection('users').findOne({ lockKey: 'resource-lock' });
            assert.strictEqual(remaining, null);
        });
    });

    describe('边界用例测试', () => {
        it('应该能删除包含嵌套对象的文档', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                profile: {
                    address: {
                        city: 'Beijing'
                    }
                }
            });

            const deletedDoc = await collection('users').findOneAndDelete({
                'profile.address.city': 'Beijing'
            });

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.userId, 'user1');
        });

        it('应该能删除包含数组的文档', async () => {
            await collection('users').insertOne({
                userId: 'user1',
                tags: ['old', 'deprecated']
            });

            const deletedDoc = await collection('users').findOneAndDelete({
                tags: { $in: ['deprecated'] }
            });

            assert.ok(deletedDoc);
            assert.strictEqual(deletedDoc.userId, 'user1');
        });
    });
});

