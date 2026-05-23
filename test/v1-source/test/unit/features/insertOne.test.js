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
            const result = await collection('users').insertOne(
                { name: 'Alice', age: 25, email: 'alice@example.com' }
            );

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
            const result = await collection('users').insertOne(
                { _id: customId, name: 'Bob', age: 30 }
            );

            assert.strictEqual(result.insertedId, customId, 'insertedId 应该是自定义的 ID');

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: customId });
            assert.ok(doc, '文档应该存在');
            assert.strictEqual(doc.name, 'Bob');
        });

        it('应该支持插入空对象', async () => {
            const result = await collection('users').insertOne(
                {}
            );

            assert.ok(result.insertedId, '应该返回 insertedId');

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.ok(doc, '空文档应该存在');
        });

        it('应该支持插入嵌套对象', async () => {
            const result = await collection('users').insertOne({
                name: 'Charlie',
                address: {
                    city: 'Beijing',
                    street: 'Chang\'an Ave'
                },
                tags: ['developer', 'nodejs']
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
                await collection('users').insertOne();
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
                assert.ok(err.message.includes('document'));
            }
        });

        it('应该在 document 为 null 时抛出错误', async () => {
            try {
                await collection('users').insertOne(null);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });

        it('应该在 document 为数组时抛出错误', async () => {
            try {
                await collection('users').insertOne([{ name: 'Alice' }]);
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });

        it('应该在 document 为字符串时抛出错误', async () => {
            try {
                await collection('users').insertOne('not an object');
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DOCUMENT_REQUIRED');
            }
        });

        it('应该在 document 为数字时抛出错误', async () => {
            try {
                await collection('users').insertOne(123);
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
            await collection('users').insertOne(
                { _id: docId, name: 'First' }
            );

            // 第二次插入相同 _id
            try {
                await collection('users').insertOne(
                    { _id: docId, name: 'Second' }
                );
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'DUPLICATE_KEY');
                assert.ok(err.message.includes('duplicate key'));
            }
        });
    });

    describe('缓存失效测试', () => {
        it('应该在插入后自动失效缓存', async () => {
            // 创建启用精准失效的实例
            const msqCacheTest = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertone_cache',
                config: { useMemoryServer: true },
                cache: {
                    maxSize: 10000,
                    autoInvalidate: true  // 实例级别启用
                }
            });

            const conn = await msqCacheTest.connect();
            const cacheTestCollection = conn.collection;

            // 1. 先插入一些初始数据
            await cacheTestCollection('users').insertOne(
                { name: 'Initial', age: 20 }
            );

            // 2. 查询并缓存结果
            await cacheTestCollection('users').find({}, { cache: 5000 });

            const stats1 = msqCacheTest.cache.getStats();
            const size1 = stats1.size;
            assert.ok(size1 > 0, '应该有缓存');

            // 3. 插入新文档（实例级别已启用 autoInvalidate）
            await cacheTestCollection('users').insertOne(
                { name: 'Cache Test', age: 35 }
            );

            // 4. 验证缓存已清空（精准失效应该清除空查询 {} 的缓存）
            const stats2 = msqCacheTest.cache.getStats();


            await msqCacheTest.close();

            assert.strictEqual(stats2.size, 0, '插入后缓存应该被清空');
        });

        it('应该只失效当前集合的缓存', async () => {
            // 1. 先在两个集合插入初始数据
            await collection('users').insertOne({ name: 'InitUser' });
            await collection('products').insertOne({ name: 'InitProduct' });

            // 2. 在两个集合中创建缓存
            await collection('users').find({}, { cache: 5000 });
            await collection('products').find({}, { cache: 5000 });

            const stats1 = msq.cache.getStats();
            assert.ok(stats1.size >= 2, '应该有多个缓存');

            // 2. 仅在 users 集合插入
            await collection('users').insertOne(
                { name: 'User1' }
            );

            // 3. users 缓存应该被清除，products 缓存应该保留
            const usersCache = await collection('users').find({}, { cache: 5000 });
            const productsCache = await collection('products').find({}, { cache: 5000 });

            // products 的缓存应该还在（命中缓存）
            const stats2 = msq.cache.getStats();
            assert.ok(stats2.hits > 0, 'products 查询应该命中缓存');
        });
    });

    describe('选项参数测试', () => {
        it('应该支持 comment 参数', async () => {
            const result = await collection('users').insertOne(
                { name: 'With Comment' },
                { comment: 'test comment' }
            );

            assert.ok(result.insertedId);
        });

        it('应该支持 writeConcern 参数', async () => {
            const result = await collection('users').insertOne(
                { name: 'With WriteConcern' },
                { writeConcern: { w: 1 } }
            );

            assert.ok(result.insertedId);
        });
    });

    describe('边界用例测试', () => {
        it('应该能插入包含特殊字符的文档', async () => {
            const result = await collection('users').insertOne({
                name: '张三',
                description: 'Special chars: !@#$%^&*()',
                unicode: '😀🎉'
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

            const result = await collection('users').insertOne(largeDoc);

            assert.ok(result.insertedId);
        });

        it('应该能插入包含 Date 对象的文档', async () => {
            const now = new Date();
            const result = await collection('users').insertOne({
                name: 'Date Test',
                createdAt: now
            });

            assert.ok(result.insertedId);

            // 验证
            const db = msq._adapter.db;
            const doc = await db.collection('users').findOne({ _id: result.insertedId });
            assert.ok(doc.createdAt instanceof Date);
            assert.strictEqual(doc.createdAt.getTime(), now.getTime());
        });
    });

    describe('慢查询监控测试', () => {
        it('应该使用配置的 slowQueryMs', async () => {
            // 创建新实例，配置 slowQueryMs
            const msqWithSlowConfig = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertone_slow',
                config: { useMemoryServer: true },
                slowQueryMs: 50  // 配置 50ms 阈值
            });

            try {
                await msqWithSlowConfig.connect();

                // 验证配置生效
                assert.strictEqual(
                    msqWithSlowConfig.defaults.slowQueryMs,
                    50,
                    'slowQueryMs 配置应该生效'
                );
            } finally {
                await msqWithSlowConfig.close();
            }
        });

        it('应该使用默认的 slowQueryMs (500ms)', async () => {
            // 未配置 slowQueryMs，应使用默认值
            const msqDefault = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertone_default',
                config: { useMemoryServer: true }
            });

            try {
                await msqDefault.connect();

                // 验证默认值
                assert.strictEqual(
                    msqDefault.defaults.slowQueryMs,
                    500,
                    'slowQueryMs 默认值应该是 500ms'
                );
            } finally {
                await msqDefault.close();
            }
        });

        it('应该在超过阈值时记录慢查询日志', async () => {
            // 创建新实例，配置极低的阈值（但不是 0，因为操作可能 0ms）
            const msqSlow = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertone_slowlog',
                config: { useMemoryServer: true },
                slowQueryMs: -1  // 设置为 -1，确保任何操作都会触发（因为 duration 总是 >= 0）
            });

            try {
                const conn = await msqSlow.connect();
                const testCollection = conn.collection;

                // 捕获日志 - 使用数组和 Promise 结合
                let logCaptured = false;
                let capturedLog = null;
                let resolveLog;
                const logPromise = new Promise((resolve) => {
                    resolveLog = resolve;
                });

                const originalWarn = msqSlow.logger.warn;
                msqSlow.logger.warn = function (message, meta) {
                    // 调用原始 warn
                    if (originalWarn) {
                        originalWarn.call(this, message, meta);
                    }
                    // 捕获慢查询日志
                    if (message && message.includes('慢操作警告')) {
                        logCaptured = true;
                        capturedLog = { message, meta };
                        resolveLog({ message, meta });
                    }
                };

                // 执行插入
                await testCollection('users').insertOne({ name: 'Slow Test' });

                // 等待日志异步处理（最多等待 500ms）
                await Promise.race([
                    logPromise,
                    new Promise(resolve => setTimeout(resolve, 500))
                ]);

                // 恢复原始 logger
                msqSlow.logger.warn = originalWarn;

                // 验证日志
                assert.ok(logCaptured, '应该记录慢查询日志');
                assert.ok(capturedLog, '应该捕获到日志内容');
                assert.ok(capturedLog.meta, '日志应该包含 meta 信息');
                assert.strictEqual(capturedLog.meta.threshold, -1, '阈值应该是配置的 -1ms');
                assert.ok(capturedLog.meta.ns, '日志应该包含命名空间');
                assert.ok(capturedLog.meta.duration !== undefined, '日志应该包含执行时间');
            } finally {
                await msqSlow.close();
            }
        });

        it('应该在未超过阈值时不记录慢查询日志', async () => {
            // 创建新实例，配置极高的阈值
            const msqFast = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertone_fast',
                config: { useMemoryServer: true },
                slowQueryMs: 10000  // 设置为 10 秒，正常操作不会超过
            });

            try {
                const conn = await msqFast.connect();
                const testCollection = conn.collection;

                // 捕获日志
                const logMessages = [];
                const originalWarn = msqFast.logger.warn;
                msqFast.logger.warn = function (message, meta) {
                    logMessages.push({ message, meta });
                    if (originalWarn) {
                        originalWarn.call(this, message, meta);
                    }
                };

                // 执行插入
                await testCollection('users').insertOne({ name: 'Fast Test' });

                // 恢复原始 logger
                msqFast.logger.warn = originalWarn;

                // 验证没有慢查询日志
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

        it('慢查询日志应该包含正确的元数据', async () => {
            const msqMeta = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_insertone_meta',
                config: { useMemoryServer: true },
                slowQueryMs: -1  // 使用 -1 确保触发
            });

            try {
                const conn = await msqMeta.connect();
                const testCollection = conn.collection;

                // 捕获日志 - 使用 Promise
                let capturedMeta = null;
                let resolveLog;
                const logPromise = new Promise((resolve) => {
                    resolveLog = resolve;
                });

                const originalWarn = msqMeta.logger.warn;
                msqMeta.logger.warn = function (message, meta) {
                    // 调用原始 warn
                    if (originalWarn) {
                        originalWarn.call(this, message, meta);
                    }
                    // 捕获慢查询日志
                    if (message && message.includes('慢操作警告')) {
                        capturedMeta = meta;
                        resolveLog(meta);
                    }
                };

                // 执行插入
                const result = await testCollection('users').insertOne(
                    { name: 'Meta Test' },
                    { comment: 'test-comment' }
                );

                // 等待日志异步处理（最多等待 500ms）
                await Promise.race([
                    logPromise,
                    new Promise(resolve => setTimeout(resolve, 500))
                ]);

                // 恢复原始 logger
                msqMeta.logger.warn = originalWarn;

                // 验证元数据
                assert.ok(capturedMeta, '应该捕获到日志元数据');
                assert.ok(capturedMeta.ns, '应该包含命名空间');
                assert.ok(capturedMeta.ns.includes('test_insertone_meta'), '命名空间应该包含数据库名');
                assert.ok(capturedMeta.ns.includes('users'), '命名空间应该包含集合名');
                assert.strictEqual(capturedMeta.threshold, -1, '应该包含阈值');
                assert.ok(typeof capturedMeta.duration === 'number', '应该包含执行时间');
                assert.ok(capturedMeta.insertedId, '应该包含插入的 ID');
                assert.strictEqual(capturedMeta.insertedId.toString(), result.insertedId.toString());
                assert.strictEqual(capturedMeta.comment, 'test-comment', '应该包含 comment 参数');
            } finally {
                await msqMeta.close();
            }
        });
    });
});
