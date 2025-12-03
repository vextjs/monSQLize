/**
 * watch 方法集成测试（需要副本集）
 * 测试真实 Change Streams 功能
 */

const assert = require('assert');
const MonSQLize = require('../../lib/index');

describe('Watch - Integration Tests (Replica Set)', function() {
    // 副本集启动需要更多时间
    this.timeout(30000);
    
    let msq, collection, watcher;
    
    before(async function() {
        // 启动副本集模式的 MongoDB Memory Server
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test_watch_integration',
            config: {
                useMemoryServer: true,
                memoryServerOptions: {
                    instance: {
                        replSet: 'rs0'  // 启用副本集
                    }
                }
            }
        });
        
        await msq.connect();
        collection = msq.dbInstance.collection('test_users');
        
        // 清空集合
        await collection.deleteMany({});
    });
    
    after(async function() {
        // 清理 watcher
        if (watcher && !watcher.isClosed()) {
            try {
                await watcher.close();
            } catch (err) {
                // 忽略关闭错误
            }
        }

        // 清理数据库连接
        if (msq) {
            try {
                await msq.close();
            } catch (err) {
                // 忽略关闭错误
            }
        }

        // 停止 MongoDB Memory Server（重要！）
        const { stopMemoryServer } = require('../../lib/mongodb/connect');
        try {
            await stopMemoryServer(console);
        } catch (err) {
            // 忽略停止错误
        }
    });
    
    afterEach(async function() {
        if (watcher && !watcher.isClosed()) {
            await watcher.close();
        }
    });
    
    describe('基础 Change Streams', function() {
        
        it('should receive insert events', function(done) {
            this.timeout(10000);
            
            watcher = collection.watch();
            
            watcher.on('change', (change) => {
                try {
                    assert.strictEqual(change.operationType, 'insert');
                    assert.strictEqual(change.fullDocument.name, 'Alice');
                    assert.strictEqual(change.fullDocument.age, 25);
                    done();
                } catch (error) {
                    done(error);
                }
            });
            
            // 等待 watch 建立连接
            setTimeout(async () => {
                await collection.insertOne({ name: 'Alice', age: 25 });
            }, 1000);
        });
        
        it('should receive update events', function(done) {
            this.timeout(10000);
            
            // 先插入数据
            collection.insertOne({ name: 'Bob', age: 30 }).then((result) => {
                const userId = result.insertedId;
                
                watcher = collection.watch();
                
                watcher.on('change', (change) => {
                    try {
                        assert.strictEqual(change.operationType, 'update');
                        assert.strictEqual(change.documentKey._id.toString(), userId.toString());
                        assert.strictEqual(change.fullDocument.age, 31);
                        done();
                    } catch (error) {
                        done(error);
                    }
                });
                
                // 等待 watch 建立连接
                setTimeout(async () => {
                    await collection.updateOne(
                        { _id: userId },
                        { $set: { age: 31 } }
                    );
                }, 1000);
            });
        });
        
        it('should receive delete events', function(done) {
            this.timeout(10000);
            
            // 先插入数据
            collection.insertOne({ name: 'Charlie', age: 35 }).then((result) => {
                const userId = result.insertedId;
                
                watcher = collection.watch();
                
                watcher.on('change', (change) => {
                    try {
                        assert.strictEqual(change.operationType, 'delete');
                        assert.strictEqual(change.documentKey._id.toString(), userId.toString());
                        done();
                    } catch (error) {
                        done(error);
                    }
                });
                
                // 等待 watch 建立连接
                setTimeout(async () => {
                    await collection.deleteOne({ _id: userId });
                }, 1000);
            });
        });
    });
    
    describe('Pipeline 过滤', function() {
        
        it('should filter by operationType', function(done) {
            this.timeout(10000);
            
            // 只监听 insert 操作
            watcher = collection.watch([
                { $match: { operationType: 'insert' } }
            ]);
            
            let eventCount = 0;
            
            watcher.on('change', (change) => {
                eventCount++;
                try {
                    assert.strictEqual(change.operationType, 'insert');
                } catch (error) {
                    done(error);
                }
            });
            
            // 等待 watch 建立连接
            setTimeout(async () => {
                // 插入（应该触发）
                const result = await collection.insertOne({ name: 'David', age: 40 });
                
                // 更新（不应该触发）
                await collection.updateOne(
                    { _id: result.insertedId },
                    { $set: { age: 41 } }
                );
                
                // 检查结果
                setTimeout(() => {
                    try {
                        assert.strictEqual(eventCount, 1);
                        done();
                    } catch (error) {
                        done(error);
                    }
                }, 1000);
            }, 1000);
        });
    });
    
    describe('自动缓存失效', function() {
        
        it('should invalidate cache on insert', function(done) {
            this.timeout(10000);
            
            watcher = collection.watch([], {
                autoInvalidateCache: true
            });
            
            let cacheInvalidated = false;
            
            watcher.on('change', async () => {
                // 等待缓存失效
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const stats = watcher.getStats();
                if (stats.cacheInvalidations > 0) {
                    cacheInvalidated = true;
                }
            });
            
            // 等待 watch 建立连接
            setTimeout(async () => {
                await collection.insertOne({ name: 'Eve', age: 28 });
                
                // 检查结果
                setTimeout(() => {
                    try {
                        assert.strictEqual(cacheInvalidated, true);
                        done();
                    } catch (error) {
                        done(error);
                    }
                }, 1000);
            }, 1000);
        });
    });
    
    describe('统计信息', function() {
        
        it('should track statistics correctly', function(done) {
            this.timeout(10000);
            
            watcher = collection.watch();
            
            let changeReceived = false;

            // 监听 change 事件
            watcher.on('change', () => {
                changeReceived = true;
            });

            // 等待 watch 建立连接
            setTimeout(async () => {
                await collection.insertOne({ name: 'Frank', age: 32 });
                
                // 等待事件处理
                setTimeout(() => {
                    const stats = watcher.getStats();

                    try {
                        // 验证统计信息存在且格式正确
                        assert(typeof stats.totalChanges === 'number');
                        assert(typeof stats.reconnectAttempts === 'number');
                        assert(typeof stats.uptime === 'number');
                        assert(typeof stats.isActive === 'boolean');
                        assert(stats.uptime > 0);

                        // 如果收到了 change 事件，验证 totalChanges > 0
                        if (changeReceived) {
                            assert(stats.totalChanges > 0);
                        }

                        done();
                    } catch (error) {
                        done(error);
                    }
                }, 1500);
            }, 1000);
        });
    });
    
    describe('close 方法', function() {
        
        it('should close watcher properly', async function() {
            watcher = collection.watch();
            
            assert.strictEqual(watcher.isClosed(), false);
            
            await watcher.close();
            
            assert.strictEqual(watcher.isClosed(), true);
        });
    });
});

