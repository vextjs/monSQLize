# monSQLize 文档索引

**快速导航**: 所有 API 文档和使用指南的完整列表

---

## 📚 核心概念

| 文档 | 说明 |
|------|------|
| [PROJECT-VISION.md](PROJECT-VISION.md) | **🎯 项目愿景 - 统一数据库查询语法框架（v1.0.6+）🆕** |
| [mongodb-native-vs-extensions.md](mongodb-native-vs-extensions.md) | **MongoDB 原生 vs monSQLize 扩展功能对比** |
| [connection.md](connection.md) | 连接管理和配置 |
| [multi-pool.md](multi-pool.md) | **🎉 企业级多连接池管理 - 读写分离、负载均衡、故障转移（v1.0.8+）🆕** |
| [objectid-auto-convert.md](objectid-auto-convert.md) | **ObjectId 自动转换 - 简化 ObjectId 处理（v1.3.0+）🆕** |
| [model.md](model.md) | **Model 层 - Schema 验证、自定义方法、生命周期钩子（v1.0.3+）** |
| [populate.md](populate.md) | **Populate API - 关联查询（6个方法支持，业界领先）（v1.0.6+）🆕** |
| [relations.md](relations.md) | **Relations API - 关系定义（hasOne/hasMany/belongsTo）（v1.0.6+）🆕** |
| [hooks.md](hooks.md) | **Hooks API - 生命周期钩子（insert/update/delete/find）（v1.0.6+）🆕** |
| [model/relations.md](model/relations.md) | **Relations 和 Populate - 关系定义和关联数据填充（v1.2.0+）🆕** |
| [model/nested-populate.md](model/nested-populate.md) | **嵌套 Populate - 多层关系填充（v1.2.0+）🆕** |
| [ssh-tunnel.md](ssh-tunnel.md) | **SSH隧道 - 安全连接内网数据库（v1.3+）** |
| [cache.md](cache.md) | 缓存系统（LRU + TTL） |
| [transaction.md](transaction.md) | 事务管理（自动重试、缓存锁） |
| [saga-transaction.md](saga-transaction.md) | **🎉 Saga 分布式事务 - 跨服务事务补偿机制（v1.0.8+）🆕** |
| [sync-backup.md](sync-backup.md) | **🎉 Change Stream 数据同步 - 实时备份到多个数据库（v1.0.8+）🆕** |
| [business-lock.md](business-lock.md) | **业务级分布式锁** |

| [transaction-optimizations.md](transaction-optimizations.md) | 事务优化策略 |
| [distributed-deployment.md](distributed-deployment.md) | **分布式部署指南（多实例缓存一致性）⭐** |
| [events.md](events.md) | 事件系统 |

---

## 🔍 查询操作（Query Operations）

| 文档 | 方法 | 说明 |
|------|------|------|
| [find.md](find.md) | `find()` | 查询多个文档 |
| [findOne.md](findOne.md) | `findOne()` | 查询单个文档 |
| [find-one-by-id.md](find-one-by-id.md) | `findOneById()` | 通过 _id 查询单个文档（便利方法）⭐ |
| [find-by-ids.md](find-by-ids.md) | `findByIds()` | 批量通过 _id 查询多个文档（便利方法）⭐ |
| [findPage.md](findPage.md) | `findPage()` | 游标分页查询 |
| [count.md](count.md) | `count()` | 统计文档数量 |
| [distinct.md](distinct.md) | `distinct()` | 去重查询 |
| [watch.md](watch.md) | `watch()` | **实时监听数据变更（Change Streams）⭐** |

---

## ✏️ 写入操作（Write Operations）

### 插入操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [insert-one.md](insert-one.md) | `insertOne()` | 插入单个文档 |
| [insert-many.md](insert-many.md) | `insertMany()` | 批量插入文档（10-50x 性能提升） |
| [insertBatch.md](insertBatch.md) | `insertBatch()` | 大批量插入（分批+重试） |
| [write-operations.md](write-operations.md) | 所有插入方法 | 插入操作完整指南 |

### 更新操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [update-operations.md](update-operations.md) | 所有更新方法 | 更新操作完整指南 |
| [update-one.md](update-one.md) | `updateOne()` | 更新单个文档 |
| [update-many.md](update-many.md) | `updateMany()` | 批量更新文档 |
| [update-aggregation.md](update-aggregation.md) | **🎉 Update 聚合管道 - 字段间计算、条件赋值（v1.0.8+）🆕** |
| [updateBatch.md](updateBatch.md) | `updateBatch()` | 大批量更新（分批+重试）⭐ |
| [replace-one.md](replace-one.md) | `replaceOne()` | 完整替换文档 |
| [find-one-and-update.md](find-one-and-update.md) | `findOneAndUpdate()` | 原子更新并返回 |
| [find-one-and-replace.md](find-one-and-replace.md) | `findOneAndReplace()` | 原子替换并返回 |

### 便利方法（Convenience Methods）

| 文档 | 方法 | 说明 |
|------|------|------|
| [upsert-one.md](upsert-one.md) | `upsertOne()` | 存在则更新，不存在则插入 ⭐ |
| [increment-one.md](increment-one.md) | `incrementOne()` | 原子递增/递减字段值 ⭐ |

### 删除操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [delete-one.md](delete-one.md) | `deleteOne()` | 删除单个文档 |
| [delete-many.md](delete-many.md) | `deleteMany()` | 批量删除文档 |
| [deleteBatch.md](deleteBatch.md) | `deleteBatch()` | 大批量删除（分批+重试）⭐ |
| [find-one-and-delete.md](find-one-and-delete.md) | `findOneAndDelete()` | 原子删除并返回 |

---

## 📊 聚合操作（Aggregation Operations）

| 文档 | 方法 | 说明 |
|------|------|------|
| [aggregate.md](aggregate.md) | `aggregate()` | 聚合管道查询 |

---

## 🔗 高级功能

| 文档 | 说明 |
|------|------|
| [chaining-api.md](chaining-api.md) | 链式调用 API |
| [chaining-methods.md](chaining-methods.md) | 链式调用方法详解 |
| [explain.md](explain.md) | 查询计划分析 |
| [bookmarks.md](bookmarks.md) | 分页书签管理 |

---

## 🛠️ 工具与配置

| 文档 | 说明 |
|------|------|
| [utilities.md](utilities.md) | 工具函数 |
| [collection-management.md](collection-management.md) | 集合管理 |
| [readPreference.md](readPreference.md) | 读偏好设置 |
| [count-queue.md](count-queue.md) | **Count 队列控制（高并发优化）⭐** |
| [distributed-deployment.md](distributed-deployment.md) | **分布式部署配置** |
| [MONGODB-MEMORY-SERVER.md](MONGODB-MEMORY-SERVER.md) | 内存数据库测试 |

---

## 🔧 兼容性与测试

| 文档 | 说明 |
|------|------|
| [COMPATIBILITY.md](COMPATIBILITY.md) | 完整兼容性矩阵 |
| [COMPATIBILITY-TESTING-GUIDE.md](COMPATIBILITY-TESTING-GUIDE.md) | 兼容性测试指南 |
| [mongodb-driver-compatibility.md](mongodb-driver-compatibility.md) | Driver 版本兼容性详解 |
| [findOneAnd-return-value-unified.md](findOneAnd-return-value-unified.md) | findOneAnd* 返回值统一说明 |
| [driver-7x-testing-guide.md](driver-7x-testing-guide.md) | Driver 7.x 测试指南 |
| [esm-support.md](esm-support.md) | ES Module (import) 支持 ✨ |
| [node-version-testing-guide.md](node-version-testing-guide.md) | Node.js 多版本测试指南 |

---


## 📖 按功能分类

### CRUD 操作

**Create (创建)**:
- [insert-one.md](insert-one.md) - insertOne（插入单个文档）
- [insert-many.md](insert-many.md) - insertMany（批量插入，10-50x 性能提升）
- [insertBatch.md](insertBatch.md) - insertBatch（超大批量插入）
- [write-operations.md](write-operations.md) - 插入操作完整指南

**Read (读取)**:
- [find.md](find.md) - find
- [findOne.md](findOne.md) - findOne
- [findPage.md](findPage.md) - findPage
- [count.md](count.md) - count
- [distinct.md](distinct.md) - distinct

**Update (更新)**:
- [update-operations.md](update-operations.md) - 更新操作完整指南
- [update-one.md](update-one.md) - updateOne
- [update-many.md](update-many.md) - updateMany
- [replace-one.md](replace-one.md) - replaceOne
- [find-one-and-update.md](find-one-and-update.md) - findOneAndUpdate
- [find-one-and-replace.md](find-one-and-replace.md) - findOneAndReplace

**Delete (删除)**:
- [delete-one.md](delete-one.md) - deleteOne（删除单个文档）
- [delete-many.md](delete-many.md) - deleteMany（批量删除）
- [find-one-and-delete.md](find-one-and-delete.md) - findOneAndDelete（原子删除并返回）

### 高级查询

- [aggregate.md](aggregate.md) - 聚合管道
- [explain.md](explain.md) - 查询计划
- [chaining-api.md](chaining-api.md) - 链式调用

### 性能与缓存

- [cache.md](cache.md) - 缓存系统
- [bookmarks.md](bookmarks.md) - 分页优化

---

## 🚀 快速开始路径

**新用户推荐阅读顺序**:

1. [connection.md](connection.md) - 了解如何连接数据库
2. [find.md](find.md) - 学习基础查询
3. [insert-one.md](insert-one.md) / [insert-many.md](insert-many.md) - 学习插入数据
4. [update-one.md](update-one.md) / [update-many.md](update-many.md) - 学习更新数据
5. [delete-one.md](delete-one.md) / [delete-many.md](delete-many.md) - 学习删除数据
6. [cache.md](cache.md) - 了解缓存机制
7. [transaction.md](transaction.md) - 学习事务管理
8. [distributed-deployment.md](distributed-deployment.md) - **多实例部署（生产环境必读）**

---

**文档总数**: 44个  
**最后更新**: 2025-01-02  
**新增**: 
- ✨ esm-support.md - ES Module (import) 支持
- ✨ findOneAnd-return-value-unified.md - 返回值统一说明
- ✨ driver-7x-testing-guide.md - Driver 7.x 测试指南
- ✨ node-version-testing-guide.md - Node.js 多版本测试

