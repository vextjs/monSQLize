# updateOne() - 更新单个文档

更新集合中第一个匹配筛选条件的文档。

## 语法

```javascript
collection(collectionName).updateOne(filter, update, options)
```

## 参数

### filter (Object, 必需)
筛选条件，用于匹配要更新的文档。

```javascript
{ userId: "user123" }
{ age: { $gte: 18 }, status: "active" }
```

### update (Object, 必需)
更新操作，必须使用更新操作符（如 `$set`, `$inc` 等）。

**支持的更新操作符**:
- `$set` - 设置字段值
- `$unset` - 删除字段
- `$inc` - 递增数值
- `$mul` - 乘以数值
- `$push` - 添加数组元素
- `$pull` - 删除数组元素
- `$addToSet` - 添加唯一数组元素
- 等等...

```javascript
{ $set: { status: "active" } }
{ $inc: { loginCount: 1 } }
{ $push: { tags: "premium" } }
```

### options (Object, 可选)
操作选项。

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `upsert` | Boolean | false | 不存在时是否插入新文档 |
| `writeConcern` | Object | - | 写关注选项 |
| `bypassDocumentValidation` | Boolean | false | 是否绕过文档验证 |
| `comment` | String | - | 操作注释（用于日志追踪） |
| `collation` | Object | - | 排序规则 |
| `arrayFilters` | Array | - | 数组过滤器 |
| `hint` | String/Object | - | 索引提示 |

## 返回值

返回 `Promise<UpdateResult>` 对象：

```javascript
{
  acknowledged: true,      // 操作是否被确认
  matchedCount: 1,         // 匹配的文档数量
  modifiedCount: 1,        // 实际修改的文档数量
  upsertedId: null,        // upsert 时插入的文档 _id
  upsertedCount: 0         // upsert 插入的文档数量
}
```

**注意**: 
- `matchedCount` 可能大于 `modifiedCount`（匹配但值相同时不修改）
- 未匹配时 `matchedCount` 和 `modifiedCount` 都为 0

## 示例

### 基本更新

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active", updatedAt: new Date() } }
);

console.log("Modified:", result.modifiedCount); // 1
```

### 递增计数器

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  { $inc: { loginCount: 1 } }
);
```

### 数组操作

```javascript
// 添加标签
await collection("users").updateOne(
  { userId: "user123" },
  { $push: { tags: "premium" } }
);

// 删除标签
await collection("users").updateOne(
  { userId: "user123" },
  { $pull: { tags: "trial" } }
);
```

### 多个操作符组合

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { name: "Alice Updated", lastLoginAt: new Date() },
    $inc: { loginCount: 1 },
    $push: { tags: "active" }
  }
);
```

### 更新嵌套字段

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { "profile.address.city": "Shanghai" } }
);
```

### 删除字段

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $unset: { tempField: "", debugMode: "" } }
);
```

### 使用 upsert

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { name: "Alice", status: "active" },
    $setOnInsert: { createdAt: new Date() }
  },
  { upsert: true }
);

if (result.upsertedId) {
  console.log("Inserted new document:", result.upsertedId);
}
```

### 条件更新

```javascript
// 仅更新年龄 >= 18 且状态为 active 的用户
await collection("users").updateOne(
  { userId: "user123", age: { $gte: 18 }, status: "active" },
  { $set: { verified: true } }
);
```

### 使用注释（便于日志追踪）

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "verified" } },
  { comment: "用户验证更新 - 批次202511" }
);
```

## 错误处理

```javascript
try {
  await collection("users").updateOne(
    { userId: "user123" },
    { $set: { status: "active" } }
  );
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

## 常见错误

### 错误：缺少更新操作符

```javascript
// ❌ 错误 - 缺少 $ 操作符
await collection("users").updateOne(
  { userId: "user123" },
  { name: "Alice", age: 25 }
);
// 抛出: INVALID_ARGUMENT - update 必须使用更新操作符

// ✅ 正确 - 使用 $set
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { name: "Alice", age: 25 } }
);
```

**说明**: `updateOne` 用于部分更新，必须使用更新操作符。如果需要完整替换文档，请使用 `replaceOne`。

### 错误：filter 参数无效

```javascript
// ❌ 错误 - filter 为 null
await collection("users").updateOne(null, { $set: { name: "Test" } });

// ❌ 错误 - filter 为数组
await collection("users").updateOne([], { $set: { name: "Test" } });

// ✅ 正确
await collection("users").updateOne({}, { $set: { name: "Test" } });
```

## 性能建议

### 1. 使用索引优化筛选

```javascript
// 确保 userId 字段有索引
await collection("users").updateOne(
  { userId: "user123" }, // 使用索引字段
  { $set: { status: "active" } }
);
```

### 2. 避免全表扫描

```javascript
// ❌ 不推荐 - 可能导致全表扫描
await collection("users").updateOne(
  { name: "Alice" }, // 如果 name 没有索引
  { $set: { status: "active" } }
);

// ✅ 推荐 - 使用唯一标识符
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);
```

### 3. 批量更新使用 updateMany

```javascript
// ❌ 不推荐 - 循环调用 updateOne
for (const userId of userIds) {
  await collection("users").updateOne(
    { userId },
    { $set: { status: "active" } }
  );
}

// ✅ 推荐 - 使用 updateMany
await collection("users").updateMany(
  { userId: { $in: userIds } },
  { $set: { status: "active" } }
);
```

## 缓存行为

`updateOne` 在成功修改文档后会**自动失效相关缓存**：

```javascript
// 查询并缓存
await collection("users").find({ userId: "user123" }, { cache: 5000 });

// 更新文档 - 自动清理缓存
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);

// 下次查询将从数据库获取最新数据
```

**注意**: 
- 仅当 `modifiedCount > 0` 时才会失效缓存
- 缓存失效是自动的，无需手动调用

## 慢查询日志

当操作耗时超过阈值时，会自动记录慢查询日志：

```javascript
// 默认阈值 1000ms（可在初始化时配置）
const msq = new MonSQLize({
  type: "mongodb",
  databaseName: "mydb",
  config: { slowQueryMs: 500 } // 自定义阈值
});

// 慢操作会自动记录日志
await collection("users").updateOne(
  { complexCondition: {...} },
  { $set: { status: "active" } }
);
// 日志输出: [updateOne] 慢操作警告 { ns: 'mydb.users', duration: 520, ... }
```

## 与其他方法的对比

| 方法 | 更新数量 | 操作符 | 返回值 | 使用场景 |
|------|---------|--------|--------|----------|
| `updateOne` | 第一个匹配 | 必须用 $ | 计数 | 部分更新单个 |
| `updateMany` | 所有匹配 | 必须用 $ | 计数 | 部分更新多个 |
| `replaceOne` | 第一个匹配 | 不能用 $ | 计数 | 完整替换 |
| `findOneAndUpdate` | 第一个匹配 | 必须用 $ | 文档 | 原子更新 |

## 最佳实践

### 1. 总是使用更新操作符

```javascript
// ✅ 推荐
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);
```

### 2. 使用 $setOnInsert 配合 upsert

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { status: "active", updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() } // 仅插入时设置
  },
  { upsert: true }
);
```

### 3. 添加注释便于追踪

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } },
  { comment: "用户激活 - 管理员操作" }
);
```

### 4. 验证更新结果

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);

if (result.matchedCount === 0) {
  console.log("用户不存在");
} else if (result.modifiedCount === 0) {
  console.log("状态已经是 active，无需更新");
} else {
  console.log("更新成功");
}
```

## 相关方法

- [`updateMany()`](./update-many.md) - 批量更新多个文档
- [`replaceOne()`](./replace-one.md) - 完整替换单个文档
- [`findOneAndUpdate()`](./find-one-and-update.md) - 原子地查找并更新
- [`insertOne()`](./insert-one.md) - 插入单个文档

## 参考资料

- [MongoDB 更新操作符文档](https://docs.mongodb.com/manual/reference/operator/update/)
- [MongoDB updateOne 文档](https://docs.mongodb.com/manual/reference/method/db.collection.updateOne/)

