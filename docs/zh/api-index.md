# API 参考索引

本索引记录当前稳定的 MongoDB adapter API 与共享运行时能力。MySQL 与 PostgreSQL adapter API 会在 runtime、公开类型、示例与验证覆盖完成后再进入独立文档入口。

## 核心概念

| 文档 | 说明 |
|------|------|
| [原生 API 对比](mongodb-native-vs-extensions.md) | **MongoDB 原生 vs monSQLize 扩展功能对比** |
| [连接配置](connection.md) | 连接管理和配置 |
| [连接池配置](multi-pool.md) | 多连接池配置与运行时路由：在构造函数中声明 `pools: PoolConfig[]`，通过 `pool()` / `use()` 访问 |
| [链式池/库访问](pool-chain-api.md) | 链式池/库访问 API：`pool()` / `use()` / `scopedCollection()` / `scopedModel()` |
| [ObjectId 自动转换](objectid-auto-convert.md) | MongoDB 查询和写入路径的 ObjectId 自动转换 |
| [Model 层](model.md) | Model schema 校验、自定义方法、hooks、relations 与 runtime 绑定 |
| [Populate API](populate.md) | 加载 Model relations 声明的关联文档 |
| [Relations API](relations.md) | 定义 `hasOne` / `hasMany` / `belongsTo` 风格关系 |
| [Hooks API](hooks.md) | create、update、delete、find 流程的标准 Model 生命周期钩子 |
| [Relations 与 Populate](model/relations.md) | Model 关系定义与关联数据填充 |
| [嵌套 Populate](model/nested-populate.md) | 多层关系填充 |
| [SSH 隧道](ssh-tunnel.md) | **SSH隧道 - 安全连接内网数据库** |
| [错误码参考](error-codes.md) | **错误码参考 - 完整的错误码定义和处理指南** |
| [缓存系统](cache.md) | 缓存系统（LRU + TTL） |
| [事务管理](transaction.md) | 事务管理（自动重试、缓存锁） |
| [写路径策略](write-path-policy.md) | 可选的 Model-only 写入命名空间策略 |
| [Change Stream 同步](sync-backup.md) | ** Change Stream 数据同步 - 实时备份到多个数据库** |
| [事务优化策略](transaction-optimizations.md) | 事务优化策略 |
| [分布式部署](distributed-deployment.md) | 分布式部署指南（多实例缓存一致性） |
| [事件系统](events.md) | 事件系统 |

---

## 查询操作（Query Operations）

| 文档 | 方法 | 说明 |
|------|------|------|
| [查询多个文档](find.md) | `find()` | 查询多个文档 |
| [查询单个文档](findOne.md) | `findOne()` | 查询单个文档 |
| [按 id 查询辅助方法](find-one-by-id.md) | `findOneById()` | `_id` 查询的可选 reference helper；普通 `findOne({ _id })` 也支持 ObjectId 自动转换 |
| [按 ids 批量查询辅助方法](find-by-ids.md) | `findByIds()` | 多个 `_id` 查询的可选 reference helper；普通 `find({ _id: { $in } })` 也支持 ObjectId 自动转换 |
| [分页查询](findPage.md) | `findPage()` | 游标分页查询 |
| [统计文档数量](count.md) | `count()` | 统计文档数量 |
| [去重查询](distinct.md) | `distinct()` | 去重查询 |
| [监听数据变更](watch.md) | `watch()` | 实时监听数据变更（Change Streams） |

---

## 写入操作（Write Operations）

### 插入操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [插入单个文档](insert-one.md) | `insertOne()` | 插入单个文档 |
| [批量插入文档](insert-many.md) | `insertMany()` | 批量插入文档 |
| [大批量插入](insertBatch.md) | `insertBatch()` | 大批量插入（分批+重试） |
| [写入操作指南](write-operations.md) | 所有插入方法 | 插入操作完整指南 |

### 更新操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [更新操作指南](update-operations.md) | 所有更新方法 | 更新操作完整指南 |
| [Upsert 操作指南](upsert-guide.md) | Upsert 操作指南 | 不存在就插入，存在则更新 |
| [更新单个文档](update-one.md) | `updateOne()` | 更新单个文档 |
| [批量更新文档](update-many.md) | `updateMany()` | 批量更新文档 |
| [Update 聚合管道](update-aggregation.md) | ** Update 聚合管道 - 字段间计算、条件赋值** |
| [大批量更新](updateBatch.md) | `updateBatch()` | 大批量更新（分批+重试） |
| [完整替换文档](replace-one.md) | `replaceOne()` | 完整替换文档 |
| [查询并更新](find-one-and-update.md) | `findOneAndUpdate()` | 原子更新并返回 |
| [查询并替换](find-one-and-replace.md) | `findOneAndReplace()` | 原子替换并返回 |

### 便利方法（Convenience Methods）

| 文档 | 方法 | 说明 |
|------|------|------|
| [Upsert 单个文档](upsert-one.md) | `upsertOne()` | 存在则更新，不存在则插入 |
| [递增/递减字段](increment-one.md) | `incrementOne()` | 原子递增/递减字段值 |

### 删除操作

| 文档 | 方法 | 说明 |
|------|------|------|
| [删除单个文档](delete-one.md) | `deleteOne()` | 删除单个文档 |
| [批量删除文档](delete-many.md) | `deleteMany()` | 批量删除文档 |
| [大批量删除](deleteBatch.md) | `deleteBatch()` | 大批量删除（分批+重试） |
| [查询并删除](find-one-and-delete.md) | `findOneAndDelete()` | 原子删除并返回 |

---

## 聚合操作（Aggregation Operations）

| 文档 | 方法 | 说明 |
|------|------|------|
| [聚合管道查询](aggregate.md) | `aggregate()` | 聚合管道查询 |

---

## 高级功能

| 文档 | 说明 |
|------|------|
| [链式调用 API](chaining-api.md) | 链式调用 API |
| [链式调用方法详解](chaining-methods.md) | 链式调用方法详解 |
| [查询计划分析](explain.md) | 查询计划分析 |
| [分页书签管理](bookmarks.md) | 分页书签管理 |

---

## 工具与配置

| 文档 | 说明 |
|------|------|
| [工具函数](utilities.md) | 工具函数 |
| [集合管理](collection-management.md) | 集合管理 |
| [读偏好设置](readPreference.md) | 读偏好设置 |
| [Count 队列控制](count-queue.md) | Count 队列控制 |
| [写路径策略](write-path-policy.md) | 配置写操作可走 collection API，或必须经过 Model API |
| [分布式部署配置](distributed-deployment.md) | **分布式部署配置** |

---

## 兼容性与测试

| 文档 | 说明 |
|------|------|
| [MongoDB Driver 兼容性](mongodb-driver-compatibility.md) | Driver 版本兼容性详解 |
| [findOneAnd 返回值](findOneAnd-return-value-unified.md) | findOneAnd* 返回值统一说明 |

| [ES Module 支持](esm-support.md) | ES Module (import) 支持 |

---


## 按功能分类

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

## 入口、示例与站点页面

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

## 管理、索引与表达式

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

## 运行时、部署与治理

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

## ObjectId、缓存与排障

| 文档 | 说明 |
|------|------|
| [ObjectId 转换范围](objectid-conversion-scope.md) | ObjectId 转换范围 |
| [ObjectId 跨版本说明](objectid-cross-version.md) | ObjectId 跨版本说明 |
| [ObjectId 跨版本 FAQ](objectid-cross-version-faq.md) | ObjectId 跨版本 FAQ |
| [ObjectId 日志优化](objectid-logging-optimization.md) | ObjectId 日志优化 |
| [缓存 API 概览](cache-and-function-cache.md) | 当前数据库 runtime 缓存入口与 legacy 函数缓存边界 |
| [cache-hub 迁移](cache-hub-migration.md) | cache-hub 迁移 |
| [慢查询日志](slow-query-log.md) | 慢查询日志 |
| [故障恢复示例](failure-recovery-examples.md) | 故障恢复示例 |
| [多连接池健康检查](multi-pool-health-check.md) | 多连接池健康检查 |
| [分布式部署速查](distributed-deployment-quickref.md) | 分布式部署速查 |
| [Relations 快速开始](model/relations-quickstart.md) | Relations 快速开始 |

---

## 快速开始路径

**新用户推荐阅读顺序**:

1. [连接配置](connection.md) - 了解如何连接数据库
2. [查询多个文档](find.md) - 学习基础查询
3. [插入单个文档](insert-one.md) / [批量插入文档](insert-many.md) - 学习插入数据
4. [更新单个文档](update-one.md) / [批量更新文档](update-many.md) - 学习更新数据
5. [删除单个文档](delete-one.md) / [批量删除文档](delete-many.md) - 学习删除数据
6. [缓存系统](cache.md) - 了解缓存机制
7. [事务管理](transaction.md) - 学习事务管理
8. [分布式部署](distributed-deployment.md) - 多实例部署说明
