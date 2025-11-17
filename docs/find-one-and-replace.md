# findOneAndReplace() - 原子查找并替换

原子地查找并完整替换单个文档，返回替换前或替换后的文档。

## 语法

```javascript
collection(collectionName).findOneAndReplace(filter, replacement, options)
```

## 参数

### filter (Object, 必需)
筛选条件。

### replacement (Object, 必需)
替换文档，**不能包含更新操作符**。

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
> monSQLize 使用 MongoDB Node.js 驱动 6.x，该版本对 `findOneAndReplace` 的返回值格式进行了重要变更：
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
// ✅ 原子操作 - 查找和替换在同一事务中
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "app-settings" },
  newConfig
);

// ❌ 非原子 - 有竞态条件风险
const config = await collection("configs").findOne({ configKey: "app-settings" });
await collection("configs").replaceOne({ configKey: "app-settings" }, newConfig);
```

### 与 findOneAndUpdate 的区别

| 特性 | findOneAndReplace | findOneAndUpdate |
|------|------------------|------------------|
| **操作符** | ❌ 不能用 $ | ✅ 必须用 $ |
| **字段处理** | 删除未指定字段 | 保留未指定字段 |
| **使用场景** | 完整替换 | 部分更新 |

```javascript
// 原文档
{ _id: 1, userId: "user1", name: "Alice", email: "alice@example.com", role: "admin" }

// findOneAndUpdate - 部分更新
const doc1 = await collection("users").findOneAndUpdate(
  { userId: "user1" },
  { $set: { name: "Alice Updated" } }
);
// 结果: email 和 role 保留 ✅

// findOneAndReplace - 完整替换
const doc2 = await collection("users").findOneAndReplace(
  { userId: "user1" },
  { userId: "user1", name: "Alice Updated" }
);
// 结果: email 和 role 被删除 ⚠️
```

## 常见场景

### 场景 1: 配置原子替换

```javascript
// 原子地替换配置并返回旧配置
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "feature-flags" },
  {
    configKey: "feature-flags",
    featureA: true,
    featureB: false,
    featureC: true,
    version: 2,
    updatedAt: new Date()
  }
);

if (oldConfig) {
  console.log("Previous version:", oldConfig.version);
  // 可以保存到历史记录
  await collection("config_history").insertOne({
    ...oldConfig,
    archivedAt: new Date()
  });
}
```

### 场景 2: 版本管理

```javascript
// 获取旧版本并创建新版本
const oldDoc = await collection("documents").findOneAndReplace(
  { docId: "doc1" },
  {
    docId: "doc1",
    content: "Version 2 content",
    version: 2,
    author: "Bob",
    createdAt: new Date()
  }
);

if (oldDoc) {
  // 保存旧版本到历史
  await collection("document_history").insertOne({
    ...oldDoc,
    archivedAt: new Date()
  });
}
```

### 场景 3: 状态机转换

```javascript
// 原子地获取任务并完整切换状态
const task = await collection("tasks").findOneAndReplace(
  {
    taskId: "task1",
    status: "pending"
  },
  {
    taskId: "task1",
    status: "completed",
    result: "success",
    completedBy: "worker-1",
    completedAt: new Date(),
    metrics: {
      duration: 120,
      retries: 0
    }
  },
  { returnDocument: "after" }
);

if (task) {
  console.log("Task completed:", task.taskId);
} else {
  console.log("Task not found or already completed");
}
```

### 场景 4: 分布式锁配置

```javascript
// 原子地获取锁配置
const lockConfig = await collection("locks").findOneAndReplace(
  {
    lockKey: "resource-lock",
    available: true
  },
  {
    lockKey: "resource-lock",
    available: false,
    ownerId: "worker-1",
    acquiredAt: new Date(),
    expiresAt: new Date(Date.now() + 60000)
  },
  { returnDocument: "after" }
);

if (lockConfig) {
  try {
    // 执行需要锁保护的操作
    console.log("Lock acquired");
  } finally {
    // 释放锁
    await collection("locks").replaceOne(
      { lockKey: "resource-lock" },
      {
        lockKey: "resource-lock",
        available: true
      }
    );
  }
}
```

## 示例

### 基本用法

```javascript
const oldDoc = await collection("settings").findOneAndReplace(
  { settingKey: "app-theme" },
  {
    settingKey: "app-theme",
    value: "dark",
    updatedAt: new Date()
  }
);

if (oldDoc) {
  console.log("Old theme:", oldDoc.value);
}
```

### 返回替换后的文档

```javascript
const newDoc = await collection("configs").findOneAndReplace(
  { configKey: "limits" },
  {
    configKey: "limits",
    maxUsers: 2000,
    maxStorage: "20GB",
    version: 2
  },
  { returnDocument: "after" }
);

console.log("New version:", newDoc.version);
```

### 使用排序

```javascript
// 找到优先级最高的配置并替换
const config = await collection("configs").findOneAndReplace(
  { type: "feature" },
  newConfig,
  {
    sort: { priority: -1 },
    returnDocument: "after"
  }
);
```

### 使用投影

```javascript
const doc = await collection("documents").findOneAndReplace(
  { docId: "doc1" },
  newDocument,
  {
    projection: { _id: 0, title: 1, version: 1 }
  }
);
// 只返回 title 和 version 字段
```

### 使用 upsert

```javascript
const config = await collection("configs").findOneAndReplace(
  { configKey: "new-config" },
  {
    configKey: "new-config",
    value: "default",
    createdAt: new Date()
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
// 如果不存在会插入新文档
```

## 错误处理

```javascript
try {
  const doc = await collection("configs").findOneAndReplace(
    { configKey: "app-settings" },
    newConfig
  );

  if (!doc) {
    console.log("Config not found");
  }
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    // 可能原因: replacement 包含 $ 操作符
    console.error("参数错误:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("唯一性约束冲突:", err.message);
  } else {
    console.error("操作失败:", err);
  }
}
```

## 常见错误

### 错误 1: 使用更新操作符

```javascript
// ❌ 错误 - 不能使用 $ 操作符
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  { $set: { value: "test" } }
);
// 抛出: INVALID_ARGUMENT

// ✅ 正确 - 提供完整文档
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  { configKey: "app", value: "test" }
);
```

### 错误 2: 忘记字段会被删除

```javascript
// 原文档
{ _id: 1, configKey: "app", theme: "light", lang: "zh", notifications: true }

// ❌ 危险 - lang 和 notifications 会丢失
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  { configKey: "app", theme: "dark" }
);
// 结果: { _id: 1, configKey: "app", theme: "dark" }

// ✅ 正确 - 提供完整文档
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  {
    configKey: "app",
    theme: "dark",
    lang: "zh",
    notifications: true
  }
);
```

## 性能建议

### 1. 使用索引

```javascript
// ✅ 推荐 - 在筛选字段上建立索引
await collection("configs").findOneAndReplace(
  { configKey: "app-settings" }, // configKey 应有唯一索引
  newConfig
);
```

### 2. 使用投影减少数据传输

```javascript
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "app-settings" },
  newConfig,
  {
    projection: { _id: 0, version: 1, updatedAt: 1 }
  }
);
// 只返回需要的字段
```

## 并发安全

### 安全示例

```javascript
// ✅ 安全 - 原子操作，多个并发请求只有一个成功
const results = await Promise.all([
  collection("locks").findOneAndReplace(
    { lockKey: "lock1", available: true },
    { lockKey: "lock1", available: false, owner: "w1" }
  ),
  collection("locks").findOneAndReplace(
    { lockKey: "lock1", available: true },
    { lockKey: "lock1", available: false, owner: "w2" }
  )
]);

// 只有一个返回文档，另一个返回 null
const winner = results.find(r => r !== null);
console.log("Lock acquired by:", winner?.owner);
```

## 最佳实践

### 1. 保存历史版本

```javascript
async function replaceWithHistory(filter, replacement) {
  const oldDoc = await collection("documents").findOneAndReplace(
    filter,
    replacement
  );

  if (oldDoc) {
    // 保存到历史集合
    await collection("documents_history").insertOne({
      ...oldDoc,
      archivedAt: new Date()
    });
  }

  return oldDoc;
}
```

### 2. 使用版本号

```javascript
const oldConfig = await collection("configs").findOneAndReplace(
  {
    configKey: "app-settings",
    version: 1  // 确保版本匹配
  },
  {
    configKey: "app-settings",
    value: "new value",
    version: 2
  }
);

if (!oldConfig) {
  console.log("Version mismatch or not found");
}
```

### 3. 验证结果

```javascript
const result = await collection("configs").findOneAndReplace(
  { configKey: "app-settings" },
  newConfig,
  { returnDocument: "after" }
);

if (!result) {
  console.log("Config not found, consider upsert");
} else {
  console.log("Config replaced successfully");
}
```

## 何时使用

### ✅ 适合使用 findOneAndReplace

1. **需要旧值** - 替换前需要查看原文档
2. **原子操作** - 防止竞态条件
3. **配置管理** - 完整替换配置
4. **状态机** - 完整状态切换

### ❌ 不适合使用 findOneAndReplace

1. **部分更新** - 使用 `findOneAndUpdate`
2. **不需要旧值** - 使用 `replaceOne`
3. **保留字段** - 使用 `findOneAndUpdate`

## 相关方法

- [`findOneAndUpdate()`](./find-one-and-update.md) - 原子地查找并部分更新
- [`replaceOne()`](./replace-one.md) - 完整替换单个文档
- [`findOne()`](./find-one.md) - 查找单个文档

## 参考资料

- [MongoDB findOneAndReplace 文档](https://docs.mongodb.com/manual/reference/method/db.collection.findOneAndReplace/)

