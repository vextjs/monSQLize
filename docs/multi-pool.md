# 企业级多连接池管理

> **版本**: v1.0.8+  
> **更新日期**: 2026-01-16

---

## 📋 目录

- [简介](#简介)
- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [ConnectionPoolManager](#connectionpoolmanager)
- [HealthChecker](#healthchecker)
- [PoolSelector](#poolselector)
- [PoolStats](#poolstats)
- [配置详解](#配置详解)
- [使用场景](#使用场景)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)
- [API 参考](#api-参考)

---

## 简介

monSQLize 的多连接池功能允许您在单个应用程序中管理多个 MongoDB 连接池，实现：

- ✅ **读写分离**: 写操作使用主库，读操作使用只读副本
- ✅ **负载均衡**: 在多个副本之间智能分配查询负载
- ✅ **故障转移**: 自动检测故障并切换到健康的连接池
- ✅ **性能优化**: 将分析查询路由到专用的分析节点
- ✅ **灵活扩展**: 根据业务需求动态添加/移除连接池

### 适用场景

- 🎯 **高并发读多写少**: 通过只读副本分担读压力
- 🎯 **报表分析**: 将重查询路由到专用分析节点，不影响线上服务
- 🎯 **多租户系统**: 为不同租户使用不同的数据库连接
- 🎯 **灾备切换**: 主库故障时自动切换到备库

---

## 快速开始

### 安装

```bash
npm install monsqlize@1.0.8
```

### 基础示例

```javascript
const { ConnectionPoolManager } = require('monsqlize');

// 1. 创建管理器
const manager = new ConnectionPoolManager({
    maxPoolsCount: 10,
    poolStrategy: 'auto',
    logger: console
});

// 2. 添加主库
await manager.addPool({
    name: 'primary',
    uri: 'mongodb://primary-host:27017/mydb',
    role: 'primary',
    weight: 1
});

// 3. 添加只读副本
await manager.addPool({
    name: 'secondary-1',
    uri: 'mongodb://secondary-host:27017/mydb',
    role: 'secondary',
    weight: 2
});

// 4. 启动健康检查
manager.startHealthCheck();

// 5. 使用连接池
const pool = manager.selectPool('read');  // 自动选择最佳池
const users = await pool.collection.find({ status: 'active' }).toArray();

// 6. 获取统计
const stats = manager.getPoolStats();
console.log(stats);
```

---

## 核心概念

### 连接池角色 (Role)

| 角色 | 用途 | 推荐使用场景 |
|------|------|------------|
| **primary** | 主库，处理写操作和重要读操作 | 所有写操作、强一致性读 |
| **secondary** | 只读副本，处理普通读操作 | 列表查询、详情查询 |
| **analytics** | 分析节点，处理重查询 | 报表、统计、聚合查询 |
| **custom** | 自定义角色 | 特殊业务需求 |

### 选择策略 (Strategy)

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **auto** | 自动策略（推荐）| write → primary, read → secondary | 大多数场景 |
| **roundRobin** | 轮询策略 | 负载均衡 |
| **weighted** | 加权轮询 | 服务器性能差异大 |
| **leastConnections** | 最少连接 | 连接数敏感 |
| **manual** | 手动指定 | 特殊业务逻辑 |

### 健康状态

| 状态 | 说明 | 行为 |
|------|------|------|
| **up** | 健康 | 正常使用 |
| **down** | 故障 | 不使用，等待恢复 |
| **unknown** | 未知 | 初始状态 |

---

## ConnectionPoolManager

连接池管理器是多连接池功能的核心，负责统一管理所有连接池。

### 创建管理器

```javascript
const manager = new ConnectionPoolManager({
    // 最大连接池数量（可选，默认 10）
    maxPoolsCount: 10,
    
    // 选择策略（可选，默认 'auto'）
    poolStrategy: 'auto',
    
    // 降级配置（可选）
    fallback: {
        enabled: true,              // 启用降级
        fallbackStrategy: 'readonly', // 降级策略
        retryDelay: 1000,           // 重试延迟（毫秒）
        maxRetries: 3               // 最大重试次数
    },
    
    // 日志对象（可选）
    logger: console
});
```

### 添加连接池

```javascript
await manager.addPool({
    // 必需参数
    name: 'primary',                              // 唯一名称
    uri: 'mongodb://host:27017/db',              // 连接字符串
    
    // 可选参数
    role: 'primary',                              // 角色
    weight: 1,                                    // 权重（用于加权策略）
    tags: ['production', 'main'],                 // 标签
    
    // MongoDB 连接选项
    options: {
        maxPoolSize: 100,                         // 最大连接数
        minPoolSize: 10,                          // 最小连接数
        maxIdleTimeMS: 30000,                     // 最大空闲时间
        waitQueueTimeoutMS: 10000,                // 等待超时
        connectTimeoutMS: 5000,                   // 连接超时
        serverSelectionTimeoutMS: 5000            // 服务器选择超时
    },
    
    // 健康检查配置
    healthCheck: {
        enabled: true,                            // 启用健康检查
        interval: 5000,                           // 检查间隔（毫秒）
        timeout: 3000,                            // 检查超时（毫秒）
        retries: 3                                // 失败重试次数
    }
});
```

### 选择连接池

```javascript
// 自动选择（根据策略）
const pool = manager.selectPool('read');

// 手动指定
const pool = manager.selectPool('read', { pool: 'secondary-1' });

// 根据标签选择
const pool = manager.selectPool('read', { tags: ['analytics'] });

// 使用连接池
const collection = pool.collection;
const db = pool.db;
const client = pool.client;
```

### 移除连接池

```javascript
// 移除指定连接池
await manager.removePool('secondary-1');
```

### 获取信息

```javascript
// 获取所有连接池名称
const names = manager.getPoolNames();
console.log(names);  // ['primary', 'secondary-1', 'secondary-2']

// 获取所有连接池统计
const stats = manager.getPoolStats();
console.log(stats);
// {
//   'primary': { totalRequests: 1000, avgResponseTime: 45, ... },
//   'secondary-1': { totalRequests: 5000, avgResponseTime: 30, ... }
// }

// 获取所有连接池健康状态
const health = manager.getPoolHealth();
console.log(health);
// Map {
//   'primary' => { status: 'up', consecutiveFailures: 0, ... },
//   'secondary-1' => { status: 'up', consecutiveFailures: 0, ... }
// }
```

### 关闭管理器

```javascript
// 关闭所有连接池
await manager.close();
```

---

## HealthChecker

健康检查器负责定期检查连接池的健康状态。

### 配置健康检查

在添加连接池时配置：

```javascript
await manager.addPool({
    name: 'primary',
    uri: 'mongodb://host:27017/db',
    healthCheck: {
        enabled: true,      // 启用健康检查
        interval: 5000,     // 每5秒检查一次
        timeout: 3000,      // 3秒超时
        retries: 3          // 失败重试3次
    }
});
```

### 启动/停止健康检查

```javascript
// 启动（对所有启用了健康检查的池生效）
manager.startHealthCheck();

// 停止
manager.stopHealthCheck();
```

### 查询健康状态

```javascript
// 查询所有池的健康状态
const allHealth = manager.getPoolHealth();

// 查询单个池的健康状态
const health = manager._healthChecker.getStatus('primary');
console.log(health);
// {
//   status: 'up',                    // 状态：up/down/unknown
//   consecutiveFailures: 0,          // 连续失败次数
//   lastCheck: 1642345678000,        // 上次检查时间戳
//   lastSuccess: 1642345678000,      // 上次成功时间戳
//   lastError: null,                 // 上次错误信息
//   uptime: 3600000                  // 运行时长（毫秒）
// }
```

### 健康检查逻辑

1. **检查方法**: 使用 `db.admin().ping()` 命令
2. **成功标准**: 命令成功返回且不超时
3. **失败处理**: 
   - 连续失败次数 < retries: 继续重试
   - 连续失败次数 ≥ retries: 标记为 down
4. **恢复机制**: down 状态下仍会继续检查，成功后立即恢复为 up

---

## PoolSelector

连接池选择器负责根据策略选择最合适的连接池。

### Auto 策略（推荐）

自动策略根据操作类型和池的角色智能选择：

```javascript
const manager = new ConnectionPoolManager({
    poolStrategy: 'auto'
});

// write 操作 → 选择 primary
const pool = manager.selectPool('write');

// read 操作 → 优先选择 secondary，没有则选 primary
const pool = manager.selectPool('read');
```

**规则**:
- `write` 操作: 只选择 primary 角色的池
- `read` 操作: 
  1. 优先选择 secondary 角色的池
  2. 如果没有 secondary，选择 primary
  3. 如果都没有，选择任意可用池

### RoundRobin 策略

轮询策略在所有可用池之间均匀分配：

```javascript
const manager = new ConnectionPoolManager({
    poolStrategy: 'roundRobin'
});

// 第1次 → pool1
// 第2次 → pool2
// 第3次 → pool3
// 第4次 → pool1
// ...
```

### Weighted 策略

加权轮询策略根据权重分配：

```javascript
await manager.addPool({
    name: 'primary',
    uri: '...',
    weight: 1  // 权重1
});

await manager.addPool({
    name: 'secondary',
    uri: '...',
    weight: 3  // 权重3
});

// 每4次请求:
// - 1次分配给 primary
// - 3次分配给 secondary
```

### LeastConnections 策略

选择当前连接数最少的池：

```javascript
const manager = new ConnectionPoolManager({
    poolStrategy: 'leastConnections'
});

// 自动选择连接数最少的池
const pool = manager.selectPool('read');
```

### Manual 策略

手动指定连接池：

```javascript
const manager = new ConnectionPoolManager({
    poolStrategy: 'manual'
});

// 必须手动指定池名称
const pool = manager.selectPool('read', { pool: 'analytics' });
```

---

## PoolStats

统计收集器负责收集和聚合连接池的性能数据。

### 统计指标

```javascript
const stats = manager.getPoolStats();
console.log(stats['primary']);
// {
//   totalRequests: 10000,          // 总请求数
//   avgResponseTime: 45,           // 平均响应时间（毫秒）
//   minResponseTime: 10,           // 最小响应时间
//   maxResponseTime: 500,          // 最大响应时间
//   errorRate: 0.01,               // 错误率（0-1）
//   readCount: 8000,               // 读操作数
//   writeCount: 2000,              // 写操作数
//   lastRequestTime: 1642345678000 // 最后请求时间戳
// }
```

### 性能分析

使用统计数据进行性能分析：

```javascript
const stats = manager.getPoolStats();

// 找出响应最慢的池
const slowest = Object.entries(stats)
    .sort((a, b) => b[1].avgResponseTime - a[1].avgResponseTime)[0];
console.log(`最慢的池: ${slowest[0]}, 平均响应时间: ${slowest[1].avgResponseTime}ms`);

// 找出错误率最高的池
const errorProne = Object.entries(stats)
    .sort((a, b) => b[1].errorRate - a[1].errorRate)[0];
console.log(`错误率最高: ${errorProne[0]}, 错误率: ${(errorProne[1].errorRate * 100).toFixed(2)}%`);

// 计算总负载
const totalLoad = Object.values(stats)
    .reduce((sum, s) => sum + s.totalRequests, 0);
console.log(`总请求数: ${totalLoad}`);
```

---

## 配置详解

### 完整配置示例

```javascript
const { ConnectionPoolManager } = require('monsqlize');

const manager = new ConnectionPoolManager({
    // === 管理器配置 ===
    maxPoolsCount: 10,
    poolStrategy: 'auto',
    
    // === 降级配置 ===
    fallback: {
        enabled: true,
        fallbackStrategy: 'readonly',
        retryDelay: 1000,
        maxRetries: 3
    },
    
    logger: console
});

// === 主库配置 ===
await manager.addPool({
    name: 'primary',
    uri: process.env.MONGODB_PRIMARY_URI,
    role: 'primary',
    weight: 1,
    tags: ['production', 'write'],
    
    options: {
        maxPoolSize: 100,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 10000
    },
    
    healthCheck: {
        enabled: true,
        interval: 5000,
        timeout: 3000,
        retries: 3
    }
});

// === 只读副本配置 ===
await manager.addPool({
    name: 'secondary-1',
    uri: process.env.MONGODB_SECONDARY_URI,
    role: 'secondary',
    weight: 2,
    tags: ['production', 'read'],
    
    healthCheck: {
        enabled: true,
        interval: 10000,
        timeout: 5000,
        retries: 2
    }
});

// === 分析节点配置 ===
await manager.addPool({
    name: 'analytics',
    uri: process.env.MONGODB_ANALYTICS_URI,
    role: 'analytics',
    weight: 1,
    tags: ['analytics', 'reports'],
    
    options: {
        maxPoolSize: 50,
        minPoolSize: 5
    },
    
    healthCheck: {
        enabled: true,
        interval: 15000
    }
});

manager.startHealthCheck();
```

---

## 使用场景

### 场景1：读写分离

```javascript
// 配置主库和只读副本
await manager.addPool({
    name: 'primary',
    uri: 'mongodb://primary:27017/db',
    role: 'primary'
});

await manager.addPool({
    name: 'secondary',
    uri: 'mongodb://secondary:27017/db',
    role: 'secondary'
});

// 写操作自动路由到主库
const writePool = manager.selectPool('write');
await writePool.collection.insertOne({ name: 'John' });

// 读操作自动路由到副本
const readPool = manager.selectPool('read');
const users = await readPool.collection.find({}).toArray();
```

### 场景2：报表分析

```javascript
// 配置分析节点
await manager.addPool({
    name: 'analytics',
    uri: 'mongodb://analytics:27017/db',
    role: 'analytics',
    tags: ['reports']
});

// 重查询路由到分析节点
const pool = manager.selectPool('read', { tags: ['reports'] });
const report = await pool.collection.aggregate([
    { $match: { date: { $gte: startDate } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } }
]).toArray();
```

### 场景3：多租户

```javascript
// 为每个租户配置独立连接池
const tenants = ['tenant-a', 'tenant-b', 'tenant-c'];

for (const tenant of tenants) {
    await manager.addPool({
        name: tenant,
        uri: process.env[`MONGODB_${tenant.toUpperCase()}_URI`],
        role: 'custom',
        tags: [tenant]
    });
}

// 根据租户路由请求
const tenantId = req.headers['x-tenant-id'];
const pool = manager.selectPool('read', { tags: [tenantId] });
```

### 场景4：灾备切换

```javascript
// 监听健康状态变化
manager._healthChecker.on('statusChange', ({ poolName, oldStatus, newStatus }) => {
    console.log(`Pool ${poolName}: ${oldStatus} → ${newStatus}`);
    
    if (poolName === 'primary' && newStatus === 'down') {
        // 主库故障，触发告警
        alerting.send('Primary database is down!');
        
        // 可以手动切换到备库
        // （如果配置了备库）
    }
});
```

---

## 最佳实践

### 1. 合理配置健康检查

```javascript
// ✅ 推荐：根据重要性配置不同的检查频率
await manager.addPool({
    name: 'primary',
    healthCheck: {
        interval: 5000,  // 主库：5秒
        timeout: 3000,
        retries: 3
    }
});

await manager.addPool({
    name: 'analytics',
    healthCheck: {
        interval: 30000,  // 分析库：30秒（不太重要）
        timeout: 5000,
        retries: 1
    }
});
```

### 2. 使用标签管理

```javascript
// ✅ 推荐：使用标签进行分组
await manager.addPool({
    name: 'secondary-1',
    tags: ['read', 'production', 'region-us']
});

// 根据标签灵活选择
const pool = manager.selectPool('read', { 
    tags: ['production', 'region-us'] 
});
```

### 3. 监控统计指标

```javascript
// ✅ 推荐：定期检查统计信息
setInterval(() => {
    const stats = manager.getPoolStats();
    
    for (const [name, stat] of Object.entries(stats)) {
        // 检查响应时间
        if (stat.avgResponseTime > 100) {
            console.warn(`Pool ${name} is slow: ${stat.avgResponseTime}ms`);
        }
        
        // 检查错误率
        if (stat.errorRate > 0.05) {
            console.error(`Pool ${name} has high error rate: ${(stat.errorRate * 100).toFixed(2)}%`);
        }
    }
}, 60000);  // 每分钟检查一次
```

### 4. 优雅关闭

```javascript
// ✅ 推荐：在应用退出时关闭管理器
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    
    // 停止健康检查
    manager.stopHealthCheck();
    
    // 关闭所有连接池
    await manager.close();
    
    process.exit(0);
});
```

### 5. 错误处理

```javascript
// ✅ 推荐：处理连接池选择失败
try {
    const pool = manager.selectPool('read');
    const results = await pool.collection.find({}).toArray();
} catch (error) {
    if (error.message.includes('No available')) {
        // 所有池都不可用
        console.error('All pools are down!');
        
        // 返回缓存或默认数据
        return cachedData;
    }
    
    throw error;
}
```

---

## 故障排查

### 问题1：连接池无法添加

**症状**: `addPool` 抛出错误

**可能原因**:
1. 连接字符串格式错误
2. 达到最大池数量限制
3. 池名称重复

**解决方法**:
```javascript
try {
    await manager.addPool({
        name: 'test',
        uri: 'mongodb://host:27017/db'
    });
} catch (error) {
    console.error('Failed to add pool:', error.message);
    
    // 检查原因
    if (error.message.includes('Maximum')) {
        // 增加 maxPoolsCount 或移除不用的池
    } else if (error.message.includes('already exists')) {
        // 使用不同的名称
    }
}
```

### 问题2：健康检查一直失败

**症状**: 池的状态始终为 down

**可能原因**:
1. 网络不通
2. 认证失败
3. 超时时间设置过短

**解决方法**:
```javascript
// 1. 检查连接
const { MongoClient } = require('mongodb');
const client = new MongoClient(uri);
try {
    await client.connect();
    await client.db('admin').admin().ping();
    console.log('Connection OK');
} catch (error) {
    console.error('Connection failed:', error);
} finally {
    await client.close();
}

// 2. 增加超时时间
await manager.addPool({
    name: 'test',
    uri: uri,
    healthCheck: {
        timeout: 10000,  // 增加到10秒
        retries: 5
    }
});
```

### 问题3：统计数据不准确

**症状**: `getPoolStats()` 返回的数据不符合预期

**可能原因**:
1. 统计收集尚未完成
2. 批量刷新延迟

**解决方法**:
```javascript
// 等待批量刷新完成
await new Promise(resolve => setTimeout(resolve, 2000));

const stats = manager.getPoolStats();
console.log(stats);
```

---

## API 参考

### ConnectionPoolManager

#### 构造函数

```typescript
new ConnectionPoolManager(options?: {
    maxPoolsCount?: number;
    poolStrategy?: 'auto' | 'roundRobin' | 'weighted' | 'leastConnections' | 'manual';
    fallback?: {
        enabled?: boolean;
        fallbackStrategy?: 'error' | 'readonly' | 'secondary';
        retryDelay?: number;
        maxRetries?: number;
    };
    logger?: any;
})
```

#### 方法

- `addPool(config: PoolConfig): Promise<void>` - 添加连接池
- `removePool(name: string): Promise<void>` - 移除连接池
- `selectPool(operation: string, options?: { pool?: string; tags?: string[] }): Pool` - 选择连接池
- `getPoolNames(): string[]` - 获取所有池名称
- `getPoolStats(): Record<string, PoolStats>` - 获取所有统计
- `getPoolHealth(): Map<string, HealthStatus>` - 获取所有健康状态
- `startHealthCheck(): void` - 启动健康检查
- `stopHealthCheck(): void` - 停止健康检查
- `close(): Promise<void>` - 关闭管理器

### PoolConfig

```typescript
interface PoolConfig {
    name: string;                    // 唯一名称
    uri: string;                     // 连接字符串
    role?: 'primary' | 'secondary' | 'analytics' | 'custom';
    weight?: number;                 // 权重
    tags?: string[];                 // 标签
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        maxIdleTimeMS?: number;
        waitQueueTimeoutMS?: number;
        connectTimeoutMS?: number;
        serverSelectionTimeoutMS?: number;
    };
    healthCheck?: {
        enabled?: boolean;
        interval?: number;
        timeout?: number;
        retries?: number;
    };
}
```

---

## 相关文档

- [Update 聚合管道](./update-aggregation.md)
- [Saga 分布式事务](./saga-transaction.md)
- [事务优化](./transaction-optimizations.md)
- [分布式部署](./distributed-deployment.md)

---

_文档版本: v1.0.8_  
_最后更新: 2026-01-16_

