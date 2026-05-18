/**
 * 多连接池基础功能集成测试
 *
 * 验证多连接池的基本功能：
 * - 配置和初始化
 * - 连接池创建
 * - 基础API调用
 * - 统计和健康检查
 *
 * @since v1.0.8
 */

const assert = require('assert');
const MonSQLize = require('../../lib/index');

describe('多连接池基础功能测试 (v1.0.8+)', function () {
    this.timeout(30000);

    let msq;

    // 在所有测试结束后，确保关闭所有连接
    after(async function() {
        // 给一点时间让异步操作完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 强制退出健康检查
        if (global.memoryServer) {
            try {
                await global.memoryServer.stop();
            } catch (err) {
                // 忽略停止错误
            }
        }
    });

    describe('1. 配置和初始化', () => {
        it('应该支持单连接池模式（向后兼容）', async () => {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_single_pool',
                config: { useMemoryServer: true }
            });

            await msq.connect();

            // 验证：单连接池模式下，poolManager 不存在
            assert.strictEqual(msq._poolManager, null);

            // 验证：基础功能正常工作
            const { collection } = msq.dbInstance;
            assert.ok(typeof collection === 'function');

            await msq.close();
        });

        it('应该支持多连接池配置', async () => {
            // 注意：Memory Server 不支持真正的副本集
            // 这里我们模拟配置，但都指向同一个 Memory Server
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_multi_pool',
                config: { useMemoryServer: true },

                // 多连接池配置
                pools: [
                    {
                        name: 'primary',
                        uri: 'mongodb://127.0.0.1:27017/test_multi_pool',  // 将被 Memory Server 覆盖
                        role: 'primary',
                        default: true
                    }
                ],

                poolStrategy: 'auto'
            });

            await msq.connect();

            // 验证：poolManager 已初始化
            assert.ok(msq._poolManager !== null);

            await msq.close();
        });
    });

    describe('2. 连接池管理 API', () => {
        before(async () => {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_pool_api',
                config: { useMemoryServer: true },
                pools: [
                    {
                        name: 'initial-pool',
                        uri: 'mongodb://127.0.0.1:27017/test_pool_api',
                        role: 'primary',
                        default: true
                    }
                ],  // 至少需要一个连接池来启用 poolManager
                poolStrategy: 'auto'
            });

            await msq.connect();
        });

        after(async () => {
            if (msq) await msq.close();
        });

        it('应该能动态添加连接池', async () => {
            // Memory Server 的 URI 会在 connect 时确定
            const memoryUri = msq.config.uri || 'mongodb://127.0.0.1:27017/test_pool_api';

            await msq.addPool({
                name: 'test-pool-1',
                uri: memoryUri,
                role: 'secondary',
                weight: 1
            });

            // 验证：连接池已添加
            const poolNames = msq.getPoolNames();
            assert.ok(poolNames.includes('test-pool-1'));
        });

        it('应该能获取连接池列表', () => {
            const poolNames = msq.getPoolNames();
            assert.ok(Array.isArray(poolNames));
            assert.ok(poolNames.length > 0);
        });

        it('应该能获取连接池统计信息', () => {
            const stats = msq.getPoolStats();
            assert.ok(typeof stats === 'object');

            // 验证统计信息结构
            const poolName = Object.keys(stats)[0];
            if (poolName) {
                assert.ok(typeof stats[poolName].connections === 'number');
                assert.ok(typeof stats[poolName].status === 'string');
            }
        });

        it('应该能获取连接池健康状态', () => {
            const health = msq.getPoolHealth();
            assert.ok(health instanceof Map);
        });

        it('应该能移除连接池', async () => {
            await msq.removePool('test-pool-1');

            // 验证：连接池已移除
            const poolNames = msq.getPoolNames();
            assert.ok(!poolNames.includes('test-pool-1'));
        });
    });

    describe('3. 事务锁定（问题10修复验证）', () => {
        before(async () => {
            msq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_transaction_lock',
                config: { useMemoryServer: true },
                pools: [
                    {
                        name: 'primary',
                        uri: 'mongodb://127.0.0.1:27017/test_transaction_lock',
                        role: 'primary',
                        default: true
                    }
                ],
                poolStrategy: 'auto'
            });

            await msq.connect();
        });

        after(async () => {
            if (msq) await msq.close();
        });

        it('应该支持指定连接池执行事务', async () => {
            // 验证：withTransaction 方法存在
            assert.ok(typeof msq.withTransaction === 'function');

            // 执行事务（指定连接池）
            const result = await msq.withTransaction(async (tx) => {
                // 这里只验证参数传递，不执行实际操作
                return 'success';
            }, { pool: 'primary' });

            assert.strictEqual(result, 'success');
        });
    });

    describe('4. 错误处理', () => {
        it('应该在未启用多连接池时抛出错误', async () => {
            const singlePoolMsq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_error',
                config: { useMemoryServer: true }
            });

            await singlePoolMsq.connect();

            try {
                await singlePoolMsq.addPool({
                    name: 'test',
                    uri: 'mongodb://127.0.0.1:27017/test'
                });
                assert.fail('应该抛出错误');
            } catch (error) {
                assert.ok(error.message.includes('Multi-pool is not enabled'));
            }

            await singlePoolMsq.close();
        });

        it('应该在连接池不存在时抛出错误', async () => {
            const multiPoolMsq = new MonSQLize({
                type: 'mongodb',
                databaseName: 'test_error2',
                config: { useMemoryServer: true },
                pools: [
                    {
                        name: 'primary',
                        uri: 'mongodb://127.0.0.1:27017/test_error2',
                        role: 'primary',
                        default: true
                    }
                ],
                poolStrategy: 'auto'
            });

            await multiPoolMsq.connect();

            try {
                await multiPoolMsq.removePool('non-existent-pool');
                assert.fail('应该抛出错误');
            } catch (error) {
                // 错误消息: "Pool 'non-existent-pool' not found"
                const hasExpectedMessage =
                    error.message.includes('not found') ||
                    error.message.includes("'non-existent-pool'");

                assert.ok(hasExpectedMessage, `Unexpected error: ${error.message}`);
            } finally {
                await multiPoolMsq.close();
            }
        });
    });
});

