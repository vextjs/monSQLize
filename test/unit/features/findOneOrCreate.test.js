/**
 * findOneOrCreate 方法完整测试套件
 * 测试查询文档不存在则创建的功能（并发安全）
 */

const MonSQLize = require('../../../lib');
const { ObjectId } = require('mongodb');
const assert = require('assert');

describe('findOneOrCreate 方法测试套件', function () {
    this.timeout(30000);

    let msq;
    let collection;
    let nativeCollection;

    before(async function () {
        console.log('🔧 初始化测试环境...');

        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_find_one_or_create',
            config: { useMemoryServer: true },
            slowQueryMs: 1000
        });

        const conn = await msq.connect();
        collection = conn.collection;

        const db = msq._adapter.db;
        nativeCollection = db.collection('test_users');

        // 清空测试数据
        await nativeCollection.deleteMany({});

        // 创建 unique 索引（用于测试并发冲突）
        await nativeCollection.createIndex({ email: 1 }, { unique: true });

        console.log('✅ 测试环境准备完成');
    });

    after(async function () {
        console.log('🧹 清理测试环境...');
        if (nativeCollection) {
            await nativeCollection.deleteMany({});
            await nativeCollection.dropIndexes();
        }
        if (msq) {
            await msq.close();
        }
        console.log('✅ 测试环境清理完成');
    });

    afterEach(async function () {
    // 每个测试后清理数据
        if (nativeCollection) {
            await nativeCollection.deleteMany({});
        }
    });

    describe('1. 基础功能测试', function () {
        it('1.1 应该创建新文档（不存在时）', async function () {
            const { doc, created, fromCache } = await collection('test_users').findOneOrCreate(
                { email: 'alice@example.com' },
                {
                    email: 'alice@example.com',
                    name: 'Alice',
                    age: 30,
                    createdAt: new Date()
                }
            );

            assert.ok(doc._id, '应该返回文档ID');
            assert.strictEqual(doc.email, 'alice@example.com');
            assert.strictEqual(doc.name, 'Alice');
            assert.strictEqual(created, true, '应该标记为新创建');
            assert.strictEqual(fromCache, false, '不应该来自缓存');

            // 验证数据库中存在
            const dbDoc = await nativeCollection.findOne({ email: 'alice@example.com' });
            assert.ok(dbDoc, '数据库中应该存在该文档');
        });

        it('1.2 应该返回现有文档（已存在时）', async function () {
            // 先插入一个文档
            const existingDoc = {
                email: 'bob@example.com',
                name: 'Bob',
                age: 25,
                createdAt: new Date()
            };
            await nativeCollection.insertOne(existingDoc);

            // 调用 findOneOrCreate
            const { doc, created, fromCache } = await collection('test_users').findOneOrCreate(
                { email: 'bob@example.com' },
                {
                    email: 'bob@example.com',
                    name: 'Bob Updated',  // 不同的名字，不应该更新
                    age: 99
                }
            );

            assert.strictEqual(doc.email, 'bob@example.com');
            assert.strictEqual(doc.name, 'Bob', '应该返回原有的名字');
            assert.strictEqual(doc.age, 25, '应该返回原有的年龄');
            assert.strictEqual(created, false, '应该标记为已存在');
        });

        it('1.3 应该支持复杂查询条件', async function () {
            const { doc, created } = await collection('test_users').findOneOrCreate(
                { email: 'charlie@example.com', status: 'active' },
                {
                    email: 'charlie@example.com',
                    name: 'Charlie',
                    status: 'active',
                    age: 35
                }
            );

            assert.strictEqual(created, true);
            assert.strictEqual(doc.email, 'charlie@example.com');
            assert.strictEqual(doc.status, 'active');
        });
    });

    describe('2. 并发冲突处理测试', function () {
        it('2.1 应该自动处理并发冲突（E11000）', async function () {
            const promises = [];

            // 模拟 5 个并发请求尝试创建相同 email 的用户
            for (let i = 0; i < 5; i++) {
                promises.push(
                    collection('test_users').findOneOrCreate(
                        { email: 'concurrent@example.com' },
                        {
                            email: 'concurrent@example.com',
                            name: `User ${i}`,
                            age: 20 + i,
                            createdAt: new Date()
                        }
                    )
                );
            }

            const results = await Promise.all(promises);

            // 统计创建和查询次数
            const createdCount = results.filter(r => r.created).length;
            const existingCount = results.filter(r => !r.created).length;

            console.log(`  并发测试结果: ${createdCount} 个创建, ${existingCount} 个查询`);

            // 应该只有 1 个成功创建，其余 4 个查询到已存在
            assert.strictEqual(createdCount, 1, '应该只有 1 个成功创建');
            assert.strictEqual(existingCount, 4, '应该有 4 个查询到已存在');

            // 所有结果应该返回相同的 email
            results.forEach(r => {
                assert.strictEqual(r.doc.email, 'concurrent@example.com');
            });

            // 数据库中应该只有 1 个文档
            const count = await nativeCollection.countDocuments({ email: 'concurrent@example.com' });
            assert.strictEqual(count, 1, '数据库中应该只有 1 个文档');
        });

        it('2.2 应该正确重试（retryOnConflict: true）', async function () {
            // 先插入一个文档
            await nativeCollection.insertOne({
                email: 'retry@example.com',
                name: 'Original',
                age: 30
            });

            // 第二次调用应该查询到已存在
            const { doc, created } = await collection('test_users').findOneOrCreate(
                { email: 'retry@example.com' },
                {
                    email: 'retry@example.com',
                    name: 'New',
                    age: 99
                },
                { retryOnConflict: true, maxRetries: 3 }
            );

            assert.strictEqual(created, false);
            assert.strictEqual(doc.name, 'Original', '应该返回原有文档');
        });
    });

    describe('3. 选项支持测试', function () {
        it('3.1 应该支持 projection 选项', async function () {
            const { doc, created } = await collection('test_users').findOneOrCreate(
                { email: 'projection@example.com' },
                {
                    email: 'projection@example.com',
                    name: 'Projection Test',
                    age: 40,
                    secret: 'should-not-return'
                },
                { projection: { email: 1, name: 1 } }
            );

            assert.strictEqual(created, true);
            assert.ok(doc._id, '_id 应该存在');
            assert.strictEqual(doc.email, 'projection@example.com');
            assert.strictEqual(doc.name, 'Projection Test');
            assert.strictEqual(doc.secret, undefined, 'secret 不应该返回');
        });

        it('3.2 应该支持 cache 选项（第二次查询缓存命中）', async function () {
            // 第一次调用（创建）
            const result1 = await collection('test_users').findOneOrCreate(
                { email: 'cache@example.com' },
                {
                    email: 'cache@example.com',
                    name: 'Cache Test',
                    age: 50
                },
                { cache: 5000 }  // 缓存 5 秒
            );

            assert.strictEqual(result1.created, true);
            assert.strictEqual(result1.fromCache, false);

            // 第二次调用（应该缓存命中）
            const result2 = await collection('test_users').findOneOrCreate(
                { email: 'cache@example.com' },
                {
                    email: 'cache@example.com',
                    name: 'Cache Test Updated',
                    age: 99
                },
                { cache: 5000 }
            );

            assert.strictEqual(result2.created, false);
            assert.strictEqual(result2.fromCache, true, '应该来自缓存');
            assert.strictEqual(result2.doc.name, 'Cache Test', '应该返回缓存的数据');
        });

        it('3.3 应该支持 maxRetries 选项', async function () {
            const { doc, created } = await collection('test_users').findOneOrCreate(
                { email: 'maxRetries@example.com' },
                {
                    email: 'maxRetries@example.com',
                    name: 'Max Retries Test',
                    age: 60
                },
                { maxRetries: 5 }
            );

            assert.strictEqual(created, true);
            assert.ok(doc._id);
        });

        it('3.4 应该支持 comment 选项', async function () {
            const { doc, created } = await collection('test_users').findOneOrCreate(
                { email: 'comment@example.com' },
                {
                    email: 'comment@example.com',
                    name: 'Comment Test',
                    age: 70
                },
                { comment: 'test-findOneOrCreate' }
            );

            assert.strictEqual(created, true);
            assert.ok(doc._id);
        });
    });

    describe('4. 参数验证测试', function () {
        it('4.1 应该拒绝空 query', async function () {
            try {
                await collection('test_users').findOneOrCreate(
                    {},  // 空对象
                    { email: 'test@example.com', name: 'Test' }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('query'));
            }
        });

        it('4.2 应该拒绝 null query', async function () {
            try {
                await collection('test_users').findOneOrCreate(
                    null,
                    { email: 'test@example.com', name: 'Test' }
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('query'));
            }
        });

        it('4.3 应该拒绝空 doc', async function () {
            try {
                await collection('test_users').findOneOrCreate(
                    { email: 'test@example.com' },
                    {}  // 空对象
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('doc'));
            }
        });

        it('4.4 应该拒绝 null doc', async function () {
            try {
                await collection('test_users').findOneOrCreate(
                    { email: 'test@example.com' },
                    null
                );
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('doc'));
            }
        });
    });

    describe('5. 真实场景测试', function () {
        it('5.1 场景：OAuth 用户首次登录', async function () {
            const githubProfile = {
                id: 'github_12345',
                login: 'testuser',
                email: 'oauth@example.com',
                avatar_url: 'https://github.com/avatar.png'
            };

            // 第一次登录（创建用户）
            const { doc: user1, created: created1 } = await collection('test_users').findOneOrCreate(
                { githubId: githubProfile.id },
                {
                    githubId: githubProfile.id,
                    username: githubProfile.login,
                    email: githubProfile.email,
                    avatar: githubProfile.avatar_url,
                    createdAt: new Date()
                }
            );

            assert.strictEqual(created1, true, '首次登录应该创建用户');
            assert.strictEqual(user1.username, 'testuser');

            // 第二次登录（查询到已存在）
            const { doc: user2, created: created2 } = await collection('test_users').findOneOrCreate(
                { githubId: githubProfile.id },
                {
                    githubId: githubProfile.id,
                    username: 'updated',  // 不应该更新
                    email: 'updated@example.com'
                }
            );

            assert.strictEqual(created2, false, '第二次登录应该查询到已存在');
            assert.strictEqual(user2.username, 'testuser', '不应该更新用户名');
            assert.strictEqual(user2._id.toString(), user1._id.toString(), '应该返回相同的用户');
        });

        it('5.2 场景：标签自动创建', async function () {
            const tags = [];

            for (const tagName of ['JavaScript', 'MongoDB', 'Node.js']) {
                const { doc: tag } = await collection('test_tags').findOneOrCreate(
                    { name: tagName },
                    { name: tagName, count: 0, createdAt: new Date() }
                );
                tags.push(tag._id);
            }

            assert.strictEqual(tags.length, 3, '应该创建 3 个标签');

            // 再次请求相同标签，应该返回已存在的
            const { doc: jsTag, created } = await collection('test_tags').findOneOrCreate(
                { name: 'JavaScript' },
                { name: 'JavaScript', count: 0 }
            );

            assert.strictEqual(created, false, '标签已存在，不应该重复创建');
            assert.strictEqual(jsTag._id.toString(), tags[0].toString());
        });

        it('5.3 场景：缓存计算结果', async function () {
            let calculateCallCount = 0;
            const calculateMonthlyStats = async (month) => {
                calculateCallCount++;
                // 模拟耗时计算
                await new Promise(resolve => setTimeout(resolve, 50));
                return { total: 1000, active: 800, new: 50 };
            };

            // 第一次获取（计算并缓存）
            const start1 = Date.now();
            const statsData1 = await calculateMonthlyStats('2024-12');
            const { doc: stats1, created: created1, fromCache: fromCache1 } = await collection('test_stats').findOneOrCreate(
                { month: '2024-12' },
                {
                    month: '2024-12',
                    data: statsData1,
                    createdAt: new Date()
                },
                { cache: 5000 }
            );
            const duration1 = Date.now() - start1;

            assert.strictEqual(created1, true, '首次应该创建');
            assert.strictEqual(fromCache1, false);
            assert.strictEqual(calculateCallCount, 1, '应该调用一次计算函数');

            // 第二次获取（缓存命中，不需要计算）
            const start2 = Date.now();
            // 不调用 calculateMonthlyStats，因为应该从缓存获取
            const { doc: stats2, created: created2, fromCache: fromCache2 } = await collection('test_stats').findOneOrCreate(
                { month: '2024-12' },
                {
                    month: '2024-12',
                    data: { total: 999, active: 999, new: 999 },  // 不同的数据，不应该使用
                    createdAt: new Date()
                },
                { cache: 5000 }
            );
            const duration2 = Date.now() - start2;

            assert.strictEqual(created2, false, '第二次应该查询到已存在');
            assert.strictEqual(fromCache2, true, '应该来自缓存');
            assert.strictEqual(calculateCallCount, 1, '不应该再次调用计算函数');
            assert.ok(duration2 < duration1, '缓存命中应该更快');

            // 验证返回的是原始数据，不是第二次传入的数据
            assert.strictEqual(stats2.data.total, 1000, '应该返回缓存的数据');

            console.log(`  缓存性能: 首次 ${duration1}ms, 缓存命中 ${duration2}ms, 计算调用次数: ${calculateCallCount}`);
        });
    });
});

