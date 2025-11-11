/**
 * insertOne 方法测试套件
 * 测试单个文档插入功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('insertOne 方法测试套件', function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_insertone',
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
        it('应该成功插入单个文档', async () => {
            const result = await collection('users').insertOne({
                document: { name: 'Alice', age: 25, email: 'alice@example.com' }
            });

            assert.ok(result, '返回结果不应为空');
            assert.ok(result.insertedId, '应该返回 insertedId');
            assert.strictEqual(result.acknowledged, true, 'acknowledged 应该为 true');

            // 验证文档已插入
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.ok(doc, '文档应该存在');
            assert.strictEqual(doc.name, 'Alice');
            assert.strictEqual(doc.age, 25);
        });

        it('应该支持插入包含 _id 的文档', async () => {
            const customId = 'custom-id-123';
            const result = await collection('users').insertOne({
                document: { _id: customId, name: 'Bob', age: 30 }
            });

            assert.strictEqual(result.insertedId, customId, 'insertedId 应该是自定义的 ID');

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: customId });
            assert.ok(doc, '文档应该存在');
            assert.strictEqual(doc.name, 'Bob');
        });

        it('应该支持插入空对象', async () => {
            const result = await collection('users').insertOne({
                document: {}
            });

            assert.ok(result.insertedId, '应该返回 insertedId');

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.ok(doc, '空文档应该存在');
        });

        it('应该支持插入嵌套对象', async () => {
            const result = await collection('users').insertOne({
                document: {
                    name: 'Charlie',
                    address: {
                        city: 'Beijing',
                        street: 'Chang\'an Ave'
                    },
                    tags: ['developer', 'nodejs']
                }
            });

            assert.ok(result.insertedId);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.deepStrictEqual(doc.address, { city: 'Beijing', street: 'Chang\'an Ave' });
            assert.deepStrictEqual(doc.tags, ['developer', 'nodejs']);
        });
    });

    describe('参数验证测试', () => {
        it('应该在 document 缺失时抛出错误', async () => {
            try {
                await collection('users').insertOne({});
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
                assert.ok(err.message.includes('document'));
            }
        });

        it('应该在 document 为 null 时抛出错误', async () => {
            try {
                await collection('users').insertOne({ document: null });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });

        it('应该在 document 为数组时抛出错误', async () => {
            try {
                await collection('users').insertOne({ document: [{ name: 'Alice' }] });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });

        it('应该在 document 为字符串时抛出错误', async () => {
            try {
                await collection('users').insertOne({ document: 'not an object' });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });

        it('应该在 document 为数字时抛出错误', async () => {
            try {
                await collection('users').insertOne({ document: 123 });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });
    });

    describe('错误处理测试', () => {
        it('应该在重复插入相同 _id 时抛出 DUPLICATE_KEY 错误', async () => {
            const docId = 'duplicate-id';

            // 第一次插入
            await collection('users').insertOne({
                document: { _id: docId, name: 'First' }
            });

            // 第二次插入相同 _id
            try {
                await collection('users').insertOne({
                    document: { _id: docId, name: 'Second' }
                });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DUPLICATE_KEY');
                assert.ok(err.message.includes('唯一性约束'));
            }
        });
    });

    describe('缓存失效测试', () => {
        it('应该在插入后自动失效缓存', async () => {
            // 1. 查询并缓存结果
            await collection('users').find({
                query: {},
                cache: 5000
            });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;
            assert.ok(size1 > 0, '应该有缓存');

            // 2. 插入新文档
            await collection('users').insertOne({
                document: { name: 'Cache Test', age: 35 }
            });

            // 3. 验证缓存已清空
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0, '插入后缓存应该被清空');
        });

        it('应该只失效当前集合的缓存', async () => {
            // 1. 在两个集合中创建缓存
            await collection('users').find({ query: {}, cache: 5000 });
            await collection('products').find({ query: {}, cache: 5000 });

            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size >= 2, '应该有多个缓存');

            // 2. 仅在 users 集合插入
            await collection('users').insertOne({
                document: { name: 'User1' }
            });

            // 3. users 缓存应该被清除，products 缓存应该保留
            const usersCache = await collection('users').find({ query: {}, cache: 5000 });
            const productsCache = await collection('products').find({ query: {}, cache: 5000 });

            // products 的缓存应该还在（命中缓存）
            const stats2 = msq.cache.getStats();
            assert.ok(stats2.hits > 0, 'products 查询应该命中缓存');
        });
    });

    describe('选项参数测试', () => {
        it('应该支持 comment 参数', async () => {
            const result = await collection('users').insertOne({
                document: { name: 'With Comment' },
                comment: 'test comment'
            });

            assert.ok(result.insertedId);
        });

        it('应该支持 writeConcern 参数', async () => {
            const result = await collection('users').insertOne({
                document: { name: 'With WriteConcern' },
                writeConcern: { w: 1 }
            });

            assert.ok(result.insertedId);
        });
    });

    describe('边界用例测试', () => {
        it('应该能插入包含特殊字符的文档', async () => {
            const result = await collection('users').insertOne({
                document: {
                    name: '张三',
                    description: 'Special chars: !@#$%^&*()',
                    unicode: '😀🎉'
                }
            });

            assert.ok(result.insertedId);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.strictEqual(doc.name, '张三');
            assert.strictEqual(doc.unicode, '😀🎉');
        });

        it('应该能插入大文档', async () => {
            const largeDoc = {
                name: 'Large Doc',
                data: 'x'.repeat(10000) // 10KB 字符串
            };

            const result = await collection('users').insertOne({
                document: largeDoc
            });

            assert.ok(result.insertedId);
        });

        it('应该能插入包含 Date 对象的文档', async () => {
            const now = new Date();
            const result = await collection('users').insertOne({
                document: {
                    name: 'Date Test',
                    createdAt: now
                }
            });

            assert.ok(result.insertedId);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.ok(doc.createdAt instanceof Date);
            assert.strictEqual(doc.createdAt.getTime(), now.getTime());
        });
    });
});
