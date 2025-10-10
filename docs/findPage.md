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
- 使用 `limit` 限制��数据量（防止无限流）
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
    maxHops: 20,        // 最多跳 20 次
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

### 4. 流式查询优化

```javascript
// 使用合适的 batchSize
const stream = await collection('logs').findPage({
  query: { date: { $gte: '2025-01-01' } },
  sort: { timestamp: 1 },
  limit: 100000,
  stream: true,
  batchSize: 1000,  // 每批次 1000 条
  allowDiskUse: true  // 大数据量时启用
});

// 使用 pipeline 减少数据传输
const stream2 = await collection('orders').findPage({
  query: { year: 2024 },
  sort: { createdAt: 1 },
  limit: 50000,
  pipeline: [
    { $project: { orderId: 1, amount: 1, status: 1 } }  // 只投影需要的字段
  ],
  stream: true,
  batchSize: 500
});
```

### 5. 全局配置优化

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  // 全局配置
  maxTimeMS: 5000,         // 全局超时
  findPageMaxLimit: 1000,  // 提高单页最大限制
  slowQueryMs: 1000,       // 慢查询阈值
  bookmarks: {
    step: 5,               // 更密集的书签（适合频繁跳页）
    maxHops: 30,
    ttlMs: 12 * 3600000    // 更长的缓存时间
  }
});
```

## 注意事项

1. **游标有效性**：游标是基于数据快照生成的，如果排序字段的数据发生变化，游标可能失效
2. **排序一致性**：使用游标分页时，必须保持排序规则一致，包括字段和方向
3. **limit 限制**：单次查询的 limit 不能超过 `findPageMaxLimit`（默认 500）
4. **互斥参数**：`page` 与 `after`/`before` 不能同时使用；`after` 与 `before` 不能同时使用
5. **流式限制**：流式模式不支持跳页和 totals 功能
6. **书签缓存**：书签会占用缓存空间，需要合理配置 TTL 和最大页数
7. **pipeline 作用域**：`pipeline` 参数只对当页的 `limit` 条数据生效，不影响分页逻辑
8. **稳定排序**：如果排序规则不包含 `_id`，系统会自动追加 `_id: 1` 确保稳定排序

## 完整示例

```javascript
const MonSQLize = require('monsqlize');

async function example() {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'shop',
    config: { uri: 'mongodb://localhost:27017' },
    findPageMaxLimit: 500,
    bookmarks: {
      step: 10,
      maxHops: 20,
      ttlMs: 6 * 3600000
    }
  });

  const { collection } = await msq.connect();

  // 示例 1: 基本游标分页
  const page1 = await collection('products').findPage({
    query: { category: 'electronics', inStock: true },
    sort: { price: 1, _id: 1 },
    limit: 20
  });

  console.log('第一页数据:', page1.items.length);
  console.log('是否有下一页:', page1.pageInfo.hasNext);

  // 示例 2: 跳页查询带总数
  const page5 = await collection('products').findPage({
    query: { category: 'electronics' },
    sort: { price: 1 },
    limit: 20,
    page: 5,
    jump: { step: 10, maxHops: 20 },
    totals: { mode: 'sync', hint: { category: 1, price: 1 } }
  });

  console.log(`第 5 页，共 ${page5.totals.totalPages} 页`);
  console.log('数据:', page5.items);

  // 示例 3: 流式处理大数据
  const stream = await collection('orders').findPage({
    query: { status: 'completed', year: 2025 },
    sort: { completedAt: -1 },
    limit: 10000,
    stream: true,
    batchSize: 500
  });

  let totalAmount = 0;
  stream.on('data', (order) => {
    totalAmount += order.amount;
  });

  stream.on('end', () => {
    console.log('总金额:', totalAmount);
  });

  stream.on('error', (err) => {
    console.error('处理错误:', err);
  });

  // 等待流处理完成
  await new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  await msq.close();
}

example();
```

## 高级用法

### 自定义书签键维度

```javascript
// 自定义键维度（高级用法，通常不需要）
const result = await collection('orders').findPage({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 50,
  page: 10,
  jump: {
    step: 10,
    maxHops: 20,
    keyDims: {
      db: 'shop',
      coll: 'orders',
      sort: { createdAt: -1, _id: 1 },
      limit: 50,
      queryShape: 'custom_shape_hash',
      pipelineShape: 'custom_pipeline_hash'
    }
  }
});
```

### 使用 pipeline 进行页内数据处理

```javascript
// pipeline 只对返回的当页数据生效
const result = await collection('orders').findPage({
  query: { status: 'completed' },
  sort: { createdAt: -1 },
  limit: 20,
  pipeline: [
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        orderId: 1,
        amount: 1,
        'customer.name': 1,
        'customer.email': 1
      }
    }
  ]
});
```

### 组合缓存和总数统计

```javascript
const result = await collection('products').findPage({
  query: { inStock: true },
  sort: { popularity: -1 },
  limit: 30,
  cache: 300000,  // 缓存 5 分钟
  totals: {
    mode: 'async',
    ttlMs: 600000  // 总数缓存 10 分钟
  },
  meta: true  // 返回元信息
});

console.log('缓存命中:', result.meta.cacheHit);
console.log('查询耗时:', result.meta.durationMs, 'ms');
```

## 相关文档

- [游标编码规范](./cursor-encoding.md)
- [缓存策略](./caching.md)
- [性能优化指南](./performance.md)
- [API 参考](./api-reference.md)
- [monSQLize README](../README.md)

## 更新日志

### v2.0.1 (2025-01-10)
- 🐛 修复游标分页时的数据重复问题
- 🐛 修复 Date 和 ObjectId 类型在游标中的序列化问题
- 🐛 修复 totals 对象缺少 mode 字段的问题
- 🐛 修复 before 游标返回数据不完整的问题
- ✨ 改进跳页逻辑的书签缓存机制
- ✅ 通过全部 32 个测试用例

### v2.0.0 (2025-01-10)
- ✨ 新增流式查询支持 (`stream: true`)
- ✨ 新增 offset 跳页模式 (`offsetJump`)
- ✨ 优化书签缓存机制
- 📝 改进错误提示信息

### v1.5.0
- ✨ 新增 totals 统计功能
- ✨ 支持 meta 元信息返回
- ⚡ 优化跳页性能

### v1.0.0
- 🎉 首次发布
- ✨ 支持游标分页和跳页功能

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
