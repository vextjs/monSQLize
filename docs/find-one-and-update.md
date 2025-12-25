# findOneAndUpdate() - 原子查找并更新

## 📑 目录

- [语法](#语法)
- [参数](#参数)
- [返回值](#返回值)
- [核心特性](#核心特性)
- [常见场景](#常见场景)
- [示例](#示例)
- [性能优化](#性能优化)
- [错误处理](#错误处理)
- [与其他方法的对比](#与其他方法的对比)
- [并发安全](#并发安全)
- [最佳实践](#最佳实践)
- [相关方法](#相关方法)
- [参考资料](#参考资料)

---

原子地查找并更新单个文档，返回更新前或更新后的文档。这是一个原子操作，适合需要读取旧值同时更新的场景。

## 语法

```javascript
collection(collectionName).findOneAndUpdate(filter, update, options)
```

## 参数

### filter (Object, 必需)
筛选条件。

### update (Object, 必需)
更新操作，必须使用更新操作符。

### options (Object, 可选)

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `projection` | Object | - | 字段投影 |
| `sort` | Object | - | 排序条件 |
| `upsert` | Boolean | false | 不存在时是否插入 |
| `returnDocument` | String | "before" | "before" 或 "after" |
| `maxTimeMS` | Number | - | 最大执行时间 |
| `comment` | String | - | 操作注释 |
| `collation` | Object | - | 排序规则 |
| `arrayFilters` | Array | - | 数组过滤器 |
| `hint` | String/Object | - | 索引提示 |
| `includeResultMetadata` | Boolean | false | 是否包含完整元数据 |

## 返回值

默认返回**文档对象**或 **null**（未找到）。

如果 `includeResultMetadata: true`，返回：
```javascript
{
  value: <文档或null>,
  ok: 1,
  lastErrorObject: {
    updatedExisting: true,
    n: 1,
    upserted: <id>  // 仅 upsert 时
  }
}
```

> **⚠️ 重要提示 - MongoDB 驱动 6.x 兼容性**
> 
> monSQLize 使用 MongoDB Node.js 驱动 6.x，该版本对 `findOneAndUpdate` 的返回值格式进行了重要变更：
> 
> **驱动 6.x (当前版本)**:
> - 默认直接返回文档对象
> - 需要显式设置 `includeResultMetadata: true` 才返回完整元数据
> 
> **驱动 5.x 及更早版本**:
> - 默认返回完整元数据 `{ value, ok, lastErrorObject }`
> 
> **✅ monSQLize 的处理**:
> - 已在内部自动处理此差异，用户无需关心驱动版本
> - API 行为保持一致，向后兼容
> - 详见技术分析报告: `analysis-reports/2025-11-17-mongodb-driver-6x-compatibility.md`

## 核心特性

### 原子性保证

```javascript
// ✅ 原子操作 - 查找和更新在同一事务中
const oldDoc = await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } }
);

// ❌ 非原子 - 有竞态条件风险
const doc = await collection("counters").findOne({ counterName: "orderNumber" });
await collection("counters").updateOne(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } }
);
```

### returnDocument 选项

```javascript
// 返回更新前的文档（默认）
const oldDoc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { loginCount: 1 } }
);
console.log("Old count:", oldDoc.loginCount); // 5

// 返回更新后的文档
const newDoc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { loginCount: 1 } },
  { returnDocument: "after" }
);
console.log("New count:", newDoc.loginCount); // 6
```

## 常见场景

### 场景 1: 分布式计数器

```javascript
// 原子递增并获取新值
const counter = await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } },
  { returnDocument: "after" }
);

const newOrderNumber = counter.value; // 1001
console.log(`New order number: ${newOrderNumber}`);
```

### 场景 2: 乐观锁（版本控制）

```javascript
// 使用版本号防止并发冲突
const doc = await collection("documents").findOneAndUpdate(
  {
    docId: "doc1",
    version: 5  // 仅当版本号匹配时更新
  },
  {
    $set: { content: "Updated content" },
    $inc: { version: 1 }
  },
  { returnDocument: "after" }
);

if (!doc) {
  console.log("更新失败：版本冲突");
} else {
  console.log("更新成功，新版本:", doc.version);
}
```

### 场景 3: 任务队列

```javascript
// 原子地获取并标记任务
const task = await collection("tasks").findOneAndUpdate(
  { status: "pending" },
  {
    $set: {
      status: "processing",
      workerId: "worker-1",
      startedAt: new Date()
    }
  },
  {
    sort: { priority: -1 },  // 优先级最高的
    returnDocument: "after"
  }
);

if (task) {
  console.log("Processing task:", task.taskId);
  // 处理任务...
} else {
  console.log("No pending tasks");
}
```

### 场景 4: 分布式锁

```javascript
// 获取锁
const lock = await collection("locks").findOneAndUpdate(
  {
    lockKey: "resource-lock",
    locked: false
  },
  {
    $set: {
      locked: true,
      ownerId: "worker-1",
      acquiredAt: new Date()
    }
  },
  { returnDocument: "after" }
);

if (lock) {
  try {
    // 执行需要锁保护的操作...
    console.log("Lock acquired");
  } finally {
    // 释放锁
    await collection("locks").updateOne(
      { lockKey: "resource-lock" },
      { $set: { locked: false } }
    );
  }
} else {
  console.log("Lock already held");
}
```

### 场景 5: 用户最后活动时间

```javascript
// 更新活动时间并返回用户信息
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastActiveAt: new Date() },
    $inc: { pageViews: 1 }
  },
  {
    projection: { name: 1, email: 1, lastActiveAt: 1 },
    returnDocument: "after"
  }
);

console.log(`Welcome back, ${user.name}!`);
```

## 示例

### 基本用法

```javascript
const oldDoc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { status: "active" } }
);

if (oldDoc) {
  console.log("Old status:", oldDoc.status);
} else {
  console.log("User not found");
}
```

### 使用排序

```javascript
// 找到分数最高的用户并更新
const topUser = await collection("users").findOneAndUpdate(
  { status: "active" },
  { $set: { winner: true } },
  {
    sort: { score: -1 },
    returnDocument: "after"
  }
);
```

### 使用投影

```javascript
// 只返回需要的字段
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { loginCount: 1 } },
  {
    projection: { name: 1, loginCount: 1 },
    returnDocument: "after"
  }
);
// user 只包含 _id, name, loginCount
```

### 使用 upsert

```javascript
const counter = await collection("counters").findOneAndUpdate(
  { counterName: "pageViews" },
  { $inc: { value: 1 } },
  {
    upsert: true,
    returnDocument: "after"
  }
);
// 如果不存在会创建新文档
```

### 获取完整元数据

```javascript
const result = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { status: "active" } },
  { includeResultMetadata: true }
);

console.log("Document:", result.value);
console.log("Updated existing:", result.lastErrorObject.updatedExisting);
console.log("Operation ok:", result.ok);
```

## 性能优化

### 1. 使用索引

```javascript
// ✅ 推荐 - 在筛选字段上建立索引
await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" }, // counterName 应有索引
  { $inc: { value: 1 } }
);
```

### 2. 使用投影减少数据传输

```javascript
// ✅ 推荐 - 只返回需要的字段
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { score: 10 } },
  {
    projection: { _id: 0, score: 1 },
    returnDocument: "after"
  }
);
```

### 3. 配合 sort 和 hint 优化查询

```javascript
const task = await collection("tasks").findOneAndUpdate(
  { status: "pending" },
  { $set: { status: "processing" } },
  {
    sort: { priority: -1, createdAt: 1 },
    hint: "status_priority_createdAt_idx", // 使用复合索引
    returnDocument: "after"
  }
);
```

## 错误处理

```javascript
try {
  const doc = await collection("users").findOneAndUpdate(
    { userId: "user123" },
    { $inc: { score: 10 } }
  );

  if (!doc) {
    console.log("Document not found");
  }
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    console.error("参数错误:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("唯一性约束冲突:", err.message);
  } else {
    console.error("操作失败:", err);
  }
}
```

## 与其他方法的对比

| 方法 | 原子性 | 返回值 | 场景 |
|------|--------|--------|------|
| `updateOne` | ❌ | 计数 | 普通更新 |
| `findOneAndUpdate` | ✅ | 文档 | 需要旧值/原子操作 |
| `findOne` + `updateOne` | ❌ | 文档+计数 | ⚠️ 有竞态风险 |

## 并发安全

### 安全示例

```javascript
// ✅ 安全 - 原子操作
for (let i = 0; i < 10; i++) {
  await collection("counters").findOneAndUpdate(
    { name: "total" },
    { $inc: { value: 1 } }
  );
}
// 最终 value = 10（正确）

// ❌ 不安全 - 非原子操作
for (let i = 0; i < 10; i++) {
  const doc = await collection("counters").findOne({ name: "total" });
  await collection("counters").updateOne(
    { name: "total" },
    { $set: { value: doc.value + 1 } }
  );
}
// 最终 value 可能 < 10（错误，有竞态条件）
```

## 最佳实践

### 1. 合理选择 returnDocument

```javascript
// 需要旧值时
const oldValue = await collection("counters").findOneAndUpdate(
  { name: "counter" },
  { $inc: { value: 1 } }
  // returnDocument: "before" 是默认值
);

// 需要新值时
const newValue = await collection("counters").findOneAndUpdate(
  { name: "counter" },
  { $inc: { value: 1 } },
  { returnDocument: "after" }
);
```

### 2. 使用版本号避免冲突

```javascript
async function updateWithRetry(docId, newContent, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const doc = await collection("documents").findOne({ docId });

    const result = await collection("documents").findOneAndUpdate(
      { docId, version: doc.version },
      {
        $set: { content: newContent },
        $inc: { version: 1 }
      },
      { returnDocument: "after" }
    );

    if (result) return result;

    console.log(`Retry ${i + 1}: version conflict`);
  }

  throw new Error("Update failed after retries");
}
```

### 3. 使用 projection 优化性能

```javascript
// ✅ 推荐
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { score: 10 } },
  {
    projection: { score: 1 },
    returnDocument: "after"
  }
);
```

## 相关方法

- [`findOneAndReplace()`](./find-one-and-replace.md) - 原子地查找并替换
- [`updateOne()`](./update-one.md) - 更新单个文档
- [`findOne()`](./find-one.md) - 查找单个文档

## 参考资料

- [MongoDB findOneAndUpdate 文档](https://docs.mongodb.com/manual/reference/method/db.collection.findOneAndUpdate/)

