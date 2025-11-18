# monSQLize 文档索引

**快速导航**: 所有 API 文档和使用指南的完整列表

---

## 📚 核心概念

| 文档 | 说明 |
|------|------|
| [mongodb-native-vs-extensions.md](mongodb-native-vs-extensions.md) | **MongoDB 原生 vs monSQLize 扩展功能对比** |
| [connection.md](connection.md) | 连接管理和配置 |
| [cache.md](cache.md) | 缓存系统（LRU + TTL） |
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
| [replace-one.md](replace-one.md) | `replaceOne()` | 完整替换文档 |
| [find-one-and-update.md](find-one-and-update.md) | `findOneAndUpdate()` | 原子更新并返回 |
| [find-one-and-replace.md](find-one-and-replace.md) | `findOneAndReplace()` | 原子替换并返回 |

### 便利方法（Convenience Methods）

| 文档 | 方法 | 说明 |
|------|------|------|
| [upsert-one.md](upsert-one.md) | `upsertOne()` | 存在则更新，不存在则插入 ⭐ |

### 删除操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [delete-one.md](delete-one.md) | `deleteOne()` | 删除单个文档 |
| [delete-many.md](delete-many.md) | `deleteMany()` | 批量删除文档 |
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
| [MONGODB-MEMORY-SERVER.md](MONGODB-MEMORY-SERVER.md) | 内存数据库测试 |

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

---

**文档总数**: 33个（新增：find-by-ids.md）  
**最后更新**: 2025-11-18

