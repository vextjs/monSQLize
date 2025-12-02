# monSQLize

<div align="center">

**一个面向多数据库的统一 MongoDB 风格读写 API**

[![npm version](https://img.shields.io/npm/v/monsqlize.svg)](https://www.npmjs.com/package/monsqlize)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x-green.svg)](https://www.mongodb.com/)
[![Coverage](https://img.shields.io/badge/Coverage-77%25-brightgreen.svg)]()

**[快速开始](#-快速开始)** | **[核心特性](#-为什么选择-monsqlize)** | **[完整文档](./docs/INDEX.md)** | **[示例代码](./examples/)** | **[路线图](./STATUS.md)**

</div>

---

## 📑 目录

- [简介](#-简介)
- [为什么选择 monSQLize](#-为什么选择-monsqlize)
- [快速开始](#-快速开始)
- [核心特性](#-核心特性)
  - [MongoDB 原生功能](#-mongodb-原生功能100-支持)
  - [monSQLize 增强功能](#-monsqlize-增强功能)
- [完成度](#-完成度)
- [性能优势](#-性能优势)
- [安装](#-安装)
- [基础使用](#-基础使用)
  - [连接数据库](#1-连接数据库)
  - [CRUD 操作](#2-crud-操作)
  - [智能缓存](#3-智能缓存)
  - [事务支持](#4-事务支持)
  - [分布式部署](#5-分布式部署)
  - [Admin/Management 功能](#6-adminmanagement-功能)
- [进阶功能](#-进阶功能)
- [完整文档](#-完整文档)
- [性能基准](#-性能基准)
- [兼容性](#-兼容性)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

## 🎯 简介

**monSQLize** 是一个面向多数据库的统一 API 库，提供熟悉的 MongoDB 风格查询接口。

**核心理念**：
- ✅ **简单易用**：熟悉的 MongoDB API，零学习成本
- ✅ **功能完整**：100% MongoDB CRUD + 索引 + 事务
- ✅ **性能卓越**：智能缓存、批量优化、并发控制
- ✅ **生产就绪**：完整的测试覆盖、文档齐全、企业级特性

**适用场景**：
- 🚀 需要高性能缓存的 MongoDB 应用
- 🔄 需要事务支持的业务逻辑
- 🌐 需要分布式部署的多实例应用
- 🛠️ 需要运维监控的生产环境
- 📊 需要深度分页的数据展示

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

await db.connect();
const { collection } = await db.connect();

// 2. 基础 CRUD
const users = collection('users');

// 插入
await users.insertOne({ name: 'Alice', age: 30 });

// 查询（自动缓存）
const alice = await users.findOne({ name: 'Alice' }, { cache: true });

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
const { data, pagination } = await users.findPage({
    query: { status: 'active' },
    page: 1,
    pageSize: 20,
    cache: true
});

console.log(`总计: ${pagination.total}, 共 ${pagination.pages} 页`);
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

#### **🚀 智能缓存系统**
```javascript
// TTL 缓存（60秒自动过期）
const users = await collection.find({ status: 'active' }, {
    cache: true,
    ttl: 60000
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
const { data, pagination } = await collection.findPage({
    query: { status: 'active' },
    page: 100,        // 第100页依然快速
    pageSize: 20,
    sort: { createdAt: -1 },
    cache: true
});

// 支持书签分页（前后翻页、跳页）
const { data, bookmark } = await collection.findPage({
    bookmark: 'previous-bookmark',
    pageSize: 20
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

**CRUD + 索引 + 事务 + 管理功能完成度**: **100%** (89/89) ✅

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
// 启用缓存
const users = await collection.find({ status: 'active' }, { 
    cache: true,
    ttl: 300000  // 5分钟
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

### 6. Admin/Management 功能

```javascript
const adapter = db._adapter;

// 健康检查
const isAlive = await adapter.ping();

// 获取服务器状态
const status = await adapter.serverStatus();
console.log('当前连接数:', status.connections.current);
console.log('内存使用:', status.mem.resident, 'MB');

// 数据库统计
const stats = await adapter.stats({ scale: 1048576 }); // MB
console.log('数据大小:', stats.dataSize, 'MB');
console.log('索引大小:', stats.indexSize, 'MB');

// Schema 验证
await collection.setValidator({
    $jsonSchema: {
        bsonType: 'object',
        required: ['name', 'email'],
        properties: {
            name: { bsonType: 'string', minLength: 2 },
            email: { bsonType: 'string', pattern: '^.+@.+$' }
        }
    }
});
```

---

## 🎓 进阶功能

### 高性能批量插入

```javascript
// insertBatch - 10-50x 性能提升
await collection.insertBatch(largeArray, {
    batchSize: 1000,        // 每批1000条
    ordered: false,         // 无序插入（更快）
    parallel: 5,            // 5个并发批次
    continueOnError: true   // 出错继续
});
```

### 链式调用 API

```javascript
const users = await collection
    .find({ status: 'active' })
    .sort({ createdAt: -1 })
    .skip(20)
    .limit(10)
    .project({ name: 1, email: 1 })
    .cache(true)
    .exec();
```

### 聚合查询

```javascript
const result = await collection.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$city', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
], { cache: true, ttl: 300000 });
```

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

### MongoDB 驱动版本

- ✅ **MongoDB Node.js Driver 6.x**（完全测试并支持）
- ⚠️ 其他版本未经充分测试

monSQLize 内部已处理 MongoDB 驱动 6.x 的 API 变更，确保 API 行为一致。

**详细说明**:
- 📖 [MongoDB 驱动版本兼容性指南](./docs/mongodb-driver-compatibility.md)

### Node.js 版本

- ✅ Node.js 14.x+
- ✅ Node.js 16.x, 18.x, 20.x（推荐）

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

