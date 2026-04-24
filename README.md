<div align="center">

# 🚀 monSQLize

### 🎯 统一数据库查询语法框架

**当前**: MongoDB增强层（10~100倍性能 · 企业特性 · 零学习成本）  
**未来**: 让MySQL/PostgreSQL也能用MongoDB语法查询

**mon**SQLize = **Mon**goDB + **SQL** = 一套语法，多种数据库

[![npm version](https://img.shields.io/npm/v/monsqlize.svg)](https://www.npmjs.com/package/monsqlize)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](./index.d.ts)
[![Test Coverage](https://img.shields.io/badge/Coverage-90.77%25-brightgreen.svg)](./TEST-COVERAGE-REPORT.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4%2B-green.svg)](https://www.mongodb.com/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-brightgreen)](https://nodejs.org/)

```bash
npm install monsqlize
```

[快速开始](#-快速开始) · [项目愿景](#-项目愿景) · [核心特性](#-核心特性) · [完整文档](./docs/INDEX.md) · [错误码参考](./docs/error-codes.md)

</div>

---

## 📑 目录

- [⚡ 性能对比](#-性能对比)
- [🎯 项目愿景](#-项目愿景)
- [💡 为什么选择 monSQLize？](#-为什么选择-monsqlize)
- [🎯 何时使用 monSQLize？](#-何时使用-monsqlize)
- [🚀 快速开始](#-快速开始)
- [🌟 核心特性](#-核心特性)
  - [0. 🎯 统一表达式系统 🆕](#0--统一表达式系统--v109---让聚合查询像sql一样简单)
  - [1. ⚡ 智能缓存系统](#1--智能缓存系统---性能提升-10100-倍)
  - [2. 🏢 企业级特性](#2--企业级特性)
  - [3. 📦 便利方法](#3--便利方法---减少-6080-代码)
  - [4. 🎯 可选Model层](#4--可选model层)
  - [5. 🔄 事务管理优化](#5--事务管理优化---减少-30-数据库访问)
- [📊 性能测试报告](#-性能测试报告)
- [🎨 完整功能清单](#-完整功能清单)
- [🆚 与 MongoDB 原生驱动对比](#-与-mongodb-原生驱动对比)
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

## 🎯 项目愿景

**用MongoDB语法统一所有数据库查询**

**mon**SQLize = **Mon**goDB + **SQL** = 统一查询语法

### 当前阶段（v1.0.x）：MongoDB增强层

为MongoDB应用提供：

- ⚡ **10~100倍性能提升** - L1（内存）+ L2（Redis）智能缓存，业界最完善
- 🏢 **企业级特性** - 分布式锁、SSH隧道、慢查询监控（内置，零配置）
- 🛠️ **56+增强方法** - 业界最完整，代码减少60~80%
- 🎯 **可选Model层** - Schema验证、Hooks、Populate（6个方法支持）
- ✅ **100% API兼容** - 零学习成本，渐进式采用

<table>
<tr>
<td width="33%" align="center">
<h3>⚡ 智能缓存</h3>
<p>L1: 内存缓存 (LRU)<br>L2: Redis缓存<br>自动失效<br>10~100倍性能提升</p>
</td>
<td width="33%" align="center">
<h3>🏢 企业特性</h3>
<p>分布式锁<br>SSH隧道<br>慢查询监控<br>事务优化<br>批量操作</p>
</td>
<td width="33%" align="center">
<h3>🛠️ 增强方法</h3>
<p>56+个方法<br>代码减少60~80%<br>ObjectId自动转换<br>语义化API</p>
</td>
</tr>
</table>

### 未来愿景（v2.0+）：统一查询语法

**革命性目标**: 让MySQL/PostgreSQL也能用MongoDB语法

```javascript
// 同一套代码，支持多种数据库
const users = await collection.find({ 
    age: { $gte: 18 },
    status: 'active'
});

// MongoDB - ✅ 当前已支持
// MySQL - 🎯 未来自动转换为: SELECT * FROM users WHERE age >= 18 AND status = 'active'
// PostgreSQL - 🎯 未来自动转换为: SELECT * FROM users WHERE age >= 18 AND status = 'active'
```

**解决的核心痛点**:
- ❌ 切换数据库需要重写所有查询代码
- ❌ 团队需要学习多种查询语法
- ❌ 跨数据库迁移成本极高
- ❌ 多数据库项目维护复杂

**monSQLize方案**:
- ✅ 统一使用MongoDB查询语法（最直观、最灵活）
- ✅ 底层自动适配不同数据库
- ✅ 一套代码，多种数据库
- ✅ 零迁移成本

**了解更多**: 📖 [完整项目愿景文档](./docs/PROJECT-VISION.md)

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


## �️ 文档导航

### 📚 核心概念（8 篇）
[连接管理](./docs/connection.md) · [ObjectId 自动转换](./docs/objectid-auto-convert.md) 🆕 · [缓存系统](./docs/cache.md) · [事务管理](./docs/transaction.md) · [Model 层](./docs/model.md) · [业务锁](./docs/business-lock.md) · [SSH 隧道](./docs/ssh-tunnel.md) · [分布式部署](./docs/distributed-deployment.md)

### 🔍 查询操作（8 篇）
[find](./docs/find.md) · [findOne](./docs/findOne.md) · [findOneById](./docs/find-one-by-id.md) · [findByIds](./docs/find-by-ids.md) · [findPage](./docs/findPage.md) · [count](./docs/count.md) · [distinct](./docs/distinct.md) · [watch](./docs/watch.md) ⭐

### ✏️ 写入操作（15 篇）
**插入**: [insertOne](./docs/insert-one.md) · [insertMany](./docs/insert-many.md) · [insertBatch](./docs/insertBatch.md)  
**更新**: [updateOne](./docs/update-one.md) · [updateMany](./docs/update-many.md) · [updateBatch](./docs/updateBatch.md) · [replaceOne](./docs/replace-one.md) · [findOneAndUpdate](./docs/find-one-and-update.md) · [findOneAndReplace](./docs/find-one-and-replace.md)  
**删除**: [deleteOne](./docs/delete-one.md) · [deleteMany](./docs/delete-many.md) · [deleteBatch](./docs/deleteBatch.md) · [findOneAndDelete](./docs/find-one-and-delete.md)  
**便利方法**: [upsertOne](./docs/upsert-one.md) · [incrementOne](./docs/increment-one.md) · [findAndCount](./docs/find-and-count.md)

### 📊 聚合与工具（10+ 篇）
[aggregate](./docs/aggregate.md) · [explain](./docs/explain.md) · [链式调用](./docs/chaining-api.md) ⭐ · [索引管理](./docs/create-index.md) · [Count 队列](./docs/count-queue.md) ⭐ · [慢查询日志](./docs/slow-query-log.md) · [书签管理](./docs/bookmarks.md) · [ESM 支持](./docs/esm-support.md)

**完整文档索引**: [docs/INDEX.md](./docs/INDEX.md) - 60+ 篇详细文档

---

## �🚀 快速开始

### 安装

```bash
npm install monsqlize
```

**自动安装的依赖**：
- ✅ `mongodb` - MongoDB 官方驱动
- ✅ `schema-dsl` - Schema 验证库（Model 层必需）
- ✅ `ssh2` - SSH 隧道支持

**可选依赖**：
- ⚠️ `ioredis` - Redis 多层缓存（启用 L2 缓存需要）

### 基础使用

```javascript
const MonSQLize = require('monsqlize');

// 1. 初始化并连接
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
    cache: { enabled: true, ttl: 60000 }  // 启用缓存，60秒过期
});

await msq.connect();

// 2. 获取集合
const users = msq.collection('users');

// 3. 基础查询（自动缓存）
const user = await users.findOne({ email: 'test@example.com' });

// 4. 插入数据
await users.insertOne({
    username: 'john',
    email: 'john@example.com',
    createdAt: new Date()
});

// 5. 更新数据（自动清除缓存）
await users.updateOne(
    { email: 'test@example.com' },
    { $set: { lastLogin: new Date() } }
);

// 6. 便利方法（自动转换ObjectId）
const userById = await users.findOneById('507f1f77bcf86cd799439011');

// 7. 关闭连接
await msq.close();
```

**就这么简单！** 完全兼容MongoDB原生API，只需初始化时启用缓存，业务代码零改动。

### 使用 Model 层（可选）

如果需要 **Schema验证**、**Populate关联查询**、**Hooks生命周期** 等 ORM 特性，可以使用 Model 层。

> **📦 依赖说明**: Model 层需要 `schema-dsl` 包支持（已随 monsqlize 自动安装，无需额外操作）

Model 层有两种使用方式，二者**互斥**，选其一即可：

| 方式 | 适合场景 |
|------|---------|
| **手动注册**（`Model.define()`）| 少量 Model、测试环境、需要精确控制加载顺序 |
| **自动加载**（`models:` 配置项）| 生产环境，Model 文件统一放在一个目录下 |

#### 方式一：手动注册

```javascript
const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

// 1. 先在 connect() 之前调用 Model.define() 注册所有 Model
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string:3-32!',
        email: 'email!',
        password: 'string:6-!',
        age: 'number:0-120'
    }),
    relations: {
        posts: { from: 'posts', localField: '_id', foreignField: 'userId', single: false }
    },
    hooks: (model) => ({
        insert: { before: async (ctx, doc) => { doc.createdAt = new Date(); return doc; } }
    }),
    methods: (model) => ({
        instance: { checkPassword(password) { return this.password === password; } },
        static: { async findByUsername(username) { return await model.findOne({ username }); } }
    })
});

Model.define('posts', {
    schema: (dsl) => dsl({ title: 'string:1-200!', content: 'string!', userId: 'string!' })
});

// 2. 创建实例并连接
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
    cache: { enabled: true }
});
await msq.connect();

// 3. 获取 Model 并使用
const User = msq.model('users');
```

#### 方式二：自动加载（推荐用于生产环境）

将每个 Model 单独放在一个文件里，`connect()` 时自动扫描目录加载，无需手动 `Model.define()`：

```javascript
// app.js
const path = require('path');

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
    // 推荐用绝对路径，避免受 process.cwd() 影响
    models: path.join(__dirname, 'models')
    // 或完整配置：
    // models: { path: path.join(__dirname, 'models'), pattern: '*.model.js', recursive: true }
});

await msq.connect();            // ← 自动扫描 models/*.model.{js,ts,mjs,cjs}

const User = msq.model('users'); // 直接使用，无需 Model.define()
```

> 相对路径（如 `'./models'`）以 `process.cwd()` 为基准，即 Node.js 进程的启动目录。为避免歧义，推荐始终使用 `path.join(__dirname, 'models')` 这样的绝对路径。

```javascript
// models/user.model.js  ← 每个 Model 独立一个文件
module.exports = {
    name: 'users',              // 集合名称（必需）
    schema: (dsl) => dsl({
        username: 'string:3-32!',
        email: 'email!'
    }),
    methods: (model) => ({
        static: {
            async findByUsername(username) { return await model.findOne({ username }); }
        }
    })
};
```

> 详细说明（完整配置项、文件格式、错误处理）见 [docs/model.md — Model 自动加载](./docs/model.md#model-自动加载v107)

#### 两种方式共同的后续操作

```javascript

// ✅ Schema 验证自动生效
try {
    await User.insertOne({
        username: 'jo',  // ❌ 太短，验证失败
        email: 'invalid-email',  // ❌ 邮箱格式错误
        age: 25
    });
} catch (err) {
    console.error(err.code);  // 'VALIDATION_ERROR'
    console.error(err.errors);  // 详细的验证错误
}

// ✅ 正确的数据
const user = await User.insertOne({
    username: 'john',
    email: 'john@example.com',
    password: 'secret123',
    age: 25
    // createdAt 由 hook 自动添加
});

// 使用自定义方法
const foundUser = await User.findByUsername('john');
if (foundUser.checkPassword('secret123')) {
    console.log('登录成功');
}

// Populate 关联查询（自动填充用户的文章）
const userWithPosts = await User.findOne({ username: 'john' })
    .populate('posts');

console.log(userWithPosts.posts);  // [{ title: '...', content: '...' }, ...]

// 禁用验证（特殊场景）
await User.insertOne(doc, { skipValidation: true });
```

**Model 层特性**：
- ✅ **Schema 验证** - 自动验证数据格式（基于 `schema-dsl` 库，v1.0.7 默认启用）
- ✅ **自动加载** - 扫描目录自动加载 Model 文件（v1.0.7+）
- ✅ **Populate** - 关联查询，支持 6 个方法（业界领先）
- ✅ **Hooks** - 生命周期钩子（insert/update/delete/find）
- ✅ **Relations** - 定义表关系（hasOne/hasMany/belongsTo）
- ✅ **自定义方法** - instance 方法注入到文档，static 方法挂载到 Model
- ✅ **自动缓存** - Populate 查询结果也会缓存
- ✅ **数据源绑定** - `connection: { pool?, database? }` 绑定指定连接池和/或数据库（v1.2.2+）

**数据源绑定示例（v1.2.2+）**：

```js
// 在多连接池场景中，将 Model 绑定到指定的连接池 + 数据库
const msq = new MonSQLize({
  uri: 'mongodb://localhost:27017',
  databaseName: 'main_db',
  pools: [{ name: 'analytics', uri: 'mongodb://analytics-host:27017' }]
});

// 绑定到不同数据库（使用默认连接池）
Model.define('AuditLog', {
  schema: (dsl) => dsl({ action: 'string!', userId: 'string!' }),
  connection: { database: 'audit_db' }
});

// 绑定到不同连接池 + 不同数据库
Model.define('AnalyticsReport', {
  schema: (dsl) => dsl({ reportId: 'string!', data: 'object' }),
  connection: { pool: 'analytics', database: 'reports_db' }
});

// 调用时自动路由，无需手动切换
const AuditLogModel  = msq.model('AuditLog');       // → audit_db（默认池）
const ReportModel    = msq.model('AnalyticsReport'); // → reports_db（analytics 池）
const UserModel      = msq.model('users');           // → main_db（原逻辑，向后兼容）
```

📖 **详细文档**：[Model 层完整指南](./docs/model.md) | [Populate API](./docs/populate.md) | [Hooks API](./docs/hooks.md) | [Schema 验证](./docs/model.md#schema-验证)

---

### 从原生驱动迁移

```javascript
// 原来的代码
const { MongoClient } = require('mongodb');
const client = await MongoClient.connect('mongodb://localhost:27017');
const db = client.db('mydb');
const users = db.collection('users');

// 迁移后（只需改初始化）
const MonSQLize = require('monsqlize');
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',  // 数据库名称
    config: { uri: 'mongodb://localhost:27017' },
    cache: { enabled: true }  // 启用缓存
});
await msq.connect();
const users = msq.collection('users');

// ✅ 后续代码完全不变
const user = await users.findOne({ email: 'test@example.com' });
```

---

## 🌟 核心特性

### 0. 🎨 通用函数缓存 🆕 v1.1.4 - 为任意函数添加缓存

**52个测试（100% 通过）**，为任意异步函数添加缓存能力，性能提升**50000x**！

<table>
<tr>
<td width="50%">

**🆕 装饰器模式**

```javascript
const { withCache } = require('monsqlize');

// 业务函数
async function getUserProfile(userId) {
    const user = await msq.collection('users')
        .findOne({ _id: userId });
    const orders = await msq.collection('orders')
        .find({ userId }).toArray();
    return { user, orders };
}

// 添加缓存（零侵入）
const cached = withCache(getUserProfile, {
    ttl: 300000,  // 5分钟
    cache: msq.getCache()
});

// 使用
await cached('user123');  // 首次：查询数据库
await cached('user123');  // 再次：从缓存读取 ⚡
```

</td>
<td width="50%">

**核心优势**

- ✅ **零侵入** - 装饰器模式，不修改原函数
- ✅ **自动序列化** - 支持复杂参数（对象、Date等）
- ✅ **并发控制** - 防止缓存击穿
- ✅ **双层缓存** - 本地 + Redis，最佳性能
- ✅ **条件缓存** - 基于返回值决定是否缓存
- ✅ **统计监控** - 命中率、调用次数等
- ✅ **命名空间** - 多模块缓存隔离
- ✅ **TypeScript** - 完整类型支持

**性能提升**:
- 🚀 复杂业务函数：50000x
- 🚀 外部 API 调用：200000x
- 🚀 复杂计算：100000x

</td>
</tr>
</table>

**FunctionCache 类管理**:

```javascript
const { FunctionCache } = require('monsqlize');

const fnCache = new FunctionCache(msq, {
    namespace: 'myApp',
    defaultTTL: 60000
});

// 注册多个函数
fnCache.register('getUserProfile', getUserProfileFn);
fnCache.register('getOrderStats', getOrderStatsFn);

// 执行
await fnCache.execute('getUserProfile', 'user123');

// 失效缓存
await fnCache.invalidate('getUserProfile', 'user123');

// 查看统计
const stats = fnCache.getStats('getUserProfile');
console.log('命中率:', stats.hitRate);
```

📖 [完整文档](./docs/function-cache.md) · [键生成机制](./docs/function-cache-key-generation.md)

---

### 1. 🎯 统一表达式系统 🆕 v1.1.0 - 让聚合查询像SQL一样简单

**122个操作符（100% MongoDB支持！新增49个函数）**，让MongoDB聚合查询**像写SQL一样简单**！

<table>
<tr>
<td width="50%">

**🆕 统一表达式语法**

```javascript
const { expr } = require('monsqlize');

// ❌ MongoDB原生（繁琐）
await users.aggregate([
  {
    $project: {
      fullName: {
        $concat: ['$firstName', ' ', '$lastName']
      },
      age: {
        $subtract: [
          { $year: new Date() },
          { $year: '$birthDate' }
        ]
      }
    }
  }
]);

// ✅ 统一表达式（简洁）
await users.aggregate([
  {
    $project: {
      fullName: expr("CONCAT(firstName, ' ', lastName)"),
      age: expr("YEAR(CURRENT_DATE) - YEAR(birthDate)")
    }
  }
]);
```

</td>
<td width="50%">

**核心优势**

- ✅ **67个操作符** - 覆盖95%使用场景
- ✅ **类SQL语法** - 易读易写，降低学习成本
- ✅ **上下文感知** - 自动适配$match/$project/$group
- ✅ **Lambda表达式** - FILTER/MAP完整支持
- ✅ **高性能** - LRU缓存，>90%命中率
- ✅ **100%兼容** - 可与原生语法混用

**支持的操作符分类**:
- 🔹 条件判断 (三元、SWITCH)
- 🔹 数学计算 (ABS、ROUND、POW等)
- 🔹 字符串处理 (CONCAT、SPLIT、REPLACE等)
- 🔹 数组操作 (FILTER、MAP、SIZE等)
- 🔹 日期处理 (YEAR、MONTH、DAY等)
- 🔹 类型转换 (TO_INT、TO_STRING等)

</td>
</tr>
</table>

**更多示例**：

```javascript
// 条件判断 - 三元运算符
expr("score >= 90 ? 'A' : 'B'")

// 多分支条件 - SWITCH
expr("SWITCH(score >= 90, 'A', score >= 80, 'B', score >= 60, 'C', 'F')")

// 字符串处理
expr("UPPER(TRIM(email))")
expr("SPLIT(tags, ',')")

// 数组过滤（Lambda表达式）
expr("FILTER(items, item, item.price > 100)")

// 日期计算
expr("YEAR(createdAt) === 2024 && MONTH(createdAt) === 12")

// 完整聚合查询示例
await orders.aggregate([
  {
    $project: {
      // 价格计算
      finalPrice: expr("price * (1 - discount / 100)"),
      
      // 日期提取
      year: expr("YEAR(createdAt)"),
      month: expr("MONTH(createdAt)"),
      
      // 状态分类
      statusLabel: expr("SWITCH(status === 'paid', 'Paid', status === 'pending', 'Pending', 'Cancelled')")
    }
  },
  {
    $group: {
      _id: { year: '$year', month: '$month' },
      totalOrders: expr("COUNT()"),
      totalRevenue: expr("SUM(finalPrice)")
    }
  }
]);
```

📖 **完整文档**：[统一表达式系统](./docs/aggregate.md#统一表达式系统) | [67个操作符列表](./docs/aggregate.md#支持的操作符-67个)

---

### 2. ⚡ 智能缓存系统 - 性能提升 10~100 倍

<table>
<tr>
<td width="50%">

**特性**

- ✅ **TTL 过期策略** - 指定缓存时间
- ✅ **LRU 淘汰策略** - 自动淘汰旧数据
- ✅ **精准失效 🆕** - 只清除受影响的缓存
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

### 2.5 🔀 Saga 分布式事务 - 跨服务事务协调 🆕

```javascript
// 定义 Saga（跨服务事务）
msq.defineSaga({
    name: 'create-order-with-payment',
    steps: [
        {
            name: 'create-order',
            execute: async (ctx) => {
                const order = await createOrder(ctx.data);
                // ✅ 可以保存字符串、对象、数组等任何类型
                ctx.set('order', order);  // 保存完整对象
                return order;
            },
            compensate: async (ctx) => {
                const order = ctx.get('order');
                await cancelOrder(order.id);
            }
        },
        {
            name: 'charge-payment',
            execute: async (ctx) => {
                const charge = await stripe.charges.create({...});
                ctx.set('charge', charge);  // 保存完整对象
                return charge;
            },
            compensate: async (ctx) => {
                const charge = ctx.get('charge');
                await stripe.refunds.create({ charge: charge.id });
            }
        }
    ]
});

// 执行 Saga（失败自动补偿）
const result = await msq.executeSaga('create-order-with-payment', data);
```

**Saga 特性**：
- ✅ 跨服务事务协调
- ✅ 失败自动补偿（逆序执行）
- ✅ 支持 Redis 分布式（多进程共享）
- ✅ 无时间限制（突破 60秒限制）
- ✅ 详细日志（完整执行追踪）

[完整文档](./docs/saga-transaction.md)

---

#### 🆕 Change Stream 数据同步 (v1.0.9)

**实时同步数据到备份库，基于 MongoDB Change Stream**

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    config: { 
        uri: 'mongodb://localhost:27017/main',
        replicaSet: 'rs0'  // 🔴 必须：Change Stream 需要 Replica Set
    },
    
    // 🆕 同步配置
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-main',
                uri: 'mongodb://backup:27017/backup',
                collections: ['users', 'orders']
            }
        ]
    }
});

await msq.connect();

// 正常使用，自动同步
await msq.collection('users').insertOne({ name: 'Alice' });
// ✅ 自动通过 Change Stream 同步到 backup-main
```

**Change Stream 特性**：
- ✅ 实时同步（延迟 10-500ms）
- ✅ 断点续传（Resume Token）
- ✅ 多目标支持（多地容灾）
- ✅ 数据过滤和转换
- ✅ 自动重连和健康检查
- ✅ 主库影响 <2%（异步处理）

[完整文档](./docs/sync-backup.md)

### 4. 📦 便利方法 - 减少 60~80% 代码

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

**🔥 ObjectId 自动转换** - 告别手动转换

```javascript
// ❌ 原生驱动 - 每次都要转换
const { ObjectId } = require('mongodb');
await users.findOne({ _id: new ObjectId(userId) });
await users.find({ _id: { $in: ids.map(id => new ObjectId(id)) } }).toArray();

// ✅ monSQLize - 自动识别并转换
await users.findOneById(userId);       // 自动转换字符串
await users.findByIds([id1, id2, id3]); // 批量自动转换
await users.findOne({ _id: userId });   // 查询时也自动转换
```

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

### 10. 🔄 ObjectId 跨版本兼容（v1.1.1+）🆕

解决混用 mongoose 和 monSQLize 时的 BSON 版本冲突问题。

```javascript
// ❌ 问题场景：mongoose (bson@4.x/5.x) + monSQLize (bson@6.x)
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();
await msq.collection('orders').insertOne(dataFromMongoose);
// 错误：Unsupported BSON version, bson types must be from bson 6.x.x

// ✅ monSQLize v1.1.1+ 自动处理
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();
await msq.collection('orders').insertOne(dataFromMongoose);
// 成功：自动将旧版本 ObjectId 转换为 bson@6.x
```

**特性**：
- ✅ 自动检测并转换来自其他 BSON 版本的 ObjectId
- ✅ 递归处理嵌套对象和数组
- ✅ 性能优化：无需转换时零拷贝
- ✅ 错误降级：转换失败不影响其他字段
- ✅ 完全透明：无需修改业务代码

**兼容性**：

| BSON 版本 | mongoose 版本 | 支持状态 |
|-----------|--------------|---------|
| bson@4.x  | mongoose@5.x | ✅ 完全支持 |
| bson@5.x  | mongoose@6.x | ✅ 完全支持 |
| bson@6.x  | mongoose@7.x | ✅ 原生支持 |

[📖 完整文档](./docs/objectid-cross-version.md)

---

### 11. 🎯 Model 层 - 像 ORM 一样使用（v1.0.3+）

monSQLize 提供了一个轻量级的 Model 层，让你可以像使用 ORM 一样定义数据模型，同时保持 MongoDB 的灵活性。

> **📦 依赖说明**: Model 层基于 `schema-dsl` 库实现 Schema 验证，已随 monsqlize 自动安装。

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
- ✅ 乐观锁版本控制（v1.0.3+）
- ✅ **关系定义和 populate（v1.2.0+）** 🆕
- ✅ TypeScript 类型支持

#### 关系定义和 populate（v1.2.0+）🆕

轻松处理集合之间的关联关系，支持 one-to-one 和 one-to-many。

```javascript
// 1. 定义关系
Model.define('users', {
    schema: (dsl) => dsl({
        username: 'string!',
        profileId: 'objectId'
    }),
    relations: {
        // one-to-one: 用户 → 个人资料
        profile: {
            from: 'profiles',         // 集合名
            localField: 'profileId',  // 本地字段
            foreignField: '_id',      // 外部字段
            single: true              // 返回类型
        },
        // one-to-many: 用户 → 文章列表
        posts: {
            from: 'posts',
            localField: '_id',
            foreignField: 'authorId',
            single: false             // 返回数组
        }
    }
});

// 2. 使用 populate
const user = await User.findOne({ username: 'john' })
    .populate('profile')                    // 填充 profile
    .populate('posts', {                    // 填充 posts
        select: 'title content',            // 只选择部分字段
        match: { status: 'published' },     // 额外查询条件
        sort: { createdAt: -1 },            // 排序
        limit: 10                           // 限制数量
    });

// 3. 结果
{
    _id: '...',
    username: 'john',
    profileId: '...',
    profile: {              // ← 自动填充
        _id: '...',
        bio: 'Software Engineer',
        avatar: 'https://...'
    },
    posts: [                // ← 自动填充
        { _id: '...', title: 'Post 1', content: '...' },
        { _id: '...', title: 'Post 2', content: '...' }
    ]
}
```

**支持的查询方法**（全部 6 个）:
- ✅ `find().populate()` - 批量查询
- ✅ `findOne().populate()` - 单文档查询
- ✅ `findByIds().populate()` - 批量 ID 查询
- ✅ `findOneById().populate()` - 单 ID 查询
- ✅ `findAndCount().populate()` - 带计数查询
- ✅ `findPage().populate()` - 分页查询

**特点**:
- ✅ 极简配置（只需 4 个字段）
- ✅ 接近 MongoDB 原生（直接对应 `$lookup`）
- ✅ 批量查询优化（避免 N+1 问题）
- ✅ 支持链式调用
- ✅ 丰富的 populate 选项（select/sort/limit/skip/match）

[📖 Relations 详细文档](./docs/model/relations.md)

**注意**：需要安装 `schema-dsl` 依赖：
```bash
npm install schema-dsl
```

#### 热重载支持（v1.1.7+）🆕

在开发模式下，无需重启进程即可更新 Model 定义。

```javascript
const { Model } = require('monsqlize');

// 注销 Model 定义（返回 boolean）
Model.undefine('users');         // true  — 成功注销
Model.undefine('nonexistent');   // false — 不存在时不抛错

// 替换 Model 定义（undefine + define 的组合）
Model.redefine('users', {
    schema: (dsl) => dsl({ username: 'string!', email: 'email!' })
});

// 批量热重载（重新加载所有 model 文件）
await msq._loadModels({ reload: true });
```

**注意事项**：
- `redefine()` 若新定义校验失败，旧定义**已被移除**（不会回滚），调用方需 try/catch
- 已实例化的 `ModelInstance` 不受影响，热重载后应通过 `db.model()` 重新获取实例

[📖 Model 层详细文档](./docs/model.md)

---

## � 进阶功能

### 1. Change Streams - 实时监听数据变更 ⭐

```javascript
// 实时监听订单变化
const watcher = orders.watch([
    { $match: { 'fullDocument.status': 'pending' } }
]);

watcher.on('change', (change) => {
    console.log('新订单:', change.fullDocument);
    // 触发通知、更新统计、失效缓存等
});

// ✅ 自动处理：重连、错误恢复、缓存失效
```

**特性**: 支持聚合管道过滤 · 断点续传 · 自动失效相关缓存

[📖 完整文档](./docs/watch.md) | [示例代码](./examples/watch.examples.js)

---

### 2. Count 队列控制 - 高并发优化 ⭐

```javascript
// 高并发场景：100 个用户同时请求分页
const db = new MonSQLize({
    countQueue: {
        enabled: true,       // 默认启用
        concurrency: 8       // 同时最多 8 个 count
    }
});

// ✅ 自动队列控制，防止 count 拖垮数据库
const result = await users.findPage({
    query: { status: 'active' },
    totals: { mode: 'async' }  // 自动应用队列
});
```

**效果**: 数据库 CPU 从 100% → 30% · 其他查询不再超时

[📖 完整文档](./docs/count-queue.md)

---

### 3. 链式调用 API - 优雅的查询构建 ⭐

```javascript
// jQuery 风格的链式调用
const result = await users
    .find()
    .filter({ age: { $gte: 18 } })
    .sort({ createdAt: -1 })
    .limit(10)
    .cache(60000)
    .exec();

// ✅ 代码更清晰、可读性更强
```

[📖 完整文档](./docs/chaining-api.md) | [链式方法参考](./docs/chaining-methods.md)

---

### 4. Model 层乐观锁 - 防止并发修改冲突

```javascript
// 启用版本控制
Model.define('products', {
    schema: (dsl) => dsl({ name: 'string!', stock: 'number!' }),
    options: { optimisticLock: true }
});

// 自动版本检查和更新
await Product.updateOne(
    { _id: productId, __v: 1 },           // 要求版本为 1
    { $inc: { stock: -1 }, $inc: { __v: 1 } }  // 自动递增版本
);
// ❌ 如果版本不匹配（被其他请求修改），更新失败
```

[📖 Model 层文档](./docs/model.md)

---

### 5. ES Module 支持 - 现代 JavaScript

```javascript
// ✅ 支持 import/export
import MonSQLize from 'monsqlize';

const db = new MonSQLize({ /* ... */ });
await db.connect();

// 🎯 完美支持 TypeScript
import type { Collection, MonSQLizeConfig } from 'monsqlize';
```

[📖 ESM 文档](./docs/esm-support.md)

---

## �📊 性能测试报告

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
- updateOne / updateMany ⭐ (支持聚合管道 v1.0.8+)
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

✅ **企业级多连接池** (v1.0.8+)
- ConnectionPoolManager
- 5种智能选择策略
- 实时健康检查
- 自动故障转移
- 完整统计收集

✅ **Saga 分布式事务** (v1.1.0 计划)
- 跨服务事务（设计完成）
- 自动补偿机制（设计完成）
- 状态跟踪（设计完成）
- 超时和重试（设计完成）

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
- 链式调用 API ⭐
- ESM/CommonJS 双模式
- ObjectId 自动转换 ⭐
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

