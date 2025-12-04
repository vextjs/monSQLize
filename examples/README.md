# 示例文件目录

本目录包含 monSQLize 的所有可运行示例。

---

## 📚 示例分类

### 🔍 查询操作

| 示例文件 | 方法 | 说明 |
|---------|------|------|
| `find.examples.js` | `find()` | 批量查询、流式查询 |
| `findOne.examples.js` | `findOne()` | 单文档查询 |
| `findPage.examples.js` | `findPage()` | 游标分页查询 |
| `findByIds.examples.js` | `findByIds()` | 批量通过 _id 查询 |
| `findOneById.examples.js` | `findOneById()` | 通过 _id 查询单个文档 |
| `findAndCount.examples.js` | `findAndCount()` | 同时返回数据和总数 |
| `count.examples.js` | `count()` | 统计文档数量 |
| `distinct.examples.js` | `distinct()` | 去重查询 |
| `aggregate.examples.js` | `aggregate()` | 聚合管道查询 |

---

### ✏️ 写入操作

#### 插入操作
| 示例文件 | 方法 | 说明 |
|---------|------|------|
| `insertOne.examples.js` | `insertOne()` | 插入单个文档 |
| `insertMany.examples.js` | `insertMany()` | 批量插入文档 |
| `insertBatch.examples.js` | `insertBatch()` | 大批量插入（分批+重试）|

#### 更新操作
| 示例文件 | 方法 | 说明 |
|---------|------|------|
| `updateOne.examples.js` | `updateOne()` | 更新单个文档 |
| `updateMany.examples.js` | `updateMany()` | 批量更新文档 |
| `replace-and-atomic-ops.examples.js` | `replaceOne()`, `findOneAndUpdate()` 等 | 替换和原子操作 |
| `upsertOne.examples.js` | `upsertOne()` | 存在则更新，不存在则插入 |
| `incrementOne.examples.js` | `incrementOne()` | 原子递增/递减 |

#### 删除操作
| 示例文件 | 方法 | 说明 |
|---------|------|------|
| `delete-operations.examples.js` | `deleteOne()`, `deleteMany()`, `findOneAndDelete()` | 删除操作 |

---

### 🆕 扩展方法（v1.2.0 新增）

| 示例文件 | 方法 | 说明 |
|---------|------|------|
| **findOneOrCreate.examples.js** | `findOneOrCreate()` | 查询或创建（5 个场景）|
| **safeDelete.examples.js** | `safeDelete()` | 安全删除（5 个场景）|
| **updateOrInsert.examples.js** | `updateOrInsert()` | 深度合并更新（6 个场景）|
| **bulkUpsert.examples.js** | `bulkUpsert()` | 批量 upsert（6 个场景）|

**核心特性**:
- ✅ **findOneOrCreate**: 并发安全、自动重试、缓存优化（59 倍提升）
- ✅ **safeDelete**: 依赖检查、软删除、防止孤儿数据
- ✅ **updateOrInsert**: 深度合并、配置管理、保留未修改字段
- ✅ **bulkUpsert**: 批量处理、性能提升 8-41 倍、进度监控

**详细文档**:
- 📖 [findOneOrCreate.md](../docs/findOneOrCreate.md)
- 📖 [safeDelete.md](../docs/safeDelete.md)
- 📖 [updateOrInsert.md](../docs/updateOrInsert.md)
- 📖 [bulkUpsert.md](../docs/bulkUpsert.md)

---

### 🔗 高级功能

| 示例文件 | 功能 | 说明 |
|---------|------|------|
| `chaining.examples.js` | 链式调用 | find 链式调用 API |
| `bookmarks.examples.js` | 分页书签 | 深度分页书签管理 |
| `explain.examples.js` | 查询计划 | 查询执行计划分析 |
| `watch.examples.js` | Change Streams | 实时监听数据变更（v1.1.0）|

---

### 🛠️ 系统功能

| 示例文件 | 功能 | 说明 |
|---------|------|------|
| `transaction.examples.js` | 事务管理 | 自动/手动事务 |
| `transaction-optimizations.examples.js` | 事务优化 | 只读优化、文档级锁 |
| `multi-level-cache.examples.js` | 多级缓存 | LRU + TTL 缓存系统 |
| `distributed-deployment.examples.js` | 分布式部署 | 多实例缓存一致性 |
| `count-queue.examples.js` | Count 队列 | 高并发优化 |
| `admin.examples.js` | Admin 功能 | 运维管理、监控 |
| `indexes.examples.js` | 索引管理 | 创建、查询、删除索引 |
| `readPreference.examples.js` | 读偏好 | 读偏好设置 |
| `comment-parameter.examples.js` | 查询注释 | 日志追踪 |

---

## 🚀 运行示例

### 运行单个示例

```bash
# 查询操作示例
node examples/find.examples.js
node examples/findOne.examples.js
node examples/findPage.examples.js

# 扩展方法示例（v1.2.0）
node examples/findOneOrCreate.examples.js
node examples/safeDelete.examples.js
node examples/updateOrInsert.examples.js
node examples/bulkUpsert.examples.js

# 写入操作示例
node examples/insertOne.examples.js
node examples/updateOne.examples.js
node examples/delete-operations.examples.js

# 高级功能示例
node examples/transaction.examples.js
node examples/watch.examples.js
node examples/distributed-deployment.examples.js
```

---

### 运行所有示例

```bash
# 运行所有示例（按顺序）
for file in examples/*.examples.js; do
  echo "运行: $file"
  node "$file"
done
```

---

## 📖 示例特点

### ✅ 可直接运行
所有示例都是完整可运行的代码，包含：
- 数据库连接和初始化
- 完整的示例代码
- 结果输出和验证
- 资源清理

### ✅ 使用内存数据库
示例默认使用 MongoDB Memory Server，无需额外配置：
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'test_examples',
  config: { useMemoryServer: true }
});
```

### ✅ 真实场景
示例涵盖真实业务场景：
- OAuth 登录（findOneOrCreate）
- 用户删除保护（safeDelete）
- 用户配置管理（updateOrInsert）
- 数据批量同步（bulkUpsert）
- 转账事务（transaction）
- 实时监听（watch）
- 等等...

---

## 📚 相关文档

- 📖 [完整 API 文档](../docs/INDEX.md)
- 📖 [测试文件说明](../test/README.md)
- 📖 [项目 README](../README.md)

---

> **最后更新**: 2024-12-04  
> **示例总数**: 30+ 个  
> **v1.2.0 新增**: 4 个扩展方法示例（22 个场景）

