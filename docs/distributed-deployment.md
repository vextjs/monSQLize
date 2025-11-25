# 分布式部署指南

**版本**: v2.2.0  
**更新日期**: 2025-11-25

---

## 📚 目录

- [概述](#概述)
- [架构选择](#架构选择)
- [分布式环境下的风险](#分布式环境下的风险)
- [解决方案](#解决方案)
- [配置指南](#配置指南)
- [最佳实践](#最佳实践)
- [性能考虑](#性能考虑)
- [故障排查](#故障排查)

---

## 概述

monSQLize 支持单实例和多实例部署。在**单实例**环境下，所有缓存和事务机制都能完美工作。但在**多实例（分布式）**环境下，需要额外配置才能保证数据一致性。

### 为什么需要分布式支持？

在多实例部署中，每个实例都有独立的本地缓存和锁管理器。如果不做特殊处理，会导致：

1. ❌ **缓存不一致**：实例 A 更新数据后，实例 B 的本地缓存仍是旧数据
2. ❌ **事务隔离性失效**：实例 A 事务期间，实例 B 可能读到中间状态并写入缓存
3. ❌ **业务逻辑错误**：余额计算、库存扣减等场景可能出错

---

## 架构选择

### 1. 单实例部署（✅ 推荐：小型应用）

```
┌─────────────────────────────┐
│   Node.js 实例               │
│                              │
│  ┌───────────────┐          │
│  │ 本地缓存 LRU  │          │
│  └───────────────┘          │
└─────────────────────────────┘
         │
         ▼
    MongoDB (副本集)
```

**特点**：
- ✅ 所有功能完整支持
- ✅ 无需 Redis
- ✅ 配置简单
- ⚠️ 无高可用

**适用场景**：
- 开发/测试环境
- 流量不大的生产环境
- 单体应用

**配置示例**：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    maxSize: 1000,
    ttl: 60000
  }
});
```

---

### 2. 多实例 + 独立本地缓存（🔴 不推荐）

```
┌───────────────────┐    ┌───────────────────┐
│  实例 A           │    │  实例 B           │
│ ┌──────────┐      │    │ ┌──────────┐      │
│ │本地缓存A │      │    │ │本地缓存B │      │
│ └──────────┘      │    │ └──────────┘      │
└────────┬──────────┘    └────────┬──────────┘
         │                         │
         └────────┬────────────────┘
                  ▼
             MongoDB (副本集)
```

**风险**：
- 🔴 **高风险**：缓存不一致
- 🔴 **事务隔离性失效**
- ❌ **不推荐生产环境**

---

### 3. 多实例 + Redis + 分布式缓存失效（🟢 推荐）

```
┌───────────────────┐    ┌───────────────────┐
│  实例 A           │    │  实例 B           │
│ ┌──────────┐      │    │ ┌──────────┐      │
│ │本地缓存A │      │    │ │本地缓存B │      │
│ └────┬─────┘      │    │ └────┬─────┘      │
└──────┼────────────┘    └──────┼────────────┘
       │                         │
       └────────┬────────────────┘
                ▼
         ┌─────────────┐
         │   Redis     │
         │ (缓存+广播)  │
         └──────┬──────┘
                │
                ▼
           MongoDB (副本集)
```

**特点**：
- ✅ 高可用
- ✅ 缓存一致性好（毫秒级延迟）
- ✅ 性能优异
- ⚠️ 依赖 Redis

**适用场景**：
- 生产环境（推荐）
- 高并发场景
- 可容忍短期（毫秒级）数据不一致

**配置示例**：
```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    multiLevel: true,
    local: { maxSize: 1000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),  // Redis 缓存
    
    // 🆕 启用分布式缓存失效
    distributed: {
      enabled: true,           // ✅ 必需：启用
      instanceId: 'instance-1' // ❌ 可选：默认自动生成（建议手动设置）
      // redis                 // ❌ 可选：默认自动从 remote 复用（ES6 简写）
      // channel: 'myapp:cache:invalidate'  // ❌ 可选：自定义频道
    }
  }
});
```

---

### 4. 多实例 + 分布式事务锁（🟢 推荐：金融/交易）

```
┌───────────────────┐    ┌───────────────────┐
│  实例 A           │    │  实例 B           │
│ ┌──────────┐      │    │ ┌──────────┐      │
│ │本地缓存A │      │    │ │本地缓存B │      │
│ └────┬─────┘      │    │ └────┬─────┘      │
└──────┼────────────┘    └──────┼────────────┘
       │                         │
       └────────┬────────────────┘
                ▼
         ┌─────────────┐
         │   Redis     │
         │ (缓存+锁)    │
         └──────┬──────┘
                │
                ▼
           MongoDB (副本集)
```

**特点**：
- ✅ 强一致性
- ✅ 事务隔离性保障
- ✅ 适合金融/交易场景
- ⚠️ 性能略有下降（Redis 网络请求）

**适用场景**：
- 金融系统
- 支付/转账
- 库存扣减
- 任何需要强一致性的场景

**配置示例**：
```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017?replicaSet=rs0' },
  
  cache: {
    multiLevel: true,
    local: { maxSize: 1000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),
    
    // 分布式缓存失效
    distributed: {
      enabled: true,              // ✅ 必需：启用
      instanceId: 'instance-1'    // ❌ 可选：默认自动生成（建议手动设置）
      // redis                    // ❌ 可选：默认自动从 remote 复用（ES6 简写）
    },
    
    // 🆕 分布式事务锁
    transaction: {
      distributedLock: {
        redis,                                 // ✅ 必需：Redis 实例（事务锁必须显式配置）
        keyPrefix: 'myapp:cache:lock:'         // ❌ 可选：锁键前缀
      }
    }
  }
});
```

---

### 5. 多实例 + 禁用缓存（🟡 适用：强一致性要求）

**特点**：
- ✅ 100% 数据一致性
- ✅ 无外部依赖
- ❌ 性能下降（所有请求查数据库）

**适用场景**：
- 小流量应用
- 强一致性要求
- 无法使用 Redis

**配置示例**：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  
  cache: {
    // 禁用缓存（所有查询直接访问数据库）
    maxSize: 0
  }
});
```

---

## 分布式环境下的风险

### 风险 1: 缓存失效不同步

**场景**：
```javascript
// 时间线
T1: 实例 A 查询用户 { id: 1, balance: 100 } → 写入本地缓存A
T2: 实例 B 查询用户 { id: 1, balance: 100 } → 写入本地缓存B
T3: 实例 A 更新余额为 150 → 失效本地缓存A ✓
T4: 实例 B 查询用户 → 命中本地缓存B → 返回旧数据 100 ❌
```

**影响**：
- 用户看到不一致的余额
- 业务逻辑可能出错

**解决方案**：启用**分布式缓存失效广播**

---

### 风险 2: 事务缓存锁不生效

**场景**：
```javascript
// 实例 A: 转账事务
await msq.withTransaction(async (tx) => {
  // T1: 扣款 Alice
  await accounts.updateOne(
    { userId: 'alice' },
    { $inc: { balance: -100 } },
    { session: tx.session }
  );
  
  // T2: 实例 B 查询 Alice → 读到中间状态 → 写入缓存 ❌
  
  // T3: 加款 Bob
  await accounts.updateOne(
    { userId: 'bob' },
    { $inc: { balance: 100 } },
    { session: tx.session }
  );
});
```

**影响**：
- 读到事务中间状态
- 缓存中可能有脏数据
- 事务隔离性失效

**解决方案**：启用**分布式事务锁**

---

## 解决方案

### 方案 1: 分布式缓存失效广播（推荐）

**原理**：使用 Redis Pub/Sub 广播缓存失效消息

**工作流程**：
```
1. 实例 A 更新数据
2. 实例 A 失效本地缓存 + Redis
3. 实例 A 广播失效消息（Redis Pub/Sub）
4. 实例 B 收到消息
5. 实例 B 失效本地缓存
```

**配置**：
```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

cache: {
  multiLevel: true,
  local: { maxSize: 1000 },
  remote: MonSQLize.createRedisCacheAdapter(redis),
  
  distributed: {
    enabled: true,                 // ✅ 必需：启用分布式失效
    instanceId: 'instance-A'       // ❌ 可选：实例标识，默认自动生成（建议手动设置）
    // redis                       // ❌ 可选：默认自动从 remote 复用（ES6 简写）
    // channel: 'myapp:cache:invalidate'  // ❌ 可选：默认 'monsqlize:cache:invalidate'
  }
}
```

**优点**：
- ✅ 实时广播，延迟低（毫秒级）
- ✅ 使用现有 Redis 基础设施
- ✅ 实现简单，易于维护

**缺点**：
- ⚠️ 依赖 Redis
- ⚠️ 极短时间窗口内可能不一致（网络延迟）

---

### 方案 2: 分布式事务锁（推荐：强一致性）

**原理**：使用 Redis 存储事务锁信息，所有实例共享

**工作流程**：
```
1. 实例 A 开启事务
2. 在 Redis 中添加缓存锁（key + sessionId）
3. 实例 B 查询数据
4. 检查 Redis 锁 → 发现锁定 → 不写入缓存
5. 实例 A 提交事务
6. 释放 Redis 锁
```

**配置**：
```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

cache: {
  transaction: {
    distributedLock: {
      redis,                           // ✅ 必需：Redis 实例（事务锁必须显式配置）
      keyPrefix: 'myapp:cache:lock:'   // ❌ 可选：默认 'monsqlize:cache:lock:'
    }
  }
}
```

**优点**：
- ✅ 真正的分布式锁
- ✅ 事务隔离性保障
- ✅ 适合金融/交易场景

**缺点**：
- ⚠️ 性能略有下降（Redis 网络请求）
- ⚠️ 依赖 Redis 可用性

---

## 配置指南

### 完整配置示例

```javascript
const MonSQLize = require('monsqlize');
const Redis = require('ioredis');

// 创建 Redis 实例（复用于缓存、广播、锁）
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0,
  retryStrategy: (times) => {
    return Math.min(times * 50, 2000);
  }
});

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { 
    uri: 'mongodb://localhost:27017?replicaSet=rs0'
  },
  
  cache: {
    // 多层缓存
    multiLevel: true,
    
    // 本地缓存配置
    local: {
      maxSize: 1000,       // 最多缓存 1000 条
      maxMemory: 0,        // 无内存限制
      enableStats: true    // 启用统计
    },
    
    // 远端 Redis 缓存（复用实例）
    remote: MonSQLize.createRedisCacheAdapter(redis),
    
    // 缓存策略
    policy: {
      writePolicy: 'both',            // 双写（both）或本地优先（local-first-async-remote）
      backfillLocalOnRemoteHit: true  // 远端命中时回填本地
    },
    
    // 🆕 分布式缓存失效
    distributed: {
      enabled: true,                           // ✅ 必需：启用
      instanceId: process.env.INSTANCE_ID,    // ❌ 可选：默认自动生成（建议使用环境变量）
      channel: 'myapp:cache:invalidate'       // ❌ 可选：自定义频道
      // redis                                // ❌ 可选：默认自动从 remote 复用（ES6 简写）
    },
    
    // 🆕 分布式事务锁
    transaction: {
      distributedLock: {
        redis,                                 // ✅ 必需：Redis 实例（事务锁必须显式配置）
        keyPrefix: 'myapp:cache:lock:',        // ❌ 可选：锁键前缀
        maxDuration: 300000                    // ❌ 可选：锁最大持续时间（毫秒）
      }
    }
  }
});

// 连接
await msq.connect();

// 使用
const { collection } = await msq.connect();
const users = await collection('users').find({
  query: { active: true },
  cache: 60000  // 缓存 60 秒
});

// 关闭（清理资源）
await msq.close();
```

**💡 配置说明**：
- ✅ **必需项**：必须配置，否则功能不工作
- ❌ **可选项**：可以不配置，使用默认值
- **一个 Redis 实例**：用于缓存、广播、锁三个用途（推荐复用）

---

### 配置选项说明

#### distributed（分布式缓存失效）

| 选项 | 类型 | 必需 | 默认值 | 说明 |
|-----|------|------|--------|------|
| `enabled` | Boolean | ✅ | - | 是否启用分布式缓存失效 |
| `redis` | Object | ❌ | 自动从 `remote` 提取 | ioredis 实例（可选，默认复用 `cache.remote` 的 Redis） |
| `redisUrl` | String | ❌ | - | Redis 连接 URL（与 redis 二选一，不推荐） |
| `instanceId` | String | ❌ | `instance-${timestamp}-${random}` | 实例标识，默认自动生成（如 `instance-1732521234567-a2b3c4d5e`），**强烈建议手动设置** |
| `channel` | String | ❌ | `'monsqlize:cache:invalidate'` | Pub/Sub 频道名 |

**⚠️ 重要说明**：
- **`redis` 和 `redisUrl`**：都是可选的
  - **推荐**：不配置 `redis`，自动从 `cache.remote` 复用 Redis 实例
  - 如需单独配置：使用 `redis` 参数（可复用实例）
  - 不推荐：使用 `redisUrl`（会创建新连接）
- **`instanceId`**：可选，但**强烈建议手动设置**
  - 默认值格式：`instance-${timestamp}-${random}`（如 `instance-1732521234567-a2b3c4d5e`）
  - **每个实例的 `instanceId` 必须不同**，否则会导致缓存失效广播失败
  - 推荐使用环境变量：`process.env.INSTANCE_ID` 或 `process.env.HOSTNAME`

#### transaction.distributedLock（分布式事务锁）

| 选项 | 类型 | 必需 | 默认值 | 说明 |
|-----|------|------|--------|------|
| `redis` | Object | ✅ | - | ioredis 实例（**必需**） |
| `keyPrefix` | String | ❌ | `'monsqlize:cache:lock:'` | 锁键前缀 |
| `maxDuration` | Number | ❌ | `300000` | 锁最大持续时间（毫秒） |

---

## 技术实现细节

### 分布式缓存失效的完整流程

#### 1. 初始化阶段（connect() 时）

```javascript
// lib/index.js
async connect() {
  // 步骤1: 创建 DistributedCacheInvalidator
  this._cacheInvalidator = new DistributedCacheInvalidator({
    redisUrl: this.cache.distributed.redisUrl,
    redis: this.cache.distributed.redis,
    channel: this.cache.distributed.channel,
    cache: this.cache,
    logger: this.logger
  });
  
  // 步骤2: 将 invalidate 方法注入到 MultiLevelCache
  if (this.cache && typeof this.cache.setPublish === 'function') {
    this.cache.setPublish((msg) => {
      if (msg && msg.type === 'invalidate' && msg.pattern) {
        // 当缓存失效时，调用 invalidate 广播消息
        this._cacheInvalidator.invalidate(msg.pattern);
      }
    });
  }
}
```

#### 2. 写操作阶段（updateOne/deleteOne 等）

```javascript
// lib/mongodb/writes/update-one.js
async function updateOne(filter, update, options) {
  // 步骤1: 执行 MongoDB 更新
  const result = await collection.updateOne(filter, update, options);
  
  // 步骤2: 失效缓存
  const pattern = buildNamespacePattern({
    iid: instanceId,
    type: 'mongodb',
    db: databaseName,
    collection: collectionName
  });
  
  // 步骤3: 调用 cache.delPattern()
  await cache.delPattern(pattern);  // ← 这里会触发广播！
  
  return result;
}
```

#### 3. MultiLevelCache.delPattern() 触发广播

```javascript
// lib/multi-level-cache.js
class MultiLevelCache {
  async delPattern(pattern) {
    // 步骤1: 删除本地缓存
    const deleted = await this.local.delPattern(pattern);
    
    // 步骤2: 调用 publish 回调（如果设置了）
    if (this.publish) {
      this.publish({
        type: 'invalidate',
        pattern: pattern,
        ts: Date.now()
      });
    }
    
    return deleted;
  }
  
  setPublish(publishFn) {
    this.publish = publishFn;  // 由 index.js 注入
  }
}
```

#### 4. DistributedCacheInvalidator 广播消息

```javascript
// lib/distributed-cache-invalidator.js
class DistributedCacheInvalidator {
  async invalidate(pattern) {
    // 步骤1: 构造消息
    const message = JSON.stringify({
      type: 'invalidate',
      pattern: pattern,
      instanceId: this.instanceId,  // 自己的实例 ID
      timestamp: Date.now()
    });
    
    // 步骤2: 广播到 Redis Pub/Sub
    await this.pub.publish(this.channel, message);
    
    this.stats.messagesSent++;
  }
}
```

#### 5. 其他实例接收消息并失效缓存

```javascript
// lib/distributed-cache-invalidator.js
class DistributedCacheInvalidator {
  _setupSubscription() {
    // 步骤1: 订阅 Redis 频道
    this.sub.subscribe(this.channel);
    
    // 步骤2: 处理接收到的消息
    this.sub.on('message', (channel, message) => {
      const data = JSON.parse(message);
      
      // 步骤3: 忽略自己发送的消息
      if (data.instanceId === this.instanceId) {
        return;
      }
      
      // 步骤4: 失效本地缓存
      if (data.type === 'invalidate' && data.pattern) {
        this._handleInvalidation(data.pattern);
      }
    });
  }
  
  _handleInvalidation(pattern) {
    // 失效本地缓存（不影响 Redis）
    if (this.cache.local && this.cache.local.delPattern) {
      this.cache.local.delPattern(pattern);
      this.stats.invalidationsTriggered++;
    }
  }
}
```

### 完整调用链

```
写操作 (updateOne/deleteOne/...)
  ↓
cache.delPattern(pattern)
  ↓
MultiLevelCache.delPattern()
  ↓
  ├─→ local.delPattern()          (删除本地缓存)
  └─→ this.publish({ pattern })   (触发广播)
       ↓
     DistributedCacheInvalidator.invalidate()
       ↓
     redis.pub.publish(channel, message)  (Redis Pub/Sub 广播)
       ↓
     ┌─────────────────────────────────┐
     │ 其他实例的 Redis Subscriber      │
     └─────────────────────────────────┘
       ↓
     DistributedCacheInvalidator._handleInvalidation()
       ↓
     cache.local.delPattern(pattern)  (删除本地缓存)
```

### 关键点说明

1. **延迟注入 publish 回调**：
   - 缓存在 `constructor` 中创建
   - `DistributedCacheInvalidator` 在 `connect()` 中创建
   - 使用 `setPublish()` 方法动态注入回调

2. **实例 ID 隔离**：
   - 每个实例有唯一的 `instanceId`
   - 接收消息时检查 `instanceId`，忽略自己发送的消息
   - 避免重复失效本地缓存

3. **只失效本地缓存**：
   - 接收到广播消息后，只失效本地缓存
   - 不影响 Redis 缓存（已经失效）
   - 减少不必要的 Redis 操作

4. **错误处理**：
   - 广播失败不影响写操作成功
   - 使用 `catch()` 捕获所有异常
   - 记录错误日志但不抛出

---

## 最佳实践

### 1. 环境检测

自动检测是否在分布式环境：

```javascript
function isDistributedEnvironment() {
  return !!(
    process.env.INSTANCE_ID ||
    process.env.POD_NAME ||      // Kubernetes
    process.env.HOSTNAME         // Docker
  );
}

const cache = isDistributedEnvironment() ? {
  multiLevel: true,
  distributed: { enabled: true, ... }
} : {
  maxSize: 1000
};
```

---

### 2. 根据业务选择方案

| 业务类型 | 推荐方案 | 配置 |
|---------|---------|------|
| **一般应用** | 分布式缓存失效 | `distributed.enabled = true` |
| **金融/支付** | 缓存失效 + 事务锁 | `distributed.enabled = true`<br>`transaction.distributedLock = {...}` |
| **强一致性** | 禁用缓存 | `maxSize = 0` |
| **开发环境** | 本地缓存 | 默认配置 |

---

### 3. 监控和日志

启用日志查看分布式组件状态：

```javascript
const msq = new MonSQLize({
  // ...
  logger: {
    level: 'info',  // debug | info | warn | error
    // ...
  }
});

// 查看统计
const cache = msq.getCache();
console.log(cache.getStats());  // 缓存统计
```

---

### 4. 错误处理

分布式组件失败时的降级策略：

```javascript
// 如果 Redis 连接失败，仍然可以使用本地缓存
cache: {
  multiLevel: true,
  local: { maxSize: 1000 },
  remote: MonSQLize.createRedisCacheAdapter('redis://...'),
  
  distributed: {
    enabled: true,
    redisUrl: 'redis://...'
    // 如果 Redis 不可用，会自动降级为仅本地缓存
  }
}
```

---

## 性能考虑

### 1. 分布式缓存失效性能

- **延迟**：~1-5ms（Redis Pub/Sub）
- **带宽**：每次失效 ~100 bytes
- **影响**：对总体性能影响可忽略

### 2. 分布式事务锁性能

- **延迟**：~2-10ms（Redis SET/DEL）
- **吞吐量**：略有下降（~10-20%）
- **推荐**：仅在需要强一致性时启用

### 3. 缓存策略对比

| 策略 | 延迟 | 一致性 | 适用场景 |
|-----|------|--------|---------|
| **仅本地** | 最低 | 低 | 单实例 |
| **本地 + Redis** | 低 | 中 | 多实例 |
| **本地 + Redis + 广播** | 低 | 高 | 推荐 |
| **本地 + Redis + 广播 + 锁** | 中 | 最高 | 金融/交易 |
| **禁用缓存** | 高 | 最高 | 强一致性 |

---

## 故障排查

### 问题 1: 缓存失效广播不生效

**症状**：实例 A 更新后，实例 B 仍读到旧数据

**排查步骤**：
1. 检查 Redis 连接是否正常
   ```javascript
   await redis.ping();  // 应返回 'PONG'
   ```

2. 检查 Pub/Sub 订阅
   ```javascript
   await redis.subscribe('myapp:cache:invalidate');
   redis.on('message', (channel, message) => {
     console.log('收到消息:', channel, message);
   });
   ```

3. 查看日志
   ```javascript
   // 启用 debug 日志
   logger: { level: 'debug' }
   ```

4. 检查实例 ID
   ```javascript
   // 确保每个实例的 instanceId 不同（强烈建议手动设置）
   distributed: {
     instanceId: process.env.INSTANCE_ID  // 使用环境变量
   }
   ```

---

### 问题 2: 分布式事务锁不生效

**症状**：事务期间其他实例仍写入缓存

**排查步骤**：
1. 确认配置正确
   ```javascript
   transaction: {
     distributedLock: {
       redis  // ✅ 必需：事务锁必须显式传入 Redis 实例
     }
   }
   ```

2. 检查锁是否创建
   ```javascript
   // 在 Redis 中查看锁
   await redis.keys('myapp:cache:lock:*');
   ```

3. 查看事务日志
   ```javascript
   logger: { level: 'debug' }
   // 查找 "Lock acquired" 日志
   ```

---

### 问题 3: Redis 连接失败

**症状**：应用启动报错或缓存不工作

**解决方案**：
```javascript
const Redis = require('ioredis');
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    console.error('Redis error:', err);
    return true;
  }
});

redis.on('error', (err) => {
  console.error('Redis 连接失败:', err.message);
});

redis.on('connect', () => {
  console.log('✅ Redis 连接成功');
});
```

---

## 总结

### 推荐配置

| 环境 | 推荐方案 |
|------|---------|
| **开发环境** | 本地缓存（默认） |
| **生产环境（单实例）** | 本地缓存 + Redis |
| **生产环境（多实例）** | 本地 + Redis + 分布式失效 |
| **金融/交易系统** | 本地 + Redis + 失效 + 锁 |

### 快速开始

**最简单的分布式配置**（推荐）：
```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://...' },
  cache: {
    multiLevel: true,
    local: { maxSize: 1000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),
    distributed: {
      enabled: true,              // ✅ 必需：启用
      instanceId: 'instance-1'    // ❌ 可选：默认自动生成（建议手动设置）
      // redis                    // ❌ 可选：默认自动从 remote 复用（ES6 简写）
    }
  }
});
```

**⚠️ 重要**：
- `instanceId` 是可选的，默认自动生成（格式：`instance-${timestamp}-${random}`）
- 但**强烈建议手动设置**，便于调试和日志追踪
- 每个实例的 `instanceId` 必须不同
- 建议使用环境变量：`instanceId: process.env.INSTANCE_ID`
- `redis` 参数可省略，会自动从 `remote` 复用

---

## 相关文档

- [缓存策略文档](./cache.md)
- [缓存一致性说明](./cache-consistency.md)
- [事务功能文档](./transaction.md)
- [Redis 缓存适配器](../lib/redis-cache-adapter.js)

---

**更新日期**: 2025-11-25  
**维护者**: monSQLize Team

