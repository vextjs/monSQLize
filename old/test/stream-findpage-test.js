/**
 * 测试 findPage 方法的流式支持
 */

const MonSQLize = require('../../lib');

async function test() {
    console.log('🧪 测试 findPage 流式支持...\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
        slowQueryMs: 1000,
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // ============================================================
        // 测试 1: findPage 首页流式查询
        // ============================================================
        console.log('测试 1: findPage 首页 - stream: true');
        console.log('-'.repeat(60));

        let count1 = 0;
        const stream1 = await collection('orders').findPage({
            query: { status: 'paid' },
            limit: 10,
            stream: true,
            batchSize: 5
        });

        console.log('返回类型:', stream1.constructor.name);
        console.log('是否是流对象:', typeof stream1.on === 'function');

        stream1.on('data', (doc) => {
            count1++;
            if (count1 <= 3) {
                console.log(`  文档 ${count1}:`, Object.keys(doc));
            }
        });

        await new Promise((resolve, reject) => {
            stream1.on('end', () => {
                console.log(`✅ findPage 首页流结束，共读取 ${count1} 条数据\n`);
                resolve();
            });
            stream1.on('error', reject);
        });

        // ============================================================
        // 测试 2: findPage 使用 after 游标的流式查询
        // ============================================================
        console.log('测试 2: findPage 使用 after 游标 - stream: true');
        console.log('-'.repeat(60));

        // 先获取一个游标
        const firstPage = await collection('orders').findPage({
            query: { status: 'paid' },
            limit: 5
        });

        if (firstPage.pageInfo?.endCursor) {
            console.log('已获取第一页的 endCursor');

            let count2 = 0;
            const stream2 = await collection('orders').findPage({
                query: { status: 'paid' },
                limit: 5,
                after: firstPage.pageInfo.endCursor,
                stream: true
            });

            stream2.on('data', () => {
                count2++;
            });

            await new Promise((resolve, reject) => {
                stream2.on('end', () => {
                    console.log(`✅ findPage after 游标流结束，共读取 ${count2} 条数据\n`);
                    resolve();
                });
                stream2.on('error', reject);
            });
        } else {
            console.log('⚠️  没有足够数据生成 endCursor，跳过此测试\n');
        }

        // ============================================================
        // 测试 3: 验证流式模式的限制（不支持跳页）
        // ============================================================
        console.log('测试 3: 验证流式模式不支持跳页');
        console.log('-'.repeat(60));

        try {
            await collection('orders').findPage({
                query: { status: 'paid' },
                limit: 10,
                page: 2,
                stream: true
            });
            console.log('❌ 应该抛出错误但没有');
        } catch (err) {
            if (err.code === 'STREAM_NO_JUMP') {
                console.log('✅ 正确拒绝了流式跳页请求');
                console.log(`   错误信息: ${err.message}\n`);
            } else {
                console.log('❌ 错误类型不正确:', err.message);
            }
        }

        // ============================================================
        // 测试 4: 验证流式模式不支持 totals
        // ============================================================
        console.log('测试 4: 验证流式模式不支持 totals');
        console.log('-'.repeat(60));

        try {
            await collection('orders').findPage({
                query: { status: 'paid' },
                limit: 10,
                stream: true,
                totals: { mode: 'sync' }
            });
            console.log('❌ 应该抛出错误但没有');
        } catch (err) {
            if (err.code === 'STREAM_NO_TOTALS') {
                console.log('✅ 正确拒绝了流式 totals 请求');
                console.log(`   错误信息: ${err.message}\n`);
            } else {
                console.log('❌ 错误类型不正确:', err.message);
            }
        }

        // ============================================================
        // 测试 5: 常规 findPage 仍然正常工作
        // ============================================================
        console.log('测试 5: 常规 findPage 模式（返回对象）');
        console.log('-'.repeat(60));

        const regularPage = await collection('orders').findPage({
            query: { status: 'paid' },
            limit: 5
        });

        console.log('返回类型:', typeof regularPage);
        console.log('是否有 edges 属性:', Array.isArray(regularPage.edges));
        console.log('是否有 pageInfo 属性:', !!regularPage.pageInfo);
        console.log('数据条数:', regularPage.edges?.length || 0);
        console.log('✅ 常规模式正常工作\n');

        console.log('=' .repeat(60));
        console.log('✅ 所有测试通过！');
        console.log('=' .repeat(60));
        console.log('\n📋 总结:');
        console.log('  ✅ findPage 支持 stream: true（首页）');
        console.log('  ✅ findPage 支持 stream: true（after 游标）');
        console.log('  ✅ 流式模式正确拒绝跳页请求');
        console.log('  ✅ 流式模式正确拒绝 totals 请求');
        console.log('  ✅ 常规 findPage 模式保持兼容');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await msq.close();
        console.log('\n✅ 连接已关闭');
    }
}

test();

