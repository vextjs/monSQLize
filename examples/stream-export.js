/**
 * 数据导出示例
 * 演示如何将查询结果导出为 JSON、CSV 等格式
 */

const MonSQLize = require('../lib/index');
const fs = require('fs');
const path = require('path');
const { Transform, pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

async function streamExportExample() {
    console.log('📤 数据导出示例\n');

    const msq = new MonSQLize({
        type: 'mongodb',
        databaseName: 'test',
        config: { uri: 'mongodb://localhost:27017' },
    });

    try {
        const { collection } = await msq.connect();
        console.log('✅ 数据库连接成功\n');

        const outputDir = path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // ============================================================
        // 示例 1: 导出为 JSONL 格式（每行一个 JSON 对象）
        // ============================================================
        console.log('示例 1: 导出为 JSONL 格式');
        console.log('-'.repeat(60));

        const jsonlTransform = new Transform({
            objectMode: true,
            transform(doc, encoding, callback) {
                // 移除 MongoDB 的 _id，或转换为字符串
                const output = {
                    ...doc,
                    _id: doc._id?.toString()
                };
                this.push(JSON.stringify(output) + '\n');
                callback();
            }
        });

        const jsonlFile = path.join(outputDir, 'orders.jsonl');
        const sourceStream1 = collection('orders').stream({
            query: { status: 'paid' },
            limit: 100
        });

        await pipelineAsync(
            sourceStream1,
            jsonlTransform,
            fs.createWriteStream(jsonlFile)
        );

        console.log(`✅ 成功导出到: ${jsonlFile}\n`);

        // ============================================================
        // 示例 2: 导出为 CSV 格式
        // ============================================================
        console.log('示例 2: 导出为 CSV 格式');
        console.log('-'.repeat(60));

        class CSVTransform extends Transform {
            constructor(fields) {
                super({ objectMode: true });
                this.fields = fields;
                this.isFirstRow = true;
            }

            _transform(doc, encoding, callback) {
                if (this.isFirstRow) {
                    // 写入 CSV 头部
                    this.push(this.fields.join(',') + '\n');
                    this.isFirstRow = false;
                }

                // 写入数据行
                const row = this.fields.map(field => {
                    let value = doc[field];
                    if (value === undefined || value === null) return '';
                    if (value instanceof Date) value = value.toISOString();
                    if (typeof value === 'object') value = JSON.stringify(value);
                    // CSV 转义：如果包含逗号、引号或换行符，则用引号包围
                    value = String(value);
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        value = '"' + value.replace(/"/g, '""') + '"';
                    }
                    return value;
                });
                this.push(row.join(',') + '\n');
                callback();
            }
        }

        const csvFile = path.join(outputDir, 'orders.csv');
        const sourceStream2 = collection('orders').stream({
            query: { status: 'paid' },
            projection: { _id: 1, userId: 1, amount: 1, status: 1, createdAt: 1 },
            limit: 100
        });

        const csvTransform = new CSVTransform(['_id', 'userId', 'amount', 'status', 'createdAt']);

        await pipelineAsync(
            sourceStream2,
            csvTransform,
            fs.createWriteStream(csvFile)
        );

        console.log(`✅ 成功导出到: ${csvFile}\n`);

        // ============================================================
        // 示例 3: 导出为 JSON 数组格式
        // ============================================================
        console.log('示例 3: 导出为 JSON 数组格式');
        console.log('-'.repeat(60));

        class JSONArrayTransform extends Transform {
            constructor() {
                super({ objectMode: true });
                this.isFirst = true;
            }

            _construct(callback) {
                this.push('[\n');
                callback();
            }

            _transform(doc, encoding, callback) {
                if (!this.isFirst) {
                    this.push(',\n');
                }
                this.isFirst = false;

                const output = {
                    ...doc,
                    _id: doc._id?.toString()
                };
                this.push('  ' + JSON.stringify(output, null, 0));
                callback();
            }

            _flush(callback) {
                this.push('\n]\n');
                callback();
            }
        }

        const jsonFile = path.join(outputDir, 'orders.json');
        const sourceStream3 = collection('orders').stream({
            query: { status: 'paid' },
            limit: 50
        });

        const jsonArrayTransform = new JSONArrayTransform();

        await pipelineAsync(
            sourceStream3,
            jsonArrayTransform,
            fs.createWriteStream(jsonFile)
        );

        console.log(`✅ 成功导出到: ${jsonFile}\n`);

        // ============================================================
        // 示例 4: 分批导出多个文件
        // ============================================================
        console.log('示例 4: 分批导出多个文件');
        console.log('-'.repeat(60));

        const sourceStream4 = collection('orders').stream({
            query: {},
            limit: 100
        });

        let fileIndex = 0;
        let currentBatch = [];
        const batchSize = 20;

        for await (const doc of sourceStream4) {
            currentBatch.push({
                ...doc,
                _id: doc._id?.toString()
            });

            if (currentBatch.length >= batchSize) {
                fileIndex++;
                const batchFile = path.join(outputDir, `orders_batch_${fileIndex}.json`);
                fs.writeFileSync(batchFile, JSON.stringify(currentBatch, null, 2));
                console.log(`  ✅ 导出批次 ${fileIndex}: ${currentBatch.length} 条记录`);
                currentBatch = [];
            }
        }

        // 处理最后一批
        if (currentBatch.length > 0) {
            fileIndex++;
            const batchFile = path.join(outputDir, `orders_batch_${fileIndex}.json`);
            fs.writeFileSync(batchFile, JSON.stringify(currentBatch, null, 2));
            console.log(`  ✅ 导出批次 ${fileIndex}: ${currentBatch.length} 条记录`);
        }

        console.log(`✅ 共导出 ${fileIndex} 个批次文件\n`);

        console.log('=' .repeat(60));
        console.log('✅ 所有示例执行完成');
        console.log(`📁 输出目录: ${outputDir}`);
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
    streamExportExample();
}

module.exports = streamExportExample;

