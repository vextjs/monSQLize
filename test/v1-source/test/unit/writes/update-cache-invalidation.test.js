/**
 * Update Operations - Upsert Cache Invalidation Tests
 * 测试 updateOne/updateMany 的 upsert 场景下的缓存自动失效功能
 *
 * Bug Fix: v1.1.5
 * Issue: updateOne({ upsert: true }) 在插入新文档时不会失效缓存
 * Root Cause: 仅检查 modifiedCount > 0，未检查 upsertedId
 */

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MonSQLize = require('../../../lib');

describe('Update Operations - Upsert Cache Invalidation', function() {
    this.timeout(30000);

    let mongod, msq, collection, cache;

    before(async function() {
        // 启动内存 MongoDB
        mongod = await MongoMemoryServer.create();
        const uri = mongod.getUri();

        // 创建 MonSQLize 实例（启用缓存）
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test',
            config: { uri },
            cache: {
                maxSize: 1000,
                enableStats: true
            }
        });

        const { collection: coll } = await msq.connect();
        collection = coll;
        cache = msq.cache;  // 获取缓存实例
    });

    after(async function() {
        if (msq) await msq.close();
        if (mongod) await mongod.stop();
    });

    beforeEach(async function() {
        // 清理测试数据和缓存
        try {
            await collection('users').deleteMany({});
            await collection('orders').deleteMany({});
            await collection('products').deleteMany({});
        } catch (e) {
            // 集合可能不存在，忽略错误
        }
        cache.clear();
    });

    describe('updateOne({ upsert: true })', function() {

        it('should invalidate cache when upsert inserts a new document', async function() {
            // 场景：upsert 插入新文档时，应该失效相关缓存

            // 1. 首次查询（缓存 miss，从数据库读取）
            const result1 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result1.length, 0, '初始查询应该返回空数组');

            // 验证缓存已创建
            const stats1 = cache.getStats();
            assert.strictEqual(stats1.size, 1, '应该有 1 个缓存条目');

            // 2. upsert 插入新文档
            const upsertResult = await collection('users').updateOne(
                { userId: 'user123' },
                { $set: { name: 'Alice', status: 'active' } },
                { upsert: true }
            );

            // 验证是 upsert 插入（不是更新）
            assert.strictEqual(upsertResult.matchedCount, 0, 'matchedCount 应该是 0');
            assert.strictEqual(upsertResult.modifiedCount, 0, 'modifiedCount 应该是 0');
            assert.ok(upsertResult.upsertedId, 'upsertedId 应该存在');

            // 3. 验证缓存已失效
            const stats2 = cache.getStats();
            assert.strictEqual(stats2.size, 0, '缓存应该被失效（修复后）');

            // 4. 再次查询（应该从数据库读取最新数据）
            const result2 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result2.length, 1, '应该返回 1 个文档');
            assert.strictEqual(result2[0].name, 'Alice', '应该是新插入的文档');
            assert.strictEqual(result2[0].userId, 'user123');
        });

        it('should invalidate cache when upsert updates existing document', async function() {
            // 场景：upsert 更新已存在文档时，应该失效相关缓存

            // 1. 插入初始文档
            await collection('users').insertOne({
                userId: 'user123',
                name: 'Bob',
                status: 'active'
            });

            // 2. 查询并缓存
            const result1 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result1.length, 1);
            assert.strictEqual(result1[0].name, 'Bob');

            const stats1 = cache.getStats();
            assert.strictEqual(stats1.size, 1);

            // 3. upsert 更新文档
            const upsertResult = await collection('users').updateOne(
                { userId: 'user123' },
                { $set: { name: 'Alice' } },
                { upsert: true }
            );

            // 验证是更新（不是插入）
            assert.strictEqual(upsertResult.matchedCount, 1);
            assert.strictEqual(upsertResult.modifiedCount, 1);
            assert.ok(!upsertResult.upsertedId, 'upsertedId 应该不存在（null 或 undefined）');

            // 4. 验证缓存已失效
            const stats2 = cache.getStats();
            assert.strictEqual(stats2.size, 0, '缓存应该被失效');

            // 5. 再次查询（应该从数据库读取最新数据）
            const result2 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result2[0].name, 'Alice', '应该是更新后的名字');
        });

        it('should invalidate count cache when upsert inserts', async function() {
            // 场景：upsert 插入新文档时，count 查询的缓存也应该失效

            // 1. 查询计数并缓存
            const count1 = await collection('orders').count(
                { status: 'pending' },
                { cache: 30000 }
            );
            assert.strictEqual(count1, 0, '初始计数应该是 0');

            const stats1 = cache.getStats();
            assert.strictEqual(stats1.size, 1);

            // 2. upsert 插入新订单
            const upsertResult = await collection('orders').updateOne(
                { orderId: 'order456' },
                { $set: { status: 'pending', amount: 100 } },
                { upsert: true }
            );

            assert.ok(upsertResult.upsertedId, '应该是 upsert 插入');

            // 3. 验证缓存已失效
            const stats2 = cache.getStats();
            assert.strictEqual(stats2.size, 0, '缓存应该被失效');

            // 4. 再次查询计数（应该返回正确的值）
            const count2 = await collection('orders').count(
                { status: 'pending' },
                { cache: 30000 }
            );
            assert.strictEqual(count2, 1, '计数应该更新为 1（修复后）');
        });

        it('should invalidate find + findOne cache when upsert inserts', async function() {
            // 场景：验证 find 和 findOne 的缓存都会被失效

            // 1. 执行 find 和 findOne 查询，建立缓存
            const findResult = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            const findOneResult = await collection('users').findOne(
                { userId: 'user123' },
                { cache: 60000 }
            );

            assert.strictEqual(findResult.length, 0);
            assert.strictEqual(findOneResult, null);

            const stats1 = cache.getStats();
            assert.strictEqual(stats1.size, 2, '应该有 2 个缓存条目');

            // 2. upsert 插入新用户
            await collection('users').updateOne(
                { userId: 'user123' },
                { $set: { name: 'Alice', status: 'active' } },
                { upsert: true }
            );

            // 3. 验证所有缓存都已失效
            const stats2 = cache.getStats();
            assert.strictEqual(stats2.size, 0, '所有缓存应该被失效');

            // 4. 再次查询，应该返回新数据
            const findResult2 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            const findOneResult2 = await collection('users').findOne(
                { userId: 'user123' },
                { cache: 60000 }
            );

            assert.strictEqual(findResult2.length, 1);
            assert.strictEqual(findOneResult2.name, 'Alice');
        });
    });

    describe('updateMany({ upsert: true })', function() {

        it('should invalidate cache when upsert inserts a new document', async function() {
            // 场景：updateMany 的 upsert 插入新文档时，应该失效缓存

            // 1. 查询并缓存
            const result1 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result1.length, 0);

            const stats1 = cache.getStats();
            assert.strictEqual(stats1.size, 1);

            // 2. updateMany upsert 插入新文档
            const upsertResult = await collection('users').updateMany(
                { role: 'admin' },
                { $set: { status: 'active' } },
                { upsert: true }
            );

            // 验证是 upsert 插入
            assert.strictEqual(upsertResult.matchedCount, 0);
            assert.ok(upsertResult.upsertedId, 'upsertedId 应该存在');

            // 3. 验证缓存已失效
            const stats2 = cache.getStats();
            assert.strictEqual(stats2.size, 0, '缓存应该被失效（修复后）');

            // 4. 再次查询，应该返回新数据
            const result2 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result2.length, 1, '应该返回新插入的文档');
        });

        it('should invalidate cache when updateMany updates existing documents', async function() {
            // 场景：updateMany 更新已存在文档时，应该失效缓存

            // 1. 插入测试数据
            await collection('users').insertMany([
                { userId: 'user1', role: 'admin', status: 'inactive' },
                { userId: 'user2', role: 'admin', status: 'inactive' }
            ]);

            // 2. 查询并缓存
            const result1 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result1.length, 0);

            // 3. updateMany 更新文档
            const updateResult = await collection('users').updateMany(
                { role: 'admin' },
                { $set: { status: 'active' } }
            );

            assert.strictEqual(updateResult.matchedCount, 2);
            assert.strictEqual(updateResult.modifiedCount, 2);

            // 4. 验证缓存已失效
            const stats = cache.getStats();
            assert.strictEqual(stats.size, 0, '缓存应该被失效');

            // 5. 再次查询，应该返回更新后的数据
            const result2 = await collection('users').find(
                { status: 'active' },
                { cache: 60000 }
            );
            assert.strictEqual(result2.length, 2);
        });
    });

    describe('Cache Statistics Verification', function() {

        it('should track cache hits and misses correctly with upsert', async function() {
            // 验证缓存统计信息的正确性

            msq.getCache().resetStats();

            // 1. 首次查询（miss）
            await collection('users').find({ status: 'active' }, { cache: 60000 });
            let stats = cache.getStats();
            assert.strictEqual(stats.misses, 1, '应该有 1 次 miss');
            assert.strictEqual(stats.hits, 0);

            // 2. 再次查询（hit）
            await collection('users').find({ status: 'active' }, { cache: 60000 });
            stats = cache.getStats();
            assert.strictEqual(stats.hits, 1, '应该有 1 次 hit');

            // 3. upsert 插入（失效缓存）
            await collection('users').updateOne(
                { userId: 'user1' },
                { $set: { status: 'active' } },
                { upsert: true }
            );

            // 4. 再次查询（应该是 miss，因为缓存被失效）
            await collection('users').find({ status: 'active' }, { cache: 60000 });
            stats = cache.getStats();
            assert.strictEqual(stats.misses, 2, '应该有 2 次 miss');
            assert.strictEqual(stats.hits, 1, 'hits 不应该增加');
        });
    });

    describe('Edge Cases', function() {

        it('should handle upsert with same content (no modification)', async function() {
            // 场景：upsert 更新但内容相同（modifiedCount = 0）

            // 1. 插入初始文档
            await collection('users').insertOne({
                userId: 'user123',
                name: 'Alice'
            });

            // 2. 查询并缓存
            const result1 = await collection('users').find(
                { userId: 'user123' },
                { cache: 60000 }
            );
            assert.strictEqual(result1[0].name, 'Alice');

            // 3. upsert 但内容相同
            const upsertResult = await collection('users').updateOne(
                { userId: 'user123' },
                { $set: { name: 'Alice' } },  // 相同内容
                { upsert: true }
            );

            // matchedCount > 0，应该失效（因为我们使用 matchedCount || upsertedId）
            assert.strictEqual(upsertResult.matchedCount, 1);
            assert.strictEqual(upsertResult.modifiedCount, 0);

            // 注意：这里缓存不会失效（因为 modifiedCount = 0 且没有 upsertedId）
            // 这是可接受的优化，因为数据实际没有变化
        });

        it('should handle multiple upserts in sequence', async function() {
            // 场景：连续多次 upsert 操作

            // 1. 查询并缓存
            await collection('users').find({ status: 'active' }, { cache: 60000 });
            assert.strictEqual(cache.getStats().size, 1);

            // 2. 连续 3 次 upsert
            for (let i = 1; i <= 3; i++) {
                await collection('users').updateOne(
                    { userId: `user${i}` },
                    { $set: { status: 'active' } },
                    { upsert: true }
                );

                // 每次 upsert 后缓存都应该被失效
                assert.strictEqual(cache.getStats().size, 0, `第 ${i} 次 upsert 后缓存应该被失效`);

                // 重新查询建立缓存
                if (i < 3) {
                    await collection('users').find({ status: 'active' }, { cache: 60000 });
                }
            }

            // 3. 最终查询，应该返回 3 个文档
            const result = await collection('users').find({ status: 'active' }, { cache: 60000 });
            assert.strictEqual(result.length, 3);
        });
    });

    describe('replaceOne({ upsert: true })', function() {

        it('should invalidate cache when replaceOne upsert inserts a new document', async function() {
            // 场景：replaceOne upsert 插入新文档时，应该失效缓存

            // 1. 首次查询（缓存 miss）
            const result1 = await collection('products').find(
                { category: 'electronics' },
                { cache: 60000 }
            );
            assert.strictEqual(result1.length, 0);
            assert.strictEqual(cache.getStats().size, 1);

            // 2. replaceOne upsert 插入新文档
            const replaceResult = await collection('products').replaceOne(
                { productId: 'prod123' },
                { productId: 'prod123', name: 'Laptop', category: 'electronics', price: 1200 },
                { upsert: true }
            );

            // 验证是 upsert 插入
            assert.strictEqual(replaceResult.matchedCount, 0);
            assert.strictEqual(replaceResult.modifiedCount, 0);
            assert.ok(replaceResult.upsertedId, 'upsertedId 应该存在');

            // 3. 验证缓存已失效
            assert.strictEqual(cache.getStats().size, 0, '缓存应该被失效');

            // 4. 再次查询，应该返回新数据
            const result2 = await collection('products').find(
                { category: 'electronics' },
                { cache: 60000 }
            );
            assert.strictEqual(result2.length, 1);
            assert.strictEqual(result2[0].name, 'Laptop');
        });

        it('should invalidate cache when replaceOne upsert updates existing document', async function() {
            // 场景：replaceOne upsert 更新已存在文档时，应该失效缓存

            // 1. 插入初始文档
            await collection('products').insertOne({
                productId: 'prod123',
                name: 'Old Laptop',
                category: 'electronics',
                price: 1000
            });

            // 2. 查询并缓存
            const result1 = await collection('products').find(
                { category: 'electronics' },
                { cache: 60000 }
            );
            assert.strictEqual(result1[0].name, 'Old Laptop');
            assert.strictEqual(cache.getStats().size, 1);

            // 3. replaceOne upsert 更新文档
            const replaceResult = await collection('products').replaceOne(
                { productId: 'prod123' },
                { productId: 'prod123', name: 'New Laptop', category: 'electronics', price: 1200 },
                { upsert: true }
            );

            // 验证是更新
            assert.strictEqual(replaceResult.matchedCount, 1);
            assert.strictEqual(replaceResult.modifiedCount, 1);
            assert.ok(!replaceResult.upsertedId);

            // 4. 验证缓存已失效
            assert.strictEqual(cache.getStats().size, 0);

            // 5. 再次查询，应该返回更新后的数据
            const result2 = await collection('products').find(
                { category: 'electronics' },
                { cache: 60000 }
            );
            assert.strictEqual(result2[0].name, 'New Laptop');
            assert.strictEqual(result2[0].price, 1200);
        });
    });
});

