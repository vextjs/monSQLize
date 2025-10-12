# findPage 方法详细文档

## 概述

`findPage` 是 monSQLize 提供的高级分页查询方法，支持多种分页模式，包括游标分页、跳页、流式查询和总数统计等功能。

## 方法签名

```javascript
async findPage(options = {})
```

## 参数说明

### options 对象属性

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | Object | 否 | `{}` | MongoDB 查询条件 |
| `sort` | Object | 否 | `{ _id: 1 }` | 排序规则，会自动确保稳定排序 |
| `limit` | Number | 是 | - | 每页返回的文档数量，最大值由 `findPageMaxLimit` 配置（默认 500） |
| `after` | String | 否 | - | 游标分页：获取指定游标之后的数据 |
| `before` | String | 否 | - | 游标分页：获取指定游标之前的数据 |
| `page` | Number | 否 | - | 跳页模式：指定要获取的页码（从 1 开始） |
| `pipeline` | Array | 否 | `[]` | 附加的 MongoDB 聚合管道阶段（仅对当页数据生效） |
| `hint` | Object/String | 否 | - | 指定查询使用的索引 |
| `collation` | Object | 否 | - | 指定排序规则 |
| `maxTimeMS` | Number | 否 | 全局配置 | 查询超时时间（毫秒） |
| `allowDiskUse` | Boolean | 否 | `false` | 是否允许使用磁盘进行聚合操作 |
| `stream` | Boolean | 否 | `false` | 是否返回流对象 |
| `batchSize` | Number | 否 | - | 流式查询时的批次大小 |
| `jump` | Object | 否 | - | 跳页配置选项 |
| `offsetJump` | Object | 否 | - | 基于 offset 的跳页配置 |
| `totals` | Object | 否 | - | 总数统计配置 |
| `meta` | Boolean | 否 | `false` | 是否返回查询元信息 |
| `cache` | Number | 否 | `0` | 缓存 TTL（毫秒），大于 0 时启用缓存 |
| `explain` | Boolean/String | 否 | - | 返回查询执行计划，可选值：`true`、`'queryPlanner'`、`'executionStats'`、`'allPlansExecution'` |

### jump 配置项

用于优化跳页性能的书签机制。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `step` | Number | `10` | 书签步长，每隔多少页保存一次书签 |
| `maxHops` | Number | `20` | 最大跳跃次数，防止过度跳页 |
| `keyDims` | Object | 自动生成 | 自定义书签键维度（高级用法） |

**书签机制说明**：
- 书签会自动保存到实例缓存中，键前缀为 `bm:`
- 书签包含查询的去敏形状哈希（不含具体查询值）
- 默认 TTL 为 6 小时（可通过 `defaults.bookmarks.ttlMs` 配置）
- 最多保存 10000 页的书签（可通过 `defaults.bookmarks.maxPages` 配置）

### offsetJump 配置项

使用传统的 offset 方式进行跳页（适合小数据量）。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enable` | Boolean | `false` | 是否启用 offset 跳页 |
| `maxSkip` | Number | `50000` | 最大 skip 值，超过此值将使用书签机制 |

**性能建议**：offset 跳页虽然简单，但在大数据集上性能较差，仅适合数据量小于 10 万条的场景。

### totals 配置项

用于获取总数和总页数信息。

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mode` | String | `'none'` | 统计模式：`'none'`、`'sync'`、`'async'`、`'approx'` |
| `maxTimeMS` | Number | `2000` | 统计查询的超时时间 |
| `ttlMs` | Number | `600000` | 缓存有效期（10 分钟） |
| `hint` | Object/String | - | 统计查询使用的索引 |
| `collation` | Object | - | 统计查询的排序规则 |

#### totals 模式说明

- **none**: 不统计总数（默认），性能最佳
- **sync**: 同步统计，立即返回总数，可能影响响应时间（适合数据量较小或有索引优化的场景）
- **async**: 异步统计，首次返回 token，后台计算后缓存结果（适合大数据量）
- **approx**: 近似统计，返回缓存的近似值（占位实现，未来版本支持）

**注意事项**：
- 统计结果会缓存，键前缀为 `tot:`
- 统计失败时会缓存 `total: null` 并附带 `error` 字段
- async 模式使用飞行中去重（inflight deduplication），5 秒窗口内相同查询共享结果

## 返回值

### 普通模式返回对象

```javascript
{
  items: [
    { /* 文档数据 1 */ },
    { /* 文档数据 2 */ },
    // ...
  ],
  pageInfo: {
    hasNext: true,        // 是否有下一页
    hasPrev: false,       // 是否有上一页
    startCursor: "...",   // 起始游标（用于 before 分页）
    endCursor: "...",     // 结束游标（用于 after 分页）
    currentPage: 1        // 当前页码（仅在使用 page 参数时存在）
  },
  totals: {  // 仅在配置了 totals 时存在
    mode: "sync",         // 统计模式
    total: 1000,          // 总记录数
    totalPages: 100,      // 总页数
    ts: 1234567890,       // 统计时间戳
    token: "...",         // async 模式下的查询标识
    error: "..."          // 统计失败时的错误信息（可选）
  },
  meta: {  // 仅在 meta: true 时存在
    op: "findPage",
    durationMs: 123,
    cacheHit: false
  }
}
```

### 流式模式返回

当 `stream: true` 时，返回一个 MongoDB Cursor Stream 对象，可以使用流式 API：

```javascript
const stream = await collection('users').findPage({
  query: { status: 'active' },
  sort: { createdAt: -1 },
  limit: 100,
  stream: true,
  batchSize: 100  // 推荐设置合适的批次大小
});

stream.on('data', (doc) => {
  console.log(doc);
});

stream.on('end', () => {
  console.log('Stream ended');
});

stream.on('error', (err) => {
  console.error('Stream error:', err);
});
```

**流式模式限制**：
- 不支持跳页功能（page 参数只能为 1 或省略）
- 不支持 totals 统计
- 只支持游标分页（after/before）或首页查询
- 返回的是原始流对象，不包含 pageInfo

## 使用模式

### 1. 游标分页（推荐）

游标分页是最高效的分页方式，适合大数据集和实时数据。

```javascript
// 获取第一页
const page1 = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20
});

console.log('数据:', page1.items);
console.log('有下一页:', page1.pageInfo.hasNext);

// 获取下一页
const page2 = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  after: page1.pageInfo.endCursor
});

// 获取上一页
const page0 = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  before: page2.pageInfo.startCursor
});
```

**优势**：
- O(1) 性能，不受数据量影响
- 支持实时数据变化
- 内存占用小

**注意**：游标包含排序字段的值，排序规则必须保持一致

### 2. 跳页模式

适合需要随机访问任意页码的场景。

```javascript
// 使用书签机制跳页
const page5 = await collection('products').findPage({
  query: { category: 'electronics' },
  sort: { price: 1 },
  limit: 50,
  page: 5,
  jump: {
    step: 10,      // 每 10 页保存一次书签
    maxHops: 20    // 最多连续跳 20 次
  }
});

console.log(`第 ${page5.pageInfo.currentPage} 页数据:`, page5.items);

// 使用 offset 跳页（小数据量）
const page3 = await collection('products').findPage({
  query: { category: 'books' },
  sort: { title: 1 },
  limit: 50,
  page: 3,
  offsetJump: {
    enable: true,
    maxSkip: 10000
  }
});
```

**书签跳转原理**：
1. 每隔 `step` 页保存一个书签（游标）
2. 跳转时先定位到最近的书签页
3. 从书签页逐页跳转到目标页
4. 跳转次数不超过 `maxHops` 限制

**适用场景**：
- 需要显示页码导航
- 用户可能跳转到任意页
- 数据相对稳定

### 3. 流式查询

适合处理大量数据，减少内存占用。

```javascript
// 首页流式查询
const stream1 = await collection('logs').findPage({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: 1000,
  stream: true,
  batchSize: 100
});

let count = 0;
stream1.on('data', (doc) => {
  count++;
  processLog(doc);
});

stream1.on('end', () => {
  console.log(`处理了 ${count} 条日志`);
});

stream1.on('error', (err) => {
  console.error('流处理错误:', err);
});

// 使用游标的流式查询
const firstPage = await collection('logs').findPage({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: 100
});

const stream2 = await collection('logs').findPage({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: 1000,
  after: firstPage.pageInfo.endCursor,
  stream: true,
  batchSize: 100
});
```

**使用建议**：
- 设置合理的 `batchSize`（推荐 100-1000）
- 使用 `limit` 限制返回数据量（防止无限流）
- 妥善处理错误事件
- 考虑背压（backpressure）控制

### 4. 获取总数统计

```javascript
// 同步获取总数
const pageWithTotal = await collection('users').findPage({
  query: { active: true },
  sort: { _id: 1 },
  limit: 20,
  totals: {
    mode: 'sync',
    maxTimeMS: 5000,
    hint: { active: 1 }  // 使用索引优化统计
  }
});

console.log(`总共 ${pageWithTotal.totals.total} 条记录`);
console.log(`共 ${pageWithTotal.totals.totalPages} 页`);

// 异步获取总数（首次返回 token）
const page1 = await collection('users').findPage({
  query: { active: true },
  sort: { _id: 1 },
  limit: 20,
  totals: { mode: 'async' }
});

if (page1.totals.total === null) {
  console.log('总数计算中，token:', page1.totals.token);

  // 稍后再次查询以获取结果
  setTimeout(async () => {
    const page1Again = await collection('users').findPage({
      query: { active: true },
      sort: { _id: 1 },
      limit: 20,
      totals: { mode: 'async' }
    });

    if (page1Again.totals.total !== null) {
      console.log(`总数：${page1Again.totals.total}`);
    } else {
      console.log('统计仍在进行中...');
    }
  }, 1000);
}
```

**最佳实践**：
- 小数据量（< 10 万）：使用 `sync` 模式
- 大数据量：使用 `async` 模式，避免阻塞
- 配置合理的 `maxTimeMS` 防止慢查询
- 使用 `hint` 指定索引优化 `countDocuments`

### 5. 查看执行计划（explain）

`explain` 参数可以帮助你分析查询性能，查看 MongoDB 如何执行分页查询。

```javascript
// 基础执行计划（queryPlanner 模式）
const explainResult = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  explain: true  // 或 'queryPlanner'
});

console.log('查询计划:', JSON.stringify(explainResult, null, 2));
console.log('使用的索引:', explainResult.queryPlanner?.winningPlan);

// 获取详细的执行统计（executionStats 模式）
const statsResult = await collection('orders').findPage({
  query: { status: 'paid', amount: { $gt: 1000 } },
  sort: { createdAt: -1 },
  limit: 50,
  hint: { status: 1, createdAt: -1 },
  explain: 'executionStats'
});

console.log('执行统计:');
console.log('  - 扫描文档数:', statsResult.executionStats.totalDocsExamined);
console.log('  - 返回文档数:', statsResult.executionStats.nReturned);
console.log('  - 执行时间:', statsResult.executionStats.executionTimeMillis, 'ms');
console.log('  - 索引使用:', statsResult.executionStats.executionStages);

// 分析所有备选计划（allPlansExecution 模式）
const allPlansResult = await collection('products').findPage({
  query: { category: 'electronics', price: { $lt: 500 } },
  sort: { price: 1 },
  limit: 30,
  explain: 'allPlansExecution'
});

console.log('所有备选查询计划:', allPlansResult.executionStats.allPlansExecution);

// 结合游标分页的 explain
const cursorExplain = await collection('orders').findPage({
  query: { status: 'completed' },
  sort: { completedAt: -1 },
  limit: 20,
  after: 'eyJzIjp7ImNvbXBsZXRlZEF0IjotMSwiX2lkIjoxfSwiYSI6eyJjb21wbGV0ZWRBdCI6eyIkZGF0ZSI6IjIwMjUtMDEtMTVUMTA6MDA6MDAuMDAwWiJ9LCJfaWQiOiI2Nzg5YWJjZDEyMzQ1Njc4OTBhYmNkZWYifX0=',
  explain: 'executionStats'
});

console.log('游标分页的执行计划:', cursorExplain.executionStats);
```

**explain 模式说明**：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `true` 或 `'queryPlanner'` | 返回查询计划器选择的执行计划 | 查看使用的索引和查询策略 |
| `'executionStats'` | 返回执行统计信息（扫描/返回文档数、耗时等） | 性能分析和优化 |
| `'allPlansExecution'` | 返回所有备选计划的执行信息 | 深度优化和比较不同索引策略 |

**使用技巧**：
1. **索引验证**：使用 `explain: true` 确认查询是否使用了预期的索引
2. **性能分析**：使用 `explain: 'executionStats'` 查看实际扫描的文档数
3. **优化指标**：关注 `totalDocsExamined` 与 `nReturned` 的比值，理想情况下应接近 1
4. **不缓存结果**：`explain` 模式下不会缓存结果，不影响正常查询缓存

**注意事项**：
- `explain` 模式会直接返回执行计划对象，不返回分页结果
- 不能与 `stream` 模式同时使用
- `explain` 适用于所有分页模式（游标、跳页、offset）

## 错误处理

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| `VALIDATION_ERROR` | 参数验证失败 | 检查参数是否符合要求，如 page 与 after/before 互斥 |
| `JUMP_TOO_FAR` | 跳页跨度过大 | 增加 maxHops 值或使用 offsetJump |
| `STREAM_NO_JUMP` | 流式模式不支持跳页 | 流式模式只能用于首页或游标分页 |
| `STREAM_NO_TOTALS` | 流式模式不支持统计 | 流式模式不能使用 totals 功能 |
| `CURSOR_INVALID` | 游标无效 | 使用有效的游标字符串 |
| `SORT_MISMATCH` | 排序规则不匹配 | 确保游标对应的排序规则一致 |

### 错误处理示例

```javascript
try {
  const result = await collection('orders').findPage({
    query: { status: 'paid' },
    sort: { createdAt: -1 },
    limit: 50,
    page: 1000,
    jump: { maxHops: 10 }
  });
} catch (error) {
  if (error.code === 'JUMP_TOO_FAR') {
    console.error('跳页距离太远:', error.details);
    // 解决方案：增加 maxHops 或使用 offsetJump
    const result = await collection('orders').findPage({
      query: { status: 'paid' },
      sort: { createdAt: -1 },
      limit: 50,
      page: 1000,
      jump: { maxHops: 50 }  // 增加限制
    });
  } else if (error.code === 'VALIDATION_ERROR') {
    console.error('参数错误:', error.details);
  } else {
    console.error('其他错误:', error);
  }
}
```

## 性能优化建议

### 1. 索引优化

确保查询字段和排序字段上有合适的索引：

```javascript
// 为常用查询创建复合索引
db.collection('orders').createIndex({ status: 1, createdAt: -1 });

// 在 findPage 中使用 hint 指定索引
const result = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  hint: { status: 1, createdAt: -1 }
});
```

**索引设计原则**：
- 查询字段在前，排序字段在后
- 包含 `_id` 作为最后一个字段确保唯一性
- 使用 `explain()` 验证索引使用情况

### 2. 合理选择分页模式

- **游标分页**：适合顺序浏览、实时数据、大数据集
- **跳页模式**：适合需要随机访问页码的场景
- **offset 跳页**：仅适合小数据量（< 10000 条）
- **流式查询**：适合批量处理、ETL、导出等场景

### 3. 缓存策略

```javascript
// 实例级配置书签和缓存
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  bookmarks: {
    step: 10,           // 每 10 页保存书签
    maxHops: 20,        // 最多连续跳 20 次
    ttlMs: 6 * 3600000, // 书签缓存 6 小时
    maxPages: 10000     // 最多缓存 10000 页的书签
  },
  cache: {
    maxSize: 100000,    // 最大缓存条目数
    enableStats: true   // 启用统计
  }
});

// 查询级别启用缓存
const result = await collection('products').findPage({
  query: { category: 'electronics' },
  sort: { price: 1 },
  limit: 20,
  cache: 60000  // 缓存 1 分钟
});
```

**缓存最佳实践**：
- 热门查询启用缓存
- 根据数据更新频率设置合理的 TTL
- 数据变更后及时失效缓存：`collection.invalidate('findPage')`

### 4. 正确处理总数统计

**❌ 错误做法**：大数据量使用同步统计
```javascript
// 不好：千万级数据使用 sync 模式
const result = await collection('logs').findPage({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: 50,
  totals: { mode: 'sync' }  // 可能等待数秒甚至超时
});
```

**✅ 正确做法**：根据数据量选择合适的统计模式
```javascript
// 小数据量（< 10 万）- 使用 sync 模式
const smallResult = await collection('categories').findPage({
  query: { active: true },
  sort: { name: 1 },
  limit: 30,
  totals: { 
    mode: 'sync',
    maxTimeMS: 2000,
    hint: { active: 1 }  // 使用索引加速统计
  }
});

// 大数据量 - 使用 async 模式
async function getPaginatedDataWithTotal(query, page) {
  const result = await collection('orders').findPage({
    query,
    sort: { createdAt: -1 },
    limit: 50,
    page,
    totals: { 
      mode: 'async',
      maxTimeMS: 5000,
      ttlMs: 600000  // 缓存 10 分钟
    }
  });

  // 首次请求：total 为 null，返回 token
  if (result.totals && result.totals.total === null) {
    console.log('总数计算中...', result.totals.token);
  } else if (result.totals && result.totals.total !== null) {
    console.log(`共 ${result.totals.total} 条，${result.totals.totalPages} 页`);
  }

  return result;
}

// 不需要总数的场景 - 不统计（性能最佳）
const noTotalResult = await collection('feeds').findPage({
  query: { userId: currentUserId },
  sort: { createdAt: -1 },
  limit: 20,
  after: lastCursor
  // 不设置 totals，通过 hasNext 判断是否还有更多数据
});

console.log('还有更多:', noTotalResult.pageInfo.hasNext);
```

### 5. 流式查询的正确使用

```javascript
// 1. 设置合适的 batchSize
const stream1 = await collection('orders').findPage({
  query: { year: 2024 },
  sort: { createdAt: 1 },
  limit: 1000000,
  stream: true,
  batchSize: 1000,  // 每批次 1000 条
  allowDiskUse: true  // 大数据量允许使用磁盘
});

let processedCount = 0;
stream1.on('data', (doc) => {
  // 只处理当前文档，不累积
  processOrder(doc);
  processedCount++;
  
  if (processedCount % 10000 === 0) {
    console.log(`已处理 ${processedCount} 条订单`);
  }
});

stream1.on('end', () => {
  console.log(`处理完成！总计: ${processedCount}`);
});

// 2. 导出大量数据到文件
const fs = require('fs');
const { Transform } = require('stream');

async function exportToCSV() {
  const stream = await collection('users').findPage({
    query: { registered: true },
    sort: { registeredAt: 1 },
    limit: 500000,
    stream: true,
    batchSize: 1000,
    pipeline: [
      { $project: { email: 1, name: 1, registeredAt: 1 } }
    ]
  });

  const csvTransform = new Transform({
    objectMode: true,
    transform(doc, encoding, callback) {
      const row = `${doc._id},${doc.email},${doc.name},${doc.registeredAt}\n`;
      callback(null, row);
    }
  });

  const writeStream = fs.createWriteStream('users_export.csv');
  writeStream.write('id,email,name,registeredAt\n');

  stream.pipe(csvTransform).pipe(writeStream);
  
  await new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
  
  console.log('导出完成');
}
```

### 6. 跳页性能优化

**❌ 错误做法**：跳转到远距离页面时配置不当
```javascript
// 不好：跳转到第 500 页但步长太大
const result = await collection('products').findPage({
  query: { category: 'books' },
  sort: { publishDate: -1 },
  limit: 50,
  page: 500,
  jump: {
    step: 100,  // 步长太大，第 500 页没有书签
    maxHops: 10  // 限制太小，无法到达
  }
});
// 可能抛出 JUMP_TOO_FAR 错误
```

**✅ 正确做法**：根据使用模式优化跳页配置
```javascript
// 1. 频繁跳页场景 - 密集书签
const result1 = await collection('products').findPage({
  query: { category: 'books' },
  sort: { publishDate: -1 },
  limit: 50,
  page: 500,
  jump: {
    step: 5,       // 每 5 页保存书签
    maxHops: 50,   // 允许跳 50 次
    ttlMs: 12 * 3600000  // 缓存 12 小时
  }
});

// 2. 小数据量 - 使用 offset 跳页
const result2 = await collection('categories').findPage({
  query: { active: true },
  sort: { name: 1 },
  limit: 20,
  page: 15,
  offsetJump: {
    enable: true,
    maxSkip: 10000  // 数据量小于 1 万条
  }
});

// 3. 检测跳页错误并降级处理
async function robustPagination(page) {
  try {
    return await collection('products').findPage({
      query: { inStock: true },
      sort: { updatedAt: -1 },
      limit: 50,
      page,
      jump: { step: 10, maxHops: 20 }
    });
  } catch (error) {
    if (error.code === 'JUMP_TOO_FAR') {
      console.log('跳页距离太远，尝试使用 offset 模式');
      return await collection('products').findPage({
        query: { inStock: true },
        sort: { updatedAt: -1 },
        limit: 50,
        page,
        offsetJump: { enable: true, maxSkip: 100000 }
      });
    }
    throw error;
  }
}
```

**跳页配置建议**：
- **< 100 页**：step = 5-10, maxHops = 20
- **100-1000 页**：step = 10-20, maxHops = 30-50
- **> 1000 页**：考虑使用游标分页或限制可跳转范围
- **小数据量**：优先使用 offsetJump

## 常见问题 (FAQ)

### Q: 游标分页和传统分页有什么区别？

**A**: 游标分页使用排序值作为定位点，性能为 O(1)；传统分页使用 skip/offset，性能随页码增加而下降。游标分页更适合大数据集和实时数据。

### Q: 为什么跳页需要设置 maxHops？

**A**: 防止恶意或错误请求导致过度跳转。每次跳转都是一次数据库查询，maxHops 限制可以保护系统性能。

### Q: 流式模式什么时候使用？

**A**: 处理大量数据且不需要一次性加载到内存时使用，如数据导出、批量处理、ETL 等场景。

### Q: totals 统计会影响性能吗？

**A**: sync 模式会影响响应时间，建议使用 async 模式。首次查询触发后台统计，后续查询返回缓存结果。

### Q: 书签会占用多少内存？

**A**: 每个书签大约 200-500 字节。默认最多缓存 10000 页，总内存占用约 2-5 MB，可以通过配置调整。

### Q: 如何处理数据变化导致的游标失效？

**A**: 捕获 `CURSOR_INVALID` 错误，重新从首页开始查询。对于经常变化的数据，建议使用时间戳等稳定字段排序。

### Q: page、after、before 参数可以同时使用吗？

**A**: 不可以。这三个参数是互斥的：
- `page` 用于跳页模式，不能与 `after` 或 `before` 同时使用
- `after` 和 `before` 用于游标分页，两者也不能同时使用
- 同时使用会抛出 `VALIDATION_ERROR` 错误

```javascript
// ❌ 错误：不能同时使用
await collection('orders').findPage({
  page: 5,
  after: 'cursor123'  // 错误！
});

// ✅ 正确：选择一种模式
await collection('orders').findPage({
  page: 5  // 跳页模式
});
// 或
await collection('orders').findPage({
  after: 'cursor123'  // 游标分页
});
```

### Q: 游标分页时，如何实现"上一页"功能？

**A**: 使用 `before` 参数结合 `startCursor`：

```javascript
// 第一页
const page1 = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20
});

// 下一页
const page2 = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  after: page1.pageInfo.endCursor
});

// 返回上一页
const backToPage1 = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  before: page2.pageInfo.startCursor  // 使用 before + startCursor
});
```

### Q: 为什么流式模式不支持 totals 统计？

**A**: 流式模式的设计目标是高效处理大量数据，返回的是 MongoDB 原始 Cursor Stream，不包含分页元信息。如果需要总数统计，应该：

1. 先使用普通模式获取首页和总数
2. 再使用流式模式处理后续数据

```javascript
// 方案：先获取总数，再流式处理
const firstPage = await collection('logs').findPage({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: 100,
  totals: { mode: 'sync' }
});

console.log(`共 ${firstPage.totals.total} 条记录`);

// 然后使用流式处理所有数据
const stream = await collection('logs').findPage({
  query: { level: 'error' },
  sort: { timestamp: -1 },
  limit: firstPage.totals.total,
  stream: true,
  batchSize: 1000
});
```

### Q: 如何判断是否已经到达最后一页？

**A**: 使用 `pageInfo.hasNext` 字段：

```javascript
const result = await collection('products').findPage({
  query: { category: 'books' },
  sort: { price: 1 },
  limit: 50,
  page: 10
});

if (!result.pageInfo.hasNext) {
  console.log('已经是最后一页了');
} else {
  console.log('还有更多数据');
}
```

对于游标分页，同样可以通过 `hasNext` 判断：

```javascript
let cursor = null;
let pageNum = 1;

while (true) {
  const result = await collection('orders').findPage({
    query: { status: 'paid' },
    sort: { createdAt: -1 },
    limit: 100,
    after: cursor
  });

  console.log(`第 ${pageNum} 页: ${result.items.length} 条`);
  
  if (!result.pageInfo.hasNext) {
    console.log('所有数据处理完毕');
    break;
  }
  
  cursor = result.pageInfo.endCursor;
  pageNum++;
}
```

### Q: 跳页时出现 JUMP_TOO_FAR 错误怎么办？

**A**: 这个错误表示跳转距离超过了 `maxHops` 限制。有以下几种解决方案：

**方案 1：增加 maxHops 值**
```javascript
const result = await collection('products').findPage({
  query: { category: 'electronics' },
  sort: { price: 1 },
  limit: 50,
  page: 200,
  jump: {
    step: 10,
    maxHops: 50  // 增加到 50
  }
});
```

**方案 2：减小 step 值（更密集的书签）**
```javascript
const result = await collection('products').findPage({
  query: { category: 'electronics' },
  sort: { price: 1 },
  limit: 50,
  page: 200,
  jump: {
    step: 5,  // 每 5 页保存书签
    maxHops: 20
  }
});
```

**方案 3：降级到 offset 跳页**
```javascript
try {
  const result = await collection('products').findPage({
    query: { category: 'electronics' },
    sort: { price: 1 },
    limit: 50,
    page: 200,
    jump: { step: 10, maxHops: 20 }
  });
} catch (error) {
  if (error.code === 'JUMP_TOO_FAR') {
    // 降级到 offset 模式
    const result = await collection('products').findPage({
      query: { category: 'electronics' },
      sort: { price: 1 },
      limit: 50,
      page: 200,
      offsetJump: { enable: true, maxSkip: 100000 }
    });
  }
}
```

### Q: 如何优化大数据量的总数统计性能？

**A**: 建议采用以下策略：

**1. 使用 async 模式 + 长缓存**
```javascript
const result = await collection('orders').findPage({
  query: { year: 2024 },
  sort: { createdAt: -1 },
  limit: 50,
  totals: {
    mode: 'async',
    ttlMs: 1800000,  // 缓存 30 分钟
    maxTimeMS: 10000
  }
});
```

**2. 为统计查询指定索引**
```javascript
// 创建索引
await db.collection('orders').createIndex({ year: 1 });

// 使用 hint 指定索引
const result = await collection('orders').findPage({
  query: { year: 2024 },
  sort: { createdAt: -1 },
  limit: 50,
  totals: {
    mode: 'sync',
    hint: { year: 1 },  // 使用索引加速
    maxTimeMS: 3000
  }
});
```

**3. 只在需要时统计，其他时候通过 hasNext 判断**
```javascript
// 首页查询：获取总数
const firstPageResult = await collection('products').findPage({
  query: { inStock: true },
  sort: { updatedAt: -1 },
  limit: 50,
  page: 1,
  totals: { mode: 'async' }
});

// 后续页：不统计总数
const otherPageResult = await collection('products').findPage({
  query: { inStock: true },
  sort: { updatedAt: -1 },
  limit: 50,
  page: 5
  // 不设置 totals，节省性能
});
```

### Q: explain 模式会返回实际数据吗？

**A**: 不会。当使用 `explain` 参数时，findPage 会直接返回 MongoDB 的执行计划对象，不返回实际的分页数据和 pageInfo。

```javascript
// explain 模式：只返回执行计划
const explainResult = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20,
  explain: 'executionStats'
});

console.log(explainResult);
// 输出：{ queryPlanner: {...}, executionStats: {...} }
// 没有 items、pageInfo 等字段

// 正常查询模式：返回数据
const dataResult = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 20
});

console.log(dataResult);
// 输出：{ items: [...], pageInfo: {...} }
```

**使用建议**：explain 主要用于开发和调试阶段分析查询性能，不应在生产环境的正常请求中使用。

### Q: 缓存是如何工作的？数据更新后会自动失效吗？

**A**: 缓存机制说明：

**缓存内容**：
- **查询结果缓存**：键前缀为 `fp:`，缓存分页查询结果
- **书签缓存**：键前缀为 `bm:`，缓存跳页书签
- **总数缓存**：键前缀为 `tot:`，缓存总数统计结果

**缓存失效**：
- 缓存**不会**自动失效，需要手动清理或等待 TTL 过期
- 数据更新后应手动失效相关缓存

```javascript
// 更新数据
await collection('products').update(
  { _id: productId },
  { $set: { price: 99 } }
);

// 手动失效缓存
await collection('products').invalidate('findPage');

// 或失效所有缓存
await collection('products').invalidate('*');
```

**缓存键区分**：
- 相同的 query、sort、limit 会命中同一个缓存
- 不同的查询条件会生成不同的缓存键

```javascript
// 这两个查询使用相同的缓存
const r1 = await collection('products').findPage({
  query: { category: 'books' },
  sort: { price: 1 },
  limit: 20,
  cache: 60000
});

const r2 = await collection('products').findPage({
  query: { category: 'books' },
  sort: { price: 1 },
  limit: 20,
  cache: 60000
});
// r2 会命中 r1 的缓存

// 这个查询会使用不同的缓存（query 不同）
const r3 = await collection('products').findPage({
  query: { category: 'electronics' },  // 不同
  sort: { price: 1 },
  limit: 20,
  cache: 60000
});
```

### Q: pipeline 参数的作用范围是什么？

**A**: `pipeline` 只对**当页返回的 limit 条数据**生效，不影响分页逻辑和查询条件。

```javascript
// pipeline 只处理返回的 20 条数据
const result = await collection('orders').findPage({
  query: { status: 'completed' },
  sort: { completedAt: -1 },
  limit: 20,
  page: 1,
  pipeline: [
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
        orderId: 1,
        amount: 1,
        'user.name': 1,
        'user.email': 1
      }
    }
  ]
});

// result.items 包含 20 条经过 pipeline 处理的订单数据
// 包含关联的用户信息
```

**注意事项**：
1. pipeline 在分页逻辑**之后**执行
2. 不会影响 totals 统计（统计的是原始数据）
3. 不会影响游标计算（游标基于原始排序字段）
4. 适合做数据关联、字段转换等后处理

### Q: 如何实现无限滚动加载？

**A**: 使用游标分页配合前端状态管理：

**前端示例（React）**：
```javascript
import { useState, useEffect } from 'react';

function OrderList() {
  const [orders, setOrders] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: { status: 'paid' },
          sort: { createdAt: -1 },
          limit: 20,
          after: cursor
        })
      });
      
      const result = await response.json();
      
      setOrders(prev => [...prev, ...result.items]);
      setCursor(result.pageInfo.endCursor);
      setHasMore(result.pageInfo.hasNext);
    } catch (error) {
      console.error('加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadMore();
  }, []);

  return (
    <div>
      {orders.map(order => (
        <div key={order._id}>{order.orderId}</div>
      ))}
      
      {hasMore && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? '加载中...' : '加载更多'}
        </button>
      )}
      
      {!hasMore && <div>没有更多数据了</div>}
    </div>
  );
}
```

**后端示例（Node.js）**：
```javascript
app.post('/api/orders', async (req, res) => {
  try {
    const { query, sort, limit, after } = req.body;
    
    const result = await collection('orders').findPage({
      query,
      sort,
      limit: Math.min(limit, 100),  // 限制最大值
      after
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Q: findPage 和普通的 find 方法有什么区别？该如何选择？

**A**: 两者适用场景不同：

**使用 find 的场景**：
- 简单查询，不需要分页
- 数据量确定且较小（< 1000 条）
- 需要所有数据一次性返回
- 不需要游标、书签等高级功能

**使用 findPage 的场景**：
- 需要分页展示
- 数据量大或不确定
- 需要支持"下一页"、"上一页"、跳页等功能
- 需要总数统计
- 需要流式处理大数据
- 需要缓存分页结果

**示例对比**：
```javascript
// 场景 1：获取用户的前 10 个订单 -> 使用 find
const recentOrders = await collection('orders').find({
  query: { userId: '123' },
  sort: { createdAt: -1 },
  limit: 10
});

// 场景 2：分页浏览所有订单 -> 使用 findPage
const ordersPage = await collection('orders').findPage({
  query: { userId: '123' },
  sort: { createdAt: -1 },
  limit: 20,
  after: cursor
});

// 场景 3：导出大量数据 -> 使用 findPage 流式模式
const exportStream = await collection('orders').findPage({
  query: { year: 2024 },
  sort: { createdAt: 1 },
  limit: 1000000,
  stream: true,
  batchSize: 1000
});
```

**性能对比**：

| 操作 | find | findPage |
|------|------|----------|
| 简单查询 | ⚡ 更快 | 稍慢（有分页逻辑开销） |
| 大数据分页 | ❌ 不适用 | ✅ 高效 |
| 跳页 | ❌ 性能差 | ✅ 优化支持 |
| 流式处理 | ✅ 支持 | ✅ 支持 |
| 总数统计 | ❌ 需额外查询 | ✅ 内置支持 |

---

## 相关文档

- [find 方法文档](./find.md)
- [游标编码规范](./cursor-encoding.md)
- [缓存策略](./caching.md)
- [性能优化指南](./performance.md)
- [API 参考](./api-reference.md)
- [monSQLize README](../README.md)
