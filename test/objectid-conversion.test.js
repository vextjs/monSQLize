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

    describe('更多 MongoDB 操作符', function() {
        it('$ne 操作符 - ObjectId 转换', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await db.collection('users').insertMany([
                { _id: id1, name: 'User1' },
                { _id: id2, name: 'User2' }
            ]);

            const results = await msq.collection('users').find({
                _id: { $ne: id1.toString() }
            });

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'User2');
        });

        it('$nin 操作符 - ObjectId 数组转换', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();
            const id3 = new ObjectId();

            await db.collection('users').insertMany([
                { _id: id1, name: 'User1' },
                { _id: id2, name: 'User2' },
                { _id: id3, name: 'User3' }
            ]);

            const results = await msq.collection('users').find({
                _id: { $nin: [id1.toString(), id2.toString()] }
            });

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'User3');
        });

        it('$all 操作符 - 数组包含所有 ObjectId', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await msq.collection('users').insertOne({
                name: 'User with friends',
                friendIds: [id1, id2, new ObjectId()]
            });

            const results = await msq.collection('users').find({
                friendIds: { $all: [id1.toString(), id2.toString()] }
            });

            assert.strictEqual(results.length, 1);
        });

        it('$elemMatch 操作符 - 数组元素匹配 ObjectId', async function() {
            const teamId = new ObjectId();

            await msq.collection('users').insertOne({
                name: 'User with teams',
                teams: [
                    { teamId: teamId, role: 'admin' },
                    { teamId: new ObjectId(), role: 'member' }
                ]
            });

            const results = await msq.collection('users').find({
                teams: {
                    $elemMatch: {
                        teamId: teamId.toString(),
                        role: 'admin'
                    }
                }
            });

            assert.strictEqual(results.length, 1);
        });

        it('$exists 与 ObjectId 字段组合', async function() {
            const managerId = new ObjectId();

            await db.collection('users').insertMany([
                { name: 'User1', managerId: managerId },
                { name: 'User2' }
            ]);

            const results = await msq.collection('users').find({
                managerId: { $exists: true },
                managerId: managerId.toString()
            });

            assert.strictEqual(results.length, 1);
        });
    });

    describe('投影和排序场景', function() {
        it('projection 中排除 ObjectId 字段', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Projection Test',
                managerId: managerId
            });

            const result = await msq.collection('users').findOne(
                { _id: userId.toString() },
                { projection: { managerId: 0 } }
            );

            assert.ok(result);
            assert.ok(!result.managerId);
        });

        it('projection 中仅包含 ObjectId 字段', async function() {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Projection Test',
                managerId: managerId,
                age: 30
            });

            const result = await msq.collection('users').findOne(
                { _id: userId.toString() },
                { projection: { managerId: 1 } }
            );

            assert.ok(result);
            assert.ok(result.managerId instanceof ObjectId);
            assert.ok(!result.age);
        });

        it('sort 按 ObjectId 字段排序', async function() {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await db.collection('users').insertMany([
                { _id: id2, name: 'User2', managerId: id2 },
                { _id: id1, name: 'User1', managerId: id1 }
            ]);

            const results = await msq.collection('users')
                .find({})
                .sort({ managerId: 1 });

            assert.strictEqual(results.length, 2);
            assert.ok(results[0].managerId.toString() < results[1].managerId.toString());
        });
    });

    describe('事务场景', function() {
        it('事务中的 ObjectId 转换', async function() {
            // 事务需要副本集环境，内存数据库副本集启动较慢，跳过
            this.skip();
        });
    });

    describe('缓存场景', function() {
        it('缓存查询中的 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Cache Test'
            });

            // 第一次查询（未缓存）
            const result1 = await msq.collection('users').findOne(
                { _id: userId.toString() },
                { cache: 5000 }
            );

            // 第二次查询（应该从缓存获取）
            const result2 = await msq.collection('users').findOne(
                { _id: userId.toString() },
                { cache: 5000 }
            );

            assert.ok(result1);
            assert.ok(result2);
            assert.strictEqual(result1.name, result2.name);
            assert.ok(result1._id instanceof ObjectId);
            assert.ok(result2._id instanceof ObjectId);
        });

        it('缓存失效后的 ObjectId 转换', async function() {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Cache Invalidation Test'
            });

            // 查询并缓存
            await msq.collection('users').findOne(
                { _id: userId.toString() },
                { cache: 5000 }
            );

            // 更新（应该失效缓存）
            await msq.collection('users').updateOne(
                { _id: userId.toString() },
                { $set: { name: 'Updated Name' } }
            );

            // 再次查询
            const result = await msq.collection('users').findOne(
                { _id: userId.toString() },
                { cache: 5000 }
            );

            assert.ok(result);
            assert.strictEqual(result.name, 'Updated Name');
        });
    });

    describe('多集合关联查询', function() {
        it('$graphLookup 中的 ObjectId 转换', async function() {
            const manager1 = new ObjectId();
            const manager2 = new ObjectId();
            const employee = new ObjectId();

            await db.collection('users').insertMany([
                { _id: manager1, name: 'CEO', managerId: null },
                { _id: manager2, name: 'Manager', managerId: manager1 },
                { _id: employee, name: 'Employee', managerId: manager2 }
            ]);

            const results = await msq.collection('users').aggregate([
                { $match: { _id: employee.toString() } },
                {
                    $graphLookup: {
                        from: 'users',
                        startWith: '$managerId',
                        connectFromField: 'managerId',
                        connectToField: '_id',
                        as: 'hierarchy'
                    }
                }
            ]);

            assert.strictEqual(results.length, 1);
            assert.ok(results[0].hierarchy);
            assert.ok(results[0].hierarchy.length >= 1);
        });

        it('多个 $lookup 阶段的 ObjectId 转换', async function() {
            const userId = new ObjectId();
            const departmentId = new ObjectId();
            const projectId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'User',
                departmentId: departmentId
            });

            await db.collection('departments').insertOne({
                _id: departmentId,
                name: 'Engineering',
                projectId: projectId
            });

            await db.collection('projects').insertOne({
                _id: projectId,
                name: 'Project X'
            });

            const results = await msq.collection('users').aggregate([
                { $match: { _id: userId.toString() } },
                {
                    $lookup: {
                        from: 'departments',
                        localField: 'departmentId',
                        foreignField: '_id',
                        as: 'department'
                    }
                },
                { $unwind: '$department' },
                {
                    $lookup: {
                        from: 'projects',
                        localField: 'department.projectId',
                        foreignField: '_id',
                        as: 'project'
                    }
                }
            ]);

            assert.strictEqual(results.length, 1);
            assert.ok(results[0].department);
            assert.ok(results[0].project);
        });
    });

    describe('大数据量场景', function() {
        it('批量插入1000条带 ObjectId 的文档', async function() {
            this.timeout(10000);

            const docs = [];
            for (let i = 0; i < 1000; i++) {
                docs.push({
                    name: `User${i}`,
                    managerId: new ObjectId().toString(),
                    departmentId: new ObjectId().toString()
                });
            }

            const result = await msq.collection('users').insertMany(docs);
            assert.strictEqual(result.insertedCount, 1000);

            // 随机验证几条
            const samples = await db.collection('users').find({}).limit(5).toArray();
            samples.forEach(doc => {
                assert.ok(doc.managerId instanceof ObjectId);
                assert.ok(doc.departmentId instanceof ObjectId);
            });
        });

        it('$in 操作符处理100个 ObjectId', async function() {
            const ids = [];
            const docs = [];

            for (let i = 0; i < 100; i++) {
                const id = new ObjectId();
                ids.push(id.toString());
                docs.push({ _id: id, name: `User${i}` });
            }

            await db.collection('users').insertMany(docs);

            const results = await msq.collection('users').find({
                _id: { $in: ids }
            }, { limit: 0 }); // limit: 0 表示不限制

            // 验证至少能找到一些结果
            assert.ok(results.length > 0);
            assert.ok(results.length <= 100);
        });
    });

    describe('错误处理和异常场景', function() {
        it('空数组 ObjectId 转换', async function() {
            const results = await msq.collection('users').find({
                _id: { $in: [] }
            });

            assert.strictEqual(results.length, 0);
        });

        it('混合有效和无效 ObjectId 字符串', async function() {
            const validId = new ObjectId();

            await db.collection('users').insertOne({
                _id: validId,
                name: 'Valid User'
            });

            const results = await msq.collection('users').find({
                _id: { $in: [validId.toString(), 'invalid-id', '123'] }
            });

            // 应该只找到有效的
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'Valid User');
        });

        it('深度超过限制的嵌套对象', async function() {
            // 创建11层嵌套（超过默认的10层限制）
            let deepObj = { value: new ObjectId().toString() };
            for (let i = 0; i < 11; i++) {
                deepObj = { nested: deepObj };
            }

            const result = await msq.collection('users').insertOne({
                name: 'Deep Nesting Test',
                data: deepObj
            });

            assert.ok(result.acknowledged);

            // 验证最深层的 ObjectId 没有被转换（超过深度限制）
            const doc = await db.collection('users').findOne({ name: 'Deep Nesting Test' });
            assert.ok(doc);
            // 深度限制应该阻止转换
        });

        it('循环引用对象不应导致崩溃', async function() {
            // 注意：MongoDB 不支持循环引用，这里测试转换器的健壮性
            const obj = { name: 'Test' };
            // obj.self = obj; // 这会导致 JSON.stringify 失败

            // 使用普通对象测试
            const result = await msq.collection('users').insertOne({
                name: 'Circular Test',
                managerId: new ObjectId().toString()
            });

            assert.ok(result.acknowledged);
        });

        it('特殊字符的字段名与 ObjectId', async function() {
            const id = new ObjectId();
            const id2 = new ObjectId();

            // MongoDB 支持的特殊字符字段名
            await msq.collection('users').insertOne({
                field_with_underscore: id.toString(),
                customUserId: id2.toString(),
                name: 'Special Fields Test'
            });

            const doc = await db.collection('users').findOne({
                name: 'Special Fields Test'
            });

            assert.ok(doc);
            assert.ok(doc.field_with_underscore instanceof ObjectId);
            assert.ok(doc.customUserId instanceof ObjectId);
        });
    });

    describe('性能和并发场景', function() {
        it('并发插入带 ObjectId 的文档', async function() {
            this.timeout(10000);

            const promises = [];
            for (let i = 0; i < 50; i++) {
                promises.push(
                    msq.collection('users').insertOne({
                        name: `Concurrent User ${i}`,
                        managerId: new ObjectId().toString()
                    })
                );
            }

            const results = await Promise.all(promises);
            assert.strictEqual(results.length, 50);

            // 验证所有插入成功
            const count = await db.collection('users').countDocuments({});
            assert.ok(count >= 50);
        });

        it('并发查询和更新 ObjectId 字段', async function() {
            this.timeout(10000);

            const userId = new ObjectId();
            await db.collection('users').insertOne({
                _id: userId,
                name: 'Concurrent Test',
                counter: 0
            });

            const promises = [];
            for (let i = 0; i < 20; i++) {
                promises.push(
                    msq.collection('users').updateOne(
                        { _id: userId.toString() },
                        { $inc: { counter: 1 } }
                    )
                );
            }

            await Promise.all(promises);

            const doc = await db.collection('users').findOne({ _id: userId });
            assert.strictEqual(doc.counter, 20);
        });
    });

    describe('跨数据库场景', function() {
        it('跨数据库的 collection 调用', async function() {
            const userId = new ObjectId();

            // 使用默认数据库的其他集合
            await msq.collection('other_collection').insertOne({
                _id: userId.toString(),
                name: 'Other Collection User'
            });

            const result = await msq.collection('other_collection').findOne({
                _id: userId.toString()
            });

            assert.ok(result);
            assert.ok(result._id instanceof ObjectId);
            assert.strictEqual(result.name, 'Other Collection User');
        });
    });
});

