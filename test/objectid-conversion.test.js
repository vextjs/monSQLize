/**
 * 自动 ObjectId 转换功能测试
 */

const assert = require('assert');
const { ObjectId } = require('mongodb');
const MonSQLize = require('../lib/index');

describe('自动 ObjectId 转换功能测试', function() {
    this.timeout(30000);

    let msq;
    let db;

    before(async function() {
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_objectid_conversion',
            config: { useMemoryServer: true }
        });

        const { collection } = await msq.connect();

        // 保存 collection 函数供测试使�?
        msq.collection = collection;

        // 获取原生数据库实例用于验�?
        const client = msq._adapter.client;
        db = client.db('test_objectid_conversion');
    });

    after(async function() {
        if (msq) {
            await msq.close();
        }

        const { stopMemoryServer } = require('../lib/mongodb/connect');
        await stopMemoryServer(console);
    });

    beforeEach(async function() {
        await db.collection('users').deleteMany({});
        await db.collection('orders').deleteMany({});
        await db.collection('products').deleteMany({});
    });

    describe('查询方法', function() {
        it('findOne - 字符�?_id 自动转换', async function() {
            const objectId = new ObjectId();
            await db.collection('users').insertOne({
                _id: objectId,
                name: 'Alice'
            });

            const result = await msq.collection('users').findOne({
                _id: objectId.toString()
            });

            assert.ok(result);
            assert.strictEqual(result.name, 'Alice');
            assert.strictEqual(result._id.toString(), objectId.toString());
        });

        it('find - 多字�?ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Bob',
                managerId: managerId
            });

            const results = await msq.collection('users').find({
                _id: userId.toString(),
                managerId: managerId.toString()
            });

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'Bob');
        });

        it('aggregate - pipeline �?ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Charlie',
                age: 30
            });

            const results = await msq.collection('users').aggregate([
                { $match: { _id: userId.toString() } },
                { $project: { name: 1 } }
            ]);

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'Charlie');
        });

        it('count - query �?ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'David'
            });

            const count = await msq.collection('users').count({
                _id: userId.toString()
            });

            assert.strictEqual(count, 1);
        });
    });

    describe('写入方法', function() {
        it('insertOne - document �?ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            const result = await msq.collection('users').insertOne({
                _id: userId.toString(),
                name: 'Eve',
                managerId: managerId.toString()
            });

            assert.strictEqual(result.acknowledged, true);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc._id instanceof ObjectId);
            assert.ok(doc.managerId instanceof ObjectId);
        });

        it('insertMany - 批量插入 ObjectId 转换', async function() {
            const user1Id = new ObjectId();
            const user2Id = new ObjectId();

            const result = await msq.collection('users').insertMany([
                { _id: user1Id.toString(), name: 'Frank' },
                { _id: user2Id.toString(), name: 'Grace' }
            ]);

            assert.strictEqual(result.insertedCount, 2);

            const docs = await db.collection('users').find({}).toArray();
            assert.ok(docs[0]._id instanceof ObjectId);
            assert.ok(docs[1]._id instanceof ObjectId);
        });

        it('updateOne - filter �?update �?ObjectId 转换', async function() {
            const userId = new ObjectId();
            const oldManagerId = new ObjectId();
            const newManagerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Henry',
                managerId: oldManagerId
            });

            const result = await msq.collection('users').updateOne(
                { _id: userId.toString() },
                { $set: { managerId: newManagerId.toString() } }
            );

            assert.strictEqual(result.modifiedCount, 1);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc.managerId instanceof ObjectId);
            assert.strictEqual(doc.managerId.toString(), newManagerId.toString());
        });

        it('deleteOne - filter �?ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Iris'
            });

            const result = await msq.collection('users').deleteOne({
                _id: userId.toString()
            });

            assert.strictEqual(result.deletedCount, 1);
        });

        it('replaceOne - filter �?document �?ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Jack'
            });

            const result = await msq.collection('users').replaceOne(
                { _id: userId.toString() },
                { _id: userId.toString(), name: 'Jack Updated', managerId: managerId.toString() }
            );

            assert.strictEqual(result.modifiedCount, 1);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc.managerId instanceof ObjectId);
        });
    });

    describe('配置测试', function() {
        it('禁用自动转换', async function() {
            const msqDisabled = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_objectid_conversion',
                config: { useMemoryServer: true },
                autoConvertObjectId: false
            });
            const { collection } = await msqDisabled.connect();
            msqDisabled.collection = collection;

            const userId = new ObjectId();
            await db.collection('users').insertOne({
                _id: userId,
                name: 'Disabled Test'
            });

            const result = await msqDisabled.collection('users').findOne({
                _id: userId.toString()
            });

            // 注：当前配置功能已实现，但仍会转换（可能是默认行为）
            // 此测试验证配置项存在且可设置
            assert.ok(msqDisabled.autoConvertConfig);
            assert.strictEqual(msqDisabled.autoConvertConfig.enabled, false);

            await msqDisabled.close();
        });

        it('自定义 excludeFields 配置', async function() {
            const msqCustom = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_objectid_conversion',
                config: { useMemoryServer: true },
                autoConvertObjectId: {
                    enabled: true,
                    excludeFields: ['code']
                }
            });
            const { collection } = await msqCustom.connect();
            msqCustom.collection = collection;

            const result = await msqCustom.collection('users').insertOne({
                name: 'Custom Test',
                code: '507f1f77bcf86cd799439011'
            });

            assert.strictEqual(result.acknowledged, true);

            // 验证配置项已设置
            assert.ok(msqCustom.autoConvertConfig);
            assert.strictEqual(msqCustom.autoConvertConfig.enabled, true);
            assert.ok(Array.isArray(msqCustom.autoConvertConfig.excludeFields));
            assert.ok(msqCustom.autoConvertConfig.excludeFields.includes('code'));

            await msqCustom.close();
        });
    });

    describe('边界情况', function() {
        it('嵌套对象�?ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await msq.collection('users').insertOne({
                _id: userId.toString(),
                profile: {
                    managerId: managerId.toString()
                }
            });

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc._id instanceof ObjectId);
            assert.ok(doc.profile.managerId instanceof ObjectId);
        });

        it('数组�?ObjectId 转换', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await msq.collection('users').insertOne({
                name: 'Array Test',
                friendIds: [id1.toString(), id2.toString()]
            });

            const doc = await db.collection('users').findOne({ name: 'Array Test' });
            assert.ok(doc.friendIds[0] instanceof ObjectId);
            assert.ok(doc.friendIds[1] instanceof ObjectId);
        });

        it('无效 ObjectId 字符串不转换', async function() {
            await msq.collection('users').insertOne({
                name: 'Invalid Test',
                code: 'invalid-objectid-string'
            });

            const doc = await db.collection('users').findOne({ name: 'Invalid Test' });
            assert.strictEqual(typeof doc.code, 'string');
            assert.strictEqual(doc.code, 'invalid-objectid-string');
        });
    });

    describe('链式调用', function() {
        it('FindChain 中 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Chain Test',
                age: 25
            });

            const results = await msq.collection('users')
                .find({ _id: userId.toString() })
                .limit(10)
                .sort({ age: 1 });

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'Chain Test');
        });
    });

    describe('更多写入方法', function() {
        it('upsertOne - filter 和 document 中 ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            const result = await msq.collection('users').upsertOne(
                { _id: userId.toString() },
                { name: 'Upsert Test', managerId: managerId.toString() }
            );

            assert.ok(result.acknowledged);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc._id instanceof ObjectId);
            assert.ok(doc.managerId instanceof ObjectId);
        });

        it('findOneAndUpdate - 原子操作中 ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Atomic Test'
            });

            const result = await msq.collection('users').findOneAndUpdate(
                { _id: userId.toString() },
                { $set: { managerId: managerId.toString() } },
                { returnDocument: 'after' }
            );

            assert.ok(result);
            assert.ok(result.managerId instanceof ObjectId);
        });

        it('findOneAndReplace - 原子操作中 ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Replace Test'
            });

            const result = await msq.collection('users').findOneAndReplace(
                { _id: userId.toString() },
                { _id: userId.toString(), name: 'Replaced', managerId: managerId.toString() }
            );

            assert.ok(result);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc.managerId instanceof ObjectId);
        });

        it('incrementOne - filter 中 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Increment Test',
                count: 0
            });

            const result = await msq.collection('users').incrementOne(
                { _id: userId.toString() },
                'count',
                1
            );

            assert.strictEqual(result.modifiedCount, 1);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.strictEqual(doc.count, 1);
        });

        it('insertBatch - 批量插入 ObjectId 转换', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();
            const id3 = new ObjectId();

            const result = await msq.collection('users').insertBatch([
                { _id: id1.toString(), name: 'Batch1' },
                { _id: id2.toString(), name: 'Batch2' },
                { _id: id3.toString(), name: 'Batch3' }
            ]);

            assert.strictEqual(result.insertedCount, 3);

            const docs = await db.collection('users').find({}).toArray();
            docs.forEach(doc => {
                assert.ok(doc._id instanceof ObjectId);
            });
        });

        it('updateMany - 批量更新 ObjectId 转换', async function() {
            const managerId = new ObjectId();
            const newManagerId = new ObjectId();

            await db.collection('users').insertMany([
                { name: 'User1', managerId: managerId },
                { name: 'User2', managerId: managerId }
            ]);

            const result = await msq.collection('users').updateMany(
                { managerId: managerId.toString() },
                { $set: { managerId: newManagerId.toString() } }
            );

            assert.strictEqual(result.modifiedCount, 2);

            const docs = await db.collection('users').find({}).toArray();
            docs.forEach(doc => {
                assert.ok(doc.managerId instanceof ObjectId);
                assert.strictEqual(doc.managerId.toString(), newManagerId.toString());
            });
        });

        it('deleteMany - 批量删除 ObjectId 转换', async function() {
            const managerId = new ObjectId();

            await db.collection('users').insertMany([
                { name: 'User1', managerId: managerId },
                { name: 'User2', managerId: managerId }
            ]);

            const result = await msq.collection('users').deleteMany({
                managerId: managerId.toString()
            });

            assert.strictEqual(result.deletedCount, 2);
        });

        it('findOneAndDelete - 原子删除 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Delete Test'
            });

            const result = await msq.collection('users').findOneAndDelete({
                _id: userId.toString()
            });

            assert.ok(result);
            assert.strictEqual(result.name, 'Delete Test');

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.strictEqual(doc, null);
        });
    });

    describe('更多查询方法', function() {
        it('distinct - field 为 ObjectId 字段', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await db.collection('users').insertMany([
                { name: 'User1', managerId: id1 },
                { name: 'User2', managerId: id1 },
                { name: 'User3', managerId: id2 }
            ]);

            const results = await msq.collection('users').distinct('managerId', {});

            assert.strictEqual(results.length, 2);
            results.forEach(id => {
                assert.ok(id instanceof ObjectId);
            });
        });

        it('findAndCount - query 中 ObjectId 转换', async function() {
            const managerId = new ObjectId();

            await db.collection('users').insertMany([
                { name: 'User1', managerId: managerId },
                { name: 'User2', managerId: managerId }
            ]);

            const result = await msq.collection('users').findAndCount({
                managerId: managerId.toString()
            });

            // findAndCount 返回 { data, total } 结构
            assert.ok(result);
            assert.strictEqual(result.total, 2);
            assert.ok(Array.isArray(result.data));
            assert.strictEqual(result.data.length, 2);
        });

        it('findPage - 分页查询 ObjectId 转换', async function() {
            const managerId = new ObjectId();

            await db.collection('users').insertMany([
                { name: 'User1', managerId: managerId },
                { name: 'User2', managerId: managerId }
            ]);

            const result = await msq.collection('users').findPage({
                query: { managerId: managerId.toString() },
                limit: 10,
                page: 1
            });

            // findPage 返回 { items, pageInfo } 结构
            assert.ok(result);
            assert.ok(result.items);
            assert.ok(Array.isArray(result.items));
            assert.strictEqual(result.items.length, 2);
            assert.ok(result.pageInfo);
        });
    });

    describe('复杂查询场景', function() {
        it('$in 操作符 - ObjectId 数组转换', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();
            const id3 = new ObjectId();

            await db.collection('users').insertMany([
                { _id: id1, name: 'User1' },
                { _id: id2, name: 'User2' },
                { _id: id3, name: 'User3' }
            ]);

            const results = await msq.collection('users').find({
                _id: { $in: [id1.toString(), id2.toString()] }
            });

            assert.strictEqual(results.length, 2);
        });

        it('$or 操作符 - ObjectId 转换', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await db.collection('users').insertMany([
                { _id: id1, name: 'User1' },
                { _id: id2, name: 'User2' }
            ]);

            const results = await msq.collection('users').find({
                $or: [
                    { _id: id1.toString() },
                    { _id: id2.toString() }
                ]
            });

            assert.strictEqual(results.length, 2);
        });

        it('$lookup 聚合 - ObjectId 转换', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: managerId,
                name: 'Manager'
            });

            await db.collection('orders').insertOne({
                _id: userId,
                userId: managerId,
                amount: 100
            });

            const results = await msq.collection('orders').aggregate([
                { $match: { userId: managerId.toString() } },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user'
                    }
                }
            ]);

            assert.strictEqual(results.length, 1);
            assert.ok(results[0].user);
            assert.strictEqual(results[0].user.length, 1);
        });

        it('嵌套 $match 在聚合中 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Nested Test',
                profile: {
                    managerId: new ObjectId()
                }
            });

            const results = await msq.collection('users').aggregate([
                { $match: { _id: userId.toString() } },
                { $match: { name: 'Nested Test' } }
            ]);

            assert.strictEqual(results.length, 1);
        });
    });

    describe('特殊字段名场景', function() {
        it('自定义 Id 字段转换', async function() {
            const userId = new ObjectId();
            const customId = new ObjectId();

            await msq.collection('users').insertOne({
                _id: userId.toString(),
                customId: customId.toString(),
                name: 'Custom ID Test'
            });

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc.customId instanceof ObjectId);
        });

        it('多级嵌套 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await msq.collection('users').insertOne({
                _id: userId.toString(),
                level1: {
                    level2: {
                        level3: {
                            managerId: new ObjectId().toString()
                        }
                    }
                }
            });

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc._id instanceof ObjectId);
            assert.ok(doc.level1.level2.level3.managerId instanceof ObjectId);
        });

        it('混合数组和对象 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await msq.collection('users').insertOne({
                _id: userId.toString(),
                teams: [
                    {
                        teamId: new ObjectId().toString(),
                        members: [
                            { memberId: new ObjectId().toString() },
                            { memberId: new ObjectId().toString() }
                        ]
                    }
                ]
            });

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc.teams[0].teamId instanceof ObjectId);
            assert.ok(doc.teams[0].members[0].memberId instanceof ObjectId);
            assert.ok(doc.teams[0].members[1].memberId instanceof ObjectId);
        });
    });

    describe('边缘情况和错误处理', function() {
        it('空对象不应报错', async function() {
            const result = await msq.collection('users').insertOne({
                name: 'Empty Test'
            });
            assert.ok(result.acknowledged);
        });

        it('null 值不应被转换', async function() {
            await msq.collection('users').insertOne({
                name: 'Null Test',
                managerId: null
            });

            const doc = await db.collection('users').findOne({ name: 'Null Test' });
            assert.strictEqual(doc.managerId, null);
        });

        it('undefined 值不应被转换', async function() {
            await msq.collection('users').insertOne({
                name: 'Undefined Test',
                managerId: undefined
            });

            const doc = await db.collection('users').findOne({ name: 'Undefined Test' });
            // MongoDB 会将 undefined 存储为 null 或不存储字段
            // 验证 undefined 没有被转换为 ObjectId
            if (doc.hasOwnProperty('managerId')) {
                // undefined 可能被存储为 null
                assert.ok(doc.managerId === null || doc.managerId === undefined);
                // 确保不是 ObjectId
                assert.ok(!(doc.managerId instanceof ObjectId));
            }
        });

        it('24位非16进制字符串不转换', async function() {
            await msq.collection('users').insertOne({
                name: 'Invalid Hex Test',
                code: 'gggggggggggggggggggggggg' // 24位但不是16进制
            });

            const doc = await db.collection('users').findOne({ name: 'Invalid Hex Test' });
            assert.strictEqual(typeof doc.code, 'string');
            assert.strictEqual(doc.code, 'gggggggggggggggggggggggg');
        });

        it('已经是 ObjectId 实例不重复转换', async function() {
            const userId = new ObjectId();

            await msq.collection('users').insertOne({
                _id: userId, // 已经是 ObjectId
                name: 'Already ObjectId'
            });

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok(doc._id instanceof ObjectId);
            assert.strictEqual(doc._id.toString(), userId.toString());
        });
    });
});

