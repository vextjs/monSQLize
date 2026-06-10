# Count 队列控制

> **版本**: v1.0.0+  
> **用途**: 控制高并发场景下的 countDocuments 并发数量，避免压垮数据库

---

## 📖 目录

- [概述](#概述)
- [为什么需要队列控制](#为什么需要队列控制)
- [快速开始](#快速开始)
- [配置选项](#配置选项)
- [使用场景](#使用场景)
- [性能对比](#性能对比)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)
- [API 参考](#api-参考)

---

## 概述

Count 队列控制是 monSQLize 的高级特性，用于限制同时执行的 `countDocuments` 操作数量。

### 核心功能

- ✅ **并发控制** - 限制同时执行的 count 数量
- ✅ **队列管理** - 超出限制的请求自动排队
- ✅ **超时保护** - 防止请求长时间等待
- ✅ **统计监控** - 提供队列状态和性能指标
- ✅ **自动启用** - 默认开启，无需配置

---

## 为什么需要队列控制

### 问题场景

```javascript
// 高并发场景：100 个用户同时请求分页数据
for (let i = 0; i < 100; i++) {
    await collection.findPage({
        query: { status: 'active' },
        totals: { mode: 'async' }
    });
}

// 结果：100 个 countDocuments 同时执行
// ❌ 数据库连接池耗尽
// ❌ CPU 100%
// ❌ 其他查询超时
// ❌ 数据库崩溃
```

### 解决方案

```javascript
// 使用 Count 队列（默认启用）
const db = new MonSQLize({
    countQueue: {
        enabled: true,
        concurrency: 8  // 同时最多 8 个 count
    }
});

// 结果：最多 8 个 countDocuments 同时执行
// ✅ 数据库压力可控
// ✅ 连接池正常
// ✅ 其他查询不受影响
```

---

## 快速开始

### 默认配置（推荐）

```javascript
import MonSQLize from 'monsqlize';

const db = new MonSQLize({
    type: 'mongodb',
    config: {
        uri: 'mongodb://localhost:27017/mydb'
    }
    // countQueue 默认启用，无需配置
});

await db.connect();
const collection = db.collection('users');

// 自动使用队列控制
await collection.findPage({
    query: { status: 'active' },
    totals: {
        mode: 'async'  // 自动应用队列控制
    }
});
```

**默认配置**:
- ✅ `enabled: true` - 默认启用
- ✅ `concurrency:` CPU 核心数（最少 4，最多 16）
- ✅ `maxQueueSize: 10000` - 队列最大容量
- ✅ `timeout: 60000` - 超时 1 分钟

---

## 配置选项

### 基本配置

```javascript
const db = new MonSQLize({
    countQueue: {
        enabled: true,       // 是否启用队列控制
        concurrency: 8,      // 同时执行的 count 数量
        maxQueueSize: 5000,  // 队列最大容量
        timeout: 30000       // 超时时间（毫秒）
    }
});
```

### 配置说明

#### `enabled`

- **类型**: `Boolean`
- **默认值**: `true`
- **说明**: 是否启用队列控制

```javascript
// 禁用队列（不推荐）
countQueue: {
    enabled: false
}
```

#### `concurrency`

- **类型**: `Number`
- **默认值**: CPU 核心数（4-16）
- **说明**: 同时执行的最大 count 数量

```javascript
// 高并发场景：增加并发数
countQueue: {
    concurrency: 16
}

// 低配服务器：减少并发数
countQueue: {
    concurrency: 4
}
```

**推荐值**:
- 小型应用（单实例）: 4-8
- 中型应用（多实例）: 8-12
- 大型应用（高并发）: 12-16

#### `maxQueueSize`

- **类型**: `Number`
- **默认值**: `10000`
- **说明**: 队列最大容量，超出后拒绝新请求

```javascript
// 高流量场景：增加队列容量
countQueue: {
    maxQueueSize: 20000
}
```

#### `timeout`

- **类型**: `Number`（毫秒）
- **默认值**: `60000`（1 分钟）
- **说明**: 请求超时时间

```javascript
// 快速失败：减少超时时间
countQueue: {
    timeout: 30000  // 30 秒
}
```

---

## 使用场景

### 场景 1: 高并发分页

```javascript
// 大量用户同时访问列表页
app.get('/api/users', async (req, res) => {
    const result = await collection.findPage({
        query: { status: 'active' },
        page: req.query.page,
        limit: 20,
        totals: {
            mode: 'async'  // 自动使用队列控制
        }
    });
    
    res.json(result);
});
```

### 场景 2: 批量查询

```javascript
// 批量查询多个条件的统计
const queries = [
    { status: 'active' },
    { status: 'pending' },
    { status: 'expired' }
];

const results = await Promise.all(
    queries.map(query =>
        collection.findPage({
            query,
            totals: { mode: 'async' }
        })
    )
);
// 队列自动控制并发
```

### 场景 3: 定时统计任务

```javascript
// 定时统计任务（每分钟执行）
setInterval(async () => {
    const stats = await Promise.all([
        collection.findPage({ query: { type: 'A' }, totals: { mode: 'async' } }),
        collection.findPage({ query: { type: 'B' }, totals: { mode: 'async' } }),
        collection.findPage({ query: { type: 'C' }, totals: { mode: 'async' } })
    ]);
    
    console.log('统计完成:', stats);
}, 60000);
```

---

## 性能对比

### 测试场景

- **数据量**: 100 万条记录
- **并发请求**: 100 个
- **服务器**: 8 核 CPU

### 结果对比

| 配置 | count 并发数 | 响应时间 | 数据库 CPU | 连接池 | 结果 |
|------|-------------|---------|-----------|--------|------|
| **无队列** | 100 个同时 | - | 100% | 耗尽 | ❌ 崩溃 |
| **队列 (4)** | 最多 4 个 | 2.5s | 60% | 正常 | ✅ 稳定 |
| **队列 (8)** | 最多 8 个 | 1.8s | 80% | 正常 | ✅ 最佳 |
| **队列 (16)** | 最多 16 个 | 1.5s | 95% | 正常 | ⚠️ 接近极限 |

**结论**: `concurrency: 8` 是最佳平衡点

---

## 最佳实践

### 1. 根据服务器配置调整并发数

```javascript
const os = require('os');
const cpuCount = os.cpus().length;

const db = new MonSQLize({
    countQueue: {
        // 并发数 = CPU 核心数（最少 4，最多 16）
        concurrency: Math.max(4, Math.min(cpuCount, 16))
    }
});
```

### 2. 配合缓存使用

```javascript
const db = new MonSQLize({
    cache: {
        enabled: true,
        ttl: 600000  // 缓存 10 分钟
    },
    countQueue: {
        concurrency: 8
    }
});

// 第一次查询：执行 count，缓存结果
await collection.findPage({
    query: { status: 'active' },
    totals: { mode: 'async', ttl: 600000 }
});

// 10 分钟内再次查询：直接返回缓存，不执行 count
```

### 3. 配合分布式锁（多实例场景）

```javascript
// 推荐：队列 + 分布式锁
const db = new MonSQLize({
    countQueue: {
        concurrency: 8  // 单实例最多 8 个
    },
    distributed: {
        redis: { host: 'localhost', port: 6379 },
        lock: { enabled: true }  // 跨实例去重
    }
});

// 效果：
// - 4 个实例，只有 1 个执行 count
// - 该实例内最多 8 个并发
// - 数据库最多 8 个并发 count
```

### 4. 监控队列状态

```javascript
// 定期检查队列状态（需要内部 API 支持）
setInterval(() => {
    const stats = getQueueStats();  // 获取队列统计
    
    if (stats.rejected > 10) {
        console.warn('队列拒绝次数过多，考虑增加 maxQueueSize');
    }
    
    if (stats.avgWaitTime > 5000) {
        console.warn('平均等待时间过长，考虑增加 concurrency');
    }
}, 60000);
```

### 5. 使用 approx 模式（快速但近似）

```javascript
// 对精度要求不高的场景，使用 approx 模式
await collection.findPage({
    query: { status: 'active' },
    totals: {
        mode: 'approx'  // 快速近似统计
    }
});

// 优势：
// - 空查询使用 estimatedDocumentCount（不需要队列）
// - 有查询条件使用队列控制的 countDocuments
```

---

## 故障排查

### 问题 1: 队列拒绝请求

**错误**: `Count queue is full (10000)`

**原因**: 队列已满，新请求被拒绝

**解决**:
```javascript
// 方案 1: 增加队列容量
countQueue: {
    maxQueueSize: 20000
}

// 方案 2: 增加并发数
countQueue: {
    concurrency: 16
}

// 方案 3: 使用缓存减少 count 请求
cache: {
    enabled: true,
    ttl: 600000
}
```

### 问题 2: 请求超时

**错误**: `Count execution timeout (60000ms)`

**原因**: count 执行时间超过超时限制

**解决**:
```javascript
// 方案 1: 增加超时时间
countQueue: {
    timeout: 120000  // 2 分钟
}

// 方案 2: 添加索引加速 count
await collection.createIndex({ status: 1 });

// 方案 3: 使用 approx 模式
totals: {
    mode: 'approx'
}
```

### 问题 3: 数据库压力仍然很大

**原因**: 并发数设置过高

**解决**:
```javascript
// 减少并发数
countQueue: {
    concurrency: 4  // 从 16 减少到 4
}

// 或使用分布式锁（多实例场景）
distributed: {
    lock: { enabled: true }
}
```

---

## API 参考

### 配置对象

```typescript
interface CountQueueConfig {
    enabled?: boolean;        // 是否启用，默认 true
    concurrency?: number;     // 并发数，默认 CPU 核心数（4-16）
    maxQueueSize?: number;    // 队列容量，默认 10000
    timeout?: number;         // 超时时间，默认 60000ms
}
```

### 统计信息

```typescript
interface CountQueueStats {
    executed: number;         // 已执行总数
    queued: number;          // 曾排队总数
    timeout: number;         // 超时次数
    rejected: number;        // 拒绝次数
    avgWaitTime: number;     // 平均等待时间（ms）
    maxWaitTime: number;     // 最大等待时间（ms）
    running: number;         // 当前执行中
    queuedNow: number;       // 当前排队中
}
```

---

## 相关文档

- [findPage API](./findPage.md)
- [缓存配置](./cache.md)
- [分布式部署](./distributed-deployment.md)
- 性能优化

---

**最后更新**: 2025-01-02

