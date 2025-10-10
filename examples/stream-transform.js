/**
 * 流式数据转换示例
 * 演示如何使用 Transform 流进行数据转换和处理
 */

const MonSQLize = require('../lib/index');
const { Transform } = require('stream');

async function streamTransformExample() {
    console.log('🔄 流式数据转换示例\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        // ============================================================
        // 示例 1: 数据清洗转换
        // ============================================================
        console.log('示例 1: 数据清洗转换');
        console.log('-'.repeat(60));

        // 创建转换流：清洗和格式化数据
        const cleanTransform = new Transform({
            objectMode: true,
            transform(doc, encoding, callback) {
                // 数据清洗逻辑
                const cleaned = {
                    id: doc._id?.toString(),
                    amount: Number(doc.amount || 0).toFixed(2),
                    status: (doc.status || 'unknown').toLowerCase(),
                    date: doc.createdAt ? new Date(doc.createdAt).toISOString() : null
                };
                this.push(cleaned);
                callback();
            }
        });

        const sourceStream = collection('orders').stream({
            query: { status: 'paid' },
            limit: 100
        });

        let processedCount = 0;
        sourceStream.pipe(cleanTransform);

        for await (const doc of cleanTransform) {
            processedCount++;
            if (processedCount <= 3) {
                console.log(`  清洗后:`, doc);
            }
        }
        console.log(`✅ 共清洗 ${processedCount} 条数据\n`);

        // ============================================================
        // 示例 2: 数据过滤
        // ============================================================
        console.log('示例 2: 数据过滤');
        console.log('-'.repeat(60));

        // 创建过滤流：只保留金额大于 100 的订单
        const filterTransform = new Transform({
            objectMode: true,
            transform(doc, encoding, callback) {
                if (doc.amount > 100) {
                    this.push(doc);
                }
                callback();
            }
        });

        const stream2 = collection('orders').stream({
            query: { status: 'paid' },
            limit: 100
        });

        let filteredCount = 0;
        stream2.pipe(filterTransform);

        for await (const doc of filterTransform) {
            filteredCount++;
            if (filteredCount <= 3) {
                console.log(`  符合条件:`, { id: doc._id, amount: doc.amount });
            }
        }
        console.log(`✅ 过滤后剩余 ${filteredCount} 条数据\n`);

        // ============================================================
        // 示例 3: 批量处理
        // ============================================================
        console.log('示例 3: 批量处理');
        console.log('-'.repeat(60));

        // 创建批量处理流
        class BatchTransform extends Transform {
            constructor(batchSize) {
                super({ objectMode: true });
                this.batchSize = batchSize;
                this.batch = [];
            }

            _transform(doc, encoding, callback) {
                this.batch.push(doc);
                if (this.batch.length >= this.batchSize) {
                    this.push([...this.batch]);
                    this.batch = [];
                }
                callback();
            }

            _flush(callback) {
                if (this.batch.length > 0) {
                    this.push([...this.batch]);
                }
                callback();
            }
        }

        const stream3 = collection('orders').stream({
            query: {},
            limit: 50
        });

        const batchTransform = new BatchTransform(10);
        let batchCount = 0;

        stream3.pipe(batchTransform);

        for await (const batch of batchTransform) {
            batchCount++;
            console.log(`  批次 ${batchCount}: ${batch.length} 条记录`);
            // 这里可以对批量数据进行处理，比如批量插入到另一个集合
        }
        console.log(`✅ 共处理 ${batchCount} 个批次\n`);

        // ============================================================
        // 示例 4: 数据聚合统计
        // ============================================================
        console.log('示例 4: 数据聚合统计');
        console.log('-'.repeat(60));

        // 创建统计流：按用户统计订单
        class StatsTransform extends Transform {
            constructor() {
                super({ objectMode: true });
                this.stats = new Map();
            }

            _transform(doc, encoding, callback) {
                const userId = doc.userId || 'unknown';
                const current = this.stats.get(userId) || { userId, count: 0, total: 0 };
                current.count++;
                current.total += doc.amount || 0;
                this.stats.set(userId, current);
                callback();
            }

            _flush(callback) {
                // 输出统计结果
                for (const [userId, stats] of this.stats.entries()) {
                    this.push(stats);
                }
                callback();
            }
        }

        const stream4 = collection('orders').stream({
            query: { status: 'paid' },
            limit: 100
        });

        const statsTransform = new StatsTransform();
        let statsCount = 0;

        stream4.pipe(statsTransform);

        for await (const stats of statsTransform) {
            statsCount++;
            if (statsCount <= 5) {
                console.log(`  用户统计:`, stats);
            }
        }
        console.log(`✅ 共统计 ${statsCount} 个用户\n`);

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
    streamTransformExample();
}

module.exports = streamTransformExample;

