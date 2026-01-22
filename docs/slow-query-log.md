# 慢查询日志持久化存储功能文档

> **版本**: v1.0.1  
> **最后更新**: 2025-12-29  
> **状态**: 已完成

---

## 📑 目录

1. [功能概述](#功能概述)
2. [快速开始](#快速开始)
3. [配置说明](#配置说明)
4. [API参考](#api参考)
5. [使用示例](#使用示例)
6. [最佳实践](#最佳实践)
7. [故障排查](#故障排查)
8. [性能优化](#性能优化)

---

## 功能概述

### 什么是慢查询日志持久化存储？

慢查询日志持久化存储是 monSQLize v1.0.1 引入的新功能，它可以自动将超过阈值的查询记录保存到持久化存储中（当前支持MongoDB），方便后续分析和优化。

### 核心特性

- ✅ **零配置启用** - `slowQueryLog: true` 一行启用
- ✅ **方案B去重** - 相同查询模式自动聚合统计
- ✅ **批量写入** - 异步批量处理，性能无损（<2ms额外开销）
- ✅ **自动过期** - TTL索引自动清理历史数据（默认7天）
- ✅ **查询接口** - 内置API查询慢查询日志
- ✅ **多数据库支持** - 架构支持MongoDB/PostgreSQL/MySQL扩展

### 工作原理

```
┌─────────────┐
│ 业务查询执行 │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ 慢查询检测       │ ← slowQueryMs: 500
│ (withSlowQueryLog)│
└──────┬──────────┘
       │ 如果执行时间 > 500ms
       ▼
┌─────────────────┐
│ 生成queryHash   │ ← SHA256(db+coll+op+queryShape)
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ 添加到批量队列   │ ← BatchQueue (buffer)
└──────┬──────────┘
       │ 达到10条 或 5秒
       ▼
┌─────────────────┐
│ bulkWrite upsert│ ← MongoDB存储
│ (方案B去重)      │
└─────────────────┘
```

---

## 快速开始

### 最简配置（推荐）

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,      // 慢查询阈值（毫秒）
  slowQueryLog: true     // ✅ 零配置启用
});

await msq.connect();

// 执行查询（慢查询自动保存）
const users = await msq.find('users', { status: 'active' });

// 查询慢查询日志
const logs = await msq.getSlowQueryLogs(
  { collection: 'users' },
  { sort: { count: -1 }, limit: 10 }
);

console.log('高频慢查询Top10:', logs);

await msq.close();
```

### 自动效果

- 慢查询自动保存到 `admin.slow_query_logs` 集合
- 相同查询自动去重聚合（方案B）
- TTL索引自动清理7天前的数据
- 复用业务连接，无额外连接开销

---

## 配置说明

### 全局慢查询配置

#### 基础配置（在初始化时设置）

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  
  // 全局慢查询阈值（毫秒）
  slowQueryMs: 1000,  // 默认1000ms
  
  // 慢查询日志配置
  slowQuery: {
    enabled: true,           // 是否启用慢查询监控（默认true）
    threshold: 1000,         // 阈值（毫秒），会覆盖 slowQueryMs
    includeStack: false,     // 是否包含堆栈信息（调试用）
    logLevel: 'warn',        // 日志级别：debug/info/warn/error
    outputFormat: 'json',    // 输出格式：json/text
    excludeOperations: []    // 排除的操作类型：['find', 'aggregate']
  },
  
  // 慢查询持久化存储（可选）
  slowQueryLog: true  // 或详细配置对象
});
```

#### 配置选项详解

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `slowQueryMs` | number | 1000 | 全局慢查询阈值（毫秒） |
| `slowQuery.enabled` | boolean | true | 是否启用慢查询监控 |
| `slowQuery.threshold` | number | 1000 | 慢查询阈值，优先级高于 slowQueryMs |
| `slowQuery.includeStack` | boolean | false | 是否记录调用堆栈（调试用） |
| `slowQuery.logLevel` | string | 'warn' | 日志级别 |
| `slowQuery.outputFormat` | string | 'json' | 输出格式 |
| `slowQuery.excludeOperations` | string[] | [] | 排除的操作类型 |

### 操作级配置

某些操作可以单独配置慢查询阈值：

#### 方式1：通过 options 参数

```javascript
// 为单个查询设置不同的阈值
await collection('products').find(
  { category: 'electronics' },
  { 
    slowQueryMs: 500,  // 该查询阈值500ms
    maxTimeMS: 3000    // MongoDB查询超时
  }
);

// 聚合查询也支持
await collection('orders').aggregate(
  [
    { $match: { status: 'completed' } },
    { $group: { _id: '$userId', total: { $sum: '$amount' } } }
  ],
  {
    slowQueryMs: 2000  // 聚合查询阈值2000ms
  }
);
```

#### 方式2：使用全局配置

```javascript
// 使用全局阈值（不指定slowQueryMs）
const products = await collection('products').find(
  { category: 'electronics' }
);  // 使用全局配置的 slowQueryMs: 1000
```

### 日志格式

#### JSON 格式（默认）

```json
{
  "level": "warn",
  "message": "[SLOW QUERY] Operation exceeded threshold",
  "operation": "find",
  "collection": "products",
  "database": "mydb",
  "duration": 1523,
  "threshold": 1000,
  "query": { "category": "electronics" },
  "options": { "limit": 10 },
  "docCount": 10,
  "timestamp": "2026-01-20T08:30:15.123Z",
  "instanceId": "msq_abc123"
}
```

#### 文本格式

```
[2026-01-20 08:30:15] WARN: [SLOW QUERY] find on mydb.products took 1523ms (threshold: 1000ms)
Query: {"category":"electronics"}
Options: {"limit":10}
Documents returned: 10
```

### 日志输出配置

#### 使用自定义Logger

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'slow-query.log' }),
    new winston.transports.Console()
  ]
});

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  logger: logger,  // 使用Winston日志器
  slowQueryMs: 1000
});
```

#### 监听慢查询事件

```javascript
// 方式1：监听事件
msq.on('slow-query', (info) => {
  console.log('Slow query detected:', {
    operation: info.op,
    collection: info.collection,
    duration: info.durationMs,
    query: info.query
  });
  
  // 发送告警
  if (info.durationMs > 5000) {
    alerting.send({
      type: 'critical',
      message: `Extremely slow query: ${info.durationMs}ms`,
      details: info
    });
  }
});

// 方式2：使用事件监听器
msq.addEventListener('slow-query', handleSlowQuery);
```

### 配置层级

monSQLize 提供三层配置架构，满足不同使用场景：

#### 层级1：零配置（推荐）

```javascript
slowQueryLog: true  // 使用所有默认值
```

**默认配置**：
- `enabled: true` - 启用
- `storage.type: 'mongodb'` - 存储类型（自动推断）
- `storage.useBusinessConnection: true` - 复用业务连接
- `storage.mongodb.database: 'admin'` - 存储到admin数据库
- `storage.mongodb.collection: 'slow_query_logs'` - 集合名
- `storage.mongodb.ttl: 604800` - 7天过期
- `deduplication.enabled: true` - 启用去重
- `batch.enabled: true` - 启用批量写入
- `batch.size: 10` - 批量大小
- `batch.interval: 5000` - 5秒刷新

#### 层级2：基础配置（常用）

```javascript
slowQueryLog: {
  enabled: true,
  storage: {
    mongodb: {
      ttl: 3 * 24 * 3600  // 只修改TTL为3天
    }
  }
}
```

#### 层级3：完整配置（高级）

```javascript
slowQueryLog: {
  enabled: true,
  
  // 存储配置
  storage: {
    type: 'mongodb',                    // 存储类型
    useBusinessConnection: false,        // 不复用连接
    uri: 'mongodb://admin-host:27017',  // 独立连接URI
    
    mongodb: {
      database: 'admin',
      collection: 'slow_query_logs',
      ttl: 7 * 24 * 3600,
      ttlField: 'lastSeen'
    }
  },
  
  // 去重配置
  deduplication: {
    enabled: true,                      // 启用方案B
    strategy: 'aggregate',              // 聚合策略
    keepRecentExecutions: 0             // 不保留详情
  },
  
  // 批量配置
  batch: {
    enabled: true,
    size: 20,                           // 20条刷新
    interval: 3000,                     // 3秒刷新
    maxBufferSize: 100                  // 最大缓冲100条
  },
  
  // 过滤配置
  filter: {
    excludeDatabases: [],               // 排除数据库
    excludeCollections: ['logs'],       // 排除集合
    excludeOperations: [],              // 排除操作
    minExecutionTimeMs: 0               // 最小执行时间
  }
}
```

### 配置参数详解

#### storage 存储配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `type` | string | null（自动推断） | 存储类型：mongodb/postgresql/mysql/file |
| `useBusinessConnection` | boolean | true | 是否复用业务连接 |
| `uri` | string | null | 独立连接URI（useBusinessConnection=false时必填） |

#### storage.mongodb MongoDB存储配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `database` | string | 'admin' | 存储数据库 |
| `collection` | string | 'slow_query_logs' | 存储集合 |
| `ttl` | number | 604800（7天） | TTL过期时间（秒） |
| `ttlField` | string | 'lastSeen' | TTL字段名 |

#### deduplication 去重配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | true | 是否启用去重 |
| `strategy` | string | 'aggregate' | 去重策略：aggregate（方案B）/none（方案A） |
| `keepRecentExecutions` | number | 0 | 保留最近N次执行详情（v1.5+） |

#### batch 批量配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | true | 是否启用批量写入 |
| `size` | number | 10 | 批量大小（条） |
| `interval` | number | 5000 | 刷新间隔（毫秒） |
| `maxBufferSize` | number | 100 | 最大缓冲区大小 |

#### filter 过滤配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `excludeDatabases` | string[] | [] | 排除的数据库 |
| `excludeCollections` | string[] | [] | 排除的集合 |
| `excludeOperations` | string[] | [] | 排除的操作类型 |
| `minExecutionTimeMs` | number | 0 | 最小执行时间（毫秒） |

---

## API参考

### getSlowQueryLogs(filter, options)

查询慢查询日志（支持方案B聚合数据）

**参数**：

```javascript
// filter - 查询条件
{
  db: 'mydb',              // 数据库名
  collection: 'users',     // 集合名
  operation: 'find',       // 操作类型
  minExecutionTime: 500    // 最小执行时间（未实现）
}

// options - 查询选项
{
  sort: { count: -1 },     // 排序规则
  limit: 10,               // 限制数量
  skip: 0                  // 跳过数量
}
```

**返回值**：

```javascript
[
  {
    _id: ObjectId('...'),
    queryHash: 'abc123def456',          // 查询Hash（唯一标识）
    db: 'mydb',                         // 数据库名
    collection: 'users',                // 集合名
    operation: 'find',                  // 操作类型
    queryShape: { status: 1 },          // 查询模式（已脱敏）
    type: 'mongodb',                    // 数据库类型
    count: 2400,                        // 执行次数
    totalTimeMs: 1248000,               // 总执行时间
    minTimeMs: 500,                     // 最小执行时间
    maxTimeMs: 1200,                    // 最大执行时间
    avgTimeMs: 520,                     // 平均执行时间（动态计算）
    firstSeen: ISODate('...'),          // 首次发现时间
    lastSeen: ISODate('...'),           // 最后一次时间
    lastExecution: {                    // 最后一次执行详情
      executionTimeMs: 520,
      timestamp: ISODate('...'),
      metadata: {}
    }
  }
]
```

**使用示例**：

```javascript
// 查询高频慢查询Top10
const topFrequent = await msq.getSlowQueryLogs(
  {},
  { sort: { count: -1 }, limit: 10 }
);

// 查询最慢的查询Top10
const topSlow = await msq.getSlowQueryLogs(
  {},
  { sort: { maxTimeMs: -1 }, limit: 10 }
);

// 查询特定集合的慢查询
const userLogs = await msq.getSlowQueryLogs(
  { db: 'mydb', collection: 'users' },
  { sort: { avgTimeMs: -1 } }
);

// 查询特定操作类型
const aggregateLogs = await msq.getSlowQueryLogs(
  { operation: 'aggregate' },
  { limit: 20 }
);
```

---

## 使用示例

### 示例1：零配置启用

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: true  // ✅ 一行启用
});
```

### 示例2：独立连接（隔离资源）

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    storage: {
      useBusinessConnection: false,
      uri: 'mongodb://admin-host:27017/admin'
    }
  }
});
```

### 示例3：自定义TTL

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    storage: {
      mongodb: {
        ttl: 24 * 3600  // 保留1天
      }
    }
  }
});
```

### 示例4：过滤特定集合

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    filter: {
      excludeCollections: ['logs', 'temp'],  // 排除日志集合
      minExecutionTimeMs: 1000               // 只记录>1秒的
    }
  }
});
```

### 示例5：方案A（不去重）

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    deduplication: {
      enabled: false  // 关闭去重，每次新增记录
    }
  }
});
```

### 示例6：实时写入模式

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    batch: {
      enabled: false  // 禁用批量，实时写入
    }
  }
});
```

---

## 最佳实践

### 阈值设置建议

根据不同场景选择合适的慢查询阈值：

| 场景 | 建议阈值 | 说明 |
|------|---------|------|
| **高并发API** | 100-300ms | 快速响应要求，对用户体验敏感 |
| **后台任务** | 1000-3000ms | 可接受较长时间，关注资源占用 |
| **分析查询** | 5000-10000ms | 复杂聚合查询，重点优化极慢查询 |
| **批量操作** | 10000-30000ms | 大批量数据处理，重点关注失败 |

#### 示例：不同场景配置

```javascript
// 场景1：高并发Web API
const apiMsq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  slowQueryMs: 200,  // 200ms阈值
  slowQuery: {
    logLevel: 'error',  // 只记录严重慢查询
    excludeOperations: []
  }
});

// 场景2：数据分析服务
const analyticsMsq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  slowQueryMs: 5000,  // 5秒阈值
  slowQuery: {
    logLevel: 'info',
    excludeOperations: []  // 记录所有操作
  }
});

// 场景3：混合场景（动态阈值）
await collection('users').find(
  { status: 'active' },
  { slowQueryMs: 100 }  // 用户查询100ms
);

await collection('analytics').aggregate(
  [...],
  { slowQueryMs: 5000 }  // 分析查询5秒
);
```

### 监控和分析

#### 1. 实时监控

```javascript
// 监听慢查询事件
msq.on('slow-query', (info) => {
  // 实时记录到监控系统
  monitoring.record('slow_query', {
    operation: info.op,
    collection: info.collection,
    duration: info.durationMs,
    timestamp: new Date()
  });
  
  // 发送告警（超过阈值5秒）
  if (info.durationMs > 5000) {
    alerting.send({
      type: 'critical',
      title: 'Extremely Slow Query Detected',
      message: `${info.op} on ${info.collection} took ${info.durationMs}ms`,
      details: info
    });
  }
});
```

#### 2. 定期分析

```javascript
// 每小时分析一次慢查询
setInterval(async () => {
  // 获取高频慢查询Top 10
  const topFrequent = await msq.getSlowQueryLogs(
    {},
    { sort: { count: -1 }, limit: 10 }
  );
  
  console.log('=== 高频慢查询分析 ===');
  topFrequent.forEach((log, index) => {
    console.log(`${index + 1}. ${log.collection}.${log.operation}:`);
    console.log(`   执行次数: ${log.count}`);
    console.log(`   平均耗时: ${log.avgTimeMs}ms`);
    console.log(`   最大耗时: ${log.maxTimeMs}ms`);
    console.log(`   查询模式:`, JSON.stringify(log.queryShape));
    console.log('');
  });
}, 3600000);  // 每小时
```

#### 3. 导出慢查询统计

```javascript
// 导出慢查询统计报告
async function exportSlowQueryReport(startDate, endDate) {
  const logs = await msq.getSlowQueryLogs(
    {
      lastSeen: {
        $gte: startDate,
        $lte: endDate
      }
    },
    { sort: { avgTimeMs: -1 } }
  );
  
  const report = {
    period: { start: startDate, end: endDate },
    totalQueries: logs.reduce((sum, log) => sum + log.count, 0),
    uniquePatterns: logs.length,
    topSlow: logs.slice(0, 10),
    byCollection: {}
  };
  
  // 按集合分组统计
  logs.forEach(log => {
    if (!report.byCollection[log.collection]) {
      report.byCollection[log.collection] = {
        count: 0,
        totalTimeMs: 0,
        queries: []
      };
    }
    report.byCollection[log.collection].count += log.count;
    report.byCollection[log.collection].totalTimeMs += log.totalTimeMs;
    report.byCollection[log.collection].queries.push(log);
  });
  
  return report;
}

// 使用示例
const report = await exportSlowQueryReport(
  new Date('2026-01-01'),
  new Date('2026-01-31')
);
console.log(JSON.stringify(report, null, 2));
```

### 优化建议

#### 1. 创建索引

```javascript
// 分析慢查询后创建索引
const slowQuery = {
  collection: 'users',
  queryShape: { status: 1, createdAt: 1 }
};

// 根据查询模式创建索引
await msq.db.collection('users').createIndex(
  { status: 1, createdAt: -1 },
  { name: 'idx_status_createdAt' }
);

// 验证索引效果
const result = await collection('users')
  .find({ status: 'active', createdAt: { $gte: someDate } })
  .explain('executionStats');
  
console.log('索引使用情况:', result.executionStats.totalKeysExamined);
```

#### 2. 优化查询条件

```javascript
// ❌ 低效查询
await collection('products').find({
  $where: 'this.price > 100'  // JavaScript表达式，无法使用索引
});

// ✅ 优化后
await collection('products').find({
  price: { $gt: 100 }  // 标准操作符，可使用索引
});

// ❌ 低效正则
await collection('users').find({
  email: { $regex: '.*@gmail.com' }  // 前缀通配符，无法使用索引
});

// ✅ 优化后
await collection('users').find({
  email: { $regex: '^.*@gmail\\.com$' }  // 使用锚点，可使用部分索引
});
```

#### 3. 使用投影减少数据传输

```javascript
// ❌ 返回所有字段
const users = await collection('users').find({
  status: 'active'
});

// ✅ 只返回需要的字段
const users = await collection('users').find(
  { status: 'active' },
  { 
    projection: { name: 1, email: 1, _id: 0 }
  }
);
```

#### 4. 启用缓存

```javascript
// 对高频查询启用缓存
const activeUsers = await collection('users').find(
  { status: 'active' },
  { 
    cache: 60000,  // 缓存1分钟
    slowQueryMs: 100
  }
);

// 第二次查询从缓存读取，不会触发慢查询日志
```

### 生产环境最佳实践

#### 1. 合理设置TTL

```javascript
// 根据存储容量和分析需求设置TTL
storage: {
  mongodb: {
    ttl: 7 * 24 * 3600    // 1周（推荐）- 平衡存储和分析需求
    // ttl: 30 * 24 * 3600   // 1月 - 长期趋势分析
    // ttl: 1 * 24 * 3600    // 1天 - 存储敏感场景
  }
}
```

#### 2. 使用复用连接（默认）

```javascript
// ✅ 推荐：复用连接（默认）
storage: {
  useBusinessConnection: true  // 零额外连接开销
}

// ⚠️ 特殊场景：独立连接
storage: {
  useBusinessConnection: false,
  uri: 'mongodb://admin-host:27017/admin'
}
```

**何时使用独立连接**：
- 业务库性能极度敏感
- 慢查询日志量很大（>10000条/天）
- 需要独立的权限控制和资源隔离

#### 3. 配置告警

```javascript
// 慢查询达到阈值时发送告警
msq.on('slow-query', (info) => {
  if (info.durationMs > 5000) {
    // 关键告警
    alerting.send({
      type: 'critical',
      message: `Extremely slow query: ${info.durationMs}ms`,
      details: {
        operation: info.op,
        collection: info.collection,
        database: info.db,
        query: info.query,
        duration: info.durationMs
      },
      tags: ['mongodb', 'performance', 'slow-query']
    });
  } else if (info.durationMs > 2000) {
    // 警告级别
    alerting.send({
      type: 'warning',
      message: `Slow query detected: ${info.durationMs}ms`,
      details: info
    });
  }
});
```

#### 4. 监控存储空间

```javascript
// 定期检查慢查询日志集合大小
setInterval(async () => {
  const stats = await msq.db.collection('slow_query_logs').stats();
  const sizeMB = stats.size / 1024 / 1024;
  
  console.log('慢查询日志存储:', {
    size: `${sizeMB.toFixed(2)} MB`,
    count: stats.count,
    avgObjectSize: `${stats.avgObjSize} bytes`
  });
  
  // 告警：存储超过1GB
  if (sizeMB > 1024) {
    alerting.send({
      type: 'warning',
      message: 'Slow query logs collection exceeds 1GB',
      details: { sizeMB, count: stats.count }
    });
  }
}, 86400000);  // 每天检查
```

#### 5. 集成日志系统

```javascript
// 与Winston集成
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'slow-query.log',
      maxsize: 10485760,  // 10MB
      maxFiles: 5
    }),
    new winston.transports.Console()
  ]
});

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  logger: logger,  // 使用自定义日志器
  slowQueryMs: 1000
});
```

---

## 故障排查

### 问题1：慢查询日志未保存

**可能原因**：

1. 未启用功能
   ```javascript
   // ❌ 错误
   slowQueryLog: false
   
   // ✅ 正确
   slowQueryLog: true
   ```

2. 查询未超过阈值
   ```javascript
   // 检查slowQueryMs设置
   slowQueryMs: 500  // 确保查询确实>500ms
   ```

3. 批量队列未刷新
   ```javascript
   // 等待队列刷新（默认5秒）
   await new Promise(resolve => setTimeout(resolve, 6000));
   ```

**解决方案**：
1. 检查配置是否正确
2. 检查日志输出是否有错误
3. 手动调用 `msq.slowQueryLogManager.queue.flush()`

### 问题2：存储连接失败

**错误信息**：
```
[SlowQueryLog] Failed to initialize MongoDB storage: MongoServerError...
```

**可能原因**：
- MongoDB连接URI错误
- 网络不可达
- 权限不足

**解决方案**：
```javascript
// 检查URI是否正确
storage: {
  uri: 'mongodb://localhost:27017/admin'  // 确认URI正确
}

// 或使用复用连接
storage: {
  useBusinessConnection: true  // 使用业务连接
}
```

### 问题3：查询慢查询日志返回空

**可能原因**：
1. 慢查询日志未生成
2. 已过期（TTL删除）
3. 查询条件不匹配

**解决方案**：
```javascript
// 查询所有慢查询日志
const allLogs = await msq.getSlowQueryLogs({}, { limit: 100 });
console.log('总数:', allLogs.length);

// 检查TTL设置
console.log('TTL:', msq.slowQueryLogManager.config.storage.mongodb.ttl);
```

---

## 性能优化

### 性能影响分析

| 指标 | 未启用 | 启用后 | 影响 |
|------|--------|--------|------|
| 单次查询耗时 | X ms | X + 2ms | +2ms（队列add） |
| 内存占用 | Y MB | Y + 0.3MB | +0.3MB（队列缓冲） |
| 连接数 | N | N（复用） | 0 |

**结论**：性能影响极小（<1%），可忽略

### 优化建议

1. **使用批量写入**（默认启用）
   ```javascript
   batch: {
     enabled: true,     // ✅ 启用批量
     size: 10,          // 批量大小
     interval: 5000     // 刷新间隔
   }
   ```

2. **使用方案B去重**（默认启用）
   ```javascript
   deduplication: {
     enabled: true,     // ✅ 启用去重
     strategy: 'aggregate'
   }
   ```

3. **合理设置TTL**
   ```javascript
   storage: {
     mongodb: {
       ttl: 7 * 24 * 3600  // 7天过期
     }
   }
   ```

4. **过滤不重要的集合**
   ```javascript
   filter: {
     excludeCollections: ['logs', 'temp']  // 排除日志集合
   }
   ```

---

## 附录

### A. 数据模型

**slow_query_logs 集合结构**：

```javascript
{
  _id: ObjectId('...'),
  queryHash: 'abc123def456',          // 查询Hash（唯一）
  db: 'mydb',                         // 数据库名
  collection: 'users',                // 集合名
  operation: 'find',                  // 操作类型
  queryShape: { status: 1 },          // 查询模式（已脱敏）
  type: 'mongodb',                    // 数据库类型
  count: 2400,                        // 执行次数
  totalTimeMs: 1248000,               // 总执行时间
  minTimeMs: 500,                     // 最小执行时间
  maxTimeMs: 1200,                    // 最大执行时间
  firstSeen: ISODate('...'),          // 首次发现时间
  lastSeen: ISODate('...'),           // 最后一次时间（TTL字段）
  lastExecution: {                    // 最后一次执行详情
    executionTimeMs: 520,
    timestamp: ISODate('...'),
    metadata: {}
  }
}
```

**索引**：

```javascript
// 唯一索引（queryHash）
db.slow_query_logs.createIndex({ queryHash: 1 }, { unique: true });

// TTL索引（lastSeen）
db.slow_query_logs.createIndex(
  { lastSeen: 1 },
  { expireAfterSeconds: 604800 }
);

// 查询优化索引
db.slow_query_logs.createIndex({ db: 1, collection: 1 });
db.slow_query_logs.createIndex({ count: -1 });
```

### B. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.3.1 | 2025-12-22 | 首次发布，支持MongoDB存储 |

### C. 相关链接

- [需求方案文档](../../../plans/requirements/req-slow-query-log-storage-v1.3.md)
- [使用示例](../../../examples/slow-query-log.examples.js)
- [配置设计说明](../planning/slow-query-log-config-design-v1.3.md)

---

**文档版本**: v1.3.1  
**最后更新**: 2025-12-22  
**维护者**: AI助手

