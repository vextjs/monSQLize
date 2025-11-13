# MongoDB 更新操作 API 文档

本文档汇总了 monSQLize 中所有更新操作的 API。

## 概览

monSQLize 提供了 5 个更新方法，涵盖部分更新、完整替换和原子操作：

| 方法 | 更新类型 | 原子性 | 返回值 | 使用场景 |
|------|---------|--------|--------|----------|
| **updateOne** | 部分更新 | ❌ | 计数 | 更新单个文档的部分字段 |
| **updateMany** | 部分更新 | ❌ | 计数 | 批量更新多个文档 |
| **replaceOne** | 完整替换 | ❌ | 计数 | 完整替换单个文档 |
| **findOneAndUpdate** | 部分更新 | ✅ | 文档 | 原子更新并返回文档 |
| **findOneAndReplace** | 完整替换 | ✅ | 文档 | 原子替换并返回文档 |

---

## 1. updateOne() - 更新单个文档

更新集合中第一个匹配的文档。

### 语法

```javascript
collection(collectionName).updateOne(filter, update, options)
```

### 快速示例

```javascript
// 更新用户状态
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active", updatedAt: new Date() } }
);

// 递增计数器
await collection("users").updateOne(
  { userId: "user123" },
  { $inc: { loginCount: 1 } }
);
```

### 关键特性

- ✅ 使用更新操作符（$set, $inc, $push 等）
- ✅ 只更新第一个匹配的文档
- ✅ 支持 upsert（不存在时插入）
- ✅ 自动缓存失效

### 详细文档

👉 **[完整 API 文档](./update-one.md)**

---

## 2. updateMany() - 批量更新文档

更新集合中所有匹配的文档。

### 语法

```javascript
collection(collectionName).updateMany(filter, update, options)
```

### 快速示例

```javascript
// 批量激活用户
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active", updatedAt: new Date() } }
);

// 批量递增浏览量
await collection("products").updateMany(
  {},
  { $inc: { views: 10 } }
);
```

### 关键特性

- ✅ 更新所有匹配的文档
- ✅ 支持数组过滤器（arrayFilters）
- ✅ 适合批量数据处理
- ✅ 自动缓存失效

### 详细文档

👉 **[完整 API 文档](./update-many.md)**

---

## 3. replaceOne() - 完整替换文档

完整替换集合中第一个匹配的文档（除了 _id）。

### 语法

```javascript
collection(collectionName).replaceOne(filter, replacement, options)
```

### 快速示例

```javascript
// 替换配置
await collection("configs").replaceOne(
  { configKey: "app-settings" },
  {
    configKey: "app-settings",
    theme: "dark",
    language: "en-US",
    version: 2
  }
);
```

### 关键特性

- ❌ 不能使用更新操作符
- ⚠️ 未指定的字段会被删除
- ✅ 保留 _id 字段
- ✅ 适合配置管理场景

### 详细文档

👉 **[完整 API 文档](./replace-one.md)**

---

## 4. findOneAndUpdate() - 原子查找并更新

原子地查找并更新单个文档，返回更新前或更新后的文档。

### 语法

```javascript
collection(collectionName).findOneAndUpdate(filter, update, options)
```

### 快速示例

```javascript
// 分布式计数器
const counter = await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } },
  { returnDocument: "after" }
);
console.log("New order number:", counter.value);

// 乐观锁
const doc = await collection("documents").findOneAndUpdate(
  { docId: "doc1", version: 5 },
  { $set: { content: "Updated" }, $inc: { version: 1 } },
  { returnDocument: "after" }
);
```

### 关键特性

- ✅ 原子操作（无竞态条件）
- ✅ 返回文档（before 或 after）
- ✅ 适合计数器、队列、乐观锁
- ✅ 支持排序和投影

### 详细文档

👉 **[完整 API 文档](./find-one-and-update.md)**

---

## 5. findOneAndReplace() - 原子查找并替换

原子地查找并完整替换单个文档，返回替换前或替换后的文档。

### 语法

```javascript
collection(collectionName).findOneAndReplace(filter, replacement, options)
```

### 快速示例

```javascript
// 原子替换配置
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "feature-flags" },
  {
    configKey: "feature-flags",
    featureA: true,
    featureB: false,
    version: 2
  }
);

// 保存旧配置到历史
if (oldConfig) {
  await collection("config_history").insertOne(oldConfig);
}
```

### 关键特性

- ✅ 原子操作
- ✅ 返回文档（before 或 after）
- ❌ 不能使用更新操作符
- ✅ 适合配置管理、版本控制

### 详细文档

👉 **[完整 API 文档](./find-one-and-replace.md)**

---

## 选择合适的方法

### 决策流程图

```
需要更新文档？
├─ 需要返回文档？
│  ├─ 是 → 需要原子操作？
│  │  ├─ 是 → 部分更新？
│  │  │  ├─ 是 → findOneAndUpdate()
│  │  │  └─ 否 → findOneAndReplace()
│  │  └─ 否 → findOne() + updateOne()
│  └─ 否 → 需要更新多个？
│     ├─ 是 → updateMany()
│     └─ 否 → 需要完整替换？
│        ├─ 是 → replaceOne()
│        └─ 否 → updateOne()
```

### 场景对照表

| 场景 | 推荐方法 | 原因 |
|------|---------|------|
| 更新用户状态 | updateOne | 简单部分更新 |
| 批量激活用户 | updateMany | 批量操作 |
| 替换配置文件 | replaceOne | 完整替换 |
| 分布式计数器 | findOneAndUpdate | 原子操作 + 返回值 |
| 任务队列 | findOneAndUpdate | 原子获取任务 |
| 乐观锁更新 | findOneAndUpdate | 版本控制 |
| 配置版本管理 | findOneAndReplace | 原子替换 + 保存历史 |
| 递增浏览量 | updateOne | 简单递增 |
| 批量数据迁移 | updateMany | 批量处理 |

---

## 通用特性

所有更新方法都支持以下特性：

### 1. 自动缓存失效

```javascript
// 查询并缓存
await collection("users").find({ userId: "user123" }, { cache: 5000 });

// 更新后自动清理缓存
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);
// 缓存已失效
```

### 2. 慢查询日志

```javascript
// 超过阈值自动记录日志
const msq = new MonSQLize({
  type: "mongodb",
  databaseName: "mydb",
  config: { slowQueryMs: 500 }
});

// 慢操作会自动记录
await collection("users").updateMany({...}, {...});
// 日志: [updateMany] 慢操作警告 { duration: 520, ... }
```

### 3. 操作注释

```javascript
// 添加注释便于追踪
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } },
  { comment: "用户激活 - 运营活动202511" }
);
```

### 4. upsert 支持

```javascript
// 不存在时插入
await collection("counters").updateOne(
  { counterName: "pageViews" },
  { $inc: { value: 1 } },
  { upsert: true }
);
```

### 5. 完整错误处理

```javascript
try {
  await collection("users").updateOne({...}, {...});
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    console.error("参数错误:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("唯一性约束冲突:", err.message);
  } else if (err.code === "WRITE_ERROR") {
    console.error("写入错误:", err.message);
  }
}
```

---

## 性能建议

### 1. 使用索引

```javascript
// ✅ 推荐 - 在筛选字段上建立索引
await collection("users").updateOne(
  { userId: "user123" }, // userId 应有索引
  { $set: { status: "active" } }
);
```

### 2. 批量优于循环

```javascript
// ❌ 不推荐
for (const userId of userIds) {
  await collection("users").updateOne({ userId }, { $set: { status: "active" } });
}

// ✅ 推荐
await collection("users").updateMany(
  { userId: { $in: userIds } },
  { $set: { status: "active" } }
);
```

### 3. 使用投影减少数据传输

```javascript
// findOneAndUpdate 使用投影
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { score: 10 } },
  {
    projection: { _id: 0, score: 1 },
    returnDocument: "after"
  }
);
```

---

## 示例代码

查看 `examples/` 目录获取完整示例：

- [updateOne.examples.js](../examples/updateOne.examples.js) - 10+ 个使用示例
- [updateMany.examples.js](../examples/updateMany.examples.js) - 批量操作示例
- [replace-and-atomic-ops.examples.js](../examples/replace-and-atomic-ops.examples.js) - 替换和原子操作示例

---

## 测试覆盖

所有更新方法都有完整的测试覆盖（172个测试用例）：

- ✅ 基本功能测试
- ✅ 参数验证测试
- ✅ 错误处理测试
- ✅ 缓存失效测试
- ✅ 边界用例测试
- ✅ 实际应用场景测试
- ✅ 并发安全测试

---

## 相关文档

- [CHANGELOG.md](../../CHANGELOG.md) - 版本变更记录
- [MongoDB 更新操作符文档](https://docs.mongodb.com/manual/reference/operator/update/)
- [MongoDB 原子操作文档](https://docs.mongodb.com/manual/core/write-operations-atomicity/)

---

**最后更新**: 2025-11-12  
**版本**: v1.0.0

