# watch 方法 API 文档

> **版本**: v1.1.0  
> **状态**: ✅ 已实现

---

## 概述

`watch()` 方法提供 MongoDB Change Streams 的封装，支持实时监听集合的数据变更，并自动处理重连、缓存失效等复杂场景。

---

## 基本用法

```javascript
const MonSQLize = require('monsqlize');
const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' }
});

await db.connect();
const collection = db.dbInstance.collection('users');

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

**返回值**: `ChangeStreamWrapper` 实例

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

### monSQLize 扩展选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `autoReconnect` | boolean | `true` | 自动重连 |
| `reconnectInterval` | number | `1000` | 初始重连间隔（毫秒） |
| `maxReconnectDelay` | number | `60000` | 最大重连延迟（毫秒） |
| `autoInvalidateCache` | boolean | `true` | 自动失效缓存 |

---

## ChangeStreamWrapper 方法

### watcher.on(event, handler)

监听事件。

**事件列表**:
- `'change'`: 数据变更
- `'error'`: 持久性错误（瞬态错误已自动重试）
- `'reconnect'`: 重连通知
- `'resume'`: 恢复成功
- `'close'`: 关闭
- `'fatal'`: 致命错误（无法恢复）

### watcher.once(event, handler)

监听事件（一次性）。

### watcher.off(event, handler)

移除事件监听。

### watcher.close()

关闭监听。

**返回值**: `Promise<void>`

### watcher.isClosed()

检查是否已关闭。

**返回值**: `boolean`

### watcher.getResumeToken()

获取当前 resumeToken。

**返回值**: `Object|null`

### watcher.getStats()

获取统计信息。

**返回值**: `Object`
```javascript
{
  totalChanges: number,        // 总变更数
  reconnectAttempts: number,   // 重连次数
  lastReconnectTime: string,   // 最后重连时间
  uptime: number,              // 运行时长（毫秒）
  isActive: boolean,           // 是否活跃
  cacheInvalidations: number,  // 缓存失效次数
  errors: number               // 错误次数
}
```

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
const watcher = collection.watch();

watcher.on('error', (error) => {
  // 持久性错误（已自动清除 token，重新开始）
  console.error('需要注意:', error);
});

watcher.on('fatal', (error) => {
  // 致命错误（无法恢复，需要人工介入）
  console.error('致命错误:', error);
  // 需要通知运维
});
```

### 示例 4: 统计监控

```javascript
const watcher = collection.watch();

setInterval(() => {
  const stats = watcher.getStats();
  console.log('统计信息:', stats);
  
  if (stats.reconnectAttempts > 10) {
    console.warn('重连次数过多，可能网络有问题');
  }
}, 60000);
```

### 示例 5: 优雅关闭

```javascript
const watcher = collection.watch();

// 监听 SIGTERM
process.on('SIGTERM', async () => {
  console.log('正在关闭 watcher...');
  await watcher.close();
  console.log('watcher 已关闭');
  process.exit(0);
});
```

---

## 自动缓存失效

当 `autoInvalidateCache: true` (默认) 时，watch 会自动失效相关缓存：

| 操作类型 | 失效的缓存 |
|---------|----------|
| `insert` | `find`, `findPage`, `count`, `findAndCount` |
| `update` | `findOne`, `findOneById` (匹配 _id), `find`, `findPage`, `findAndCount` |
| `replace` | `findOne`, `findOneById` (匹配 _id), `find`, `findPage`, `findAndCount` |
| `delete` | `findOne`, `findOneById` (匹配 _id), `find`, `findPage`, `count`, `findAndCount` |

**跨实例同步**: 
- 如果配置了 `distributed.enabled: true`，缓存失效会自动广播到其他实例
- 其他实例收到通知后自动失效本地缓存
- 无需手动实现跨实例同步

---

## 注意事项

### 1. MongoDB 版本要求

Change Streams 需要 MongoDB 4.0+ 并且是副本集或分片集群环境。

**单节点环境会报错**:
```
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
- 缓存失效是异步的，不阻塞主流程
- 跨实例广播延迟 < 10ms

### 3. resumeToken 过期

MongoDB oplog 有大小限制，resumeToken 可能过期（默认几小时）。

**monSQLize 自动处理**:
- 检测到过期错误
- 自动清除过期 token
- 从当前时间重新开始
- 触发 `error` 事件通知用户

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

### 问题 2: 频繁重连

**原因**: 网络不稳定或 MongoDB 负载过高

**排查**:
```javascript
watcher.on('reconnect', (info) => {
  console.log('重连:', info);
  // 检查网络和 MongoDB 状态
});
```

### 问题 3: 缓存未失效

**检查**:
```javascript
// 确认配置
const watcher = collection.watch([], {
  autoInvalidateCache: true  // 确保是 true
});

// 监听失效事件（调试用）
watcher.on('change', async (change) => {
  console.log('变更:', change.operationType);
  // 检查缓存是否失效
  const cache = collection.cache;
  const stats = cache.getStats();
  console.log('缓存统计:', stats);
});
```

---

## watch 事件 vs 全局事件

### 区别说明

monSQLize 有两套事件系统：

**1. 全局事件（msq 对象）**:
- 监听对象：应用的查询操作
- 事件类型：`slow-query`, `query`, `connected`, `error`, `closed`
- 适用场景：性能监控、运维告警
- 文档：[事件系统](./events.md)

**2. watch 事件（watcher 对象）**:
- 监听对象：MongoDB 数据变更
- 事件类型：`change`, `error`, `reconnect`, `resume`, `close`, `fatal`
- 适用场景：实时数据同步、缓存失效
- 文档：本文档

### 使用场景对比

| 需求 | 使用 |
|------|------|
| 监控应用查询性能 | `msq.on('slow-query', ...)` |
| 调试所有查询操作 | `msq.on('query', ...)` |
| 监听数据变更 | `watcher.on('change', ...)` |
| 自动失效缓存 | `watcher.on('change', ...)` + autoInvalidateCache |
| 跨系统数据同步 | `watcher.on('change', ...)` |

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
const watcher = collection.watch();

watcher.on('change', (change) => {
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

