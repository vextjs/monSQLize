# 事件系统文档

## 📑 目录

- [概述](#概述)
- [核心特性](#核心特性)
- [事件类型](#事件类型)
- [事件监听方法](#事件监听方法)
- [使用场景](#使用场景)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [相关文档](#相关文档)
- [参考资料](#参考资料)

---

## 概述

monSQLize 提供了完善的事件系统，允许你监听数据库连接状态、查询性能和错误信息。事件系统基于 Node.js 的 `EventEmitter`，支持标准的事件监听方式。

## 核心特性

- ✅ **连接事件**：监听连接成功和关闭
- ✅ **错误事件**：监听连接和查询错误
- ✅ **慢查询事件**：监听超过阈值的慢查询
- ✅ **查询事件**：监听所有查询操作（调试用）
- ✅ **标准 EventEmitter**：支持 `on/once/off` 等标准方法

---

## 事件类型

### connected

数据库连接成功时触发。

**事件数据**：
```javascript
{
  iid: String,           // 实例 ID (8 位随机字符串)
  uri: String,           // 连接 URI（已脱敏）
  databaseName: String   // 数据库名
}
```

**使用示例**：
```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

// 监听连接成功事件
msq.on('connected', (data) => {
  console.log('✅ 数据库连接成功');
  console.log('实例 ID:', data.iid);
  console.log('连接 URI:', data.uri);
  console.log('数据库名:', data.databaseName);
});

// 建立连接
await msq.connect();
```

**输出示例**：
```
✅ 数据库连接成功
实例 ID: a1b2c3d4
连接 URI: mongodb://[REDACTED]@localhost:27017
数据库名: shop
```

---

### closed

数据库连接关闭时触发。

**事件数据**：
```javascript
{
  iid: String            // 实例 ID
}
```

**使用示例**：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

// 监听连接关闭事件
msq.on('closed', (data) => {
  console.log('🛑 数据库连接已关闭');
  console.log('实例 ID:', data.iid);
});

// 建立连接
await msq.connect();

// 关闭连接
await msq.close();
```

**输出示例**：
```
🛑 数据库连接已关闭
实例 ID: a1b2c3d4
```

---

### error

连接或查询错误时触发。

**事件数据**：
```javascript
{
  iid: String,           // 实例 ID
  error: Error,          // 错误对象
  context: String        // 错误上下文（'connect' 或 'query'）
}
```

**使用示例**：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://invalid-host:27017' }
});

// 监听错误事件
msq.on('error', (data) => {
  console.error('❌ 错误发生');
  console.error('实例 ID:', data.iid);
  console.error('错误上下文:', data.context);
  console.error('错误信息:', data.error.message);
});

// 尝试连接（会失败）
try {
  await msq.connect();
} catch (err) {
  console.log('连接失败（已捕获）');
}
```

**输出示例**：
```
❌ 错误发生
实例 ID: a1b2c3d4
错误上下文: connect
错误信息: connect ECONNREFUSED 127.0.0.1:27017
连接失败（已捕获）
```

---

### slow-query

查询执行时间超过阈值时触发。

**事件数据**：
```javascript
{
  iid: String,              // 实例 ID
  operation: String,        // 操作类型（'find' / 'findOne' / 'aggregate' / 'distinct' / 'count' / 'estimatedDocumentCount' / 'countDocuments'）
  collectionName: String,   // 集合名
  query: Object,            // 查询条件
  duration: Number,         // 查询耗时（毫秒）
  threshold: Number,        // 慢查询阈值（毫秒）
  cacheHit: Boolean,        // 是否缓存命中
  timestamp: Date           // 时间戳
}
```

**配置慢查询阈值**：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100       // 超过 100ms 触发 slow-query 事件
});
```

**使用示例**：
```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100       // 慢查询阈值 100ms
});

// 监听慢查询事件
msq.on('slow-query', (data) => {
  console.warn('🐢 慢查询警告');
  console.warn('操作:', data.operation);
  console.warn('集合:', data.collectionName);
  console.warn('查询:', JSON.stringify(data.query));
  console.warn('耗时:', data.duration, 'ms');
  console.warn('阈值:', data.threshold, 'ms');
  console.warn('缓存命中:', data.cacheHit);
  console.warn('时间:', data.timestamp);
});

const { collection } = await msq.connect();

// 执行慢查询（假设超过 100ms）
const products = await collection('products').find({
  query: { category: 'electronics' },
  maxTimeMS: 3000
});
```

**输出示例**：
```
🐢 慢查询警告
操作: find
集合: products
查询: {"category":"electronics"}
耗时: 235 ms
阈值: 100 ms
缓存命中: false
时间: 2025-11-06T10:30:45.123Z
```

---

### query

每次查询操作时触发（包括缓存命中）。

**事件数据**：
```javascript
{
  iid: String,              // 实例 ID
  operation: String,        // 操作类型
  collectionName: String,   // 集合名
  query: Object,            // 查询条件
  duration: Number,         // 查询耗时（毫秒）
  cacheHit: Boolean,        // 是否缓存命中
  timestamp: Date           // 时间戳
}
```

**使用示例**：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

// 监听所有查询事件（调试用）
msq.on('query', (data) => {
  console.log('[Query]', {
    operation: data.operation,
    collection: data.collectionName,
    duration: `${data.duration}ms`,
    cacheHit: data.cacheHit,
    query: data.query
  });
});

const { collection } = await msq.connect();

// 第一次查询（缓存 miss）
await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,
  maxTimeMS: 3000
});

// 第二次查询（缓存 hit）
await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,
  maxTimeMS: 3000
});
```

**输出示例**：
```
[Query] {
  operation: 'find',
  collection: 'products',
  duration: '45ms',
  cacheHit: false,
  query: { category: 'electronics' }
}
[Query] {
  operation: 'find',
  collection: 'products',
  duration: '0.5ms',
  cacheHit: true,
  query: { category: 'electronics' }
}
```

---

## 事件监听方法

### on()

注册持久事件监听器（每次触发都会执行）。

```javascript
msq.on('slow-query', (data) => {
  console.warn('慢查询:', data);
});
```

### once()

注册一次性事件监听器（只执行一次后自动移除）。

```javascript
msq.once('connected', (data) => {
  console.log('首次连接成功:', data);
});
```

### off()

移除事件监听器。

```javascript
const handler = (data) => {
  console.log('连接成功:', data);
};

msq.on('connected', handler);

// 移除监听器
msq.off('connected', handler);
```

### removeAllListeners()

移除所有监听器（或指定事件的所有监听器）。

```javascript
// 移除所有事件的所有监听器
msq.removeAllListeners();

// 移除指定事件的所有监听器
msq.removeAllListeners('slow-query');
```

---

## 使用场景

### 1. 日志记录

```javascript
const MonSQLize = require('monsqlize');
const logger = require('./logger');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: process.env.MONGODB_URI },
  slowQueryMs: 100
});

// 连接日志
msq.on('connected', (data) => {
  logger.info('数据库连接成功', {
    iid: data.iid,
    database: data.databaseName
  });
});

// 错误日志
msq.on('error', (data) => {
  logger.error('数据库错误', {
    iid: data.iid,
    context: data.context,
    error: data.error.message
  });
});

// 慢查询日志
msq.on('slow-query', (data) => {
  logger.warn('慢查询警告', {
    operation: data.operation,
    collection: data.collectionName,
    duration: data.duration,
    query: data.query
  });
});
```

---

### 2. 性能监控

```javascript
// 统计查询性能
const queryStats = {
  total: 0,
  slow: 0,
  cacheHits: 0,
  totalDuration: 0
};

msq.on('query', (data) => {
  queryStats.total++;
  queryStats.totalDuration += data.duration;
  
  if (data.cacheHit) {
    queryStats.cacheHits++;
  }
});

msq.on('slow-query', () => {
  queryStats.slow++;
});

// 定期输出统计
setInterval(() => {
  console.log('查询统计:', {
    总查询次数: queryStats.total,
    慢查询次数: queryStats.slow,
    慢查询比例: `${(queryStats.slow / queryStats.total * 100).toFixed(2)}%`,
    缓存命中率: `${(queryStats.cacheHits / queryStats.total * 100).toFixed(2)}%`,
    平均耗时: `${(queryStats.totalDuration / queryStats.total).toFixed(2)}ms`
  });
}, 60000);  // 每分钟输出一次
```

---

### 3. 告警系统

```javascript
// 慢查询告警
let slowQueryCount = 0;

msq.on('slow-query', (data) => {
  slowQueryCount++;
  
  // 1 分钟内超过 10 次慢查询，发送告警
  if (slowQueryCount > 10) {
    sendAlert({
      type: '慢查询告警',
      message: `1 分钟内出现 ${slowQueryCount} 次慢查询`,
      details: {
        operation: data.operation,
        collection: data.collectionName,
        duration: data.duration
      }
    });
  }
});

// 每分钟重置计数
setInterval(() => {
  slowQueryCount = 0;
}, 60000);

// 连接错误告警
msq.on('error', (data) => {
  if (data.context === 'connect') {
    sendAlert({
      type: '数据库连接失败',
      message: data.error.message,
      severity: 'critical'
    });
  }
});
```

---

### 4. 调试模式

```javascript
// 开发环境启用详细日志
if (process.env.NODE_ENV === 'development') {
  msq.on('query', (data) => {
    console.log(`[${data.operation}] ${data.collectionName}`, {
      query: data.query,
      duration: `${data.duration}ms`,
      cacheHit: data.cacheHit ? '✅ HIT' : '❌ MISS'
    });
  });
  
  msq.on('slow-query', (data) => {
    console.warn(`⚠️ [SLOW] ${data.operation} ${data.collectionName}`, {
      duration: `${data.duration}ms`,
      threshold: `${data.threshold}ms`,
      query: data.query
    });
  });
}
```

---

### 5. 连接健康检查

```javascript
let isConnected = false;

msq.on('connected', () => {
  isConnected = true;
  console.log('✅ 数据库连接正常');
});

msq.on('closed', () => {
  isConnected = false;
  console.warn('⚠️ 数据库连接已关闭');
});

msq.on('error', (data) => {
  if (data.context === 'connect') {
    isConnected = false;
    console.error('❌ 数据库连接失败');
  }
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({
    status: isConnected ? 'healthy' : 'unhealthy',
    database: 'mongodb'
  });
});
```

---

## 最佳实践

### 1. 生产环境只监听必要事件

```javascript
// ❌ 不推荐：监听所有 query 事件（性能开销大）
msq.on('query', (data) => {
  console.log('Query:', data);
});

// ✅ 推荐：只监听 slow-query 和 error
msq.on('slow-query', (data) => {
  logger.warn('慢查询', data);
});

msq.on('error', (data) => {
  logger.error('错误', data);
});
```

### 2. 使用结构化日志

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'db-slow-queries.log' })
  ]
});

msq.on('slow-query', (data) => {
  logger.warn({
    event: 'slow-query',
    iid: data.iid,
    operation: data.operation,
    collection: data.collectionName,
    duration: data.duration,
    query: data.query,
    timestamp: data.timestamp
  });
});
```

### 3. 避免阻塞事件处理

```javascript
// ❌ 不推荐：同步阻塞操作
msq.on('slow-query', (data) => {
  // 同步写文件（会阻塞）
  fs.writeFileSync('slow-queries.log', JSON.stringify(data) + '\n', { flag: 'a' });
});

// ✅ 推荐：异步非阻塞操作
msq.on('slow-query', async (data) => {
  // 异步写文件（不阻塞）
  await fs.promises.appendFile('slow-queries.log', JSON.stringify(data) + '\n');
});
```

### 4. 清理监听器

```javascript
class DatabaseService {
  constructor() {
    this.msq = new MonSQLize({ /* ... */ });
    
    // 保存监听器引用
    this.slowQueryHandler = (data) => {
      console.warn('慢查询:', data);
    };
    
    this.msq.on('slow-query', this.slowQueryHandler);
  }
  
  async stop() {
    // 清理监听器
    this.msq.off('slow-query', this.slowQueryHandler);
    
    // 关闭连接
    await this.msq.close();
  }
}
```

### 5. 分级告警

```javascript
msq.on('slow-query', (data) => {
  if (data.duration > 1000) {
    // 超过 1 秒：严重告警
    sendAlert({ level: 'critical', message: `查询超时: ${data.duration}ms` });
  } else if (data.duration > 500) {
    // 超过 500ms：警告
    sendAlert({ level: 'warning', message: `慢查询: ${data.duration}ms` });
  } else {
    // 100-500ms：记录日志
    logger.info({ event: 'slow-query', duration: data.duration });
  }
});
```

---

## 常见问题

### Q: query 事件会影响性能吗？

**A**: 是的，`query` 事件会在每次查询时触发，包括缓存命中。如果监听器执行复杂操作，会影响性能。

**建议**：
- 生产环境避免监听 `query` 事件
- 仅在开发/调试环境启用
- 如需监听，确保处理逻辑非常轻量

### Q: slow-query 事件何时触发？

**A**: 当查询耗时超过 `slowQueryMs` 阈值时触发。

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100       // 超过 100ms 触发 slow-query
});
```

**注意**：缓存命中的查询通常不会触发 slow-query（耗时极短）。

### Q: error 事件和 try-catch 有什么区别？

**A**: 两者可以同时使用，互不冲突：

```javascript
msq.on('error', (data) => {
  // 全局错误处理（日志/告警）
  logger.error('数据库错误', data);
});

try {
  await msq.connect();
} catch (err) {
  // 局部错误处理（业务逻辑）
  console.error('连接失败，使用降级方案');
}
```

### Q: 如何在单元测试中使用事件？

**A**: 使用 `once()` 或 Promise 包装：

```javascript
const { expect } = require('chai');

it('应该触发 slow-query 事件', (done) => {
  msq.once('slow-query', (data) => {
    expect(data.operation).to.equal('find');
    expect(data.duration).to.be.above(100);
    done();
  });
  
  // 执行慢查询
  collection('test').find({ query: {}, maxTimeMS: 3000 });
});

// 或使用 Promise
it('应该触发 connected 事件', async () => {
  const promise = new Promise((resolve) => {
    msq.once('connected', resolve);
  });
  
  await msq.connect();
  await promise;
});
```

### Q: 多个实例的事件会相互干扰吗？

**A**: 不会。每个 MonSQLize 实例有独立的事件系统。

```javascript
const msq1 = new MonSQLize({ databaseName: 'db1', /* ... */ });
const msq2 = new MonSQLize({ databaseName: 'db2', /* ... */ });

// msq1 的事件不会触发 msq2 的监听器
msq1.on('slow-query', () => console.log('msq1 慢查询'));
msq2.on('slow-query', () => console.log('msq2 慢查询'));
```

---

## 相关文档

### watch 事件

如果你需要监听 MongoDB 的数据变更（而非应用的查询操作），请参考：

- [watch 方法文档](./watch.md) - MongoDB Change Streams

**区别**:
- 全局事件（本文档）：监听应用的查询操作
- watch 事件：监听 MongoDB 的数据变更

**示例**:
```javascript
// 全局事件：监听应用的慢查询
msq.on('slow-query', (meta) => {
  console.warn('应用执行了慢查询');
});

// watch 事件：监听 MongoDB 的数据变更
const watcher = collection.watch();
watcher.on('change', (change) => {
  console.log('MongoDB 数据变更');
});
```

---

## 参考资料

- [Node.js EventEmitter 文档](https://nodejs.org/api/events.html)
- [日志最佳实践](https://www.npmjs.com/package/winston)
- [告警系统设计](https://prometheus.io/docs/alerting/latest/overview/)
- [monSQLize README](../README.md)
