/**
 * 多连接池使用示例
 *
 * 演示如何配置和使用多连接池功能
 *
 * @since v1.0.8
 */

const MonSQLize = require('../lib/index');

async function example1_basicMultiPool() {
    console.log('\n========== 示例1: 基础多连接池配置 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',

        // 多连接池配置
        pools: [
            {
                name: 'primary',
                uri: 'mongodb://primary.example.com:27017/myapp',
                role: 'primary',
                options: { maxPoolSize: 50 },
                weight: 1,
                default: true  // 默认连接池
            },
            {
                name: 'secondary-1',
                uri: 'mongodb://secondary1.example.com:27017/myapp',
                role: 'secondary',
                options: { maxPoolSize: 100 },
                weight: 2  // 权重2，接收更多请求
            },
            {
                name: 'secondary-2',
                uri: 'mongodb://secondary2.example.com:27017/myapp',
                role: 'secondary',
                options: { maxPoolSize: 100 },
                weight: 1  // 权重1
            },
            {
                name: 'analytics',
                uri: 'mongodb://analytics.example.com:27017/myapp',
                role: 'analytics',
                options: { maxPoolSize: 20 },
                tags: ['reporting', 'batch']
            }
        ],

        // 连接池选择策略
        poolStrategy: 'auto',  // 自动（读写分离 + 负载均衡）

        // 故障转移配置
        poolFallback: {
            enabled: true,
            retryDelay: 1000,
            maxRetries: 3,
            fallbackStrategy: 'readonly'  // 只读模式降级
        },

        // 连接池数量上限
        maxPoolsCount: 10
    });

    await msq.connect();

    console.log('✅ 多连接池已初始化');
    console.log('连接池列表:', msq.getPoolNames());

    await msq.close();
}

async function example2_dynamicPoolManagement() {
    console.log('\n========== 示例2: 动态连接池管理 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',
        pools: [],  // 初始为空，动态添加
        poolStrategy: 'auto'
    });

    await msq.connect();

    // 动态添加主连接池
    await msq.addPool({
        name: 'primary',
        uri: 'mongodb://primary.example.com:27017/myapp',
        role: 'primary',
        default: true
    });
    console.log('✅ 添加主连接池');

    // 动态添加副本连接池
    await msq.addPool({
        name: 'secondary-1',
        uri: 'mongodb://secondary1.example.com:27017/myapp',
        role: 'secondary',
        weight: 2
    });
    console.log('✅ 添加副本连接池');

    // 获取连接池列表
    console.log('当前连接池:', msq.getPoolNames());

    // 获取统计信息
    const stats = msq.getPoolStats();
    console.log('\n连接池统计:', JSON.stringify(stats, null, 2));

    // 获取健康状态
    const health = msq.getPoolHealth();
    console.log('\n健康状态:');
    for (const [poolName, status] of health.entries()) {
        console.log(`  ${poolName}: ${status.status}`);
    }

    // 移除连接池
    await msq.removePool('secondary-1');
    console.log('\n✅ 移除副本连接池');
    console.log('剩余连接池:', msq.getPoolNames());

    await msq.close();
}

async function example3_transactionWithPool() {
    console.log('\n========== 示例3: 事务锁定到指定连接池 ==========\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',
        pools: [
            {
                name: 'primary',
                uri: 'mongodb://primary.example.com:27017/myapp',
                role: 'primary',
                default: true
            }
        ],
        poolStrategy: 'auto'
    });

    await msq.connect();

    // 事务锁定到 primary 连接池
    await msq.withTransaction(async (tx) => {
        const users = tx.collection('users');
        const orders = tx.collection('orders');

        // 插入用户
        await users.insertOne({
            name: 'Alice',
            email: 'alice@example.com'
        });

        // 插入订单
        await orders.insertOne({
            userId: 'user123',
            amount: 100
        });

        console.log('✅ 事务操作完成');
    }, { pool: 'primary' });  // 🔴 指定连接池

    await msq.close();
}

async function example4_singlePoolBackwardCompatibility() {
    console.log('\n========== 示例4: 单连接池模式（向后兼容）==========\n');

    // 现有代码无需修改
    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',
        config: {
            uri: 'mongodb://localhost:27017/myapp'
        }
    });

    await msq.connect();

    console.log('✅ 单连接池模式正常工作');
    console.log('poolManager:', msq._poolManager === null ? 'null (单连接池)' : '已初始化');

    // 所有现有 API 照常使用
    const { collection } = msq.dbInstance;
    const users = collection('users');

    // 正常执行查询
    // await users.find({ status: 'active' });

    await msq.close();
}

async function example5_fallbackStrategies() {
    console.log('\n========== 示例5: 故障转移策略 ==========\n');

    // 策略1: error - 抛出错误（默认）
    const msq1 = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',
        pools: [...],
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'error'  // 所有连接池故障时抛出错误
        }
    });

    // 策略2: readonly - 只读模式降级
    const msq2 = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',
        pools: [...],
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'readonly'  // 只允许读操作
        }
    });

    // 策略3: secondary - 尝试使用 down 状态的 secondary
    const msq3 = new MonSQLize({
        type: 'mongodb',
        databaseName: 'myapp',
        pools: [...],
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'secondary'  // 尝试使用 down 的 secondary
        }
    });

    console.log('✅ 故障转移策略配置示例');
}

// 运行所有示例
async function main() {
    console.log('=====================================');
    console.log('   多连接池功能使用示例 (v1.0.8+)   ');
    console.log('=====================================');

    try {
        // 注意：这些示例需要实际的 MongoDB 服务器
        // 如果没有，请使用 Memory Server 进行测试

        await example4_singlePoolBackwardCompatibility();

        // 其他示例需要真实的 MongoDB 副本集
        console.log('\n💡 提示：其他示例需要真实的 MongoDB 副本集环境');
        console.log('   - example1: 基础多连接池配置');
        console.log('   - example2: 动态连接池管理');
        console.log('   - example3: 事务锁定');
        console.log('   - example5: 故障转移策略');

    } catch (error) {
        console.error('❌ 错误:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    example1_basicMultiPool,
    example2_dynamicPoolManagement,
    example3_transactionWithPool,
    example4_singlePoolBackwardCompatibility,
    example5_fallbackStrategies
};

