/**
 * watch 方法单元测试
 */

const assert = require('assert');
const { EventEmitter } = require('events');
const { ChangeStreamWrapper } = require('../../../lib/mongodb/queries/watch');

describe('Watch - Unit Tests', () => {

    describe('ChangeStreamWrapper - 基础功能', () => {

        it('should create wrapper instance', () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                {},
                context
            );

            assert.strictEqual(wrapper.isClosed(), false);
            assert.strictEqual(wrapper.getResumeToken(), null);
        });

        it('should handle change events', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: false },
                context
            );

            wrapper.on('change', (change) => {
                assert.strictEqual(change.operationType, 'insert');
                assert.strictEqual(wrapper.getResumeToken()._data, 'test-token');
                done();
            });

            // 模拟 MongoDB change 事件
            mockStream.emit('change', {
                _id: { _data: 'test-token' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'test' },
                documentKey: { _id: '123' }
            });
        });

        it('should track statistics', () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: false },
                context
            );

            // 模拟多个 change 事件
            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'test' }
            });

            mockStream.emit('change', {
                _id: { _data: 'token2' },
                operationType: 'update',
                ns: { db: 'testdb', coll: 'test' }
            });

            const stats = wrapper.getStats();
            assert.strictEqual(stats.totalChanges, 2);
            assert.strictEqual(stats.isActive, true);
            assert(stats.uptime >= 0);
        });

        it('should support event listeners', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: false },
                context
            );

            let callCount = 0;
            const handler = () => { callCount++; };

            wrapper.on('change', handler);

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'test' }
            });

            setTimeout(() => {
                assert.strictEqual(callCount, 1);

                // 移除监听器
                wrapper.off('change', handler);

                mockStream.emit('change', {
                    _id: { _data: 'token2' },
                    operationType: 'insert',
                    ns: { db: 'testdb', coll: 'test' }
                });

                setTimeout(() => {
                    assert.strictEqual(callCount, 1); // 不应该增加
                    done();
                }, 50);
            }, 50);
        });

        it('should support once listeners', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: false },
                context
            );

            let callCount = 0;
            wrapper.once('change', () => { callCount++; });

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'test' }
            });

            mockStream.emit('change', {
                _id: { _data: 'token2' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'test' }
            });

            setTimeout(() => {
                assert.strictEqual(callCount, 1); // 只触发一次
                done();
            }, 50);
        });
    });

    describe('错误分类', () => {

        it('should classify transient errors', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = {
                collectionName: 'test',
                watch: () => mockStream
            };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoReconnect: false },
                context
            );

            // 模拟瞬态错误（应该触发重连）
            wrapper.on('reconnect', (info) => {
                assert(info.attempt > 0);
                done();
            });

            const error = new Error('connection reset');
            error.code = 'ECONNRESET';
            mockStream.emit('error', error);
        });

        it('should classify resumable errors', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = {
                collectionName: 'test',
                watch: () => mockStream
            };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoReconnect: false },
                context
            );

            wrapper._lastResumeToken = { _data: 'old-token' };

            wrapper.on('error', (error) => {
                assert(error.message.includes('resume token'));
                assert.strictEqual(wrapper.getResumeToken(), null); // 应该清除
                done();
            });

            const error = new Error('resume token not found');
            mockStream.emit('error', error);
        });

        it('should classify fatal errors', (done) => {
            const mockStream = new EventEmitter();
            mockStream.close = async () => {}; // 添加 close 方法

            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                {},
                context
            );

            let fatalEmitted = false;

            wrapper.on('fatal', (error) => {
                assert(error.message.includes('collection dropped'));
                fatalEmitted = true;
            });

            wrapper.on('close', () => {
                // close 事件触发时检查
                assert.strictEqual(fatalEmitted, true);
                assert.strictEqual(wrapper.isClosed(), true);
                done();
            });

            const error = new Error('collection dropped');
            mockStream.emit('error', error);
        });
    });

    describe('缓存失效策略', () => {

        it('should invalidate cache on insert', async () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'users' };

            const invalidatedPatterns = [];
            const context = {
                cache: {
                    delPattern: async (pattern) => {
                        invalidatedPatterns.push(pattern);
                        return 1;
                    }
                },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: true },
                context
            );

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'users' },
                documentKey: { _id: '123' }
            });

            // 等待异步失效完成
            await new Promise(resolve => setTimeout(resolve, 50));

            // insert 应该失效 find/findPage/count
            assert(invalidatedPatterns.some(p => p.includes(':users:find:')));
            assert(invalidatedPatterns.some(p => p.includes(':users:findPage:')));
            assert(invalidatedPatterns.some(p => p.includes(':users:count:')));
        });

        it('should invalidate cache on update', async () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'users' };

            const invalidatedPatterns = [];
            const context = {
                cache: {
                    delPattern: async (pattern) => {
                        invalidatedPatterns.push(pattern);
                        return 1;
                    }
                },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: true },
                context
            );

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'update',
                ns: { db: 'testdb', coll: 'users' },
                documentKey: { _id: '123' }
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            // update 应该失效 findOne + find/findPage
            assert(invalidatedPatterns.some(p => p.includes(':users:findOne:')));
            assert(invalidatedPatterns.some(p => p.includes(':users:find:')));
            assert(invalidatedPatterns.some(p => p.includes(':users:findPage:')));
        });

        it('should invalidate cache on delete', async () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'users' };

            const invalidatedPatterns = [];
            const context = {
                cache: {
                    delPattern: async (pattern) => {
                        invalidatedPatterns.push(pattern);
                        return 1;
                    }
                },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: true },
                context
            );

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'delete',
                ns: { db: 'testdb', coll: 'users' },
                documentKey: { _id: '123' }
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            // delete 应该失效 findOne + find/findPage/count
            assert(invalidatedPatterns.some(p => p.includes(':users:findOne:')));
            assert(invalidatedPatterns.some(p => p.includes(':users:find:')));
            assert(invalidatedPatterns.some(p => p.includes(':users:count:')));
        });

        it('should not invalidate cache when disabled', async () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'users' };

            let invalidateCalled = false;
            const context = {
                cache: {
                    delPattern: async () => {
                        invalidateCalled = true;
                        return 0;
                    }
                },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: false },
                context
            );

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'users' }
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            assert.strictEqual(invalidateCalled, false);
        });
    });

    describe('close 方法', () => {

        it('should close wrapper', async () => {
            const mockStream = new EventEmitter();
            mockStream.close = async () => {};

            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                {},
                context
            );

            assert.strictEqual(wrapper.isClosed(), false);

            await wrapper.close();

            assert.strictEqual(wrapper.isClosed(), true);
        });

        it('should emit close event', (done) => {
            const mockStream = new EventEmitter();
            mockStream.close = async () => {};

            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                {},
                context
            );

            wrapper.on('close', () => {
                assert.strictEqual(wrapper.isClosed(), true);
                done();
            });

            wrapper.close();
        });

        it('should be idempotent', async () => {
            const mockStream = new EventEmitter();
            mockStream.close = async () => {};

            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                {},
                context
            );

            await wrapper.close();
            await wrapper.close(); // 第二次调用不应该报错

            assert.strictEqual(wrapper.isClosed(), true);
        });
    });

    describe('getStats 方法', () => {

        it('should return statistics', () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'test' };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                {},
                context
            );

            const stats = wrapper.getStats();

            assert.strictEqual(typeof stats.totalChanges, 'number');
            assert.strictEqual(typeof stats.reconnectAttempts, 'number');
            assert.strictEqual(typeof stats.uptime, 'number');
            assert.strictEqual(typeof stats.isActive, 'boolean');
            assert.strictEqual(typeof stats.cacheInvalidations, 'number');
            assert.strictEqual(typeof stats.errors, 'number');
        });

        it('should track cache invalidations', async () => {
            const mockStream = new EventEmitter();
            const mockCollection = { collectionName: 'users' };
            const context = {
                cache: { delPattern: async () => 1 },
                logger: null
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { autoInvalidateCache: true },
                context
            );

            mockStream.emit('change', {
                _id: { _data: 'token1' },
                operationType: 'insert',
                ns: { db: 'testdb', coll: 'users' }
            });

            await new Promise(resolve => setTimeout(resolve, 50));

            const stats = wrapper.getStats();
            assert(stats.cacheInvalidations > 0);
        });
    });

    describe('并发安全测试 - 重连竞态条件', () => {

        it('should prevent concurrent reconnect attempts', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = {
                collectionName: 'test',
                watch: () => new EventEmitter()
            };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: {
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    debug: () => {}
                }
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { reconnectInterval: 100 },
                context
            );

            let reconnectCount = 0;
            wrapper.on('reconnect', () => {
                reconnectCount++;
            });

            // 模拟多个并发错误
            const error1 = new Error('Connection reset');
            error1.code = 'ECONNRESET';

            const error2 = new Error('Connection timeout');
            error2.code = 'ETIMEDOUT';

            // 同时触发多个错误
            mockStream.emit('error', error1);
            mockStream.emit('error', error2);
            mockStream.emit('error', error1);

            // 等待重连尝试
            setTimeout(() => {
                // 应该只有一次重连尝试（第二和第三次被阻止）
                assert.strictEqual(reconnectCount, 1, 'Should only have 1 reconnect attempt');
                wrapper.close();
                done();
            }, 200);
        });

        it('should handle reconnect failure without infinite recursion', (done) => {
            let watchCallCount = 0;
            const mockStream = new EventEmitter();
            const mockCollection = {
                collectionName: 'test',
                watch: () => {
                    watchCallCount++;
                    // 模拟 watch 总是失败
                    throw new Error('Watch failed');
                }
            };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: {
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    debug: () => {}
                }
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { reconnectInterval: 50, maxReconnectDelay: 100 },
                context
            );

            // 触发重连
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';
            mockStream.emit('error', error);

            // 等待足够长时间观察是否有无限递归
            setTimeout(() => {
                // 应该有重连尝试，但不应该有大量调用（说明没有无限递归）
                assert(watchCallCount > 0, 'Should have reconnect attempts');
                assert(watchCallCount < 10, 'Should not have excessive reconnect attempts');
                wrapper.close();
                done();
            }, 500);
        });

        it('should reset reconnecting flag even on error', (done) => {
            const mockStream = new EventEmitter();
            let watchCalls = 0;
            const mockCollection = {
                collectionName: 'test',
                watch: () => {
                    watchCalls++;
                    if (watchCalls === 1) {
                        // 第一次失败
                        throw new Error('Watch failed');
                    } else {
                        // 第二次成功
                        return new EventEmitter();
                    }
                }
            };
            const context = {
                cache: { delPattern: async () => 0 },
                logger: {
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    debug: () => {}
                }
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { reconnectInterval: 50 },
                context
            );

            // 触发第一次重连
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';
            mockStream.emit('error', error);

            // 等待第一次重连完成并失败
            setTimeout(() => {
                // 检查已经有重连尝试
                const initialAttempts = wrapper.getStats().reconnectAttempts;
                assert(initialAttempts > 0, 'Should have initial reconnect attempt');

                // 触发第二次重连（应该能成功，说明标志已重置）
                mockStream.emit('error', error);

                setTimeout(() => {
                    // 检查有第二次重连尝试
                    assert(watchCalls >= 2, `Should have multiple watch calls, got ${watchCalls}`);
                    wrapper.close();
                    done();
                }, 300);
            }, 250);
        });
    });

    describe('错误处理递归防护', () => {

        it('should use setTimeout to prevent synchronous recursion', (done) => {
            const mockStream = new EventEmitter();
            let recursionDepth = 0;
            let maxRecursionDepth = 0;

            const mockCollection = {
                collectionName: 'test',
                watch: () => {
                    recursionDepth++;
                    maxRecursionDepth = Math.max(maxRecursionDepth, recursionDepth);

                    // 模拟失败
                    const failedStream = new EventEmitter();
                    setTimeout(() => {
                        const error = new Error('Watch creation failed');
                        failedStream.emit('error', error);
                        recursionDepth--;
                    }, 10);

                    return failedStream;
                }
            };

            const context = {
                cache: { delPattern: async () => 0 },
                logger: {
                    info: () => {},
                    warn: () => {},
                    error: () => {},
                    debug: () => {}
                }
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { reconnectInterval: 20 },
                context
            );

            // 触发初始错误
            const error = new Error('Initial error');
            error.code = 'ECONNRESET';
            mockStream.emit('error', error);

            // 等待观察递归深度
            setTimeout(() => {
                // 递归深度应该很浅（因为使用了 setTimeout 避免同步递归）
                assert(maxRecursionDepth <= 2, `Max recursion depth should be <= 2, got ${maxRecursionDepth}`);
                wrapper.close();
                done();
            }, 300);
        });

        it('should check closed flag before retry', (done) => {
            const mockStream = new EventEmitter();
            const mockCollection = {
                collectionName: 'test',
                watch: () => {
                    throw new Error('Watch failed');
                }
            };

            let errorHandlerCalled = 0;
            const context = {
                cache: { delPattern: async () => 0 },
                logger: {
                    info: () => {},
                    warn: () => {},
                    error: () => { errorHandlerCalled++; },
                    debug: () => {}
                }
            };

            const wrapper = new ChangeStreamWrapper(
                mockStream,
                mockCollection,
                [],
                { reconnectInterval: 50 },
                context
            );

            // 触发错误
            const error = new Error('Connection reset');
            error.code = 'ECONNRESET';
            mockStream.emit('error', error);

            // 立即关闭 wrapper
            setTimeout(() => {
                wrapper.close();
            }, 20);

            // 等待确认不会继续重试
            setTimeout(() => {
                const attempts = wrapper.getStats().reconnectAttempts;
                // 应该只有很少的重试（因为已关闭）
                assert(attempts <= 2, `Should have minimal retries after close, got ${attempts}`);
                done();
            }, 300);
        });
    });
});

