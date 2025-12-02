/**
 * 集合管理功能测试
 * 测试 stats, renameCollection, collMod, convertToCapped 方法
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');

describe('Collection Management Operations', function() {
    this.timeout(15000);

    let db;
    let collection;
    const collectionName = 'test_collection_mgmt';

    before(async function() {
        db = new MonSQLize({
            type: 'mongodb',
            config: {
                uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test_collection_mgmt'
            }
        });
        await db.connect();
    });

    beforeEach(async function() {
        // 创建测试集合
        const { collection: getCollection } = await db.connect();
        collection = getCollection(collectionName);
        await collection.insertOne({ test: 'data' });
    });

    afterEach(async function() {
        // 清理测试集合
        try {
            await collection.dropCollection();
        } catch (error) {
            // 忽略错误
        }
    });

    after(async function() {
        if (db) {
            await db.close();
        }
    });

    describe('stats()', function() {
        it('应该返回集合统计对象', async function() {
            const stats = await collection.stats();
            assert.ok(stats);
            assert.ok(stats.ns);
            assert.ok(typeof stats.count === 'number');
        });

        it('应该包含命名空间信息', async function() {
            const stats = await collection.stats();
            assert.ok(stats.ns.includes(collectionName));
        });

        it('应该包含文档数量', async function() {
            // 插入多个文档
            await collection.insertOne({ test: 1 });
            await collection.insertOne({ test: 2 });

            const stats = await collection.stats();
            assert.ok(stats.count >= 3); // 至少3个文档
        });

        it('应该包含数据大小信息', async function() {
            const stats = await collection.stats();
            assert.ok(typeof stats.size === 'number');
            assert.ok(typeof stats.storageSize === 'number');
            assert.ok(stats.size >= 0);
        });

        it('应该包含索引信息', async function() {
            const stats = await collection.stats();
            assert.ok(typeof stats.totalIndexSize === 'number');
            assert.ok(typeof stats.nindexes === 'number');
            assert.ok(stats.nindexes >= 1); // 至少有 _id 索引
        });

        it('应该包含平均文档大小', async function() {
            const stats = await collection.stats();
            if (stats.count > 0) {
                assert.ok(typeof stats.avgObjSize === 'number');
                assert.ok(stats.avgObjSize > 0);
            }
        });

        it('应该支持 scale 参数（KB）', async function() {
            const stats = await collection.stats({ scale: 1024 });
            assert.ok(stats);
            assert.strictEqual(stats.scaleFactor, 1024);
        });

        it('应该支持 scale 参数（MB）', async function() {
            const stats = await collection.stats({ scale: 1048576 });
            assert.ok(stats);
            assert.strictEqual(stats.scaleFactor, 1048576);
        });

        it('scale 参数应该影响大小值', async function() {
            const statsBytes = await collection.stats();
            const statsKB = await collection.stats({ scale: 1024 });

            if (statsBytes.size > 0) {
                assert.ok(statsKB.size < statsBytes.size);
            }
        });
    });

    describe('renameCollection()', function() {
        it('应该重命名集合', async function() {
            const newName = `${collectionName}_renamed`;

            try {
                const result = await collection.renameCollection(newName);
                assert.ok(result.renamed);
                assert.strictEqual(result.to, newName);

                // 验证新集合存在
                const adapter = db._adapter;
                const collections = await adapter.listCollections({ nameOnly: true });
                assert.ok(collections.includes(newName));
            } finally {
                // 清理
                try {
                    const { collection: getCollection } = await db.connect();
                    const renamedColl = getCollection(newName);
                    await renamedColl.dropCollection();
                } catch (error) {
                    // 忽略错误
                }
            }
        });

        it('应该验证新名称参数', async function() {
            try {
                await collection.renameCollection('');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('name'));
            }
        });

        it('应该验证新名称类型', async function() {
            try {
                await collection.renameCollection(123);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('string'));
            }
        });

        it('应该支持 dropTarget 选项', async function() {
            const targetName = `${collectionName}_target`;

            // 创建目标集合
            const { collection: getCollection } = await db.connect();
            const targetColl = getCollection(targetName);
            await targetColl.insertOne({ test: 'target' });

            try {
                // 重命名（覆盖目标）
                await collection.renameCollection(targetName, { dropTarget: true });

                // 验证成功
                const adapter = db._adapter;
                const collections = await adapter.listCollections({ nameOnly: true });
                assert.ok(collections.includes(targetName));
            } finally {
                // 清理
                try {
                    const renamedColl = getCollection(targetName);
                    await renamedColl.dropCollection();
                } catch (error) {
                    // 忽略错误
                }
            }
        });
    });

    describe('collMod()', function() {
        it('应该修改验证级别', async function() {
            const result = await collection.collMod({
                validationLevel: 'moderate'
            });
            assert.ok(result.ok);
        });

        it('应该修改验证行为', async function() {
            const result = await collection.collMod({
                validationAction: 'warn'
            });
            assert.ok(result.ok);
        });

        it('应该验证修改参数', async function() {
            try {
                await collection.collMod(null);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('Modifications'));
            }
        });

        it('应该验证参数类型', async function() {
            try {
                await collection.collMod('invalid');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('object'));
            }
        });
    });

    describe('convertToCapped()', function() {
        it('应该转换为固定大小集合', async function() {
            const size = 10485760; // 10MB
            const result = await collection.convertToCapped(size);

            assert.ok(result.ok);
            assert.strictEqual(result.collection, collectionName);
            assert.ok(result.capped);
            assert.strictEqual(result.size, size);
        });

        it('应该支持 max 参数', async function() {
            const size = 10485760;
            const result = await collection.convertToCapped(size, { max: 1000 });

            assert.ok(result.ok);
            assert.ok(result.capped);
        });

        it('应该验证 size 参数', async function() {
            try {
                await collection.convertToCapped(0);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('Size'));
            }
        });

        it('应该验证 size 类型', async function() {
            try {
                await collection.convertToCapped('invalid');
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('number'));
            }
        });

        it('应该验证 size 为正数', async function() {
            try {
                await collection.convertToCapped(-100);
                assert.fail('应该抛出验证错误');
            } catch (error) {
                assert.ok(error.message.includes('positive'));
            }
        });
    });

    describe('createCollection() 特殊类型', function() {
        afterEach(async function() {
            // 清理特殊集合
            try {
                const adapter = db._adapter;
                await adapter.db.dropCollection('test_capped_collection').catch(() => {});
                await adapter.db.dropCollection('test_timeseries_collection').catch(() => {});
            } catch (error) {
                // 忽略错误
            }
        });

        it('应该创建固定大小集合', async function() {
            const adapter = db._adapter;
            await adapter.db.createCollection('test_capped_collection', {
                capped: true,
                size: 10485760, // 10MB
                max: 1000
            });

            // 验证集合存在
            const collections = await adapter.listCollections({ nameOnly: true });
            assert.ok(collections.includes('test_capped_collection'));
        });

        it('应该创建时间序列集合', async function() {
            const adapter = db._adapter;

            try {
                await adapter.db.createCollection('test_timeseries_collection', {
                    timeseries: {
                        timeField: 'timestamp',
                        metaField: 'sensor',
                        granularity: 'seconds'
                    }
                });

                // 验证集合存在
                const collections = await adapter.listCollections({ nameOnly: true });
                assert.ok(collections.includes('test_timeseries_collection'));
            } catch (error) {
                // MongoDB 5.0+ 支持时间序列，旧版本跳过
                if (!error.message.includes('Unrecognized')) {
                    throw error;
                }
            }
        });
    });

    describe('集合管理集成测试', function() {
        it('应该完整的集合管理流程工作正常', async function() {
            const testName = 'test_integration_flow';

            try {
                // 1. 创建集合
                const { collection: getCollection } = await db.connect();
                const testColl = getCollection(testName);
                await testColl.insertOne({ test: 'data' });

                // 2. 获取统计
                const stats = await testColl.stats();
                assert.ok(stats.count >= 1);

                // 3. 修改集合属性
                await testColl.collMod({
                    validationLevel: 'moderate'
                });

                // 4. 重命名集合
                const newName = `${testName}_new`;
                await testColl.renameCollection(newName);

                // 5. 验证新名称
                const adapter = db._adapter;
                const collections = await adapter.listCollections({ nameOnly: true });
                assert.ok(collections.includes(newName));
                assert.ok(!collections.includes(testName));

                // 6. 清理
                const renamedColl = getCollection(newName);
                await renamedColl.dropCollection();
            } catch (error) {
                // 清理
                try {
                    const adapter = db._adapter;
                    await adapter.db.dropCollection(testName).catch(() => {});
                    await adapter.db.dropCollection(`${testName}_new`).catch(() => {});
                } catch (e) {
                    // 忽略清理错误
                }
                throw error;
            }
        });
    });
});

