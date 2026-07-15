# MongoDB 原生 vs monSQLize 扩展功能对比

本文档详细对比 MongoDB 原生驱动和 monSQLize 的功能差异，帮助你了解 monSQLize 提供的额外价值。

## 快速对比表

| 功能类别 | MongoDB 原生 | monSQLize | 主要增强 |
|---------|-------------|-----------|---------|
| **查询操作** | | | 智能缓存、游标分页、慢查询日志 |
| **插入操作** | | | 可配置分批的批量插入、慢查询监控 |
| **更新操作** | | | 显式缓存失效、完整错误处理 |
| **删除操作** | | | 显式缓存失效、慢查询监控 |
| **聚合操作** | | | 缓存支持、流式处理 |
| **执行计划** | | | 集成到查询链 |
| **跨库访问** | 手动切换 | | 一行代码切换 |
| **缓存管理** | | | TTL/LRU/显式失效/多层缓存 |
| **性能监控** | 需配置 | | 开箱即用的慢查询日志 |

---

## MongoDB 原生功能（完整支持）

monSQLize 完整封装了 MongoDB 的所有原生功能，你可以使用熟悉的 MongoDB API：

### 完整 CRUD 操作

| 操作 | 方法 | 原生支持 | 文档 |
|------|------|---------|------|
| **Create** | insertOne, insertMany | | [insertOne 指南](./insert-one.md), [insertMany 指南](./insert-many.md) |
| **Read** | find, findOne, aggregate, count, distinct | | [find 指南](./find.md), [findOne 指南](./findOne.md) |
| **Update** | updateOne, updateMany, replaceOne | | [updateOne 指南](./update-one.md), [updateMany 指南](./update-many.md) |
| **Delete** | deleteOne, deleteMany | | [deleteOne 指南](./delete-one.md), [deleteMany 指南](./delete-many.md) |

### 原子操作

| 方法 | 原生支持 | 文档 |
|------|---------|------|
| findOneAndUpdate | | [findOneAndUpdate 指南](./find-one-and-update.md) |
| findOneAndReplace | | [findOneAndReplace 指南](./find-one-and-replace.md) |
| findOneAndDelete | | [findOneAndDelete 指南](./find-one-and-delete.md) |

### 索引管理

| 方法 | 原生支持 | 文档 |
|------|---------|------|
| createIndex, createIndexes | | [索引创建指南](./create-index.md) |
| listIndexes | | [索引列表指南](./list-indexes.md) |
| dropIndex, dropIndexes | | [索引删除指南](./drop-index.md) |

### 所有查询选项

| 选项 | 原生支持 | 说明 |
|------|---------|------|
| projection | | 字段投影 |
| sort | | 排序 |
| limit / skip | | 分页 |
| hint | | 索引提示 |
| collation | | 排序规则 |
| maxTimeMS | | 操作超时 |
| comment | | 操作注释 |

---

## monSQLize 独有的扩展功能

在 MongoDB 原生功能基础上，monSQLize 提供了额外的便利性和性能优化：

---

## 1. 智能缓存系统

### MongoDB 原生：无缓存

```javascript
// MongoDB 原生：每次都查询数据库
const db = client.db('shop');
const products = await db.collection('products').find({ 
  category: 'electronics' 
}).toArray();
// 延迟取决于查询、索引、数据集、服务端和网络。

// 再次查询：仍然查询数据库
const products2 = await db.collection('products').find({ 
  category: 'electronics' 
}).toArray();
// 此调用仍会访问数据库。
```

### monSQLize：智能缓存

```javascript
// monSQLize：自动缓存
const products = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }  // 缓存 5 秒
);
// 第 1 次查询数据库并填充已配置的缓存。

// 再次查询：从缓存返回
const products2 = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }
);
// 缓存仍有效时，第 2 次调用可以从缓存返回。
```

### 缓存特性对比

| 特性 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| **查询缓存** | 无 | TTL + LRU |
| **显式失效** | 无 | `cache.invalidate` / `autoInvalidate` |
| **命名空间隔离** | 无 | 按实例/数据库/集合隔离 |
| **并发去重** | 无 | 防止缓存击穿 |
| **缓存统计** | 无 | 命中率/淘汰次数 |
| **多层缓存** | 无 | 本地 + Redis |

**详细文档**: [缓存系统](./cache.md)

**性能说明**：缓存命中会避开数据库查询，但实际延迟取决于序列化、缓存层级、负载大小、网络位置与并发。请对部署工作负载进行测量；参见[性能证据](./performance-evidence.md)。

---

## 2. 显式缓存失效

### MongoDB 原生：手动管理缓存

```javascript
// 需要手动管理缓存一致性
const cache = new Map();

// 查询时手动检查缓存
const cacheKey = 'products:electronics';
let products = cache.get(cacheKey);

if (!products) {
  products = await db.collection('products').find({ 
    category: 'electronics' 
  }).toArray();
  cache.set(cacheKey, products);
}

// 更新时手动清理缓存（容易遗漏）
await db.collection('products').insertOne({ 
  name: 'New Product', 
  category: 'electronics' 
});

// 必须手动清理相关缓存
cache.delete('products:electronics');  // 容易忘记或清理不完整
```

### monSQLize：显式缓存失效

```javascript
// monSQLize：显式管理缓存一致性
const products = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }
);
// 缓存已自动创建

// 插入新数据，并精准清理受影响的查询缓存
await collection('products').insertOne(
  {
    name: 'New Product',
    category: 'electronics'
  },
  {
    cache: {
      invalidate: [{
        operation: 'find',
        query: { category: 'electronics' },
        options: { cache: 5000 }
      }]
    }
  }
);

// 再次查询：缓存已按显式策略清理，从数据库获取最新数据
const freshProducts = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }
);
// 数据是最新的，失效范围由写入 options 决定
```

### 显式失效支持的操作

| 操作 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| insertOne / insertMany | 手动失效 | 显式失效 |
| updateOne / updateMany | 手动失效 | 显式失效 |
| deleteOne / deleteMany | 手动失效 | 显式失效 |
| replaceOne | 手动失效 | 显式失效 |
| findOneAndUpdate | 手动失效 | 显式失效 |
| findOneAndReplace | 手动失效 | 显式失效 |
| findOneAndDelete | 手动失效 | 显式失效 |

**好处**: 把清理范围放在写入处声明，避免默认 broad 失效带来的删除和回填压力。

---

## 3. 深度分页（游标分页）

### MongoDB 原生：offset/limit 分页（性能差）

```javascript
// MongoDB 原生：使用 skip + limit（深度分页很慢）
const page = 1000;  // 第 1000 页
const pageSize = 20;

const products = await db.collection('products')
  .find({ category: 'electronics' })
  .sort({ createdAt: -1 })
  .skip((page - 1) * pageSize)  // 跳过 19980 条数据（很慢）
  .limit(pageSize)
  .toArray();

// 问题：
// - skip 需要扫描前面的所有文档（性能随页数线性下降）
// - 第 1000 页需要扫描 19980 条数据，非常慢
// - 数据变化时分页结果不稳定（插入/删除会影响后续页）
```

**性能对比**:

| 页数 | skip + limit 耗时 | 性能 |
|------|------------------|------|
| 第 1 页 | 10ms | 快 |
| 第 100 页 | 50ms | 较慢 |
| 第 1000 页 | 500ms | 很慢 |
| 第 10000 页 | 5000ms | 不可用 |

### monSQLize：游标分页（性能稳定）

```javascript
// monSQLize：使用游标分页（深度分页也很快）
const page1 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    sort: { createdAt: -1 },
    bookmarks: {
      step: 10,      // 每 10 页缓存一个书签
      maxHops: 20    // 最多跳跃 20 次
    }
  }
);

// 跳到第 1000 页（通过书签跳跃，不需要扫描所有数据）
const page1000 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    page: 1000,    // 直接跳到第 1000 页
    bookmarks: { step: 10, maxHops: 20 }
  }
);

// 性能：
// - 通过书签跳跃，避免扫描大量数据
// - 已有书签可用时，将跳转限制在配置的 hop 范围内
// - 数据变化不影响已有页（游标锁定查询时刻的数据集）
```

**性能对比**:

| 场景 | `skip + limit` | monSQLize 游标分页 |
|------|-------------|-------------------|
| 浅页 | 简单且通常足够 | 增加游标/书签状态 |
| 深度顺序翻页 | 服务端工作量可能随跳过偏移增长 | 从游标边界继续读取 |
| 深度跳页 | 成本取决于偏移量和查询计划 | 已有书签可用时使用书签与受限 hop |

以上特征不代表固定倍数提升。请使用真实索引、选择性、文档大小、页深、并发和 MongoDB 部署进行基准测试；参见[性能证据](./performance-evidence.md)。

### 分页特性对比

| 特性 | MongoDB 原生 (skip/limit) | monSQLize (游标分页) |
|------|--------------------------|---------------------|
| **深度分页性能** | 随页数线性下降 | 性能稳定（书签跳跃） |
| **前后翻页** | 支持 | 支持（after/before） |
| **跳页** | 支持（但慢） | 支持（且快） |
| **总数统计** | 需单独查询 | 异步统计（不阻塞） |
| **数据稳定性** | 插入/删除影响分页 | 游标锁定数据集 |

**详细文档**: [findPage 指南](./findPage.md)

---

## 4. 性能监控（慢查询日志）

### MongoDB 原生：需配置 profiling

```javascript
// MongoDB 原生：需要手动配置 profiling
await db.setProfilingLevel(1, { slowms: 100 });

// 查看慢查询日志（需要单独查询 system.profile 集合）
const slowQueries = await db.collection('system.profile')
  .find({ millis: { $gt: 100 } })
  .toArray();

// 问题：
// - 需要手动配置
// - 日志存储在数据库中（占用空间）
// - 需要单独查询和分析
// - 无法在代码中直接看到慢查询警告
```

### monSQLize：开箱即用的慢查询日志

```javascript
// monSQLize：自动监控慢查询
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 1000  // 超过 1 秒记录警告（默认值）
});

// 自动监听慢查询事件
msq.on('slow-query', (data) => {
  console.warn('慢查询警告:', {
    操作: data.operation,
    集合: data.collectionName,
    耗时: data.duration,
    查询: data.query,
    选项: data.options
  });
});

// 执行查询（自动监控）
const products = await collection('products').find({ 
  category: 'electronics' 
});

// 如果查询超过 1 秒，自动触发 slow-query 事件
// 输出: 慢查询警告: { 操作: 'find', 集合: 'products', 耗时: 1200, ... }
```

### 性能监控特性对比

| 特性 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| **慢查询监控** | 需配置 profiling | 开箱即用 |
| **实时告警** | 需单独查询日志 | 事件自动触发 |
| **查询超时** | maxTimeMS | 全局 + 查询级 |
| **操作耗时** | 需 profiling | 自动记录 |
| **日志存储** | 占用数据库空间 | 应用层日志 |

**详细文档**: [事件系统](./events.md)

---

## 5. 跨库访问

### MongoDB 原生：手动切换数据库

```javascript
// MongoDB 原生：需要手动切换数据库
const client = new MongoClient('mongodb://localhost:27017');
await client.connect();

// 访问 shop 数据库
const shopDb = client.db('shop');
const products = await shopDb.collection('products').find({}).toArray();

// 访问 analytics 数据库（需要手动切换）
const analyticsDb = client.db('analytics');  // 手动切换
const events = await analyticsDb.collection('events').find({}).toArray();

// 问题：
// - 每次跨库需要手动切换
// - 代码冗长
// - 容易出错
```

### monSQLize：显式作用域跨库访问

```javascript
// monSQLize：通过作用域访问跨库集合
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',  // 默认数据库
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection, use } = await msq.connect();

// 访问默认数据库 (shop)
const products = await collection('products').find({});

// 通过作用域访问 analytics
const events = await use('analytics').collection('events').find({});
// 简洁、清晰，适合业务集合访问

// 链式跨库
const logs = await use('logs').collection('access_logs').find({});
```

### 跨库访问特性对比

| 特性 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| **跨库切换** | 手动 `client.db(name)` | 使用 `use(name)` 获取跨库集合作用域 |
| **默认数据库** | 无概念 | 自动使用默认库 |
| **代码简洁性** | 冗长 | 简洁 |
| **缓存隔离** | 无缓存 | 自动按数据库隔离 |

**详细文档**: [连接配置](./connection.md)

---

## 6. 类型安全（TypeScript）

### MongoDB 原生：泛型类型

```typescript
// MongoDB 原生：基础泛型类型
import { MongoClient, Collection } from 'mongodb';

interface Product {
  _id?: ObjectId;
  name: string;
  price: number;
}

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('shop');
const products: Collection<Product> = db.collection('products');

// 基础类型推断
const result = await products.findOne({ name: 'iPhone' });
// result: Product | null
```

### monSQLize：完整类型声明

```typescript
// monSQLize：完整的 TypeScript 类型
import MonSQLize from 'monsqlize';

interface Product {
  _id?: ObjectId;
  name: string;
  price: number;
  category: string;
}

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection } = await msq.connect();

// 类型安全的查询
const products = await collection('products').find<Product>(
  { category: 'electronics' },
  {
    cache: 5000,         // 选项类型检查
    projection: { name: 1, price: 1 },  // 投影类型检查
    limit: 20            // 参数类型检查
  }
);
// products: Product[]

// 选项自动补全
const result = await collection('products').findPage<Product>(
  { category: 'electronics' },
  {
    cache: 5000,
    bookmarks: {
      step: 10,          // IDE 自动补全
      maxHops: 20,       // 类型提示
      ttlMs: 3600000     // 类型检查
    }
  }
);
```

### TypeScript 支持对比

| 特性 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| **基础类型** | 泛型支持 | 完整类型声明 |
| **选项类型** | 部分支持 | 完整支持 |
| **IDE 补全** | 基础补全 | 完整补全 |
| **类型检查** | 部分检查 | 严格检查 |

**类型声明文件**: [types/index.d.ts](../../types/index.d.ts)

---

## 7. 批量插入性能优化

### MongoDB 原生：标准 insertMany

```javascript
// MongoDB 原生：标准 insertMany
const documents = Array.from({ length: 10000 }, (_, i) => ({
  index: i,
  name: `Product ${i}`,
  price: Math.random() * 1000
}));

// 一次性插入（可能超时或内存不足）
const result = await db.collection('products').insertMany(documents);
// 延迟和内存使用取决于负载大小与部署限制。
```

### monSQLize：智能分批插入

```javascript
// monSQLize：insertMany（自动优化）
const documents = Array.from({ length: 10000 }, (_, i) => ({
  index: i,
  name: `Product ${i}`,
  price: Math.random() * 1000
}));

// 标准 insertMany（性能已优化）
const result = await collection('products').insertMany(documents);
// 使用包级写入路径；请在相同驱动选项下进行基准测试。

// 超大批量：使用 insertBatch（自动分批）
const result2 = await collection('products').insertBatch(documents, {
  batchSize: 1000  // 每批 1000 条
});
// 限制单批工作量；仍需处理失败与超时。
```

### 批量插入取舍

| 场景 | MongoDB 驱动 `insertMany` | monSQLize `insertMany` | monSQLize `insertBatch` |
|------|-------------|---------------------|----------------------|
| 可舒适放入单次请求 | 直接驱动路径 | 包级校验与 Hook 写入路径 | 通常不需要额外分批开销 |
| 大型或需限制的请求 | 调用方自行选择分批策略 | 单次包级请求 | 可配置批次限制单次工作量 |
| 失败处理 | 驱动结果与错误 | 包级结果与错误 | 按批策略与部分结果处理 |

分批可以控制请求大小，但不保证通用吞吐提升。请在相同写关注、ordered 模式、索引、文档大小与并发下测量；参见[性能证据](./performance-evidence.md)。

**详细文档**: [insertMany 指南](./insert-many.md), [insertBatch 指南](./insertBatch.md)

---

## 8. 多层缓存（本地 + Redis）

### MongoDB 原生：无缓存（8. 多层缓存（本地 + Redis））

```javascript
// MongoDB 原生：每次都查询数据库
const products = await db.collection('products').find({ 
  category: 'electronics' 
}).toArray();
// 每次调用都会访问数据库；延迟取决于工作负载。
```

### monSQLize：多层缓存

```javascript
// monSQLize：本地内存 + Redis 多层缓存
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    multiLevel: true,
    local: { maxEntries: 10000 },  // 本地缓存 1 万条
    remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0')
  }
});

// 第 1 次查询 MongoDB，并填充已配置的缓存层。
const products1 = await collection('products').find(
  { category: 'electronics' },
  { cache: 10000 }
);

// 第 2 次调用可以命中进程内缓存。
const products2 = await collection('products').find(
  { category: 'electronics' },
  { cache: 10000 }
);

// 如果本地缓存过期而 Redis 条目仍有效，则从 Redis 读取。
```

### 多层缓存性能特征

| 缓存层 | 主要成本因素 | 能力边界 |
|--------|---------|---------|
| **数据库查询** | 查询计划、索引、存储、服务端负载与网络 | 权威数据路径 |
| **Redis 缓存** | 网络、序列化、负载大小、Redis 负载与拓扑 | 避开 MongoDB 查询，但仍有远程调用 |
| **本地缓存** | 序列化、负载大小、淘汰与进程负载 | 在当前进程内避开网络调用 |

请在相同负载与并发下比较各条路径；参见[性能证据](./performance-evidence.md)。

### 多层缓存特性对比

| 特性 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| **本地缓存** | 无 | 内存 LRU |
| **远端缓存** | 无 | Redis 支持 |
| **多层缓存** | 无 | 本地 + Redis |
| **自动回填** | 无 | Redis 命中时回填本地 |
| **缓存一致性** | 无 | 显式写后失效 |

**详细文档**: [多层缓存](./cache.md#多层缓存)

---

## 9. 链式调用 API

### MongoDB 原生：游标链式调用

```javascript
// MongoDB 原生：游标链式调用
const cursor = db.collection('products')
  .find({ category: 'electronics' })
  .sort({ price: -1 })
  .skip(20)
  .limit(10);

const products = await cursor.toArray();
```

### monSQLize：完整链式调用 + 缓存

```javascript
// monSQLize：链式调用 + 缓存支持
const products = await collection('products')
  .find({ category: 'electronics' })
  .sort({ price: -1 })
  .skip(20)
  .limit(10)
  .cache(5000)        // 链式缓存
  .maxTimeMS(3000)    // 链式超时
  .comment('API:listProducts')  // 链式注释
  .toArray();
```

### 链式调用特性对比

| 特性 | MongoDB 原生 | monSQLize |
|------|-------------|-----------|
| **基础链式** | find/sort/limit | 完整支持 |
| **缓存链式** | 无 | .cache() |
| **超时链式** | 需在 find 选项 | .maxTimeMS() |
| **注释链式** | 需在 find 选项 | .comment() |
| **流式链式** | .stream() | .stream() + 缓存 |

**详细文档**: [链式调用 API](./chaining-api.md)

---

## 10. 事件系统

### MongoDB 原生：监听驱动事件

```javascript
// MongoDB 原生：监听底层驱动事件
client.on('commandStarted', (event) => {
  console.log('Command:', event.commandName);
});

client.on('serverHeartbeatFailed', (event) => {
  console.error('Heartbeat failed');
});

// 问题：
// - 只有底层驱动事件
// - 无慢查询事件
// - 无缓存相关事件
```

### monSQLize：丰富的业务事件

```javascript
// monSQLize：业务级事件
msq.on('slow-query', (data) => {
  console.warn('慢查询:', data.operation, data.duration);
});

msq.on('cache-hit', (data) => {
  console.log('缓存命中:', data.key);
});

msq.on('cache-miss', (data) => {
  console.log('缓存未命中:', data.key);
});

msq.on('connected', () => {
  console.log('数据库已连接');
});

msq.on('error', (data) => {
  console.error('错误:', data.error.message);
});
```

### 事件系统对比

| 事件类型 | MongoDB 原生 | monSQLize |
|---------|-------------|-----------|
| **连接事件** | | |
| **驱动事件** | | |
| **慢查询事件** | | |
| **缓存事件** | | |
| **业务事件** | | |

**详细文档**: [事件系统](./events.md)

---

## 使用建议

### 何时使用 MongoDB 原生驱动？

**适合场景**:
- 简单的脚本或工具
- 不需要缓存
- 不需要高级分页
- 对性能要求不高

### 何时使用 monSQLize？

**适合场景**:
- **生产环境应用** - 需要缓存和性能优化
- **高流量 API** - 缓存可以减少数据库压力
- **深度分页** - 列表页、搜索结果等
- **多数据库应用** - 需要跨库访问
- **性能监控** - 需要慢查询告警
- **复杂业务** - 需要显式缓存失效

---

## 总结对比

| 维度 | MongoDB 原生 | monSQLize | 提升 |
|------|-------------|-----------|------|
| **功能完整性** |  |  | 100% 兼容 + 扩展 |
| **性能（无缓存）** |  |  | 可配置写入分批 |
| **性能（有缓存）** | ☆☆☆☆ |  | 本地与远程缓存层 |
| **深度分页** | ☆☆☆ |  | 游标与书签策略 |
| **易用性** |  |  | 更简洁的 API |
| **可维护性** |  |  | 显式缓存失效 |
| **可观测性** | ☆☆☆ |  | 开箱即用监控 |

---

## 快速开始

如果你想体验 monSQLize 的扩展功能，从这里开始：

1. **安装**: `npm install monsqlize`
2. **启用缓存**: 在查询中添加 `{ cache: 5000 }`
3. **使用分页**: 使用 `findPage()` 替代 `find()`
4. **监控慢查询**: 监听 `slow-query` 事件
5. **跨库访问**: 使用 `db(name).collection(name)`

**完整示例**: 查看 [入门指南](./getting-started.md)

---

## 相关文档

- [缓存系统](./cache.md) - 缓存系统详细文档
- [findPage 指南](./findPage.md) - 分页查询详细文档
- [事件系统](./events.md) - 事件系统详细文档
- [insertMany 指南](./insert-many.md) - 批量插入性能优化
- [连接配置](./connection.md) - 连接管理和跨库访问
