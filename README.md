# monSQLize

<div align="center">

**高性能 MongoDB 增强库 - 智能缓存 + 事务优化 + 企业级特性**

[![npm version](https://img.shields.io/npm/v/monsqlize.svg)](https://www.npmjs.com/package/monsqlize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MongoDB](https://img.shields.io/badge/MongoDB-4.4%2B-green.svg)](https://www.mongodb.com/)
[![Performance](https://img.shields.io/badge/Performance-10--100x-red.svg)]()
[![Coverage](https://img.shields.io/badge/Coverage-77%25-brightgreen.svg)]()

[![Node.js](https://img.shields.io/badge/Node.js-14%2B-brightgreen)](https://nodejs.org/)
[![MongoDB Driver](https://img.shields.io/badge/Driver-4.x%20%7C%205.x%20%7C%206.x%20%7C%207.x-blue)](docs/COMPATIBILITY.md)
[![Module](https://img.shields.io/badge/Module-CommonJS%20%7C%20ESM-purple)]()
[![Compatibility](https://img.shields.io/badge/Compatibility-Matrix-purple)](docs/COMPATIBILITY.md)

**[快速开始](#-快速开始)** | **[核心特性](#-核心特性)** | **[完整文档](./docs/INDEX.md)** | **[示例代码](./examples/)** | **[路线图](#-产品路线图)** | **[兼容性](./docs/COMPATIBILITY.md)**

</div>

---

## 📑 目录

- [简介](#-简介)
- [为什么选择 monSQLize](#-为什么选择-monsqlize)
- [快速开始](#-快速开始)
- [核心特性](#-核心特性)
  - [MongoDB 原生功能](#-mongodb-原生功能100-支持)
  - [monSQLize 增强功能](#-monsqlize-增强功能)
- [性能优势](#-性能优势)
- [安装](#-安装)
- [基础使用](#-基础使用)
  - [连接数据库](#1-连接数据库)
  - [CRUD 操作](#2-crud-操作)
  - [智能缓存](#3-智能缓存)
  - [事务支持](#4-事务支持)
  - [分布式部署](#5-分布式部署)
  - [跨库访问](#6-跨库访问)
- [进阶功能](#-进阶功能)
  - [便利方法](#便利方法)
  - [批量操作](#高性能批量插入)
  - [链式调用](#链式调用-api)
  - [深度分页](#深度分页)
  - [聚合查询](#聚合查询)
- [完整文档](#-完整文档)
- [兼容性](#-兼容性)
- [产品路线图](#-产品路线图)
- [贡献指南](#-贡献指南)

---

## 🎯 简介

**monSQLize** 是一个专为 MongoDB 设计的高性能增强库。

在保持 **100% MongoDB API 兼容**的同时，提供：
- ⚡ **智能缓存系统** - 10-100倍性能提升，TTL/LRU/自动失效
- 🔄 **事务管理优化** - 自动管理 + 优化，减少 30% DB 访问
- 🌐 **分布式部署支持** - Redis Pub/Sub 实现多实例缓存一致性
- 🛠️ **运维监控** - 慢查询日志、性能指标、健康检查
- 📦 **便利方法** - 减少 60-80% 代码量

**设计理念**：
- ✅ **零学习成本** - 完全兼容 MongoDB 原生 API，无需学习新语法
- ✅ **渐进式采用** - 可以与原生驱动混用，逐步迁移
- ✅ **性能优先** - 专注于性能优化和生产可靠性
- ✅ **文档齐全** - 100% API 文档 + 50+ 可运行示例

**未来计划**: v2.x 将支持 MySQL、PostgreSQL 等数据库的统一 MongoDB 风格 API（[查看路线图](#-产品路线图)）

**适用场景**：
- 🚀 需要高性能缓存的 MongoDB 应用
- 🔄 需要事务支持的业务逻辑
- 🌐 需要分布式部署的多实例应用
- 🛠️ 需要运维监控的生产环境
- 📊 需要深度分页的大数据展示

---

## 🆚 与 MongoDB 原生驱动对比

| 特性 | 原生驱动 | monSQLize |
|------|---------|-----------|
| **基础功能** | ✅ 完整 | ✅ **100% 兼容** |
| **缓存系统** | ❌ | ✅ TTL/LRU/自动失效 |
| **便利方法** | ❌ | ✅ 5个（减少60-80%代码）|
| **事务优化** | ❌ | ✅ -30% DB访问 |
| **批量优化** | 慢 | ✅ **25x 性能提升** |
| **分布式支持** | ❌ | ✅ Redis 广播 |
| **运维监控** | 需配置 | ✅ 开箱即用 |

**完全兼容 - 可以无缝替换**:
```javascript
// ✅ 从原生驱动迁移，只需修改初始化
// const { MongoClient } = require('mongodb');
const MonSQLize = require('monsqlize');

// 初始化改为 monSQLize
const db = new MonSQLize({ 
    type: 'mongodb', 
    config: { uri: 'mongodb://localhost:27017/mydb' } 
});
await db.connect();

// ✅ 所有 MongoDB API 保持不变
const users = db.collection('users');
await users.findOne({ _id: userId });  // 完全相同的 API
await users.insertOne({ name: 'Alice' });
await users.updateOne({ _id: userId }, { $set: { age: 31 } });
```

---

## 🌟 为什么选择 monSQLize？

### 对比 MongoDB 原生驱动

| 特性 | MongoDB 原生 | **monSQLize** | 提升 |
|------|-------------|--------------|------|
| **基础 CRUD** | ✅ | ✅ | 功能相同 |
| **智能缓存** | ❌ | ✅ TTL/LRU/自动失效 | **10-100x 性能提升** |
| **批量插入** | 慢 | ✅ 高性能批处理 | **10-50x 性能提升** |
| **事务支持** | 手动管理 | ✅ 自动管理 + 优化 | **-30% DB 访问** |
| **深度分页** | ❌ 性能差 | ✅ 游标分页 | **支持千万级数据** |
| **分布式部署** | ❌ 缓存不一致 | ✅ Redis 广播 | **多实例一致性** |
| **运维监控** | 需配置 | ✅ 开箱即用 | **开箱即用** |
| **开发效率** | 标准 | ✅ 便利方法 | **减少 60-80% 代码** |

### 关键优势

1. **🚀 10-100倍性能提升**
   - 智能缓存系统（TTL/LRU/命名空间失效）
   - 高性能批量插入（10-50x）
   - 只读事务优化（-30% DB访问）
   - 文档级别锁（16倍并发）

2. **⚡ 开发效率提升 60-80%**
   - 便利方法（findOneById、findByIds、upsertOne、incrementOne）
   - 自动缓存失效
   - 完整的 TypeScript 类型支持
   - 链式调用 API

3. **🌐 企业级特性**
   - ✅ 完整的事务支持（自动/手动管理）
   - ✅ 分布式部署支持（Redis Pub/Sub）
   - ✅ Admin/Management 功能（运维监控、Schema验证）
   - ✅ 慢查询日志、性能监控

4. **📖 文档完整、测试齐全**
   - ✅ 100% API 文档覆盖
   - ✅ 77%+ 测试覆盖率
   - ✅ 50+ 可运行示例
   - ✅ 详细的最佳实践指南

---

## 🤔 何时使用 monSQLize？

### ✅ 适合使用的场景

- 🚀 **高并发读取场景** - 查询重复度高，缓存命中率 > 30%
- 💰 **性能敏感应用** - 需要 10-100倍性能提升
- 🔄 **复杂事务逻辑** - 需要可靠的事务管理和优化
- 🌐 **多实例部署** - 需要分布式缓存一致性
- 📊 **大数据分页** - 千万级数据的深度分页
- 🛠️ **需要运维监控** - 慢查询日志、性能指标、健康检查

### ⚠️ 可能不适合

- 📝 **纯写入场景** - 大量写入，很少查询（缓存作用有限）
- 🔒 **极端低延迟要求** - 要求 < 1ms 响应（缓存会增加微小开销）
- 🎯 **简单 CRUD** - 简单应用，不需要缓存和优化
- 🏃 **快速原型阶段** - 还在探索需求，架构未定

### 🤝 渐进式采用

**好消息**: monSQLize 100% 兼容 MongoDB 原生驱动

```javascript
// ✅ 可以混用
const nativeDriver = require('mongodb');
const MonSQLize = require('monsqlize');

// 性能敏感的查询用 monSQLize（启用缓存）
const hotQueries = new MonSQLize({
    cache: { maxSize: 100000 }  // 全局启用缓存
});

// 简单查询用原生驱动
const client = await nativeDriver.MongoClient.connect('...');

// ✅ 可以逐步迁移
// 1. 先在热点查询启用缓存
// 2. 观察效果
// 3. 逐步扩展到更多场景
```

---

## ⚡ 快速开始

### 5 分钟上手

```bash
npm install monsqlize
```

```javascript
const MonSQLize = require('monsqlize');

// 1. 连接数据库
const db = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' }
});

const { collection } = await db.connect();

// 2. 基础 CRUD
const users = collection('users');

// 插入
await users.insertOne({ name: 'Alice', age: 30 });

// 查询（启用缓存 5 秒）
const alice = await users.findOne({ name: 'Alice' }, { cache: 5000 });

// 更新（自动失效缓存）
await users.updateOne({ name: 'Alice' }, { $set: { age: 31 } });

// 3. 便利方法 - 减少 80% 代码
const user = await users.findOneById('507f1f77bcf86cd799439011');
await users.upsertOne({ email: 'alice@example.com' }, { name: 'Alice' });
await users.incrementOne({ _id: userId }, 'viewCount', 1);

// 4. 事务支持
await db.withTransaction(async (session) => {
    await users.updateOne({ _id: userId }, { $inc: { balance: -100 } }, { session });
    await orders.insertOne({ userId, amount: 100 }, { session });
});

// 5. 深度分页
const result = await users.findPage({
    query: { status: 'active' },
    page: 1,
    limit: 20,
    totals: {
        mode: 'async',  // 异步统计
        ttl: 300000     // 缓存 5 分钟
    }
});

console.log(`总计: ${result.totals?.total}, 共 ${result.totals?.totalPages} 页`);
```

**就是这么简单！** 🎉

---

## 🎯 核心特性

### 🔵 MongoDB 原生功能（100% 支持）

完整封装 MongoDB 所有原生功能，API 行为与 MongoDB 保持一致：

#### **CRUD 操作（100% 完成）**
- ✅ **Create**: insertOne, insertMany, insertBatch（高性能批处理）
- ✅ **Read**: find, findOne, findPage（游标分页）, aggregate, count, distinct
- ✅ **Update**: updateOne, updateMany, replaceOne, findOneAndUpdate, findOneAndReplace
- ✅ **Delete**: deleteOne, deleteMany, findOneAndDelete
- ✅ **Watch**: watch（Change Streams 实时监听）**⭐ v1.1.0**

#### **索引管理（100% 完成）**
- ✅ createIndex, createIndexes, listIndexes, dropIndex, dropIndexes
- ✅ 支持所有索引类型（单字段、复合、唯一、TTL、文本、地理空间等）

#### **事务支持（100% 完成）** ✅ 完成
- ✅ withTransaction（自动管理）
- ✅ startTransaction（手动管理）
- ✅ 缓存锁机制（防止脏读）
- ✅ 只读优化（-30% DB访问）
- ✅ 文档级别锁（16倍并发提升）
- ✅ 重试、超时、监控

#### **链式调用 API（100% 完成）**
- ✅ sort, limit, skip, projection, hint, collation 等所有 MongoDB 游标方法

---

### 🔧 monSQLize 增强功能

在 MongoDB 原生功能基础上，提供额外的便利性和性能优化：

#### **🔥 高并发优化**
- ✅ **Count 队列控制** - 自动限制 count 并发，避免压垮数据库（默认启用）
- ✅ **连接池管理** - 自动管理数据库连接，防止连接泄漏
- ✅ **分布式锁** - 跨实例去重，减少重复查询（配合 Redis）

#### **🚀 智能缓存系统**
```javascript
// TTL 缓存（60秒自动过期）
const users = await collection.find({ status: 'active' }, {
    cache: 60000  // 缓存 60 秒
});

// 命名空间缓存失效
await collection.invalidate('updateOne'); // 自动失效相关缓存
```

**特性**：
- ✅ TTL/LRU 多种策略
- ✅ 自动缓存失效（写操作后）
- ✅ 并发去重（相同查询只执行一次）
- ✅ 多层缓存（内存 + Redis）

---

#### **⚡ 便利方法（简化 60-80% 代码）**

```javascript
// findOneById - 减少 80% 代码
// ❌ 原来的写法
const user = await collection.findOne({ 
    _id: new ObjectId('507f1f77bcf86cd799439011') 
});

// ✅ 现在的写法
const user = await collection.findOneById('507f1f77bcf86cd799439011');

// findByIds - 批量查询，1 次 DB 调用
const users = await collection.findByIds([id1, id2, id3]);

// upsertOne - 简化 upsert 操作
await collection.upsertOne({ email: 'alice@example.com' }, { 
    name: 'Alice', age: 30 
});

// incrementOne - 原子递增/递减
await collection.incrementOne({ _id: userId }, 'viewCount', 1);

// findAndCount - 同时返回数据和总数（1次调用）
const { data, total } = await collection.findAndCount(
    { status: 'active' },
    { limit: 20, skip: 0 }
);
console.log(`共 ${total} 条，当前返回 ${data.length} 条`);
```

---

#### **🆕 扩展方法（v1.2.0 新增）**

4 个强大的扩展方法，进一步简化开发并提升性能：

```javascript
// 1. findOneOrCreate - 查询或创建（并发安全，代码减少 80%）
// 场景：OAuth 登录、标签自动创建
const { doc, created } = await User.findOneOrCreate(
    { email: 'alice@example.com' },
    { name: 'Alice', provider: 'google' }
);
// created: true（新创建） 或 false（已存在）
// 性能提升：缓存命中 59 倍 ⚡

// 2. safeDelete - 安全删除（依赖检查，防止孤儿数据）
// 场景：用户删除、商品下架
await User.safeDelete(
    { _id: userId },
    {
        checkDependencies: [
            {
                collection: 'orders',
                query: { userId, status: { $in: ['pending', 'paid'] } },
                errorMessage: '用户有未完成的订单'
            }
        ],
        soft: true,  // 软删除（保留数据用于审计）
        additionalFields: {
            deletedBy: adminId,
            deleteReason: '用户注销'
        }
    }
);
// 自动检查依赖 → 阻止删除或软删除

// 3. updateOrInsert - 深度合并更新（配置管理神器）
// 场景：用户偏好设置、系统配置
const result = await UserConfig.updateOrInsert(
    { userId: 100 },
    {
        preferences: {
            theme: 'dark',
            notifications: { email: false }  // 只改这一项
        }
    },
    { mergeStrategy: 'deep' }  // 深度合并
);
// 只更新 theme 和 email，保留 language、fontSize、push、sms 等其他字段

// 4. bulkUpsert - 批量 upsert（性能提升 8-41 倍 ⚡）
// 场景：数据同步、批量导入
const result = await User.bulkUpsert(users, {
    matchOn: (user) => ({ email: user.email }),
    batchSize: 500,
    onProgress: (processed, total) => {
        console.log(`进度: ${processed}/${total}`);
    }
});
// 100 条：8.3 倍提升 | 10000 条：41.5 倍提升
```

**详细文档**：
- 📖 [findOneOrCreate](./docs/findOneOrCreate.md) - 查询或创建（并发安全）
- 📖 [safeDelete](./docs/safeDelete.md) - 安全删除（依赖检查）
- 📖 [updateOrInsert](./docs/updateOrInsert.md) - 深度合并更新（配置管理）
- 📖 [bulkUpsert](./docs/bulkUpsert.md) - 批量 upsert（高性能）

**核心优势**：

| 方法 | 代码减少 | 性能提升 | 核心价值 |
|------|---------|---------|---------|
| findOneOrCreate | 80% | 59 倍（缓存）| 并发安全、自动重试 |
| safeDelete | 80% | - | 依赖检查、防止事故 |
| updateOrInsert | 70% | - | 深度合并、保留字段 |
| bulkUpsert | - | 8-41 倍 | 批量处理、进度监控 |

---

#### **🌐 分布式部署支持** ✅ 完成

```javascript
const db = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    cache: {
        distributed: {
            enabled: true,
            redisUrl: 'redis://localhost:6379'
        }
    }
});
```

**特性**：
- ✅ 多实例缓存一致性（Redis Pub/Sub 广播）
- ✅ 分布式事务锁（跨实例隔离）
- ✅ 1-5ms 实时广播延迟

---

#### **🛠️ Admin/Management 功能** ✅ 完成

```javascript
const adapter = db._adapter;

// 运维监控
const isAlive = await adapter.ping();
const info = await adapter.buildInfo();
const status = await adapter.serverStatus();
const stats = await adapter.stats({ scale: 1048576 }); // MB

// 数据库管理
const databases = await adapter.listDatabases();
const collections = await adapter.listCollections();
await adapter.dropDatabase('test_db', { confirm: true }); // 三重安全保护

// Schema 验证
await collection.setValidator({
    $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'email']
    }
});
```

**功能**：
- ✅ 运维监控（4个方法）
- ✅ 数据库操作（4个方法）
- ✅ Schema 验证（4个方法）
- ✅ 集合管理（6个方法）

---

#### **📊 深度分页（支持千万级数据）**

```javascript
// 游标分页 - 性能稳定，不受页数影响
const { data, pageInfo } = await collection.findPage({
    query: { status: 'active' },
    page: 100,        // 第100页依然快速
    limit: 20,
    sort: { createdAt: -1 },
    totals: {
        mode: 'async',  // 异步统计
        ttl: 300000     // 缓存 5 分钟
    }
});

// 游标分页（前后翻页）
const { data, pageInfo } = await collection.findPage({
    after: 'cursor-token',  // 下一页
    limit: 20
});
```

---

#### **📈 性能监控**

```javascript
// 慢查询日志（自动记录 > 500ms 的查询）
const users = await collection.find({ status: 'active' }, {
    maxTimeMS: 1000,  // 查询超时控制
    comment: 'User list query'  // 查询标识
});

// 元数据返回
const { data, metadata } = await collection.find({ ... });
console.log(`查询耗时: ${metadata.duration}ms`);
```

---

## 📊 完成度

**CRUD + 索引 + 事务 + 管理功能完成度**: **100%** (55/55) ✅

| 功能模块 | 完成度 | 状态 |
|---------|--------|------|
| **CRUD 操作** | 100% (16/16) | ✅ 完成 |
| **索引管理** | 100% (5/5) | ✅ 完成 |
| **事务支持** | 100% (8/8) | ✅ 完成 |
| **便利方法** | 100% (5/5) | ✅ 完成 |
| **分布式支持** | 100% (3/3) | ✅ 完成 |
| **Admin/Management** | 100% (18/18) | ✅ 完成 |
| **总体完成度** | **100%** | ✅ 生产就绪 |

**详细功能矩阵**: [STATUS.md](./STATUS.md)

---

## 🚀 性能优势

### 批量插入性能

| 文档数 | MongoDB 原生 | monSQLize | 提升倍数 |
|-------|-------------|-----------|---------|
| 1,000 | 850ms | **45ms** | **18.9x** |
| 5,000 | 4,200ms | **180ms** | **23.3x** |
| 10,000 | 8,500ms | **350ms** | **24.3x** |
| 50,000 | 43,000ms | **1,700ms** | **25.3x** |

### 缓存性能

| 场景 | 无缓存 | 有缓存 | 提升倍数 |
|------|--------|--------|---------|
| 简单查询 | 15ms | **0.1ms** | **150x** |
| 复杂聚合 | 500ms | **0.5ms** | **1000x** |
| 深度分页 | 2000ms | **1ms** | **2000x** |

### 事务并发性能

| 场景 | 无优化 | 有优化 | 提升 |
|------|--------|--------|------|
| 只读事务 | 100% | **70%** | -30% DB 访问 |
| 文档级锁 | 1x | **16x** | 16倍并发 |

**详细基准测试**: [test/benchmark/](./test/benchmark/)

---

## 📦 安装

```bash
npm install monsqlize

# 可选：如需 Redis 多层缓存
npm install ioredis
```

### 🎯 支持 CommonJS 和 ES Module

monSQLize 完全支持两种导入方式：

**CommonJS (require)**:
```javascript
const MonSQLize = require('monsqlize');
```

**ES Module (import)** ✅ 新增:
```javascript
import MonSQLize from 'monsqlize';
// 或命名导入
import { MonSQLize, Logger, MemoryCache } from 'monsqlize';
```

📖 查看 [ES Module 支持文档](./docs/esm-support.md) 了解更多

---

## 💻 基础使用

### 1. 连接数据库

```javascript
const MonSQLize = require('monsqlize');

const db = new MonSQLize({
    type: 'mongodb',
    config: {
        uri: 'mongodb://localhost:27017/mydb'
    },
    cache: {
        enabled: true,
        ttl: 60000  // 默认缓存60秒
    }
});

await db.connect();
const { collection } = await db.connect();
```

### 2. CRUD 操作

```javascript
const users = collection('users');

// Create
const result = await users.insertOne({ name: 'Alice', age: 30 });
console.log('插入ID:', result.insertedId);

// Read
const user = await users.findOne({ name: 'Alice' });

// Update
await users.updateOne(
    { name: 'Alice' }, 
    { $set: { age: 31 } }
);

// Delete
await users.deleteOne({ name: 'Alice' });
```

### 3. 智能缓存

```javascript
// 启用缓存（TTL 5分钟）
const users = await collection.find({ status: 'active' }, { 
    cache: 300000  // 缓存 300000 毫秒 = 5 分钟
});

// 禁用缓存
const realtime = await collection.find({ status: 'pending' }, {
    cache: 0  // 0 = 禁用缓存
});

// 自动缓存失效（写操作后自动清理缓存）
await collection.updateOne({ _id: userId }, { $set: { name: 'Bob' } });
// 相关缓存已自动失效 ✅
```

### 4. 事务支持

```javascript
// 自动管理事务
await db.withTransaction(async (session) => {
    await users.updateOne(
        { _id: userId }, 
        { $inc: { balance: -100 } }, 
        { session }
    );
    await orders.insertOne(
        { userId, amount: 100 }, 
        { session }
    );
    // 自动提交，失败自动回滚 ✅
});

// 手动管理事务
const session = await db.startTransaction();
try {
    await users.updateOne({ _id: userId }, { ... }, { session });
    await orders.insertOne({ ... }, { session });
    await session.commitTransaction();
} catch (error) {
    await session.abortTransaction();
    throw error;
} finally {
    session.endSession();
}
```

### 5. 分布式部署

```javascript
const db = new MonSQLize({
    type: 'mongodb',
    config: { uri: 'mongodb://localhost:27017/mydb' },
    cache: {
        distributed: {
            enabled: true,
            redisUrl: 'redis://localhost:6379',
            channel: 'monsqlize:cache:invalidate'
        },
        transaction: {
            distributedLock: {
                enabled: true,
                ttl: 300000  // 5分钟
            }
        }
    }
});

// 多实例自动同步缓存失效 ✅
// 实例A写入 → Redis广播 → 实例B/C/D缓存失效
```

### 6. 跨库访问

**无需创建多个实例，一个连接访问多个数据库**：

```javascript
const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'shop',  // 默认数据库
    config: { uri: 'mongodb://localhost:27017' }
});

const { db: dbFn, collection } = await db.connect();

// 访问默认数据库
const products = await collection('products').find({ status: 'active' });

// 访问其他数据库（analytics、logs、users_db 等）
const events = await dbFn('analytics').collection('events').findOne({
    query: { type: 'click' },
    cache: 5000
});

const logs = await dbFn('logs').collection('error_logs').find({
    query: { level: 'error', timestamp: { $gte: yesterday } }
});

// 跨库事务（需要副本集支持）
await db.withTransaction(async (session) => {
    // shop 数据库
    await collection('orders').insertOne({ userId, total: 100 }, { session });
    
    // analytics 数据库
    await dbFn('analytics').collection('sales').insertOne({
        date: new Date(),
        amount: 100
    }, { session });
});
```

**跨库访问特点**：
- ✅ 共享同一个连接，节省资源
- ✅ 支持所有 monSQLize 功能（缓存、事务、便利方法）
- ✅ 自动管理不同数据库的缓存（独立命名空间）
- ✅ 性能优异，无额外开销

📖 详细文档：[跨库访问指南](./docs/connection.md#跨库访问)

---

## 🎓 进阶功能

### 便利方法

**减少 60-80% 代码量的便利方法**：

#### findOneById - 通过 ID 查询

```javascript
// ❌ 原来的写法（繁琐）
const { ObjectId } = require('mongodb');
const user = await collection.findOne({ 
    _id: new ObjectId('507f1f77bcf86cd799439011') 
});

// ✅ 现在的写法（简洁）
const user = await collection.findOneById('507f1f77bcf86cd799439011');

// 支持缓存和所有选项
const user = await collection.findOneById(userId, {
    cache: 60000,
    projection: { password: 0 }
});
```

#### findByIds - 批量通过 ID 查询

```javascript
// 一次查询多个文档（性能优化）
const users = await collection.findByIds([id1, id2, id3], {
    cache: 30000,
    projection: { name: 1, email: 1 }
});
// 返回: [{ _id, name, email }, { _id, name, email }, ...]
```

#### upsertOne - 存在则更新，不存在则插入

```javascript
// 简化 upsert 操作
await collection.upsertOne(
    { email: 'alice@example.com' },  // 匹配条件
    { name: 'Alice', age: 30 }        // 数据
);

// 等同于复杂的 updateOne + upsert: true
// await collection.updateOne(
//     { email: 'alice@example.com' },
//     { $set: { name: 'Alice', age: 30 } },
//     { upsert: true }
// );
```

#### incrementOne - 原子递增/递减

```javascript
// 递增
await collection.incrementOne({ _id: userId }, 'viewCount', 1);
await collection.incrementOne({ _id: postId }, 'likes', 5);

// 递减
await collection.incrementOne({ _id: userId }, 'balance', -100);

// 支持缓存失效
await collection.incrementOne(
    { _id: userId }, 
    'score', 
    10,
    { cache: 60000 }
);
```

#### findAndCount - 同时返回数据和总数

```javascript
// 一次调用获取数据和总数
const { data, total } = await collection.findAndCount(
    { status: 'active' },
    { 
        limit: 20, 
        skip: 0,
        sort: { createdAt: -1 },
        cache: 60000
    }
);

console.log(`共 ${total} 条记录，当前返回 ${data.length} 条`);
// 输出: 共 1523 条记录，当前返回 20 条
```

📖 详细文档：
- [findOneById](./docs/find-one-by-id.md)
- [findByIds](./docs/find-by-ids.md)
- [upsertOne](./docs/upsert-one.md)
- [incrementOne](./docs/increment-one.md)
- [findAndCount](./docs/find-and-count.md)

---

### 高性能批量插入

**比原生驱动快 10-50 倍**：

```javascript
// 大批量插入（自动分批、并发、错误处理）
const result = await collection.insertBatch(largeArray, {
    batchSize: 1000,        // 每批1000条
    ordered: false,         // 无序插入（更快）
    parallel: 5,            // 5个并发批次
    continueOnError: true,  // 出错继续
    retryOnError: true,     // 失败重试
    maxRetries: 3           // 最多重试3次
});

console.log(`成功插入: ${result.insertedCount} 条`);
console.log(`失败: ${result.errors?.length || 0} 条`);

// 性能对比
// 50,000 条数据:
// - MongoDB 原生: 43,000ms
// - monSQLize:    1,700ms  (25.3x 提升)
```

**智能特性**：
- ✅ 自动分批，避免单次插入过大
- ✅ 并发执行，充分利用连接池
- ✅ 错误收集，不影响成功的批次
- ✅ 自动重试，提高成功率
- ✅ 进度回调，实时监控

📖 详细文档：[insertBatch](./docs/insertBatch.md)

---

### 链式调用 API

**完整支持 MongoDB 游标方法**：

```javascript
// 流畅的链式调用
const users = await collection
    .find({ status: 'active' })
    .sort({ createdAt: -1 })      // 排序
    .skip(20)                      // 跳过
    .limit(10)                     // 限制
    .project({ name: 1, email: 1 })  // 投影
    .hint({ status: 1 })           // 索引提示
    .maxTimeMS(5000)               // 超时控制
    .comment('User list query')    // 查询标识
    .exec();

// 支持所有 MongoDB 游标方法
// sort, limit, skip, project, hint, collation, 
// comment, maxTimeMS, batchSize, explain, stream
```

📖 详细文档：[链式调用 API](./docs/chaining-api.md)

---

### 深度分页

**支持千万级数据的高性能分页**：

#### 1. 游标分页（推荐）

```javascript
// 页码分页（性能稳定，不受页数影响）
const result = await collection.findPage({
    query: { status: 'active' },
    page: 100,        // 第100页依然快速
    limit: 20,
    sort: { createdAt: -1 },
    totals: {
        mode: 'async',  // 异步统计总数
        ttl: 300000     // 缓存 5 分钟
    }
});

console.log(`第 ${result.pageInfo.currentPage} 页`);
console.log(`共 ${result.totals.total} 条，${result.totals.totalPages} 页`);
console.log(`数据:`, result.items);
```

#### 2. 前后翻页（游标）

```javascript
// 第一页
let result = await collection.findPage({
    query: { status: 'active' },
    limit: 20,
    sort: { createdAt: -1 }
});

// 下一页（使用游标）
result = await collection.findPage({
    after: result.pageInfo.endCursor,  // 使用上一页的结束游标
    limit: 20,
    sort: { createdAt: -1 }
});

// 上一页
result = await collection.findPage({
    before: result.pageInfo.startCursor,  // 使用当前页的起始游标
    limit: 20,
    sort: { createdAt: -1 }
});
```

#### 3. totals 模式对比

| 模式 | 速度 | 准确性 | 适用场景 |
|------|------|--------|---------|
| `none` | 最快 | - | 不需要总数 |
| `sync` | 快 | 100% | 小数据（< 10万）|
| `async` | 快 | 100% | 大数据（推荐）|
| `approx` | 最快 | ~95% | 超大数据，允许误差 |

**性能对比**：
```
1000万数据，第100页：
- offset 分页：   2000ms  ❌
- 游标分页：      1ms     ✅ (2000x)
```

📖 详细文档：[深度分页指南](./docs/findPage.md)

---

### 聚合查询

**支持缓存的聚合管道**：

```javascript
// 聚合 + 缓存
const result = await collection.aggregate([
    { $match: { status: 'active' } },
    { $group: { 
        _id: '$city', 
        count: { $sum: 1 },
        avgAge: { $avg: '$age' }
    }},
    { $sort: { count: -1 } },
    { $limit: 10 }
], { 
    cache: 300000,  // 缓存 5 分钟
    maxTimeMS: 5000 
});

console.log('Top 10 城市:', result);
```

**复杂聚合示例**：

```javascript
// 多阶段聚合
const salesReport = await collection.aggregate([
    // 1. 时间范围筛选
    { $match: { 
        date: { 
            $gte: startDate, 
            $lte: endDate 
        } 
    }},
    
    // 2. 数据转换
    { $project: {
        year: { $year: '$date' },
        month: { $month: '$date' },
        revenue: 1,
        category: 1
    }},
    
    // 3. 分组统计
    { $group: {
        _id: { year: '$year', month: '$month', category: '$category' },
        totalRevenue: { $sum: '$revenue' },
        count: { $sum: 1 }
    }},
    
    // 4. 排序
    { $sort: { '_id.year': -1, '_id.month': -1, totalRevenue: -1 } }
], { 
    cache: 600000,  // 缓存 10 分钟
    allowDiskUse: true  // 允许使用磁盘（大数据）
});
```

📖 详细文档：[aggregate](./docs/aggregate.md)

---

### 实时监听（watch）⭐ v1.1.0

**监听 MongoDB 数据变更，支持自动缓存失效**：

#### 1. 基础监听

```javascript
// 监听集合的所有数据变更
const watcher = collection.watch();

watcher.on('change', (change) => {
    console.log('数据变更:', change.operationType);  // insert/update/delete/replace
    console.log('文档ID:', change.documentKey._id);
    console.log('完整文档:', change.fullDocument);
});

// 插入数据（会触发 change 事件）
await collection.insertOne({ name: 'Alice', age: 25 });
```

#### 2. 过滤事件

```javascript
// 只监听 insert 和 update 操作
const watcher = collection.watch([
    { $match: { operationType: { $in: ['insert', 'update'] } } }
]);

watcher.on('change', (change) => {
    console.log('新增或修改:', change.operationType);
});
```

#### 3. 自动缓存失效 ⭐

```javascript
// 启用自动缓存失效（默认开启）
const watcher = collection.watch([], {
    autoInvalidateCache: true  // 数据变更时自动失效相关缓存
});

// 1. 查询并缓存数据
const users = await collection.find({ status: 'active' }, { cache: 60000 });

// 2. 更新数据（触发 watch）
await collection.updateOne({ _id: userId }, { $set: { status: 'inactive' } });

// 3. ✅ watch 自动失效相关缓存
// 4. 下次查询自动从数据库读取最新数据
```

#### 4. 错误处理和重连

```javascript
const watcher = collection.watch();

// 监听错误（自动重试瞬态错误）
watcher.on('error', (error) => {
    console.warn('持久性错误:', error.message);
});

// 监听重连
watcher.on('reconnect', (info) => {
    console.log(`第 ${info.attempt} 次重连，延迟 ${info.delay}ms`);
});

// 监听恢复
watcher.on('resume', () => {
    console.log('✅ 已恢复监听（断点续传）');
});

// 监听致命错误
watcher.on('fatal', (error) => {
    console.error('💥 致命错误（无法恢复）:', error);
    // 通知运维
});
```

#### 5. 统计监控

```javascript
const watcher = collection.watch();

// 获取运行统计
const stats = watcher.getStats();
console.log('总变更数:', stats.totalChanges);
console.log('重连次数:', stats.reconnectAttempts);
console.log('运行时长:', stats.uptime, 'ms');
console.log('缓存失效次数:', stats.cacheInvalidations);
console.log('活跃状态:', stats.isActive);
```

#### 6. 优雅关闭

```javascript
// 应用退出时关闭 watcher
process.on('SIGTERM', async () => {
    await watcher.close();
    await db.close();
    process.exit(0);
});
```

**核心特性**：
- ✅ **自动重连**：网络中断后自动恢复（指数退避：1s → 2s → 4s → ... → 60s）
- ✅ **断点续传**：resumeToken 自动管理，不丢失任何变更
- ✅ **智能缓存失效**：数据变更时自动失效相关缓存
- ✅ **跨实例同步**：分布式环境自动广播缓存失效
- ✅ **完整事件系统**：change, error, reconnect, resume, close, fatal
- ✅ **统计监控**：完整的运行统计和健康检查

**注意事项**：
- ⚠️ **需要副本集**：Change Streams 需要 MongoDB 4.0+ 副本集或分片集群
- ⚠️ **测试环境**：可使用 mongodb-memory-server 副本集模式

**测试环境配置**：
```javascript
const db = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { 
        useMemoryServer: true,
        memoryServerOptions: {
            instance: {
                replSet: 'rs0'  // 启用副本集（支持 Change Streams）
            }
        }
    }
});
```

📖 详细文档：[watch 方法完整指南](./docs/watch.md)

---

## 📚 完整文档

### 核心文档

- 📖 [完整 API 文档索引](./docs/INDEX.md)
- 📖 [MongoDB 原生 vs monSQLize 对比](./docs/mongodb-native-vs-extensions.md)
- 📖 [事务使用指南](./docs/transaction.md)
- 📖 [分布式部署指南](./docs/distributed-deployment.md)
- 📖 [性能优化指南](./docs/transaction-optimizations.md)

### 功能文档

**CRUD 操作**:
- [find](./docs/find.md) | [findOne](./docs/findOne.md) | [findPage](./docs/findPage.md)
- [insertOne](./docs/insert-one.md) | [insertMany](./docs/insert-many.md) | [insertBatch](./docs/insertBatch.md)
- [updateOne](./docs/update-one.md) | [updateMany](./docs/update-many.md) | [replaceOne](./docs/replace-one.md)
- [deleteOne](./docs/delete-one.md) | [deleteMany](./docs/delete-many.md)

**便利方法**:
- [findOneById](./docs/find-one-by-id.md) | [findByIds](./docs/find-by-ids.md)
- [upsertOne](./docs/upsert-one.md) | [incrementOne](./docs/increment-one.md) | [findAndCount](./docs/find-and-count.md)

**Admin/Management**:
- [运维监控](./docs/admin.md) | [数据库操作](./docs/database-ops.md)
- [Schema 验证](./docs/validation.md) | [集合管理](./docs/collection-mgmt.md)

**其他功能**:
- [索引管理](./docs/indexes.md) | [聚合查询](./docs/aggregate.md)
- [缓存系统](./docs/cache.md) | [链式调用](./docs/chaining-api.md)

### 示例代码

- 📁 [完整示例代码目录](./examples/)
- 50+ 可运行示例，涵盖所有功能场景

---

## 📊 性能基准

运行性能基准测试：

```bash
npm run benchmark
```

查看详细基准测试报告：
- [批量插入基准](./test/benchmark/insertBatch-benchmark.js)
- [事务性能基准](./test/performance/transaction-benchmark.js)

---

## 🔧 兼容性

### ✅ 完整兼容性测试

monSQLize 已经过全面的多版本兼容性测试，确保在不同环境下稳定运行。

#### Node.js 版本

| 版本 | 支持状态 | 测试状态 |
|------|---------|---------|
| 14.x | ✅ 支持 | ✅ 已测试 |
| 16.x | ✅ 支持 | ✅ 已测试 |
| 18.x | ✅ 完全支持 | ✅ 已测试（推荐）|
| 20.x | ✅ 完全支持 | ✅ 已测试（推荐）|
| 22.x | ✅ 支持 | ✅ 已测试 |

#### MongoDB 驱动版本

| 版本 | 支持状态 | 测试状态 | 测试日期 | 说明 |
|------|---------|---------|---------|------|
| 4.x (4.17.2) | ✅ 完全支持 | ✅ 已测试 | 2025-01-02 | 自动适配 API 差异 |
| 5.x (5.9.2) | ✅ 完全支持 | ✅ 已测试 | 2025-01-02 | 自动统一返回值 |
| 6.x (6.17.0) | ✅ 完全支持 | ✅ 已测试 | 2025-01-02 | 推荐使用 |
| 7.x (7.0.0) | ✅ 完全支持 | ✅ 已测试 | 2025-01-02 | 最新版本 |

**✅ 测试验证** (2025-01-02):
- Driver 7.0.0: ✅ 通过（103.49s，100% 通过率）
- 测试套件: 30/30 通过
- 测试用例: 102 个全部通过

**✅ 自动处理的差异**:
- ✅ **findOneAnd* 返回值统一**：Driver 4.x/5.x/6.x 的返回值格式完全统一
- ✅ **连接选项自动适配**：自动处理 `useNewUrlParser` 等选项差异
- ✅ **版本特性自动检测**：自动识别 Driver 版本并启用相应功能

**用户无需关心版本差异**：
```javascript
// 所有 Driver 版本代码完全相同
const user = await collection.findOneAndUpdate(
  { name: 'Alice' },
  { $set: { age: 31 } }
);
// ✅ 统一返回：{ _id: ..., name: "Alice", age: 31 }
```

#### MongoDB Server 版本

| 版本 | 支持状态 | 测试状态 | 特性限制 |
|------|---------|---------|---------|
| 4.4 | ✅ 支持 | ✅ 已测试 | 基础功能 |
| 5.0 | ✅ 完全支持 | ✅ 已测试 | 时间序列集合 |
| 6.0 | ✅ 完全支持 | ✅ 已测试（推荐）| 加密字段 |
| 7.0 | ✅ 完全支持 | ✅ 已测试 | 最新特性 |

**智能特性探测**:
- ✅ 自动检测 Server 版本
- ✅ 特性支持探测（事务、索引、聚合）
- ✅ 条件性测试（自动跳过不支持的特性）

### 📚 兼容性文档

- 📖 [**完整兼容性矩阵**](./docs/COMPATIBILITY.md) - 所有版本的详细支持说明
- 📖 [**兼容性测试指南**](./docs/COMPATIBILITY-TESTING-GUIDE.md) - 如何运行兼容性测试
- 📖 [MongoDB 驱动差异详解](./docs/mongodb-driver-compatibility.md) - Driver 5.x vs 6.x 差异

### 🧪 运行兼容性测试

```bash
# 快速测试当前环境
npm run test:compatibility:server:quick

# 测试所有 Node.js 版本（需要 nvm/volta）
npm run test:compatibility:node

# 测试所有 MongoDB Driver 版本
npm run test:compatibility:driver

# 测试所有 MongoDB Server 版本
npm run test:compatibility:server
```

查看 [兼容性测试指南](./docs/COMPATIBILITY-TESTING-GUIDE.md) 了解更多。

---

## 🤝 贡献指南

欢迎贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md)

### 开发

```bash
# 克隆仓库
git clone https://github.com/vextjs/monSQLize.git
cd monSQLize

# 安装依赖
npm install

# 运行测试
npm test

# 运行单个测试套件
npm run test:unit

# 检查测试覆盖率
npm run coverage

# 运行 Lint 检查
npm run lint
```

---

## 🗺️ 产品路线图

### v1.x - MongoDB 专注版 ✅ (当前)

**已完成功能**：
- ✅ **MongoDB 完整支持** (Driver 4.x - 7.x)
  - 16 个 CRUD 方法
  - 5 个索引管理方法
  - 8 个事务方法
  - 18 个 Admin/Management 方法
  
- ✅ **智能缓存系统**
  - TTL（时间过期）
  - LRU（最近最少使用淘汰）
  - 自动缓存失效
  - Redis 分布式广播
  
- ✅ **性能优化**
  - 10-100x 查询性能提升
  - 25x 批量插入性能
  - -30% 事务 DB 访问
  - 16x 并发性能（文档级锁）
  
- ✅ **企业级特性**
  - 分布式部署（Redis Pub/Sub）
  - 慢查询日志
  - 性能监控
  - 健康检查
  
- ✅ **便利方法**
  - `findOneById` / `findByIds`
  - `upsertOne` / `incrementOne`
  - `findAndCount`

**测试和文档**：
- ✅ 77%+ 测试覆盖率
- ✅ 100% API 文档
- ✅ 50+ 可运行示例
- ✅ 兼容性测试（Driver 4.x-7.x, Node.js 14-22）

---

### v2.x - 多数据库统一 API 📋 (规划中)

**核心目标**：使用统一的 MongoDB 风格 API 操作多种数据库

#### MySQL 支持
```javascript
// 统一的 MongoDB 风格 API
const db = new MonSQLize({ 
    type: 'mysql',  // ← 新增支持
    config: { 
        host: 'localhost', 
        user: 'root', 
        database: 'mydb' 
    }
});

await db.connect();
const users = db.collection('users');

// 使用 MongoDB 语法查询 MySQL
await users.find({ 
    status: 'active', 
    age: { $gte: 18 } 
});
// ↓ 自动转换为 SQL
// SELECT * FROM users WHERE status = 'active' AND age >= 18

// MongoDB 风格的更新
await users.updateOne(
    { _id: 1 }, 
    { $set: { name: 'Alice' }, $inc: { loginCount: 1 } }
);
// ↓ 自动转换为 SQL
// UPDATE users SET name = 'Alice', loginCount = loginCount + 1 WHERE id = 1

// 聚合查询
await users.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$role', count: { $sum: 1 } } }
]);
// ↓ 自动转换为 SQL
// SELECT role, COUNT(*) as count FROM users WHERE status = 'active' GROUP BY role
```

#### PostgreSQL 支持
```javascript
const db = new MonSQLize({ 
    type: 'postgres',  // ← 新增支持
    config: { 
        host: 'localhost', 
        database: 'mydb' 
    }
});

// JSONB 字段自动映射
await users.find({ 
    'metadata.tags': { $in: ['tech', 'news'] } 
});
// ↓ 利用 PostgreSQL 的 JSONB 特性
// SELECT * FROM users WHERE metadata->'tags' ?| ARRAY['tech', 'news']

// 数组操作
await users.updateOne(
    { _id: 1 },
    { $push: { 'metadata.tags': 'featured' } }
);
// ↓ PostgreSQL 数组操作
// UPDATE users SET metadata = jsonb_set(metadata, '{tags}', ...) WHERE id = 1
```

**技术路线**：
1. **定义统一查询 AST**（抽象语法树）
   - MongoDB 查询 → AST → SQL 转换
   - 支持 90% 常用 MongoDB 操作符
   
2. **SQL 方言适配器**
   - MySQL: `LIMIT`, `AUTO_INCREMENT`
   - PostgreSQL: `JSONB`, `RETURNING`
   - SQL Server: `TOP`, `IDENTITY`
   
3. **保持核心功能**
   - 智能缓存（跨数据库）
   - 事务管理（适配各数据库）
   - 性能监控

4. **操作符映射表**

| MongoDB 操作符 | MySQL | PostgreSQL | SQL Server |
|---------------|-------|------------|------------|
| `$eq` (等于) | `=` | `=` | `=` |
| `$ne` (不等于) | `!=` | `<>` | `<>` |
| `$gt` (大于) | `>` | `>` | `>` |
| `$gte` (大于等于) | `>=` | `>=` | `>=` |
| `$lt` (小于) | `<` | `<` | `<` |
| `$lte` (小于等于) | `<=` | `<=` | `<=` |
| `$in` (在数组中) | `IN (...)` | `IN (...)` | `IN (...)` |
| `$nin` (不在数组中) | `NOT IN (...)` | `NOT IN (...)` | `NOT IN (...)` |
| `$regex` (正则匹配) | `REGEXP` | `~` | `LIKE` |
| `$exists` (字段存在) | `IS NOT NULL` | `IS NOT NULL` | `IS NOT NULL` |
| `$set` (设置字段) | `SET col = val` | `SET col = val` | `SET col = val` |
| `$inc` (递增) | `SET col = col + n` | `SET col = col + n` | `SET col = col + n` |
| `$unset` (删除字段) | `SET col = NULL` | `SET col = NULL` | `SET col = NULL` |
| `$push` (数组添加) | `JSON_ARRAY_APPEND()` | `array_append()` | `JSON_MODIFY()` |
| `$pull` (数组删除) | `JSON_REMOVE()` | `array_remove()` | `JSON_MODIFY()` |
| `$addToSet` (集合添加) | `JSON_ARRAY_APPEND()` | `array_append()` | `JSON_MODIFY()` |

**限制说明**：
- ⚠️ 某些 MongoDB 特性无法完美映射（如 `$lookup` 跨集合）
- ⚠️ 性能可能不如原生 SQL（增加了转换层）
- ✅ 90% 常用场景可以无缝支持

**预计时间**：2025 Q3-Q4

---

### v3.x - 生态扩展 🔮 (未来)

**可能方向**：
- 🔮 **SQL Server 支持**
- 🔮 **Redis 作为主数据库**（文档存储）
- 🔮 **其他 NoSQL**（Cassandra, DynamoDB）
- 🔮 **混合查询**（跨数据库 Join）
- 🔮 **数据库迁移工具**（MongoDB ↔ MySQL）
- 🔮 **查询优化器**（自动选择最优执行计划）

---

### 🤝 欢迎贡献

如果你对多数据库支持感兴趣，欢迎参与：

**贡献方式**：
- 💡 **提出设计建议** - [GitHub Issues](https://github.com/vextjs/monSQLize/issues)
- 🔧 **贡献代码** - [Pull Requests](https://github.com/vextjs/monSQLize/pulls)
- 📖 **完善文档** - 帮助改进文档
- 🧪 **提供测试用例** - 增加测试覆盖率
- 🌍 **国际化** - 翻译文档到其他语言

**技术栈**：
- Node.js 14+
- MongoDB Driver
- (未来) MySQL/PostgreSQL Drivers
- TypeScript (类型定义)

**联系方式**：
- 📧 Email: contact@vext.dev
- 💬 GitHub: [@vextjs](https://github.com/vextjs)
- 📖 文档: [贡献指南](./CONTRIBUTING.md)

---

## 📄 许可证

[MIT License](./LICENSE)

---

## 🌟 Star History

如果这个项目对你有帮助，请给我们一个 Star ⭐

---

## 📞 联系方式

- 📧 Email: contact@vext.dev
- 💬 Issues: [GitHub Issues](https://github.com/vextjs/monSQLize/issues)
- 📖 文档: [完整文档](./docs/INDEX.md)

---

<div align="center">

**由 ❤️ 用心打造**

[GitHub](https://github.com/vextjs/monSQLize) | [npm](https://www.npmjs.com/package/monsqlize) | [文档](./docs/INDEX.md) | [示例](./examples/)

</div>

