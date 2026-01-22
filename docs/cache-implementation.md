# 缓存机制实现原理

> **版本**: v1.0.9+  
> **类型**: 技术原理文档  
> **分类**: 架构设计与实现

---

## 📑 目录

- [概述](#概述)
- [核心架构](#核心架构)
- [缓存数据结构](#缓存数据结构)
- [LRU淘汰策略](#lru淘汰策略)
- [惰性过期机制](#惰性过期机制)
- [缓存键生成](#缓存键生成)
- [读穿缓存模式](#读穿缓存模式)
- [并发去重](#并发去重)
- [事务与缓存锁](#事务与缓存锁)
- [多层缓存架构](#多层缓存架构)
- [缓存失效](#缓存失效)
- [内存管理](#内存管理)
- [性能优化](#性能优化)
- [源码剖析](#源码剖析)

---

## 概述

monSQLize 的缓存系统是一个高性能、低内存占用的分布式缓存解决方案，核心设计目标：

- **零依赖**：无需外部缓存服务即可运行（内置 LRU 缓存）
- **高性能**：读操作 O(1)，LRU 维护 O(1)
- **低内存**：惰性过期、主动淘汰、精确计量
- **线性扩展**：支持多层缓存（本地 + Redis）
- **事务安全**：缓存锁机制保证 ACID

### 核心特性

```
┌─────────────────────────────────────────────────────┐
│                  Cache Layer                        │
├─────────────────────────────────────────────────────┤
│  · LRU淘汰（Map数据结构）                             │
│  · 惰性TTL过期                                       │
│  · 并发去重（Inflight Map）                          │
│  · 缓存锁（事务支持）                                 │
│  · 多层架构（Local + Remote）                        │
│  · 精确内存计量                                      │
└─────────────────────────────────────────────────────┘
```

---

## 核心架构

### 1. 类图

```
CacheFactory (静态工具类)
├── createDefault()          // 创建默认内存缓存
├── isValidCache()           // 验证缓存接口
├── getOrCreateCache()       // 缓存工厂方法
├── stableStringify()        // 稳定序列化
├── buildCacheKey()          // 构建缓存键
├── readThrough()            // 读穿缓存
└── createCachedReader()     // 创建读取器

Cache (内存缓存实现)
├── cache: Map               // 核心存储（LRU结构）
├── stats: Object            // 统计信息
├── lockManager              // 缓存锁管理器
├── set(key, value, ttl)     // 写入
├── get(key)                 // 读取（LRU刷新）
├── del(key)                 // 删除
├── delPattern(pattern)      // 模式匹配删除
└── _enforceLimits()         // LRU淘汰

MultiLevelCache (多层缓存)
├── local: Cache             // 本地缓存
├── remote: RedisCache       // 远端缓存
└── policy: Object           // 缓存策略
```

### 2. 数据流

```
查询请求
   ↓
判断 cache > 0 ?
   ↓ 是
检查 __inflight (并发去重)
   ↓ 无
local.get(key)
   ↓ MISS
remote.get(key) [多层缓存]
   ↓ MISS
执行查询 fetcher()
   ↓
local.set(key, result, ttl)
remote.set(key, result, ttl)
   ↓
返回结果
```

---

## 缓存数据结构

### Map-Based LRU

使用 JavaScript **原生 Map** 实现 LRU，利用 Map 的插入顺序特性：

```javascript
class Cache {
    constructor(options = {}) {
        this.cache = new Map(); // 核心存储
        this.options = {
            maxSize: options.maxSize || 100000,    // 最大条目数
            maxMemory: options.maxMemory || 0,     // 最大内存（字节）
        };
        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            memoryUsage: 0
        };
    }
}
```

### 条目结构

每个缓存条目包含：

```javascript
{
    value: any,           // 缓存的实际数据
    size: number,         // 内存占用（字节）
    expireAt: number|null // 过期时间戳（null表示永不过期）
}
```

### 示例

```javascript
cache.set("user:123", { name: "John", age: 30 }, 5000);

// Map内部存储：
// "user:123" => {
//     value: { name: "John", age: 30 },
//     size: 48,  // 估算的内存字节数
//     expireAt: Date.now() + 5000
// }
```

---

## LRU淘汰策略

### Map的插入顺序特性

JavaScript Map **保证插入顺序**，这是实现 LRU 的关键：

```javascript
const map = new Map();
map.set('a', 1);
map.set('b', 2);
map.set('c', 3);

// 迭代顺序：a → b → c
for (const [key] of map) {
    console.log(key);  // a, b, c
}

// 最旧的键：a
const oldest = map.keys().next().value;  // 'a'
```

### LRU 刷新实现

每次 **读取** 时，将条目移到 Map 尾部：

```javascript
async get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
        this.stats.misses++;
        return undefined;
    }
    
    // 惰性过期检查
    if (entry.expireAt && entry.expireAt <= Date.now()) {
        this._deleteInternal(key);
        this.stats.misses++;
        return undefined;
    }
    
    // ⭐ LRU刷新：删除再重插 → 移到尾部
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.value;
}
```

### 淘汰逻辑

当缓存满时，从 Map **头部**（最旧）开始淘汰：

```javascript
_enforceLimits() {
    // 按条目数限制
    while (this.cache.size > this.options.maxSize) {
        const oldest = this.cache.keys().next().value;  // 头部=最旧
        if (!oldest) break;
        
        this._deleteInternal(oldest);
        this.stats.evictions++;
    }
    
    // 按内存限制
    if (this.options.maxMemory > 0) {
        while (this.stats.memoryUsage > this.options.maxMemory) {
            const oldest = this.cache.keys().next().value;
            if (!oldest) break;
            
            this._deleteInternal(oldest);
            this.stats.evictions++;
        }
    }
}
```

### 时间复杂度

| 操作 | 复杂度 | 说明 |
|------|--------|------|
| get | O(1) | Map查找 + 删除重插 |
| set | O(1) | Map插入 |
| LRU刷新 | O(1) | delete + set |
| 淘汰一个 | O(1) | keys().next() |
| 淘汰N个 | O(N) | while循环 |

---

## 惰性过期机制

### 为什么用惰性过期？

**传统定时器方式的问题**：
- ❌ 每个条目一个 setTimeout → 大量定时器阻塞事件循环
- ❌ 进程无法退出（定时器保持事件循环活跃）
- ❌ 内存泄漏风险

**惰性过期的优势**：
- ✅ 零定时器开销
- ✅ 进程可正常退出
- ✅ 按需检查，性能更好

### 实现原理

在 **每次读取** 时检查过期：

```javascript
async get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
        return undefined;
    }
    
    // ⭐ 惰性过期：在访问时检查
    if (entry.expireAt && entry.expireAt <= Date.now()) {
        this._deleteInternal(key);  // 删除过期条目
        return undefined;
    }
    
    return entry.value;
}
```

### 内存清理

虽然不会主动过期，但有两种清理机制：

1. **访问时清理**：读取时发现过期 → 立即删除
2. **LRU淘汰**：缓存满时淘汰最旧条目（可能已过期）

```javascript
// 场景1：用户访问 → 发现过期 → 删除
await cache.get('expired-key');  // undefined（已删除）

// 场景2：缓存满 → LRU淘汰包含过期条目
cache.set('new-key', 'value');  // 触发淘汰
// 最旧的条目被删除（无论是否过期）
```

---

## 缓存键生成

### 稳定序列化

确保相同结构的对象生成相同的键：

```javascript
static stableStringify(value) {
    // 1. 对象键按字母排序
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const keys = Object.keys(value).sort();
        return '{' + keys.map(k => 
            JSON.stringify(k) + ':' + this.stableStringify(value[k])
        ).join(',') + '}';
    }
    
    // 2. 特殊类型处理
    if (value instanceof RegExp) {
        return JSON.stringify(value.toString());
    }
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString());
    }
    
    // 3. BSON类型（ObjectId等）
    if (value && value._bsontype === 'ObjectId') {
        return JSON.stringify(`ObjectId(${value.toHexString()})`);
    }
    
    return JSON.stringify(value);
}
```

### 键结构

缓存键包含完整的命名空间和操作信息：

```javascript
static buildCacheKey({ iid, type, db, collection, op, base = {} }) {
    return {
        ns: {                       // 命名空间
            p: 'monSQLize',         // 项目标识
            v: 1,                   // 版本号
            iid,                    // 实例ID
            type,                   // 数据库类型
            db,                     // 数据库名
            collection              // 集合名
        },
        op,                         // 操作类型（find/findOne/count等）
        ...base                     // 查询参数（query/projection/sort等）
    };
}
```

### 示例

```javascript
// 查询
await collection('users').find(
    { age: { $gte: 18 } },
    { projection: { name: 1 }, limit: 10, cache: 5000 }
);

// 生成的缓存键
{
    ns: {
        p: 'monSQLize',
        v: 1,
        iid: 'default',
        type: 'mongodb',
        db: 'shop',
        collection: 'users'
    },
    op: 'find',
    query: { age: { $gte: 18 } },
    projection: { name: 1 },
    limit: 10
}

// 序列化后（稳定排序）
{"ns":{"collection":"users","db":"shop","iid":"default","p":"monSQLize","type":"mongodb","v":1},"op":"find","limit":10,"projection":{"name":1},"query":{"age":{"$gte":18}}}
```

---

## 读穿缓存模式

### Cache-Aside 模式

monSQLize 使用 **Cache-Aside**（旁路缓存）模式：

```
查询
  ↓
检查缓存
  ↓
 HIT? ────── YES ──→ 返回缓存数据
  │
 NO
  ↓
查询数据库
  ↓
写入缓存
  ↓
返回数据
```

### 实现

```javascript
static async readThrough(cache, ttlMs, keyObj, fetcher) {
    const ttl = Number(ttlMs || 0);
    
    // TTL <= 0：禁用缓存
    if (!cache || ttl <= 0) {
        return await fetcher();
    }
    
    const key = this.stableStringify(keyObj);
    
    // 1. 尝试从缓存读取
    const cached = await cache.get(key);
    if (cached !== undefined) {
        return cached;  // 缓存命中
    }
    
    // 2. 缓存未命中：执行查询
    const fresh = await fetcher();
    
    // 3. 写入缓存
    try {
        await cache.set(key, fresh, ttl);
    } catch (_) {
        // 忽略缓存写失败
    }
    
    return fresh;
}
```

### 绑定上下文的读取器

为每个集合创建绑定上下文的读取器：

```javascript
static createCachedReader(cache, ctx) {
    return (op, base = {}, fetcher) => {
        // 检查是否在事务中
        const inTransaction = base.session && base.session.__monSQLizeTransaction;
        
        // 事务内默认不缓存
        let ttl = 0;
        if (inTransaction) {
            ttl = (base.cache !== undefined) ? Number(base.cache) : 0;
        } else {
            ttl = base.cache ? Number(base.cache) : 0;
        }
        
        // 构建缓存键
        const { cache: _, maxTimeMS: __, session: ___, ...keyBase } = base || {};
        const key = this.buildCacheKey({ ...ctx, op, base: keyBase });
        
        return this.readThrough(cache, ttl, key, fetcher);
    };
}
```

---

## 并发去重

### 问题场景

多个相同查询并发执行时，应该共享结果而不是重复查询：

```javascript
// 问题：100个并发请求 → 100次数据库查询
for (let i = 0; i < 100; i++) {
    collection('users').find({ age: { $gte: 18 } }, { cache: 5000 });
}
```

### Inflight Map

使用全局 Map 跟踪正在进行的查询：

```javascript
// 全局并发去重映射
const __inflight = new Map();

static async readThrough(cache, ttlMs, keyObj, fetcher) {
    const key = this.stableStringify(keyObj);
    
    // 1. 检查缓存
    const cached = await cache.get(key);
    if (cached !== undefined) return cached;
    
    // 2. ⭐ 检查是否有正在进行的查询
    if (__inflight.has(key)) {
        try {
            return await __inflight.get(key);  // 共享Promise
        } catch (_) {
            // 上次失败，继续执行新查询
        }
    }
    
    // 3. 执行查询并记录Promise
    const promise = (async () => {
        const fresh = await fetcher();
        await cache.set(key, fresh, ttl);
        return fresh;
    })();
    
    __inflight.set(key, promise);
    
    try {
        return await promise;
    } finally {
        __inflight.delete(key);  // 清理
    }
}
```

### 效果

```javascript
// ✅ 优化后：100个并发请求 → 1次数据库查询
const promises = [];
for (let i = 0; i < 100; i++) {
    promises.push(
        collection('users').find({ age: { $gte: 18 } }, { cache: 5000 })
    );
}
await Promise.all(promises);
// 只有第一个查询执行了fetcher，其余99个等待并共享结果
```

---

## 事务与缓存锁

### 问题：脏读

事务内的修改不应该影响缓存：

```javascript
// ❌ 错误：事务内更新了缓存
await msq.runTransaction(async (session) => {
    await collection('users').updateOne(
        { userId: 'user1' },
        { $set: { name: 'New Name' } },
        { session }
    );
    // 写入缓存（但事务可能回滚）
});
// 事务回滚 → 缓存有脏数据
```

### 缓存锁机制

在事务期间**锁定**相关缓存键：

```javascript
class CacheLockManager {
    constructor() {
        this.locks = new Map();  // 键 → 锁定信息
    }
    
    // 锁定键
    lock(key) {
        if (!this.locks.has(key)) {
            this.locks.set(key, { count: 0 });
        }
        this.locks.get(key).count++;
    }
    
    // 解锁键
    unlock(key) {
        const lock = this.locks.get(key);
        if (lock) {
            lock.count--;
            if (lock.count <= 0) {
                this.locks.delete(key);
            }
        }
    }
    
    // 检查是否被锁定
    isLocked(key) {
        return this.locks.has(key);
    }
}
```

### 使用流程

```javascript
await msq.runTransaction(async (session) => {
    // 1. 锁定缓存键
    const key = buildCacheKey({ collection: 'users', query: { userId: 'user1' } });
    lockManager.lock(key);
    
    // 2. 执行事务操作
    await collection('users').updateOne(
        { userId: 'user1' },
        { $set: { name: 'New Name' } },
        { session }
    );
    
    // 3. 提交后解锁
    await session.commitTransaction();
    lockManager.unlock(key);
    
    // 4. 失效缓存
    await cache.del(key);
});
```

### 锁定期间拒绝写入

```javascript
async set(key, value, ttl) {
    // ⭐ 检查缓存锁
    if (this.lockManager && this.lockManager.isLocked(key)) {
        return;  // 拒绝写入
    }
    
    // 正常写入
    this.cache.set(key, { value, size, expireAt });
}
```

---

## 多层缓存架构

### 架构

```
Application
     ↓
┌─────────────────┐
│  Local Cache    │  ← 内存LRU（L1）
│  (50ms TTL)     │
└─────────────────┘
     ↓ MISS
┌─────────────────┐
│  Remote Cache   │  ← Redis/Memcached（L2）
│  (Long TTL)     │
└─────────────────┘
     ↓ MISS
┌─────────────────┐
│    Database     │
└─────────────────┘
```

### 配置

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'shop',
    config: { uri: 'mongodb://localhost:27017' },
    cache: {
        multiLevel: true,
        local: {
            maxSize: 10000,
            maxMemory: 100 * 1024 * 1024  // 100MB
        },
        remote: redisClient,  // Redis实例
        policy: {
            localTTL: 50,      // 本地缓存50ms
            remoteTTL: 5000    // 远端缓存5秒
        }
    }
});
```

### 实现

```javascript
class MultiLevelCache {
    constructor({ local, remote, policy }) {
        this.local = local;
        this.remote = remote;
        this.policy = policy;
    }
    
    async get(key) {
        // 1. 先查本地缓存
        let value = await this.local.get(key);
        if (value !== undefined) {
            return value;  // L1命中
        }
        
        // 2. 查远端缓存
        if (this.remote) {
            value = await this.remote.get(key);
            if (value !== undefined) {
                // L2命中：回填本地缓存
                await this.local.set(key, value, this.policy.localTTL);
                return value;
            }
        }
        
        return undefined;  // 都未命中
    }
    
    async set(key, value, ttl) {
        // 写入本地
        await this.local.set(key, value, this.policy.localTTL);
        
        // 写入远端
        if (this.remote) {
            await this.remote.set(key, value, this.policy.remoteTTL);
        }
    }
}
```

---

## 缓存失效

### 自动失效

写操作（insert/update/delete）自动失效缓存：

```javascript
// 写操作后自动失效
await collection('users').updateOne(
    { userId: 'user1' },
    { $set: { name: 'New Name' } }
);
// 自动失效 users 集合的所有缓存
```

### 手动失效

```javascript
// 失效整个集合
await collection('users').invalidate();

// 失效特定模式
await cache.delPattern('*users*find*');
```

### 命名空间失效

使用命名空间模式失效：

```javascript
static buildNamespacePattern({ iid, type, db, collection }) {
    const nsObj = { p: 'monSQLize', v: 1, iid, type, db, collection };
    const nsStr = '"ns":' + this.stableStringify(nsObj);
    return `*${nsStr}*`;  // 匹配所有包含该命名空间的键
}

// 使用
const pattern = CacheFactory.buildNamespacePattern({
    iid: 'default',
    type: 'mongodb',
    db: 'shop',
    collection: 'users'
});
await cache.delPattern(pattern);
```

---

## 内存管理

### 内存估算

估算每个条目的内存占用：

```javascript
_estimateSize(key, value) {
    // 键大小
    const keySize = typeof key === 'string' 
        ? key.length * 2  // UTF-16编码
        : 8;              // 其他类型
    
    // 值大小
    let valueSize = 8;
    if (typeof value === 'string') {
        valueSize = value.length * 2;
    } else if (typeof value === 'object' && value !== null) {
        try {
            valueSize = JSON.stringify(value).length * 2;
        } catch (e) {
            valueSize = 100;  // 估算值
        }
    }
    
    return keySize + valueSize;
}
```

### 精确计量

每次 set/delete 都更新内存使用量：

```javascript
async set(key, value, ttl) {
    const memorySize = this._estimateSize(key, value);
    
    // 如果键已存在，扣减旧值的内存
    const existedEntry = this.cache.get(key);
    if (existedEntry) {
        this.stats.memoryUsage -= existedEntry.size;
        this.cache.delete(key);
    }
    
    // 插入新值
    this.cache.set(key, { value, size: memorySize, expireAt });
    this.stats.memoryUsage += memorySize;
    
    // 强制执行限制
    this._enforceLimits();
}

_deleteInternal(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    this.cache.delete(key);
    this.stats.memoryUsage -= entry.size;  // 精确扣减
    return true;
}
```

### 内存限制

```javascript
_enforceLimits() {
    // 先按条目数限制
    while (this.cache.size > this.options.maxSize) {
        const oldest = this.cache.keys().next().value;
        this._deleteInternal(oldest);
        this.stats.evictions++;
    }
    
    // 再按内存限制
    if (this.options.maxMemory > 0) {
        while (this.stats.memoryUsage > this.options.maxMemory) {
            const oldest = this.cache.keys().next().value;
            this._deleteInternal(oldest);
            this.stats.evictions++;
        }
    }
}
```

---

## 性能优化

### 1. 避免定时器开销

使用惰性过期而不是 setTimeout：

```javascript
// ❌ 坏实践：每个条目一个定时器
async set(key, value, ttl) {
    this.cache.set(key, value);
    
    if (ttl > 0) {
        const timer = setTimeout(() => {
            this.cache.delete(key);
        }, ttl);
        this.timers.set(key, timer);  // 内存泄漏风险
    }
}

// ✅ 好实践：惰性过期
async set(key, value, ttl) {
    const expireAt = ttl > 0 ? Date.now() + ttl : null;
    this.cache.set(key, { value, expireAt });
    // 无定时器
}

async get(key) {
    const entry = this.cache.get(key);
    if (entry && entry.expireAt && entry.expireAt <= Date.now()) {
        this.cache.delete(key);  // 访问时检查过期
        return undefined;
    }
    return entry?.value;
}
```

### 2. 批量操作优化

```javascript
async setMany(keyValuePairs, ttl = 0) {
    // 批量设置，最后统一执行淘汰
    for (const [key, value] of Object.entries(keyValuePairs)) {
        const memorySize = this._estimateSize(key, value);
        const expireAt = ttl > 0 ? Date.now() + ttl : null;
        
        this.cache.set(key, { value, size: memorySize, expireAt });
        this.stats.memoryUsage += memorySize;
    }
    
    // 统一执行淘汰（减少重复检查）
    this._enforceLimits();
}
```

### 3. 并发去重

避免重复查询：

```javascript
// ✅ 100个并发查询 → 1次数据库访问
const __inflight = new Map();

if (__inflight.has(key)) {
    return await __inflight.get(key);  // 共享Promise
}

const promise = fetcher();
__inflight.set(key, promise);

try {
    return await promise;
} finally {
    __inflight.delete(key);
}
```

---

## 源码剖析

### lib/cache.js

```javascript
module.exports = class CacheFactory {
    // 读穿缓存：核心查询逻辑
    static async readThrough(cache, ttlMs, keyObj, fetcher) {
        const ttl = Number(ttlMs || 0);
        if (!cache || ttl <= 0) {
            return await fetcher();
        }
        
        const key = this.stableStringify(keyObj);
        
        // 1. 检查缓存
        const cached = await cache.get(key);
        if (cached !== undefined) return cached;
        
        // 2. 并发去重
        if (__inflight.has(key)) {
            try { return await __inflight.get(key); } catch (_) { }
        }
        
        // 3. 执行查询
        const p = (async () => {
            const fresh = await fetcher();
            try { await cache.set(key, fresh, ttl); } catch (_) { }
            return fresh;
        })();
        
        __inflight.set(key, p);
        try {
            return await p;
        } finally {
            __inflight.delete(key);
        }
    }
    
    // 创建绑定上下文的读取器
    static createCachedReader(cache, ctx) {
        return (op, base = {}, fetcher) => {
            // 事务检查
            const inTransaction = base.session && base.session.__monSQLizeTransaction;
            let ttl = 0;
            
            if (inTransaction) {
                ttl = (base.cache !== undefined) ? Number(base.cache) : 0;
            } else {
                ttl = base.cache ? Number(base.cache) : 0;
            }
            
            // 构建键并读取
            const { cache: _, maxTimeMS: __, session: ___, ...keyBase } = base || {};
            const key = this.buildCacheKey({ ...ctx, op, base: keyBase });
            return this.readThrough(cache, ttl, key, fetcher);
        };
    }
};
```

### lib/mongodb/queries/base-query.js

```javascript
// 在查询方法中使用缓存
async find(query = {}, options = {}) {
    return await this._cachedRead('find', {
        query,
        projection: options.projection,
        sort: options.sort,
        limit: options.limit,
        skip: options.skip,
        cache: options.cache  // 传入TTL
    }, async () => {
        // 实际查询逻辑
        return await this._collection.find(query, options).toArray();
    });
}
```

---

## 相关文档

- [缓存策略文档](./cache.md) - 用户使用指南
- [事务文档](./transaction.md) - 事务与缓存交互
- [性能优化](./performance.md) - 缓存性能调优

---

**最后更新**: 2026-01-20  
**版本**: v1.0.9
