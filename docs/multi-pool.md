# 企业级多连接池管理

> **版本**: v1.0.8+  
> **更新日期**: 2026-02-03

---

## 📑 目录

- [简介](#简介)
  - [功能特性](#功能特性)
  - [适用场景](#适用场景)
  - [版本要求](#版本要求)
  - [架构概览](#架构概览)
- [快速开始](#快速开始)
  - [安装](#安装)
  - [5分钟上手](#5分钟上手)
  - [完整示例](#完整示例)
- [核心概念](#核心概念)
  - [连接池角色](#连接池角色)
  - [选择策略](#选择策略)
  - [健康检查](#健康检查)
  - [故障转移](#故障转移)
- [API 详细文档](#api-详细文档)
  - [ConnectionPoolManager](#connectionpoolmanager)
    - [构造函数](#构造函数)
    - [addPool()](#addpool)
    - [removePool()](#removepool)
    - [selectPool()](#selectpool)
    - [getPoolNames()](#getpoolnames)
    - [getPoolStats()](#getpoolstats)
    - [getPoolHealth()](#getpoolhealth)
    - [startHealthCheck()](#starthealthcheck)
    - [stopHealthCheck()](#stophealthcheck)
    - [close()](#close)
  - [返回值结构](#返回值结构)
  - [错误处理](#错误处理)
- [配置详解](#配置详解)
  - [管理器配置](#管理器配置)
  - [连接池配置](#连接池配置)
  - [健康检查配置](#健康检查配置)
  - [故障转移配置](#故障转移配置)
  - [配置示例](#配置示例)
- [使用场景](#使用场景)
  - [读写分离](#读写分离)
  - [负载均衡](#负载均衡)
  - [报表分析](#报表分析)
  - [多租户系统](#多租户系统)
  - [灾备切换](#灾备切换)
- [最佳实践](#最佳实践)
  - [连接池规划](#连接池规划)
  - [性能优化](#性能优化)
  - [监控和告警](#监控和告警)
  - [生产环境配置](#生产环境配置)
- [故障排查](#故障排查)
  - [常见问题](#常见问题)
  - [错误代码](#错误代码)
  - [调试技巧](#调试技巧)
- [完整示例](#完整示例)
  - [基础示例](#基础示例-1)
  - [高级示例](#高级示例-1)
  - [生产环境示例](#生产环境示例-1)

---

## 简介

monSQLize 的多连接池功能允许您在单个应用程序中管理多个 MongoDB 连接池，实现企业级的高可用和高性能数据库访问。

### 功能特性

- ✅ **读写分离**: 写操作使用主库，读操作使用只读副本，减轻主库压力
- ✅ **负载均衡**: 在多个副本之间智能分配查询负载，提升整体性能
- ✅ **故障转移**: 自动检测故障并切换到健康的连接池，确保服务连续性
- ✅ **性能优化**: 将分析查询路由到专用的分析节点，不影响线上服务
- ✅ **灵活扩展**: 根据业务需求动态添加/移除连接池
- ✅ **健康监控**: 实时监控所有连接池的健康状态
- ✅ **统计分析**: 提供详细的性能统计和监控数据

### 适用场景

| 场景 | 说明 | 收益 |
|------|------|------|
| 🎯 **高并发读多写少** | 通过只读副本分担读压力 | 主库负载降低 60-80% |
| 🎯 **报表分析** | 将重查询路由到专用分析节点 | 线上服务不受影响 |
| 🎯 **多租户系统** | 为不同租户使用不同的数据库连接 | 数据隔离和性能保障 |
| 🎯 **灾备切换** | 主库故障时自动切换到备库 | 故障恢复时间 < 5秒 |

### 版本要求

- **monSQLize**: ≥ v1.0.8
- **Node.js**: ≥ 14.x
- **MongoDB**: ≥ 4.0

### 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                    应用程序（Your App）                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              ConnectionPoolManager（连接池管理器）           │
│  ┌────────────────┬───────────────┬─────────────────────┐   │
│  │  PoolSelector  │ HealthChecker │    PoolStats        │   │
│  │  (选择策略)     │  (健康检查)    │   (统计信息)         │   │
│  └────────────────┴───────────────┴─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        连接池集合                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │ Primary   │  │Secondary-1│  │Secondary-2│  ...         │
│  │  (主库)   │  │ (副本1)   │  │ (副本2)   │              │
│  └───────────┘  └───────────┘  └───────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    MongoDB 集群                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 安装

```bash
npm install monsqlize@1.0.8
# 或
yarn add monsqlize@1.0.8
```

### 5分钟上手

**第一步：导入模块**
```javascript
const { ConnectionPoolManager } = require('monsqlize');
```

**第二步：创建管理器**
```javascript
const manager = new ConnectionPoolManager({
    maxPoolsCount: 10,
    poolStrategy: 'auto',
    logger: console
});
```

**第三步：添加连接池**
```javascript
// 添加主库
await manager.addPool({
    name: 'primary',
    uri: 'mongodb://localhost:27017/mydb',
    role: 'primary'
});

// 添加只读副本
await manager.addPool({
    name: 'secondary',
    uri: 'mongodb://localhost:27018/mydb',
    role: 'secondary'
});
```

**第四步：启动健康检查**
```javascript
manager.startHealthCheck();
```

**第五步：使用连接池**
```javascript
// 自动选择最佳连接池（读操作会选择 secondary）
const pool = manager.selectPool('read');

// 执行查询
const users = await pool.collection('users').find({ status: 'active' }).toArray();

console.log(`查询到 ${users.length} 个用户`);
```

**完成！** 🎉

### 完整示例

```javascript
const { ConnectionPoolManager } = require('monsqlize');

async function main() {
    // 1. 创建管理器
    const manager = new ConnectionPoolManager({
        maxPoolsCount: 10,
        poolStrategy: 'auto',
        fallback: {
            enabled: true,
            fallbackStrategy: 'readonly'
        },
        logger: console
    });

    try {
        // 2. 添加主库
        await manager.addPool({
            name: 'primary',
            uri: 'mongodb://primary.example.com:27017/mydb',
            role: 'primary',
            weight: 1,
            options: {
                maxPoolSize: 100,
                minPoolSize: 10
            },
            healthCheck: {
                enabled: true,
                interval: 5000,
                timeout: 3000,
                retries: 3
            }
        });

        // 3. 添加副本（用于读）
        await manager.addPool({
            name: 'secondary-1',
            uri: 'mongodb://replica1.example.com:27017/mydb',
            role: 'secondary',
            weight: 2
        });

        await manager.addPool({
            name: 'secondary-2',
            uri: 'mongodb://replica2.example.com:27017/mydb',
            role: 'secondary',
            weight: 2
        });

        // 4. 添加分析节点
        await manager.addPool({
            name: 'analytics',
            uri: 'mongodb://analytics.example.com:27017/mydb',
            role: 'analytics',
            tags: ['heavy-query', 'report']
        });

        // 5. 启动健康检查
        manager.startHealthCheck();

        // 6. 写操作（自动使用 primary）
        const writePool = manager.selectPool('write');
        await writePool.collection('orders').insertOne({
            userId: 123,
            amount: 99.99,
            createdAt: new Date()
        });

        // 7. 读操作（自动使用 secondary）
        const readPool = manager.selectPool('read');
        const orders = await readPool.collection('orders')
            .find({ userId: 123 })
            .toArray();

        console.log(`用户订单数: ${orders.length}`);

        // 8. 重查询（使用 analytics 节点）
        const analyticsPool = manager.selectPool('read', { 
            poolPreference: { role: 'analytics' } 
        });
        const stats = await analyticsPool.collection('orders').aggregate([
            { $group: { _id: '$userId', totalAmount: { $sum: '$amount' } } },
            { $sort: { totalAmount: -1 } },
            { $limit: 10 }
        ]).toArray();

        console.log('Top 10 用户:', stats);

        // 9. 监控连接池状态
        const poolStats = manager.getPoolStats();
        console.log('连接池统计:', poolStats);

        const health = manager.getPoolHealth();
        console.log('健康状态:', Array.from(health.entries()));

    } catch (error) {
        console.error('错误:', error);
    } finally {
        // 10. 清理资源
        await manager.close();
    }
}

main().catch(console.error);
```

---

## 核心概念

### 连接池角色

连接池角色定义了连接池的用途和行为。

| 角色 | 用途 | 推荐使用场景 | 示例 |
|------|------|------------|------|
| **primary** | 主库，处理写操作和重要读操作 | 所有写操作、强一致性读 | 订单创建、用户注册 |
| **secondary** | 只读副本，处理普通读操作 | 列表查询、详情查询 | 商品列表、用户信息 |
| **analytics** | 分析节点，处理重查询 | 报表、统计、聚合查询 | 销售报表、数据分析 |
| **custom** | 自定义角色 | 特殊业务需求 | 特定租户、测试环境 |

**角色选择逻辑**（auto 策略）:
```
写操作(write) → primary
读操作(read)  → secondary（优先） → primary（fallback）
分析查询      → analytics（手动指定）
```

### 选择策略

选择策略决定如何在多个连接池之间分配请求。

| 策略 | 说明 | 算法 | 适用场景 |
|------|------|------|---------|
| **auto** | 自动策略（推荐） | 根据操作类型和角色选择 | 大多数场景 |
| **roundRobin** | 轮询策略 | 依次轮询每个连接池 | 负载均衡 |
| **weighted** | 加权轮询 | 按权重比例分配 | 服务器性能差异大 |
| **leastConnections** | 最少连接 | 选择当前连接数最少的池 | 连接数敏感 |
| **manual** | 手动指定 | 必须手动指定池名称 | 特殊业务逻辑 |

**策略示例**:
```javascript
// auto: 自动根据操作类型选择
const pool = manager.selectPool('read');  // → secondary

// roundRobin: 轮询
// 第1次 → pool1, 第2次 → pool2, 第3次 → pool3, 第4次 → pool1...

// weighted: 权重 1:3
// pool1(weight=1): 25%
// pool2(weight=3): 75%

// leastConnections: 当前连接数
// pool1: 10 connections → 不选
// pool2: 5 connections  → 选择 ✅

// manual: 手动指定
const pool = manager.selectPool('read', { pool: 'analytics' });
```

### 健康检查

健康检查定期检测连接池是否可用，自动标记故障池。

**健康状态**:

| 状态 | 说明 | 行为 | 恢复方式 |
|------|------|------|---------|
| **up** | 健康 | 正常使用 | - |
| **down** | 故障 | 不使用，等待恢复 | 健康检查成功后自动恢复 |
| **unknown** | 未知 | 初始状态，谨慎使用 | 首次健康检查后确定 |

**检查机制**:
1. 使用 `db.admin().ping()` 命令
2. 设置超时时间（默认 3000ms）
3. 连续失败达到阈值（默认 3次）→ 标记为 down
4. down 状态仍会继续检查
5. 成功一次 → 立即恢复为 up

### 故障转移

当连接池故障时，自动切换到其他健康的连接池。

**降级策略**:

| 策略 | 行为 | 适用场景 |
|------|------|---------|
| **error** | 抛出错误 | 严格模式，不允许降级 |
| **readonly** | 只允许读操作 | 主库故障时允许只读 |
| **secondary** | 使用 secondary | 优先使用副本 |

**故障转移流程**:
```
请求 → 选择连接池
  ↓
检查健康状态
  ├─ up → 使用 ✅
  └─ down → 故障转移
      ↓
  选择其他健康池
      ├─ 找到 → 使用 ✅
      └─ 未找到 → 降级策略
          ├─ error → 抛出错误 ❌
          ├─ readonly → 只读模式 ⚠️
          └─ secondary → 使用副本 ✅
```

---

## API 详细文档

### ConnectionPoolManager

连接池管理器是多连接池功能的核心类。

#### 构造函数

创建一个新的连接池管理器实例。

**语法**:
```typescript
new ConnectionPoolManager(options?: ManagerOptions)
```

**参数**:

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| options | object | 否 | {} | 管理器配置 |
| options.maxPoolsCount | number | 否 | 10 | 最大连接池数量（1-100） |
| options.poolStrategy | string | 否 | 'auto' | 选择策略 |
| options.poolFallback | object | 否 | - | 故障转移配置 |
| options.logger | object | 否 | console | 日志对象 |

**示例**:
```javascript
const manager = new ConnectionPoolManager({
    maxPoolsCount: 10,
    poolStrategy: 'auto',
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'readonly',
        retryDelay: 1000,
        maxRetries: 3
    },
    logger: console
});
```

#### addPool()

添加一个新的连接池。

**语法**:
```typescript
async addPool(config: PoolConfig): Promise<void>
```

**参数**:

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| config.name | string | ✅ 是 | - | 连接池唯一名称 |
| config.uri | string | ✅ 是 | - | MongoDB 连接字符串 |
| config.role | string | 否 | undefined | 角色: primary/secondary/analytics |
| config.weight | number | 否 | 1 | 权重（1-100） |
| config.tags | string[] | 否 | [] | 标签数组 |
| config.options | object | 否 | {} | MongoDB 连接选项 |
| config.healthCheck | object | 否 | - | 健康检查配置 |

**返回值**:
- `Promise<void>`: 成功时 resolve，失败时 reject

**抛出的错误**:
- `Error: Pool '${name}' already exists` - 连接池名称重复
- `Error: Maximum pool count (${max}) reached` - 达到连接池数量限制
- `MongoServerError` - MongoDB 连接失败

**示例**:

```javascript
// 基础示例
await manager.addPool({
    name: 'primary',
    uri: 'mongodb://localhost:27017/mydb',
    role: 'primary'
});

// 完整示例
await manager.addPool({
    name: 'secondary-1',
    uri: 'mongodb://replica1.example.com:27017/mydb',
    role: 'secondary',
    weight: 2,
    tags: ['replica', 'read-only', 'production'],
    options: {
        maxPoolSize: 50,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 10000,
        connectTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000
    },
    healthCheck: {
        enabled: true,
        interval: 5000,
        timeout: 3000,
        retries: 3
    }
});
```

**注意事项**:
1. ⚠️ 连接池名称必须唯一
2. ⚠️ 添加时会立即尝试连接 MongoDB
3. ✅ 如果健康检查已启动，新池会自动开始检查
4. ✅ 建议在应用启动时添加所有连接池

#### removePool()

移除一个现有的连接池。

**语法**:
```typescript
async removePool(name: string): Promise<void>
```

**参数**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| name | string | ✅ 是 | 连接池名称 |

**返回值**:
- `Promise<void>`: 成功时 resolve

**抛出的错误**:
- `Error: Pool '${name}' not found` - 连接池不存在

**示例**:
```javascript
// 移除指定连接池
await manager.removePool('secondary-1');

// 带错误处理
try {
    await manager.removePool('non-existent');
} catch (error) {
    if (error.message.includes('not found')) {
        console.log('连接池不存在');
    }
}
```

**注意事项**:
1. ✅ 会自动关闭 MongoDB 连接
2. ✅ 会自动停止该池的健康检查
3. ✅ 会清理相关的统计信息
4. ⚠️ 移除后无法再使用该连接池

#### selectPool()

根据策略选择一个合适的连接池。

**语法**:
```typescript
selectPool(operation: string, options?: SelectOptions): PoolResult
```

**参数**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| operation | string | ✅ 是 | 操作类型: 'read' / 'write' |
| options | object | 否 | 选择选项 |
| options.pool | string | 否 | 手动指定池名称 |
| options.poolPreference | object | 否 | 连接池偏好 |
| options.poolPreference.role | string | 否 | 优先角色 |
| options.poolPreference.tags | string[] | 否 | 优先标签 |

**返回值**:
```typescript
{
    name: string,              // 连接池名称
    client: MongoClient,       // MongoDB 客户端
    db: Db,                    // 数据库对象
    collection: (name) => Collection  // collection 访问器
}
```

**抛出的错误**:
- `Error: Pool '${name}' not found` - 指定的连接池不存在
- `Error: No available connection pool` - 没有可用的连接池

**示例**:
```javascript
// 自动选择（read → secondary）
const pool = manager.selectPool('read');

// 自动选择（write → primary）
const writePool = manager.selectPool('write');

// 手动指定
const specificPool = manager.selectPool('read', { 
    pool: 'secondary-1' 
});

// 根据角色偏好
const analyticsPool = manager.selectPool('read', { 
    poolPreference: { role: 'analytics' } 
});

// 根据标签偏好
const taggedPool = manager.selectPool('read', { 
    poolPreference: { tags: ['production'] } 
});

// 使用返回的连接池
const users = await pool.collection('users').find({}).toArray();
const db = pool.db;
const client = pool.client;
```

**注意事项**:
1. ✅ 自动选择只使用健康（up）的连接池
2. ✅ 如果所有池都故障，会触发降级策略
3. ⚠️ manual 策略必须手动指定 pool 参数

#### getPoolNames()

获取所有连接池的名称。

**语法**:
```typescript
getPoolNames(): string[]
```

**返回值**:
- `string[]`: 连接池名称数组

**示例**:
```javascript
const names = manager.getPoolNames();
console.log(names);  // ['primary', 'secondary-1', 'secondary-2']

// 检查连接池是否存在
if (names.includes('analytics')) {
    console.log('分析节点已配置');
}

// 统计连接池数量
console.log(`当前有 ${names.length} 个连接池`);
```

#### getPoolStats()

获取所有连接池的统计信息。

**语法**:
```typescript
getPoolStats(): Record<string, PoolStats>
```

**返回值**:
```typescript
{
    [poolName: string]: {
        status: 'up' | 'down' | 'unknown',
        connections: number,       // 当前连接数
        available: number,         // 可用连接数
        waiting: number,           // 等待连接数
        avgResponseTime: number,   // 平均响应时间（毫秒）
        totalRequests: number,     // 总请求数
        errorRate: number          // 错误率（0-1）
    }
}
```

**示例**:
```javascript
const stats = manager.getPoolStats();

// 打印所有统计
console.log(stats);
// {
//   'primary': { status: 'up', connections: 45, ... },
//   'secondary-1': { status: 'up', connections: 78, ... }
// }

// 分析单个池
const primaryStats = stats['primary'];
console.log(`主库连接数: ${primaryStats.connections}`);
console.log(`平均响应时间: ${primaryStats.avgResponseTime}ms`);
console.log(`错误率: ${(primaryStats.errorRate * 100).toFixed(2)}%`);

// 找出最繁忙的池
const entries = Object.entries(stats);
const busiest = entries.sort((a, b) => 
    b[1].totalRequests - a[1].totalRequests
)[0];
console.log(`最繁忙的池: ${busiest[0]} (${busiest[1].totalRequests} 请求)`);

// 监控告警
for (const [name, stat] of entries) {
    if (stat.errorRate > 0.05) {  // 错误率 > 5%
        console.warn(`⚠️ ${name} 错误率过高: ${(stat.errorRate * 100).toFixed(2)}%`);
    }
    if (stat.avgResponseTime > 100) {  // 响应时间 > 100ms
        console.warn(`⚠️ ${name} 响应慢: ${stat.avgResponseTime}ms`);
    }
}
```

#### getPoolHealth()

获取所有连接池的健康状态。

**语法**:
```typescript
getPoolHealth(): Map<string, HealthStatus>
```

**返回值**:
```typescript
Map<string, {
    status: 'up' | 'down' | 'unknown',
    consecutiveFailures: number,   // 连续失败次数
    lastCheck: number,             // 最后检查时间戳
    lastSuccess: number,           // 最后成功时间戳
    lastError: Error | null        // 最后错误信息
}>
```

**示例**:
```javascript
const health = manager.getPoolHealth();

// 打印所有健康状态
for (const [name, status] of health.entries()) {
    console.log(`${name}: ${status.status}`);
}

// 检查是否有故障池
const downPools = [];
for (const [name, status] of health.entries()) {
    if (status.status === 'down') {
        downPools.push(name);
    }
}

if (downPools.length > 0) {
    console.error(`⚠️ 故障池: ${downPools.join(', ')}`);
}

// 详细健康报告
for (const [name, status] of health.entries()) {
    const lastCheckTime = new Date(status.lastCheck).toISOString();
    console.log(`
池名称: ${name}
状态: ${status.status}
连续失败: ${status.consecutiveFailures}
最后检查: ${lastCheckTime}
    `.trim());
}
```

#### startHealthCheck()

启动健康检查。

**语法**:
```typescript
startHealthCheck(): void
```

**示例**:
```javascript
// 启动健康检查（对所有启用了健康检查的池生效）
manager.startHealthCheck();

// 重复调用不会重复启动
manager.startHealthCheck();  // 无影响
```

**注意事项**:
1. ✅ 只对配置了 `healthCheck.enabled: true` 的池生效
2. ✅ 重复调用不会重复启动
3. ✅ 建议在添加完所有连接池后启动

#### stopHealthCheck()

停止健康检查。

**语法**:
```typescript
stopHealthCheck(): void
```

**示例**:
```javascript
// 停止健康检查
manager.stopHealthCheck();
```

#### close()

关闭管理器，释放所有资源。

**语法**:
```typescript
async close(): Promise<void>
```

**示例**:
```javascript
// 关闭管理器
await manager.close();

// 带错误处理
try {
    await manager.close();
    console.log('连接池管理器已关闭');
} catch (error) {
    console.error('关闭失败:', error);
}

// 在应用退出时清理
process.on('SIGTERM', async () => {
    await manager.close();
    process.exit(0);
});
```

**行为**:
1. ✅ 停止所有健康检查
2. ✅ 关闭所有 MongoDB 连接
3. ✅ 清空所有连接池和配置
4. ✅ 标记管理器为已关闭状态

**注意事项**:
- ⚠️ 关闭后无法再使用该管理器
- ⚠️ 确保所有操作完成后再关闭
- ✅ 建议在应用退出时调用

---

### 返回值结构

#### PoolResult（selectPool 返回值）

```typescript
interface PoolResult {
    // 连接池名称
    name: string;
    
    // MongoDB 原生客户端
    client: MongoClient;
    
    // 数据库对象（已选择正确的 database）
    db: Db;
    
    // Collection 访问器
    collection: (collectionName: string) => Collection;
}
```

**使用示例**:
```javascript
const pool = manager.selectPool('read');

// 方式1: 使用 collection 访问器（推荐）
const users = await pool.collection('users').find({}).toArray();

// 方式2: 使用 db 对象
const orders = await pool.db.collection('orders').find({}).toArray();

// 方式3: 使用原生 client
const client = pool.client;
const adminDb = client.db('admin');
await adminDb.admin().ping();
```

---

## 配置详解

### 管理器配置

```typescript
interface ManagerOptions {
    // 最大连接池数量
    maxPoolsCount?: number;        // 默认: 10, 范围: 1-100
    
    // 选择策略
    poolStrategy?: 'auto' | 'roundRobin' | 'weighted' | 'leastConnections' | 'manual';
    // 默认: 'auto'
    
    // 故障转移配置
    poolFallback?: {
        enabled?: boolean;         // 默认: true
        fallbackStrategy?: 'error' | 'readonly' | 'secondary';
        // 默认: 'readonly'
        retryDelay?: number;       // 默认: 1000 (毫秒)
        maxRetries?: number;       // 默认: 3
    };
    
    // 日志对象
    logger?: {
        info: (message: string, meta?: any) => void;
        warn: (message: string, meta?: any) => void;
        error: (message: string, meta?: any) => void;
    };
}
```

### 连接池配置

```typescript
interface PoolConfig {
    // === 必需参数 ===
    name: string;                    // 唯一名称
    uri: string;                     // MongoDB 连接字符串
    
    // === 可选参数 ===
    role?: 'primary' | 'secondary' | 'analytics' | 'custom';
    weight?: number;                 // 权重 (1-100)
    tags?: string[];                 // 标签数组
    
    // === MongoDB 连接选项 ===
    options?: {
        maxPoolSize?: number;        // 默认: 100
        minPoolSize?: number;        // 默认: 10
        maxIdleTimeMS?: number;      // 默认: 30000
        waitQueueTimeoutMS?: number; // 默认: 10000
        connectTimeoutMS?: number;   // 默认: 5000
        serverSelectionTimeoutMS?: number; // 默认: 5000
    };
    
    // === 健康检查配置 ===
    healthCheck?: {
        enabled?: boolean;           // 默认: false
        interval?: number;           // 默认: 5000 (毫秒)
        timeout?: number;            // 默认: 3000 (毫秒)
        retries?: number;            // 默认: 3
    };
}
```

### 健康检查配置

| 参数 | 类型 | 默认值 | 说明 | 建议值 |
|------|------|--------|------|--------|
| enabled | boolean | false | 是否启用 | true（生产环境） |
| interval | number | 5000 | 检查间隔（毫秒） | 5000-10000 |
| timeout | number | 3000 | 检查超时（毫秒） | 3000-5000 |
| retries | number | 3 | 失败重试次数 | 3-5 |

**配置建议**:
```javascript
// 生产环境（推荐）
healthCheck: {
    enabled: true,
    interval: 5000,   // 5秒检查一次
    timeout: 3000,    // 3秒超时
    retries: 3        // 失败3次标记为down
}

// 高可用场景（更频繁检查）
healthCheck: {
    enabled: true,
    interval: 2000,   // 2秒检查一次
    timeout: 2000,    // 2秒超时
    retries: 2        // 失败2次立即切换
}

// 低负载场景（降低检查频率）
healthCheck: {
    enabled: true,
    interval: 10000,  // 10秒检查一次
    timeout: 5000,    // 5秒超时
    retries: 5        // 更宽容的重试
}
```

### 故障转移配置

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | boolean | true | 是否启用故障转移 |
| fallbackStrategy | string | 'readonly' | 降级策略 |
| retryDelay | number | 1000 | 重试延迟（毫秒） |
| maxRetries | number | 3 | 最大重试次数 |

**降级策略对比**:

| 策略 | 行为 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|---------|
| error | 抛出错误 | 严格，不降级 | 服务不可用 | 严格一致性要求 |
| readonly | 只读模式 | 保证读服务 | 写操作失败 | 读多写少 |
| secondary | 使用副本 | 完全降级 | 可能数据延迟 | 高可用优先 |

### 配置示例

#### 小型应用（<1000 QPS）

```javascript
const manager = new ConnectionPoolManager({
    maxPoolsCount: 5,
    poolStrategy: 'auto'
});

await manager.addPool({
    name: 'primary',
    uri: 'mongodb://localhost:27017/mydb',
    role: 'primary',
    options: {
        maxPoolSize: 50,
        minPoolSize: 5
    }
});

await manager.addPool({
    name: 'secondary',
    uri: 'mongodb://localhost:27018/mydb',
    role: 'secondary',
    options: {
        maxPoolSize: 100,
        minPoolSize: 10
    }
});
```

#### 中型应用（1000-10000 QPS）

```javascript
const manager = new ConnectionPoolManager({
    maxPoolsCount: 10,
    poolStrategy: 'weighted',
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'readonly'
    }
});

// 主库
await manager.addPool({
    name: 'primary',
    uri: process.env.MONGO_PRIMARY_URI,
    role: 'primary',
    weight: 1,
    options: {
        maxPoolSize: 100,
        minPoolSize: 20
    },
    healthCheck: {
        enabled: true,
        interval: 5000,
        timeout: 3000,
        retries: 3
    }
});

// 2个副本（读）
for (let i = 1; i <= 2; i++) {
    await manager.addPool({
        name: `secondary-${i}`,
        uri: process.env[`MONGO_SECONDARY_${i}_URI`],
        role: 'secondary',
        weight: 2,
        options: {
            maxPoolSize: 200,
            minPoolSize: 50
        },
        healthCheck: {
            enabled: true,
            interval: 5000
        }
    });
}
```

#### 大型应用（>10000 QPS）

```javascript
const manager = new ConnectionPoolManager({
    maxPoolsCount: 20,
    poolStrategy: 'leastConnections',
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'secondary',
        retryDelay: 500,
        maxRetries: 5
    },
    logger: customLogger
});

// 主库（双主）
await manager.addPool({
    name: 'primary-1',
    uri: process.env.MONGO_PRIMARY_1_URI,
    role: 'primary',
    weight: 1,
    options: {
        maxPoolSize: 200,
        minPoolSize: 50,
        maxIdleTimeMS: 60000,
        waitQueueTimeoutMS: 5000
    },
    healthCheck: {
        enabled: true,
        interval: 2000,
        timeout: 2000,
        retries: 2
    }
});

await manager.addPool({
    name: 'primary-2',
    uri: process.env.MONGO_PRIMARY_2_URI,
    role: 'primary',
    weight: 1,
    options: { maxPoolSize: 200, minPoolSize: 50 },
    healthCheck: { enabled: true, interval: 2000 }
});

// 4个副本（读）
for (let i = 1; i <= 4; i++) {
    await manager.addPool({
        name: `secondary-${i}`,
        uri: process.env[`MONGO_SECONDARY_${i}_URI`],
        role: 'secondary',
        weight: 3,
        options: {
            maxPoolSize: 500,
            minPoolSize: 100
        },
        healthCheck: {
            enabled: true,
            interval: 3000
        }
    });
}

// 2个分析节点
for (let i = 1; i <= 2; i++) {
    await manager.addPool({
        name: `analytics-${i}`,
        uri: process.env[`MONGO_ANALYTICS_${i}_URI`],
        role: 'analytics',
        tags: ['heavy-query', 'report'],
        options: {
            maxPoolSize: 100,
            minPoolSize: 10
        },
        healthCheck: {
            enabled: true,
            interval: 10000
        }
    });
}
```

---

## 使用场景

### 读写分离

**场景**: 读操作占比 80%，写操作占比 20%

**方案**:
```javascript
// 1主 + 2副本
await manager.addPool({ name: 'primary', role: 'primary', ... });
await manager.addPool({ name: 'sec-1', role: 'secondary', ... });
await manager.addPool({ name: 'sec-2', role: 'secondary', ... });

// 写操作自动使用主库
const writePool = manager.selectPool('write');
await writePool.collection('orders').insertOne({...});

// 读操作自动使用副本
const readPool = manager.selectPool('read');
const orders = await readPool.collection('orders').find({}).toArray();
```

**收益**:
- ✅ 主库写压力不变
- ✅ 读压力分散到 2 个副本
- ✅ 主库负载降低 ~80%

### 负载均衡

**场景**: 多个副本性能不同

**方案**:
```javascript
// 使用加权策略
const manager = new ConnectionPoolManager({
    poolStrategy: 'weighted'
});

// 高性能服务器权重高
await manager.addPool({
    name: 'high-perf',
    role: 'secondary',
    weight: 5  // 83% 流量
});

// 普通服务器权重低
await manager.addPool({
    name: 'normal',
    role: 'secondary',
    weight: 1  // 17% 流量
});
```

### 报表分析

**场景**: 定时生成报表，不影响线上服务

**方案**:
```javascript
// 专用分析节点
await manager.addPool({
    name: 'analytics',
    uri: 'mongodb://analytics.example.com:27017/mydb',
    role: 'analytics',
    tags: ['report', 'heavy-query']
});

// 报表查询使用分析节点
const analyticsPool = manager.selectPool('read', {
    poolPreference: { role: 'analytics' }
});

const salesReport = await analyticsPool.collection('orders').aggregate([
    { $match: { date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: '$category', totalSales: { $sum: '$amount' } } },
    { $sort: { totalSales: -1 } }
]).toArray();
```

### 多租户系统

**场景**: 为不同租户使用不同的连接池

**方案**:
```javascript
// 租户 A（VIP）
await manager.addPool({
    name: 'tenant-a',
    uri: 'mongodb://db-a.example.com:27017/tenant_a',
    tags: ['vip', 'tenant-a'],
    options: {
        maxPoolSize: 200  // 更大的连接池
    }
});

// 租户 B（普通）
await manager.addPool({
    name: 'tenant-b',
    uri: 'mongodb://db-b.example.com:27017/tenant_b',
    tags: ['normal', 'tenant-b'],
    options: {
        maxPoolSize: 50
    }
});

// 根据租户选择
const tenantId = req.user.tenantId;
const pool = manager.selectPool('read', {
    pool: `tenant-${tenantId}`
});
```

### 灾备切换

**场景**: 主库故障时自动切换到备库

**方案**:
```javascript
// 启用故障转移
const manager = new ConnectionPoolManager({
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'secondary',  // 主库故障时使用副本
        maxRetries: 3
    }
});

// 主库
await manager.addPool({
    name: 'primary',
    role: 'primary',
    healthCheck: {
        enabled: true,
        interval: 2000,  // 快速检测故障
        retries: 2
    }
});

// 备库（可写）
await manager.addPool({
    name: 'standby',
    role: 'primary',  // 同样配置为 primary 角色
    healthCheck: { enabled: true, interval: 2000 }
});

manager.startHealthCheck();

// 主库故障时自动切换到备库
const pool = manager.selectPool('write');  // 自动选择健康的 primary
```

---

## 最佳实践

### 连接池规划

#### 连接池数量建议

| 应用规模 | QPS | 建议连接池数 | 配置 |
|---------|-----|------------|------|
| 小型 | <1K | 2-3 | 1主 + 1-2副本 |
| 中型 | 1K-10K | 4-8 | 1-2主 + 3-6副本 |
| 大型 | >10K | 8-20 | 2-4主 + 6-16副本 |

#### maxPoolSize 建议

```javascript
// 公式：maxPoolSize = 预期并发数 × 1.2
// 示例：1000 并发 → maxPoolSize = 1200

// 小型应用
options: {
    maxPoolSize: 50,
    minPoolSize: 5
}

// 中型应用
options: {
    maxPoolSize: 200,
    minPoolSize: 20
}

// 大型应用
options: {
    maxPoolSize: 500,
    minPoolSize: 50
}
```

### 性能优化

#### 1. 合理设置权重

```javascript
// 根据服务器性能设置权重
// CPU 强劲的服务器权重高
await manager.addPool({
    name: 'high-cpu',
    weight: 5,
    options: { maxPoolSize: 500 }
});

// 普通服务器权重低
await manager.addPool({
    name: 'normal',
    weight: 1,
    options: { maxPoolSize: 100 }
});
```

#### 2. 减少连接池切换

```javascript
// 使用 leastConnections 策略减少切换
const manager = new ConnectionPoolManager({
    poolStrategy: 'leastConnections'
});
```

#### 3. 优化健康检查

```javascript
// 生产环境：5秒间隔足够
healthCheck: {
    interval: 5000,
    timeout: 3000
}

// 不要太频繁，避免额外开销
// ❌ 不推荐
healthCheck: {
    interval: 500  // 太频繁
}
```

### 监控和告警

#### 定期监控

```javascript
// 每分钟检查一次
setInterval(() => {
    const stats = manager.getPoolStats();
    const health = manager.getPoolHealth();
    
    // 发送到监控系统
    sendToMonitoring({
        timestamp: Date.now(),
        stats,
        health: Array.from(health.entries())
    });
}, 60000);
```

#### 告警规则

```javascript
function checkAlerts() {
    const stats = manager.getPoolStats();
    const health = manager.getPoolHealth();
    
    // 1. 检查故障池
    for (const [name, status] of health.entries()) {
        if (status.status === 'down') {
            sendAlert({
                level: 'critical',
                message: `连接池 ${name} 故障`,
                details: status
            });
        }
    }
    
    // 2. 检查错误率
    for (const [name, stat] of Object.entries(stats)) {
        if (stat.errorRate > 0.05) {  // >5%
            sendAlert({
                level: 'warning',
                message: `连接池 ${name} 错误率过高`,
                errorRate: `${(stat.errorRate * 100).toFixed(2)}%`
            });
        }
    }
    
    // 3. 检查响应时间
    for (const [name, stat] of Object.entries(stats)) {
        if (stat.avgResponseTime > 100) {  // >100ms
            sendAlert({
                level: 'warning',
                message: `连接池 ${name} 响应慢`,
                avgResponseTime: `${stat.avgResponseTime}ms`
            });
        }
    }
    
    // 4. 检查连接数
    for (const [name, stat] of Object.entries(stats)) {
        const usage = stat.connections / stat.maxPoolSize;
        if (usage > 0.9) {  // >90%
            sendAlert({
                level: 'warning',
                message: `连接池 ${name} 接近满载`,
                usage: `${(usage * 100).toFixed(1)}%`
            });
        }
    }
}

// 每30秒检查一次
setInterval(checkAlerts, 30000);
```

### 生产环境配置

#### 完整生产环境示例

```javascript
const { ConnectionPoolManager } = require('monsqlize');
const winston = require('winston');

// 自定义日志
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'pool-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'pool-combined.log' })
    ]
});

// 创建管理器
const manager = new ConnectionPoolManager({
    maxPoolsCount: 20,
    poolStrategy: 'leastConnections',
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'secondary',
        retryDelay: 500,
        maxRetries: 5
    },
    logger
});

// 从环境变量加载配置
async function initPools() {
    const pools = JSON.parse(process.env.MONGO_POOLS || '[]');
    
    for (const config of pools) {
        await manager.addPool({
            ...config,
            healthCheck: {
                enabled: true,
                interval: 5000,
                timeout: 3000,
                retries: 3
            }
        });
    }
    
    manager.startHealthCheck();
    logger.info(`连接池管理器已初始化，共 ${pools.length} 个池`);
}

// 优雅退出
async function gracefulShutdown() {
    logger.info('正在关闭连接池管理器...');
    await manager.close();
    logger.info('连接池管理器已关闭');
    process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 启动
initPools().catch(error => {
    logger.error('初始化失败:', error);
    process.exit(1);
});

module.exports = manager;
```

#### 环境变量配置

```.env
MONGO_POOLS=[
  {
    "name": "primary",
    "uri": "mongodb://user:pass@primary.example.com:27017/mydb?replicaSet=rs0",
    "role": "primary",
    "weight": 1,
    "options": {
      "maxPoolSize": 200,
      "minPoolSize": 50
    }
  },
  {
    "name": "secondary-1",
    "uri": "mongodb://user:pass@replica1.example.com:27017/mydb?replicaSet=rs0",
    "role": "secondary",
    "weight": 2,
    "options": {
      "maxPoolSize": 500,
      "minPoolSize": 100
    }
  },
  {
    "name": "secondary-2",
    "uri": "mongodb://user:pass@replica2.example.com:27017/mydb?replicaSet=rs0",
    "role": "secondary",
    "weight": 2,
    "options": {
      "maxPoolSize": 500,
      "minPoolSize": 100
    }
  }
]
```

---

## 故障排查

### 常见问题

#### 问题1: 连接池无法添加

**现象**:
```javascript
await manager.addPool({...});
// Error: Maximum pool count (10) reached
```

**原因**: 达到最大连接池数量限制

**解决**:
```javascript
// 增加 maxPoolsCount
const manager = new ConnectionPoolManager({
    maxPoolsCount: 20  // 增加到20
});
```

#### 问题2: 健康检查不工作

**现象**: 连接池故障但状态仍为 up

**原因**: 未启动健康检查或未配置

**解决**:
```javascript
// 1. 配置健康检查
await manager.addPool({
    name: 'primary',
    uri: '...',
    healthCheck: {
        enabled: true  // 必须启用
    }
});

// 2. 启动健康检查
manager.startHealthCheck();  // 必须调用
```

#### 问题3: selectPool 抛出错误

**现象**:
```javascript
const pool = manager.selectPool('read');
// Error: No available connection pool
```

**原因**: 所有连接池都故障或未添加连接池

**解决**:
```javascript
// 1. 检查健康状态
const health = manager.getPoolHealth();
console.log(Array.from(health.entries()));

// 2. 启用故障转移
const manager = new ConnectionPoolManager({
    poolFallback: {
        enabled: true,
        fallbackStrategy: 'secondary'
    }
});

// 3. 确保至少添加了一个连接池
const names = manager.getPoolNames();
console.log(`当前连接池数: ${names.length}`);
```

#### 问题4: 错误率高

**现象**: getPoolStats() 显示 errorRate > 0.1

**原因**: 
- 网络不稳定
- MongoDB 负载过高
- 查询超时

**解决**:
```javascript
// 1. 增加超时时间
await manager.addPool({
    name: 'primary',
    uri: '...',
    options: {
        connectTimeoutMS: 10000,        // 10秒
        serverSelectionTimeoutMS: 10000 // 10秒
    }
});

// 2. 检查 MongoDB 负载
const pool = manager.selectPool('read');
const serverStatus = await pool.db.admin().serverStatus();
console.log('MongoDB负载:', serverStatus);

// 3. 增加连接池大小
options: {
    maxPoolSize: 500  // 增加
}
```

### 错误代码

| 错误信息 | 原因 | 解决方法 |
|---------|------|---------|
| `Pool '${name}' already exists` | 连接池名称重复 | 使用唯一名称 |
| `Pool '${name}' not found` | 连接池不存在 | 检查名称拼写 |
| `Maximum pool count (${max}) reached` | 达到数量限制 | 增加 maxPoolsCount |
| `No available connection pool` | 无可用连接池 | 检查健康状态或添加连接池 |
| `MongoServerError` | MongoDB 连接失败 | 检查 URI、网络、认证 |

### 调试技巧

#### 启用详细日志

```javascript
const manager = new ConnectionPoolManager({
    logger: {
        info: (msg, meta) => console.log('[INFO]', msg, meta),
        warn: (msg, meta) => console.warn('[WARN]', msg, meta),
        error: (msg, meta) => console.error('[ERROR]', msg, meta)
    }
});
```

#### 定期打印状态

```javascript
setInterval(() => {
    console.log('=== 连接池状态 ===');
    
    const names = manager.getPoolNames();
    console.log(`连接池数量: ${names.length}`);
    console.log(`连接池列表: ${names.join(', ')}`);
    
    const stats = manager.getPoolStats();
    console.table(stats);
    
    const health = manager.getPoolHealth();
    console.log('\n健康状态:');
    for (const [name, status] of health.entries()) {
        console.log(`  ${name}: ${status.status} (失败: ${status.consecutiveFailures})`);
    }
    
    console.log('==================\n');
}, 10000);  // 每10秒
```

#### 捕获所有错误

```javascript
process.on('unhandledRejection', (error) => {
    console.error('未处理的 Promise 错误:', error);
});

try {
    const pool = manager.selectPool('read');
    const data = await pool.collection('test').find({}).toArray();
} catch (error) {
    console.error('查询失败:', {
        name: error.name,
        message: error.message,
        stack: error.stack
    });
}
```

---

## 完整示例

### 基础示例

```javascript
const { ConnectionPoolManager } = require('monsqlize');

async function basicExample() {
    const manager = new ConnectionPoolManager();
    
    // 添加主库和副本
    await manager.addPool({
        name: 'primary',
        uri: 'mongodb://localhost:27017/mydb',
        role: 'primary'
    });
    
    await manager.addPool({
        name: 'secondary',
        uri: 'mongodb://localhost:27018/mydb',
        role: 'secondary'
    });
    
    manager.startHealthCheck();
    
    // 写操作
    const writePool = manager.selectPool('write');
    await writePool.collection('users').insertOne({
        name: 'Alice',
        email: 'alice@example.com'
    });
    
    // 读操作
    const readPool = manager.selectPool('read');
    const users = await readPool.collection('users').find({}).toArray();
    console.log(`用户数: ${users.length}`);
    
    await manager.close();
}

basicExample().catch(console.error);
```

### 高级示例

```javascript
const { ConnectionPoolManager } = require('monsqlize');

async function advancedExample() {
    // 创建管理器with完整配置
    const manager = new ConnectionPoolManager({
        maxPoolsCount: 10,
        poolStrategy: 'weighted',
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'secondary',
            retryDelay: 1000,
            maxRetries: 3
        },
        logger: console
    });
    
    // 添加主库（双主）
    for (let i = 1; i <= 2; i++) {
        await manager.addPool({
            name: `primary-${i}`,
            uri: `mongodb://primary${i}.example.com:27017/mydb`,
            role: 'primary',
            weight: 1,
            options: {
                maxPoolSize: 100,
                minPoolSize: 20
            },
            healthCheck: {
                enabled: true,
                interval: 5000,
                timeout: 3000,
                retries: 3
            }
        });
    }
    
    // 添加副本（4个）
    for (let i = 1; i <= 4; i++) {
        await manager.addPool({
            name: `secondary-${i}`,
            uri: `mongodb://replica${i}.example.com:27017/mydb`,
            role: 'secondary',
            weight: 2,
            tags: ['read-only', 'replica'],
            options: {
                maxPoolSize: 200,
                minPoolSize: 50
            },
            healthCheck: {
                enabled: true,
                interval: 5000
            }
        });
    }
    
    // 添加分析节点
    await manager.addPool({
        name: 'analytics',
        uri: 'mongodb://analytics.example.com:27017/mydb',
        role: 'analytics',
        tags: ['heavy-query', 'report'],
        options: {
            maxPoolSize: 50,
            minPoolSize: 10
        }
    });
    
    manager.startHealthCheck();
    
    // 监控循环
    const monitorInterval = setInterval(() => {
        const stats = manager.getPoolStats();
        const health = manager.getPoolHealth();
        
        console.log('\n=== 连接池监控 ===');
        console.log(`时间: ${new Date().toISOString()}`);
        
        for (const [name, stat] of Object.entries(stats)) {
            const healthStatus = health.get(name);
            console.log(`\n${name}:`);
            console.log(`  状态: ${healthStatus?.status || 'unknown'}`);
            console.log(`  连接数: ${stat.connections}`);
            console.log(`  平均响应: ${stat.avgResponseTime}ms`);
            console.log(`  总请求: ${stat.totalRequests}`);
            console.log(`  错误率: ${(stat.errorRate * 100).toFixed(2)}%`);
        }
    }, 60000);  // 每分钟
    
    // 业务逻辑
    try {
        // 写操作
        const writePool = manager.selectPool('write');
        await writePool.collection('orders').insertOne({
            userId: 123,
            amount: 99.99,
            createdAt: new Date()
        });
        
        // 读操作
        const readPool = manager.selectPool('read');
        const orders = await readPool.collection('orders')
            .find({ userId: 123 })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        
        // 分析查询
        const analyticsPool = manager.selectPool('read', {
            poolPreference: { role: 'analytics' }
        });
        const report = await analyticsPool.collection('orders').aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    totalAmount: { $sum: '$amount' },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).toArray();
        
        console.log('\n销售报表:', report);
        
    } finally {
        clearInterval(monitorInterval);
        await manager.close();
    }
}

advancedExample().catch(console.error);
```

### 生产环境示例

见 [生产环境配置](#生产环境配置)

---

## 相关文档

- [monSQLize 主文档](../README.md)
- [连接管理](./connection.md)
- [多连接池健康检查详解](./multi-pool-health-check.md) - 健康检查机制、问题处理、运维通知
- [Saga 分布式事务](./saga-transaction.md)
- [事务优化](./transaction-optimizations.md)
- [分布式部署](./distributed-deployment.md)


---

**文档版本**: v1.0.8  
**最后更新**: 2026-02-03  
**维护者**: monSQLize Team


---

## 📮 反馈与贡献

如果您发现文档错误或有改进建议，欢迎：
- 提交 Issue
- 提交 Pull Request
- 联系维护团队

**祝您使用愉快！** 🎉

