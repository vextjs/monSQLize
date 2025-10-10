/**
 * findPage 流式查询示例
 * 演示如何使用 findPage 的流式模式进行分页数据处理
 */

const MonSQLize = require('../../lib');

async function streamFindPageExample() {
    console.log('📄 findPage 流式查询示例\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
        slowQueryMs: 2000,
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // ============================================================
        // 示例 1: findPage 首页流式查询
        // ============================================================
        console.log('示例 1: findPage 首页 - stream: true');
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
                console.log(`  文档 ${count1}:`, { _id: doc._id, status: doc.status });
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
        // 示例 2: findPage 使用 after 游标的流式查询
        // ============================================================
        console.log('示例 2: findPage 使用 after 游标 - stream: true');
        console.log('-'.repeat(60));

        // 先获取一个游标
        const firstPage = await collection('orders').findPage({
            query: { status: 'paid' },
            sort: { createdAt: -1 },
            limit: 5
        });

        if (firstPage.pageInfo?.endCursor) {
            console.log('已获取第一页的 endCursor');

            let count2 = 0;
            const stream2 = await collection('orders').findPage({
                query: { status: 'paid' },
                sort: { createdAt: -1 },
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
        // 示例 3: 使用 for await 语法处理流式分页
        // ============================================================
        console.log('示例 3: 使用 for await 语法');
        console.log('-'.repeat(60));

        const stream3 = await collection('orders').findPage({
            query: { status: 'shipped' },
            limit: 20,
            stream: true
        });

        let count3 = 0;
        try {
            for await (const doc of stream3) {
                count3++;
                if (count3 <= 3) {
                    console.log(`  处理文档 ${count3}:`, doc._id);
                }
            }
            console.log(`✅ 共处理 ${count3} 条数据\n`);
        } catch (error) {
            console.error('❌ 处理错误:', error);
        }

        // ============================================================
        // 示例 4: 验证流式模式的限制（不支持跳页）
        // ============================================================
        console.log('示例 4: 验证流式模式不支持跳页');
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
        // 示例 5: 验证流式模式不支持 totals
        // ============================================================
        console.log('示例 5: 验证流式模式不支持 totals');
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
        // 示例 6: 常规 findPage 仍然正常工作
        // ============================================================
        console.log('示例 6: 常规 findPage 模式（返回对象）');
        console.log('-'.repeat(60));

        const regularPage = await collection('orders').findPage({
            query: { status: 'paid' },
            limit: 5
        });

        console.log('返回类型:', typeof regularPage);
        console.log('是否有 pageInfo 属性:', !!regularPage.pageInfo);
        console.log('数据条数:', regularPage.items?.length || 0);
        console.log('✅ 常规模式正常工作\n');

        console.log('=' .repeat(60));
        console.log('✅ 所有示例执行完成');
        console.log('=' .repeat(60));
        console.log('\n📋 总结:');
        console.log('  ✅ findPage 支持 stream: true（首页）');
        console.log('  ✅ findPage 支持 stream: true（after 游标）');
        console.log('  ✅ 流式模式正确拒绝跳页请求');
        console.log('  ✅ 流式模式正确拒绝 totals 请求');
        console.log('  ✅ 常规 findPage 模式保持兼容');

    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await msq.close();
        console.log('\n✅ 连接已关闭');
    }
}

// 运行示例
if (require.main === module) {
    streamFindPageExample();
}

module.exports = streamFindPageExample;
