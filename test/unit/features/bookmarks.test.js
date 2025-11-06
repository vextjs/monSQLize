// bookmarks.test.js - Bookmark 维护 APIs 测试
const assert = require('assert');
const MonSQLize = require('../../../lib');

describe('Bookmark 维护 APIs', function() {
    this.timeout(30000);

    let client, accessor, db, testData;

    before(async function() {
        // config.useMemoryServer = true 时，MonSQLize 内部会自动创建 MongoMemoryServer
        client = new MonSQLize({ 
            type: 'mongodb',
            databaseName: 'test_bookmarks',
            config: { useMemoryServer: true },
            cache: { enabled: true, maxSize: 1000 }, // 启用缓存
            defaults: { limit: 5, bookmarkTTL: 5000 } 
        });
        const dbAccessor = await client.connect();
        accessor = dbAccessor.collection('users');
        db = client._adapter.db;

        // 插入 50 条测试数据（使用原生 collection）
        const usersCollection = db.collection('users');
        testData = Array.from({ length: 50 }, (_, i) => ({
            _id: `user-${String(i + 1).padStart(3, '0')}`,
            name: `User ${i + 1}`,
            score: (i + 1) * 10,
        }));
        await usersCollection.insertMany(testData);
    });

    after(async function() {
        if (client) await client.close();
    });

    describe('prewarmBookmarks', function() {
        it('应成功预热指定页面的 bookmark', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = { sort: { _id: 1 }, limit: 5 };
            const result = await accessor.prewarmBookmarks(keyDims, [1, 2, 3]);

            assert.strictEqual(result.warmed, 3);
            assert.strictEqual(result.failed, 0);
            assert.strictEqual(result.keys.length, 3);

            // 验证 bookmark 已缓存
            const list = await accessor.listBookmarks(keyDims);
            assert.deepStrictEqual(list.pages, [1, 2, 3]);
        });

        it('应跳过无效的页码', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = { sort: { _id: 1 }, limit: 5 };
            const result = await accessor.prewarmBookmarks(keyDims, [1, 0, -1, 'invalid', null]);

            assert.strictEqual(result.warmed, 1); // 只有 page 1 成功
            assert(result.failed >= 4, '失败数应至少为 4');
        });

        it('应在超出数据范围时失败', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = { sort: { _id: 1 }, limit: 5 };
            const result = await accessor.prewarmBookmarks(keyDims, [100, 200]); // 超出范围

            assert(result.failed > 0, '应有失败的预热操作');
        });

        it('应支持复杂查询的 bookmark', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = {
                query: { score: { $gte: 200 } },
                sort: { score: -1 },
                limit: 3,
            };
            const result = await accessor.prewarmBookmarks(keyDims, [1, 2]);

            assert(result.warmed > 0, '应有成功预热的 bookmark');
            assert.strictEqual(result.keys.length, result.warmed);
        });

        it('应在无缓存时抛出错误', async function() {
            // 临时移除 cache
            const originalCache = client._adapter.cache;
            client._adapter.cache = null;

            await assert.rejects(
                async () => accessor.prewarmBookmarks({ sort: { _id: 1 }, limit: 5 }, [1]),
                /CACHE_UNAVAILABLE/
            );

            // 恢复缓存
            client._adapter.cache = originalCache;
        });

        it('应在 pages 为空时抛出错误', async function() {
            await assert.rejects(
                async () => accessor.prewarmBookmarks({ sort: { _id: 1 }, limit: 5 }, []),
                /INVALID_PAGES/
            );
        });
    });

    describe('listBookmarks', function() {
        it('应列出特定查询的 bookmark', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = { sort: { _id: 1 }, limit: 5 };
            await accessor.prewarmBookmarks(keyDims, [1, 2, 3]); // 连续页

            const result = await accessor.listBookmarks(keyDims);

            // prewarmBookmarks 会缓存从 page 1 到最大页的所有中间页
            assert(result.count >= 3, `至少应有 3 个 bookmark，实际: ${result.count}`);
            assert(result.pages.includes(1) && result.pages.includes(2) && result.pages.includes(3), '应包含预热的页码');
        });

        it('应列出所有 bookmark（不传 keyDims）', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims1 = { sort: { _id: 1 }, limit: 5 };
            const keyDims2 = { sort: { score: -1 }, limit: 3 };

            await accessor.prewarmBookmarks(keyDims1, [1, 2]);
            await accessor.prewarmBookmarks(keyDims2, [1]);

            const result = await accessor.listBookmarks(); // 不传参数

            assert(result.count >= 3, '至少应有 3 个 bookmark');
            assert(result.pages.length >= 3, '页码数组至少应有 3 个元素');
        });

        it('应在无 bookmark 时返回空结果', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = { sort: { _id: 1 }, limit: 5 };
            const result = await accessor.listBookmarks(keyDims);

            assert.strictEqual(result.count, 0);
            assert.deepStrictEqual(result.pages, []);
            assert.deepStrictEqual(result.keys, []);
        });

        it('应在无缓存时抛出错误', async function() {
            const originalCache = client._adapter.cache;
            client._adapter.cache = null;

            await assert.rejects(
                async () => accessor.listBookmarks({ sort: { _id: 1 }, limit: 5 }),
                /CACHE_UNAVAILABLE/
            );

            client._adapter.cache = originalCache;
        });
    });

    describe('clearBookmarks', function() {
        it('应清除特定查询的 bookmark', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims1 = { sort: { _id: 1 }, limit: 5 };
            const keyDims2 = { sort: { score: -1 }, limit: 3 };

            await accessor.prewarmBookmarks(keyDims1, [1, 2, 3]);
            await accessor.prewarmBookmarks(keyDims2, [1]);

            const result = await accessor.clearBookmarks(keyDims1);

            assert(result.cleared >= 3, '至少应清除 3 个 bookmark');
            assert(result.pattern.includes(':bm:'), 'pattern 应包含 :bm:');

            // 验证只清除了 keyDims1
            const list1 = await accessor.listBookmarks(keyDims1);
            const list2 = await accessor.listBookmarks(keyDims2);
            assert.strictEqual(list1.count, 0);
            assert.strictEqual(list2.count, 1); // keyDims2 未被清除
        });

        it('应清除所有 bookmark（不传 keyDims）', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims1 = { sort: { _id: 1 }, limit: 5 };
            const keyDims2 = { sort: { score: -1 }, limit: 3 };

            await accessor.prewarmBookmarks(keyDims1, [1, 2]);
            await accessor.prewarmBookmarks(keyDims2, [1]);

            const result = await accessor.clearBookmarks(); // 不传参数

            assert(result.cleared >= 3, '至少应清除 3 个 bookmark');
            assert(result.pattern.includes(':bm:*'), 'pattern 应包含 :bm:*');

            // 验证所有 bookmark 已清除
            const list = await accessor.listBookmarks();
            assert.strictEqual(list.count, 0);
        });

        it('应在无 bookmark 时返回 0', async function() {
            await accessor.clearBookmarks(); // 清空缓存
            
            const keyDims = { sort: { _id: 1 }, limit: 5 };
            const result = await accessor.clearBookmarks(keyDims);

            assert.strictEqual(result.cleared, 0);
            assert.strictEqual(result.keysBefore, 0);
        });

        it('应在无缓存时抛出错误', async function() {
            const originalCache = client._adapter.cache;
            client._adapter.cache = null;

            await assert.rejects(
                async () => accessor.clearBookmarks({ sort: { _id: 1 }, limit: 5 }),
                /CACHE_UNAVAILABLE/
            );

            client._adapter.cache = originalCache;
        });
    });

    describe('完整工作流', function() {
        it('应支持 预热 → 列出 → 清除 完整流程', async function() {
            const keyDims = {
                query: { score: { $gte: 100 } },
                sort: { score: 1 },
                limit: 10,
            };

            // 1. 预热
            const prewarmResult = await accessor.prewarmBookmarks(keyDims, [1, 2, 3]);
            assert(prewarmResult.warmed > 0, '应有成功预热的 bookmark');

            // 2. 列出
            const listResult = await accessor.listBookmarks(keyDims);
            assert.strictEqual(listResult.count, prewarmResult.warmed);
            assert.strictEqual(listResult.pages.length, prewarmResult.warmed);

            // 3. 清除
            const clearResult = await accessor.clearBookmarks(keyDims);
            assert.strictEqual(clearResult.cleared, prewarmResult.warmed);

            // 4. 验证已清除
            const finalList = await accessor.listBookmarks(keyDims);
            assert.strictEqual(finalList.count, 0);
        });

        it('应支持多个查询的 bookmark 独立管理', async function() {
            const keyDims1 = { sort: { _id: 1 }, limit: 5 };
            const keyDims2 = { sort: { score: -1 }, limit: 10 };
            const keyDims3 = {
                query: { score: { $gte: 250 } },
                sort: { _id: -1 },
                limit: 3,
            };

            // 预热三个查询
            await accessor.prewarmBookmarks(keyDims1, [1, 2]);
            await accessor.prewarmBookmarks(keyDims2, [1]);
            await accessor.prewarmBookmarks(keyDims3, [1, 2, 3]);

            // 验证各自独立
            const list1 = await accessor.listBookmarks(keyDims1);
            const list2 = await accessor.listBookmarks(keyDims2);
            const list3 = await accessor.listBookmarks(keyDims3);

            assert.deepStrictEqual(list1.pages, [1, 2]);
            assert.deepStrictEqual(list2.pages, [1]);
            assert.deepStrictEqual(list3.pages, [1, 2, 3]);

            // 清除 keyDims2
            await accessor.clearBookmarks(keyDims2);

            // 验证只清除了 keyDims2
            const after1 = await accessor.listBookmarks(keyDims1);
            const after2 = await accessor.listBookmarks(keyDims2);
            const after3 = await accessor.listBookmarks(keyDims3);

            assert.strictEqual(after1.count, 2);
            assert.strictEqual(after2.count, 0);
            assert.strictEqual(after3.count, 3);
        });
    });
});

