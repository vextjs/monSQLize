/**
 * Model Hooks 功能单元测试
 *
 * 测试范围：
 * 1. before/after hooks 执行
 * 2. hooks 上下文传递
 * 3. hooks 错误处理
 * 4. hooks 参数修改
 *
 * @module test/unit/model/model-hooks.test.js
 */

const assert = require('assert');
const MonSQLize = require('../../../lib/index');
const { Model } = MonSQLize;

// 测试计数器，用于生成唯一集合名
let testCollectionCounter = 0;

// 辅助函数：生成唯一集合名
function getUniqueCollection() {
    return `users_test_${Date.now()}_${testCollectionCounter++}`;
}

describe('Model - Hooks 功能', function() {
    this.timeout(30000);

    let msq;
    let hookCallLog = [];
    let currentCollection; // 当前测试使用的集合名

    // 最后统一关闭所有资源
    after(async function() {
        Model._clear();
        // 确保最后的 msq 实例被关闭
        if (msq) {
            try {
                await msq.close();
            } catch (err) {
                // 忽略错误
            }
        }
    });

    // 每次测试前生成唯一集合名
    beforeEach(function() {
        currentCollection = getUniqueCollection();
    });

    // 每次测试后清理
    afterEach(async function() {
        Model._clear();
        hookCallLog = [];

        // 不在 afterEach 中关闭连接，避免重复关闭
        // msq 会在所有测试结束后的 after 钩子中统一关闭
    });

    describe('before/after hooks 执行', function() {

        beforeEach(async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    status: 'string'
                }),
                hooks: (model) => ({
                    find: {
                        before: (ctx, options) => {
                            hookCallLog.push('find-before');
                        },
                        after: (ctx, result) => {
                            hookCallLog.push('find-after');
                        }
                    },
                    insert: {
                        before: async (ctx, docs) => {
                            hookCallLog.push('insert-before');
                        },
                        after: async (ctx, docs, result) => {
                            hookCallLog.push('insert-after');
                        }
                    },
                    update: {
                        before: (ctx, filter, update) => {
                            hookCallLog.push('update-before');
                        },
                        after: (ctx, result) => {
                            hookCallLog.push('update-after');
                        }
                    },
                    delete: {
                        before: (ctx, filter) => {
                            hookCallLog.push('delete-before');
                        },
                        after: (ctx, result) => {
                            hookCallLog.push('delete-after');
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();
        });

        it('应该在 find 操作前后执行 hooks', async function() {
            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            hookCallLog = [];
            await User.find({});

            assert.ok(hookCallLog.includes('find-before'));
            assert.ok(hookCallLog.includes('find-after'));
            assert.strictEqual(hookCallLog.indexOf('find-before'), 0);
            assert.strictEqual(hookCallLog.indexOf('find-after'), 1);
        });

        it('应该在 insert 操作前后执行 hooks', async function() {
            const User = msq.model(currentCollection);

            hookCallLog = [];
            await User.insertOne({ username: 'test' });

            assert.ok(hookCallLog.includes('insert-before'));
            assert.ok(hookCallLog.includes('insert-after'));
            assert.strictEqual(hookCallLog.indexOf('insert-before'), 0);
            assert.strictEqual(hookCallLog.indexOf('insert-after'), 1);
        });

        it('应该在 update 操作前后执行 hooks', async function() {
            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            hookCallLog = [];
            await User.updateOne({ username: 'test' }, { $set: { status: 'active' } });

            assert.ok(hookCallLog.includes('update-before'));
            assert.ok(hookCallLog.includes('update-after'));
            assert.strictEqual(hookCallLog.indexOf('update-before'), 0);
            assert.strictEqual(hookCallLog.indexOf('update-after'), 1);
        });

        it('应该在 delete 操作前后执行 hooks', async function() {
            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            hookCallLog = [];
            await User.deleteOne({ username: 'test' });

            assert.ok(hookCallLog.includes('delete-before'));
            assert.ok(hookCallLog.includes('delete-after'));
            assert.strictEqual(hookCallLog.indexOf('delete-before'), 0);
            assert.strictEqual(hookCallLog.indexOf('delete-after'), 1);
        });

    });

    describe('hooks 上下文传递', function() {

        it('应该通过 ctx 在 before 和 after 之间传递数据', async function() {
            let ctxValue = null;

            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                hooks: (model) => ({
                    insert: {
                        before: async (ctx, docs) => {
                            ctx.timestamp = Date.now();
                            ctx.customData = 'test-data';
                        },
                        after: async (ctx, docs, result) => {
                            ctxValue = ctx.customData;
                            assert.ok(ctx.timestamp);
                            assert.ok(Date.now() >= ctx.timestamp);
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            assert.strictEqual(ctxValue, 'test-data');
        });

        it('应该支持在 ctx 中传递事务 session', async function() {
            let sessionInAfter = null;

            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                hooks: (model) => ({
                    insert: {
                        before: async (ctx, docs) => {
                            // 模拟传递 session
                            ctx.session = { id: 'mock-session-123' };
                        },
                        after: async (ctx, docs, result) => {
                            sessionInAfter = ctx.session;
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            assert.ok(sessionInAfter);
            assert.strictEqual(sessionInAfter.id, 'mock-session-123');
        });

    });

    describe('hooks 参数修改', function() {

        it('before hook 可以修改插入的数据', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({
                    username: 'string!',
                    createdAt: 'string'
                }),
                hooks: (model) => ({
                    insert: {
                        before: async (ctx, docs) => {
                            // 自动添加时间戳
                            return { ...docs, createdAt: new Date().toISOString() };
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            const user = await User.findOne({ username: 'test' });
            assert.ok(user.createdAt);
        });

        it('after hook 可以修改返回结果', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                hooks: (model) => ({
                    find: {
                        after: (ctx, result) => {
                            // 过滤敏感字段
                            return result.map(doc => ({
                                ...doc,
                                _filtered: true
                            }));
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);
            await User.insertOne({ username: 'test' });

            const users = await User.find({});
            assert.ok(users[0]._filtered);
        });

    });

    describe('hooks 错误处理', function() {

        it('before hook 抛出错误应该中断操作', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                hooks: (model) => ({
                    insert: {
                        before: async (ctx, docs) => {
                            throw new Error('Before hook error');
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            try {
                await User.insertOne({ username: 'test' });
                assert.fail('应该抛出错误');
            } catch (err) {
                assert.ok(err.message.includes('Before hook error'));
            }

            // 验证数据未插入
            const count = await User.count({});
            assert.strictEqual(count, 0);
        });

        it('after hook 错误不应该影响操作结果', async function() {
            Model.define(currentCollection, {
                schema: (dsl) => dsl({ username: 'string!' }),
                hooks: (model) => ({
                    insert: {
                        after: async (ctx, docs, result) => {
                            throw new Error('After hook error');
                        }
                    }
                })
            });

            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test',
                config: { useMemoryServer: true }
            });
            await msq.connect();

            const User = msq.model(currentCollection);

            // after hook 错误被捕获，不影响插入
            const result = await User.insertOne({ username: 'test' });
            assert.ok(result.insertedId);

            // 验证数据已插入
            const count = await User.count({});
            assert.strictEqual(count, 1);
        });

    });

});


