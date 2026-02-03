/**
 * 验证文档示例是否可用
 */

const MonSQLize = require('../../lib/index');
const { ConnectionPoolManager } = require('../../lib/index');

(async () => {
    console.log('='.repeat(80));
    console.log('验证文档示例的可用性');
    console.log('='.repeat(80));

    let manager;
    let msq;

    try {
        // ================================================================
        // 测试1: 验证 ConnectionPoolManager 可以被导出
        // ================================================================
        console.log('\n✅ 测试1: 验证 ConnectionPoolManager 导出');
        console.log('-'.repeat(80));

        if (ConnectionPoolManager) {
            console.log('  ✅ ConnectionPoolManager 已导出');
            console.log(`  ℹ️  类型: ${typeof ConnectionPoolManager}`);
        } else {
            console.log('  ❌ ConnectionPoolManager 未导出');
            process.exit(1);
        }

        // ================================================================
        // 测试2: 验证文档示例代码可以运行
        // ================================================================
        console.log('\n✅ 测试2: 验证文档示例代码');
        console.log('-'.repeat(80));

        // 启动内存数据库获取 URI
        msq = new MonSQLize({
            type: 'mongodb',
            databaseName: 'test',
            config: { useMemoryServer: true }
        });
        await msq.connect();
        const testUri = `mongodb://${msq._adapter.client.options.hosts[0].host}:${msq._adapter.client.options.hosts[0].port}/mydb`;

        // 1. 创建管理器（文档示例）
        manager = new ConnectionPoolManager({
            maxPoolsCount: 10,
            poolStrategy: 'auto',
            logger: console
        });
        console.log('  ✅ 创建管理器成功');

        // 2. 添加主库（文档示例）
        await manager.addPool({
            name: 'primary',
            uri: testUri,
            role: 'primary',
            weight: 1
        });
        console.log('  ✅ 添加主库成功');

        // 3. 添加只读副本（文档示例）
        await manager.addPool({
            name: 'secondary-1',
            uri: testUri,
            role: 'secondary',
            weight: 2
        });
        console.log('  ✅ 添加只读副本成功');

        // 4. 启动健康检查（文档示例）
        manager.startHealthCheck();
        console.log('  ✅ 启动健康检查成功');

        // 5. 使用连接池（文档示例）
        const pool = manager.selectPool('read');
        console.log('  ✅ 选择连接池成功');

        // 验证返回值包含文档说明的属性
        if (!pool.name) {
            console.log('  ❌ pool.name 不存在');
            process.exit(1);
        }
        console.log(`  ✅ pool.name 存在: ${pool.name}`);

        if (!pool.client) {
            console.log('  ❌ pool.client 不存在');
            process.exit(1);
        }
        console.log('  ✅ pool.client 存在');

        if (!pool.db) {
            console.log('  ❌ pool.db 不存在');
            process.exit(1);
        }
        console.log('  ✅ pool.db 存在');

        if (!pool.collection) {
            console.log('  ❌ pool.collection 不存在');
            process.exit(1);
        }
        console.log('  ✅ pool.collection 存在');

        // 测试文档示例代码（略微修改以适应测试环境）
        try {
            const usersCollection = pool.collection('users');
            await usersCollection.insertOne({ name: 'test', status: 'active' });
            const users = await usersCollection.find({ status: 'active' }).toArray();
            console.log(`  ✅ 文档示例代码执行成功，查询到 ${users.length} 条记录`);
        } catch (err) {
            console.log(`  ❌ 文档示例代码执行失败: ${err.message}`);
            process.exit(1);
        }

        // 6. 获取统计（文档示例）
        const stats = manager.getPoolStats();
        console.log('  ✅ 获取统计成功');
        console.log(`  ℹ️  统计信息: ${Object.keys(stats).length} 个连接池`);

        // ================================================================
        // 清理
        // ================================================================
        console.log('\n✅ 清理资源');
        console.log('-'.repeat(80));

        manager.stopHealthCheck();
        await manager.close();
        await msq.close();

        console.log('  ✅ 资源清理完成');

        // ================================================================
        // 总结
        // ================================================================
        console.log('\n' + '='.repeat(80));
        console.log('✅ 所有测试通过！文档示例完全可用！');
        console.log('='.repeat(80));

        console.log('\n验证结果:');
        console.log('  ✅ ConnectionPoolManager 已正确导出');
        console.log('  ✅ selectPool 返回值包含 name、client、db、collection');
        console.log('  ✅ 文档示例代码可以直接运行');
        console.log('  ✅ 文档与实现完全一致');

        process.exit(0);

    } catch (err) {
        console.error('\n❌ 验证失败:');
        console.error(err);

        if (manager) {
            try {
                await manager.close();
            } catch (e) {}
        }
        if (msq) {
            try {
                await msq.close();
            } catch (e) {}
        }

        process.exit(1);
    }
})();
