/**
 * 测试所有方法的流式支持
 * find、aggregate 支持 stream: true 参数
 */

const MonSQLize = require('../lib/index');

async function test() {
    console.log('🧪 测试所有方法的流式支持\n');

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
        // 测试 1: find 方法的流式支持
        // ============================================================
        console.log('测试 1: find 方法 - stream: true');
        console.log('-'.repeat(60));

        let count1 = 0;
        const findStream = collection('orders').find({
            query: { status: 'paid' },
            projection: { _id: 1, amount: 1 },
            limit: 10,
            stream: true,  // 启用流式返回
            batchSize: 5
        });

        console.log('返回类型:', findStream.constructor.name);
        console.log('是否是流对象:', typeof findStream.on === 'function');

        findStream.on('data', (doc) => {
            count1++;
            if (count1 <= 3) {
                console.log(`  文档 ${count1}:`, Object.keys(doc));
            }
        });

        await new Promise((resolve, reject) => {
            findStream.on('end', () => {
                console.log(`✅ find 流结束，共读取 ${count1} 条数据\n`);
                resolve();
            });
            findStream.on('error', reject);
        });

        // ============================================================
        // 测试 2: find 方法的常规模式（对比）
        // ============================================================
        console.log('测试 2: find 方法 - 常规模式（返回数组）');
        console.log('-'.repeat(60));

        const findArray = await collection('orders').find({
            query: { status: 'paid' },
            limit: 5
        });

        console.log('返回类型:', Array.isArray(findArray) ? 'Array' : typeof findArray);
        console.log('数据条数:', findArray.length);
        console.log('✅ find 常规模式正常工作\n');

        // ============================================================
        // 测试 3: aggregate 方法的流式支持
        // ============================================================
        console.log('测试 3: aggregate 方法 - stream: true');
        console.log('-'.repeat(60));

        let count3 = 0;
        const aggStream = collection('orders').aggregate([
            { $match: { status: 'paid' } },
            { $project: { _id: 1, amount: 1, status: 1 } },
            { $limit: 10 }
        ], {
            stream: true,  // 启用流式返回
            batchSize: 5
        });

        console.log('返回类型:', aggStream.constructor.name);
        console.log('是否是流对象:', typeof aggStream.on === 'function');

        aggStream.on('data', (doc) => {
            count3++;
            if (count3 <= 3) {
                console.log(`  文档 ${count3}:`, Object.keys(doc));
            }
        });

        await new Promise((resolve, reject) => {
            aggStream.on('end', () => {
                console.log(`✅ aggregate 流结束，共读取 ${count3} 条数据\n`);
                resolve();
            });
            aggStream.on('error', reject);
        });

        // ============================================================
        // 测试 4: aggregate 方法的常规模式（对比）
        // ============================================================
        console.log('测试 4: aggregate 方法 - 常规模式（返回数组）');
        console.log('-'.repeat(60));

        const aggArray = await collection('orders').aggregate([
            { $match: { status: 'paid' } },
            { $limit: 5 }
        ]);

        console.log('返回类型:', Array.isArray(aggArray) ? 'Array' : typeof aggArray);
        console.log('数据条数:', aggArray.length);
        console.log('✅ aggregate 常规模式正常工作\n');

        // ============================================================
        // 测试 5: stream 方法（独立方法，保持向后兼容）
        // ============================================================
        console.log('测试 5: stream 方法（独立方法）');
        console.log('-'.repeat(60));

        let count5 = 0;
        const streamMethod = collection('orders').stream({
            query: { status: 'paid' },
            limit: 10
        });

        streamMethod.on('data', () => { count5++; });

        await new Promise((resolve, reject) => {
            streamMethod.on('end', () => {
                console.log(`✅ stream 方法流结束，共读取 ${count5} 条数据\n`);
                resolve();
            });
            streamMethod.on('error', reject);
        });

        // ============================================================
        // 测试 6: 流式数据转换示例
        // ============================================================
        console.log('测试 6: 流式数据转换（使用 find + stream）');
        console.log('-'.repeat(60));

        const { Transform } = require('stream');

        const transformStream = new Transform({
            objectMode: true,
            transform(doc, encoding, callback) {
                // 转换数据格式
                const transformed = {
                    id: doc._id?.toString(),
                    金额: doc.amount,
                    状态: doc.status
                };
                callback(null, transformed);
            }
        });

        let transformedCount = 0;
        const sourceStream = collection('orders').find({
            query: {},
            limit: 5,
            stream: true
        });

        sourceStream
            .pipe(transformStream)
            .on('data', (doc) => {
                transformedCount++;
                if (transformedCount <= 3) {
                    console.log(`  转换后 ${transformedCount}:`, doc);
                }
            });

        await new Promise((resolve, reject) => {
            transformStream.on('end', () => {
                console.log(`✅ 数据转换完成，共 ${transformedCount} 条\n`);
                resolve();
            });
            transformStream.on('error', reject);
        });

        console.log('='.repeat(60));
        console.log('✅ 所有测试通过！');
        console.log('='.repeat(60));
        console.log('\n📋 总结:');
        console.log('  ✅ find 方法支持 stream: true');
        console.log('  ✅ aggregate 方法支持 stream: true');
        console.log('  ✅ stream 独立方法保持可用');
        console.log('  ✅ 流式和常规模式可以灵活切换');
        console.log('  ✅ 支持 pipe 进行数据转换');

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

