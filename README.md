# monSQLize

一个面向多数据库的统一（Mongo 风格）读 API。目前支持 MongoDB。目标是在不同后端之间平滑切换，同时保持熟悉的查询形态与选项。

## 特性

### 🔵 MongoDB 原生功能支持

monSQLize 完整封装了 MongoDB 的原生功能：

- ✅ **完整 CRUD 操作**：Create/Read/Update/Delete (100% 完成)
- ✅ **标准查询方法**：find/findOne/aggregate/count/distinct
- ✅ **写入操作**：insertOne/insertMany/updateOne/updateMany/replaceOne
- ✅ **删除操作**：deleteOne/deleteMany/findOneAndDelete
- ✅ **原子操作**：findOneAndUpdate/findOneAndReplace/findOneAndDelete (支持计数器、乐观锁、队列消费)
- ✅ **索引管理**：createIndex/createIndexes/listIndexes/dropIndex/dropIndexes (支持所有索引选项)
- ✅ **链式调用 API**：完整支持 MongoDB 游标的所有链式方法
- ✅ **所有查询选项**：projection/sort/limit/skip/hint/collation 等

### 🔧 monSQLize 扩展功能

在 MongoDB 原生功能基础上，提供额外的便利性和性能优化：

- 🔧 **智能缓存**：TTL/LRU/命名空间失效/并发去重
- 🔧 **自动缓存失效**：写操作后自动清理相关缓存
- 🔧 **深度分页**：游标分页（支持前后翻页、跳页、书签）
- 🔧 **性能监控**：慢查询日志、查询超时控制、元数据返回
- 🔧 **跨库访问**：轻松访问不同数据库的集合
- 🔧 **类型安全**：完整的 TypeScript 类型声明

**📚 详细对比**: 查看 [MongoDB 原生 vs monSQLize 扩展](./docs/mongodb-native-vs-extensions.md)

## 状态

**CRUD + 索引管理完成度**: 100% (Create ✅ / Read ✅ / Update ✅ / Delete ✅ / Index ✅)

- **已实现**：
  - **Create**: insertOne, insertMany, insertBatch
  - **Read**: find, findOne, findPage, aggregate, count, distinct, explain
  - **Update**: updateOne, updateMany, replaceOne, findOneAndUpdate, findOneAndReplace
  - **Delete**: deleteOne, deleteMany, findOneAndDelete
  - **索引管理**: createIndex, createIndexes, listIndexes, dropIndex, dropIndexes
  - **其他**: 智能缓存、多层缓存、跨库访问、慢查询日志、TypeScript 类型
  
- **计划中**：
  - **数据库适配器**: PostgreSQL, MySQL, SQLite
  - **缓存适配器**: Redis

**完整能力矩阵与路线图**：[STATUS.md](./STATUS.md)

### 📊 MongoDB 原生 vs monSQLize 增强

| 功能类别 | MongoDB 原生 | monSQLize | 主要增强 |
|---------|-------------|-----------|---------|
| **查询操作** | ✅ | ✅ | 智能缓存、游标分页、慢查询日志 |
| **插入操作** | ✅ | ✅ | 高性能批量插入 (10-50x)、慢查询监控 |
| **更新操作** | ✅ | ✅ | 自动缓存失效、完整错误处理 |
| **删除操作** | ✅ | ✅ | 自动缓存失效、慢查询监控 |
| **聚合操作** | ✅ | ✅ | 缓存支持、流式处理 |
| **执行计划** | ✅ | ✅ | 集成到查询链 |
| **跨库访问** | 手动切换 | ✅ | 一行代码切换 |
| **缓存管理** | ❌ | ✅ | TTL/LRU/自动失效/多层缓存 |
| **性能监控** | 需配置 | ✅ | 开箱即用的慢查询日志 |

---

## 安装

```bash
npm i monsqlize

# 如需 Redis 多层缓存（可选）
npm i ioredis
```

### 兼容性说明

**支持的 MongoDB 驱动版本**:
- ✅ MongoDB Node.js Driver 6.x（完全测试并支持）
- ⚠️ 其他版本未经充分测试

monSQLize 内部已处理 MongoDB 驱动 6.x 的 API 变更（特别是 `findOneAnd*` 方法），确保 API 行为一致。

**详细说明**: 
- 📖 [MongoDB 驱动版本兼容性指南](./docs/mongodb-driver-compatibility.md) - 驱动升级指南和最佳实践
- 📄 [技术分析报告](./analysis-reports/2025-11-17-mongodb-driver-6x-compatibility-FINAL.md) - 详细的技术实现

---

## 快速开始

```js
const MonSQLize = require('monsqlize');

(async () => {
  // 创建实例并连接
  const { db, collection } = await new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' },
    maxTimeMS: 3000,        // 全局查询超时（毫秒）
    findLimit: 10,          // find 默认 limit
  }).connect();

  // 查询单个文档
  const one = await collection('test').findOne(
    { status: 'active' },
    {
      cache: 5000,            // 缓存 5 秒
      maxTimeMS: 1500         // 覆盖全局超时
    }
  );
  console.log('findOne ->', one);

  // 查询多个文档
  const list = await collection('test').find(
    { category: 'electronics' },
    {
      limit: 10,              // 限制 10 条
      cache: 3000             // 缓存 3 秒
    }
  );
  console.log('find ->', list.length);

  // 跨库访问
  const event = await db('analytics').collection('events').findOne(
    { type: 'click' },
    {
      cache: 3000,
      maxTimeMS: 1500
    }
  );
  console.log('跨库查询 ->', event);

  // 更新单个文档
  const updateResult = await collection('users').updateOne(
    { userId: 'user123' },
    { $set: { status: 'active', updatedAt: new Date() } }
  );
  console.log('更新成功 ->', updateResult.modifiedCount);

  // 批量更新
  const batchResult = await collection('users').updateMany(
    { status: 'inactive' },
    { $set: { status: 'active' } }
  );
  console.log('批量更新 ->', batchResult.modifiedCount, '条');

  // 原子操作（计数器）
  const counter = await collection('counters').findOneAndUpdate(
    { name: 'orderNumber' },
    { $inc: { value: 1 } },
    { returnDocument: 'after', upsert: true }
  );
  console.log('订单号 ->', counter.value);

  // 索引管理
  // 创建唯一索引
  await collection('users').createIndex({ email: 1 }, { unique: true });
  
  // 批量创建索引
  await collection('products').createIndexes([
    { key: { category: 1, price: -1 } },
    { key: { sku: 1 }, unique: true }
  ]);
  
  // 列出所有索引
  const indexes = await collection('users').listIndexes();
  console.log('索引列表 ->', indexes.map(idx => idx.name));
  
  // 删除索引
  await collection('users').dropIndex('old_index');
})();
```

---

## 核心 API

### 查询方法

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **find()** | 批量查询（支持数组和流式） | [docs/find.md](./docs/find.md) |
| **findOne()** | 查询单个文档 | [docs/findOne.md](./docs/findOne.md) |
| **findOneById()** | 通过 _id 查询单个文档（自动 ObjectId 转换）⭐ | [docs/find-one-by-id.md](./docs/find-one-by-id.md) |
| **findPage()** | 分页查询（游标/跳页/总数） | [docs/findPage.md](./docs/findPage.md) |
| **stream()** | 流式查询（find 的语法糖） | [docs/find.md](./docs/find.md#流式传输) |
| **aggregate()** | 聚合管道查询 | [docs/aggregate.md](./docs/aggregate.md) |
| **distinct()** | 字段去重查询 | [docs/distinct.md](./docs/distinct.md) |
| **count()** | 统计文档数量 | [docs/count.md](./docs/count.md) |
| **explain()** | 查询计划分析 | [docs/explain.md](./docs/explain.md) |

### 写入操作

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **insertOne()** | 插入单个文档 | [docs/insert-one.md](./docs/insert-one.md) |
| **insertMany()** | 批量插入文档（10-50x 性能提升） | [docs/insert-many.md](./docs/insert-many.md) |
| **updateOne()** | 更新单个文档 | [docs/update-one.md](./docs/update-one.md) |
| **updateMany()** | 批量更新多个文档 | [docs/update-many.md](./docs/update-many.md) |
| **replaceOne()** | 完整替换单个文档 | [docs/replace-one.md](./docs/replace-one.md) |
| **deleteOne()** | 删除单个文档 | [docs/delete-one.md](./docs/delete-one.md) |
| **deleteMany()** | 批量删除文档 | [docs/delete-many.md](./docs/delete-many.md) |
| **findOneAndUpdate()** | 原子地查找并更新 | [docs/find-one-and-update.md](./docs/find-one-and-update.md) |
| **findOneAndReplace()** | 原子地查找并替换 | [docs/find-one-and-replace.md](./docs/find-one-and-replace.md) |
| **findOneAndDelete()** | 原子地查找并删除 | [docs/find-one-and-delete.md](./docs/find-one-and-delete.md) |

### 集合管理

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **createCollection()** | 创建集合 | [docs/collection-management.md](./docs/collection-management.md) |
| **dropCollection()** | 删除集合 | [docs/collection-management.md](./docs/collection-management.md) |
| **createView()** | 创建视图集合 | [docs/collection-management.md](./docs/collection-management.md) |

### 索引管理

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **createIndex()** | 创建单个索引（支持所有索引选项） | [docs/create-index.md](./docs/create-index.md) |
| **createIndexes()** | 批量创建多个索引 | [docs/create-indexes.md](./docs/create-indexes.md) |
| **listIndexes()** | 列出集合的所有索引 | [docs/list-indexes.md](./docs/list-indexes.md) |
| **dropIndex()** | 删除指定索引 | [docs/drop-index.md](./docs/drop-index.md) |
| **dropIndexes()** | 删除所有索引（_id 除外） | [docs/drop-index.md](./docs/drop-index.md#dropIndexes) |

**索引选项支持**: unique, sparse, expireAfterSeconds (TTL), partialFilterExpression, collation, hidden, 通配符, 文本索引等

### 缓存与维护

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **cache** | 缓存策略配置 | [docs/cache.md](./docs/cache.md) |
| **invalidate()** | 手动失效缓存 | [docs/cache.md](./docs/cache.md#缓存失效-api) |
| **prewarmBookmarks()** | 预热分页书签 | [docs/bookmarks.md](./docs/bookmarks.md) |
| **listBookmarks()** | 列出书签信息 | [docs/bookmarks.md](./docs/bookmarks.md) |
| **clearBookmarks()** | 清理书签缓存 | [docs/bookmarks.md](./docs/bookmarks.md) |

### 连接与事件

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **connect()** | 连接数据库 | [docs/connection.md](./docs/connection.md) |
| **close()** | 关闭连接 | [docs/connection.md](./docs/connection.md#关闭连接) |
| **health()** | 健康检查 | [docs/connection.md](./docs/connection.md#健康检查) |
| **on()** / **off()** | 事件监听/取消 | [docs/events.md](./docs/events.md) |

### 工具方法

| 方法 | 说明 | 文档链接 |
|------|------|---------|
| **getCache()** | 获取缓存实例 | [docs/utilities.md](./docs/utilities.md) |
| **getDefaults()** | 获取默认配置 | [docs/utilities.md](./docs/utilities.md) |
| **getNamespace()** | 获取命名空间信息 | [docs/utilities.md](./docs/utilities.md) |

---

## 主要功能示例

### 1. find 查询（支持流式传输）

```js
// 数组模式（默认）
const products = await collection('products').find(
  { category: 'electronics', inStock: true },
  {
    projection: { name: 1, price: 1 },
    sort: { price: -1 },
    limit: 20,
    cache: 5000,
    comment: 'ProductAPI:listProducts:user_123'  // 生产环境日志跟踪（可选）
  }
);

// 流式传输（大数据量）
const stream = await collection('products').find(
  { category: 'electronics' },
  {
    stream: true,              // 返回流
    cache: 0,                  // 禁用缓存
    comment: 'ExportService:streamProducts'      // 标识查询来源
  }
);

stream.on('data', (doc) => {
  console.log('处理文档:', doc);
});

stream.on('end', () => {
  console.log('✅ 所有文档处理完成');
});
```

**详细文档**: [docs/find.md](./docs/find.md)

---

### 2. findPage 分页查询

```js
// 游标分页（推荐）
const page1 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    sort: { createdAt: -1 },
    bookmarks: {
      step: 10,                // 每 10 页缓存一个书签
      maxHops: 20,             // 最多跳跃 20 次
      ttlMs: 3600000           // 书签缓存 1 小时
    }
  }
);

console.log('第 1 页:', page1.data);
console.log('下一页游标:', page1.cursor);

// 使用游标获取下一页
const page2 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    cursor: page1.cursor       // 传入上一页的游标
  }
);

// 跳页模式（跳到第 100 页）
const page100 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    page: 100,                 // 跳到第 100 页
    bookmarks: { step: 10, maxHops: 20, ttlMs: 3600000 }
  }
);
```

**详细文档**: [docs/findPage.md](./docs/findPage.md)

---

### 3. aggregate 聚合查询

```js
// 统计订单总额
const stats = await collection('orders').aggregate({
  pipeline: [
    { $match: { status: 'completed', date: { $gte: new Date('2025-01-01') } } },
    { $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    { $sort: { total: -1 } }
  ],
  cache: 60000,              // 缓存 1 分钟
  maxTimeMS: 5000
});

console.log('聚合结果:', stats);
```

**详细文档**: [docs/aggregate.md](./docs/aggregate.md)

---

### 4. 缓存策略

```js
// 配置全局缓存
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    maxSize: 100000,         // 最大缓存 10 万条
    enableStats: true        // 启用统计
  }
});

// 查询级缓存
const products = await collection('products').find(
  { category: 'electronics' },
  {
    cache: 5000,               // 缓存 5 秒
    maxTimeMS: 3000
  }
);

// 获取缓存统计
const stats = msq.getCacheStats();
console.log('缓存统计:', {
  命中率: stats.hitRate,
  缓存条目: stats.size,
  淘汰次数: stats.evictions
});

// 缓存失效（写操作后）
await collection('products').insertOne({ name: 'New Product', price: 999 });
// 自动清理 products 集合的所有缓存
```

**详细文档**: [docs/cache.md](./docs/cache.md)

---

### 5. 连接管理

```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

// 连接
const { db, collection } = await msq.connect();

// 跨库访问
const analyticsEvent = await db('analytics').collection('events').findOne(
  { type: 'click' },
  {
    cache: 3000
  }
);

// 关闭连接
await msq.close();
```

**详细文档**: [docs/connection.md](./docs/connection.md)

---

### 6. 副本集读偏好配置（readPreference）

```js
// 副本集读写分离（降低主节点负载）
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: {
    uri: 'mongodb://host1:27017,host2:27018,host3:27019/?replicaSet=rs0',
    readPreference: 'secondaryPreferred'  // 优先读从节点
  }
});

await msq.connect();
const { collection } = msq;

// 所有查询自动从从节点读取（降低主节点负载）
const products = await collection('products').find(
  { category: 'electronics' }
);

console.log(`✅ 从从节点读取 ${products.length} 条数据`);
```

**支持的读偏好模式**:
- `primary` - 仅读主节点（默认）
- `primaryPreferred` - 优先读主节点，主节点故障时读从节点
- `secondary` - 仅读从节点（适合分析/报表）
- `secondaryPreferred` - 优先读从节点（推荐，读写分离）
- `nearest` - 读最近的节点（全球分布式部署）

**详细文档**: [docs/readPreference.md](./docs/readPreference.md)

---

### 7. 事件监听

```js
// 监听慢查询
msq.on('slow-query', (data) => {
  console.warn('慢查询警告:', {
    操作: data.operation,
    集合: data.collectionName,
    耗时: data.duration,
    查询: data.query
  });
});

// 监听连接状态
msq.on('connected', (data) => {
  console.log('✅ 数据库连接成功');
});

msq.on('error', (data) => {
  console.error('❌ 数据库错误:', data.error.message);
});
```

**详细文档**: [docs/events.md](./docs/events.md)

---

### 8. 写入操作（insertOne / insertMany）

```js
// 插入单个文档
const result1 = await collection('products').insertOne(
  {
    name: 'iPhone 15 Pro',
    price: 999,
    category: 'electronics',
    createdAt: new Date()
  },
  {
    comment: 'ProductAPI:createProduct:user_123'  // 日志跟踪（可选）
  }
);

console.log('插入成功:', result1.insertedId);

// 批量插入文档（10-50x 性能提升）
const result2 = await collection('products').insertMany(
  [
    { name: 'MacBook Pro', price: 2499, category: 'electronics' },
    { name: 'iPad Air', price: 599, category: 'electronics' },
    { name: 'AirPods Pro', price: 249, category: 'accessories' }
  ],
  {
    ordered: true,             // 遇到错误时停止（默认）
    comment: 'ProductAPI:batchImport'
  }
);

console.log(`成功插入 ${result2.insertedCount} 条数据`);

// 自动缓存失效（插入后自动清理相关缓存）
// 无需手动调用 invalidate()
```

**性能对比**:
- 单条插入（insertOne）: ~10-20ms/条
- 批量插入（insertMany）: ~0.5-1ms/条 **(10-50x 更快)**

**详细示例**:
- [examples/insertOne.examples.js](./examples/insertOne.examples.js) - 8 个完整示例（基础/错误处理/缓存失效/性能对比）
- [examples/insertMany.examples.js](./examples/insertMany.examples.js) - 8 个完整示例（ordered/unordered 模式/性能测试）

---

### 10. 删除操作（deleteOne / deleteMany）

```js
// 删除单个文档
const result1 = await collection('users').deleteOne(
  { userId: 'user123' },
  {
    comment: 'UserAPI:deleteUser:admin'  // 日志跟踪（可选）
  }
);

console.log('删除结果:', result1.deletedCount);  // 0 或 1

// 批量删除文档
const result2 = await collection('logs').deleteMany(
  { createdAt: { $lt: new Date('2024-01-01') } },
  {
    comment: 'CleanupJob:deleteOldLogs'
  }
);

console.log(`成功删除 ${result2.deletedCount} 条旧日志`);

// 原子删除并返回被删除的文档
const deletedUser = await collection('users').findOneAndDelete(
  { userId: 'user456' },
  {
    projection: { name: 1, email: 1 },  // 只返回需要的字段
    sort: { createdAt: -1 }              // 如果有多个匹配，删除最新的
  }
);

console.log('已删除用户:', deletedUser);  // 返回被删除的文档或 null

// 自动缓存失效（删除后自动清理相关缓存）
// 无需手动调用 invalidate()
```

**自动缓存失效**: ✅ 所有删除操作成功后，自动清理相关集合的缓存

**详细文档**:
- [docs/delete-one.md](./docs/delete-one.md) - deleteOne 完整文档
- [docs/delete-many.md](./docs/delete-many.md) - deleteMany 完整文档（含分批删除策略）
- [docs/find-one-and-delete.md](./docs/find-one-and-delete.md) - 原子删除操作

**详细示例**:
- [examples/delete-operations.examples.js](./examples/delete-operations.examples.js) - 完整示例（基础/批量/原子操作）

---

### 11. 多层缓存（本地内存 + Redis）

```js
const MonSQLize = require('monsqlize');

// ✅ 最简单：直接传 Redis URL
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    multiLevel: true,                     // 启用多层缓存
    
    // 本地缓存配置
    local: {
      maxSize: 10000,                     // 本地缓存 1 万条
      enableStats: true
    },
    
    // 远端 Redis 缓存（直接传 URL）
    remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0'),
    
    // 缓存策略
    policy: {
      writePolicy: 'both',                // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true      // 远端命中时回填本地
    }
  }
});

const { collection } = await msq.connect();

// 第 1 次查询：缓存 miss → 查询 MongoDB → 存入本地 + Redis
const products1 = await collection('products').find(
  { category: 'electronics' },
  {
    cache: 10000,                           // 缓存 10 秒
    maxTimeMS: 3000
  }
);

// 第 2 次查询：本地缓存命中（0.001ms）
const products2 = await collection('products').find(
  { category: 'electronics' },
  {
    cache: 10000,
    maxTimeMS: 3000
  }
);

// 如果本地缓存过期，但 Redis 还有 → 从 Redis 读取（1-2ms）并回填本地
```

**性能对比**：
- 本地缓存命中：0.001ms
- Redis 缓存命中：1-2ms
- 数据库查询：10ms+

**详细文档**: [docs/cache.md](./docs/cache.md#多层缓存)

---

## 示例代码

所有示例代码位于 [examples/](./examples/) 目录：

| 示例文件 | 说明 |
|---------|------|
| [find.examples.js](./examples/find.examples.js) | find 查询示例（数组和流式） |
| [findOne.examples.js](./examples/findOne.examples.js) | findOne 查询示例 |
| [findOneById.examples.js](./examples/findOneById.examples.js) | findOneById 查询示例（字符串/ObjectId）⭐ |
| [findPage.examples.js](./examples/findPage.examples.js) | 分页查询示例（游标/跳页/总数） |
| [aggregate.examples.js](./examples/aggregate.examples.js) | 聚合管道示例 |
| [distinct.examples.js](./examples/distinct.examples.js) | 字段去重示例 |
| [count.examples.js](./examples/count.examples.js) | 统计查询示例 |
| [explain.examples.js](./examples/explain.examples.js) | 查询计划分析示例 |
| [insertOne.examples.js](./examples/insertOne.examples.js) | insertOne 插入示例 |
| [insertMany.examples.js](./examples/insertMany.examples.js) | insertMany 批量插入示例 |
| [updateOne.examples.js](./examples/updateOne.examples.js) | updateOne 更新示例 |
| [updateMany.examples.js](./examples/updateMany.examples.js) | updateMany 批量更新示例 |
| [delete-operations.examples.js](./examples/delete-operations.examples.js) | 删除操作示例（deleteOne/deleteMany/findOneAndDelete） |
| [replace-and-atomic-ops.examples.js](./examples/replace-and-atomic-ops.examples.js) | 替换和原子操作示例 |
| [indexes.examples.js](./examples/indexes.examples.js) | 索引管理示例 |
| [multi-level-cache.examples.js](./examples/multi-level-cache.examples.js) | 多层缓存示例（本地 + Redis） |
| [bookmarks.examples.js](./examples/bookmarks.examples.js) | 书签维护示例 |
| [chaining.examples.js](./examples/chaining.examples.js) | 链式调用示例 |

---

## 项目结构

```
monSQLize/
├── lib/                     # 源代码
│   ├── index.js            # 主入口
│   ├── mongodb/            # MongoDB 适配器
│   └── common/             # 通用工具
├── docs/                    # 详细文档
│   ├── find.md             # find 方法文档
│   ├── findPage.md         # findPage 方法文档
│   ├── aggregate.md        # aggregate 方法文档
│   ├── distinct.md         # distinct 方法文档
│   ├── count.md            # count 方法文档
│   ├── explain.md          # explain 方法文档
│   ├── bookmarks.md        # Bookmark 维护文档
│   ├── connection.md       # 连接管理文档
│   ├── cache.md            # 缓存策略文档
│   └── events.md           # 事件系统文档
├── examples/                # 示例代码
├── test/                    # 测试用例
├── index.d.ts               # TypeScript 类型声明
├── package.json
├── README.md                # 本文件
├── CHANGELOG.md             # 版本历史
├── STATUS.md                # 功能状态
└── LICENSE
```

---

## 开发与测试

### 运行测试

```bash
# 安装依赖
npm ci

# 运行所有测试
npm test

# 运行单个测试
npm test -- test/unit/features/find.test.js

# 查看测试覆盖率
npm run coverage
```

### 本地开发

```bash
# 安装 MongoDB Memory Server（测试用）
npm install

# 启动本地 MongoDB（如果需要）
docker run -d -p 27017:27017 --name mongodb mongo:latest

# 运行示例
node examples/find.examples.js
```

**测试文档**: [docs/MONGODB-MEMORY-SERVER.md](./docs/MONGODB-MEMORY-SERVER.md)

---

## 贡献指南

欢迎贡献！请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细信息。

### 贡献流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

## 链接

- **项目主页**: https://github.com/your-username/monSQLize
- **问题反馈**: https://github.com/your-username/monSQLize/issues
- **变更日志**: [CHANGELOG.md](./CHANGELOG.md)
- **功能状态**: [STATUS.md](./STATUS.md)

---

## 致谢

感谢所有贡献者和使用者的支持！