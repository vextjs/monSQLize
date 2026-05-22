/**
 * 索引管理功能测试套件
 *
 * 测试范围：
 * - createIndex: 创建单个索引
 * - createIndexes: 批量创建索引
 * - listIndexes: 列出所有索引
 * - dropIndex: 删除指定索引
 * - dropIndexes: 删除所有索引
 * - 索引选项：unique, sparse, TTL, partial, collation, hidden
 * - 错误处理和边界情况
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

// 测试配置
const TEST_CONFIG = {
    type: 'mongodb',
    databaseName: 'test_indexes',
    config: {
        useMemoryServer: true
    }
};

describe('🔑 索引管理测试套件', function() {
    this.timeout(10000);

    let msq;
    let collection;
    let testCollName;

    beforeEach(async function() {
        // 使用时间戳生成唯一集合名
        testCollName = `test_index_ops_${Date.now()}`;

        msq = new MonSQLize(TEST_CONFIG);
        const { collection: coll } = await msq.connect();
        collection = coll;

        // 插入一些测试数据
        const testColl = collection(testCollName);
        await testColl.insertMany([
            { email: 'alice@example.com', age: 25, city: 'Beijing', createdAt: new Date() },
            { email: 'bob@example.com', age: 30, city: 'Shanghai', createdAt: new Date() },
            { email: 'charlie@example.com', age: 35, city: 'Beijing', createdAt: new Date() }
        ]);
    });

    afterEach(async function() {
        if (msq && collection && testCollName) {
            try {
                const testColl = collection(testCollName);
                await testColl.drop();
            } catch (err) {
                // 忽略删除错误
            }
        }
        if (msq) {
            await msq.close();
        }
    });

    describe('📝 createIndex - 创建单个索引', function() {

        it('应该创建基本的单字段升序索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex({ email: 1 });

            assert.ok(result);
            assert.ok(result.name);
            assert.strictEqual(result.name, 'email_1');
        });

        it('应该创建基本的单字段降序索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex({ age: -1 });

            assert.ok(result);
            assert.strictEqual(result.name, 'age_-1');
        });

        it('应该创建复合索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex({ city: 1, age: -1 });

            assert.ok(result);
            assert.strictEqual(result.name, 'city_1_age_-1');
        });

        it('应该创建唯一索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex(
                { email: 1 },
                { unique: true, name: 'email_unique' }
            );

            assert.ok(result);
            assert.strictEqual(result.name, 'email_unique');

            // 验证唯一约束生效
            try {
                await testColl.insertOne({ email: 'alice@example.com', age: 40 });
                assert.fail('应该抛出重复键错误');
            } catch (err) {
                assert.ok(err.message.includes('duplicate key') || err.code === 11000);
            }
        });

        it('应该创建稀疏索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex(
                { optional: 1 },
                { sparse: true }
            );

            assert.ok(result);

            // 验证稀疏索引：可以插入多个缺少该字段的文档
            await testColl.insertOne({ name: 'test1' });
            await testColl.insertOne({ name: 'test2' });

            // 这两个插入应该都成功（稀疏索引不索引缺失字段）
        });

        it('应该创建 TTL 索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: 3600 }
            );

            assert.ok(result);

            // 验证索引包含 TTL 选项
            const indexes = await testColl.listIndexes();
            const ttlIndex = indexes.find(idx => idx.name === result.name);
            assert.ok(ttlIndex);
            assert.strictEqual(ttlIndex.expireAfterSeconds, 3600);
        });

        it('应该创建部分索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex(
                { age: 1 },
                {
                    partialFilterExpression: { age: { $gte: 18 } },
                    name: 'age_adult'
                }
            );

            assert.ok(result);
            assert.strictEqual(result.name, 'age_adult');
        });

        it('应该支持自定义索引名称', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndex(
                { email: 1 },
                { name: 'my_custom_index' }
            );

            assert.strictEqual(result.name, 'my_custom_index');
        });

        it('应该在索引已存在时抛出错误', async function() {
            const testColl = collection(testCollName);

            // 第一次创建成功
            await testColl.createIndex({ email: 1 });

            // 第二次应该失败
            try {
                await testColl.createIndex({ email: 1 });
                assert.fail('应该抛出索引已存在错误');
            } catch (err) {
                assert.ok(err.message.includes('索引已存在') || err.code === 'MONGODB_ERROR');
            }
        });

        it('应该在索引键为空时抛出错误', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.createIndex({});
                assert.fail('应该抛出参数错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('index keys must not be empty'));
            }
        });

        it('应该在索引键无效时抛出错误', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.createIndex({ email: 2 }); // 2 是无效值
                assert.fail('应该抛出参数错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    describe('📝📝 createIndexes - 批量创建索引', function() {

        it('应该批量创建多个索引', async function() {
            const testColl = collection(testCollName);

            const result = await testColl.createIndexes([
                { key: { email: 1 }, unique: true },
                { key: { age: 1 } },
                { key: { city: 1, age: -1 } }
            ]);

            assert.ok(Array.isArray(result));
            assert.strictEqual(result.length, 3);
        });

        it('应该在 indexSpecs 为空数组时抛出错误', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.createIndexes([]);
                assert.fail('应该抛出参数错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });

        it('应该在 indexSpecs 缺少 key 时抛出错误', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.createIndexes([
                    { name: 'test' } // 缺少 key
                ]);
                assert.fail('应该抛出参数错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    describe('📋 listIndexes - 列出所有索引', function() {

        it('应该列出所有索引（包括默认的 _id 索引）', async function() {
            const testColl = collection(testCollName);

            const indexes = await testColl.listIndexes();

            assert.ok(Array.isArray(indexes));
            assert.ok(indexes.length >= 1); // 至少有 _id 索引

            const idIndex = indexes.find(idx => idx.name === '_id_');
            assert.ok(idIndex);
            assert.deepStrictEqual(idIndex.key, { _id: 1 });
        });

        it('应该列出用户创建的索引', async function() {
            const testColl = collection(testCollName);

            // 创建几个索引
            await testColl.createIndex({ email: 1 }, { unique: true });
            await testColl.createIndex({ age: 1 });

            const indexes = await testColl.listIndexes();

            assert.ok(indexes.length >= 3); // _id + email + age

            const emailIndex = indexes.find(idx => idx.name === 'email_1');
            assert.ok(emailIndex);
            assert.strictEqual(emailIndex.unique, true);

            const ageIndex = indexes.find(idx => idx.name === 'age_1');
            assert.ok(ageIndex);
        });

        it('应该在集合不存在时返回空数组', async function() {
            const testColl = collection('nonexistent_collection');

            const indexes = await testColl.listIndexes();

            assert.ok(Array.isArray(indexes));
            assert.strictEqual(indexes.length, 0);
        });
    });

    describe('🗑️ dropIndex - 删除指定索引', function() {

        it('应该删除指定的索引', async function() {
            const testColl = collection(testCollName);

            // 创建索引
            await testColl.createIndex({ email: 1 });

            // 验证索引存在
            let indexes = await testColl.listIndexes();
            assert.ok(indexes.some(idx => idx.name === 'email_1'));

            // 删除索引
            const result = await testColl.dropIndex('email_1');
            assert.ok(result);

            // 验证索引已删除
            indexes = await testColl.listIndexes();
            assert.ok(!indexes.some(idx => idx.name === 'email_1'));
        });

        it('should throw when index does not exist', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.dropIndex('nonexistent_index');
                assert.fail('should throw index-not-found error');
            } catch (err) {
                assert.strictEqual(err.code, 'MONGODB_ERROR');
                assert.ok(err.message.includes('Index does not exist'));
            }
        });

        it('应该禁止删除 _id 索引', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.dropIndex('_id_');
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
                assert.ok(err.message.includes('dropping the _id index is not allowed'));
            }
        });

        it('应该在 indexName 为空时抛出错误', async function() {
            const testColl = collection(testCollName);

            try {
                await testColl.dropIndex('');
                assert.fail('应该抛出参数错误');
            } catch (err) {
                assert.strictEqual(err.code, 'INVALID_ARGUMENT');
            }
        });
    });

    describe('🗑️🗑️ dropIndexes - 删除所有索引', function() {

        it('应该删除所有索引（_id 索引除外）', async function() {
            const testColl = collection(testCollName);

            // 创建多个索引
            await testColl.createIndex({ email: 1 });
            await testColl.createIndex({ age: 1 });
            await testColl.createIndex({ city: 1 });

            // 验证索引存在
            let indexes = await testColl.listIndexes();
            assert.ok(indexes.length >= 4); // _id + 3 个自定义索引

            // 删除所有索引
            const result = await testColl.dropIndexes();
            assert.ok(result);

            // 验证只剩下 _id 索引
            indexes = await testColl.listIndexes();
            assert.strictEqual(indexes.length, 1);
            assert.strictEqual(indexes[0].name, '_id_');
        });

        it('应该在集合不存在时正常返回', async function() {
            const testColl = collection('nonexistent_collection');

            const result = await testColl.dropIndexes();
            assert.ok(result);
        });
    });

    describe('🔧 实际使用场景', function() {

        it('场景 1: 创建唯一邮箱索引并验证', async function() {
            const users = collection('users_' + Date.now());

            // 清理
            try { await users.drop(); } catch (err) { /* 忽略 */ }

            // 插入初始数据
            await users.insertOne({ email: 'user1@example.com', name: 'User 1' });

            // 创建唯一索引
            await users.createIndex({ email: 1 }, { unique: true });

            // 尝试插入重复邮箱（应该失败）
            try {
                await users.insertOne({ email: 'user1@example.com', name: 'User 2' });
                assert.fail('应该抛出重复键错误');
            } catch (err) {
                assert.ok(err.code === 11000 || err.message.includes('duplicate key'));
            }
        });

        it('场景 2: 复合索引优化查询', async function() {
            const orders = collection('orders_' + Date.now());

            // 清理
            try { await orders.drop(); } catch (err) { /* 忽略 */ }

            // 插入测试数据
            await orders.insertMany([
                { userId: 'user1', status: 'pending', amount: 100 },
                { userId: 'user1', status: 'completed', amount: 200 },
                { userId: 'user2', status: 'pending', amount: 150 }
            ]);

            // 创建复合索引
            await orders.createIndex({ userId: 1, status: 1 });

            // 查询（应该使用索引）
            const result = await orders.find({ userId: 'user1', status: 'pending' });
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].amount, 100);
        });

        it('场景 3: TTL 索引自动清理过期数据', async function() {
            const sessions = collection('sessions_' + Date.now());

            // 清理
            try { await sessions.drop(); } catch (err) { /* 忽略 */ }

            // 创建 TTL 索引（1 秒后过期）
            await sessions.createIndex(
                { createdAt: 1 },
                { expireAfterSeconds: 1 }
            );

            // 插入会话数据
            await sessions.insertOne({
                sessionId: 'session1',
                createdAt: new Date()
            });

            // 验证索引存在并包含 TTL 选项
            const indexes = await sessions.listIndexes();
            const ttlIndex = indexes.find(idx => idx.key.createdAt === 1);
            assert.ok(ttlIndex);
            assert.strictEqual(ttlIndex.expireAfterSeconds, 1);

            // 注意：实际的 TTL 清理由 MongoDB 后台线程执行，测试中不等待
        });

        it('场景 4: 管理多个索引', async function() {
            const products = collection('products_' + Date.now());

            // 清理
            try { await products.drop(); } catch (err) { /* 忽略 */ }

            // 插入数据
            await products.insertMany([
                { name: 'Product 1', category: 'electronics', price: 100 },
                { name: 'Product 2', category: 'books', price: 20 }
            ]);

            // 批量创建索引
            await products.createIndexes([
                { key: { name: 1 } },
                { key: { category: 1, price: -1 } },
                { key: { price: 1 } }
            ]);

            // 列出所有索引
            const indexes = await products.listIndexes();
            assert.ok(indexes.length >= 4); // _id + 3 个自定义

            // 删除不需要的索引
            await products.dropIndex('price_1');

            // 验证索引已删除
            const remainingIndexes = await products.listIndexes();
            assert.ok(!remainingIndexes.some(idx => idx.name === 'price_1'));
        });
    });
});

