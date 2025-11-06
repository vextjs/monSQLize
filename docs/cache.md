# 缓存策略文档

## 概述

monSQLize 提供了强大的内置缓存系统，支持 TTL（生存时间）、LRU（最近最少使用）淘汰策略、多层缓存、缓存失效机制和统计监控。本文档详细说明缓存的配置和使用。

## 核心特性

- ✅ **TTL 过期**：自动淘汰过期数据
- ✅ **LRU 淘汰**：缓存满时淘汰最少使用的条目
- ✅ **多层缓存**：查询结果 + Bookmark 分页
- ✅ **自动失效**：insert/update/delete 自动清理相关缓存
- ✅ **统计监控**：命中率、淘汰统计、内存占用

---

## 缓存配置

### 全局缓存配置

在构造函数中配置全局缓存参数：

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  // 全局缓存配置
  cache: {
    maxSize: 100000,              // 最大缓存条目数（默认 100000）
    enableStats: true             // 启用统计（默认 true）
  }
});
```

### 查询级缓存配置

在具体查询中指定缓存 TTL（毫秒）：

```javascript
const { collection } = await msq.connect();

// 缓存 5 秒
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,           // 缓存 5000ms
  maxTimeMS: 3000
});

// 不使用缓存
const realtimeData = await collection('orders').find({
  query: { status: 'pending' },
  cache: 0,              // 禁用缓存
  maxTimeMS: 3000
});

// 长期缓存（1 小时）
const staticConfig = await collection('config').findOne({
  query: { key: 'site_settings' },
  cache: 3600000,        // 缓存 1 小时
  maxTimeMS: 3000
});
```

---

## 缓存键生成

缓存键由以下部分组成：
- 数据库名
- 集合名
- 查询条件（stringify）
- 投影（stringify）
- 排序（stringify）
- limit/skip

```javascript
// 示例：缓存键生成
const key = `${dbName}:${collName}:${hash(query)}:${hash(projection)}:${hash(sort)}:${limit}:${skip}`;
```

**相同查询的不同参数会生成不同的缓存键**：

```javascript
// 以下 3 个查询会生成 3 个不同的缓存键
await collection('products').find({
  query: { category: 'electronics' },
  limit: 10,
  cache: 5000
});

await collection('products').find({
  query: { category: 'electronics' },
  limit: 20,              // 不同的 limit
  cache: 5000
});

await collection('products').find({
  query: { category: 'books' },  // 不同的 query
  limit: 10,
  cache: 5000
});
```

---

## TTL（生存时间）过期

### 自动过期

缓存条目在 TTL 到期后自动失效：

```javascript
const { collection } = await msq.connect();

// 第一次查询：缓存 miss，从数据库读取
const products1 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 3000,           // 缓存 3 秒
  maxTimeMS: 3000
});
console.log('第一次查询：从数据库读取');

// 2 秒后查询：缓存 hit，从缓存读取
await new Promise(r => setTimeout(r, 2000));
const products2 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 3000,
  maxTimeMS: 3000
});
console.log('2秒后查询：从缓存读取（缓存 hit）');

// 再等 2 秒（总共 4 秒）：缓存过期，重新从数据库读取
await new Promise(r => setTimeout(r, 2000));
const products3 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 3000,
  maxTimeMS: 3000
});
console.log('4秒后查询：缓存过期，重新从数据库读取');
```

### TTL 最佳实践

| 数据类型 | 推荐 TTL | 说明 |
|---------|---------|------|
| **静态配置** | 1-24 小时 | 极少变化的数据 |
| **用户信息** | 5-30 分钟 | 中等变化频率 |
| **商品列表** | 30 秒 - 5 分钟 | 频繁更新的数据 |
| **实时订单** | 0（禁用缓存） | 需要实时性的数据 |
| **统计数据** | 10-60 秒 | 允许短暂延迟 |

---

## LRU（最近最少使用）淘汰

### 淘汰机制

当缓存条目数达到 `maxSize` 时，自动淘汰最久未访问的条目。

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    maxSize: 1000,          // 最多缓存 1000 条
    enableStats: true
  }
});

const { collection } = await msq.connect();

// 缓存 1001 条不同的查询
for (let i = 0; i < 1001; i++) {
  await collection('products').find({
    query: { id: i },
    cache: 60000,           // 缓存 1 分钟
    maxTimeMS: 3000
  });
}

// 查看淘汰统计
const stats = msq.getCacheStats();
console.log('淘汰次数:', stats.evictions);
console.log('当前缓存条目数:', stats.size);  // 应该是 1000（最大值）
```

### LRU 访问顺序

```javascript
// 场景：maxSize = 3

// 1. 添加 3 条缓存
await collection('test').find({ query: { a: 1 }, cache: 60000 });  // 缓存 [a:1]
await collection('test').find({ query: { b: 2 }, cache: 60000 });  // 缓存 [a:1, b:2]
await collection('test').find({ query: { c: 3 }, cache: 60000 });  // 缓存 [a:1, b:2, c:3]

// 2. 访问第一条缓存（刷新 LRU 顺序）
await collection('test').find({ query: { a: 1 }, cache: 60000 });  // 缓存 [b:2, c:3, a:1]

// 3. 添加第 4 条缓存（淘汰最少使用的 b:2）
await collection('test').find({ query: { d: 4 }, cache: 60000 });  // 缓存 [c:3, a:1, d:4]
```

---

## 多层缓存

monSQLize 支持两层缓存：
1. **查询结果缓存**：缓存 find/findOne/aggregate/distinct 等查询结果
2. **Bookmark 缓存**：缓存 findPage 分页游标

### 查询结果缓存

```javascript
const { collection } = await msq.connect();

// find 查询缓存
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,           // 缓存 5 秒
  maxTimeMS: 3000
});

// findOne 查询缓存
const user = await collection('users').findOne({
  query: { email: 'user@example.com' },
  cache: 30000,          // 缓存 30 秒
  maxTimeMS: 3000
});

// aggregate 查询缓存
const stats = await collection('orders').aggregate({
  pipeline: [
    { $match: { status: 'completed' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
  ],
  cache: 60000,          // 缓存 1 分钟
  maxTimeMS: 3000
});

// distinct 查询缓存
const categories = await collection('products').distinct({
  field: 'category',
  query: { inStock: true },
  cache: 10000,          // 缓存 10 秒
  maxTimeMS: 3000
});
```

### Bookmark 分页缓存

```javascript
// findPage 使用 Bookmark 缓存分页游标
const page1 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  bookmarks: {
    step: 10,            // 每 10 页缓存一个书签
    maxHops: 20,         // 最多跳跃 20 次
    ttlMs: 3600000,      // 书签缓存 1 小时
    maxPages: 10000      // 最多缓存 10000 页
  },
  maxTimeMS: 3000
});

// 跳到第 100 页（使用书签缓存加速）
const page100 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  page: 100,             // 跳到第 100 页
  bookmarks: {
    step: 10,
    maxHops: 20,
    ttlMs: 3600000,
    maxPages: 10000
  },
  maxTimeMS: 3000
});
```

---

## 缓存失效机制

### 自动失效

写操作（insert/update/delete）会自动清理相关缓存：

```javascript
const { collection } = await msq.connect();

// 1. 查询并缓存
const products1 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 60000,          // 缓存 1 分钟
  maxTimeMS: 3000
});
console.log('第一次查询:', products1.length);

// 2. 插入新商品（自动清理 products 集合的所有缓存）
await collection('products').insertOne({
  name: 'New Product',
  category: 'electronics',
  price: 999
});
console.log('✅ 插入成功，缓存已自动清理');

// 3. 再次查询（缓存 miss，从数据库读取最新数据）
const products2 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 60000,
  maxTimeMS: 3000
});
console.log('第二次查询:', products2.length);  // 应该比第一次多 1 条
```

### 手动清理

使用 `clearBookmarks()` 手动清理 Bookmark 缓存：

```javascript
const { collection } = await msq.connect();

// 清理特定集合的所有书签
await collection('products').clearBookmarks();
console.log('✅ products 集合的书签已清理');

// 清理特定查询的书签
await collection('products').clearBookmarks({
  query: { category: 'electronics' },
  sort: { createdAt: -1 }
});
console.log('✅ 特定查询的书签已清理');
```

---

## 统计监控

### 获取缓存统计

```javascript
const { collection } = await msq.connect();

// 执行一些查询
await collection('products').find({ query: {}, cache: 5000, maxTimeMS: 3000 });
await collection('products').find({ query: {}, cache: 5000, maxTimeMS: 3000 });  // 缓存 hit
await collection('users').find({ query: {}, cache: 5000, maxTimeMS: 3000 });

// 获取统计
const stats = msq.getCacheStats();

console.log('缓存统计:', {
  size: stats.size,           // 当前缓存条目数
  hits: stats.hits,           // 缓存命中次数
  misses: stats.misses,       // 缓存未命中次数
  sets: stats.sets,           // 缓存设置次数
  deletes: stats.deletes,     // 缓存删除次数
  evictions: stats.evictions, // LRU 淘汰次数
  hitRate: stats.hitRate      // 命中率（百分比）
});

// 输出示例:
// {
//   size: 2,
//   hits: 1,
//   misses: 2,
//   sets: 2,
//   deletes: 0,
//   evictions: 0,
//   hitRate: '33.33%'
// }
```

### 统计指标说明

| 指标 | 说明 | 优化目标 |
|------|------|---------|
| **size** | 当前缓存条目数 | 接近 maxSize 表示利用率高 |
| **hits** | 缓存命中次数 | 越高越好 |
| **misses** | 缓存未命中次数 | 越低越好 |
| **sets** | 缓存设置次数 | 正常波动 |
| **deletes** | 缓存删除次数（写操作触发） | 正常波动 |
| **evictions** | LRU 淘汰次数 | 频繁淘汰说明 maxSize 太小 |
| **hitRate** | 命中率（hits / (hits + misses)） | 目标 > 80% |

### 监控与告警

```javascript
// 定期监控缓存性能
setInterval(() => {
  const stats = msq.getCacheStats();
  
  // 命中率过低告警
  if (parseFloat(stats.hitRate) < 50) {
    console.warn('⚠️ 缓存命中率过低:', stats.hitRate);
    console.warn('建议：增加 TTL 或 maxSize');
  }
  
  // 频繁淘汰告警
  if (stats.evictions > 1000) {
    console.warn('⚠️ 缓存频繁淘汰:', stats.evictions);
    console.warn('建议：增加 maxSize');
  }
  
  // 缓存利用率低告警
  if (stats.size < msq.cache.maxSize * 0.1) {
    console.warn('⚠️ 缓存利用率过低:', `${stats.size}/${msq.cache.maxSize}`);
    console.warn('建议：减少 maxSize 或增加缓存使用');
  }
}, 60000);  // 每分钟检查一次
```

---

## 性能基准

### 缓存加速效果

以下是 monSQLize 内置的性能基准测试结果：

#### find 查询缓存

```bash
测试: find 查询（100 条记录）
迭代次数: 10000

缓存命中:
  总耗时: 15ms
  平均耗时: 0.0015ms/次

缓存未命中（数据库查询）:
  总耗时: 4523ms
  平均耗时: 0.4523ms/次

加速比: 301.5x
```

#### findPage 查询缓存

```bash
测试: findPage 查询（游标分页）
迭代次数: 10000

缓存命中:
  总耗时: 18ms
  平均耗时: 0.0018ms/次

缓存未命中（数据库查询）:
  总耗时: 5234ms
  平均耗时: 0.5234ms/次

加速比: 290.8x
```

#### distinct 查询缓存

```bash
测试: distinct 查询（统计去重字段）
迭代次数: 10000

缓存命中:
  总耗时: 14ms
  平均耗时: 0.0014ms/次

缓存未命中（数据库查询）:
  总耗时: 3892ms
  平均耗时: 0.3892ms/次

加速比: 278.0x
```

**结论**：缓存命中可以提供 **200-300x** 的性能提升。

---

## 最佳实践

### 1. 根据数据特征选择 TTL

```javascript
const { collection } = await msq.connect();

// 静态配置：长期缓存
const siteConfig = await collection('config').findOne({
  query: { key: 'site_settings' },
  cache: 3600000,        // 1 小时
  maxTimeMS: 3000
});

// 用户信息：中等缓存
const user = await collection('users').findOne({
  query: { id: userId },
  cache: 300000,         // 5 分钟
  maxTimeMS: 3000
});

// 商品列表：短期缓存
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 60000,          // 1 分钟
  maxTimeMS: 3000
});

// 实时订单：禁用缓存
const orders = await collection('orders').find({
  query: { status: 'pending' },
  cache: 0,              // 不缓存
  maxTimeMS: 3000
});
```

### 2. 合理设置 maxSize

```javascript
// 低流量场景：较小的 maxSize
const msqLow = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxSize: 1000 }    // 1000 条足够
});

// 中等流量场景：标准 maxSize
const msqMedium = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxSize: 100000 }  // 默认 10 万条
});

// 高流量场景：较大的 maxSize
const msqHigh = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxSize: 500000 }  // 50 万条
});
```

### 3. 监控缓存健康度

```javascript
// 健康检查函数
function checkCacheHealth(msq) {
  const stats = msq.getCacheStats();
  const hitRate = parseFloat(stats.hitRate);
  const evictionRate = stats.evictions / (stats.sets || 1);
  
  return {
    healthy: hitRate > 70 && evictionRate < 0.1,
    hitRate,
    evictionRate,
    recommendations: [
      hitRate < 70 && '命中率过低，建议增加 TTL',
      evictionRate > 0.1 && '淘汰频繁，建议增加 maxSize',
      stats.size < msq.cache.maxSize * 0.1 && '利用率低，建议减少 maxSize'
    ].filter(Boolean)
  };
}

// 使用
const health = checkCacheHealth(msq);
if (!health.healthy) {
  console.warn('⚠️ 缓存健康度异常');
  health.recommendations.forEach(r => console.warn('  -', r));
}
```

### 4. 批量预热缓存

```javascript
async function prewarmCache(collection, queries) {
  console.log('开始缓存预热...');
  
  for (const [index, query] of queries.entries()) {
    await collection('products').find({
      query,
      cache: 300000,     // 缓存 5 分钟
      maxTimeMS: 3000
    });
    
    if ((index + 1) % 10 === 0) {
      console.log(`预热进度: ${index + 1}/${queries.length}`);
    }
  }
  
  const stats = msq.getCacheStats();
  console.log(`✅ 预热完成，已缓存 ${stats.size} 条查询`);
}

// 使用
const hotQueries = [
  { category: 'electronics' },
  { category: 'books' },
  { inStock: true },
  { price: { $lt: 100 } }
];

await prewarmCache(collection, hotQueries);
```

### 5. 缓存穿透保护

```javascript
// 对于可能返回空结果的查询，也应该缓存
const product = await collection('products').findOne({
  query: { id: 'non-existent' },
  cache: 60000,          // 缓存空结果 1 分钟
  maxTimeMS: 3000
});

// 第二次查询相同的 id，从缓存返回 null，避免重复查询数据库
const product2 = await collection('products').findOne({
  query: { id: 'non-existent' },
  cache: 60000,
  maxTimeMS: 3000
});
```

---

## 常见问题

### Q: 缓存会占用多少内存？

**A**: 每个缓存条目包含查询键（约 100-200 字节）和查询结果（取决于数据大小）。

估算公式：
```
内存占用 ≈ 缓存条目数 × 平均结果大小

示例:
- 10000 条缓存
- 每条结果平均 1KB
- 总内存占用 ≈ 10000 × 1KB = 10MB
```

### Q: 如何选择合适的 maxSize？

**A**: 根据服务器内存和查询热点数据量选择：

```javascript
// 公式
maxSize = 可用内存 / 平均结果大小

// 示例 1：服务器有 1GB 可用内存，平均结果 1KB
maxSize = 1GB / 1KB = 1000000 条

// 示例 2：服务器有 100MB 可用内存，平均结果 500 字节
maxSize = 100MB / 500B = 200000 条
```

**建议**：
- 从默认值 100000 开始
- 监控淘汰率（evictionRate）
- 如果 evictionRate > 10%，增加 maxSize

### Q: 写操作会清理哪些缓存？

**A**: 写操作会清理同一集合的所有缓存：

```javascript
// 1. 缓存 3 个查询
await collection('products').find({ query: { category: 'A' }, cache: 60000 });
await collection('products').find({ query: { category: 'B' }, cache: 60000 });
await collection('users').find({ query: {}, cache: 60000 });

// 2. 更新 products 集合（清理所有 products 缓存）
await collection('products').updateOne({
  query: { id: 1 },
  update: { $set: { price: 999 } }
});

// 3. 此时的缓存状态：
// - products 的两个查询缓存被清理
// - users 的查询缓存仍然有效
```

### Q: 如何禁用缓存？

**A**: 有三种方式：

```javascript
// 方式 1：全局禁用（构造时不传 cache 配置）
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
  // 不传 cache 配置
});

// 方式 2：查询级禁用
await collection('orders').find({
  query: {},
  cache: 0,              // cache: 0 表示不缓存
  maxTimeMS: 3000
});

// 方式 3：不传 cache 参数
await collection('orders').find({
  query: {},
  maxTimeMS: 3000        // 不传 cache 参数
});
```

### Q: 缓存和 Bookmark 有什么区别？

**A**: 
- **缓存（find/findOne/aggregate/distinct）**：缓存查询结果（完整的文档列表）
- **Bookmark（findPage）**：缓存分页游标（仅存储每 N 页的起始位置）

```javascript
// 缓存查询结果（存储完整数据）
const products = await collection('products').find({
  query: {},
  cache: 60000           // 缓存完整的 products 列表
});

// Bookmark 分页（仅存储游标位置）
const page1 = await collection('products').findPage({
  query: {},
  limit: 20,
  bookmarks: {
    step: 10,            // 每 10 页存储一个游标
    ttlMs: 3600000       // 游标缓存 1 小时
  }
});
```

---

## 参考资料

- [LRU 缓存算法](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))
- [Redis 缓存策略](https://redis.io/topics/lru-cache)
- [HTTP 缓存控制](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [monSQLize README](../README.md)
- [findPage 文档](./findPage.md)
- [Bookmarks 文档](./bookmarks.md)
