/**
 * v1.0.8 类型定义验证
 *
 * 此文件用于验证 v1.0.8 新增功能的 TypeScript 类型定义
 *
 * 注意：这是类型检查文件，不需要实际运行
 */

// ========== 类型导入 ==========
import type MonSQLize from 'monsqlize';
import type { ConnectionPoolManager, SagaOrchestrator } from 'monsqlize';

// ========== 1. 验证 Change Stream 同步配置 ==========

function testSyncConfig() {
    const msq: MonSQLize = null as any;

    // 验证 sync 配置类型
    const config: ConstructorParameters<typeof MonSQLize>[0] = {
        type: 'mongodb',
        databaseName: 'test',
        config: {
            uri: 'mongodb://localhost:27017/test',
            replicaSet: 'rs0'
        },
        sync: {
            enabled: true,
            targets: [
                {
                    name: 'backup-main',
                    uri: 'mongodb://backup:27017/backup',
                    collections: ['users', 'orders'],
                    healthCheck: {
                        enabled: true,
                        interval: 5000
                    }
                }
            ],
            collections: ['users', 'orders'],
            resumeToken: {
                storage: 'file',
                path: './.sync-resume-token'
            },
            filter: (event) => event.operationType !== 'delete',
            transform: (doc) => {
                delete doc.password;
                return doc;
            }
        }
    };
}

// ========== 2. 验证 ConnectionPoolManager ==========

function testPoolManager() {
    const poolManager: ConnectionPoolManager = null as any;

    // 验证构造函数选项
    type PoolOptions = ConstructorParameters<typeof ConnectionPoolManager>[0];
    const options: PoolOptions = {
        maxPoolsCount: 10,
        poolStrategy: 'auto',
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'readonly',
            retryDelay: 1000,
            maxRetries: 3
        },
        logger: console
    };

    // 验证 addPool 方法
    type PoolConfig = Parameters<typeof poolManager.addPool>[0];
    const poolConfig: PoolConfig = {
        name: 'primary',
        uri: 'mongodb://localhost:27017/db',
        role: 'primary',
        weight: 1,
        tags: ['production'],
        options: {
            maxPoolSize: 100,
            minPoolSize: 10
        },
        healthCheck: {
            enabled: true,
            interval: 5000,
            timeout: 3000,
            retries: 3
        }
    };

    // 验证返回类型
    type HealthStatus = ReturnType<typeof poolManager.getHealthStatus>;
    type PoolStats = ReturnType<typeof poolManager.getPoolStats>;
}

// ========== 3. 验证 Saga 分布式事务 ==========

function testSaga() {
    const msq: MonSQLize = null as any;

    // 验证 defineSaga 参数类型
    type SagaDef = Parameters<typeof msq.defineSaga>[0];
    const sagaDef: SagaDef = {
        name: 'create-order',
        steps: [
            {
                name: 'reserve-inventory',
                execute: async (ctx) => {
                    const result = await Promise.resolve({ inventoryId: '123' });
                    ctx.set('inventoryId', result.inventoryId);
                    return result;
                },
                compensate: async (ctx) => {
                    const inventoryId = ctx.get('inventoryId');
                    await Promise.resolve();
                },
                timeout: 5000,
                retries: 3
            },
            {
                name: 'charge-payment',
                execute: async (ctx) => {
                    return await Promise.resolve({ chargeId: '456' });
                },
                compensate: async (ctx) => {
                    await Promise.resolve();
                }
            }
        ],
        timeout: 30000,
        logging: true
    };

    // 验证 executeSaga 返回类型
    type SagaResult = Awaited<ReturnType<typeof msq.executeSaga>>;
    const result: SagaResult = {
        executionId: 'exec-123',
        success: true,
        result: { orderId: 'order-456' },
        completedSteps: ['reserve-inventory', 'charge-payment'],
        compensatedSteps: [],
        duration: 1000
    };

    // 验证 getSagaStats 返回类型
    type SagaStats = ReturnType<typeof msq.getSagaStats>;
    const stats: SagaStats = {
        totalExecutions: 100,
        successCount: 95,
        failureCount: 5,
        compensationCount: 5
    };
}

// ========== 4. 验证 SagaOrchestrator（独立使用） ==========

function testOrchestrator() {
    const orchestrator: SagaOrchestrator = null as any;

    // 验证构造函数选项
    type OrchestratorOptions = ConstructorParameters<typeof SagaOrchestrator>[0];
    const options: OrchestratorOptions = {
        cache: undefined,
        logger: console
    };

    // 验证 define 方法
    type SagaDef = Parameters<typeof orchestrator.define>[0];
    const sagaDef: SagaDef = {
        name: 'payment-saga',
        steps: [
            {
                name: 'step1',
                execute: async (ctx) => {
                    return await Promise.resolve();
                },
                compensate: async (ctx) => {
                    await Promise.resolve();
                }
            }
        ],
        timeout: 60000,
        logging: true
    };

    // 验证返回类型
    type ExecuteResult = Awaited<ReturnType<typeof orchestrator.execute>>;
    type GetSagaResult = ReturnType<typeof orchestrator.getSaga>;
    type ListSagasResult = ReturnType<typeof orchestrator.listSagas>;
    type StatsResult = ReturnType<typeof orchestrator.getStats>;
}

// ========== 5. 高级类型推断验证 ==========

function testTypeInference() {
    // 提取 sync 配置类型
    type BaseOptions = ConstructorParameters<typeof MonSQLize>[0];
    type SyncConfig = NonNullable<BaseOptions['sync']>;
    type SyncTarget = SyncConfig['targets'][number];
    type ResumeToken = SyncConfig['resumeToken'];

    const syncConfig: SyncConfig = {
        enabled: true,
        targets: [
            {
                name: 'backup',
                uri: 'mongodb://localhost:27017/backup'
            }
        ]
    };

    const target: SyncTarget = {
        name: 'backup-main',
        uri: 'mongodb://backup:27017/backup',
        collections: ['users']
    };

    const token: NonNullable<ResumeToken> = {
        storage: 'redis',
        redis: null as any
    };
}

// ========== 6. 验证类型导出 ==========

// 确保类型可以导出
export type {
    MonSQLize,
    ConnectionPoolManager,
    SagaOrchestrator
};

// 类型验证通过标记
const _typeCheck = '✅ v1.0.8 类型定义验证通过';
export { _typeCheck };

