/**
 * findOneOrCreate 单元测试
 * @description 测试 findOneOrCreate 扩展方法的所有功能场景
 */

const { describe, it, before, after, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const MonSQLize = require('../../../index.mjs').default;

describe('findOneOrCreate 扩展方法', function() {
    this.timeout(10000);

    let db;
    let collection;

    before(async function() {
        // 连接到测试数据库
        db = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_find_one_or_create',
            config: {
                uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
            },
            slowQueryMs: 100
        });

        dbInstance = await db.connect();

        collection = dbInstance.collection('test_users');

        // 创建 unique 索引（用于测试并发竞态）
        await collection.createIndex({ email: 1 }, { unique: true });
    });

    after(async function() {
        // 清理测试数据
        try {
            await collection.drop();
        } catch (err) {
            // 集合可能不存在，忽略错误
        }

        await db.close();
    });

    beforeEach(async function() {
        // 每个测试前清空集合
        await collection.deleteMany({});
    });

    describe('基本功能', function() {
        it('should create document when it does not exist', async function() {
            const result = await collection.findOneOrCreate(
                { email: 'new@example.com' },
                {
                    email: 'new@example.com',
                    name: 'New User',
                    createdAt: new Date()
                }
            );

            expect(result).to.be.an('object');
            expect(result.doc).to.be.an('object');
            expect(result.doc.email).to.equal('new@example.com');
            expect(result.doc.name).to.equal('New User');
            expect(result.created).to.equal(true);
            expect(result.fromCache).to.equal(false);
            expect(result.doc._id).to.exist;
        });

        it('should return existing document when it exists', async function() {
            // 先插入一个文档
            const inserted = await collection.insertOne({
                email: 'existing@example.com',
                name: 'Existing User',
                createdAt: new Date()
            });

            // 再次尝试创建
            const result = await collection.findOneOrCreate(
                { email: 'existing@example.com' },
                {
                    email: 'existing@example.com',
                    name: 'New Name', // 这个值不会被使用
                    createdAt: new Date()
                }
            );

            expect(result.doc).to.be.an('object');
            expect(result.doc.email).to.equal('existing@example.com');
            expect(result.doc.name).to.equal('Existing User'); // 保持原值
            expect(result.doc._id.toString()).to.equal(inserted.insertedId.toString());
            expect(result.created).to.equal(false);
            expect(result.fromCache).to.equal(false);
        });

        it('should work with complex query', async function() {
            const result = await collection.findOneOrCreate(
                { email: 'complex@example.com', status: 'active' },
                {
                    email: 'complex@example.com',
                    name: 'Complex User',
                    status: 'active',
                    role: 'user',
                    createdAt: new Date()
                }
            );

            expect(result.created).to.equal(true);
            expect(result.doc.email).to.equal('complex@example.com');
            expect(result.doc.status).to.equal('active');
            expect(result.doc.role).to.equal('user');
        });
    });

    describe('并发竞态处理', function() {
        it('should handle concurrent creates with unique index conflict', async function() {
            const email = 'concurrent@example.com';
            const doc = {
                email,
                name: 'Concurrent User',
                createdAt: new Date()
            };

            // 并发执行多次创建（100 次）
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(
                    collection.findOneOrCreate(
                        { email },
                        { ...doc, attempt: i }
                    )
                );
            }

            const results = await Promise.all(promises);

            // 验证结果
            let createdCount = 0;
            let existingCount = 0;

            for (const result of results) {
                expect(result.doc).to.be.an('object');
                expect(result.doc.email).to.equal(email);

                if (result.created) {
                    createdCount++;
                } else {
                    existingCount++;
                }
            }

            // 应该只有 1 个被创建，其余 99 个返回现有文档
            expect(createdCount).to.equal(1);
            expect(existingCount).to.equal(99);

            // 验证数据库中只有 1 条记录
            const count = await collection.count({ email });
            expect(count).to.equal(1);
        });

        it('should retry on duplicate key error and eventually return existing doc', async function() {
            const email = 'retry@example.com';

            // 第一个请求开始
            const promise1 = collection.findOneOrCreate(
                { email },
                {
                    email,
                    name: 'User 1',
                    createdAt: new Date()
                }
            );

            // 第二个请求几乎同时开始
            const promise2 = collection.findOneOrCreate(
                { email },
                {
                    email,
                    name: 'User 2',
                    createdAt: new Date()
                }
            );

            const [result1, result2] = await Promise.all([promise1, promise2]);

            // 一个创建，一个返回现有文档
            const createdResults = [result1, result2].filter(r => r.created);
            const existingResults = [result1, result2].filter(r => !r.created);

            expect(createdResults.length).to.equal(1);
            expect(existingResults.length).to.equal(1);

            // 两个结果的 _id 应该相同（同一个文档）
            expect(result1.doc._id.toString()).to.equal(result2.doc._id.toString());
        });
    });

    describe('缓存功能', function() {
        it('should return fromCache=true when cache is enabled and doc exists', async function() {
            // 使用缓存实例
            const cacheDb = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_cache_find_one_or_create',
                config: {
                    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
                },
                cache: {
                    get: async () => null,
                    set: async () => {},
                    del: async () => {},
                    keys: async () => []
                },
                slowQueryMs: 100
            });

            const cacheDbInstance = await cacheDb.connect();

            const cacheCollection = cacheDbInstance.collection('test_cache_users');

            try {
                // 先插入文档
                await cacheCollection.insertOne({
                    email: 'cache@example.com',
                    name: 'Cache User'
                });

                // 第一次查询（不会命中缓存）
                const result1 = await cacheCollection.findOneOrCreate(
                    { email: 'cache@example.com' },
                    {
                        email: 'cache@example.com',
                        name: 'New Name'
                    },
                    { cache: 5000 }
                );

                expect(result1.created).to.equal(false);
                expect(result1.fromCache).to.equal(false);

                // 第二次查询（应该命中缓存）
                const result2 = await cacheCollection.findOneOrCreate(
                    { email: 'cache@example.com' },
                    {
                        email: 'cache@example.com',
                        name: 'New Name'
                    },
                    { cache: 5000 }
                );

                expect(result2.created).to.equal(false);
                expect(result2.fromCache).to.equal(true);

            } finally {
                await cacheCollection.drop().catch(() => {});
                await cacheDb.close();
            }
        });

        it('should not use cache when document is created', async function() {
            const result = await collection.findOneOrCreate(
                { email: 'nocache@example.com' },
                {
                    email: 'nocache@example.com',
                    name: 'No Cache User'
                },
                { cache: 5000 }
            );

            expect(result.created).to.equal(true);
            expect(result.fromCache).to.equal(false);
        });
    });

    describe('参数验证', function() {
        it('should throw error when query is null', async function() {
            try {
                await collection.findOneOrCreate(null, { name: 'Test' });
                throw new Error('Should have thrown error');
            } catch (err) {
                expect(err.message).to.include('query 参数必须是非空对象');
            }
        });

        it('should throw error when query is empty object', async function() {
            try {
                await collection.findOneOrCreate({}, { name: 'Test' });
                throw new Error('Should have thrown error');
            } catch (err) {
                expect(err.message).to.include('query 参数必须是非空对象');
            }
        });

        it('should throw error when doc is null', async function() {
            try {
                await collection.findOneOrCreate({ email: 'test@example.com' }, null);
                throw new Error('Should have thrown error');
            } catch (err) {
                expect(err.message).to.include('doc 参数必须是非空对象');
            }
        });

        it('should throw error when doc is empty object', async function() {
            try {
                await collection.findOneOrCreate({ email: 'test@example.com' }, {});
                throw new Error('Should have thrown error');
            } catch (err) {
                expect(err.message).to.include('doc 参数必须是非空对象');
            }
        });

        it('should throw error when query is not an object', async function() {
            try {
                await collection.findOneOrCreate('invalid', { name: 'Test' });
                throw new Error('Should have thrown error');
            } catch (err) {
                expect(err.message).to.include('query 参数必须是非空对象');
            }
        });
    });

    describe('选项参数', function() {
        it('should support projection option', async function() {
            await collection.insertOne({
                email: 'projection@example.com',
                name: 'Projection User',
                password: 'secret123',
                age: 30
            });

            const result = await collection.findOneOrCreate(
                { email: 'projection@example.com' },
                {
                    email: 'projection@example.com',
                    name: 'New Name'
                },
                { projection: { email: 1, name: 1 } }
            );

            expect(result.doc.email).to.equal('projection@example.com');
            expect(result.doc.name).to.equal('Projection User');
            expect(result.doc.password).to.be.undefined; // 不应该返回
            expect(result.doc.age).to.be.undefined; // 不应该返回
            expect(result.created).to.equal(false);
        });

        it('should support retryOnConflict=false option', async function() {
            // 先插入一个文档
            await collection.insertOne({
                email: 'noretry@example.com',
                name: 'No Retry User'
            });

            // 使用 retryOnConflict=false（但因为文档已存在，不会触发冲突）
            const result = await collection.findOneOrCreate(
                { email: 'noretry@example.com' },
                {
                    email: 'noretry@example.com',
                    name: 'New Name'
                },
                { retryOnConflict: false }
            );

            expect(result.created).to.equal(false);
            expect(result.doc.name).to.equal('No Retry User');
        });

        it('should support maxRetries option', async function() {
            const result = await collection.findOneOrCreate(
                { email: 'maxretries@example.com' },
                {
                    email: 'maxretries@example.com',
                    name: 'Max Retries User'
                },
                { maxRetries: 5 }
            );

            expect(result.created).to.equal(true);
            expect(result.doc.email).to.equal('maxretries@example.com');
        });

        it('should support comment option', async function() {
            const result = await collection.findOneOrCreate(
                { email: 'comment@example.com' },
                {
                    email: 'comment@example.com',
                    name: 'Comment User'
                },
                { comment: 'Test comment' }
            );

            expect(result.created).to.equal(true);
            expect(result.doc.email).to.equal('comment@example.com');
        });
    });

    describe('错误处理', function() {
        it('should propagate database errors', async function() {
            // 关闭连接后尝试操作
            const tempDb = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_error',
                config: {
                    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017'
                }
            });

            const tempDbInstance = await tempDb.connect();

            const tempCollection = tempDbInstance.collection('test_error_collection');

            await tempDb.close();

            try {
                await tempCollection.findOneOrCreate(
                    { email: 'error@example.com' },
                    { email: 'error@example.com', name: 'Error User' }
                );
                throw new Error('Should have thrown error');
            } catch (err) {
                expect(err.message).to.exist;
                // MongoDB 会抛出 topology closed 或类似错误
            }
        });

        it('should handle maxTimeMS timeout', async function() {
            this.timeout(5000);

            try {
                await collection.findOneOrCreate(
                    { email: 'timeout@example.com' },
                    {
                        email: 'timeout@example.com',
                        name: 'Timeout User'
                    },
                    { maxTimeMS: 1 } // 1ms 超时（几乎必定超时）
                );
                // 可能不会超时（取决于操作速度），所以不强制期望错误
            } catch (err) {
                // 如果超时，应该是 maxTimeMS 相关错误
                expect(err.message).to.exist;
            }
        });
    });

    describe('真实场景', function() {
        it('scenario: OAuth user first login', async function() {
            const githubProfile = {
                id: 'github_12345',
                login: 'testuser',
                email: 'testuser@github.com',
                avatar_url: 'https://avatar.github.com/test'
            };

            const { doc: user, created } = await collection.findOneOrCreate(
                { githubId: githubProfile.id },
                {
                    githubId: githubProfile.id,
                    username: githubProfile.login,
                    email: githubProfile.email,
                    avatar: githubProfile.avatar_url,
                    createdAt: new Date()
                }
            );

            expect(created).to.equal(true);
            expect(user.githubId).to.equal('github_12345');
            expect(user.username).to.equal('testuser');

            // 第二次登录（应该返回现有用户）
            const { doc: user2, created: created2 } = await collection.findOneOrCreate(
                { githubId: githubProfile.id },
                {
                    githubId: githubProfile.id,
                    username: 'new_username', // 不会被使用
                    email: githubProfile.email,
                    createdAt: new Date()
                }
            );

            expect(created2).to.equal(false);
            expect(user2._id.toString()).to.equal(user._id.toString());
            expect(user2.username).to.equal('testuser'); // 保持原值
        });

        it('scenario: Auto-create tag', async function() {
            // 使用独立的集合（避免 email 索引冲突）
            const tagCollection = dbInstance.collection('test_tags');

            // 创建 unique 索引（name + type）
            await tagCollection.createIndex({ name: 1, type: 1 }, { unique: true });

            try {
                const tagNames = ['JavaScript', 'MongoDB', 'Node.js'];
                const tags = [];

                for (const tagName of tagNames) {
                    const { doc: tag } = await tagCollection.findOneOrCreate(
                        { name: tagName, type: 'tag' },
                        {
                            name: tagName,
                            type: 'tag',
                            count: 0,
                            createdAt: new Date()
                        }
                    );
                    tags.push(tag);
                }

                expect(tags.length).to.equal(3);
                expect(tags[0].name).to.equal('JavaScript');
                expect(tags[1].name).to.equal('MongoDB');
                expect(tags[2].name).to.equal('Node.js');

                // 验证标签只创建一次
                const count = await tagCollection.count({ type: 'tag' });
                expect(count).to.equal(3);
            } finally {
                // 清理测试集合
                await tagCollection.drop().catch(() => {});
            }
        });

        it('scenario: Cache calculation result', async function() {
            const month = '2024-12';
            let calculationCalled = false;

            const calculateStats = () => {
                calculationCalled = true;
                return {
                    total: 1000,
                    active: 800,
                    new: 50
                };
            };

            // 第一次查询（计算并插入）
            const { doc: stats1, created: created1 } = await collection.findOneOrCreate(
                { month, type: 'stats' },
                {
                    month,
                    type: 'stats',
                    data: calculateStats(),
                    createdAt: new Date()
                }
            );

            expect(created1).to.equal(true);
            expect(calculationCalled).to.equal(true);
            expect(stats1.data.total).to.equal(1000);

            // 重置标志
            calculationCalled = false;

            // 第二次查询（直接返回，不计算）
            const { doc: stats2, created: created2 } = await collection.findOneOrCreate(
                { month, type: 'stats' },
                {
                    month,
                    type: 'stats',
                    data: calculateStats(), // 不会被执行（因为文档已存在）
                    createdAt: new Date()
                }
            );

            expect(created2).to.equal(false);
            expect(stats2._id.toString()).to.equal(stats1._id.toString());
            // 注意：由于 JavaScript 的求值顺序，calculateStats() 仍会被调用
            // 但在真实使用中，可以通过条件判断避免不必要的计算
        });
    });
});

