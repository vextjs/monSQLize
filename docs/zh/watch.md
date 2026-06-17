# watch 方法 API 文档

> **版本**: v1.1.0  
> **状态**: ✅ 已实现

---

## 📑 目录

- [概述](#概述)
- [基本用法](#基本用法)
- [API 参考](#api-参考)
- [配置选项](#配置选项)
- [ChangeStream 原生方法](#changestream-原生方法)
- [使用示例](#使用示例)
- [自动缓存失效](#自动缓存失效)
- [注意事项](#注意事项)
- [故障排查](#故障排查)
- [watch 事件 vs 全局事件](#watch-事件-vs-全局事件)
- [相关文档](#相关文档)
- [版本历史](#版本历史)

---

## 概述

`watch()` 方法直接返回 MongoDB Change Streams 的原生 `ChangeStream<T>` 对象，支持实时监听集合的数据变更。如需自动断点续传、多目标同步或缓存失效，请结合 [`ChangeStreamSyncManager`](./sync-backup.md) 使用。

---

## 基本用法

```javascript
import MonSQLize from 'monsqlize';
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' }
});

await msq.connect();
const collection = msq.collection('users');

// 监听所有变更
const watcher = collection.watch();

watcher.on('change', (change) => {
  console.log('数据变更:', change.operationType);
  console.log('文档:', change.fullDocument);
});
```

---

## API 参考

### collection.watch([pipeline], [options])

监听集合的数据变更。

**参数**:
- `pipeline` (Array, 可选): 聚合管道，用于过滤事件
- `options` (Object, 可选): 配置选项

**返回值**: `ChangeStream<TSchema>` — MongoDB 驱动原生 ChangeStream 对象

> ⚠️ `collection.watch()` 直接返回 MongoDB 驱动的 `ChangeStream`，没有额外封装。
> 请参考 [MongoDB ChangeStream 官方文档](https://www.mongodb.com/docs/manual/changeStreams/)。

---

## 配置选项

### MongoDB 原生选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fullDocument` | string | `'updateLookup'` | 返回完整文档 (`'default'` \| `'updateLookup'` \| `'whenAvailable'` \| `'required'`) |
| `fullDocumentBeforeChange` | string | - | 返回修改前的文档 (`'off'` \| `'whenAvailable'` \| `'required'`) |
| `resumeAfter` | Object | - | 从指定 resumeToken 继续 |
| `startAfter` | Object | - | 从指定 resumeToken 开始（事务友好） |
| `startAtOperationTime` | Timestamp | - | 从指定时间开始 |
| `maxAwaitTimeMS` | number | - | 最大等待时间（毫秒） |
| `batchSize` | number | - | 批处理大小 |

---

## ChangeStream 原生方法

`watch()` 返回的是 MongoDB 驱动的 `ChangeStream<T>` 对象，支持以下原生 API：

### cs.on(event, handler)

监听事件（EventEmitter 接口）。

**事件列表**:
- `'change'`: 数据变更
- `'error'`: 错误
- `'close'`: 关闭
- `'end'`: 流结束

### cs.once(event, handler)

监听事件（一次性）。

### cs.close()

关闭 ChangeStream。

**返回值**: `Promise<void>`

### cs.closed

只读属性，检查 ChangeStream 是否已关闭。

**类型**: `boolean`

### cs.resumeToken

只读属性，获取最新 resumeToken（用于断点续传）。

**类型**: `unknown`

### cs.next()

显式获取下一个变更事件（迭代器模式）。

**返回值**: `Promise<ChangeStreamDocument<T>>`

> 💡 如需 Resume Token 持久化、多目标同步和便于监控重启的生命周期统计，请使用 [`ChangeStreamSyncManager`](./sync-backup.md)。

---

## 使用示例

### 示例 1: 基础监听

```javascript
const watcher = collection.watch();

watcher.on('change', (change) => {
  console.log('操作类型:', change.operationType);
  console.log('文档ID:', change.documentKey._id);
});
```

### 示例 2: 过滤事件

```javascript
// 只监听 insert 和 update
const watcher = collection.watch([
  { $match: { operationType: { $in: ['insert', 'update'] } } }
]);

watcher.on('change', (change) => {
  console.log('新增或修改:', change.fullDocument);
});
```

### 示例 3: 错误处理

```javascript
const cs = collection.watch();

cs.on('error', (error) => {
  console.error('Change Stream 错误:', error);
});

cs.on('close', () => {
  console.log('Change Stream 已关闭');
});
```

### 示例 4: 统计监控（通过 ChangeStreamSyncManager）

> 如需内置统计（eventCount / syncedCount / errorCount），请使用 `ChangeStreamSyncManager`：

```javascript
import MonSQLize from 'monsqlize';

const syncManager = new MonSQLize.ChangeStreamSyncManager({ db, config: { ... } });
await syncManager.start();

setInterval(() => {
  const stats = syncManager.getStats();
  console.log('已同步事件:', stats.syncedCount, '错误:', stats.errorCount);
}, 60000);
```

### 示例 5: 优雅关闭

```javascript
const cs = collection.watch();

process.on('SIGTERM', async () => {
  console.log('正在关闭 watch...');
  await cs.close();
  console.log('watch 已关闭');
  process.exit(0);
});
```

---

## 缓存失效集成

> ⚠️ `collection.watch()` 本身**不提供**内置的缓存失效功能。如需将 watch 与缓存集成，有两种方案：

### 方案一：手动处理（推荐轻量场景）

```javascript
const cs = collection.watch();

cs.on('change', async (change) => {
  // 根据操作类型手动失效相应缓存键
  if (['insert', 'update', 'replace', 'delete'].includes(change.operationType)) {
    myCache.delete('user-list');
    myCache.delete(`user:${change.documentKey?._id}`);
  }
});
```

### 方案二：ChangeStreamSyncManager（推荐生产场景）

[`ChangeStreamSyncManager`](./sync-backup.md) 内置了断点续传、多目标同步和统计能力，可在 `apply` 回调中处理缓存：

```javascript
const syncManager = new MonSQLize.ChangeStreamSyncManager({
  db,
  config: {
    enabled: true,
    targets: [{
      name: 'cache-invalidation',
      apply: async (event) => {
        // 在 apply 中处理缓存失效
        myCache.delete('user-list');
      }
    }]
  }
});
await syncManager.start();
```

**跨实例同步**: 如需分布式缓存同步，请使用 [`DistributedCacheInvalidator`](./cache-and-function-cache.md)，它支持通过 Pub/Sub 广播失效信号到其他实例。

---

## 注意事项

### 1. MongoDB 版本要求

Change Streams 需要 MongoDB 4.0+ 并且是副本集或分片集群环境。

**单节点环境会报错**:
```text
Error: The $changeStream stage is only supported on replica sets
```

**解决方案**:

**开发/测试环境** - 使用 mongodb-memory-server:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { 
    useMemoryServer: true,
    memoryServerOptions: {
      instance: {
        replSet: 'rs0'  // 启用副本集模式
      }
    }
  }
});

await msq.connect();
const collection = msq.dbInstance.collection('users');

// ✅ 现在可以使用 watch
const watcher = collection.watch();
```

`useMemoryServer` 使用单节点 replica set，二进制缓存固定在 `.cache/mongodb-memory-server/binaries`，自动创建的临时 dbPath 固定在 `.cache/mongodb-memory-server/db` 并在关闭时清理。

**生产环境** - 使用副本集或分片集群:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: {
    uri: 'mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0'
  }
});
```

### 2. 性能影响

- watch 本身对性能影响很小（MongoDB 原生支持）
- ChangeStream 监听是异步的，不阻塞主流程

### 3. resumeToken 过期

MongoDB oplog 有大小限制，resumeToken 可能过期（默认几小时）。

**处理建议**:
- 监听 `error` 事件，检测 `ChangeStreamHistoryLost` 错误
- 关闭当前 ChangeStream 并重新调用 `collection.watch()`（不带 `resumeAfter`）
- 如需自动处理断点续传，请使用 [`ChangeStreamSyncManager`](./sync-backup.md)

### 4. 内存管理

长期运行的 watch 需要注意：
- 正确调用 `watcher.close()` 释放资源
- 监听 process 信号优雅关闭
- 不要创建过多 watcher（每个集合 1-2 个即可）

---

## 故障排查

### 问题 1: watch 立即关闭

**原因**: MongoDB 不是副本集环境

**解决**: 使用副本集或 `mongodb-memory-server`

### 问题 2: ChangeStream 意外关闭

**原因**: 网络不稳定或 MongoDB 负载过高，`ChangeStream` 会自动关闭并触发 `close` 事件。

**排查**:
```javascript
const cs = collection.watch();

cs.on('close', () => {
  console.warn('ChangeStream 已关闭，请检查网络和 MongoDB 状态');
  // 如需自动重连，可在此重新调用 collection.watch()
});

cs.on('error', (err) => {
  console.error('ChangeStream 错误:', err.message);
});
```

### 问题 3: 缓存集成

参见 [缓存失效集成](#缓存失效集成) 章节。

---

## watch 事件 vs 全局事件

### 区别说明

monSQLize 有两套事件系统：

**1. 全局事件（msq 对象）**:
- 监听对象：应用的查询操作
- 事件类型：`slow-query`, `query`, `connected`, `error`, `closed`
- 适用场景：性能监控、运维告警
- 文档：[事件系统](./events.md)

**2. watch 事件（ChangeStream 对象）**:
- 监听对象：MongoDB 数据变更
- 事件类型：`change`, `error`, `close`, `end`（MongoDB 原生事件）
- 适用场景：实时数据同步、缓存失效
- 文档：本文档

### 使用场景对比

| 需求 | 使用 |
|------|------|
| 监控应用查询性能 | `msq.on('slow-query', ...)` |
| 调试所有查询操作 | `msq.on('query', ...)` |
| 监听数据变更 | `cs.on('change', ...)` |
| 应用层缓存失效 | `cs.on('change', ...)` + 手动 cache.delete |
| 跨系统数据同步 | `cs.on('change', ...)` 或 `ChangeStreamSyncManager` |

### 示例：同时使用

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100
});

await msq.connect();

// ✅ 监听慢查询（运维）
msq.on('slow-query', (meta) => {
  console.warn('慢查询:', meta.operation, meta.duration + 'ms');
  // 发送告警
});

// ✅ 监听数据变更（业务）
const collection = msq.dbInstance.collection('products');
const cs = collection.watch();

cs.on('change', (change) => {
  console.log('数据变更:', change.operationType);
  // 缓存失效、业务通知
});
```

---

## 相关文档

- [MongoDB Change Streams 官方文档](https://www.mongodb.com/docs/manual/changeStreams/)
- [分布式部署指南](./distributed-deployment.md)
- [缓存系统](./cache.md)
- [事件系统](./events.md)

---

## 版本历史

- **v1.1.0** (2025-12): 首次发布 watch 功能

