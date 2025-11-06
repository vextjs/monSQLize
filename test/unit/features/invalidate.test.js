/**
 * invalidate() 方法测试
 * 
 * 测试集合级别的缓存失效功能
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('invalidate() - 缓存失效', function () {
    this.timeout(30000);

    let msq;
    let collection;
    let nativeCollection;

    before(async function () {
        console.log('🔧 初始化 invalidate 测试环境...');

        // 创建 monSQLize 实例（启用缓存，使用内存服务器）
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_invalidate',
            config: { useMemoryServer: true }
        });

        const conn = await msq.connect();
        collection = conn.collection;

        // 获取原生 MongoDB 集合对象用于数据准备
        const db = msq._adapter.db;
        nativeCollection = db.collection('products');

        // 清空并插入测试数据
        await nativeCollection.deleteMany({});
        await nativeCollection.insertMany([
            { name: 'Product A', category: 'electronics', price: 100 },
            { name: 'Product B', category: 'electronics', price: 200 },
            { name: 'Product C', category: 'books', price: 50 }
        ]);

        console.log('✅ 测试环境初始化完成');
    });

    after(async () => {
        if (msq) {
            await msq.close();
            console.log('✅ 测试环境清理完成');
        }
    });

    describe('基本功能', () => {
        it('应该清除指定集合的所有缓存', async () => {
            // 1. 执行查询并缓存
            const result1 = await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            assert.strictEqual(result1.length, 2);

            // 2. 验证缓存命中
            const stats1 = msq._adapter.cache.getStats();
            const hits1 = stats1.hits;

            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            const stats2 = msq._adapter.cache.getStats();
            assert.strictEqual(stats2.hits, hits1 + 1, '应该命中缓存');

            // 3. 清除缓存
            const deleted = await collection('products').invalidate();
            assert.ok(deleted >= 0, '应该返回删除的键数量');

            // 4. 验证缓存已清除（再次查询不会命中缓存）
            const hits2 = stats2.hits;
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            const stats3 = msq._adapter.cache.getStats();
            // 缓存已清除，所以不会增加命中次数
            assert.strictEqual(stats3.hits, hits2, '缓存已清除，不应命中');
        });

        it('应该只清除指定集合的缓存，不影响其他集合', async () => {
            // 1. 缓存两个不同集合的查询
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            await collection('test').find({
                query: {},
                cache: 60000
            });

            // 2. 清除 products 集合的缓存
            await collection('products').invalidate();

            // 3. 验证 products 缓存已清除
            const hits1 = msq._adapter.cache.getStats().hits;
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            const hits2 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits2, hits1, 'products 缓存已清除');

            // 4. 验证 test 缓存仍然有效
            await collection('test').find({
                query: {},
                cache: 60000
            });
            const hits3 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits3, hits2 + 1, 'test 缓存应该仍然有效');
        });

        it('应该清除所有操作类型的缓存（find/findOne/count）', async () => {
            // 1. 缓存不同操作类型
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            await collection('products').findOne({
                query: { name: 'Product A' },
                cache: 60000
            });

            await collection('products').count({
                query: { category: 'electronics' },
                cache: 60000
            });

            // 2. 清除缓存
            await collection('products').invalidate();

            // 3. 验证所有类型的缓存都已清除
            const hits1 = msq._adapter.cache.getStats().hits;

            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            await collection('products').findOne({
                query: { name: 'Product A' },
                cache: 60000
            });

            await collection('products').count({
                query: { category: 'electronics' },
                cache: 60000
            });

            const hits2 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits2, hits1, '所有类型的缓存都应该已清除');
        });
    });

    describe('指定操作类型清除', () => {
        it('应该支持按操作类型清除缓存（op 参数）', async () => {
            // 1. 缓存不同操作类型
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            await collection('products').count({
                query: { category: 'electronics' },
                cache: 60000
            });

            // 2. 只清除 find 操作的缓存
            await collection('products').invalidate('find');

            // 3. 验证 find 缓存已清除
            const hits1 = msq._adapter.cache.getStats().hits;
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            const hits2 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits2, hits1, 'find 缓存已清除');

            // 4. 验证 count 缓存仍然有效
            await collection('products').count({
                query: { category: 'electronics' },
                cache: 60000
            });
            const hits3 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits3, hits2 + 1, 'count 缓存应该仍然有效');
        });
    });

    describe('边界情况', () => {
        it('应该在无缓存时正常工作', async () => {
            // 清空所有缓存
            await msq.cache.clear();

            // 在空缓存上调用 invalidate 不应该报错
            const deleted = await collection('products').invalidate();
            assert.strictEqual(deleted, 0, '应该返回 0');
        });

        it('应该在缓存禁用时正常工作', async () => {
            // 创建无缓存的实例
            const msqNoCache = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_invalidate_nocache',
                config: { useMemoryServer: true }
                // 不传 cache 配置
            });

            const conn = await msqNoCache.connect();

            // 应该不报错
            const deleted = await conn.collection('products').invalidate();
            assert.ok(deleted >= 0);

            await msqNoCache.close();
        });

        it('应该处理连续的 invalidate 调用', async () => {
            // 1. 缓存查询
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });

            // 2. 连续清除多次
            await collection('products').invalidate();
            await collection('products').invalidate();
            await collection('products').invalidate();

            // 3. 验证缓存确实已清除
            const hits1 = msq._adapter.cache.getStats().hits;
            await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            const hits2 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits2, hits1, '缓存应该已清除');
        });
    });

    describe('实际使用场景', () => {
        it('场景1: 外部工具修改数据后清除缓存', async () => {
            // 1. 查询并缓存
            const result1 = await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            assert.strictEqual(result1.length, 2);

            // 2. 模拟外部工具修改数据（直接操作 MongoDB）
            await nativeCollection.insertOne({
                name: 'Product D',
                category: 'electronics',
                price: 300
            });

            // 3. 清除缓存
            await collection('products').invalidate();

            // 4. 再次查询，应该获取最新数据（包含新插入的记录）
            const result2 = await collection('products').find({
                query: { category: 'electronics' },
                cache: 60000
            });
            assert.strictEqual(result2.length, 3, '应该获取最新数据');
        });

        it('场景2: 批量清除多个集合的缓存', async () => {
            // 1. 缓存多个集合
            await collection('products').find({ query: {}, cache: 60000 });
            await collection('test').find({ query: {}, cache: 60000 });

            // 2. 批量清除
            const collections = ['products', 'test'];
            for (const name of collections) {
                await collection(name).invalidate();
            }

            // 3. 验证所有缓存都已清除
            const hits1 = msq._adapter.cache.getStats().hits;
            await collection('products').find({ query: {}, cache: 60000 });
            await collection('test').find({ query: {}, cache: 60000 });
            const hits2 = msq._adapter.cache.getStats().hits;
            assert.strictEqual(hits2, hits1, '所有缓存都应该已清除');
        });
    });
});
