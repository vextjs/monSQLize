# 📚 API 参考索引

## 📚 核心概念

| 文档 | 说明 |
|------|------|
| [原生 API 对比](mongodb-native-vs-extensions.md) | **MongoDB 原生 vs monSQLize 扩展功能对比** |
| [连接配置](connection.md) | 连接管理和配置 |
| [多连接池管理](multi-pool.md) | **🎉 企业级多连接池管理 - 读写分离、负载均衡、故障转移（v1.0.8+）🆕** |
| [链式池/库访问](pool-chain-api.md) | **🆕 链式池/库访问 API - pool() / use() / scopedCollection() / scopedModel()（v1.3.0+）** |
| [ObjectId 自动转换](objectid-auto-convert.md) | **ObjectId 自动转换 - 简化 ObjectId 处理（v1.3.0+）🆕** |
| [Model 层](model.md) | **Model 层 - Schema 验证、自定义方法、生命周期钩子（v1.0.3+）** |
| [Populate API](populate.md) | **Populate API - 关联查询（6个方法支持，业界领先）（v1.0.6+）🆕** |
| [Relations API](relations.md) | **Relations API - 关系定义（hasOne/hasMany/belongsTo）（v1.0.6+）🆕** |
| [Hooks API](hooks.md) | **Hooks API - 生命周期钩子（insert/update/delete/find）（v1.0.6+）🆕** |
| [Relations 与 Populate](model/relations.md) | **Relations 和 Populate - 关系定义和关联数据填充（v1.2.0+）🆕** |
| [嵌套 Populate](model/nested-populate.md) | **嵌套 Populate - 多层关系填充（v1.2.0+）🆕** |
| [SSH 隧道](ssh-tunnel.md) | **SSH隧道 - 安全连接内网数据库（v1.3+）** |
| [错误码参考](error-codes.md) | **错误码参考 - 完整的错误码定义和处理指南** |
| [缓存系统](cache.md) | 缓存系统（LRU + TTL） |
| [函数缓存](function-cache.md) | **🎉 函数缓存 - 为任意异步函数添加缓存能力（v1.1.4+）🆕** |
| [事务管理](transaction.md) | 事务管理（自动重试、缓存锁） |
| [Saga 分布式事务](saga-transaction.md) | **🎉 Saga 分布式事务 - 跨服务事务补偿机制（v1.0.8+）🆕** |
| [Saga 高级特性](saga-advanced.md) | **Saga 高级特性与实现原理 - 深入解析补偿机制、分布式存储** |
| [Change Stream 同步](sync-backup.md) | **🎉 Change Stream 数据同步 - 实时备份到多个数据库（v1.0.8+）🆕** |
| [业务级分布式锁](business-lock.md) | **业务级分布式锁** |
| [事务优化策略](transaction-optimizations.md) | 事务优化策略 |
| [分布式部署](distributed-deployment.md) | **分布式部署指南（多实例缓存一致性）⭐** |
| [事件系统](events.md) | 事件系统 |

---

## 🔍 查询操作（Query Operations）

| 文档 | 方法 | 说明 |
|------|------|------|
| [查询多个文档](find.md) | `find()` | 查询多个文档 |
| [查询单个文档](findOne.md) | `findOne()` | 查询单个文档 |
| [按 id 查询单个文档](find-one-by-id.md) | `findOneById()` | 通过 _id 查询单个文档（便利方法）⭐ |
| [按 ids 批量查询](find-by-ids.md) | `findByIds()` | 批量通过 _id 查询多个文档（便利方法）⭐ |
| [分页查询](findPage.md) | `findPage()` | 游标分页查询 |
| [统计文档数量](count.md) | `count()` | 统计文档数量 |
| [去重查询](distinct.md) | `distinct()` | 去重查询 |
| [监听数据变更](watch.md) | `watch()` | **实时监听数据变更（Change Streams）⭐** |

---

## ✏️ 写入操作（Write Operations）

### 插入操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [插入单个文档](insert-one.md) | `insertOne()` | 插入单个文档 |
| [批量插入文档](insert-many.md) | `insertMany()` | 批量插入文档（10-50x 性能提升） |
| [大批量插入](insertBatch.md) | `insertBatch()` | 大批量插入（分批+重试） |
| [写入操作指南](write-operations.md) | 所有插入方法 | 插入操作完整指南 |

### 更新操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [更新操作指南](update-operations.md) | 所有更新方法 | 更新操作完整指南 |
| [Upsert 操作指南](upsert-guide.md) | **Upsert 操作指南** | **不存在就插入，存在则更新 - 完整指南 ⭐** |
| [更新单个文档](update-one.md) | `updateOne()` | 更新单个文档 |
| [批量更新文档](update-many.md) | `updateMany()` | 批量更新文档 |
| [Update 聚合管道](update-aggregation.md) | **🎉 Update 聚合管道 - 字段间计算、条件赋值（v1.0.8+）🆕** |
| [大批量更新](updateBatch.md) | `updateBatch()` | 大批量更新（分批+重试）⭐ |
| [完整替换文档](replace-one.md) | `replaceOne()` | 完整替换文档 |
| [查询并更新](find-one-and-update.md) | `findOneAndUpdate()` | 原子更新并返回 |
| [查询并替换](find-one-and-replace.md) | `findOneAndReplace()` | 原子替换并返回 |

### 便利方法（Convenience Methods）

| 文档 | 方法 | 说明 |
|------|------|------|
| [Upsert 单个文档](upsert-one.md) | `upsertOne()` | 存在则更新，不存在则插入 ⭐ |
| [递增/递减字段](increment-one.md) | `incrementOne()` | 原子递增/递减字段值 ⭐ |

### 删除操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [删除单个文档](delete-one.md) | `deleteOne()` | 删除单个文档 |
| [批量删除文档](delete-many.md) | `deleteMany()` | 批量删除文档 |
| [大批量删除](deleteBatch.md) | `deleteBatch()` | 大批量删除（分批+重试）⭐ |
| [查询并删除](find-one-and-delete.md) | `findOneAndDelete()` | 原子删除并返回 |

---

## 📊 聚合操作（Aggregation Operations）

| 文档 | 方法 | 说明 |
|------|------|------|
| [聚合管道查询](aggregate.md) | `aggregate()` | 聚合管道查询 |

---

## 🔗 高级功能

| 文档 | 说明 |
|------|------|
| [链式调用 API](chaining-api.md) | 链式调用 API |
| [链式调用方法详解](chaining-methods.md) | 链式调用方法详解 |
| [查询计划分析](explain.md) | 查询计划分析 |
| [分页书签管理](bookmarks.md) | 分页书签管理 |

---

## 🛠️ 工具与配置

| 文档 | 说明 |
|------|------|
| [工具函数](utilities.md) | 工具函数 |
| [集合管理](collection-management.md) | 集合管理 |
| [读偏好设置](readPreference.md) | 读偏好设置 |
| [Count 队列控制](count-queue.md) | **Count 队列控制（高并发优化）⭐** |
| [分布式部署配置](distributed-deployment.md) | **分布式部署配置** |

---

## 🔧 兼容性与测试

| 文档 | 说明 |
|------|------|
| [MongoDB Driver 兼容性](mongodb-driver-compatibility.md) | Driver 版本兼容性详解 |
| [findOneAnd 返回值](findOneAnd-return-value-unified.md) | findOneAnd* 返回值统一说明 |

| [ES Module 支持](esm-support.md) | ES Module (import) 支持 ✨ |

---


## 📖 按功能分类

### CRUD 操作

**Create (创建)**:
- [插入单个文档](insert-one.md) - insertOne
- [批量插入文档](insert-many.md) - insertMany
- [大批量插入](insertBatch.md) - insertBatch
- [写入操作指南](write-operations.md) - 插入操作完整指南

**Read (读取)**:
- [查询多个文档](find.md) - find
- [查询单个文档](findOne.md) - findOne
- [分页查询](findPage.md) - findPage
- [统计文档数量](count.md) - count
- [去重查询](distinct.md) - distinct

**Update (更新)**:
- [更新操作指南](update-operations.md) - 更新操作完整指南
- [更新单个文档](update-one.md) - updateOne
- [批量更新文档](update-many.md) - updateMany
- [完整替换文档](replace-one.md) - replaceOne
- [查询并更新](find-one-and-update.md) - findOneAndUpdate
- [查询并替换](find-one-and-replace.md) - findOneAndReplace

**Delete (删除)**:
- [删除单个文档](delete-one.md) - deleteOne
- [批量删除文档](delete-many.md) - deleteMany
- [查询并删除](find-one-and-delete.md) - findOneAndDelete

### 高级查询

- [聚合管道查询](aggregate.md) - 聚合管道
- [查询计划分析](explain.md) - 查询计划
- [链式调用](chaining-api.md) - 链式调用

### 性能与缓存

- [缓存系统](cache.md) - 缓存系统
- [分页书签](bookmarks.md) - 分页优化

---

## 🧭 入口、示例与站点页面

| 文档 | 说明 |
|------|------|
| [文档目录索引](README.md) | docs 目录索引 |
| [文档站首页](index.md) | 文档站首页 |
| [API 参考索引](api-index.md) | 当前 API 参考索引 |
| [入门指南](getting-started.md) | 入门指南 |
| [示例索引](examples.md) | 示例索引 |
| [常见配方](recipes.md) | 常见配方 |
| [能力索引](capability-index.md) | 能力索引 |

---

## 🗂️ 管理、索引与表达式

| 文档 | 说明 |
|------|------|
| [管理 API](admin.md) | 管理 API |
| [数据库操作](database-ops.md) | 数据库操作 |
| [创建单个索引](create-index.md) | 创建单个索引 |
| [批量创建索引](create-indexes.md) | 批量创建索引 |
| [删除索引](drop-index.md) | 删除索引 |
| [列出索引](list-indexes.md) | 列出索引 |
| [查询并计数](find-and-count.md) | 查询并计数 |
| [表达式函数](expression-functions.md) | 表达式函数 |
| [快速 upsert](quick-upsert.md) | 快速 upsert |

---

## 🧩 运行时、部署与治理

| 文档 | 说明 |
|------|------|
| [运行时架构](runtime-architecture.md) | 运行时架构 |
| [支持矩阵](support-matrix.md) | 支持矩阵 |
| [路线图边界](roadmap-boundaries.md) | 路线图边界 |
| [文件依赖治理](file-dependency-governance.md) | 文件依赖治理 |
| [能力可追溯性](capability-traceability.md) | 能力可追溯性 |
| [发布前检查](release-preflight.md) | 发布前检查 |
| [验证入口](verification-entrypoints.md) | 验证入口 |
| [验证说明](validation.md) | 验证说明 |

---

## 🔎 ObjectId、缓存与排障

| 文档 | 说明 |
|------|------|
| [ObjectId 转换范围](objectid-conversion-scope.md) | ObjectId 转换范围 |
| [ObjectId 跨版本说明](objectid-cross-version.md) | ObjectId 跨版本说明 |
| [ObjectId 跨版本 FAQ](objectid-cross-version-faq.md) | ObjectId 跨版本 FAQ |
| [ObjectId 日志优化](objectid-logging-optimization.md) | ObjectId 日志优化 |
| [缓存与函数缓存对比](cache-and-function-cache.md) | 缓存与函数缓存对比 |
| [cache-hub 迁移](cache-hub-migration.md) | cache-hub 迁移 |
| [慢查询日志](slow-query-log.md) | 慢查询日志 |
| [故障恢复示例](failure-recovery-examples.md) | 故障恢复示例 |
| [多连接池健康检查](multi-pool-health-check.md) | 多连接池健康检查 |
| [分布式部署速查](distributed-deployment-quickref.md) | 分布式部署速查 |
| [Relations 快速开始](model/relations-quickstart.md) | Relations 快速开始 |

---

## 🚀 快速开始路径

**新用户推荐阅读顺序**:

1. [连接配置](connection.md) - 了解如何连接数据库
2. [查询多个文档](find.md) - 学习基础查询
3. [插入单个文档](insert-one.md) / [批量插入文档](insert-many.md) - 学习插入数据
4. [更新单个文档](update-one.md) / [批量更新文档](update-many.md) - 学习更新数据
5. [删除单个文档](delete-one.md) / [批量删除文档](delete-many.md) - 学习删除数据
6. [缓存系统](cache.md) - 了解缓存机制
7. [事务管理](transaction.md) - 学习事务管理
8. [分布式部署](distributed-deployment.md) - **多实例部署（生产环境必读）**

---

**文档总数**: 97 个
**索引覆盖**: 97/97（含当前索引页）
**最后更新**: 2026-06-10
**新增**: 
- ✨ [ES Module 支持](esm-support.md) - ES Module (import) 支持
- ✨ [findOneAnd 返回值](findOneAnd-return-value-unified.md) - 返回值统一说明
