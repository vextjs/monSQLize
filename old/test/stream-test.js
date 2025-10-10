/**
 * stream 功能快速验证测试
 */

const MonSQLize = require('../../lib');

async function test() {
    console.log('🧪 开始测试 stream 功能...\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
        slowQueryMs: 1000,
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // 测试 1: 基础 stream 功能
        console.log('测试 1: 基础 stream 功能');
        console.log('-'.repeat(50));

        let count = 0;
        const stream = collection('orders').stream({
            query: {},
            limit: 10,
            batchSize: 5
        });

        // 检查返回的是否是流对象
        console.log('返回类型:', stream.constructor.name);
        console.log('是否有 on 方法:', typeof stream.on === 'function');
        console.log('是否有 pipe 方法:', typeof stream.pipe === 'function');

        stream.on('data', (doc) => {
            count++;
            if (count <= 3) {
                console.log(`文档 ${count}:`, Object.keys(doc));
            }
        });

        stream.on('end', () => {
            console.log(`✅ 流结束，共读取 ${count} 条数据\n`);
        });

        stream.on('error', (error) => {
            console.error('❌ 流错误:', error.message);
        });

        await new Promise((resolve, reject) => {
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        // 测试 2: 带查询条件的 stream
        console.log('测试 2: 带查询条件的 stream');
        console.log('-'.repeat(50));

        let count2 = 0;
        const stream2 = collection('orders').stream({
            query: { status: 'paid' },
            projection: { _id: 1, status: 1, amount: 1 },
            sort: { createdAt: -1 },
            limit: 5,
            batchSize: 2
        });

        stream2.on('data', (doc) => {
            count2++;
            console.log(`文档 ${count2}:`, doc);
        });

        await new Promise((resolve, reject) => {
            stream2.on('end', () => {
                console.log(`✅ 流结束，共读取 ${count2} 条数据\n`);
                resolve();
            });
            stream2.on('error', reject);
        });

        // 测试 3: 验证慢查询日志（可选）
        console.log('测试 3: 慢查询监听');
        console.log('-'.repeat(50));

        let slowQueryTriggered = false;
        msq.on('slow-query', (meta) => {
            if (meta.op === 'stream') {
                slowQueryTriggered = true;
                console.log('🐌 捕获到慢查询事件:', {
                    op: meta.op,
                    durationMs: meta.durationMs,
                    docCount: meta.docCount
                });
            }
        });

        const stream3 = collection('orders').stream({
            query: {},
            limit: 3
        });

        let count3 = 0;
        stream3.on('data', () => { count3++; });

        await new Promise((resolve, reject) => {
            stream3.on('end', resolve);
            stream3.on('error', reject);
        });

        console.log(`处理了 ${count3} 条数据`);
        console.log(`慢查询事件${slowQueryTriggered ? '已' : '未'}触发\n`);

        console.log('=' .repeat(50));
        console.log('✅ 所有测试通过！');
        console.log('=' .repeat(50));

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

