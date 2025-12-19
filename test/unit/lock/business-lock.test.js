/**
 * 业务锁功能单元测试
 */

const { expect } = require('chai');
const sinon = require('sinon');
const Lock = require('../../../lib/lock/Lock');
const { LockAcquireError, LockTimeoutError } = require('../../../lib/lock/errors');

describe('Business Lock - Unit Tests', () => {

    // ==================== Lock 对象测试 ====================
    describe('Lock', () => {
        let mockManager;

        beforeEach(() => {
            mockManager = {
                releaseLock: sinon.stub().resolves(true),
                renewLock: sinon.stub().resolves(true)
            };
        });

        describe('constructor', () => {
            it('should create Lock instance with correct properties', () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                expect(lock.key).to.equal('test-key');
                expect(lock.lockId).to.equal('lock-id-123');
                expect(lock.manager).to.equal(mockManager);
                expect(lock.ttl).to.equal(5000);
                expect(lock.released).to.be.false;
                expect(lock.acquiredAt).to.be.a('number');
            });
        });

        describe('release()', () => {
            it('should call manager.releaseLock with correct params', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                const result = await lock.release();

                expect(result).to.be.true;
                expect(mockManager.releaseLock.calledOnce).to.be.true;
                expect(mockManager.releaseLock.calledWith('test-key', 'lock-id-123')).to.be.true;
                expect(lock.released).to.be.true;
            });

            it('should return false if already released', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                await lock.release();
                const result = await lock.release();

                expect(result).to.be.false;
                expect(mockManager.releaseLock.calledOnce).to.be.true;
            });

            it('should be idempotent', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                await lock.release();
                await lock.release();
                await lock.release();

                expect(mockManager.releaseLock.calledOnce).to.be.true;
            });
        });

        describe('renew()', () => {
            it('should call manager.renewLock with custom TTL', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                const result = await lock.renew(8000);

                expect(result).to.be.true;
                expect(mockManager.renewLock.calledOnce).to.be.true;
                expect(mockManager.renewLock.calledWith('test-key', 'lock-id-123', 8000)).to.be.true;
            });

            it('should use original TTL if not specified', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                await lock.renew();

                expect(mockManager.renewLock.calledWith('test-key', 'lock-id-123', 5000)).to.be.true;
            });

            it('should return false if already released', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                await lock.release();
                const result = await lock.renew();

                expect(result).to.be.false;
                expect(mockManager.renewLock.called).to.be.false;
            });
        });

        describe('isHeld()', () => {
            it('should return true if not released', () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                expect(lock.isHeld()).to.be.true;
            });

            it('should return false if released', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                await lock.release();

                expect(lock.isHeld()).to.be.false;
            });
        });

        describe('getHoldTime()', () => {
            it('should return elapsed time in milliseconds', async () => {
                const lock = new Lock('test-key', 'lock-id-123', mockManager, 5000);

                await new Promise(resolve => setTimeout(resolve, 50));

                const holdTime = lock.getHoldTime();
                expect(holdTime).to.be.at.least(50);
                expect(holdTime).to.be.below(100);
            });
        });
    });

    // ==================== 错误类测试 ====================
    describe('Lock Errors', () => {
        describe('LockAcquireError', () => {
            it('should create error with correct properties', () => {
                const error = new LockAcquireError('Failed to acquire lock');

                expect(error).to.be.instanceof(Error);
                expect(error.name).to.equal('LockAcquireError');
                expect(error.code).to.equal('LOCK_ACQUIRE_FAILED');
                expect(error.message).to.equal('Failed to acquire lock');
            });
        });

        describe('LockTimeoutError', () => {
            it('should create error with correct properties', () => {
                const error = new LockTimeoutError('Lock operation timed out');

                expect(error).to.be.instanceof(Error);
                expect(error.name).to.equal('LockTimeoutError');
                expect(error.code).to.equal('LOCK_TIMEOUT');
                expect(error.message).to.equal('Lock operation timed out');
            });
        });
    });

    // ==================== DistributedCacheLockManager 业务锁方法测试 ====================
    describe('DistributedCacheLockManager - Business Lock Methods', () => {
        let mockRedis;
        let lockManager;

        beforeEach(() => {
            // Mock Redis 客户端
            mockRedis = {
                on: sinon.stub(),
                set: sinon.stub(),
                eval: sinon.stub(),
                keys: sinon.stub().resolves([]),
                exists: sinon.stub().resolves(0)
            };

            const DistributedCacheLockManager = require('../../../lib/transaction/DistributedCacheLockManager');
            lockManager = new DistributedCacheLockManager({
                redis: mockRedis,
                lockKeyPrefix: 'test:lock:',
                maxDuration: 10000
            });
        });

        describe('_generateLockId()', () => {
            it('should generate unique lock IDs', () => {
                const id1 = lockManager._generateLockId();
                const id2 = lockManager._generateLockId();

                expect(id1).to.be.a('string');
                expect(id2).to.be.a('string');
                expect(id1).to.not.equal(id2);
            });

            it('should include process.pid', () => {
                const id = lockManager._generateLockId();
                expect(id).to.include(process.pid.toString());
            });
        });

        describe('acquireLock()', () => {
            it('should acquire lock successfully on first try', async () => {
                mockRedis.set.resolves('OK');

                const lock = await lockManager.acquireLock('test-resource', { ttl: 5000 });

                expect(lock).to.be.instanceof(Lock);
                expect(lock.key).to.equal('test-resource');
                expect(lock.ttl).to.equal(5000);
                expect(mockRedis.set.calledOnce).to.be.true;

                const setArgs = mockRedis.set.firstCall.args;
                expect(setArgs[0]).to.equal('test:lock:test-resource');
                expect(setArgs[2]).to.equal('PX');
                expect(setArgs[3]).to.equal(5000);
                expect(setArgs[4]).to.equal('NX');
            });

            it('should retry on failure and succeed', async () => {
                mockRedis.set
                    .onFirstCall().resolves(null)
                    .onSecondCall().resolves('OK');

                const lock = await lockManager.acquireLock('test-resource', {
                    ttl: 5000,
                    retryTimes: 3,
                    retryDelay: 10
                });

                expect(lock).to.be.instanceof(Lock);
                expect(mockRedis.set.calledTwice).to.be.true;
            });

            it('should throw LockAcquireError after max retries', async () => {
                mockRedis.set.resolves(null);

                try {
                    await lockManager.acquireLock('test-resource', {
                        ttl: 5000,
                        retryTimes: 2,
                        retryDelay: 10
                    });
                    expect.fail('Should have thrown LockAcquireError');
                } catch (error) {
                    expect(error).to.be.instanceof(LockAcquireError);
                    expect(error.message).to.include('Failed to acquire lock');
                    expect(mockRedis.set.callCount).to.equal(3); // 1 initial + 2 retries
                }
            });
        });

        describe('tryAcquireLock()', () => {
            it('should return Lock on success', async () => {
                mockRedis.set.resolves('OK');

                const lock = await lockManager.tryAcquireLock('test-resource', { ttl: 5000 });

                expect(lock).to.be.instanceof(Lock);
                expect(mockRedis.set.calledOnce).to.be.true;
            });

            it('should return null on failure (no retry)', async () => {
                mockRedis.set.resolves(null);

                const lock = await lockManager.tryAcquireLock('test-resource');

                expect(lock).to.be.null;
                expect(mockRedis.set.calledOnce).to.be.true;
            });

            it('should return null on Redis error', async () => {
                mockRedis.set.rejects(new Error('Redis error'));

                const lock = await lockManager.tryAcquireLock('test-resource');

                expect(lock).to.be.null;
            });
        });

        describe('withLock()', () => {
            it('should execute callback within lock', async () => {
                mockRedis.set.resolves('OK');
                mockRedis.eval.resolves(1);

                let callbackExecuted = false;
                const result = await lockManager.withLock('test-resource', async () => {
                    callbackExecuted = true;
                    return 'success';
                });

                expect(callbackExecuted).to.be.true;
                expect(result).to.equal('success');
                expect(mockRedis.set.calledOnce).to.be.true;
                expect(mockRedis.eval.calledOnce).to.be.true; // release
            });

            it('should release lock after callback completes', async () => {
                mockRedis.set.resolves('OK');
                mockRedis.eval.resolves(1);

                await lockManager.withLock('test-resource', async () => {
                    // no-op
                });

                expect(mockRedis.eval.calledOnce).to.be.true;
            });

            it('should release lock if callback throws', async () => {
                mockRedis.set.resolves('OK');
                mockRedis.eval.resolves(1);

                try {
                    await lockManager.withLock('test-resource', async () => {
                        throw new Error('Callback error');
                    });
                    expect.fail('Should have thrown error');
                } catch (error) {
                    expect(error.message).to.equal('Callback error');
                    expect(mockRedis.eval.calledOnce).to.be.true; // lock still released
                }
            });

            it('should handle release failure gracefully', async () => {
                mockRedis.set.resolves('OK');
                mockRedis.eval.rejects(new Error('Release failed'));

                // Should not throw on release failure
                const result = await lockManager.withLock('test-resource', async () => {
                    return 'success';
                });

                expect(result).to.equal('success');
            });
        });

        describe('releaseLock()', () => {
            it('should release lock using Lua script', async () => {
                mockRedis.eval.resolves(1);

                const result = await lockManager.releaseLock('test-resource', 'lock-id-123');

                expect(result).to.be.true;
                expect(mockRedis.eval.calledOnce).to.be.true;

                const evalArgs = mockRedis.eval.firstCall.args;
                expect(evalArgs[0]).to.include('redis.call("get", KEYS[1])');
                expect(evalArgs[1]).to.equal(1);
                expect(evalArgs[2]).to.equal('test:lock:test-resource');
                expect(evalArgs[3]).to.equal('lock-id-123');
            });

            it('should return false if lock does not belong to this lockId', async () => {
                mockRedis.eval.resolves(0);

                const result = await lockManager.releaseLock('test-resource', 'wrong-id');

                expect(result).to.be.false;
            });
        });

        describe('renewLock()', () => {
            it('should renew lock TTL', async () => {
                mockRedis.eval.resolves(1);

                const result = await lockManager.renewLock('test-resource', 'lock-id-123', 8000);

                expect(result).to.be.true;
                expect(mockRedis.eval.calledOnce).to.be.true;

                const evalArgs = mockRedis.eval.firstCall.args;
                expect(evalArgs[0]).to.include('pexpire');
                expect(evalArgs[3]).to.equal('lock-id-123');
                expect(evalArgs[4]).to.equal(8000);
            });

            it('should return false if lock does not belong to this lockId', async () => {
                mockRedis.eval.resolves(0);

                const result = await lockManager.renewLock('test-resource', 'wrong-id', 8000);

                expect(result).to.be.false;
            });
        });

        describe('_isRedisConnectionError()', () => {
            it('should detect ECONNREFUSED', () => {
                const error = new Error('connect ECONNREFUSED');
                expect(lockManager._isRedisConnectionError(error)).to.be.true;
            });

            it('should detect ETIMEDOUT', () => {
                const error = new Error('connect ETIMEDOUT');
                expect(lockManager._isRedisConnectionError(error)).to.be.true;
            });

            it('should detect Connection is closed', () => {
                const error = new Error('Connection is closed');
                expect(lockManager._isRedisConnectionError(error)).to.be.true;
            });

            it('should return false for other errors', () => {
                const error = new Error('Some other error');
                expect(lockManager._isRedisConnectionError(error)).to.be.false;
            });
        });

        describe('Statistics', () => {
            it('should track successful lock acquisitions', async () => {
                mockRedis.set.resolves('OK');

                const initialStats = lockManager.getStats();
                await lockManager.acquireLock('test1');
                await lockManager.acquireLock('test2');

                const stats = lockManager.getStats();
                expect(stats.locksAcquired).to.equal(initialStats.locksAcquired + 2);
            });

            it('should track lock releases', async () => {
                mockRedis.set.resolves('OK');
                mockRedis.eval.resolves(1);

                const initialStats = lockManager.getStats();
                const lock = await lockManager.acquireLock('test');
                await lock.release();

                const stats = lockManager.getStats();
                expect(stats.locksReleased).to.equal(initialStats.locksReleased + 1);
            });

            it('should track errors', async () => {
                mockRedis.set.resolves(null);

                const initialStats = lockManager.getStats();
                try {
                    await lockManager.acquireLock('test', { retryTimes: 0 });
                } catch (error) {
                    // Expected
                }

                const stats = lockManager.getStats();
                expect(stats.errors).to.be.at.least(initialStats.errors + 1);
            });
        });
    });
});

