<div align="center">

# 🚀 monSQLize

### MongoDB 的性能加速器 - 让数据库查询快 10~100 倍

**100% API 兼容 · 零学习成本 · 开箱即用**

[![npm version](https://img.shields.io/npm/v/monsqlize.svg)](https://www.npmjs.com/package/monsqlize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Test Coverage](https://img.shields.io/badge/Coverage-77%25-brightgreen.svg)](https://codecov.io/gh/vextjs/monSQLize)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4%2B-green.svg)](https://www.mongodb.com/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-brightgreen)](https://nodejs.org/)

```bash
npm install monsqlize
```

[快速开始](#-快速开始) · [为什么选择](#-为什么选择-monsqlize) · [核心特性](#-核心特性) · [完整文档](./docs/INDEX.md)

</div>

---

## 📑 目录

- [⚡ 性能对比](#-性能对比)
- [🎯 一句话介绍](#-一句话介绍)
- [💡 为什么选择 monSQLize？](#-为什么选择-monsqlize)
- [🎯 何时使用 monSQLize？](#-何时使用-monsqlize)
- [🚀 快速开始](#-快速开始)
- [🌟 核心特性](#-核心特性)
  - [1. ⚡ 智能缓存系统](#1--智能缓存系统---性能提升-10100-倍)
  - [2. 🔄 事务管理优化](#2--事务管理优化---减少-30-数据库访问)
  - [3. 📦 便利方法](#3--便利方法---减少-6080-代码)
  - [4. 🌐 分布式部署支持](#4--分布式部署支持)
  - [5. 🆕 业务级分布式锁](#5--业务级分布式锁v140)
  - [6. 🚀 高性能批量插入](#6--高性能批量插入)
  - [7. 📊 深度分页](#7--深度分页---支持千万级数据)
  - [8. 🛠️ 运维监控](#8-️-运维监控开箱即用)
  - [9. 🔐 SSH隧道](#9--ssh隧道---安全连接内网数据库v13)
  - [10. 🎯 Model 层](#10--model-层---像-orm-一样使用v103)
- [📊 性能测试报告](#-性能测试报告)
- [🎨 完整功能清单](#-完整功能清单)
- [🆚 与 MongoDB 原生驱动对比](#-与-mongodb-原生驱动对比)
- [🚀 快速迁移指南](#-快速迁移指南)
- [📖 完整文档](#-完整文档)
- [🌍 兼容性](#-兼容性)
- [🗺️ 产品路线图](#️-产品路线图)
- [🤝 贡献指南](#-贡献指南)
- [📄 许可证](#-许可证)
- [💬 社区与支持](#-社区与支持)

---

## ⚡ 性能对比

```javascript
// ❌ MongoDB 原生驱动
const users = await collection.find({ status: 'active' }).toArray();  // 50ms
const product = await products.findOne({ _id: productId });           // 10ms

// ✅ monSQLize（启用缓存）
const users = await collection.find({ status: 'active' }, { cache: 60000 });  // 0.5ms  ⚡ 100x faster
const product = await products.findOne({ _id: productId }, { cache: 60000 }); // 0.1ms  ⚡ 100x faster
```

**只需在初始化时配置缓存，业务代码一行不改，性能立即提升！**

---

## 🎯 一句话介绍

monSQLize 是一个**100% 兼容 MongoDB API** 的增强库。

在保持完全兼容的前提下，为你的应用提供：

<table>
<tr>
<td width="25%" align="center">
<h3>🚀</h3>
<h4>智能缓存</h4>
<p>LRU/TTL 策略<br>自动失效<br>10~100 倍性能提升</p>
</td>
<td width="25%" align="center">
<h3>🔄</h3>
<h4>事务优化</h4>
<p>自动管理<br>只读优化<br>减少 30% DB 访问</p>
</td>
<td width="25%" align="center">
<h3>🌐</h3>
<h4>分布式支持</h4>
<p>Redis 广播<br>多实例一致性<br>业务级分布式锁</p>
</td>
<td width="25%" align="center">
<h3>🔐</h3>
<h4>SSH 隧道</h4>
<p>安全连接内网数据库<br>密码/私钥认证<br>开箱即用</p>
</td>
</tr>
</table>

**设计理念**：零学习成本 · 渐进式采用 · 性能优先 · 生产可靠

---

## 💡 为什么选择 monSQLize？

### 你遇到的问题

<table>
<tr>
<td width="50%">

**😫 数据库性能瓶颈**
- 高并发时查询变慢
- 热点数据重复查询数据库
- 聚合统计拖慢响应速度
- 用户抱怨页面加载慢

**😫 代码重复繁琐**
- ObjectId 转换到处都是
- 批量查询要写很多代码
- Upsert 操作不够直观
- 事务代码复杂易错

**😫 多实例部署问题**
- 缓存不一致导致脏读
- 定时任务重复执行
- 库存扣减并发冲突
- 需要额外的锁机制

</td>
<td width="50%">

**✅ monSQLize 的解决方案**
- **智能缓存系统** - 热点数据走缓存，10~100倍性能提升
- **自动失效机制** - 写操作自动清理，保证数据一致性
- **缓存命中率 70~90%** - 真实业务场景验证
- **响应时间 < 1ms** - 从 10~50ms 降至毫秒级

**✅ monSQLize 的解决方案**
- **便利方法** - findOneById、findByIds、upsertOne
- **自动转换 ObjectId** - 无需手动处理
- **语义化 API** - 代码更清晰易读
- **事务自动管理** - withTransaction 简化事务代码

**✅ monSQLize 的解决方案**
- **Redis 广播** - 多实例缓存自动同步
- **分布式锁** - 解决并发控制问题
- **定时任务防重** - tryAcquireLock 机制
- **开箱即用** - 配置简单，无需额外组件

</td>
</tr>
</table>

### 真实效果

| 场景 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| **商品详情页** | 50ms/次 | 0.5ms/次 | **100x** ⚡ |
| **用户列表** | 80ms/次 | 0.8ms/次 | **100x** ⚡ |
| **订单统计** | 200ms/次 | 2ms/次 | **100x** ⚡ |
| **批量插入 10万条** | 30s | 1.2s | **25x** ⚡ |

**缓存命中率**：电商 85% · 内容平台 75% · 社交应用 80%

---

## 🎯 何时使用 monSQLize？

### ✅ 适合的场景

| 场景 | 说明 | 预期效果 |
|------|------|---------|
| **高并发读取** | 商品详情、用户信息等热点数据 | 缓存命中率 70~90%，响应时间从 10~50ms 降至 < 1ms |
| **复杂查询** | 聚合统计、关联查询 | 重复查询直接走缓存，避免重复计算 |
| **多实例部署** | 负载均衡、水平扩展 | Redis 广播保证缓存一致性 |
| **事务密集** | 订单、支付等业务 | 自动管理事务，优化只读操作 |
| **并发控制** | 库存扣减、定时任务 | 分布式锁解决复杂并发场景 |

### ⚠️ 不适合的场景

| 场景 | 原因 | 建议 |
|------|------|------|
| **纯写入应用** | 大量写入，很少查询 | 缓存作用有限，使用原生驱动即可 |
| **实时性要求极高** | 必须每次查询最新数据 | 不启用缓存，或使用极短 TTL |
| **简单 CRUD** | 简单应用，流量不大 | 原生驱动足够，无需引入复杂度 |
| **内存受限** | 服务器内存紧张 | 缓存会占用额外内存 |

### 💡 使用建议

- **渐进式采用**：先在热点查询启用缓存，观察效果后逐步扩展
- **监控指标**：关注缓存命中率、内存使用、慢查询日志
- **合理配置**：根据业务特点调整 TTL、缓存大小
- **混合使用**：可与原生驱动混用，性能敏感用 monSQLize，简单查询用原生

---

## 🚀 快速开始

### 安装

```bash
npm install monsqlize
```

### 基础使用

```javascript
const MonSQLize = require('monsqlize');

// 1. 初始化
const db = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    cache: { 
        enabled: true,
        maxSize: 100000,  // 最多缓存 10 万条
        ttl: 60000        // 默认 TTL 60 秒
    }
});

await db.connect();

// 2. 使用（完全兼容 MongoDB API）
const users = db.collection('users');

// 启用缓存
const user = await users.findOne({ email }, { cache: 60000 });

// 写操作自动失效缓存
await users.updateOne({ email }, { $set: { lastLogin: new Date() } });

// 便利方法
const user = await users.findOneById(userId);
const list = await users.findByIds([id1, id2, id3]);

// 事务
await db.withTransaction(async (tx) => {
    await users.updateOne({...}, {...}, { session: tx.session });
    await orders.insertOne({...}, { session: tx.session });
});

// 业务锁（v1.4.0）
await db.withLock('resource:key', async () => {
    // 临界区代码
});

// SSH隧道（v1.3+）- 安全连接防火墙后的MongoDB
const db = new MonSQLize({
    type: 'mongodb',
    config: {
        ssh: {
            host: 'bastion.example.com',
            username: 'deploy',
            password: 'your-password',  // 或使用 privateKeyPath
        },
        // 自动从URI解析remoteHost和remotePort
        uri: 'mongodb://user:pass@internal-mongo:27017/mydb'
    }
});
```

### 从原生驱动迁移

```javascript
// 原来的代码
const { MongoClient } = require('mongodb');
const client = await MongoClient.connect('mongodb://localhost:27017');
const db = client.db('mydb');
const users = db.collection('users');

// 迁移后（只需改初始化）
const MonSQLize = require('monsqlize');
const db = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    cache: { enabled: true }  // 启用缓存
});
await db.connect();
const users = db.collection('users');

// ✅ 后续代码完全不变
const user = await users.findOne({ email });
```

---

## 🌟 核心特性

### 1. ⚡ 智能缓存系统 - 性能提升 10~100 倍

<table>
<tr>
<td width="50%">

**特性**

- ✅ **TTL 过期策略** - 指定缓存时间
- ✅ **LRU 淘汰策略** - 自动淘汰旧数据
- ✅ **自动失效** - 写操作自动清理缓存
- ✅ **并发去重** - 相同查询只执行一次
- ✅ **多层缓存** - 内存 + Redis
- ✅ **命名空间隔离** - 按集合独立管理

</td>
<td width="50%">

**性能提升**

| 操作 | 原生驱动 | monSQLize | 提升 |
|------|---------|-----------|------|
| 热点查询 | 50ms | 0.5ms | **100x** ⚡ |
| 复杂聚合 | 200ms | 2ms | **100x** ⚡ |
| 列表查询 | 30ms | 0.3ms | **100x** ⚡ |

</td>
</tr>
</table>

```javascript
// 一行代码启用缓存
const users = await collection.find({ status: 'active' }, { cache: 60000 });
```

### 2. 🔄 事务管理优化 - 减少 30% 数据库访问

```javascript
// 自动管理事务生命周期
await db.withTransaction(async (tx) => {
    // 只读操作会被优化（不加锁，减少 30% 访问）
    const user = await users.findOne({ _id: userId }, { session: tx.session });
    
    // 写操作自动加锁
    await users.updateOne({ _id: userId }, { $inc: { balance: -100 } }, { session: tx.session });
    
    // 自动提交 or 回滚
});
```

### 3. 📦 便利方法 - 减少 60~80% 代码

<table>
<tr>
<td width="50%">

**❌ 原生驱动**

```javascript
// 查询单个文档（需要手动转换 ObjectId）
const { ObjectId } = require('mongodb');
const user = await users.findOne({ 
    _id: new ObjectId(userId) 
});

// 批量查询（需要手动构建 $in）
const userList = await users.find({
    _id: { $in: ids.map(id => new ObjectId(id)) }
}).toArray();

// Upsert（需要手动设置选项）
await users.updateOne(
    { email: 'alice@example.com' },
    { $set: { name: 'Alice', age: 30 } },
    { upsert: true }
);
```

</td>
<td width="50%">

**✅ monSQLize**

```javascript
// 查询单个文档（自动转换）
const user = await users.findOneById(userId);




// 批量查询（一行搞定）
const userList = await users.findByIds(ids);




// Upsert（语义化）
await users.upsertOne(
    { email: 'alice@example.com' },
    { name: 'Alice', age: 30 }
);
```

**代码减少 60~80%！**

</td>
</tr>
</table>

### 4. 🌐 分布式部署支持

```javascript
// 多实例部署，Redis 自动同步缓存
const db = new MonSQLize({
    cache: {
        distributed: {
            enabled: true,
            redis: redisInstance  // 使用 Redis 广播缓存失效
        }
    }
});

// 实例 A 更新数据
await users.updateOne({ _id: userId }, { $set: { name: 'Bob' } });
// ⚡ 实例 B/C/D 的缓存自动失效
```

### 5. 🆕 业务级分布式锁（v1.4.0）

```javascript
// 🔥 解决复杂业务场景的并发问题

// 场景1：库存扣减
await db.withLock(`inventory:${sku}`, async () => {
    const product = await inventory.findOne({ sku });
    const price = calculatePrice(product, user, coupon);  // 复杂计算
    if (user.balance < price) throw new Error('余额不足');
    
    await inventory.updateOne({ sku }, { $inc: { stock: -1 } });
    await users.updateOne({ userId }, { $inc: { balance: -price } });
    await orders.insertOne({ userId, sku, price });
});

// 场景2：定时任务防重（多实例环境）
const lock = await db.tryAcquireLock('cron:daily-report');
if (lock) {
    try {
        await generateDailyReport();  // 只有一个实例执行
    } finally {
        await lock.release();
    }
}
```

**特性**：基于 Redis · 自动重试 · TTL 防死锁 · 支持续期 · 降级策略

[📖 完整文档](./docs/business-lock.md)

### 6. 🚀 高性能批量插入

```javascript
// 批量插入 10 万条数据
await users.insertBatch(documents, {
    batchSize: 1000,     // 每批 1000 条
    retryTimes: 3,       // 失败重试 3 次
    onProgress: (stats) => {
        console.log(`进度: ${stats.inserted}/${stats.total}`);
    }
});
```

**性能**: 比原生 `insertMany` 快 **10~50 倍** ⚡

### 7. 📊 深度分页 - 支持千万级数据

```javascript
// 千万级数据分页（游标分页，性能稳定）
const result = await users.findPage({
    query: { status: 'active' },
    page: 1000,          // 第 1000 页
    limit: 20,
    totals: {
        mode: 'async',   // 异步统计总数
        ttl: 300000      // 缓存 5 分钟
    }
});

console.log(`总计: ${result.totals.total}, 共 ${result.totals.totalPages} 页`);
```

### 8. 🛠️ 运维监控（开箱即用）

```javascript
// 🆕 慢查询日志持久化存储（v1.3+）
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: true  // ✅ 零配置启用，自动存储到 admin.slow_query_logs
});

await msq.connect();

// 查询慢查询日志（支持去重聚合）
const logs = await msq.getSlowQueryLogs(
  { collection: 'users' },
  { sort: { count: -1 }, limit: 10 }  // 查询高频慢查询Top10
);
// [{ queryHash: 'abc123', count: 2400, avgTimeMs: 520, maxTimeMs: 1200, ... }]

// 自动记录慢查询（原有功能）
// [WARN] Slow query { ns: 'mydb.users', duration: 1200ms, query: {...} }

// 健康检查
const health = await db.health();
// { status: 'ok', uptime: 3600, connections: 10 }

// 性能指标
const stats = await db.getStats();
// { queries: 10000, cacheHits: 9000, hitRate: 0.9 }
```

### 9. 🔐 SSH隧道 - 安全连接内网数据库（v1.3+）

```javascript
// 场景：数据库位于防火墙后，无法直接访问
const db = new MonSQLize({
    type: 'mongodb',
    config: {
        // SSH隧道配置
        ssh: {
            host: 'bastion.example.com',  // SSH服务器（跳板机）
            port: 22,
            username: 'deploy',
            password: 'your-password',     // ✅ 支持密码认证
            // 或使用私钥认证（推荐）
            // privateKeyPath: '~/.ssh/id_rsa',
        },
        // MongoDB连接配置（内网地址，自动从URI解析remoteHost和remotePort）
        uri: 'mongodb://user:pass@internal-mongo:27017/mydb'
    }
});

await db.connect();  // 自动建立SSH隧道
// 正常使用MongoDB，无需关心隧道细节
const users = db.collection('users');
const data = await users.findOne({});
await db.close();    // 自动关闭SSH隧道
```

**特性**：
- ✅ 支持密码和私钥认证
- ✅ 自动管理隧道生命周期
- ✅ 完美跨平台（基于ssh2库）
- ✅ 开箱即用，零额外配置

[📖 SSH隧道详细文档](./docs/ssh-tunnel.md)

---

### 10. 🎯 Model 层 - 像 ORM 一样使用（v1.0.3+）

monSQLize 提供了一个轻量级的 Model 层，让你可以像使用 ORM 一样定义数据模型，同时保持 MongoDB 的灵活性。

```javascript
const { Model } = require('monsqlize');

// 1. 定义 Model（集成 schema-dsl 验证）
Model.define('users', {
    enums: {
        role: 'admin|user|guest'
    },
    schema: function(dsl) {
        return dsl({
            username: 'string:3-32!',
            email: 'email!',
            role: this.enums.role.default('user'),
            age: 'number:1-150'
        });
    },
    options: {
        timestamps: true,  // 🆕 v1.0.3: 自动管理 createdAt/updatedAt
        softDelete: true   // 🆕 v1.0.3: 软删除（标记删除，支持恢复）
    },
    methods: (model) => ({
        // 实例方法 - 注入到查询返回的文档对象
        instance: {
            isAdmin() {
                return this.role === 'admin';
            }
        },
        // 静态方法 - 挂载到 Model 实例
        static: {
            async findByEmail(email) {
                return await model.findOne({ email });
            }
        }
    }),
    hooks: (model) => ({
        // 生命周期钩子
        insert: {
            before: (ctx, docs) => {
                // 自动添加时间戳
                return { ...docs, createdAt: new Date() };
            }
        }
    }),
    indexes: [
        { key: { username: 1 }, unique: true },
        { key: { email: 1 }, unique: true }
    ]
});

// 2. 使用 Model
const db = new MonSQLize({ /* ... */ });
await db.connect();

const User = db.model('users');

// 自动 Schema 验证
const user = await User.insertOne({
    username: 'john',
    email: 'john@example.com',
    age: 25
}); // ✅ 验证通过

// 使用实例方法
const admin = await User.findOne({ username: 'admin' });
console.log(admin.isAdmin()); // true

// 使用静态方法
const user = await User.findByEmail('john@example.com');

// 软删除（标记删除，可恢复）
await User.deleteOne({ _id: user._id });

// 查询（自动过滤已删除）
const users = await User.find({}); // 不包含已删除用户

// 查询包含已删除
const allUsers = await User.findWithDeleted({});

// 恢复已删除
await User.restore({ _id: user._id });
```

**特性**：
- ✅ Schema 验证（集成 schema-dsl）
- ✅ 自定义方法（instance + static）
- ✅ 生命周期钩子（before/after）
- ✅ 索引自动创建
- ✅ 自动时间戳（v1.0.3+）
- ✅ 软删除（v1.0.3+）
- ✅ TypeScript 类型支持

**注意**：需要安装 `schema-dsl` 依赖：
```bash
npm install schema-dsl
```

[📖 Model 层详细文档](./docs/model.md)

---

## 📊 性能测试报告

### 测试环境

- **CPU**: Intel i7-9700K
- **内存**: 16GB
- **数据库**: MongoDB 5.0
- **数据量**: 100 万条

### 查询性能对比

| 场景 | 原生驱动 | monSQLize (缓存) | 提升倍数 |
|------|---------|------------------|---------|
| 热点查询 (findOne) | 10ms | 0.1ms | **100x** ⚡ |
| 列表查询 (find) | 50ms | 0.5ms | **100x** ⚡ |
| 复杂聚合 (aggregate) | 200ms | 2ms | **100x** ⚡ |
| 批量插入 (10万条) | 30s | 1.2s | **25x** ⚡ |

### 缓存命中率

- **电商场景**: 85% (商品/用户查询)
- **内容平台**: 75% (文章/评论查询)
- **社交应用**: 80% (个人资料/动态)

**结论**: 在真实业务场景中，缓存命中率通常在 **70~90%**，性能提升 **10~100 倍**。

---

## 🎨 完整功能清单

<table>
<tr>
<td width="33%">

### 📦 MongoDB 原生功能

✅ **CRUD 操作**
- find / findOne
- insertOne / insertMany
- updateOne / updateMany
- deleteOne / deleteMany
- replaceOne
- findOneAndUpdate
- findOneAndReplace
- findOneAndDelete

✅ **聚合 & 查询**
- aggregate
- count / distinct
- watch (Change Streams)
- explain

✅ **索引管理**
- createIndex / createIndexes
- listIndexes
- dropIndex / dropIndexes

✅ **事务支持**
- withTransaction
- startTransaction

</td>
<td width="33%">

### 🚀 增强功能

✅ **智能缓存**
- TTL 过期策略
- LRU 淘汰策略
- 自动失效机制
- 并发去重
- 多层缓存 (内存+Redis)

✅ **便利方法**
- findOneById
- findByIds
- upsertOne
- incrementOne
- findAndCount

✅ **性能优化**
- insertBatch - 批量插入优化
- deleteBatch - 批量删除（流式+进度监控）
- updateBatch - 批量更新（流式+进度监控）
- 只读事务优化
- Count 队列控制
- 连接池管理

✅ **分布式支持**
- Redis 广播缓存失效
- 分布式锁
- 多实例一致性

</td>
<td width="33%">

### 🛠️ 企业级特性

✅ **运维监控**
- 慢查询日志（支持持久化存储）🆕
- 性能指标统计
- 健康检查
- 缓存命中率监控

✅ **深度分页**
- 游标分页
- 异步总数统计
- 书签管理
- 跳页优化

✅ **数据库管理**
- 跨库访问
- Schema 验证
- 集合管理
- 数据库命令

✅ **开发体验**
- TypeScript 支持
- 链式调用 API
- ESM/CommonJS 双模式
- 77% 测试覆盖率

</td>
</tr>
</table>

---

## 🆚 与 MongoDB 原生驱动对比

<table>
<tr>
<th width="25%">特性</th>
<th width="25%">MongoDB 原生</th>
<th width="50%"><strong>monSQLize</strong></th>
</tr>
<tr>
<td><strong>API 兼容性</strong></td>
<td>✅ 原生</td>
<td>✅ 100% 兼容原生，无需学习新 API</td>
</tr>
<tr>
<td><strong>智能缓存</strong></td>
<td>❌ 需要自己实现</td>
<td>✅ 内置 TTL/LRU，开箱即用，10~100倍提升</td>
</tr>
<tr>
<td><strong>性能</strong></td>
<td>⭐⭐⭐ 基准性能</td>
<td>⭐⭐⭐⭐⭐ 缓存命中时性能提升 10~100 倍</td>
</tr>
<tr>
<td><strong>事务支持</strong></td>
<td>⭐⭐ 需要手动管理</td>
<td>⭐⭐⭐⭐⭐ 自动管理生命周期，优化只读操作</td>
</tr>
<tr>
<td><strong>分布式部署</strong></td>
<td>❌ 缓存不一致</td>
<td>✅ Redis 广播自动同步，保证一致性</td>
</tr>
<tr>
<td><strong>便利方法</strong></td>
<td>❌ 需要自己封装</td>
<td>✅ findOneById、findByIds、upsertOne 等</td>
</tr>
<tr>
<td><strong>运维监控</strong></td>
<td>⚠️ 需要额外配置</td>
<td>✅ 慢查询日志、性能统计，开箱即用</td>
</tr>
<tr>
<td><strong>学习成本</strong></td>
<td>⭐⭐⭐ MongoDB 语法</td>
<td>⭐ 零学习成本，API 完全一致</td>
</tr>
<tr>
<td><strong>迁移成本</strong></td>
<td>-</td>
<td>⭐ 只需修改初始化代码，业务代码不变</td>
</tr>
</table>

### 📌 何时选择 monSQLize

✅ **适合场景**：
- 高并发读取场景（商品详情、用户信息）
- 需要缓存但不想自己实现
- 多实例部署需要缓存一致性
- 希望零学习成本提升性能

⚠️ **不适合场景**：
- 纯写入应用（缓存作用有限）
- 实时性要求极高（每次必查最新）
- 简单应用，流量不大（原生驱动足够）

---

## 🚀 快速迁移指南

### 从 MongoDB 原生驱动迁移

```javascript
// ❌ 原来的代码
const { MongoClient } = require('mongodb');
const client = await MongoClient.connect('mongodb://localhost:27017');
const db = client.db('mydb');
const users = db.collection('users');

// ✅ 迁移后的代码（只需改 3 行）
const MonSQLize = require('monsqlize');  // 1. 引入 monSQLize
const db = new MonSQLize({               // 2. 修改初始化
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    cache: { enabled: true }             // 3. 启用缓存
});
await db.connect();
const users = db.collection('users');

// 🎉 后续所有代码不需要改动，性能提升 10~100 倍！
const user = await users.findOne({ email });  // 完全一样的 API
```

### 渐进式迁移

```javascript
// ✅ 可以混用原生驱动和 monSQLize
const nativeClient = await MongoClient.connect('...');
const monsqlize = new MonSQLize({ cache: { enabled: true } });

// 性能敏感的查询用 monSQLize（启用缓存）
const hotData = await monsqlize.collection('products').find({}, { cache: 60000 });

// 简单查询用原生驱动
const coldData = await nativeClient.db('mydb').collection('logs').find({});
```

---

## 📖 完整文档

### 核心文档

- 📖 [完整 API 文档索引](./docs/INDEX.md)
- 📖 [MongoDB 原生 vs monSQLize 对比](./docs/mongodb-native-vs-extensions.md)
- 📖 [事务使用指南](./docs/transaction.md)
- 📖 [业务级分布式锁](./docs/business-lock.md) 🆕 v1.4.0
- 📖 [SSH隧道使用指南](./docs/ssh-tunnel.md) 🆕 v1.3+
- 📖 [分布式部署指南](./docs/distributed-deployment.md)
- 📖 [性能优化指南](./docs/transaction-optimizations.md)

### 功能文档

**CRUD 操作**:
- [find](./docs/find.md) | [findOne](./docs/findOne.md) | [findPage](./docs/findPage.md)
- [insertOne](./docs/insert-one.md) | [insertMany](./docs/insert-many.md) | [insertBatch](./docs/insertBatch.md)
- [updateOne](./docs/update-one.md) | [updateMany](./docs/update-many.md) | [updateBatch](./docs/updateBatch.md) | [replaceOne](./docs/replace-one.md)
- [deleteOne](./docs/delete-one.md) | [deleteMany](./docs/delete-many.md) | [deleteBatch](./docs/deleteBatch.md)

**Model 层**:
- [Model API 文档](./docs/model.md) - Schema 验证、自定义方法、生命周期钩子

**便利方法**:
- [findOneById](./docs/find-one-by-id.md) | [findByIds](./docs/find-by-ids.md)
- [upsertOne](./docs/upsert-one.md) | [incrementOne](./docs/increment-one.md) | [findAndCount](./docs/find-and-count.md)

**其他功能**:
- [索引管理](./docs/create-index.md) | [聚合查询](./docs/aggregate.md)
- [缓存系统](./docs/cache.md) | [链式调用](./docs/chaining-api.md)

### 示例代码

- 📁 [完整示例代码目录](./examples/) - 50+ 可运行示例

---

## 🌍 兼容性

| 环境 | 支持版本 |
|------|---------|
| **Node.js** | 16.x, 18.x, 20.x, 21.x |
| **MongoDB** | 4.4+, 5.x, 6.x, 7.x |
| **MongoDB Driver** | 4.x, 5.x, 6.x, 7.x |
| **模块系统** | CommonJS, ESM |

[查看完整兼容性矩阵](./docs/COMPATIBILITY.md)

---

## 🗺️ 产品路线图

### ✅ v1.4 (当前版本)

- ✅ 业务级分布式锁
- ✅ 智能缓存系统
- ✅ 事务优化
- ✅ 便利方法
- ✅ 分布式支持
- ✅ Model 层（v1.0.3）- Schema 验证、自定义方法、生命周期钩子

### 🚧 v1.5 (计划中)

- 🔄 查询分析器
- 🔄 自动索引建议
- 🔄 数据迁移工具
- 🔄 GraphQL 支持
- 🔄 Model 关系（relations）完善

### 🔮 v2.0 (未来)

- 🔮 统一 API 支持 MySQL
- 🔮 统一 API 支持 PostgreSQL
- 🔮 完整 ORM 功能
- 🔮 数据同步中间件

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！

- 🐛 [提交 Bug](https://github.com/vextjs/monSQLize/issues)
- 💡 [提出新功能](https://github.com/vextjs/monSQLize/issues)
- 📖 [改进文档](https://github.com/vextjs/monSQLize/pulls)
- 💻 [提交代码](https://github.com/vextjs/monSQLize/pulls)

### 开发

```bash
# 克隆仓库
git clone https://github.com/vextjs/monSQLize.git
cd monSQLize

# 安装依赖
npm install

# 运行测试
npm test

# 运行基准测试
npm run benchmark
```

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 💬 社区与支持

- 📧 **Email**: support@monsqlize.dev
- 💬 **Issues**: [GitHub Issues](https://github.com/vextjs/monSQLize/issues)
- 📖 **文档**: [完整文档](./docs/INDEX.md)
- 🌟 **Star**: 如果觉得有用，请给我们一个 Star ⭐

---

## 🎉 快速链接

<div align="center">

**[🚀 快速开始](#-5分钟快速开始)** · 
**[📚 完整文档](./docs/INDEX.md)** · 
**[💻 示例代码](./examples/)** · 
**[🐛 报告问题](https://github.com/vextjs/monSQLize/issues)** · 
**[⭐ Star 项目](https://github.com/vextjs/monSQLize)**

---

### 让 MongoDB 快 10~100 倍，从现在开始 🚀

```bash
npm install monsqlize
```

---

Made with ❤️ by monSQLize Team

</div>

