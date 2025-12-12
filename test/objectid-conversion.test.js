/**
 * 自动 ObjectId 转换功能测试
 * @description 测试所有方法的 ObjectId 自动转换功能
 */

const assert = require('assert');
const { ObjectId } = require('mongodb');
const MonSQLize = require('../lib/index');

describe('自动 ObjectId 转换功能测试', function() {
    this.timeout(30000);

    let msq;
    let db;

    before(async function() {
        // 使用内存数据�?
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_objectid_conversion',
            config: { useMemoryServer: true }
        });

        await msq.connect();

        // 获取原生数据库实例用于验�?
        const client = msq._adapter.client;
        db = client.db('test_objectid_conversion');
    });

    after(async function() {
        if (msq) {
            await msq.close();
        }

        // 停止内存数据�?
        const { stopMemoryServer } = require('../lib/mongodb/connect');
        await stopMemoryServer(console);
    });

    beforeEach(async function() {
        // 清空测试集合
        await db.collection('users').deleteMany({});
        await db.collection('orders').deleteMany({});
        await db.collection('products').deleteMany({});
    });

    describe('查询方法', () => {
        it('findOne - 字符�?_id 自动转换', async function() {
            // 准备数据
            const objectId = new ObjectId();
            await db.collection('users').insertOne({
                _id: objectId,
                name: 'Alice'
            });

            // 使用字符串查询（应该自动转换�?
            const result = await msq.collection('users').findOne({
                _id: objectId.toString()
            });

            assert.ok(result, '应该找到用户');
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

            // 使用字符串查�?
            const results = await msq.collection('users').find({
                _id: userId.toString(),
                managerId: managerId.toString()
            });

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].name, 'Bob');
        });

        it('aggregate - pipeline 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Charlie',
                age: 30
            });

            // 聚合管道中使用字符串
            const results = await msq.collection('users').aggregate([
                { $match: { _id: userId.toString() } },
                { $project: { name: 1 } }
            ]);

            assert.strictEqual(.length, );
            assert.strictEqual(, );
        });

        it('count - query 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'David'
            });

            const count = await msq.collection('users').count({
                _id: userId.toString()
            });

            assert.strictEqual(, );
        });
    });

    describe('写入方法', () => {
        it('insertOne - document 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            // 使用字符串插�?
            const result = await msq.collection('users').insertOne({
                _id: userId.toString(),
                name: 'Eve',
                managerId: managerId.toString()
            });

            assert.strictEqual(, );

            // 验证存储的是 ObjectId 类型
            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok( instanceof );
            assert.ok( instanceof );
        });

        it('insertMany - 批量插入时的 ObjectId 转换', async () => {
            const user1Id = new ObjectId();
            const user2Id = new ObjectId();

            const result = await msq.collection('users').insertMany([
                { _id: user1Id.toString(), name: 'Frank' },
                { _id: user2Id.toString(), name: 'Grace' }
            ]);

            assert.strictEqual(, );

            // 验证都是 ObjectId 类型
            const docs = await db.collection('users').find({}).toArray();
            assert.ok( instanceof );
            assert.ok( instanceof );
        });

        it('updateOne - filter �?update 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();
            const oldManagerId = new ObjectId();
            const newManagerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Henry',
                managerId: oldManagerId
            });

            // 使用字符串更�?
            const result = await msq.collection('users').updateOne(
                { _id: userId.toString() },
                { $set: { managerId: newManagerId.toString() } }
            );

            assert.strictEqual(, );

            // 验证存储的是 ObjectId
            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok( instanceof );
            assert.strictEqual(, ));
        });

        it('deleteOne - filter 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Iris'
            });

            // 使用字符串删�?
            const result = await msq.collection('users').deleteOne({
                _id: userId.toString()
            });

            assert.strictEqual(, );
        });

        it('replaceOne - filter �?document 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();
            const managerId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Jack'
            });

            // 使用字符串替�?
            const result = await msq.collection('users').replaceOne(
                { _id: userId.toString() },
                { _id: userId.toString(), name: 'Jack Updated', managerId: managerId.toString() }
            );

            assert.strictEqual(, );

            // 验证存储的是 ObjectId
            const doc = await db.collection('users').findOne({ _id: userId });
            assert.ok( instanceof );
        });
    });

    describe('配置测试', () => {
        it('禁用自动转换', async () => {
            const msqDisabled = new MonSQLize({
                type: 'mongodb',
                config: {
                    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
                    databaseName: 'test_objectid_conversion'
                },
                autoConvertObjectId: false // 禁用
            });
            await msqDisabled.connect();

            const userId = new ObjectId();
            await db.collection('users').insertOne({
                _id: userId,
                name: 'Disabled Test'
            });

            // 使用字符串查询（不应该转换，找不到）
            const result = await msqDisabled.collection('users').findOne({
                _id: userId.toString()
            });

            assert.strictEqual(, null);

            await msqDisabled.close();
        });

        it('自定�?excludeFields 配置', async () => {
            const msqCustom = new MonSQLize({
                type: 'mongodb',
                config: {
                    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
                    databaseName: 'test_objectid_conversion'
                },
                autoConvertObjectId: {
                    enabled: true,
                    excludeFields: ['code'] // 排除 code 字段
                }
            });
            await msqCustom.connect();

            // code 字段不应该被转换
            const result = await msqCustom.collection('users').insertOne({
                name: 'Custom Test',
                code: '507f1f77bcf86cd799439011' // 看起来像 ObjectId 但不转换
            });

            assert.strictEqual(, );

            // 验证 code 仍然是字符串
            const doc = await db.collection('users').findOne({ name: 'Custom Test' });
            assert.strictEqual(, );

            await msqCustom.close();
        });
    });

    describe('边界情况', () => {
        it('嵌套对象中的 ObjectId 转换', async () => {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                profile: {
                    managerId: new ObjectId()
                }
            });

            const result = await msq.collection('users').findOne({
                _id: userId.toString(),
                'profile.managerId': userId.toString()
            });

            // 应该能正确转换并查询
            assert.ok();
        });

        it('数组中的 ObjectId 转换', async () => {
            const id1 = new ObjectId();
            const id2 = new ObjectId();

            await msq.collection('users').insertOne({
                name: 'Array Test',
                friendIds: [id1.toString(), id2.toString()]
            });

            // 验证存储的是 ObjectId 数组
            const doc = await db.collection('users').findOne({ name: 'Array Test' });
            assert.ok( instanceof );
            assert.ok( instanceof );
        });

        it('无效�?ObjectId 字符串不应该被转�?, async () => {
            await msq.collection('users').insertOne({
                name: 'Invalid Test',
                code: 'invalid-objectid-string'
            });

            // 验证无效字符串保持原�?
            const doc = await db.collection('users').findOne({ name: 'Invalid Test' });
            assert.strictEqual(, );
            assert.strictEqual(, );
        });
    });

    describe('链式调用', () => {
        it('FindChain 中的 ObjectId 转换', async () => {
            const userId = new ObjectId();

            await db.collection('users').insertOne({
                _id: userId,
                name: 'Chain Test',
                age: 25
            });

            // 链式调用中使用字符串
            const results = await msq.collection('users')
                .find({ _id: userId.toString() })
                .limit(10)
                .sort({ age: 1 });

            assert.strictEqual(.length, );
            assert.strictEqual(, );
        });
    });
});

