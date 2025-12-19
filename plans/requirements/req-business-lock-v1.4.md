# 业务级分布式锁（withLock）需求方案

> **版本**: v1.4.0  
> **创建日期**: 2025-12-18  
> **状态**: 📋 规划中  
> **优先级**: P1  
> **预计发布**: 2026-01-15

---

## 📑 目录

1. [需求背景](#1-需求背景)
   - [1.1 问题场景与三种方案对比](#11-问题场景与三种方案对比)
   - [1.2 三种方案详细分析](#12-三种方案详细分析)
   - [1.3 方案选择决策树](#13-方案选择决策树)
   - [1.4 为什么 monSQLize 需要实现业务锁](#14-为什么-monsqlize-需要实现业务锁)
   - [1.5 最终结论](#15-最终结论)
2. [核心设计理念](#2-核心设计理念)
3. [功能设计](#3-功能设计)
   - [3.1 功能清单](#31-功能清单)
   - [3.2 锁 Key 统一管理](#32-锁-key-统一管理-)
4. [API 设计](#4-api-设计)
5. [技术实现](#5-技术实现)
6. [与现有架构集成](#6-与现有架构集成)
7. [配置选项](#7-配置选项)
8. [错误处理](#8-错误处理)
   - [8.4 Redis 连接中断处理](#84-redis-连接中断处理-)
9. [测试计划](#9-测试计划)
10. [文档计划](#10-文档计划)
11. [实施计划](#11-实施计划)
    - [11.3 TypeScript 类型定义详细设计](#113-typescript-类型定义详细设计-)
12. [风险评估](#12-风险评估)

---

## 1. 需求背景

### 1.1 问题场景与三种方案对比

在分布式/多实例环境下，常见的并发问题场景：

| 场景 | 具体问题 | 速率限制 | 事务+条件更新 | 业务锁 | 推荐方案 |
|------|---------|---------|--------------|--------|---------|
| 同一用户快速点击 | 用户连续点击下单按钮 | ✅ **足够** | ✅ 能解决 | ✅ 能解决 | **速率限制**（最轻量） |
| 简单库存扣减 | 100用户同时抢1件商品 | ❌ 不同用户不限制 | ✅ **足够** | ✅ 能解决 | **事务+条件更新**（性能最好） |
| 复杂订单创建 | 查询→计算折扣→多表更新 | ❌ 不适用 | ❌ 中间状态并发 | ✅ **需要** | **业务锁** |
| 余额+积分联动 | 扣余额+赠积分+记流水 | ❌ 不适用 | ❌ 多步骤并发 | ✅ **需要** | **业务锁** |
| 定时任务防重 | 多实例同时触发任务 | ❌ 非HTTP场景 | ❌ 非数据库操作 | ✅ **需要** | **业务锁**（唯一选择） |
| 外部API+数据库 | 调用支付→更新状态 | ❌ 不适用 | ❌ 跨系统操作 | ✅ **需要** | **业务锁** |
| 恶意刷接口 | IP/用户频繁请求 | ✅ **足够** | ❌ 不适用 | ❌ 不适用 | **速率限制** |

### 1.2 三种方案详细分析

#### 1.2.1 速率限制（Rate Limiting）

**原理**：按用户ID/IP地址限制请求频率

```javascript
// 框架层：每用户每秒最多1次请求
app.post('/order', rateLimit({ key: req => req.user.id, max: 1, window: 1000 }), handler);
```

**限制维度**：`谁`在请求（用户/IP）

**能解决**：
- ✅ 同一用户快速点击
- ✅ 同一IP恶意刷接口

**不能解决**：
- ❌ 不同用户抢同一商品（不同用户不互相限制）
- ❌ 多来源操作同一资源（用户+系统并发）
- ❌ 非HTTP场景（定时任务、消息队列）

#### 1.2.2 事务+条件更新

**原理**：利用 MongoDB 原子操作，在更新时检查条件

```javascript
// 原子操作：条件检查+更新在同一语句完成
const result = await inventory.updateOne(
    { sku: 'SKU123', stock: { $gte: 1 } },  // 条件：库存>=1
    { $inc: { stock: -1 } }
);
if (result.modifiedCount === 0) throw new Error('库存不足');
```

**限制维度**：`数据状态`（字段值满足条件才更新）

**能解决**：
- ✅ 简单扣减（库存-1、余额-N）
- ✅ 不同用户抢同一商品（原子操作保证只有一个成功）

**不能解决**：
- ❌ 复杂业务（需要先查询→计算→再更新）
- ❌ 非数据库操作（定时任务、外部API）
- ❌ 多步骤事务中间状态并发

#### 1.2.3 业务锁（Business Lock）

**原理**：基于 Redis 的分布式锁，锁定具体资源

```javascript
// 锁定维度：具体的资源ID
await msq.withLock(`order:${userId}:${sku}`, async () => {
    // 整个业务流程串行执行
    const product = await findProduct();
    const discount = await calculateDiscount();
    await deductStock();
    await createOrder();
});
```

**限制维度**：`操作什么数据`（具体资源ID）

**能解决**：
- ✅ 复杂业务逻辑（多步骤串行）
- ✅ 定时任务防重（锁定任务执行权）
- ✅ 外部API+数据库（锁定整个流程）
- ✅ 任何需要串行执行的场景

**代价**：
- ⚠️ 需要 Redis
- ⚠️ 有少量性能开销
- ⚠️ 需要管理锁 Key

### 1.3 方案选择决策树

```text
问：你的场景是什么？

├─ 防止同一用户重复点击
│   └─→ 【速率限制】✅ 最轻量，框架层处理
│
├─ 简单数据扣减（库存-1、余额-N）
│   └─→ 【事务+条件更新】✅ 性能最好，原子操作
│
├─ 复杂业务（查询→计算→多表更新）
│   └─→ 【业务锁】✅ 保证整个流程串行
│
├─ 定时任务/消息队列防重
│   └─→ 【业务锁】✅ 唯一选择
│
├─ 外部API调用后更新数据库
│   └─→ 【业务锁】✅ 保证幂等
│
└─ 防止恶意刷接口
    └─→ 【速率限制】✅ 按IP/用户限流
```

### 1.4 为什么 monSQLize 需要实现业务锁

| 理由 | 说明 |
|------|------|
| **职责匹配** | 业务锁保护的是数据库操作，放在数据库增强层天经地义 |
| **复用基础** | 已有 Redis 连接（分布式缓存）+ `DistributedCacheLockManager` |
| **一站式** | 用户不需要在框架层额外引入锁库 |
| **锁+事务配合** | `withLock()` + `withTransaction()` 无缝配合 |

**速率限制和事务+条件更新不是 monSQLize 的职责**：
- 速率限制 → 框架层/网关层处理
- 事务+条件更新 → monSQLize 已支持

**业务锁是 monSQLize 的职责**：
- 与数据操作紧密结合
- 复用已有基础设施
- 提供一站式体验

### 1.5 最终结论

```text
三种方案定位：

┌─────────────────────────────────────────────────────────────┐
│  速率限制        │  事务+条件更新     │  业务锁            │
│  (框架层)        │  (数据库原子操作)   │  (monSQLize)       │
├─────────────────────────────────────────────────────────────┤
│  限制「谁」请求   │  限制「数据状态」   │  限制「操作什么」   │
│  防刷、防重复点击 │  简单扣减          │  复杂业务、串行执行 │
│  最轻量          │  性能最好          │  最灵活            │
└─────────────────────────────────────────────────────────────┘

monSQLize 业务锁的价值：
  - 不替代速率限制（那是框架的事）
  - 不替代条件更新（简单场景用条件更新更好）
  - 专注于：复杂业务、定时任务、外部API等需要串行执行的场景
```
    
---

## 2. 核心设计理念

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| **简单优先** | 覆盖80%场景，不追求100%复杂功能 |
| **复用优先** | 复用已有 Redis 连接和锁逻辑 |
| **零配置启用** | 已配置 Redis 的用户开箱即用 |
| **与事务配合** | 锁和事务可以无缝组合使用 |

### 2.2 不实现的功能（明确边界）

| 功能 | 理由 |
|------|------|
| Redlock 多节点算法 | 复杂度高，非核心需求，留给专业库 |
| 读写锁 | 使用场景少，增加复杂度 |
| 可重入锁 | 实现复杂，容易出错 |
| 公平锁 | Redis 难以实现真正的公平性 |

### 2.3 定位说明

```text
monSQLize 业务锁定位：
  ✅ 适用：与 monSQLize 数据操作配合的锁场景
  ✅ 适用：单 Redis 实例的简单分布式锁
  ❌ 不适用：跨服务协调（建议使用 redlock）
  ❌ 不适用：强一致性要求（建议使用 ZooKeeper）
```

---

## 3. 功能设计

### 3.1 功能清单

| 功能 | 优先级 | 说明 |
|------|--------|------|
| `withLock()` | P0 | 自动管理锁生命周期（推荐API） |
| `acquireLock()` | P1 | 手动获取锁（阻塞重试） |
| `tryAcquireLock()` | P1 | 尝试获取锁（不阻塞） |
| 锁自动释放 | P0 | 获取锁时设置 TTL，防止死锁 |
| 锁续期 | P2 | 长任务场景，可选实现 |
| 锁统计 | P2 | 监控用，可选实现 |

### 3.2 锁 Key 统一管理 🔴

#### 3.2.1 为什么需要统一管理

**问题：硬编码 Key 的风险**

```javascript
// ❌ 硬编码，容易出问题
await msq.withLock(`inventory:${sku}`, ...);      // 开发者A
await msq.withLock(`stock:${sku}`, ...);          // 开发者B，同一资源不同Key！
await msq.withLock(`inventory-${sku}`, ...);      // 开发者C，分隔符不同！
```

**后果**：
- 同一资源使用不同 Key → 锁失效
- Key 格式不统一 → 难以排查问题
- 无法统一管理 TTL 和重试策略

#### 3.2.2 推荐方案：LockKeys 常量管理

**用户项目中定义锁常量**：

```javascript
// constants/lock-keys.js

/**
 * 业务锁 Key 定义
 * 统一管理所有业务锁的 Key 格式和默认配置
 */
const LockKeys = {
    // 库存相关
    INVENTORY: {
        key: (sku) => `inventory:${sku}`,
        ttl: 5000,
        desc: '库存扣减锁'
    },
    
    // 订单相关
    ORDER_CREATE: {
        key: (userId, sku) => `order:create:${userId}:${sku}`,
        ttl: 10000,
        desc: '订单创建锁（防重）'
    },
    
    // 用户余额
    USER_BALANCE: {
        key: (userId) => `user:balance:${userId}`,
        ttl: 5000,
        desc: '用户余额变更锁'
    },
    
    // 定时任务
    CRON: {
        DAILY_REPORT: {
            key: () => 'cron:daily-report',
            ttl: 60000,
            desc: '日报任务锁'
        },
        SYNC_DATA: {
            key: () => 'cron:sync-data',
            ttl: 300000,
            desc: '数据同步任务锁'
        }
    }
};

module.exports = LockKeys;
```

**使用方式**：

```javascript
const LockKeys = require('./constants/lock-keys');

// ✅ 统一使用常量
await msq.withLock(
    LockKeys.INVENTORY.key(sku),
    async () => { /* 业务逻辑 */ },
    { ttl: LockKeys.INVENTORY.ttl }
);

// ✅ 订单创建
await msq.withLock(
    LockKeys.ORDER_CREATE.key(userId, sku),
    async () => { /* 业务逻辑 */ },
    { ttl: LockKeys.ORDER_CREATE.ttl }
);

// ✅ 定时任务
await msq.withLock(
    LockKeys.CRON.DAILY_REPORT.key(),
    async () => { /* 任务逻辑 */ },
    { ttl: LockKeys.CRON.DAILY_REPORT.ttl }
);
```

#### 3.2.3 进阶方案：封装 LockService

**更进一步：封装为服务层**：

```javascript
// services/lock-service.js

const LockKeys = require('../constants/lock-keys');

class LockService {
    constructor(msq) {
        this.msq = msq;
    }
    
    /**
     * 库存锁
     */
    async withInventoryLock(sku, callback) {
        return this.msq.withLock(
            LockKeys.INVENTORY.key(sku),
            callback,
            { ttl: LockKeys.INVENTORY.ttl }
        );
    }
    
    /**
     * 订单创建锁
     */
    async withOrderCreateLock(userId, sku, callback) {
        return this.msq.withLock(
            LockKeys.ORDER_CREATE.key(userId, sku),
            callback,
            { ttl: LockKeys.ORDER_CREATE.ttl }
        );
    }
    
    /**
     * 用户余额锁
     */
    async withUserBalanceLock(userId, callback) {
        return this.msq.withLock(
            LockKeys.USER_BALANCE.key(userId),
            callback,
            { ttl: LockKeys.USER_BALANCE.ttl }
        );
    }
    
    /**
     * 定时任务锁
     */
    async withCronLock(taskName, callback) {
        const config = LockKeys.CRON[taskName];
        if (!config) {
            throw new Error(`Unknown cron task: ${taskName}`);
        }
        return this.msq.withLock(config.key(), callback, { ttl: config.ttl });
    }
}

module.exports = LockService;
```

**使用方式**：

```javascript
const lockService = new LockService(msq);

// ✅ 更简洁的调用
await lockService.withInventoryLock(sku, async () => {
    await deductStock();
});

await lockService.withOrderCreateLock(userId, sku, async () => {
    await createOrder();
});

await lockService.withCronLock('DAILY_REPORT', async () => {
    await generateReport();
});
```

#### 3.2.4 Key 命名规范

| 规范 | 说明 | 示例 |
|------|------|------|
| **分层结构** | 使用冒号分隔层级 | `inventory:SKU123` |
| **业务前缀** | 第一层标识业务域 | `order:xxx`, `user:xxx` |
| **唯一标识** | 最后一层是具体资源ID | `user:balance:12345` |
| **小写字母** | 统一使用小写 | ✅ `order:create` ❌ `Order:Create` |
| **无特殊字符** | 避免空格和特殊字符 | ✅ `order:create` ❌ `order create` |

**命名示例**：

```text
✅ 正确格式：
  inventory:{sku}
  order:create:{userId}:{sku}
  user:balance:{userId}
  cron:daily-report
  payment:bindcard:{userId}

❌ 错误格式：
  Inventory_{sku}          # 大写+下划线
  order create             # 空格
  user-balance-{userId}    # 连字符（不一致）
```

#### 3.2.5 monSQLize 是否内置 Key 管理？

**决策：不内置，由用户自行管理**

| 方案 | 优点 | 缺点 |
|------|------|------|
| monSQLize 内置 | 开箱即用 | 不够灵活，无法适应各种业务 |
| 用户自行管理 | 灵活，适应业务需求 | 需要用户额外定义 |

**理由**：
1. 每个项目的业务不同，Key 命名无法通用
2. TTL 配置因业务而异
3. 用户更了解自己的业务域划分

**monSQLize 只提供**：
- `withLock(key, callback, options)` 基础 API
- 文档中提供 Key 管理的最佳实践（本节内容）

### 3.2 使用场景示例

#### 场景1：库存扣减（最常用）

```javascript
// 使用 withLock 自动管理锁
await msq.withLock('inventory:SKU123', async () => {
    const product = await inventory.findOne({ sku: 'SKU123' });
    if (product.stock >= quantity) {
        await inventory.updateOne(
            { sku: 'SKU123' },
            { $inc: { stock: -quantity } }
        );
    } else {
        throw new Error('库存不足');
    }
});
```

#### 场景2：订单创建 + 事务

```javascript
// 锁 + 事务组合使用
await msq.withLock(`order:create:${userId}`, async () => {
    await msq.withTransaction(async (tx) => {
        // 扣减库存
        await inventory.updateOne(
            { sku: productId, stock: { $gte: 1 } },
            { $inc: { stock: -1 } },
            { session: tx.session }
        );
        
        // 创建订单
        await orders.insertOne({
            userId,
            productId,
            createdAt: new Date()
        }, { session: tx.session });
    });
});
```

#### 场景3：定时任务防重

```javascript
// 定时任务中使用
async function dailyReportTask() {
    const acquired = await msq.tryAcquireLock('cron:daily-report', {
        ttl: 60000  // 60秒
    });
    
    if (!acquired) {
        console.log('其他实例正在执行，跳过');
        return;
    }
    
    try {
        await generateDailyReport();
    } finally {
        await acquired.release();
    }
}
```

---

## 4. API 设计

### 4.1 withLock（推荐）

**签名**：
```typescript
async withLock<T>(
    key: string,
    callback: () => Promise<T>,
    options?: LockOptions
): Promise<T>
```

**参数**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `key` | string | ✅ | - | 锁的唯一标识 |
| `callback` | Function | ✅ | - | 获取锁后执行的函数 |
| `options.ttl` | number | ❌ | 10000 | 锁过期时间（毫秒） |
| `options.retryTimes` | number | ❌ | 3 | 获取锁失败时的重试次数 |
| `options.retryDelay` | number | ❌ | 100 | 重试间隔（毫秒） |

**返回值**：callback 的返回值

**使用示例**：
```javascript
const result = await msq.withLock('my-resource', async () => {
    // 临界区代码
    return await doSomething();
}, {
    ttl: 5000,
    retryTimes: 5,
    retryDelay: 200
});
```

---

### 4.2 acquireLock

**签名**：
```typescript
async acquireLock(
    key: string,
    options?: LockOptions
): Promise<Lock>
```

**参数**：同 withLock

**返回值**：Lock 对象

**Lock 对象方法**：

| 方法 | 说明 |
|------|------|
| `release()` | 释放锁 |
| `renew(ttl?)` | 续期（可选实现） |
| `isHeld()` | 检查锁是否仍被持有 |

**使用示例**：
```javascript
const lock = await msq.acquireLock('my-resource', { ttl: 10000 });
try {
    await doSomething();
} finally {
    await lock.release();
}
```

---

### 4.3 tryAcquireLock

**签名**：
```typescript
async tryAcquireLock(
    key: string,
    options?: Omit<LockOptions, 'retryTimes'>
): Promise<Lock | null>
```

**说明**：尝试获取锁，不阻塞，获取失败返回 null

**使用示例**：
```javascript
const lock = await msq.tryAcquireLock('my-resource');
if (lock) {
    try {
        await doSomething();
    } finally {
        await lock.release();
    }
} else {
    console.log('资源被占用');
}
```

---

## 5. 技术实现

### 5.1 目录结构

```text
lib/
├── lock/                          # 新增目录
│   ├── index.js                   # 导出入口
│   ├── BusinessLockManager.js     # 业务锁管理器
│   ├── Lock.js                    # 锁对象
│   └── errors.js                  # 锁相关错误
├── index.js                       # 主入口（添加锁API）
└── ...
```

### 5.2 BusinessLockManager.js

```javascript
/**
 * 业务级分布式锁管理器
 * 基于 Redis 实现，用于保护数据库操作的临界区
 */
class BusinessLockManager {
    /**
     * @param {Object} options
     * @param {Object} options.redis - ioredis 实例
     * @param {string} [options.keyPrefix='monsqlize:lock:'] - 锁键前缀
     * @param {number} [options.defaultTTL=10000] - 默认锁过期时间（毫秒）
     * @param {Object} [options.logger] - 日志记录器
     */
    constructor(options) {
        if (!options.redis) {
            throw new Error('BusinessLockManager requires a Redis instance');
        }
        
        this.redis = options.redis;
        this.keyPrefix = options.keyPrefix || 'monsqlize:lock:';
        this.defaultTTL = options.defaultTTL || 10000;
        this.logger = options.logger;
        
        // 统计信息
        this.stats = {
            acquired: 0,
            released: 0,
            failed: 0,
            timeouts: 0
        };
    }
    
    /**
     * 自动管理锁生命周期
     * @param {string} key - 锁标识
     * @param {Function} callback - 临界区代码
     * @param {Object} [options] - 锁选项
     * @returns {Promise<*>} callback 的返回值
     */
    async withLock(key, callback, options = {}) {
        const lock = await this.acquireLock(key, options);
        try {
            return await callback();
        } finally {
            await lock.release();
        }
    }
    
    /**
     * 获取锁（阻塞重试）
     * @param {string} key - 锁标识
     * @param {Object} [options] - 锁选项
     * @returns {Promise<Lock>}
     */
    async acquireLock(key, options = {}) {
        const ttl = options.ttl || this.defaultTTL;
        const retryTimes = options.retryTimes ?? 3;
        const retryDelay = options.retryDelay || 100;
        
        const lockId = this._generateLockId();
        const fullKey = this.keyPrefix + key;
        
        for (let attempt = 0; attempt <= retryTimes; attempt++) {
            // 使用 SET NX EX 原子操作
            const result = await this.redis.set(
                fullKey,
                lockId,
                'PX', ttl,  // 使用毫秒
                'NX'
            );
            
            if (result === 'OK') {
                this.stats.acquired++;
                if (this.logger) {
                    this.logger.debug(`[Lock] Acquired: ${key}`);
                }
                return new Lock(key, lockId, this, ttl);
            }
            
            // 最后一次尝试失败
            if (attempt === retryTimes) {
                break;
            }
            
            // 等待后重试
            await this._sleep(retryDelay);
        }
        
        this.stats.failed++;
        throw new LockAcquireError(`Failed to acquire lock: ${key}`);
    }
    
    /**
     * 尝试获取锁（不阻塞）
     * @param {string} key - 锁标识
     * @param {Object} [options] - 锁选项
     * @returns {Promise<Lock|null>}
     */
    async tryAcquireLock(key, options = {}) {
        const ttl = options.ttl || this.defaultTTL;
        const lockId = this._generateLockId();
        const fullKey = this.keyPrefix + key;
        
        const result = await this.redis.set(
            fullKey,
            lockId,
            'PX', ttl,
            'NX'
        );
        
        if (result === 'OK') {
            this.stats.acquired++;
            return new Lock(key, lockId, this, ttl);
        }
        
        return null;
    }
    
    /**
     * 释放锁（内部方法，由 Lock 对象调用）
     * @param {string} key - 锁标识
     * @param {string} lockId - 锁ID
     * @returns {Promise<boolean>}
     */
    async releaseLock(key, lockId) {
        const fullKey = this.keyPrefix + key;
        
        // 使用 Lua 脚本确保原子性（只释放自己的锁）
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        
        const result = await this.redis.eval(script, 1, fullKey, lockId);
        
        if (result === 1) {
            this.stats.released++;
            if (this.logger) {
                this.logger.debug(`[Lock] Released: ${key}`);
            }
            return true;
        }
        
        return false;
    }
    
    /**
     * 续期（内部方法，由 Lock 对象调用）
     * @param {string} key - 锁标识
     * @param {string} lockId - 锁ID
     * @param {number} ttl - 新的过期时间
     * @returns {Promise<boolean>}
     */
    async renewLock(key, lockId, ttl) {
        const fullKey = this.keyPrefix + key;
        
        // 使用 Lua 脚本确保只续期自己的锁
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
            else
                return 0
            end
        `;
        
        const result = await this.redis.eval(script, 1, fullKey, lockId, ttl);
        return result === 1;
    }
    
    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
        return { ...this.stats };
    }
    
    /**
     * 生成唯一锁ID
     * @private
     */
    _generateLockId() {
        return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    
    /**
     * 延迟
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = BusinessLockManager;
```

### 5.3 Lock.js

```javascript
/**
 * 锁对象
 * 代表一个已获取的锁，提供释放和续期方法
 */
class Lock {
    constructor(key, lockId, manager, ttl) {
        this.key = key;
        this.lockId = lockId;
        this.manager = manager;
        this.ttl = ttl;
        this.released = false;
        this.acquiredAt = Date.now();
    }
    
    /**
     * 释放锁
     * @returns {Promise<boolean>}
     */
    async release() {
        if (this.released) {
            return false;
        }
        
        const result = await this.manager.releaseLock(this.key, this.lockId);
        this.released = true;
        return result;
    }
    
    /**
     * 续期
     * @param {number} [ttl] - 新的过期时间，默认使用原TTL
     * @returns {Promise<boolean>}
     */
    async renew(ttl) {
        if (this.released) {
            return false;
        }
        
        return this.manager.renewLock(this.key, this.lockId, ttl || this.ttl);
    }
    
    /**
     * 检查锁是否仍被持有
     * @returns {boolean}
     */
    isHeld() {
        return !this.released;
    }
    
    /**
     * 获取锁持有时间
     * @returns {number} 毫秒
     */
    getHoldTime() {
        return Date.now() - this.acquiredAt;
    }
}

module.exports = Lock;
```

### 5.4 errors.js

```javascript
/**
 * 锁获取失败错误
 */
class LockAcquireError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LockAcquireError';
        this.code = 'LOCK_ACQUIRE_FAILED';
    }
}

/**
 * 锁超时错误
 */
class LockTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LockTimeoutError';
        this.code = 'LOCK_TIMEOUT';
    }
}

module.exports = {
    LockAcquireError,
    LockTimeoutError
};
```

---

## 6. 与现有架构集成

### 6.1 在 lib/index.js 中集成

```javascript
// lib/index.js

const BusinessLockManager = require('./lock/BusinessLockManager');

module.exports = class {
    constructor(options) {
        // ...existing code...
        
        // 保存 lock 配置
        this._lockConfig = options.lock;
    }
    
    async connect() {
        // ...existing code...
        
        // 初始化业务锁管理器（如果配置了 Redis）
        await this._initBusinessLockManager();
        
        // 添加锁 API 到实例
        if (this._businessLockManager) {
            this.dbInstance.withLock = (key, callback, opts) => 
                this._businessLockManager.withLock(key, callback, opts);
            this.dbInstance.acquireLock = (key, opts) => 
                this._businessLockManager.acquireLock(key, opts);
            this.dbInstance.tryAcquireLock = (key, opts) => 
                this._businessLockManager.tryAcquireLock(key, opts);
            this.dbInstance.getLockStats = () => 
                this._businessLockManager.getStats();
        }
        
        return this.dbInstance;
    }
    
    /**
     * 初始化业务锁管理器
     * @private
     */
    async _initBusinessLockManager() {
        // 获取 Redis 实例（优先使用锁配置，其次使用分布式缓存配置）
        let redis = null;
        
        if (this._lockConfig?.redis) {
            redis = this._lockConfig.redis;
        } else if (this._cacheConfig?.distributed?.redis) {
            redis = this._cacheConfig.distributed.redis;
        } else if (this.cache?.remote?.getRedisInstance) {
            redis = this.cache.remote.getRedisInstance();
        }
        
        if (redis) {
            this._businessLockManager = new BusinessLockManager({
                redis,
                keyPrefix: this._lockConfig?.keyPrefix || 'monsqlize:lock:',
                defaultTTL: this._lockConfig?.defaultTTL || 10000,
                logger: this.logger
            });
            
            if (this.logger) {
                this.logger.info('✅ Business lock manager initialized');
            }
        }
    }
    
    // ...existing code...
}
```

### 6.2 配置示例

```javascript
const Redis = require('ioredis');
const MonSQLize = require('monsqlize');

const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
    
    // 方式1：通过分布式缓存配置（自动复用 Redis）
    cache: {
        multiLevel: true,
        remote: MonSQLize.createRedisCacheAdapter(redis),
        distributed: {
            enabled: true
        }
    }
    
    // 方式2：独立配置锁（可选）
    // lock: {
    //     redis,
    //     keyPrefix: 'myapp:lock:',
    //     defaultTTL: 5000
    // }
});
```

---

## 7. 配置选项

### 7.1 全局配置

```javascript
new MonSQLize({
    // ...other options...
    
    lock: {
        // Redis 实例（可选，默认复用 cache.distributed.redis）
        redis: redisInstance,
        
        // 锁键前缀（可选）
        keyPrefix: 'monsqlize:lock:',
        
        // 默认锁过期时间（毫秒，可选）
        defaultTTL: 10000,
        
        // 默认重试次数（可选）
        defaultRetryTimes: 3,
        
        // 默认重试间隔（毫秒，可选）
        defaultRetryDelay: 100
    }
});
```

### 7.2 API 级别配置

```javascript
// 每次调用可以覆盖默认配置
await msq.withLock('key', callback, {
    ttl: 5000,        // 覆盖默认 TTL
    retryTimes: 5,    // 覆盖默认重试次数
    retryDelay: 200   // 覆盖默认重试间隔
});
```

---

## 8. 错误处理

### 8.1 错误类型

| 错误 | 说明 | 处理建议 |
|------|------|---------|
| `LockAcquireError` | 获取锁失败（重试后仍失败） | 提示用户稍后重试 |
| `LockTimeoutError` | 锁操作超时 | 检查 Redis 连接 |
| Redis 连接错误 | Redis 不可用 | 降级处理或报警 |

### 8.2 错误处理示例

```javascript
const { LockAcquireError } = require('monsqlize/errors');

try {
    await msq.withLock('inventory:SKU123', async () => {
        await updateInventory();
    });
} catch (error) {
    if (error instanceof LockAcquireError) {
        // 锁被占用
        console.log('资源繁忙，请稍后重试');
        return { success: false, reason: 'busy' };
    }
    throw error;
}
```

### 8.3 降级策略

```javascript
// 锁不可用时的降级处理
async function safeUpdateWithLock(key, updateFn) {
    // 检查锁管理器是否可用
    if (!msq.dbInstance.withLock) {
        console.warn('Lock manager not available, proceeding without lock');
        return updateFn();
    }
    
    try {
        return await msq.withLock(key, updateFn);
    } catch (error) {
        if (error.code === 'LOCK_ACQUIRE_FAILED') {
            // 可以选择：重试、返回错误、或无锁执行
            throw error;
        }
        throw error;
    }
}
```

### 8.4 Redis 连接中断处理 🔴

**场景**：Redis 服务不可用或网络中断

```javascript
// BusinessLockManager 内部处理
async withLock(key, callback, options = {}) {
    try {
        const lock = await this.acquireLock(key, options);
        try {
            return await callback();
        } finally {
            // 释放失败不应阻塞业务
            await lock.release().catch(err => {
                // 锁会在 TTL 后自动过期，记录日志即可
                this.logger?.warn(`[Lock] Release failed: ${key}`, err);
            });
        }
    } catch (error) {
        // Redis 连接问题检测
        if (this._isRedisConnectionError(error)) {
            if (options.fallbackToNoLock) {
                this.logger?.warn(`[Lock] Redis unavailable, proceeding without lock: ${key}`);
                return callback();
            }
            throw new LockAcquireError(`Redis unavailable: ${error.message}`);
        }
        throw error;
    }
}

_isRedisConnectionError(error) {
    const msg = error.message || '';
    return msg.includes('ECONNREFUSED') || 
           msg.includes('ETIMEDOUT') ||
           msg.includes('ENOTFOUND') ||
           msg.includes('Connection is closed');
}
```

**配置项**：

```javascript
await msq.withLock('key', callback, {
    fallbackToNoLock: true  // Redis 不可用时降级为无锁执行（慎用）
});
```

**降级策略选择**：

| 场景 | 建议策略 | 说明 |
|------|---------|------|
| 核心业务（订单、支付） | 抛异常，不降级 | 宁可失败也不能数据错乱 |
| 非核心业务（统计、日志） | 可降级无锁执行 | 偶尔并发问题可接受 |
| 定时任务 | 抛异常，跳过执行 | 下次再执行 |
```

---

## 9. 测试计划

### 9.1 单元测试

| 测试文件 | 测试内容 |
|---------|---------|
| `test/unit/lock/BusinessLockManager.test.js` | 锁管理器核心逻辑 |
| `test/unit/lock/Lock.test.js` | 锁对象方法 |

**测试用例**：

```javascript
describe('BusinessLockManager', () => {
    describe('withLock', () => {
        it('should execute callback within lock', async () => {});
        it('should release lock after callback completes', async () => {});
        it('should release lock if callback throws', async () => {});
        it('should retry on lock conflict', async () => {});
        it('should throw LockAcquireError after max retries', async () => {});
    });
    
    describe('acquireLock', () => {
        it('should return Lock object on success', async () => {});
        it('should block and retry on conflict', async () => {});
    });
    
    describe('tryAcquireLock', () => {
        it('should return Lock object on success', async () => {});
        it('should return null on conflict (no blocking)', async () => {});
    });
    
    describe('Lock.release', () => {
        it('should release the lock', async () => {});
        it('should not release other\'s lock', async () => {});
        it('should be idempotent', async () => {});
    });
    
    describe('Lock.renew', () => {
        it('should extend lock TTL', async () => {});
        it('should fail if lock expired', async () => {});
    });
});
```

### 9.2 集成测试

| 测试文件 | 测试内容 |
|---------|---------|
| `test/integration/lock.test.js` | 真实 Redis 环境测试 |

**测试用例**：

```javascript
describe('Lock Integration', () => {
    it('should prevent concurrent access', async () => {
        // 模拟并发请求
    });
    
    it('should work with transaction', async () => {
        // 锁 + 事务组合
    });
    
    it('should auto-expire on process crash', async () => {
        // 模拟进程崩溃，验证锁自动释放
    });
});
```

### 9.3 并发测试

```javascript
describe('Lock Concurrency', () => {
    it('should serialize concurrent operations', async () => {
        let counter = 0;
        const operations = Array(10).fill(null).map(() => 
            msq.withLock('counter', async () => {
                const current = counter;
                await sleep(10); // 模拟耗时操作
                counter = current + 1;
            })
        );
        
        await Promise.all(operations);
        expect(counter).toBe(10); // 无锁时可能 < 10
    });
});
```

---

## 10. 文档计划

### 10.1 文档清单

| 文档 | 路径 | 说明 |
|------|------|------|
| API 文档 | `docs/business-lock.md` | 完整 API 说明 |
| 使用示例 | `examples/business-lock.examples.js` | 可运行示例 |
| 分布式部署 | `docs/distributed-deployment.md` | 更新现有文档 |
| README | `README.md` | 添加锁功能介绍 |

### 10.2 docs/business-lock.md 大纲

```markdown
# 业务级分布式锁

## 概述
## 快速开始
## API 参考
  - withLock
  - acquireLock
  - tryAcquireLock
  - Lock 对象
## 配置选项
## 使用场景
  - 库存扣减
  - 订单创建
  - 定时任务防重
## 与事务配合
## 错误处理
## 最佳实践
## 常见问题
## 与专业锁库的对比
```

---

## 11. 实施计划

### 11.1 开发阶段

| 阶段 | 时间 | 内容 |
|------|------|------|
| **阶段1：核心实现** | 3天 | BusinessLockManager + Lock + 集成 |
| **阶段2：单元测试** | 2天 | 单元测试 + 并发测试 |
| **阶段3：集成测试** | 1天 | 真实 Redis 环境测试 |
| **阶段4：文档** | 2天 | API 文档 + 示例 + 更新 README |
| **阶段5：Review** | 1天 | 代码审查 + 修复 |
| **合计** | **9天** | |

### 11.2 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **新增** | `lib/lock/index.js` | 导出入口 |
| **新增** | `lib/lock/BusinessLockManager.js` | 锁管理器 |
| **新增** | `lib/lock/Lock.js` | 锁对象 |
| **新增** | `lib/lock/errors.js` | 错误定义 |
| **修改** | `lib/index.js` | 集成锁 API |
| **修改** | `lib/errors.js` | 导出锁错误 |
| **新增** | `test/unit/lock/BusinessLockManager.test.js` | 单元测试 |
| **新增** | `test/unit/lock/Lock.test.js` | 单元测试 |
| **新增** | `test/integration/lock.test.js` | 集成测试 |
| **新增** | `docs/business-lock.md` | API 文档 |
| **新增** | `examples/business-lock.examples.js` | 示例 |
| **修改** | `docs/distributed-deployment.md` | 更新 |
| **修改** | `README.md` | 添加锁功能介绍 |
| **修改** | `index.d.ts` | TypeScript 类型定义 |

### 11.3 TypeScript 类型定义详细设计 🔴

在 `index.d.ts` 中添加：

```typescript
/**
 * 锁配置选项
 */
interface LockOptions {
    /** 锁过期时间（毫秒），默认 10000 */
    ttl?: number;
    /** 获取锁失败时的重试次数，默认 3 */
    retryTimes?: number;
    /** 重试间隔（毫秒），默认 100 */
    retryDelay?: number;
    /** Redis 不可用时是否降级为无锁执行，默认 false */
    fallbackToNoLock?: boolean;
}

/**
 * 锁对象
 */
interface Lock {
    /** 锁的 Key */
    readonly key: string;
    /** 锁的唯一ID */
    readonly lockId: string;
    /** 释放锁 */
    release(): Promise<boolean>;
    /** 续期（延长 TTL） */
    renew(ttl?: number): Promise<boolean>;
    /** 检查锁是否仍被持有 */
    isHeld(): boolean;
    /** 获取锁持有时间（毫秒） */
    getHoldTime(): number;
}

/**
 * 锁统计信息
 */
interface LockStats {
    /** 成功获取锁的次数 */
    acquired: number;
    /** 成功释放锁的次数 */
    released: number;
    /** 获取锁失败的次数 */
    failed: number;
    /** 锁超时的次数 */
    timeouts: number;
}

/**
 * 锁相关错误
 */
declare class LockAcquireError extends Error {
    readonly code: 'LOCK_ACQUIRE_FAILED';
}

declare class LockTimeoutError extends Error {
    readonly code: 'LOCK_TIMEOUT';
}

// 在 MonSQLizeInstance 接口中添加
interface MonSQLizeInstance {
    // ...existing types...
    
    /**
     * 自动管理锁生命周期（推荐）
     * @param key 锁的唯一标识
     * @param callback 获取锁后执行的函数
     * @param options 锁配置选项
     */
    withLock<T>(key: string, callback: () => Promise<T>, options?: LockOptions): Promise<T>;
    
    /**
     * 手动获取锁（阻塞重试）
     * @param key 锁的唯一标识
     * @param options 锁配置选项
     */
    acquireLock(key: string, options?: LockOptions): Promise<Lock>;
    
    /**
     * 尝试获取锁（不阻塞）
     * @param key 锁的唯一标识
     * @param options 锁配置选项（不包含 retryTimes）
     */
    tryAcquireLock(key: string, options?: Omit<LockOptions, 'retryTimes'>): Promise<Lock | null>;
    
    /**
     * 获取锁统计信息
     */
    getLockStats(): LockStats;
}
```

---

## 12. 风险评估

### 12.1 风险列表

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| Redis 单点故障 | 🟡 中 | 文档说明，建议用户配置 Redis 高可用 |
| 锁泄露（未释放） | 🟢 低 | TTL 自动过期 + withLock 自动释放 |
| 时钟漂移 | 🟢 低 | 使用 Redis 服务器时间，非本地时间 |
| 性能影响 | 🟢 低 | 每次锁操作仅 1-2 次 Redis 调用 |

### 12.2 限制说明

在文档中明确说明：

```markdown
## 限制

1. **单 Redis 实例**：本实现假设单个 Redis 实例，不支持 Redlock 多节点算法
2. **非强一致性**：在 Redis 主从切换时可能出现短暂的锁失效
3. **不可重入**：同一线程不能重复获取同一把锁

如需更强的一致性保证，建议使用专业分布式锁库（如 redlock）或协调服务（如 ZooKeeper）。
```

---

## 📝 变更记录

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0 | 2025-12-18 | 初始方案 |
| v1.1 | 2025-12-18 | 三轮分析后补充：Redis连接中断处理(8.4)、TypeScript类型定义(11.3) |

---

## 📚 相关文档

- [STATUS.md](../../STATUS.md) - 需求状态追踪
- [分布式部署指南](../../docs/distributed-deployment.md) - 现有分布式文档
- [事务功能文档](../../docs/transaction.md) - 事务相关

