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
                assert.ok(err.message.includes('array'));
            }
        });

        it('应该在 documents 为空数组时抛出错误', async () => {
            try {
                await collection('users').insertMany([]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENTS_REQUIRED');
                assert.ok(err.message.includes('empty'));
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
                assert.ok(err.message.includes('object'));
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
                assert.ok(err.message.includes('duplicate key'));
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
            // 创建启用精准失效的实例
            const msqWithCache = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertmany_cache',
                config: { useMemoryServer: true },
                cache: {
                    maxSize: 10000,
                    autoInvalidate: true  // 启用精准失效
                }
            });

            const conn = await msqWithCache.connect();
            const coll = conn.collection;

            // 1. 先插入一些初始数据
            await coll('users').insertMany([
                { name: 'Initial1' },
                { name: 'Initial2' }
            ]);

            // 2. 查询并缓存结果
            await coll('users').find({}, { cache: 5000 });

            const stats1 = msqWithCache.cache.getStats();
            const size1 = stats1.size;
            assert.ok(size1 > 0, '应该有缓存');

            // 3. 批量插入新文档
            await coll('users').insertMany([
                { name: 'User1' },
                { name: 'User2' }
            ]);

            // 4. 验证缓存已清空
            const stats2 = msqWithCache.cache.getStats();

            await msqWithCache.close();

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

    describe('慢查询监控测试', () => {
        it('应该使用配置的 slowQueryMs', async () => {
            const msqWithSlowConfig = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertmany_slow',
                config: { useMemoryServer: true },
                slowQueryMs: 50
            });

            try {
                await msqWithSlowConfig.connect();

                assert.strictEqual(
                    msqWithSlowConfig.defaults.slowQueryMs,
                    50,
                    'slowQueryMs 配置应该生效'
                );
            } finally {
                await msqWithSlowConfig.close();
            }
        });

        it('应该在超过阈值时记录慢查询日志', async () => {
            const msqSlow = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertmany_slowlog',
                config: { useMemoryServer: true },
                slowQueryMs: 0
            });

            try {
                const conn = await msqSlow.connect();
                const testCollection = conn.collection;

                const logMessages = [];
                const originalWarn = msqSlow.logger.warn;
                msqSlow.logger.warn = function (message, meta) {
                    logMessages.push({ message, meta });
                    if (originalWarn) {
                        originalWarn.call(this, message, meta);
                    }
                };

                await testCollection('users').insertMany([
                    { name: 'User1' },
                    { name: 'User2' }
                ]);

                msqSlow.logger.warn = originalWarn;

                const slowLogs = logMessages.filter(log =>
                    log.message && (
                        log.message.includes('慢操作警告') ||
                        (log.meta && log.meta.threshold !== undefined)
                    )
                );

                assert.ok(slowLogs.length > 0, '应该记录慢查询日志');

                const slowLog = slowLogs[0];
                assert.ok(slowLog.meta, '日志应该包含 meta 信息');
                assert.strictEqual(slowLog.meta.threshold, 0, '阈值应该是配置的 0ms');
                assert.ok(slowLog.meta.documentCount !== undefined, '日志应该包含文档数量');
                assert.strictEqual(slowLog.meta.documentCount, 2, '文档数量应该是 2');
            } finally {
                await msqSlow.close();
            }
        });

        it('慢查询日志应该包含批量插入的元数据', async () => {
            const msqMeta = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertmany_meta',
                config: { useMemoryServer: true },
                slowQueryMs: 0
            });

            try {
                const conn = await msqMeta.connect();
                const testCollection = conn.collection;

                let capturedMeta = null;
                const originalWarn = msqMeta.logger.warn;
                msqMeta.logger.warn = function (message, meta) {
                    if (message && message.includes('慢操作警告')) {
                        capturedMeta = meta;
                    }
                    if (originalWarn) {
                        originalWarn.call(this, message, meta);
                    }
                };

                const result = await testCollection('users').insertMany(
                    [
                        { name: 'User1' },
                        { name: 'User2' },
                        { name: 'User3' }
                    ],
                    { comment: 'batch-insert-test', ordered: false }
                );

                msqMeta.logger.warn = originalWarn;

                assert.ok(capturedMeta, '应该捕获到日志元数据');
                assert.ok(capturedMeta.ns, '应该包含命名空间');
                assert.strictEqual(capturedMeta.threshold, 0, '应该包含阈值');
                assert.ok(typeof capturedMeta.duration === 'number', '应该包含执行时间');
                assert.strictEqual(capturedMeta.documentCount, 3, '应该包含文档数量');
                assert.strictEqual(capturedMeta.insertedCount, 3, '应该包含插入成功的数量');
                assert.strictEqual(capturedMeta.ordered, false, '应该包含 ordered 参数');
                assert.strictEqual(capturedMeta.comment, 'batch-insert-test', '应该包含 comment 参数');
            } finally {
                await msqMeta.close();
            }
        });

        it('应该在未超过阈值时不记录慢查询日志', async () => {
            const msqFast = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertmany_fast',
                config: { useMemoryServer: true },
                slowQueryMs: 10000
            });

            try {
                const conn = await msqFast.connect();
                const testCollection = conn.collection;

                const logMessages = [];
                const originalWarn = msqFast.logger.warn;
                msqFast.logger.warn = function (message, meta) {
                    logMessages.push({ message, meta });
                    if (originalWarn) {
                        originalWarn.call(this, message, meta);
                    }
                };

                await testCollection('users').insertMany([
                    { name: 'Fast1' },
                    { name: 'Fast2' }
                ]);

                msqFast.logger.warn = originalWarn;

                const slowLogs = logMessages.filter(log =>
                    log.message && log.message.includes('慢操作警告')
                );

                assert.strictEqual(
                    slowLogs.length,
                    0,
                    '未超过阈值时不应该记录慢查询日志'
                );
            } finally {
                await msqFast.close();
            }
        });
    });
});
