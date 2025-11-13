# replaceOne() - 完整替换文档

完整替换集合中第一个匹配筛选条件的文档。**注意**: 这会替换整个文档（除了 _id），未在新文档中的字段将被删除。

## 语法

```javascript
collection(collectionName).replaceOne(filter, replacement, options)
```

## 参数

### filter (Object, 必需)
筛选条件，用于匹配要替换的文档。

```javascript
{ userId: "user123" }
{ configKey: "app-settings" }
```

### replacement (Object, 必需)
替换文档，**不能包含更新操作符**（如 `$set`）。

```javascript
{
  userId: "user123",
  name: "Alice",
  age: 26,
  status: "active"
}
```

**重要**: 
- ❌ 不能使用 `$set`, `$inc` 等操作符
- ✅ 直接提供完整的新文档对象
- `_id` 字段会自动保留

### options (Object, 可选)

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `upsert` | Boolean | false | 不存在时是否插入新文档 |
| `writeConcern` | Object | - | 写关注选项 |
| `bypassDocumentValidation` | Boolean | false | 是否绕过文档验证 |
| `comment` | String | - | 操作注释 |
| `collation` | Object | - | 排序规则 |
| `hint` | String/Object | - | 索引提示 |

## 返回值

返回 `Promise<ReplaceResult>`:

```javascript
{
  acknowledged: true,
  matchedCount: 1,
  modifiedCount: 1,
  upsertedId: null,
  upsertedCount: 0
}
```

## 与 updateOne 的关键区别

| 特性 | replaceOne | updateOne |
|------|------------|-----------|
| **操作符** | ❌ 不能使用 $ | ✅ 必须使用 $ |
| **字段处理** | 删除未指定字段 | 保留未指定字段 |
| **使用场景** | 完整替换 | 部分更新 |
| **_id 处理** | 保留 | 保留 |

### 行为对比示例

```javascript
// 原始文档
{ _id: 1, userId: "user1", name: "Alice", age: 25, status: "active", tags: ["premium"] }

// updateOne - 仅更新指定字段
await collection("users").updateOne(
  { userId: "user1" },
  { $set: { age: 26 } }
);
// 结果: { _id: 1, userId: "user1", name: "Alice", age: 26, status: "active", tags: ["premium"] }
// 其他字段保留 ✅

// replaceOne - 完整替换
await collection("users").replaceOne(
  { userId: "user1" },
  { userId: "user1", name: "Alice", age: 26 }
);
// 结果: { _id: 1, userId: "user1", name: "Alice", age: 26 }
// status 和 tags 被删除 ⚠️
```

## 示例

### 基本替换

```javascript
const result = await collection("users").replaceOne(
  { userId: "user123" },
  {
    userId: "user123",
    name: "Alice Updated",
    age: 26,
    email: "alice@example.com"
  }
);

console.log("Replaced:", result.modifiedCount);
```

### 配置管理场景

```javascript
// 替换应用配置（常见场景）
await collection("configs").replaceOne(
  { configKey: "app-settings" },
  {
    configKey: "app-settings",
    theme: "dark",
    language: "en-US",
    notifications: true,
    version: 2
  }
);
```

### 使用 upsert

```javascript
// 如果不存在则插入
const result = await collection("settings").replaceOne(
  { settingKey: "feature-flags" },
  {
    settingKey: "feature-flags",
    featureA: true,
    featureB: false,
    updatedAt: new Date()
  },
  { upsert: true }
);

if (result.upsertedId) {
  console.log("Inserted new document");
} else {
  console.log("Replaced existing document");
}
```

### 保留 _id 的替换

```javascript
// 获取原文档的 _id
const original = await collection("users").findOne({ userId: "user123" });

// 替换时保持相同的 _id
await collection("users").replaceOne(
  { _id: original._id },
  {
    _id: original._id, // 明确指定 _id（可选，会自动保留）
    userId: "user123",
    name: "New Name",
    status: "active"
  }
);
```

### 自定义 _id 的替换

```javascript
const customId = "custom-id-123";

await collection("documents").replaceOne(
  { _id: customId },
  {
    _id: customId,
    title: "Document Title",
    content: "Document content",
    version: 2
  }
);
```

### 替换为空文档（清除所有字段）

```javascript
// 删除所有字段（除了 _id）
await collection("temp").replaceOne(
  { userId: "user123" },
  {} // 空对象
);
// 结果: { _id: <original-id> }
```

### 嵌套对象替换

```javascript
await collection("users").replaceOne(
  { userId: "user123" },
  {
    userId: "user123",
    profile: {
      name: "Alice",
      address: {
        city: "Shanghai",
        country: "China"
      },
      preferences: {
        theme: "dark",
        language: "zh-CN"
      }
    },
    tags: ["premium", "verified"]
  }
);
```

## 常见场景

### 场景 1: 配置文件管理

```javascript
// 更新应用配置
const newConfig = {
  configKey: "app-config",
  version: 2,
  features: {
    darkMode: true,
    notifications: true,
    betaFeatures: false
  },
  limits: {
    maxUsers: 1000,
    maxStorage: "10GB"
  },
  updatedAt: new Date()
};

await collection("configs").replaceOne(
  { configKey: "app-config" },
  newConfig,
  { upsert: true }
);
```

### 场景 2: 文档版本管理

```javascript
// 保存旧版本到历史
const oldDoc = await collection("documents").findOne({ docId: "doc1" });
await collection("document_history").insertOne({
  ...oldDoc,
  archivedAt: new Date()
});

// 替换为新版本
await collection("documents").replaceOne(
  { docId: "doc1" },
  {
    docId: "doc1",
    content: "New content",
    version: oldDoc.version + 1,
    author: "Bob",
    updatedAt: new Date()
  }
);
```

### 场景 3: 状态机完整切换

```javascript
// 任务状态完整切换
await collection("tasks").replaceOne(
  { taskId: "task1", status: "pending" },
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
  }
);
```

### 场景 4: 清理并重建文档

```javascript
// 清理旧数据并重建
const userId = "user123";
await collection("users").replaceOne(
  { userId },
  {
    userId,
    name: "Fresh User",
    createdAt: new Date(),
    // 所有旧字段被删除，从头开始
  }
);
```

## 错误处理

```javascript
try {
  await collection("users").replaceOne(
    { userId: "user123" },
    {
      userId: "user123",
      name: "Alice"
    }
  );
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    // 可能原因: replacement 包含 $ 操作符
    console.error("参数错误:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("唯一性约束冲突:", err.message);
  } else if (err.code === "WRITE_ERROR") {
    console.error("写入错误:", err.message);
  }
}
```

## 常见错误

### 错误 1: 使用更新操作符

```javascript
// ❌ 错误 - replaceOne 不能使用 $ 操作符
await collection("users").replaceOne(
  { userId: "user123" },
  { $set: { name: "Alice" } }
);
// 抛出: INVALID_ARGUMENT - replacement 不能包含更新操作符

// ✅ 正确 - 提供完整文档
await collection("users").replaceOne(
  { userId: "user123" },
  { userId: "user123", name: "Alice" }
);

// 💡 如果需要部分更新，使用 updateOne
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { name: "Alice" } }
);
```

### 错误 2: 未意识到字段会被删除

```javascript
// 原文档
{ _id: 1, userId: "user1", name: "Alice", email: "alice@example.com", role: "admin" }

// ❌ 危险 - email 和 role 会丢失
await collection("users").replaceOne(
  { userId: "user1" },
  { userId: "user1", name: "Alice Updated" }
);
// 结果: { _id: 1, userId: "user1", name: "Alice Updated" }
// email 和 role 被删除 ⚠️

// ✅ 正确 - 如果要保留字段，先查询完整文档
const doc = await collection("users").findOne({ userId: "user1" });
await collection("users").replaceOne(
  { userId: "user1" },
  {
    ...doc,
    name: "Alice Updated" // 只改这个字段
  }
);

// 💡 更推荐 - 使用 updateOne 进行部分更新
await collection("users").updateOne(
  { userId: "user1" },
  { $set: { name: "Alice Updated" } }
);
```

## 性能建议

### 1. 使用索引字段筛选

```javascript
// ✅ 推荐 - 使用索引字段
await collection("users").replaceOne(
  { userId: "user123" }, // userId 有索引
  newDocument
);

// ❌ 避免 - 使用非索引字段
await collection("users").replaceOne(
  { email: "alice@example.com" }, // email 可能没有索引
  newDocument
);
```

### 2. 配合 findOne 使用时注意性能

```javascript
// ❌ 不推荐 - 两次查询
const doc = await collection("users").findOne({ userId: "user123" });
await collection("users").replaceOne(
  { userId: "user123" },
  { ...doc, name: "Updated" }
);

// ✅ 推荐 - 使用 findOneAndReplace 原子操作
const oldDoc = await collection("users").findOneAndReplace(
  { userId: "user123" },
  newDocument,
  { returnDocument: "before" }
);
```

## 缓存行为

`replaceOne` 在成功修改文档后会**自动失效相关缓存**：

```javascript
// 查询并缓存
await collection("configs").find({ configKey: "app-settings" }, { cache: 5000 });

// 替换文档 - 自动清理缓存
await collection("configs").replaceOne(
  { configKey: "app-settings" },
  newConfig
);
// 缓存已清空
```

## 何时使用 replaceOne

### ✅ 适合使用 replaceOne 的场景

1. **配置管理** - 完整替换配置对象
2. **文档版本** - 替换为新版本
3. **状态机** - 完整状态切换
4. **数据清理** - 删除旧字段并重建

### ❌ 不适合使用 replaceOne 的场景

1. **部分更新** - 使用 `updateOne` 代替
2. **递增计数** - 使用 `updateOne` 的 `$inc`
3. **数组操作** - 使用 `updateOne` 的 `$push`/`$pull`
4. **保留未修改字段** - 使用 `updateOne`

### 决策树

```
需要更新文档？
├─ 需要保留未修改的字段？
│  ├─ 是 → 使用 updateOne + $set
│  └─ 否 → 继续
├─ 需要完整替换所有字段？
│  ├─ 是 → 使用 replaceOne
│  └─ 否 → 使用 updateOne
└─ 需要原子操作并返回文档？
   ├─ 部分更新 → 使用 findOneAndUpdate
   └─ 完整替换 → 使用 findOneAndReplace
```

## 最佳实践

### 1. 明确文档结构

```javascript
// ✅ 推荐 - 提供完整的文档结构
const newDocument = {
  configKey: "app-settings",
  version: 2,
  theme: "dark",
  language: "en-US",
  notifications: true,
  updatedAt: new Date()
};

await collection("configs").replaceOne(
  { configKey: "app-settings" },
  newDocument
);
```

### 2. 使用 TypeScript/JSDoc 定义类型

```javascript
/**
 * @typedef {Object} UserDocument
 * @property {string} userId
 * @property {string} name
 * @property {string} email
 * @property {string} status
 */

/** @type {UserDocument} */
const newUser = {
  userId: "user123",
  name: "Alice",
  email: "alice@example.com",
  status: "active"
};

await collection("users").replaceOne({ userId: "user123" }, newUser);
```

### 3. 验证替换结果

```javascript
const result = await collection("configs").replaceOne(
  { configKey: "app-settings" },
  newConfig
);

if (result.matchedCount === 0) {
  console.warn("配置不存在，考虑使用 upsert: true");
} else if (result.modifiedCount === 0) {
  console.log("配置内容相同，未修改");
} else {
  console.log("配置已成功替换");
}
```

## 相关方法

- [`updateOne()`](./update-one.md) - 部分更新单个文档
- [`findOneAndReplace()`](./find-one-and-replace.md) - 原子地查找并替换
- [`insertOne()`](./insert-one.md) - 插入单个文档

## 参考资料

- [MongoDB replaceOne 文档](https://docs.mongodb.com/manual/reference/method/db.collection.replaceOne/)

