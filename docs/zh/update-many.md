# updateMany() - 批量更新文档

## 📑 目录

- [语法](#语法)
- [参数](#参数)
- [返回值](#返回值)
- [示例](#示例)
- [性能优化](#性能优化)
- [与 updateOne 的区别](#与-updateone-的区别)
- [常见场景](#常见场景)
- [错误处理](#错误处理)
- [缓存行为](#缓存行为)
- [慢查询日志](#慢查询日志)
- [最佳实践](#最佳实践)
- [相关方法](#相关方法)
- [参考资料](#参考资料)

---

更新集合中所有匹配筛选条件的文档。

## 语法

```javascript
collection(collectionName).updateMany(filter, update, options)
```

## 参数

### filter (Object, 必需)
筛选条件，用于匹配要更新的文档。

```javascript
{ status: "inactive" }
{ age: { $gte: 18, $lt: 65 }, role: "user" }
```

### update (Object, 必需)
更新操作，必须使用更新操作符。

```javascript
{ $set: { status: "active", updatedAt: new Date() } }
{ $inc: { views: 1 } }
```

### options (Object, 可选)

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `upsert` | Boolean | false | 不存在时是否插入新文档 |
| `writeConcern` | Object | - | 写关注选项 |
| `bypassDocumentValidation` | Boolean | false | 是否绕过文档验证 |
| `comment` | String | - | 操作注释 |
| `collation` | Object | - | 排序规则 |
| `arrayFilters` | Array | - | 数组过滤器 |
| `hint` | String/Object | - | 索引提示 |

## 返回值

返回 `Promise<UpdateResult>`:

```javascript
{
  acknowledged: true,
  matchedCount: 10,      // 匹配的文档数量
  modifiedCount: 10,     // 实际修改的文档数量
  upsertedId: null,
  upsertedCount: 0
}
```

## 示例

### 批量更新状态

```javascript
// 激活所有未激活用户
const result = await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active", updatedAt: new Date() } }
);

console.log("Updated:", result.modifiedCount, "users");
```

### 批量递增

```javascript
// 所有产品浏览量 +10
const result = await collection("products").updateMany(
  {},
  { $inc: { views: 10 } }
);

console.log("Updated:", result.modifiedCount, "products");
```

### 条件批量更新

```javascript
// 标记大额订单为高优先级
const result = await collection("orders").updateMany(
  {
    status: "pending",
    amount: { $gte: 1000 }
  },
  { $set: { priority: "high" } }
);
```

### 批量添加字段

```javascript
// 为所有文章添加新字段
await collection("articles").updateMany(
  {},
  {
    $set: {
      published: true,
      publishedAt: new Date(),
      version: 1
    }
  }
);
```

### 批量删除字段

```javascript
// 清理所有文档的临时字段
await collection("documents").updateMany(
  {},
  { $unset: { tempField: "", debugMode: "" } }
);
```

### 使用数组过滤器

```javascript
// 更新成绩 >= 80 的科目等级
await collection("students").updateMany(
  { studentId: { $exists: true } },
  { $set: { "scores.$[elem].grade": "A" } },
  {
    arrayFilters: [{ "elem.score": { $gte: 80 } }]
  }
);
```

### 多条件复杂更新

```javascript
await collection("users").updateMany(
  {
    role: "user",
    age: { $gte: 18, $lt: 65 },
    status: "active"
  },
  {
    $set: { category: "adult", verifiedAt: new Date() },
    $inc: { loginBonus: 10 }
  }
);
```

### 批量更新嵌套字段

```javascript
// 为所有用户添加默认地址
await collection("users").updateMany(
  {},
  {
    $set: {
      "profile.address.country": "China",
      "profile.verified": true
    }
  }
);
```

## 性能优化

### 1. 使用索引优化筛选

```javascript
// 确保筛选字段有索引
await collection("users").updateMany(
  { status: "inactive" }, // status 字段应有索引
  { $set: { status: "active" } }
);
```

### 2. 分批处理大规模更新

```javascript
// ❌ 不推荐 - 一次更新百万级文档
await collection("users").updateMany(
  {},
  { $set: { migrated: true } }
);

// ✅ 推荐 - 分批处理
let lastId = null;
const batchSize = 10000;

while (true) {
  const filter = lastId
    ? { _id: { $gt: lastId } }
    : {};

  const result = await collection("users")
    .find(filter)
    .limit(batchSize)
    .toArray();

  if (result.length === 0) break;

  const ids = result.map(doc => doc._id);
  await collection("users").updateMany(
    { _id: { $in: ids } },
    { $set: { migrated: true } }
  );

  lastId = result[result.length - 1]._id;
  console.log(`Processed ${batchSize} documents`);
}
```

### 3. 性能测试示例

```javascript
// 大批量更新性能测试
const startTime = Date.now();

const result = await collection("logs").updateMany(
  { processed: false },
  {
    $set: { processed: true, processedAt: new Date() }
  }
);

const duration = Date.now() - startTime;
console.log(`Updated ${result.modifiedCount} documents in ${duration}ms`);
console.log(`Speed: ${Math.round(result.modifiedCount / duration * 1000)} docs/sec`);
```

## 与 updateOne 的区别

| 特性 | updateOne | updateMany |
|------|-----------|------------|
| **更新数量** | 仅第一个匹配 | 所有匹配 |
| **性能** | 快（单次写入） | 较慢（批量写入） |
| **使用场景** | 更新单个文档 | 批量更新 |
| **返回值** | 计数信息 | 计数信息 |

```javascript
// updateOne - 仅更新第一个
await collection("users").updateOne(
  { status: "inactive" },
  { $set: { status: "active" } }
);
// 结果: modifiedCount = 1

// updateMany - 更新所有匹配
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
);
// 结果: modifiedCount = N（所有匹配的数量）
```

## 常见场景

### 场景 1: 批量激活用户

```javascript
const result = await collection("users").updateMany(
  {
    status: "pending",
    emailVerified: true,
    createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  },
  {
    $set: {
      status: "active",
      activatedAt: new Date()
    }
  }
);

console.log(`Activated ${result.modifiedCount} users`);
```

### 场景 2: 批量标记过期数据

```javascript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

await collection("sessions").updateMany(
  {
    lastAccessAt: { $lt: thirtyDaysAgo },
    expired: { $ne: true }
  },
  {
    $set: {
      expired: true,
      expiredAt: new Date()
    }
  }
);
```

### 场景 3: 批量价格调整

```javascript
// 所有特定类别产品打9折
await collection("products").updateMany(
  { category: "electronics", onSale: false },
  {
    $mul: { price: 0.9 },
    $set: { onSale: true, saleStartAt: new Date() }
  }
);
```

### 场景 4: 批量数据迁移

```javascript
// 迁移旧字段到新字段
await collection("users").updateMany(
  { oldField: { $exists: true } },
  [
    {
      $set: {
        newField: "$oldField"
      }
    },
    {
      $unset: "oldField"
    }
  ]
);
```

## 错误处理

```javascript
try {
  const result = await collection("users").updateMany(
    { status: "inactive" },
    { $set: { status: "active" } }
  );

  if (result.matchedCount === 0) {
    console.log("没有找到匹配的文档");
  } else {
    console.log(`成功更新 ${result.modifiedCount}/${result.matchedCount} 个文档`);
  }
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    console.error("参数错误:", err.message);
  } else if (err.code === "WRITE_ERROR") {
    console.error("批量写入错误:", err.message);
  } else {
    console.error("未知错误:", err);
  }
}
```

## 缓存行为

`updateMany` 在成功修改文档后会**自动失效相关缓存**：

```javascript
// 缓存查询结果
await collection("users").find({ status: "inactive" }, { cache: 5000 });

// 批量更新 - 自动清理缓存
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
);
// 缓存已清空

// 下次查询将从数据库获取
```

**注意**: 仅当 `matchedCount > 0` 时才会失效缓存。

## 慢查询日志

批量更新操作如果耗时较长，会自动记录慢查询日志：

```javascript
// 大批量更新可能触发慢查询日志
await collection("logs").updateMany(
  { processed: false },
  { $set: { processed: true } }
);
// 如果耗时 > 1000ms（默认阈值），会记录日志：
// [updateMany] 慢操作警告 { ns: 'db.logs', duration: 1520, matchedCount: 50000, ... }
```

## 最佳实践

### 1. 验证更新结果

```javascript
const result = await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
);

if (result.matchedCount !== result.modifiedCount) {
  console.warn(
    `部分文档未修改: ${result.matchedCount - result.modifiedCount} 个文档值已是目标值`
  );
}
```

### 2. 添加操作注释

```javascript
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } },
  { comment: "批量激活用户 - 运营活动202511" }
);
```

### 3. 使用事务处理关键批量更新

```javascript
const session = client.startSession();
try {
  await session.withTransaction(async () => {
    await collection("users").updateMany(
      { status: "pending" },
      { $set: { status: "active" } },
      { session }
    );

    await collection("audit_logs").insertOne(
      {
        action: "batch_activate",
        timestamp: new Date(),
        count: result.modifiedCount
      },
      { session }
    );
  });
} finally {
  await session.endSession();
}
```

### 4. 监控更新进度

```javascript
let totalUpdated = 0;
const batchSize = 1000;

while (true) {
  const result = await collection("users").updateMany(
    {
      status: "inactive",
      updated: { $ne: true }
    },
    {
      $set: { status: "active", updated: true }
    }
  );

  totalUpdated += result.modifiedCount;

  if (result.matchedCount < batchSize) {
    break;
  }

  console.log(`Progress: ${totalUpdated} documents updated`);
  await new Promise(resolve => setTimeout(resolve, 100)); // 避免过载
}

console.log(`Completed: ${totalUpdated} documents updated`);
```

## 相关方法

- [`updateOne()`](./update-one.md) - 更新单个文档
- [`replaceOne()`](./replace-one.md) - 完整替换单个文档
- [`insertMany()`](./insert-many.md) - 批量插入文档

## 参考资料

- [MongoDB updateMany 文档](https://docs.mongodb.com/manual/reference/method/db.collection.updateMany/)
- [MongoDB 批量写入操作](https://docs.mongodb.com/manual/core/bulk-write-operations/)

