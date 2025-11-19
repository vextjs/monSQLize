/**
 * 事务功能单元测试
 * 测试 Transaction 和 TransactionManager 的核心逻辑（不需要真实 MongoDB）
 */

const assert = require('assert');
const Transaction = require('../../../lib/transaction/Transaction');
const TransactionManager = require('../../../lib/transaction/TransactionManager');
const CacheLockManager = require('../../../lib/transaction/CacheLockManager');

describe('MongoDB 事务 - 单元测试', () => {
    
    describe('Transaction 类', () => {
        it('应该正确初始化事务', () => {
            const mockSession = {
                startTransaction: () => {},
                inTransaction: () => true
            };
            
            const tx = new Transaction(mockSession, {
                cache: null,
                logger: console
            });
            
            assert.strictEqual(tx.state, 'pending');
            assert.ok(tx.id);
            assert.strictEqual(tx.session, mockSession);
        });
        
        it('应该在 session 上设置 __monSQLizeTransaction 属性', () => {
            const mockSession = {
                startTransaction: () => {},
                inTransaction: () => true
            };
            
            const tx = new Transaction(mockSession, { logger: console });
            
            assert.strictEqual(mockSession.__monSQLizeTransaction, tx);
        });
        
        it('应该能够记录待失效的缓存键', async () => {
            const mockSession = {
                startTransaction: () => {},
                inTransaction: () => true
            };
            
            const deletedKeys = [];
            const mockCache = {
                delPattern: async (pattern) => {
                    deletedKeys.push(pattern);
                    return 1;
                }
            };
            
            const mockLockManager = {
                addLock: () => {},
                releaseLocks: () => {}
            };
            
            const tx = new Transaction(mockSession, {
                cache: mockCache,
                lockManager: mockLockManager,
                logger: console
            });
            
            await tx.start();
            await tx.recordInvalidation('test:*');
            
            assert.strictEqual(tx.pendingInvalidations.size, 1);
            assert.ok(tx.pendingInvalidations.has('test:*'));
            assert.strictEqual(deletedKeys.length, 1);
            assert.strictEqual(deletedKeys[0], 'test:*');
        });
    });
    
    describe('CacheLockManager 类', () => {
        it('应该能够添加和检查锁', () => {
            const lockManager = new CacheLockManager({ logger: console });
            const mockSession = { id: 'session-123' };
            
            lockManager.addLock('test:key', mockSession);
            
            assert.strictEqual(lockManager.isLocked('test:key'), true);
            assert.strictEqual(lockManager.isLocked('other:key'), false);
        });
        
        it('应该能够释放会话的所有锁', () => {
            const lockManager = new CacheLockManager({ logger: console });
            const mockSession = { id: 'session-123' };
            
            lockManager.addLock('test:key1', mockSession);
            lockManager.addLock('test:key2', mockSession);
            
            assert.strictEqual(lockManager.isLocked('test:key1'), true);
            assert.strictEqual(lockManager.isLocked('test:key2'), true);
            
            lockManager.releaseLocks(mockSession);
            
            assert.strictEqual(lockManager.isLocked('test:key1'), false);
            assert.strictEqual(lockManager.isLocked('test:key2'), false);
        });
        
        it('应该支持通配符模式匹配', () => {
            const lockManager = new CacheLockManager({ logger: console });
            const mockSession = { id: 'session-123' };
            
            lockManager.addLock('test:*', mockSession);
            
            assert.strictEqual(lockManager.isLocked('test:key1'), true);
            assert.strictEqual(lockManager.isLocked('test:key2'), true);
            assert.strictEqual(lockManager.isLocked('other:key'), false);
        });
    });
    
    describe('TransactionManager 类', () => {
        it('应该能够创建和追踪活跃事务', () => {
            const mockClient = {
                startSession: () => ({
                    startTransaction: () => {},
                    endSession: () => {},
                    inTransaction: () => false
                })
            };
            
            const manager = new TransactionManager(mockClient, null, {
                logger: console
            });
            
            assert.strictEqual(manager.activeTransactions.size, 0);
            
            const session1 = mockClient.startSession();
            const session2 = mockClient.startSession();
            
            manager.activeTransactions.set('tx1', session1);
            manager.activeTransactions.set('tx2', session2);
            
            assert.strictEqual(manager.activeTransactions.size, 2);
        });
    });
    
    describe('transaction-aware 辅助函数', () => {
        const { isInTransaction, getTransactionFromSession } = require('../../../lib/mongodb/common/transaction-aware');
        
        it('isInTransaction 应该正确检测事务状态', () => {
            const mockSession = {
                inTransaction: () => true
            };
            
            assert.strictEqual(isInTransaction({ session: mockSession }), true);
            assert.strictEqual(isInTransaction({}), false);
            assert.strictEqual(isInTransaction(null), false);
        });
        
        it('getTransactionFromSession 应该能够获取 Transaction 实例', () => {
            const mockTx = { id: 'tx-123' };
            const mockSession = {
                __monSQLizeTransaction: mockTx
            };
            
            const result = getTransactionFromSession(mockSession);
            assert.strictEqual(result, mockTx);
            
            const emptyResult = getTransactionFromSession({});
            assert.strictEqual(emptyResult, null);
        });
    });
});

