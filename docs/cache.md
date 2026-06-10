# 缓存策略文档

## 📑 目录

- [概述](#概述)
- [核心特性](#核心特性)
- [缓存配置](#缓存配置)
  - [全局缓存配置](#全局缓存配置)
  - [查询级缓存配置](#查询级缓存配置)
- [缓存键生成](#缓存键生成)
- [TTL（生存时间）过期](#ttl生存时间过期)
- [LRU（最近最少使用）淘汰](#lru最近最少使用淘汰)
- [多层缓存](#多层缓存)
- [缓存失效机制](#缓存失效机制)
- [统计监控](#统计监控)
- [性能基准](#性能基准)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [缓存失效 API](#缓存失效-api)
- [参考资料](#参考资料)

---

## 概述

monSQLize 提供了强大的内置缓存系统，支持 TTL（生存时间）、LRU（最近最少使用）淘汰策略、多层缓存、缓存失效机制和统计监控。本文档详细说明缓存的配置和使用。

> ⚠️ 若你关心的是公开缓存类/函数（`MemoryCache`、`createRedisCacheAdapter()`、`DistributedCacheInvalidator`、`withCache()`、`FunctionCache`）的升级迁移，请优先阅读 [`cache-hub 直调迁移说明`](./cache-hub-migration.md)。本页主要覆盖 monSQLize 的查询缓存与多层缓存接入方式。

## 核心特性

- ✅ **TTL 过期**：自动淘汰过期数据
- ✅ **LRU 淘汰**：缓存满时淘汰最少使用的条目
- ✅ **多层缓存架构**：本地缓存（LRU-Cache）+ 远端缓存（Redis/Memcached）
- ✅ **双层缓存机制**：查询结果缓存 + Bookmark 分页缓存
- ✅ **手动失效**：通过 `invalidate()` 方法清理指定集合的缓存
- ✅ **统计监控**：命中率、淘汰统计、内存占用

---

## 缓存配置

### 全局缓存配置

在构造函数中配置全局缓存参数：

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  // 全局缓存配置
  cache: {
    maxEntries: 100000,           // 最大缓存条目数（默认 100000）
    enableStats: true             // 启用统计（默认 true）
  }
});
```

### 查询级缓存配置

在具体查询中指定缓存 TTL（毫秒）：

```javascript
const { collection } = await msq.connect();
const products = collection('products');

// 缓存 5 秒（5000 毫秒）
const result1 = await products.find(
  { category: 'electronics' },
  { 
    cache: 5000,        // 缓存 5000ms
    maxTimeMS: 3000 
  }
);

// 不使用缓存（cache: 0）
const realtimeData = await collection('orders').find(
  { status: 'pending' },
  { 
    cache: 0,           // 禁用缓存
    maxTimeMS: 3000 
  }
);

// 长期缓存（1 小时 = 3600000 毫秒）
const staticConfig = await collection('config').findOne(
  { key: 'site_settings' },
  { 
    cache: 3600000,     // 缓存 1 小时
    maxTimeMS: 3000 
  }
);
```

**重要说明**:
- ✅ `cache` 参数的值是**毫秒数**（TTL）
- ✅ `cache: 0` 表示禁用缓存
- ✅ 默认值：未设置时不使用缓存
- ❌ **不支持** `cache: true` 和单独的 `ttl` 参数

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

// 查询 1
await collection('products').find(
  { category: 'electronics' },
  { limit: 10, cache: 5000 }
);

// 查询 2（不同的 limit）
await collection('products').find(
  { category: 'electronics' },
  { limit: 20, cache: 5000 }  // ← limit 不同
);

// 查询 3（不同的 sort）
await collection('products').find(
  { category: 'electronics' },
  { limit: 10, sort: { price: 1 }, cache: 5000 }  // ← 有 sort
);

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

当缓存条目数达到 `maxEntries` 时，自动淘汰最久未访问的条目。

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    maxEntries: 1000,       // 最多缓存 1000 条
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
const stats = msq.getCache().getStats();
console.log('淘汰次数:', stats.evictions);
console.log('当前缓存条目数:', stats.entries);  // 应该是 1000（最大值）
```

### LRU 访问顺序

```javascript
// 场景：maxEntries = 3

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

monSQLize 提供两种多层缓存机制：

### 1. 本地 + 远端缓存架构（MultiLevelCache）

支持本地内存缓存（LRU-Cache）+ 远端缓存（Redis/Memcached）的两层架构，实现更高的缓存命中率和更大的缓存容量。

#### CacheLike 接口规范

要作为 `remote` 使用，缓存实例必须实现以下 10 个方法（`CacheLike` 接口）：

| 方法 | 签名 | 说明 | 必需 |
|------|------|------|------|
| **get** | `async get(key: string): any` | 获取单个缓存值 | ✅ |
| **set** | `async set(key: string, val: any, ttl?: number): void` | 设置单个缓存值（ttl 单位：毫秒） | ✅ |
| **del** | `async del(key: string): boolean` | 删除单个缓存项 | ✅ |
| **exists** | `async exists(key: string): boolean` | 检查键是否存在 | ✅ |
| **getMany** | `async getMany(keys: string[]): Object` | 批量获取（返回 `{key: value}`） | ✅ |
| **setMany** | `async setMany(obj: Object, ttl?: number): boolean` | 批量设置 | ✅ |
| **delMany** | `async delMany(keys: string[]): number` | 批量删除（返回删除数量） | ✅ |
| **delPattern** | `async delPattern(pattern: string): number` | 按模式删除（支持通配符 `*`） | ✅ |
| **clear** | `async clear(): void` | 清空所有缓存 | ✅ |
| **keys** | `async keys(pattern?: string): string[]` | 获取所有键（可选模式匹配） | ✅ |

**验证建议**：

- 优先直接使用 `MonSQLize.createRedisCacheAdapter()`，避免手写 `CacheLike` 适配器
- 若必须自定义 remote cache，请逐项确保实现了上表列出的 10 个方法
- 当前不再提供旧包装层里的 `MemoryCache.isValidCache()` 校验工具

#### 缓存策略

**读操作**：
1. 优先从本地缓存读取（内存，速度快）
2. 本地未命中则查询远端缓存（网络，速度较慢）
3. 远端命中则异步回填到本地缓存（可配置）
4. 远端失败则优雅降级（返回 undefined）

**写操作**：
- `both`（默认）：本地 + 远端双写，保证一致性
- `local-first-async-remote`：本地优先，远端异步写入，提升性能

**删除操作**：
- 删除本地缓存（立即生效）
- 删除远端缓存（尽力而为）
- `delPattern` 支持可选的集群广播机制

#### 配置示例

##### 方式 1：只使用远程 Redis 缓存（无本地缓存）

如果不需要本地内存缓存，可以直接传入 Redis 适配器作为缓存实例：

```javascript
import MonSQLize from 'monsqlize';

// ✅ 只使用 Redis 缓存（不使用 multiLevel）
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  // 直接传入 Redis 适配器（不需要 multiLevel: true）
  cache: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0')
});

const { collection } = await msq.connect();

// 所有查询缓存直接存储在 Redis
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 10000,                           // 缓存 10 秒
  maxTimeMS: 3000
});
```

**适用场景**：
- 多实例部署，需要共享缓存
- 服务器内存受限，不适合本地缓存
- 缓存数据量较大（百万级）
- 需要持久化缓存（Redis 持久化）

**性能特点**：
- 读取延迟：1-2ms（网络 + Redis 查询）
- 缓存容量：取决于 Redis 内存（可达 GB 级）
- 缓存一致性：跨实例共享，强一致性

---

##### 方式 2：本地 + 远程双层缓存（推荐高性能场景）

使用 `multiLevel: true` 启用本地内存 + Redis 双层架构：

```javascript
import MonSQLize from 'monsqlize';

// ✅ 本地 + 远程双层缓存
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    multiLevel: true,                     // 启用双层缓存
    
    // 本地缓存配置
    local: {
      maxEntries: 10000,                  // 本地缓存 1 万条
      enableStats: true
    },
    
    // 远端 Redis 缓存（直接传 URL）
    remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0'),
    
    // 缓存策略
    policy: {
      writePolicy: 'both',                // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true      // 远端命中时回填本地（默认 true）
    }
  }
});

const { collection } = await msq.connect();

// 命中流程：
// 1. 查本地缓存 → 命中则返回（0.001ms）
// 2. 本地未命中 → 查 Redis → 命中则返回（1-2ms）+ 回填本地
// 3. Redis 未命中 → 查询 MongoDB → 存入本地 + Redis
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 10000,
  maxTimeMS: 3000
});
```

**适用场景**：
- 高并发读取场景
- 热点数据频繁访问
- 需要极致性能（本地缓存 0.001ms）
- 多实例部署 + 需要缓存一致性

**性能特点**：
- 本地缓存命中：0.001ms（内存读取）
- Redis 缓存命中：1-2ms（网络 + Redis）
- 数据库查询：10ms+

---

##### 方式 3：使用已创建的 Redis 实例

```javascript
import MonSQLize from 'monsqlize';
const Redis = require('ioredis');

// 创建 Redis 实例（自定义配置）
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

// 只使用 Redis 缓存（无本地缓存）
const msq1 = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: MonSQLize.createRedisCacheAdapter(redis)  // 直接传入实例
});

// 或使用双层缓存
const msq2 = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    multiLevel: true,
    local: { maxEntries: 10000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),  // 传入实例
    policy: { writePolicy: 'both' }
  }
});
```

---

##### 方式 4：手动封装 Redis（适用于自定义需求）

```javascript
import MonSQLize from 'monsqlize';
const { MemoryCache } = MonSQLize;  // 公开缓存工具类
const Redis = require('ioredis');

// 创建 Redis 客户端（远端缓存）
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0
});

// 封装 Redis 为 CacheLike 接口（必须实现以下 10 个方法）
const remoteCache = {
  async get(key) {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : undefined;
  },
  async set(key, val, ttl = 0) {
    const str = JSON.stringify(val);
    if (ttl > 0) {
      await redis.setex(key, Math.ceil(ttl / 1000), str);
    } else {
      await redis.set(key, str);
    }
  },
  async del(key) {
    return await redis.del(key) > 0;
  },
  async exists(key) {
    return await redis.exists(key) > 0;
  },
  async getMany(keys) {
    const values = await redis.mget(keys);
    const result = {};
    keys.forEach((key, i) => {
      if (values[i]) result[key] = JSON.parse(values[i]);
    });
    return result;
  },
  async setMany(obj, ttl = 0) {
    const pipeline = redis.pipeline();
    for (const [key, val] of Object.entries(obj)) {
      const str = JSON.stringify(val);
      if (ttl > 0) {
        pipeline.setex(key, Math.ceil(ttl / 1000), str);
      } else {
        pipeline.set(key, str);
      }
    }
    await pipeline.exec();
    return true;
  },
  async delMany(keys) {
    return await redis.del(...keys);
  },
  async delPattern(pattern) {
    // 简化实现（生产环境建议使用 SCAN）
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    return 0;
  },
  async clear() {
    await redis.flushdb();
  },
  async keys(pattern = '*') {
    return await redis.keys(pattern);
  }
};

// ✅ 建议先自行做最小契约检查
const hasRequiredMethods = ['get', 'set', 'del', 'exists', 'getMany', 'setMany', 'delMany', 'delPattern', 'clear', 'keys']
  .every((name) => typeof remoteCache[name] === 'function');

console.log('remoteCache 是否符合 CacheLike 接口:', hasRequiredMethods);

// 配置本地 + 远端缓存（monSQLize 内置了 MultiLevelCache）
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    multiLevel: true,     // ⚠️ 启用多层缓存（必须配置 remote 才有意义）
    
    // 本地缓存配置
    local: {
      maxEntries: 10000,  // 本地缓存 1 万条
      enableStats: true
    },
    
    // 远端缓存配置（必须配置，否则等同于只用本地缓存）
    
    // 方式 1：传入实现了 CacheLike 接口的 Redis 实例（✅ 推荐生产环境）
    remote: remoteCache,  // 上面封装的 Redis 缓存实例
    
    // 方式 2：传入配置对象（❌ 不推荐：会创建内存缓存占位，失去分布式缓存意义）
    // remote: {
    //   maxEntries: 50000, // 创建的是内存缓存，不是真正的 Redis
    //   timeoutMs: 50     // 远端操作超时时间（默认 50ms）
    // },
    
    // ⚠️ 如果不配置 remote，MultiLevelCache 会退化为只用本地缓存
    
    // 缓存策略配置
    policy: {
      writePolicy: 'both',                    // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true          // 远端命中时回填本地（默认 true）
    }
  }
});

const { collection } = await msq.connect();

// 使用缓存查询（自动使用本地 + 远端两层）
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,           // 缓存 5 秒
  maxTimeMS: 3000
});

// 命中流程：
// 1. 查本地缓存 → 命中则返回（最快）
// 2. 本地未命中 → 查远端缓存 → 命中则返回 + 回填本地
// 3. 远端未命中 → 查询 MongoDB → 存入本地 + 远端
```

#### 策略配置

```javascript
const msq = new MonSQLize({
  // ...
  cache: {
    maxEntries: 10000,
    remote: remoteCache,
    
    // 写策略配置
    policy: {
      writePolicy: 'both',                      // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true            // 远端命中时回填本地（默认 true）
    }
  }
});
```

#### 性能对比

**三种缓存策略对比**：

| 维度 | 无缓存 | 本地缓存（MemoryCache） | 远程缓存（Redis） | 双层缓存（MultiLevel） |
|------|-------|----------------------|------------------|---------------------|
| **响应时间** | 10-50ms | 0.001-0.1ms | 1-2ms | 0.001-2ms |
| **缓存容量** | - | 1-10万条 | GB级别（百万条+） | 10万+百万条 |
| **集群一致性** | ❌ 每次查库 | ❌ 各节点独立 | ✅ 共享Redis | ✅ 共享Redis |
| **内存占用** | - | 高（本地） | 低（远程） | 中（本地）+ 低（远程） |
| **可靠性** | ✅ 直接查库 | ⚠️ 重启丢失 | ✅ 持久化 | ✅ 持久化 |
| **单点故障影响** | 仅DB | 单机重启丢失 | Redis故障降级查库 | Redis故障降级本地 |
| **适用场景** | 低QPS | 单机应用 | 多实例集群 | 高QPS集群 |

**场景选择建议**：

| 场景 | 推荐策略 | 原因 |
|------|---------|------|
| 单机应用，低QPS | 本地缓存（MemoryCache） | 简单高效，无需Redis依赖 |
| 多实例部署，需一致性 | 远程缓存（Redis） | 跨节点共享，强一致性 |
| 高QPS，热点数据集中 | 双层缓存（MultiLevel） | 热点0.001ms，冷数据1-2ms |
| 内存受限服务器 | 远程缓存（Redis） | 节省本地内存，大容量 |
| 数据持久化需求 | 远程或双层 | Redis支持RDB/AOF持久化 |

**性能提升示例**：

| 场景 | 仅本地缓存 | 本地 + 远端缓存 | 提升 |
|------|-----------|----------------|------|
| 热点数据 | 0.1ms | 0.1ms | 无差异 |
| 冷数据（本地未命中）| 查询 MongoDB（10ms+）| 查询 Redis（1-2ms）| **5-10倍** |
| 缓存容量 | 受内存限制（1-10万）| Redis 可达百万级 | **10-100倍** |
| 集群一致性 | 每个节点独立 | 共享 Redis，一致性强 | ✅ |

#### 最佳实践

1. **本地缓存配置**
   - 设置合理的 `maxEntries`（推荐 1-10 万条）
   - 热点数据优先存入本地

2. **远端缓存配置**
   - Redis 连接池配置（避免连接耗尽）
   - 设置合理的超时时间（推荐 50-100ms）
   - 监控 Redis 内存使用

3. **写策略选择**
   - 强一致性场景：使用 `both`（默认）
   - 高并发写入：使用 `local-first-async-remote`

4. **故障降级**
   - 远端缓存故障自动降级到本地缓存
   - 不影响业务正常运行

---

### 2. 查询结果 + Bookmark 双层缓存

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

### 🆕 精准失效（v1.1.6+）

**精准失效**只清除真正受影响的缓存，而不是整个集合的缓存。

#### 配置方式

**方式1: 实例级别全局配置**（推荐）

所有写操作默认启用精准失效：

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    maxEntries: 100000,
    autoInvalidate: true  // 🆕 全局启用精准失效（默认 false）
  }
});

// 连接后，所有写操作自动启用精准失效
const { collection } = await msq.connect();

// ✅ 自动精准失效（使用实例配置）
await collection('products').insertOne({
  name: 'New Product',
  category: 'electronics'
});

// ✅ 自动精准失效（使用实例配置）
await collection('products').updateOne(
  { _id: productId },
  { $set: { price: 99 } }
);
```

**方式2: 写操作级别配置**（覆盖实例配置）

单次操作控制是否启用精准失效：

```javascript
// 实例配置 autoInvalidate = false
const msq = new MonSQLize({
  cache: { maxEntries: 100000 }  // 默认不自动失效
});

const { collection } = await msq.connect();

// ✅ 单次操作启用精准失效（覆盖实例配置）
await collection('products').insertOne(
  { name: 'New Product', category: 'electronics' },
  { autoInvalidate: true }  // 单次启用
);

// ❌ 使用实例配置（不失效）
await collection('products').updateOne(
  { _id: productId },
  { $set: { price: 99 } }
);
```

**配置优先级**: 写操作配置 > 实例配置

**⚠️ 重要说明**：
- `autoInvalidate` 选项**只用于写操作**（insert/update/delete）
- 查询操作（find/findOne）**不支持** `autoInvalidate` 选项
- 查询只需要使用 `cache` 选项指定缓存时间

#### 精准失效示例

```javascript
const { collection } = await msq.connect();

// 1. 查询并缓存（两个不同的查询）
await collection('products').find(
  { category: 'electronics' },
  { cache: 60000 }
);

await collection('products').find(
  { category: 'books' },
  { cache: 60000 }
);

// 2. 插入新商品（只影响 electronics 缓存）
await collection('products').insertOne(
  { name: 'New Phone', category: 'electronics', price: 999 },
  { autoInvalidate: true }
);

// ✅ 精准失效：只清除匹配 { category: 'electronics' } 的缓存
// ✅ 保留：{ category: 'books' } 的缓存不受影响
```


#### 支持的查询条件

精准失效支持简单查询条件：

✅ **支持的操作符**：
- 相等匹配：`{ status: 'active' }`
- `$eq`：`{ status: { $eq: 'active' } }`
- `$ne`：`{ status: { $ne: 'deleted' } }`
- `$gt`, `$gte`, `$lt`, `$lte`：`{ price: { $gte: 100 } }`
- `$in`：`{ category: { $in: ['a', 'b'] } }`
- `$nin`：`{ status: { $nin: ['deleted'] } }`

❌ **不支持的操作符**（自动跳过，按 TTL 过期）：
- `$regex`, `$exists`, `$type`
- `$elemMatch`, `$size`, `$all`
- `$where`

#### ObjectId 字段支持

精准失效完全支持 ObjectId 字段（包括 `_id`）：

```javascript
// ✅ 使用字符串 _id（自动规范化）
await collection('users').find(
  { _id: "507f1f77bcf86cd799439011" },
  { cache: 5000 }
);

await collection('users').updateOne(
  { _id: "507f1f77bcf86cd799439011" },
  { $set: { name: 'Updated' } },
  { autoInvalidate: true }
);
// ✅ 精准失效成功

// ✅ 关联查询
await collection('orders').find(
  { userId: userId.toString() },
  { cache: 5000 }
);

await collection('orders').updateMany(
  { userId: userId.toString() },
  { $set: { status: 'shipped' } },
  { autoInvalidate: true }
);
// ✅ 精准失效成功
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
const stats = msq.getCache().getStats();

console.log('缓存统计:', {
  entries: stats.entries,     // 当前缓存条目数
  hits: stats.hits,           // 缓存命中次数
  misses: stats.misses,       // 缓存未命中次数
  sets: stats.sets,           // 缓存设置次数
  deletes: stats.deletes,     // 缓存删除次数
  evictions: stats.evictions, // LRU 淘汰次数
  hitRate: stats.hitRate      // 命中率（0~1）
});

// 输出示例:
// {
//   entries: 2,
//   hits: 1,
//   misses: 2,
//   sets: 2,
//   deletes: 0,
//   evictions: 0,
//   hitRate: 0.3333
// }
```

### 统计指标说明

| 指标 | 说明 | 优化目标 |
|------|------|---------|
| **entries** | 当前缓存条目数 | 接近 maxEntries 表示利用率高 |
| **hits** | 缓存命中次数 | 越高越好 |
| **misses** | 缓存未命中次数 | 越低越好 |
| **sets** | 缓存设置次数 | 正常波动 |
| **deletes** | 缓存删除次数（写操作触发） | 正常波动 |
| **evictions** | LRU 淘汰次数 | 频繁淘汰说明 maxEntries 太小 |
| **hitRate** | 命中率（hits / (hits + misses)，0~1） | 目标 > 0.8 |

### 监控与告警

```javascript
const cache = msq.getCache();
const CACHE_MAX_ENTRIES = 100000;

// 定期监控缓存性能
setInterval(() => {
  const stats = cache.getStats();
  
  // 命中率过低告警
  if (stats.hitRate < 0.5) {
    console.warn('⚠️ 缓存命中率过低:', stats.hitRate);
    console.warn('建议：增加 TTL 或 maxEntries');
  }
  
  // 频繁淘汰告警
  if (stats.evictions > 1000) {
    console.warn('⚠️ 缓存频繁淘汰:', stats.evictions);
    console.warn('建议：增加 maxEntries');
  }
  
  // 缓存利用率低告警
  if (stats.entries < CACHE_MAX_ENTRIES * 0.1) {
    console.warn('⚠️ 缓存利用率过低:', `${stats.entries}/${CACHE_MAX_ENTRIES}`);
    console.warn('建议：减少 maxEntries 或增加缓存使用');
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

## 最佳实践（缓存策略文档）

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

### 2. 合理设置 maxEntries

```javascript
// 低流量场景：较小的 maxEntries
const msqLow = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxEntries: 1000 }    // 1000 条足够
});

// 中等流量场景：标准 maxEntries
const msqMedium = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxEntries: 100000 }  // 默认 10 万条
});

// 高流量场景：较大的 maxEntries
const msqHigh = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxEntries: 500000 }  // 50 万条
});
```

### 3. 监控缓存健康度

```javascript
// 健康检查函数
function checkCacheHealth(msq) {
  const stats = msq.getCache().getStats();
  const hitRate = stats.hitRate;
  const evictionRate = stats.evictions / (stats.sets || 1);
  
  return {
    healthy: hitRate > 0.7 && evictionRate < 0.1,
    hitRate,
    evictionRate,
    recommendations: [
      hitRate < 0.7 && '命中率过低，建议增加 TTL',
      evictionRate > 0.1 && '淘汰频繁，建议增加 maxEntries',
      stats.entries < 100000 * 0.1 && '利用率低，建议减少 maxEntries'
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
  
  const stats = msq.getCache().getStats();
  console.log(`✅ 预热完成，已缓存 ${stats.entries} 条查询`);
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
```text
内存占用 ≈ 缓存条目数 × 平均结果大小

示例:
- 10000 条缓存
- 每条结果平均 1KB
- 总内存占用 ≈ 10000 × 1KB = 10MB
```

### Q: 如何选择合适的 maxEntries？

**A**: 根据服务器内存和查询热点数据量选择：

```javascript
// 公式
// maxEntries = 可用内存 / 平均结果大小

// 示例 1：服务器有 1GB 可用内存，平均结果 1KB
// maxEntries ≈ 1GB / 1KB = 1000000 条

// 示例 2：服务器有 100MB 可用内存，平均结果 500 字节
// maxEntries ≈ 100MB / 500B = 200000 条
```

**建议**：
- 从默认值 100000 开始
- 监控淘汰率（evictionRate）
- 如果 evictionRate > 10%，增加 maxEntries

### Q: 如何手动清理缓存？

**A**: monSQLize 已支持写操作；但在以下场景里仍然建议手动清理缓存：

```javascript
const { collection } = await msq.connect();

// 场景 1：外部工具修改了数据（如 MongoDB Shell）
// 需要手动清除缓存
await collection('products').invalidate();
console.log('✅ products 集合缓存已清除');

// 场景 2：定时刷新缓存
setInterval(async () => {
  await collection('products').invalidate();
  console.log('✅ 缓存已刷新');
}, 5 * 60 * 1000);  // 每 5 分钟刷新一次

// 场景 3：批量清除多个集合
const collections = ['products', 'users', 'orders'];
for (const name of collections) {
  await collection(name).invalidate();
  console.log(`✅ ${name} 缓存已清除`);
}
```

**注意**：
- 当使用外部工具修改数据后，仍需手动调用 `invalidate()` 清理缓存
- 对于通过 monSQLize 发起的写操作，可结合 `autoInvalidate` 使用自动失效
- 若你的缓存策略跨进程/跨节点，建议同时结合分布式失效广播

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

## 缓存失效 API

### invalidate()

手动清除指定集合的所有缓存。适用于需要立即刷新缓存的场景。

#### 方法签名

```javascript
await collection('collectionName').invalidate()
```

#### 参数说明

无参数。清除当前绑定集合的所有查询缓存。

#### 返回值

返回 `Promise<void>`。

---

### 使用场景

#### 1. 外部工具修改数据后刷新缓存

```javascript
const { collection } = await msq.connect();

// 场景：使用 MongoDB Shell、Compass 或其他工具修改了数据
// 需要手动清除 monSQLize 的缓存

// 清除 products 集合的缓存
await collection('products').invalidate();

console.log('✅ 缓存已清除，下次查询将获取最新数据');
```

---

#### 2. 定时刷新缓存

```javascript
const { collection } = await msq.connect();

// 每 5 分钟刷新一次 products 缓存
setInterval(async () => {
  await collection('products').invalidate();
  console.log('✅ products 缓存已刷新');
}, 5 * 60 * 1000);
```

---

#### 3. 多集合缓存清除

```javascript
const { collection } = await msq.connect();

// 清除多个集合的缓存
async function clearAllCache() {
  const collections = ['products', 'users', 'orders', 'configs'];
  
  for (const name of collections) {
    await collection(name).invalidate();
    console.log(`✅ ${name} 缓存已清除`);
  }
}

await clearAllCache();
```

---

### 使用说明

**重要提示**：monSQLize 当前版本已经支持 `insertOne` / `updateOne` / `deleteOne` 等写操作；通过 monSQLize 写入时，相关缓存会按当前失效策略处理。`invalidate()` 仍然用于以下场景：

1. **外部写入后的显式清理**：
   - 使用 MongoDB Shell、Compass 或其他应用直接修改数据后
   - 旁路批量导入、迁移脚本或手工修复数据后
2. **主动刷新策略**：
   - 定时刷新热点集合缓存
   - 临时强制清理某个集合的查询缓存
3. **自定义缓存边界**：
   - 使用自定义 cache adapter 或业务侧额外缓存时，需要自行决定清理范围

**当前最佳实践**：
- 业务写入优先通过 monSQLize 执行，避免绕过缓存失效链路
- 外部工具或旁路脚本修改数据后，立即调用 `invalidate()`
- 定期监控缓存命中率，决定是否需要定时刷新
- 避免过度使用，仅在必要时清除缓存

---

### 最佳实践（缓存失效 API）

#### 1. 避免过度使用

```javascript
// ❌ 不推荐：每次查询前都清除缓存
await collection('products').invalidate();
const products = await collection('products').find({
  query: {},
  cache: 60000
});

// ✅ 推荐：只在必要时清除缓存
// 只有在外部修改数据或特殊需求时才手动清除
```

---

#### 2. 结合缓存监控

```javascript
const cache = msq.getCache();

// 清除缓存前记录统计
const beforeStats = cache.getStats();
console.log('清除前缓存项:', beforeStats.size);

// 清除缓存
await collection('products').invalidate();

// 清除后记录统计
const afterStats = cache.getStats();
console.log('清除后缓存项:', afterStats.size);
console.log('清除数量:', beforeStats.size - afterStats.size);
```

---

#### 3. 批量清除时使用并行

```javascript
// ✅ 并行清除（更快）
const collections = ['products', 'users', 'orders'];

await Promise.all(
  collections.map(name => collection(name).invalidate())
);

console.log('✅ 所有缓存已清除');
```

---

#### 4. 定时刷新的错误处理

```javascript
// 定时刷新缓存，带错误处理
setInterval(async () => {
  try {
    await collection('products').invalidate();
    console.log('✅ products 缓存已刷新');
  } catch (error) {
    console.error('❌ 缓存刷新失败:', error.message);
  }
}, 5 * 60 * 1000);
```

---

### 注意事项

1. **清除范围**：`invalidate()` 只清除指定集合的查询缓存，不影响其他集合
2. **性能影响**：清除缓存后，下次查询需要访问数据库，会有性能损耗
3. **不清除 Bookmarks**：`invalidate()` 不清除 findPage 的 Bookmark 缓存，需要使用 `clearBookmarks()`
4. **旁路写入限制**：通过外部工具或其他服务绕过 monSQLize 写入时，必须手动调用 `invalidate()` 或执行等效的业务清理动作

---

### 相关方法

- **`clearBookmarks(collectionName?)`** - 清除 findPage 的 Bookmark 缓存（参见 [Bookmarks 文档](./bookmarks.md)）
- **`getCache()`** - 获取缓存实例，可调用 `clear()` 清除所有缓存（参见 [工具方法文档](./utilities.md)）

---

## 参考资料

- [LRU 缓存算法](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))
- [Redis 缓存策略](https://redis.io/topics/lru-cache)
- [HTTP 缓存控制](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [monSQLize README](../README.md)
- [findPage 文档](./findPage.md)
- [Bookmarks 文档](./bookmarks.md)
- [工具方法文档](./utilities.md)
