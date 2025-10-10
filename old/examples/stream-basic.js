/**
 * 基础流式查询示例
 * 演示如何使用流式查询处理数据
 */

const MonSQLize = require('../../lib');

async function basicStreamExample() {
    console.log('📦 基础流式查询示例\n');

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
        // 示例 1: 使用 stream() 方法（推荐，最简洁）
        // ============================================================
        console.log('示例 1: 使用 stream() 方法');
        console.log('-'.repeat(60));

        let count1 = 0;
        const stream1 = collection('orders').stream({
            query: { status: 'paid' },
            projection: { _id: 1, amount: 1, createdAt: 1 },
            sort: { createdAt: -1 },
            limit: 100,
            batchSize: 20
        });

        stream1.on('data', (doc) => {
            count1++;
            if (count1 <= 5) {
                console.log(`  文档 ${count1}:`, doc);
            }
        });

        await new Promise((resolve, reject) => {
            stream1.on('end', () => {
                console.log(`✅ 共处理 ${count1} 条数据\n`);
                resolve();
            });
            stream1.on('error', reject);
        });

        // ============================================================
        // 示例 2: 使用 find({stream: true})（等价写法）
        // ============================================================
        console.log('示例 2: 使用 find({stream: true})');
        console.log('-'.repeat(60));

        let count2 = 0;
        const stream2 = collection('orders').find({
            query: { status: 'pending' },
            stream: true,
            batchSize: 10
        });

        stream2.on('data', (doc) => {
            count2++;
        });

        await new Promise((resolve, reject) => {
            stream2.on('end', () => {
                console.log(`✅ 共处理 ${count2} 条数据\n`);
                resolve();
            });
            stream2.on('error', reject);
        });

        // ============================================================
        // 示例 3: 使用 for await 语法（推荐，代码更简洁）
        // ============================================================
        console.log('示例 3: 使用 for await 语法');
        console.log('-'.repeat(60));

        const stream3 = collection('orders').stream({
            query: { status: 'shipped' },
            limit: 50
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
        // 示例 4: 聚合管道流式处理
        // ============================================================
        console.log('示例 4: 聚合管道流式处理');
        console.log('-'.repeat(60));

        const aggStream = collection('orders').aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: '$userId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
            { $sort: { total: -1 } },
            { $limit: 10 }
        ], {
            stream: true,
            allowDiskUse: true
        });

        let count4 = 0;
        aggStream.on('data', (doc) => {
            count4++;
            if (count4 <= 3) {
                console.log(`  用户统计:`, doc);
            }
        });

        await new Promise((resolve, reject) => {
            aggStream.on('end', () => {
                console.log(`✅ 共处理 ${count4} 条聚合结果\n`);
                resolve();
            });
            aggStream.on('error', reject);
        });

        // ============================================================
        // 示例 5: 流式错误处理
        // ============================================================
        console.log('示例 5: 流式错误处理');
        console.log('-'.repeat(60));

        const stream5 = collection('orders').stream({
            query: {},
            limit: 20
        });

        let count5 = 0;
        let hasError = false;

        stream5.on('data', (doc) => {
            count5++;
        });

        stream5.on('error', (error) => {
            hasError = true;
            console.error('❌ 流错误:', error.message);
        });

        await new Promise((resolve) => {
            stream5.on('end', () => {
                if (!hasError) {
                    console.log(`✅ 流正常结束，处理 ${count5} 条数据\n`);
                }
                resolve();
            });
            stream5.on('error', resolve);
        });

        console.log('=' .repeat(60));
        console.log('✅ 所有示例执行完成');
        console.log('=' .repeat(60));

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
    basicStreamExample();
}

module.exports = basicStreamExample;

