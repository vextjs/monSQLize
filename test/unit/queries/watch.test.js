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
});

