/**
 * 流式传输导出大数据示例
 * 演示如何使用 monSQLize 流式传输导出100万级别的数据
 *
 * 适用场景：
 * - 大规模数据导出（CSV、JSON、Excel）
 * - 数据迁移和备份
 * - ETL数据处理
 * - 报表生成
 */

const MonSQLize = require('../lib/index');
const fs = require('fs');
const path = require('path');
const { Transform, pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

// 确保输出目录存在
const OUTPUT_DIR = path.join(__dirname, 'exports');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 生成测试数据
 * 根据需要生成指定数量的测试数据
 */
async function generateTestData(collectionName, count = 100000, batchSize = 5000) {
  console.log(`\n正在为 ${collectionName} 生成 ${count.toLocaleString()} 条测试数据...`);

  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  });

  await msq.connect();

  // 获取原生 MongoDB 集合对象（用于写入）
  // 通过 _adapter 访问底层适配器
  const nativeDb = msq._adapter.client.db('example');
  const collection = nativeDb.collection(collectionName);

  // 检查是否已有足够数据
  const existingCount = await collection.countDocuments();
  if (existingCount >= count) {
    console.log(`✓ ${collectionName} 已有 ${existingCount.toLocaleString()} 条数据，跳过生成`);
    return;
  }

  const startTime = Date.now();
  let insertedCount = 0;

  try {
    // 分批生成和插入数据
    while (insertedCount < count) {
      const batch = [];
      const currentBatchSize = Math.min(batchSize, count - insertedCount);

      for (let i = 0; i < currentBatchSize; i++) {
        const doc = generateDocument(collectionName, insertedCount + i);
        batch.push(doc);
      }

      // 批量插入
      await collection.insertMany(batch, { ordered: false });
      insertedCount += batch.length;

      // 显示进度
      if (insertedCount % 50000 === 0 || insertedCount === count) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = Math.round(insertedCount / elapsed);
        console.log(`  已生成: ${insertedCount.toLocaleString()} / ${count.toLocaleString()} 条 (${speed}/秒)`);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ 数据生成完成！共 ${insertedCount.toLocaleString()} 条，耗时 ${duration} 秒\n`);

  } catch (err) {
    console.error('数据生成失败:', err.message);
    throw err;
  }
}

/**
 * 根据集合名称生成不同类型的文档
 */
function generateDocument(collectionName, index) {
  const baseDate = new Date('2024-01-01');
  const randomDate = new Date(baseDate.getTime() + Math.random() * 365 * 24 * 60 * 60 * 1000);

  switch (collectionName) {
    case 'users':
      return {
        username: `user_${index}_${Math.random().toString(36).substr(2, 6)}`,
        email: `user${index}@example.com`,
        createdAt: randomDate,
        status: ['active', 'inactive', 'pending'][Math.floor(Math.random() * 3)],
        amount: Math.round(Math.random() * 10000 * 100) / 100,
        age: 18 + Math.floor(Math.random() * 50),
        country: ['US', 'CN', 'UK', 'JP', 'DE'][Math.floor(Math.random() * 5)]
      };

    case 'orders':
      return {
        userId: Math.floor(Math.random() * 10000),
        orderNo: `ORD${Date.now()}${index}`,
        amount: Math.round(Math.random() * 5000 * 100) / 100,
        status: ['pending', 'paid', 'completed', 'cancelled'][Math.floor(Math.random() * 4)],
        createdAt: randomDate,
        year: randomDate.getFullYear(),
        items: Math.floor(Math.random() * 10) + 1
      };

    case 'transactions':
      return {
        transactionId: `TXN${Date.now()}${index}`,
        email: `user${Math.floor(Math.random() * 10000)}@example.com`,
        amount: Math.round(Math.random() * 1000 * 100) / 100,
        status: ['pending', 'paid', 'completed', 'cancelled'][Math.floor(Math.random() * 4)],
        category: ['food', 'shopping', 'transport', 'entertainment', 'other'][Math.floor(Math.random() * 5)],
        createdAt: randomDate,
        year: randomDate.getFullYear()
      };

    case 'logs':
      return {
        level: ['info', 'warning', 'error', 'debug'][Math.floor(Math.random() * 4)],
        message: `Log message ${index}: ${Math.random().toString(36).substr(2, 20)}`,
        timestamp: randomDate,
        source: ['api', 'web', 'mobile', 'cron'][Math.floor(Math.random() * 4)],
        userId: Math.floor(Math.random() * 10000)
      };

    case 'large_collection':
    case 'data':
      return {
        field1: `data_${index}_${Math.random().toString(36).substr(2, 8)}`,
        field2: Math.floor(Math.random() * 1000),
        data: `Sample data content ${index}`,
        createdAt: randomDate,
        year: randomDate.getFullYear(),
        value: Math.random() * 100
      };

    default:
      return {
        index,
        data: `Generic data ${index}`,
        createdAt: randomDate,
        randomValue: Math.random()
      };
  }
}

/**
 * 确保所有示例需要的数据都存在
 */
async function ensureTestData() {
  console.log('='.repeat(60));
  console.log('检查测试数据...');
  console.log('='.repeat(60));

  try {
    // 为不同示例生成相应数量的数据 - 100万条用于真实演示
    await generateTestData('users', 1000000, 10000);      // 示例1需要：100万用户
    await generateTestData('orders', 1000000, 10000);     // 示例2、3需要：100万订单
    await generateTestData('transactions', 1000000, 10000); // 示例4、7需要：100万交易
    await generateTestData('logs', 500000, 10000);        // 示例5需要：50万日志
    await generateTestData('large_collection', 1000000, 10000); // 示例6需要：100万数据
    await generateTestData('data', 1000000, 10000);       // 示例8需要：100万数据

    console.log('✅ 所有测试数据准备完成！\n');
  } catch (err) {
    console.error('❌ 测试数据准备失败:', err);
    throw err;
  }
}

/**
 * 示例1：导出100万条数据到 CSV
 * 内存占用：< 50MB
 * 适用：最常见的数据导出需求
 */
async function exportToCSV() {
  console.log('\n========== 示例1：导出CSV（100万条数据）==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const startTime = Date.now();
  const outputPath = path.join(OUTPUT_DIR, 'export_1m_records.csv');
  const writeStream = fs.createWriteStream(outputPath);

  // 写入CSV表头
  writeStream.write('ID,用户名,邮箱,创建时间,状态,金额\n');

  // 创建流式查询 - 移除日期过滤，导出所有数据
  const stream = await collection('users').find({
    query: {},  // 查询所有数据
    sort: { _id: 1 },
    projection: { _id: 1, username: 1, email: 1, createdAt: 1, status: 1, amount: 1 },
    stream: true,
    limit: 0,     // ✅ 关键：必须设置为 0 表示不限制数量
    batchSize: 2000,
    maxTimeMS: 600000, // 10分钟超时
  });

  let count = 0;
  let lastLog = Date.now();

  stream.on('data', (doc) => {
    // CSV行转换（处理特殊字符）
    const row = [
      doc._id.toString(),
      `"${(doc.username || '').replace(/"/g, '""')}"`, // 转义双引号
      `"${(doc.email || '').replace(/"/g, '""')}"`,
      doc.createdAt ? doc.createdAt.toISOString() : '',
      doc.status || '',
      doc.amount || 0
    ].join(',');

    writeStream.write(row + '\n');
    count++;

    // 每10秒输出一次进度
    const now = Date.now();
    if (now - lastLog > 10000) {
      const elapsed = (now - startTime) / 1000;
      const speed = Math.round(count / elapsed);
      const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(`进度: ${count.toLocaleString()} 条 | 速度: ${speed}/秒 | 内存: ${memUsage}MB`);
      lastLog = now;
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      writeStream.end();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      const avgSpeed = Math.round(count / duration);
      console.log(`\n✅ CSV导出完成！`);
      console.log(`   文件: ${outputPath}`);
      console.log(`   总数: ${count.toLocaleString()} 条`);
      console.log(`   耗时: ${duration} 秒`);
      console.log(`   平均速度: ${avgSpeed} 条/秒`);
      console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });

    stream.on('error', (err) => {
      writeStream.end();
      console.error('❌ 流式导出失败:', err);
      reject(err);
    });
  });
}

/**
 * 示例2：导出100万条数据到 JSONL (JSON Lines)
 * 内存占用：< 30MB
 * 适用：数据备份、导入到其他系统
 */
async function exportToJSONL() {
  console.log('\n========== 示例2：导出JSONL（100万条数据）==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const startTime = Date.now();
  const outputPath = path.join(OUTPUT_DIR, 'export_1m_records.jsonl');
  const writeStream = fs.createWriteStream(outputPath);

  const stream = await collection('orders').find({
    query: { year: 2024 },
    sort: { createdAt: 1 },
    stream: true,
    batchSize: 2000,
  });

  let count = 0;

  stream.on('data', (doc) => {
    // 每行一个JSON对象
    writeStream.write(JSON.stringify(doc) + '\n');
    count++;

    if (count % 50000 === 0) {
      const memUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
      console.log(`已导出: ${count.toLocaleString()} 条 | 内存: ${memUsage}MB`);
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      writeStream.end();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ JSONL导出完成！`);
      console.log(`   文件: ${outputPath}`);
      console.log(`   总数: ${count.toLocaleString()} 条`);
      console.log(`   耗时: ${duration} 秒`);
      console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });

    stream.on('error', reject);
  });
}

/**
 * 示例3：流式聚合导出（带数据转换）
 * 演示：联表 + 数据清洗 + 导出
 */
async function exportAggregatedData() {
  console.log('\n========== 示例3：流式聚合导出（联表查询）==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const startTime = Date.now();
  const outputPath = path.join(OUTPUT_DIR, 'export_orders_with_users.csv');
  const writeStream = fs.createWriteStream(outputPath);

  // CSV表头
  writeStream.write('订单ID,用户名,用户邮箱,订单金额,订单状态,创建时间\n');

  // 聚合管道：联表查询
  const pipeline = [
    {
      $match: {
        status: { $in: ['paid', 'completed'] },
        createdAt: { $gte: new Date('2024-01-01') }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        orderId: '$_id',
        amount: 1,
        status: 1,
        createdAt: 1,
        userName: '$user.username',
        userEmail: '$user.email'
      }
    },
    { $sort: { createdAt: 1 } }
  ];

  const stream = await collection('orders').aggregate(pipeline, {
    stream: true,
    batchSize: 1000,
    allowDiskUse: true, // 大数据量必须开启
    maxTimeMS: 600000,
  });

  let count = 0;

  stream.on('data', (doc) => {
    const row = [
      doc.orderId.toString(),
      `"${(doc.userName || 'N/A').replace(/"/g, '""')}"`,
      `"${(doc.userEmail || 'N/A').replace(/"/g, '""')}"`,
      doc.amount || 0,
      doc.status || '',
      doc.createdAt ? doc.createdAt.toISOString() : ''
    ].join(',');

    writeStream.write(row + '\n');
    count++;

    if (count % 50000 === 0) {
      console.log(`已导出: ${count.toLocaleString()} 条`);
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      writeStream.end();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n✅ 聚合导出完成！`);
      console.log(`   文件: ${outputPath}`);
      console.log(`   总数: ${count.toLocaleString()} 条`);
      console.log(`   耗时: ${duration} 秒`);
      resolve();
    });

    stream.on('error', reject);
  });
}

/**
 * 示例4：使用 Transform 流进行数据转换
 * 演示：复杂的数据处理逻辑
 */
async function exportWithTransform() {
  console.log('\n========== 示例4：Transform流数据转换 ==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const outputPath = path.join(OUTPUT_DIR, 'export_transformed.csv');

  // 创建数据转换流
  const transformer = new Transform({
    objectMode: true,
    transform(doc, encoding, callback) {
      try {
        // 复杂的数据转换逻辑
        const transformed = {
          id: doc._id.toString(),
          // 数据脱敏
          email: doc.email ? doc.email.replace(/(.{3}).*(@.*)/, '$1***$2') : '',
          // 金额格式化
          amount: doc.amount ? `$${doc.amount.toFixed(2)}` : '$0.00',
          // 状态翻译
          statusCN: {
            'pending': '待处理',
            'paid': '已支付',
            'completed': '已完成',
            'cancelled': '已取消'
          }[doc.status] || doc.status,
          // 日期格式化
          date: doc.createdAt ? doc.createdAt.toISOString().split('T')[0] : ''
        };

        // 转换为CSV行
        const row = Object.values(transformed).map(v => `"${v}"`).join(',') + '\n';
        callback(null, row);
      } catch (err) {
        callback(err);
      }
    }
  });

  const stream = await collection('transactions').find({
    query: { year: 2024 },
    stream: true,
    batchSize: 2000,
  });

  const writeStream = fs.createWriteStream(outputPath);

  // 写入表头
  writeStream.write('ID,邮箱(脱敏),金额,状态,日期\n');

  let count = 0;
  transformer.on('data', () => count++);

  try {
    await pipelineAsync(stream, transformer, writeStream);
    console.log(`✅ Transform导出完成！总数: ${count.toLocaleString()} 条`);
  } catch (err) {
    console.error('❌ 导出失败:', err);
  }
}

/**
 * 示例5：带背压控制的流式导出
 * 演示：处理慢速下游（如调用外部API）
 */
async function exportWithBackpressure() {
  console.log('\n========== 示例5：背压控制导出 ==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const outputPath = path.join(OUTPUT_DIR, 'export_with_backpressure.jsonl');
  const writeStream = fs.createWriteStream(outputPath);

  const stream = await collection('logs').find({
    query: { level: 'error', timestamp: { $gte: new Date('2024-01-01') } },
    stream: true,
    batchSize: 500,
  });

  let count = 0;
  let processingCount = 0;

  stream.on('data', async (doc) => {
    // 暂停流
    stream.pause();
    processingCount++;

    try {
      // 模拟慢速处理（如调用外部API进行数据enrichment）
      await simulateSlowProcessing(doc);

      // 写入数据
      writeStream.write(JSON.stringify(doc) + '\n');
      count++;

      if (count % 1000 === 0) {
        console.log(`已处理: ${count.toLocaleString()} 条 | 处理中: ${processingCount}`);
      }
    } catch (err) {
      console.error('处理失败:', err);
    } finally {
      processingCount--;
      // 恢复流
      stream.resume();
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      writeStream.end();
      console.log(`✅ 背压控制导出完成！总数: ${count.toLocaleString()} 条`);
      resolve();
    });

    stream.on('error', reject);
  });
}

// 模拟慢速处理
async function simulateSlowProcessing(doc) {
  // 模拟异步处理（如API调用）
  return new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * 示例6：分块导出（每10万条一个文件）
 * 适用：需要分割大文件的场景
 */
async function exportInChunks() {
  console.log('\n========== 示例6：分块导出（每10万条一个文件）==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const CHUNK_SIZE = 100000;
  let totalCount = 0;
  let chunkCount = 0;
  let fileIndex = 1;
  let currentStream = null;

  const createNewFile = () => {
    if (currentStream) {
      currentStream.end();
    }
    const filename = `export_chunk_${fileIndex}.csv`;
    const filepath = path.join(OUTPUT_DIR, filename);
    currentStream = fs.createWriteStream(filepath);
    currentStream.write('ID,数据字段1,数据字段2,创建时间\n');
    console.log(`创建新文件: ${filename}`);
    fileIndex++;
    chunkCount = 0;
  };

  createNewFile();

  const stream = await collection('large_collection').find({
    query: {},
    stream: true,
    batchSize: 2000,
  });

  stream.on('data', (doc) => {
    const row = [
      doc._id.toString(),
      doc.field1 || '',
      doc.field2 || '',
      doc.createdAt ? doc.createdAt.toISOString() : ''
    ].join(',') + '\n';

    currentStream.write(row);
    chunkCount++;
    totalCount++;

    // 达到分块大小，创建新文件
    if (chunkCount >= CHUNK_SIZE) {
      createNewFile();
    }

    if (totalCount % 50000 === 0) {
      console.log(`已导出: ${totalCount.toLocaleString()} 条`);
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      if (currentStream) {
        currentStream.end();
      }
      console.log(`\n✅ 分块导出完成！`);
      console.log(`   总数: ${totalCount.toLocaleString()} 条`);
      console.log(`   文件数: ${fileIndex - 1} 个`);
      resolve();
    });

    stream.on('error', reject);
  });
}

/**
 * 示例7：导出时进行实时统计
 * 演示：边导出边统计分析
 */
async function exportWithStatistics() {
  console.log('\n========== 示例7：导出 + 实时统计 ==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const outputPath = path.join(OUTPUT_DIR, 'export_with_stats.csv');
  const writeStream = fs.createWriteStream(outputPath);
  writeStream.write('ID,类别,金额,状态\n');

  // 实时统计
  const stats = {
    total: 0,
    byCategory: {},
    byStatus: {},
    totalAmount: 0,
    minAmount: Infinity,
    maxAmount: -Infinity
  };

  const stream = await collection('transactions').find({
    query: { year: 2024 },
    stream: true,
    batchSize: 2000,
  });

  stream.on('data', (doc) => {
    // 写入CSV
    const row = [
      doc._id.toString(),
      doc.category || '',
      doc.amount || 0,
      doc.status || ''
    ].join(',') + '\n';
    writeStream.write(row);

    // 实时统计
    stats.total++;
    stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;
    stats.byStatus[doc.status] = (stats.byStatus[doc.status] || 0) + 1;
    stats.totalAmount += doc.amount || 0;
    stats.minAmount = Math.min(stats.minAmount, doc.amount || 0);
    stats.maxAmount = Math.max(stats.maxAmount, doc.amount || 0);

    if (stats.total % 100000 === 0) {
      console.log(`进度: ${stats.total.toLocaleString()} 条`);
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      writeStream.end();

      // 输出统计结果
      console.log(`\n✅ 导出完成！统计结果：`);
      console.log(`   总记录数: ${stats.total.toLocaleString()}`);
      console.log(`   总金额: $${stats.totalAmount.toLocaleString()}`);
      console.log(`   平均金额: $${(stats.totalAmount / stats.total).toFixed(2)}`);
      console.log(`   金额范围: $${stats.minAmount} - $${stats.maxAmount}`);
      console.log(`\n   按类别统计:`);
      Object.entries(stats.byCategory).forEach(([cat, count]) => {
        console.log(`     ${cat}: ${count.toLocaleString()} 条`);
      });
      console.log(`\n   按状态统计:`);
      Object.entries(stats.byStatus).forEach(([status, count]) => {
        console.log(`     ${status}: ${count.toLocaleString()} 条`);
      });

      // 保存统计结果
      const statsPath = path.join(OUTPUT_DIR, 'export_statistics.json');
      fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
      console.log(`\n   统计文件: ${statsPath}`);

      resolve();
    });

    stream.on('error', reject);
  });
}

/**
 * 示例8：错误处理和断点续传
 * 演示：生产环境的健壮性处理
 */
async function exportWithResume() {
  console.log('\n========== 示例8：支持断点续传的导出 ==========');

  const { collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: process.env.MONGO_URI || 'mongodb://localhost:27017' },
  }).connect();

  const outputPath = path.join(OUTPUT_DIR, 'export_resumable.csv');
  const progressPath = path.join(OUTPUT_DIR, 'export_progress.json');

  // 读取上次进度
  let lastId = null;
  let totalCount = 0;

  if (fs.existsSync(progressPath)) {
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    lastId = progress.lastId;
    totalCount = progress.count;
    console.log(`从断点恢复: 已完成 ${totalCount.toLocaleString()} 条`);
  }

  const writeStream = fs.createWriteStream(outputPath, { flags: 'a' }); // append模式

  if (!lastId) {
    // 首次导出，写入表头
    writeStream.write('ID,数据,时间\n');
  }

  // 构建查询条件（从上次断点继续）
  const query = { year: 2024 };
  if (lastId) {
    query._id = { $gt: lastId };
  }

  const stream = await collection('data').find({
    query,
    sort: { _id: 1 }, // 必须有稳定排序
    stream: true,
    batchSize: 2000,
  });

  let currentId = lastId;
  let errorCount = 0;
  const MAX_ERRORS = 10;

  stream.on('data', (doc) => {
    try {
      const row = [
        doc._id.toString(),
        doc.data || '',
        doc.createdAt ? doc.createdAt.toISOString() : ''
      ].join(',') + '\n';

      writeStream.write(row);
      currentId = doc._id;
      totalCount++;

      // 每1000条保存一次进度
      if (totalCount % 1000 === 0) {
        fs.writeFileSync(progressPath, JSON.stringify({
          lastId: currentId,
          count: totalCount,
          timestamp: new Date().toISOString()
        }));
      }

      if (totalCount % 50000 === 0) {
        console.log(`已导出: ${totalCount.toLocaleString()} 条`);
      }
    } catch (err) {
      errorCount++;
      console.error(`处理错误 (${errorCount}/${MAX_ERRORS}):`, err.message);

      if (errorCount >= MAX_ERRORS) {
        console.error('错误次数过多，中止导出');
        stream.destroy();
      }
    }
  });

  return new Promise((resolve, reject) => {
    stream.on('end', () => {
      writeStream.end();

      // 完成后删除进度文件
      if (fs.existsSync(progressPath)) {
        fs.unlinkSync(progressPath);
      }

      console.log(`✅ 导出完成！总数: ${totalCount.toLocaleString()} 条`);
      console.log(`   文件: ${outputPath}`);
      resolve();
    });

    stream.on('error', (err) => {
      console.error('❌ 流错误:', err);
      // 保存当前进度
      fs.writeFileSync(progressPath, JSON.stringify({
        lastId: currentId,
        count: totalCount,
        error: err.message,
        timestamp: new Date().toISOString()
      }));
      reject(err);
    });
  });
}

// 主函数：运行所有示例
async function main() {
  console.log('='.repeat(60));
  console.log('monSQLize 流式传输导出大数据示例');
  console.log('演示如何高效导出100万级别的数据');
  console.log('='.repeat(60));

  try {
    // 首先确保测试数据存在
    await ensureTestData();

    // 选择要运行的示例（取消注释即可运行）

    // 示例1：最常用 - CSV导出
    await exportToCSV();

    // 示例2：JSONL格式导出
    // await exportToJSONL();

    // 示例3：聚合查询导出
    // await exportAggregatedData();

    // 示例4：Transform流转换
    // await exportWithTransform();

    // 示例5：背压控制
    // await exportWithBackpressure();

    // 示例6：分块导出
    // await exportInChunks();

    // 示例7：实时统计
    // await exportWithStatistics();

    // 示例8：断点续传
    // await exportWithResume();

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有示例运行完成！');
    console.log('='.repeat(60));
    console.log('\n💡 提示：');
    console.log('  - 取消注释要运行的其他示例');
    console.log('  - 所有导出文件保存在: ' + OUTPUT_DIR);
    console.log('  - 如需重新生成测试数据，请先删除 MongoDB 中的集合');

  } catch (err) {
    console.error('\n❌ 运行失败:', err);
    process.exit(1);
  }
}

// 性能监控工具
function monitorPerformance(interval = 5000) {
  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[性能] 内存: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB`);
  }, interval);
}

// 运行
if (require.main === module) {
  // 启动性能监控（可选）
  // monitorPerformance();

  main().catch(console.error);
}

module.exports = {
  generateTestData,
  ensureTestData,
  exportToCSV,
  exportToJSONL,
  exportAggregatedData,
  exportWithTransform,
  exportWithBackpressure,
  exportInChunks,
  exportWithStatistics,
  exportWithResume
};
