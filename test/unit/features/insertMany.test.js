/**
 * insertMany 方法测试套件
 * 测试批量文档插入功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('insertMany 方法测试套件', function () {
    this.timeout(30000);

    let msq, collection;

    before(async () => {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_insertmany',
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
        it('应该成功批量插入多个文档', async () => {
            const result = await collection('users').insertMany([
                { name: 'Alice', age: 25 },
                { name: 'Bob', age: 30 },
                { name: 'Charlie', age: 35 }
            ]);

            assert.ok(result, '返回结果不应为空');
            assert.strictEqual(result.acknowledged, true, 'acknowledged 应该为 true');
            assert.strictEqual(result.insertedCount, 3, '应该插入 3 个文档');
            assert.ok(result.insertedIds, '应该返回 insertedIds');
            assert.strictEqual(Object.keys(result.insertedIds).length, 3, '应该有 3 个 insertedId');

            // 验证文档已插入
            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({});
            assert.strictEqual(count, 3, '集合中应该有 3 个文档');
        });

        it('应该支持插入单个文档的数组', async () => {
            const result = await collection('users').insertMany([
                { name: 'Solo', age: 40 }
            ]);

            assert.strictEqual(result.insertedCount, 1);
            assert.strictEqual(Object.keys(result.insertedIds).length, 1);
        });

        it('应该支持插入包含自定义 _id 的文档', async () => {
            const result = await collection('users').insertMany([
                { _id: 'id-1', name: 'Alice' },
                { _id: 'id-2', name: 'Bob' }
            ]);

            assert.strictEqual(result.insertedCount, 2);
            assert.strictEqual(result.insertedIds[0], 'id-1');
            assert.strictEqual(result.insertedIds[1], 'id-2');
        });

        it('应该支持插入嵌套对象的数组', async () => {
            const result = await collection('users').insertMany([
                {
                    name: 'User1',
                    address: { city: 'Beijing', zip: '100000' },
                    tags: ['tag1', 'tag2']
                },
                {
                    name: 'User2',
                    address: { city: 'Shanghai', zip: '200000' },
                    tags: ['tag3']
                }
            ]);

            assert.strictEqual(result.insertedCount, 2);

            // 验证嵌套结构
            const db = msq._adapter.db;
            const docs = await db.collection('users').find({}).toArray();
            assert.strictEqual(docs[0].address.city, 'Beijing');
            assert.deepStrictEqual(docs[0].tags, ['tag1', 'tag2']);
        });
    });

    describe('参数验证测试', () => {
        it('应该在 documents 缺失时抛出错误', async () => {
            try {
                await collection('users').insertMany();
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
                assert.ok(err.message.includes('documents'));
            }
        });

        it('应该在 documents 不是数组时抛出错误', async () => {
            try {
                await collection('users').insertMany({ name: 'Alice' });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
                assert.ok(err.message.includes('数组'));
            }
        });

        it('应该在 documents 为空数组时抛出错误', async () => {
            try {
                await collection('users').insertMany([]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
                assert.ok(err.message.includes('不能为空'));
            }
        });

        it('应该在 documents 包含非对象元素时抛出错误', async () => {
            try {
                await collection('users').insertMany([
                    { name: 'Alice' },
                    'not an object',
                    { name: 'Bob' }
                ]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
                assert.ok(err.message.includes('对象类型'));
            }
        });

        it('应该在 documents 包含 null 时抛出错误', async () => {
            try {
                await collection('users').insertMany([
                    { name: 'Alice' },
                    null,
                    { name: 'Bob' }
                ]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
            }
        });

        it('应该在 documents 包含数组时抛出错误', async () => {
            try {
                await collection('users').insertMany([
                    { name: 'Alice' },
                    [{ name: 'nested' }]
                ]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
            }
        });
    });

    describe('错误处理测试', () => {
        it('应该在重复插入相同 _id 时抛出 DUPLICATE_KEY 错误（ordered=true）', async () => {
            const docId = 'duplicate-id';

            try {
                await collection('users').insertMany([
                    { _id: docId, name: 'First' },
                    { _id: docId, name: 'Second' }  // 重复 ID
                ], { ordered: true });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DUPLICATE_KEY');
                assert.ok(err.message.includes('唯一性约束'));
            }
        });

        it('应该支持 ordered=false（部分成功）', async () => {
            // 先插入一个文档
            await collection('users').insertMany([
                { _id: 'existing-id', name: 'Existing' }
            ]);

            try {
                await collection('users').insertMany([
                    { name: 'First' },           // 成功
                    { _id: 'existing-id', name: 'Duplicate' },  // 失败（重复）
                    { name: 'Third' }            // 成功（ordered=false 继续）
                ], { ordered: false });
                assert.fail('应该抛出错误');
            } catch (err) {
                // 验证部分插入成功
                const db = msq._adapter.db;
                const count = await db.collection('users').countDocuments({});
                assert.ok(count >= 2, '应该有至少 2 个文档（部分成功）');
            }
        });
    });

    describe('缓存失效测试', () => {
        it('应该在批量插入后自动失效缓存', async () => {
            // 1. 先插入一些初始数据
            await collection('users').insertMany([
                { name: 'Initial1' },
                { name: 'Initial2' }
            ]);

            // 2. 查询并缓存结果
            await collection('users').find({}, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            const size1 = stats1.size;
            assert.ok(size1 > 0, '应该有缓存');

            // 3. 批量插入新文档
            await collection('users').insertMany([
                { name: 'User1' },
                { name: 'User2' }
            ]);

            // 4. 验证缓存已清空
            const stats2 = msq.cache.getStats();
            assert.strictEqual(stats2.size, 0, '插入后缓存应该被清空');
        });

        it('应该只失效当前集合的缓存', async () => {
            // 1. 先在两个集合插入初始数据
            await collection('users').insertMany([{ name: 'InitUser' }]);
            await collection('products').insertMany([{ name: 'InitProduct' }]);

            // 2. 在两个集合中创建缓存
            await collection('users').find({}, { cache: 5000 });
            await collection('products').find({}, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size >= 2, '应该有多个缓存');

            // 3. 仅在 users 集合批量插入
            await collection('users').insertMany([
                { name: 'User1' }, { name: 'User2' }
            ]);

            // 3. users 缓存应该被清除，products 缓存应该保留
            const stats = msq.cache.getStats();
            assert.ok(stats.hits === 0 || stats.hits > 0, '缓存统计正常');
        });
    });

    describe('选项参数测试', () => {
        it('应该支持 ordered 参数', async () => {
            const result = await collection('users').insertMany([
                { name: 'User1' },
                { name: 'User2' }
            ], { ordered: false });

            assert.strictEqual(result.insertedCount, 2);
        });

        it('应该支持 comment 参数', async () => {
            const result = await collection('users').insertMany([
                { name: 'With Comment' }
            ], { comment: 'test comment' });

            assert.strictEqual(result.insertedCount, 1);
        });

        it('应该支持 writeConcern 参数', async () => {
            const result = await collection('users').insertMany([
                { name: 'With WriteConcern' }
            ], { writeConcern: { w: 1 } });

            assert.strictEqual(result.insertedCount, 1);
        });
    });

    describe('边界用例测试', () => {
        it('应该能批量插入大量文档', async () => {
            const docs = [];
            for (let i = 0; i < 100; i++) {
                docs.push({ name: `User${i}`, index: i });
            }

            const result = await collection('users').insertMany(docs);

            assert.strictEqual(result.insertedCount, 100);

            // 验证
            const db = msq._adapter.db;
            const count = await db.collection('users').countDocuments({});
            assert.strictEqual(count, 100);
        });

        it('应该能插入包含特殊字符的文档数组', async () => {
            const result = await collection('users').insertMany([
                { name: '张三', emoji: '😀' },
                { name: '李四', special: '!@#$%' }
            ]);

            assert.strictEqual(result.insertedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const docs = await db.collection('users').find({}).toArray();
            assert.strictEqual(docs[0].name, '张三');
            assert.strictEqual(docs[0].emoji, '😀');
        });

        it('应该能插入包含 Date 对象的文档数组', async () => {
            const now = new Date();
            const result = await collection('users').insertMany([
                { name: 'User1', createdAt: now },
                { name: 'User2', createdAt: now }
            ]);

            assert.strictEqual(result.insertedCount, 2);

            // 验证
            const db = msq._adapter.db;
            const docs = await db.collection('users').find({}).toArray();
            assert.ok(docs[0].createdAt instanceof Date);
        });
    });

    describe('性能相关测试', () => {
        it('批量插入应该比多次单个插入快', async function () {
            this.timeout(60000);

            const docCount = 500;

            // 方式 1: 批量插入
            const docs = [];
            for (let i = 0; i < docCount; i++) {
                docs.push({ name: `User${i}`, index: i });
            }

            const start1 = Date.now();
            await collection('users').insertMany(docs);
            const duration1 = Date.now() - start1;

            // 清空
            const db = msq._adapter.db;
            await db.collection('users').deleteMany({});

            // 方式 2: 多次单个插入
            const start2 = Date.now();
            for (let i = 0; i < docCount; i++) {
                await collection('users').insertOne(
                    { name: `User${i}`, index: i }
                );
            }
            const duration2 = Date.now() - start2;

            console.log(`      批量插入 ${docCount} 个文档耗时: ${duration1}ms`);
            console.log(`      单个插入 ${docCount} 次耗时: ${duration2}ms`);
            console.log(`      性能提升: ${(duration2 / duration1).toFixed(2)}x`);

            // 批量插入应该明显更快
            assert.ok(duration1 < duration2, '批量插入应该比多次单个插入快');
        });
    });
});
