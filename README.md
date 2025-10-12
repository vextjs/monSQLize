# monSQLize

一个面向多数据库的统一（Mongo 风格）读 API。目前支持 MongoDB。目标是在不同后端之间平滑切换，同时保持熟悉的查询形态与选项。

## 目录
- [状态](#status)
- [安装](#install)
- [快速开始](#quick-start)
- [find 查询](#find-query)
- [聚合查询（aggregate](#aggregate)
- [字段去重（distinct）](#distinct)
- [深度分页（findPage）](#deep-pagination-agg)
- [统一 findPage：游标 + 跳页 + offset + totals](#findpage-unified)
- [返回耗时（meta）](#返回耗时meta)
- [缓存与失效](#cache)
  - [缓存配置](#缓存配置)
  - [缓存行为与细节](#缓存行为与细节)
  - [统计与可观测性](#统计与可观测性)
  - [缓存操作方法](#缓存操作方法)
  - [invalidate(op) 用法](#invalidate)
- [跨库访问注意事项](#cross-db)
- [说明](#notes)
- [事件（Mongo）](#事件mongo)
- [健康检查与事件（Mongo）](#健康检查与事件mongo)

<a id='status'></a>
## 状态（速览）

- 已实现：MongoDB 适配器；find/findOne/count；内置缓存（TTL/LRU/命名空间失效/并发去重）；跨库访问；默认值（maxTimeMS/findLimit）；慢查询日志；TypeScript 类型。
- 新增：多层缓存（本地+远端，MultiLevelCache）；更多数据库适配器（PostgreSQL/MySQL/SQLite）、ESM 条件导出、深分页/流式返回/聚合等仍在规划中。
- 完整能力矩阵与路线图请见：STATUS.md。

<a id='install'></a>
## 安装
```
npm i monsqlize
```

<a id='quick-start'></a>
## 快速开始（含默认配置与自动 instanceId）
```js
const MonSQLize = require('monsqlize');
(async () => {
    const { db, collection } = await (new MonSQLize({
        type: 'mongodb',
        databaseName: 'example',
        config: { uri: 'mongodb://localhost:27017' },
        maxTimeMS: 3000, //全局默认配置（本实例的默认 maxTimeMS）
        findLimit:10,  // 分成查询每页数量，默认:10
    }).connect());

  // 单次查询可覆盖 maxTimeMS；cache 为毫秒
  const one = await collection('test').findOne({ query: {}, cache: 5000, maxTimeMS: 1500 });
  console.log(one);

  // find 的安全默认：未传 limit 时使用全局 findLimit（默认 10）；传 0 表示不限制
  const list = await collection('test').find({ query: {} }); // 等效 limit=10
  const all = await collection('test').find({ query: {}, limit: 0 }); // 不限制

  // 写后失效（可选 op：'find' | 'findOne' | 'count'）
  await collection('test').invalidate();      // 失效该集合的全部读缓存
  await collection('test').invalidate('find'); // 仅失效 find 的缓存

  // —— 跨库访问（Cross-DB）——
  // 1) 访问其他数据库下的集合
  const docOther = await db('analytics').collection('events').findOne({
    query: { type: 'click' },
    cache: 3000,             // 可选缓存（毫秒）
    maxTimeMS: 1500          // 单次查询的超时覆盖
  });
  console.log('analytics.events ->', docOther);

  // 2) 在同一调用中进行多次跨库查询（顺序执行）
  const [u1, u2] = [
    await db('users_db').collection('users').findOne({ query: { name: 'Alice' }, cache: 2000 }),
    await db('users_db').collection('users').findOne({ query: { name: 'Bob' } })
  ];
  console.log(u1, u2);
})();
```

<a id='find-query'></a>
## find 查询（含流式传输）

`find(options)` 支持批量查询文档，并可选择以数组或流式方式返回结果。

### 基本用法

#### 数组模式（默认）
返回完整的文档数组，适合中小数据量场景。

```js
const MonSQLize = require('monsqlize');
const { collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
}).connect();

// 基本查询：返回数组
const docs = await collection('logs').find({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: 100,
  cache: 3000,
  maxTimeMS: 2000,
});
console.log(docs); // 返回文档数组
```

### 流式传输模式
> 提示：可在构造时通过 defaults 配置 streamBatchSize（默认 1000）。

当需要处理大量数据时，通过设置 `stream: true` 开启流式传输，避免一次性加载所有数据到内存。

#### 适用场景
- **大数据量导出**：数十万、数百万条记录的导出操作
- **实时处理**：逐条处理文档，边读边写
- **内存受限**：避免大数组占用过多内存
- **数据转换**：需要对每条记录进行复杂转换或外部 API 调用

#### 参数说明
```js
find({
  query?: object,              // Mongo 查询条件
  sort?: object,               // 排序规则
  limit?: number,              // 限制返回数量（0 表示不限制）
  projection?: object,         // 字段投影

  // —— 流式传输专属 ——
  stream?: boolean,            // 设为 true 开启流式传输
  batchSize?: number,          // 每批次读取大小（默认继承 defaults.streamBatchSize，通常为 1000）

  // —— 透传与通用 ——
  cache?: number,              // 读穿缓存 TTL（毫秒）；流式模式下仅缓存整体结果
  maxTimeMS?: number,          // 查询超时（毫秒）
  hint?: any,                  // 强制使用特定索引（可选）
  collation?: any,             // 排序规则（可选）
})
```

#### 流式传输示例

##### 1. 基础流式处理
```js
// 开启流式传输
const stream = await collection('logs').find({
  query: { level: 'error', timestamp: { $gte: new Date('2025-01-01') } },
  sort: { timestamp: 1 },
  stream: true,               // 关键：开启流式传输
  batchSize: 500,             // 可选：自定义批次大小
  maxTimeMS: 30000,           // 给足够的超时时间
});

let count = 0;

stream
  .on('data', (doc) => {
    // 逐条处理文档
    count++;
    console.log(`处理第 ${count} 条:`, doc._id);

    // 这里可以进行各种处理：
    // - 写入文件
    // - 调用外部 API
    // - 数据转换
    // - 插入另一个数据库
  })
  .on('end', () => {
    console.log(`流式处理完成，共处理 ${count} 条记录`);
  })
  .on('error', (err) => {
    console.error('流式处理出错:', err);
  });
```

##### 2. 流式导出到 CSV
```js
const fs = require('fs');
const { createObjectCsvWriter } = require('csv-writer');

const csvWriter = createObjectCsvWriter({
  path: 'export.csv',
  header: [
    { id: '_id', title: 'ID' },
    { id: 'timestamp', title: '时间' },
    { id: 'message', title: '消息' },
  ]
});

const stream = await collection('logs').find({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  projection: { _id: 1, timestamp: 1, message: 1 },
  stream: true,
  batchSize: 1000,
});

const records = [];
stream
  .on('data', (doc) => {
    records.push(doc);

    // 每 5000 条写入一次，避免内存积压
    if (records.length >= 5000) {
      csvWriter.writeRecords(records.splice(0, 5000));
    }
  })
  .on('end', async () => {
    // 写入剩余记录
    if (records.length > 0) {
      await csvWriter.writeRecords(records);
    }
    console.log('CSV 导出完成');
  });
```

##### 3. 流式传输 + 背压控制
```js
const stream = await collection('logs').find({
  query: { level: 'error' },
  stream: true,
  batchSize: 100,
});

stream.on('data', async (doc) => {
  // 暂停流，处理当前文档
  stream.pause();

  try {
    // 模拟耗时操作（如调用外部 API）
    await processDocument(doc);
  } catch (err) {
    console.error('处理失败:', err);
  } finally {
    // 恢复流
    stream.resume();
  }
});

stream.on('end', () => {
  console.log('处理完成');
});
```

##### 4. 流式传输 + Transform
```js
const { Transform } = require('stream');

// 创建转换流
const transformer = new Transform({
  objectMode: true,
  transform(doc, encoding, callback) {
    // 对每条文档进行转换
    const transformed = {
      id: doc._id.toString(),
      date: doc.timestamp.toISOString(),
      msg: doc.message.toUpperCase(),
    };
    callback(null, JSON.stringify(transformed) + '\n');
  }
});

const stream = await collection('logs').find({
  query: { level: 'error' },
  stream: true,
});

const output = fs.createWriteStream('output.jsonl');

// 管道：数据库流 -> 转换 -> 文件
stream.pipe(transformer).pipe(output);

output.on('finish', () => {
  console.log('数据已写入 output.jsonl');
});
```

#### 流式传输 + 缓存
- **缓存行为**：当 `stream: true` 且 `cache > 0` 时，仅缓存整体查询结果（完整文档数组），不推荐对大数据量使用缓存。
- **缓存键**：包含 `op=find | query | sort | limit | projection`。
- **建议**：流式传输通常用于大数据量场景，此时应避免使用缓存（`cache: 0` 或不传），直连数据库。

```js
// 不推荐：大数据量 + 缓存
const stream = await collection('logs').find({
  query: { level: 'error' },
  stream: true,
  cache: 60000,  // ❌ 会缓存所有数据，占用大量内存
});

// 推荐：大数据量直连
const stream = await collection('logs').find({
  query: { level: 'error' },
  stream: true,   // ✅ 流式 + 直连，内存友好
});
```

#### 性能优化建议
1. **索引优化**：为 `query` 和 `sort` 字段建立合适的复合索引
2. **投影裁剪**：使用 `projection` 只返回需要的字段，减少网络传输
3. **批次大小**：根据文档大小调整 `batchSize`（小文档用 2000-5000，大文档用 500-1000）
4. **超时设置**：大数据量场景给足够的 `maxTimeMS`（如 60000-300000 毫秒）
5. **背压控制**：处理慢时使用 `pause()/resume()` 控制流速

#### 透传选项（Mongo 专属）
支持在 options 里传 `hint`/`collation`，分别透传至原生 `find` 的对应参数。

```js
const stream = await collection('logs').find({
  query: { timestamp: { $gte: new Date('2025-01-01') } },
  sort: { timestamp: 1 },
  stream: true,
  hint: { timestamp: 1, _id: 1 },      // 强制使用复合索引
  collation: { locale: 'zh' },         // 中文排序规则
});
```

> 兼容性提示：`find hint` 需要较新的 MongoDB/Node 驱动版本（建议 MongoDB ≥ 4.2，Node 驱动 ≥ 5.x）。

#### 错误处理
```js
const stream = await collection('logs').find({
  query: { level: 'error' },
  stream: true,
});

stream
  .on('data', (doc) => {
    try {
      // 处理文档
      processDoc(doc);
    } catch (err) {
      console.error('文档处理失败:', doc._id, err);
      // 决定是否继续还是中止流
    }
  })
  .on('error', (err) => {
    // 数据库/网络错误
    console.error('流错误:', err);
    stream.destroy(); // 清理资源
  })
  .on('end', () => {
    console.log('流正常结束');
  });
```

#### 注意事项
- 流式传输期间，游标会保持打开状态，请确保及时处理完成或调用 `stream.destroy()` 释放资源。
- 流式模式下无法获取总数，如需总数请单独调用 `count()`。
- 流式 + 缓存不适合大数据量场景，建议直连数据库。
- 流式传输不支持 `meta` 返回格式（因为返回的是 Stream 对象而非数组）。
</a>

<a id='aggregate'></a>
## 聚合查询（aggregate，含流式传输）

`aggregate(pipeline, options)` 支持以数组形式传入聚合管道，并在管道中使用 `$lookup` 等操作符进行联表查询。支持数组模式和流式传输两种返回方式。

> 📖 **详细文档**：[aggregate 方法完整文档](./docs/aggregate.md) | [示例代码](./examples/aggregate.examples.js) | [测试用例](./test/aggregate.test.js)

### 基本用法

#### 数组模式（默认）
返回完整的结果数组，适合中小数据量的聚合场景。

```js
const MonSQLize = require('monsqlize');
const { collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
}).connect();

const pipeline = [
  {
    $lookup: {
      from: 'user',
      let: { userId: { $toObjectId: '$userId' } },
      pipeline: [ { $match: { $expr: { $eq: ['$_id','$$userId'] } } } ],
      as: 'userInfo'
    }
  },
  { $match: { status: 'paid' } },
  { $sort: { createdAt: -1, _id: 1 } },
  { $limit: 10 }
];

// 聚合查询：返回数组
const result = await collection('orders').aggregate(pipeline, {
  cache: 3000,
  maxTimeMS: 5000,
});
console.log(result); // 返回文档数组
```

### 流式传输模式
> 提示：可在构造时通过 defaults 配置 aggregateMaxTimeMS（默认 10s）和 streamBatchSize（默认 1000）。如需允许落盘，请在本次调用显式传入 allowDiskUse: true。

当聚合结果数据量较大时，通过设置 `stream: true` 开启流式传输，逐条处理结果。

#### 适用场景
- **大规模数据分析**：需要聚合处理数百万条记录
- **复杂联表导出**：多表 JOIN 后的大量结果需要导出
- **ETL 管道**：从一个集合聚合转换后写入另一个系统
- **实时报表生成**：边聚合边生成报表文件

#### 参数说明
```js
aggregate(pipeline, {
  // —— 流式传输专属 ——
  stream?: boolean,            // 设为 true 开启流式传输
  batchSize?: number,          // 每批次读取大小（默认继承 defaults.streamBatchSize，通常为 1000）

  // —— 透传与通用 ——
  cache?: number,              // 读穿缓存 TTL（毫秒）；流式模式下不推荐使用缓存
  maxTimeMS?: number,          // 聚合超时（毫秒），默认继承 defaults.aggregateMaxTimeMS（10s）
  allowDiskUse?: boolean,      // 允许落盘（大管道时必需），显式开启（默认不启用）
  hint?: any,                  // 强制使用特定索引（可选）
  collation?: any,             // 排序规则（可选）
})
```

#### 流式传输示例

##### 1. 基础流式聚合
```js
// 复杂聚合 + 流式处理
const pipeline = [
  { $match: { createdAt: { $gte: new Date('2025-01-01') } } },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user'
    }
  },
  { $unwind: '$user' },
  {
    $project: {
      orderId: '$_id',
      amount: 1,
      userName: '$user.name',
      userEmail: '$user.email',
    }
  },
  { $sort: { createdAt: -1 } }
];

const stream = await collection('orders').aggregate(pipeline, {
  stream: true,               // 关键：开启流式传输
  batchSize: 500,
  maxTimeMS: 60000,           // 复杂聚合需要更长超时
  allowDiskUse: true,         // 大数据量允许落盘
});

let count = 0;
stream
  .on('data', (doc) => {
    count++;
    console.log(`处理第 ${count} 条聚合结果:`, doc);
    // 处理联表后的数据
  })
  .on('end', () => {
    console.log(`聚合流式处理完成，共 ${count} 条`);
  })
  .on('error', (err) => {
    console.error('聚合流错误:', err);
  });
```

##### 2. 流式聚合导出 Excel
```js
const ExcelJS = require('exceljs');

const pipeline = [
  { $match: { status: 'completed', year: 2025 } },
  {
    $group: {
      _id: '$category',
      totalAmount: { $sum: '$amount' },
      count: { $sum: 1 },
      avgAmount: { $avg: '$amount' }
    }
  },
  { $sort: { totalAmount: -1 } }
];

const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
  filename: 'report.xlsx'
});
const worksheet = workbook.addWorksheet('销售统计');

// 添加表头
worksheet.columns = [
  { header: '类别', key: 'category', width: 20 },
  { header: '总金额', key: 'totalAmount', width: 15 },
  { header: '订单数', key: 'count', width: 10 },
  { header: '平均金额', key: 'avgAmount', width: 15 }
];

const stream = await collection('orders').aggregate(pipeline, {
  stream: true,
  allowDiskUse: true,
  maxTimeMS: 120000,
});

stream
  .on('data', (doc) => {
    worksheet.addRow({
      category: doc._id,
      totalAmount: doc.totalAmount,
      count: doc.count,
      avgAmount: doc.avgAmount.toFixed(2)
    }).commit();
  })
  .on('end', async () => {
    await workbook.commit();
    console.log('Excel 报表生成完成');
  })
  .on('error', (err) => {
    console.error('导出失败:', err);
  });
```

##### 3. 流式聚合 + 数据清洗 + 写入
```js
// 从一个集合聚合，清洗后写入另一个集合
const pipeline = [
  { $match: { processed: false } },
  {
    $lookup: {
      from: 'metadata',
      localField: 'metaId',
      foreignField: '_id',
      as: 'meta'
    }
  },
  { $unwind: { path: '$meta', preserveNullAndEmptyArrays: true } }
];

const stream = await collection('raw_data').aggregate(pipeline, {
  stream: true,
  batchSize: 1000,
  allowDiskUse: true,
});

const targetColl = collection('processed_data');
const batch = [];
const BATCH_SIZE = 100;

stream.on('data', async (doc) => {
  // 暂停流进行处理
  stream.pause();

  try {
    // 数据清洗与转换
    const cleaned = {
      sourceId: doc._id,
      value: doc.value * 1.1, // 业务逻辑
      metadata: doc.meta ? doc.meta.info : null,
      processedAt: new Date()
    };

    batch.push(cleaned);

    // 批量写入
    if (batch.length >= BATCH_SIZE) {
      await targetColl.insertMany(batch.splice(0, BATCH_SIZE));
    }
  } catch (err) {
    console.error('处理失败:', doc._id, err);
  } finally {
    stream.resume();
  }
});

stream.on('end', async () => {
  // 写入剩余数据
  if (batch.length > 0) {
    await targetColl.insertMany(batch);
  }
  console.log('ETL 完成');
});
```

##### 4. 流式聚合 + 分组统计
```js
const pipeline = [
  { $match: { year: 2025 } },
  {
    $group: {
      _id: { month: { $month: '$createdAt' }, category: '$category' },
      total: { $sum: '$amount' }
    }
  },
  { $sort: { '_id.month': 1, '_id.category': 1 } }
];

const stream = await collection('transactions').aggregate(pipeline, {
  stream: true,
  allowDiskUse: true,
});

// 使用 Map 收集按月统计
const monthlyStats = new Map();

stream
  .on('data', (doc) => {
    const month = doc._id.month;
    if (!monthlyStats.has(month)) {
      monthlyStats.set(month, { month, categories: [] });
    }
    monthlyStats.get(month).categories.push({
      category: doc._id.category,
      total: doc.total
    });
  })
  .on('end', () => {
    console.log('月度统计:', Array.from(monthlyStats.values()));
  });
```

#### 流式传输 + 缓存
- **缓存行为**：当 `stream: true` 且 `cache > 0` 时，仅缓存整体聚合结果（完整数组），**强烈不推荐**对大数据量聚合使用缓存。
- **缓存键**：包含 `op=aggregate | pipelineHash`。
- **建议**：聚合流式传输通常用于大数据分析，应完全避免使用缓存（`cache: 0` 或不传）。

```js
// ❌ 不推荐：大数据量聚合 + 缓存
const stream = await collection('orders').aggregate(pipeline, {
  stream: true,
  cache: 60000,      // 会缓存所有聚合结果，内存爆炸
  allowDiskUse: true,
});

// ✅ 推荐：大数据量聚合直连
const stream = await collection('orders').aggregate(pipeline, {
  stream: true,       // 流式 + 直连 + 落盘
  allowDiskUse: true,
});
```

#### 性能优化建议
1. **索引优化**：为 `$match`、`$sort` 和 `$lookup` 的关联字段建立索引
2. **管道顺序**：尽早使用 `$match` 和 `$project` 过滤和裁剪数据
3. **允许落盘**：大数据量聚合务必设置 `allowDiskUse: true`
4. **分批处理**：调整 `batchSize` 平衡内存与网络开销（建议 500-2000）
5. **超时设置**：复杂聚合给足够的 `maxTimeMS`（如 60000-300000 毫秒）
6. **避免 `$lookup` 笛卡尔积**：使用 `let` 和 `pipeline` 精确控制联表条件

#### 透传选项（Mongo 专属）
支持在 options 里传 `hint`/`collation`，分别透传至原生 `aggregate` 的对应参数。

```js
const stream = await collection('orders').aggregate(pipeline, {
  stream: true,
  hint: { createdAt: 1, status: 1 },   // 强制使用复合索引
  collation: { locale: 'zh' },         // 中文排序
  allowDiskUse: true,
  maxTimeMS: 60000,
});
```

> 兼容性提示：`aggregate hint` 需要较新的 MongoDB/Node 驱动版本（建议 MongoDB ≥ 4.2，Node 驱动 ≥ 5.x）。

#### 错误处理与资源管理
```js
const stream = await collection('orders').aggregate(pipeline, {
  stream: true,
  allowDiskUse: true,
});

stream
  .on('data', (doc) => {
    try {
      // 处理聚合结果
      processAggregatedDoc(doc);
    } catch (err) {
      console.error('文档处理失败:', err);
      // 可选：达到错误阈值后中止
    }
  })
  .on('error', (err) => {
    // 聚合管道错误（索引缺失、内存不足等）
    console.error('聚合流错误:', err.message);
    stream.destroy(); // 立即释放资源
  })
  .on('end', () => {
    console.log('聚合流正常结束');
  });

// 超时保护
setTimeout(() => {
  if (!stream.destroyed) {
    console.warn('聚合超时，强制关闭');
    stream.destroy();
  }
}, 300000); // 5分钟超时
```

#### 注意事项
- 流式聚合期间，游标会保持打开状态，请确保及时处理完成或调用 `stream.destroy()` 释放资源。
- 复杂聚合（含 `$lookup`、`$group`）务必设置 `allowDiskUse: true`，否则可能因内存限制失败。
- 流式模式下无法获取总数，如需总数请在管道末尾添加 `$count` 阶段单独执行。
- 流式聚合不支持 `meta` 返回格式（因为返回的是 Stream 对象而非数组）。
- `$lookup` 在流式场景下仍会逐条执行联表，注意关联集合的索引优化。

> 说明：当前 Mongo 适配器的 `aggregate` 基于原生驱动实现，未来跨数据库将复用该方法名，以各自最优实现（如 SQL Join）。
</a>

<a id='distinct'></a>
## 字段去重（distinct）

`distinct(field, options)` 支持查询某个字段的所有不同值，返回去重后的值数组。

> 📖 **详细文档**：[distinct 方法完整文档](./docs/distinct.md) | [示例代码](./examples/distinct.examples.js) | [测试用例](./test/distinct.test.js)

### 基本用法
```js
const MonSQLize = require('monsqlize');
const { collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
}).connect();

// 查询所有不同的用户 ID
const userIds = await collection('orders').distinct('userId', {
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 1000,
  cache: 3000,
  maxTimeMS: 5000,
});
console.log(userIds);
```

### 注意事项
- 返回结果为数组，包含所有不同的字段值。
- 支持与 `find` 相同的查询条件与选项。
- 默认不启用缓存，直连数据库；可选传入 `cache` 启用读穿缓存。

欢迎 PR。


### 辅助方法与慢查询日志
- 获取默认配置（全局 maxTimeMS、findLimit、namespace、slowQueryMs）：
```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 800
});
await msq.connect();
console.log(msq.getDefaults());
```
- 获取集合访问器的命名空间（便于调试与手动失效脚本）：
```js
const ns = db('example').collection('users').getNamespace();
// => { iid, type: 'mongodb', db: 'example', collection: 'users' }
```
- 慢查询日志：findOne/find/find/count 会在一次调用耗时超过 slowQueryMs（默认为 500ms）时输出 warn 日志。



### 多层缓存（本地+远端）
- 通过配置 `cache.multiLevel=true` 启用；默认本地内存 + 可选远端实现（用户可注入 Redis/Memcached 等实现）。
- 读路径：本地命中最快；本地未命中则查远端；远端命中将异步回填本地；两者均未命中则回源数据库并双写缓存。
- 写路径：默认双写（本地+远端）；可配置 `writePolicy='local-first-async-remote'` 以降低尾延迟。
- 失效：集合访问器 `invalidate(op?)` 复用原有命名空间键形状，调用后将执行本地 delPattern；如需跨节点一致性，可结合外部 pub/sub 在构造 MultiLevelCache 时传入 `publish` 函数。
- 降级：远端不可用时不影响正确性，最多影响命中率。

示例：
```js
const MonSQLize = require('monsqlize');
const msq = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    multiLevel: true,
    // 本地层：使用内置内存缓存配置
    local: { maxSize: 100000, enableStats: true },
    // 远端层：可注入一个实现了 CacheLike 的适配器；
    // 若仅提供普通对象，这里会退化为一个“内存实现”占位（方便本地开发）
    // 生产环境建议注入真正的远端实现（如 Redis 适配器）。
    remote: { /* 例如：由业务注入 redisCache 实例 */ },
    policy: {
      writePolicy: 'local-first-async-remote',
      backfillLocalOnRemoteHit: true,
    }
  },
}).connect();
```

提示：也可在上层自行构建 MultiLevelCache 并作为 `cache` 直接注入（需 `require('monsqlize/lib/multi-level-cache')`）。


## 返回耗时（meta）
- 支持在所有读 API 上按次返回耗时与元信息（opt-in，不改默认返回类型）。
- 使用方法：在 options 中传入 `meta: true` 或 `meta: { level: 'sub', includeCache: true }`。
  - findOne/find/count/find：当 `meta` 为真时返回 `{ data, meta }`；不传则维持原返回（对象/数组/数字）。
  - findPage：当 `meta` 为真时在返回对象上附加 `meta` 字段；`level:'sub'` 时返回每个 hop/offset 的子步骤耗时。

示例：
```js
// 单条查询：返回耗时
const { data, meta } = await coll.findOne({ query:{ name: 'Alice' }, cache: 2000, maxTimeMS: 1500, meta: true });
console.log(meta.durationMs);

// 分页：总耗时
const page = await coll.findPage({ query:{ status:'paid' }, sort:{ createdAt:-1,_id:1 }, limit:20, page:37, meta:true });
console.log(page.meta.durationMs);

// 分页：子步骤耗时（跳页时可见每个 hop 的耗时）
const page2 = await coll.findPage({ query:{ status:'paid' }, sort:{ createdAt:-1,_id:1 }, limit:20, page:128, jump:{ step:20 }, meta:{ level:'sub', includeCache:true } });
console.table(page2.meta.steps);
```

> 说明：
> - 默认不返回 meta，需显式开启；开销很小，仅一次时间戳与对象组装。
> - includeCache 仅包含去敏维度（如 cacheTtl 等，具体依实现）。

## 事件（Mongo）
- 事件基于 Node.js EventEmitter，进程内有效：
  - `connected`: `{ type, db, scope, iid? }`
  - `closed`: `{ type, db, iid? }`
  - `error`: `{ type, db, error, iid? }`
  - `slow-query`: `{ op, ns, durationMs, startTs, endTs, maxTimeMS, ... }`（去敏）
  - `query`（可选）：每次读操作完成后触发；需在构造 defaults 中开启 `metrics.emitQueryEvent=true`。
- 实例还暴露：`on/off/once/emit`。

用法示例：
```js
const msq = new MonSQLize({ type:'mongodb', databaseName:'example', config:{ uri:'mongodb://localhost:27017' }, defaults:{ metrics:{ emitQueryEvent:false } } });
msq.on('connected', info => console.log('[connected]', info));
msq.on('closed', info => console.log('[closed]', info));
msq.on('error', info => console.error('[error]', info));
msq.on('slow-query', meta => console.warn('[slow-query]', meta));
// 可选：开启 query 事件
// const msq = new MonSQLize({ ..., defaults:{ metrics:{ emitQueryEvent:true } } });
msq.on('query', meta => console.log('[query]', meta));
await msq.connect();
```

## 健康检查与事件（Mongo）
- 健康检查：`await msq.health()` 返回 `{ status: 'up'|'down', connected, defaults, cache?, driver }` 摘要视图。
- 事件钩子：
  - `msq.on('connected', payload => {})`
  - `msq.on('closed', payload => {})`
  - `msq.on('error', payload => {})`
  - `msq.on('slow-query', meta => {})`（仅输出去敏形状与阈值/耗时等元信息，不含敏感值）

示例：
```js
const msq = new MonSQLize({ type:'mongodb', databaseName:'example', config:{ uri:'mongodb://localhost:27017' } });
msq.on('slow-query', (meta) => console.warn('slow-query', meta));
await msq.connect();
console.log(await msq.health());
```
