/**
 * bulkUpsert 方法完整测试套件
 * 测试批量 upsert 操作的功能
 */

const MonSQLize = require('../../../lib');
const { ObjectId } = require('mongodb');
const assert = require('assert');

describe('bulkUpsert 方法测试套件', function () {
    this.timeout(60000);  // 批量操作可能需要更长时间

    let msq;
    let collection;
    let nativeDb;

    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_bulk_upsert',
            config: { useMemoryServer: true },
            slowQueryMs: 5000
        });

        const conn = await msq.connect();
        collection = conn.collection;

        nativeDb = msq._adapter.db;

        console.log('✅ 测试环境准备完成');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (msq) {
            await msq.close();
        }
        console.log('✅ 测试环境清理完成');
    });

    afterEach(async function () {
    // 清理所有测试集合
        const collections = await nativeDb.listCollections().toArray();
        for (const coll of collections) {
            await nativeDb.collection(coll.name).deleteMany({});
        }
    });

    describe('1. 基础功能测试', function () {
        it('1.1 应该批量插入新文档', async function () {
            const users = [
                { email: 'user1@example.com', name: 'User 1', age: 30 },
                { email: 'user2@example.com', name: 'User 2', age: 25 },
                { email: 'user3@example.com', name: 'User 3', age: 35 }
            ];

            const result = await collection('users').bulkUpsert(users, {
                matchOn: (item) => ({ email: item.email })
            });

            assert.strictEqual(result.upsertedCount, 3, '应该插入 3 个文档');
            assert.strictEqual(result.modifiedCount, 0, '不应该有修改');
            assert.strictEqual(result.totalCount, 3);
            assert.strictEqual(result.errors.length, 0);

            const count = await nativeDb.collection('users').countDocuments();
            assert.strictEqual(count, 3);
        });

        it('1.2 应该批量更新现有文档', async function () {
            // 先插入
            await nativeDb.collection('users').insertMany([
                { email: 'user1@example.com', name: 'Old Name 1', age: 30 },
                { email: 'user2@example.com', name: 'Old Name 2', age: 25 }
            ]);

            const users = [
                { email: 'user1@example.com', name: 'New Name 1', age: 31 },
                { email: 'user2@example.com', name: 'New Name 2', age: 26 }
            ];

            const result = await collection('users').bulkUpsert(users, {
                matchOn: (item) => ({ email: item.email })
            });

            assert.strictEqual(result.upsertedCount, 0, '不应该插入新文档');
            assert.strictEqual(result.modifiedCount, 2, '应该更新 2 个文档');
            assert.strictEqual(result.totalCount, 2);

            const user1 = await nativeDb.collection('users').findOne({ email: 'user1@example.com' });
            assert.strictEqual(user1.name, 'New Name 1');
            assert.strictEqual(user1.age, 31);
        });

        it('1.3 应该混合插入和更新', async function () {
            // 先插入 1 个
            await nativeDb.collection('users').insertOne({
                email: 'user1@example.com',
                name: 'Old Name',
                age: 30
            });

            const users = [
                { email: 'user1@example.com', name: 'Updated Name', age: 31 },  // 更新
                { email: 'user2@example.com', name: 'New User', age: 25 },      // 插入
                { email: 'user3@example.com', name: 'Another New', age: 35 }    // 插入
            ];

            const result = await collection('users').bulkUpsert(users, {
                matchOn: (item) => ({ email: item.email })
            });

            assert.strictEqual(result.upsertedCount, 2, '应该插入 2 个新文档');
            assert.strictEqual(result.modifiedCount, 1, '应该更新 1 个文档');
            assert.strictEqual(result.totalCount, 3);
        });
    });

    describe('2. 分批处理测试', function () {
        it('2.1 应该正确分批处理（大数据量）', async function () {
            const users = [];
            for (let i = 0; i < 2500; i++) {
                users.push({
                    email: `user${i}@example.com`,
                    name: `User ${i}`,
                    age: 20 + (i % 50)
                });
            }

            const result = await collection('users').bulkUpsert(users, {
                matchOn: (item) => ({ email: item.email }),
                batchSize: 500
            });

            assert.strictEqual(result.upsertedCount, 2500);
            assert.strictEqual(result.modifiedCount, 0);
            assert.strictEqual(result.totalCount, 2500);
            assert.strictEqual(result.errors.length, 0);

            const count = await nativeDb.collection('users').countDocuments();
            assert.strictEqual(count, 2500);

            console.log('  ✅ 成功处理 2500 条记录，分 5 个批次');
        });

        it('2.2 应该支持进度回调', async function () {
            const users = [];
            for (let i = 0; i < 1000; i++) {
                users.push({
                    email: `user${i}@example.com`,
                    name: `User ${i}`,
                    age: 20 + (i % 50)
                });
            }

            const progressLog = [];
            const result = await collection('users').bulkUpsert(users, {
                matchOn: (item) => ({ email: item.email }),
                batchSize: 200,
                onProgress: (processed, total, batch, totalBatches) => {
                    progressLog.push({ processed, total, batch, totalBatches });
                }
            });

            assert.strictEqual(result.upsertedCount, 1000);
            assert.strictEqual(progressLog.length, 5, '应该有 5 次进度回调');
            assert.strictEqual(progressLog[0].batch, 1);
            assert.strictEqual(progressLog[4].batch, 5);
            assert.strictEqual(progressLog[4].processed, 1000);

            console.log('  ✅ 进度回调: ', progressLog.map(p => `批次${p.batch}/${p.totalBatches}: ${p.processed}/${p.total}`).join(', '));
        });
    });

    describe('3. 性能测试', function () {
        it('3.1 性能对比：bulkUpsert vs 循环 upsertOne', async function () {
            const users = [];
            for (let i = 0; i < 100; i++) {
                users.push({
                    email: `user${i}@example.com`,
                    name: `User ${i}`,
                    age: 20 + (i % 50)
                });
            }

            // 方法 1: bulkUpsert
            const start1 = Date.now();
            await collection('users_bulk').bulkUpsert(users, {
                matchOn: (item) => ({ email: item.email }),
                batchSize: 50
            });
            const duration1 = Date.now() - start1;

            // 方法 2: 循环 upsertOne
            const start2 = Date.now();
            for (const user of users) {
                await collection('users_loop').upsertOne(
                    { email: user.email },
                    { $set: user }
                );
            }
            const duration2 = Date.now() - start2;

            const speedup = (duration2 / duration1).toFixed(1);
            console.log(`  ⚡ 性能对比（100条）: bulkUpsert ${duration1}ms vs 循环 ${duration2}ms, 提升 ${speedup} 倍`);

            // bulkUpsert 应该显著更快
            assert.ok(duration1 < duration2, 'bulkUpsert 应该比循环更快');
        });
    });

    describe('4. 参数验证测试', function () {
        it('4.1 应该拒绝非数组 items', async function () {
            try {
                await collection('users').bulkUpsert('invalid', {
                    matchOn: (item) => ({ email: item.email })
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('items 必须是数组'));
            }
        });

        it('4.2 应该处理空数组', async function () {
            const result = await collection('users').bulkUpsert([], {
                matchOn: (item) => ({ email: item.email })
            });

            assert.strictEqual(result.upsertedCount, 0);
            assert.strictEqual(result.modifiedCount, 0);
            assert.strictEqual(result.totalCount, 0);
        });

        it('4.3 应该拒绝缺少 matchOn', async function () {
            try {
                await collection('users').bulkUpsert([
                    { email: 'user1@example.com', name: 'User 1' }
                ], {});
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('matchOn'));
            }
        });

        it('4.4 应该拒绝非函数 matchOn', async function () {
            try {
                await collection('users').bulkUpsert([
                    { email: 'user1@example.com', name: 'User 1' }
                ], {
                    matchOn: 'invalid'
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('matchOn 必须是函数'));
            }
        });
    });

    describe('5. 真实场景测试', function () {
        it('5.1 场景：批量同步用户数据', async function () {
            // 初始数据
            await nativeDb.collection('users').insertMany([
                { email: 'user1@example.com', name: 'Old User 1', age: 30, status: 'active' },
                { email: 'user2@example.com', name: 'Old User 2', age: 25, status: 'active' }
            ]);

            // 同步数据（包含更新和新增）
            const syncData = [
                { email: 'user1@example.com', name: 'Updated User 1', age: 31, status: 'active' },  // 更新
                { email: 'user2@example.com', name: 'Updated User 2', age: 26, status: 'inactive' }, // 更新
                { email: 'user3@example.com', name: 'New User 3', age: 35, status: 'active' },       // 新增
                { email: 'user4@example.com', name: 'New User 4', age: 28, status: 'active' }        // 新增
            ];

            const result = await collection('users').bulkUpsert(syncData, {
                matchOn: (item) => ({ email: item.email })
            });

            assert.strictEqual(result.upsertedCount, 2, '应该插入 2 个新用户');
            assert.strictEqual(result.modifiedCount, 2, '应该更新 2 个现有用户');
            assert.strictEqual(result.totalCount, 4);

            const user1 = await nativeDb.collection('users').findOne({ email: 'user1@example.com' });
            assert.strictEqual(user1.name, 'Updated User 1');
            assert.strictEqual(user1.age, 31);

            console.log('  ✅ 用户数据同步：更新 2 个，新增 2 个');
        });

        it('5.2 场景：批量导入商品数据', async function () {
            const products = [];
            for (let i = 1; i <= 1000; i++) {
                products.push({
                    sku: `PROD-${i.toString().padStart(4, '0')}`,
                    name: `Product ${i}`,
                    price: 100 + Math.floor(Math.random() * 900),
                    stock: Math.floor(Math.random() * 100)
                });
            }

            const result = await collection('products').bulkUpsert(products, {
                matchOn: (item) => ({ sku: item.sku }),
                batchSize: 250,
                onProgress: (processed, total, batch, totalBatches) => {
                    if (batch === totalBatches) {
                        console.log(`  📦 商品导入进度: ${processed}/${total} (完成)`);
                    }
                }
            });

            assert.strictEqual(result.upsertedCount, 1000);
            assert.strictEqual(result.totalCount, 1000);

            const count = await nativeDb.collection('products').countDocuments();
            assert.strictEqual(count, 1000);
        });
    });
});

