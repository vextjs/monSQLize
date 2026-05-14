# deleteMany() - 批量删除文档

## 📑 目录

- [语法](#语法)
- [参数](#参数)
- [返回值](#返回值)
- [核心特性](#核心特性)
- [常见场景](#常见场景)
- [与其他方法的区别](#与其他方法的区别)
- [批量删除的性能考虑](#批量删除的性能考虑)
- [错误处理](#错误处理)
- [安全建议](#安全建议)
- [注意事项](#注意事项)
- [实用工具函数](#实用工具函数)
- [相关方法](#相关方法)
- [示例代码](#示例代码)
- [MongoDB 文档](#mongodb-文档)

---

`deleteMany()` 方法删除集合中所有匹配筛选条件的文档。

## 语法

```javascript
collection(name).deleteMany(filter, options?)
```

## 参数

### filter（必需）

**类型**: `Object`

用于匹配要删除的文档的筛选条件。使用 MongoDB 查询操作符。

```javascript
// 删除所有 inactive 用户
await collection("users").deleteMany({ status: "inactive" });

// 删除所有过期记录
await collection("sessions").deleteMany({ 
  expiresAt: { $lt: new Date() } 
});
```

**⚠️ 警告**: 使用空对象 `{}` 作为 filter 会删除集合中的所有文档！

```javascript
// 危险：删除所有文档
await collection("users").deleteMany({});
```

### options（可选）

**类型**: `Object`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `collation` | Object | - | 指定排序规则 |
| `hint` | string \| Object | - | 索引提示，强制使用特定索引 |
| `maxTimeMS` | number | - | 操作的最大执行时间（毫秒） |
| `writeConcern` | Object | - | 写关注选项 |
| `comment` | string | - | 操作注释，用于日志追踪 |

## 返回值

**类型**: `Promise<Object>`

返回一个包含删除结果的对象：

```javascript
{
  deletedCount: 5,     // 被删除的文档数量
  acknowledged: true   // 操作是否被确认
}
```

## 核心特性

### ✅ 删除所有匹配的文档

与 `deleteOne()` 不同，`deleteMany()` 会删除所有匹配的文档。

```javascript
// 删除所有 status="inactive" 的用户
const result = await collection("users").deleteMany({ status: "inactive" });
console.log(`删除了 ${result.deletedCount} 个用户`); // 可能是 0, 1, 5, 100...
```

### ✅ 自动缓存失效

删除成功后，monSQLize 会自动清理相关的缓存键。

```javascript
// 查询并缓存
const users = await collection("users").find(
  { status: "inactive" },
  { cache: 5000 }
);

// 批量删除（自动清理缓存）
await collection("users").deleteMany({ status: "inactive" });

// 再次查询（不会从缓存返回）
const remainingUsers = await collection("users").find(
  { status: "inactive" },
  { cache: 5000 }
); // []
```

### ✅ 慢查询监控

超过阈值（默认 1000ms）的删除操作会自动记录警告日志。

```javascript
// 大量删除可能触发慢查询警告
await collection("logs").deleteMany({ 
  createdAt: { $lt: new Date("2023-01-01") } 
});
// 日志: [WARN] [deleteMany] 慢操作警告 { duration: 1500ms, deletedCount: 50000 }
```

## 常见场景

### 场景 1: 批量清理过期数据

```javascript
// 删除所有过期的会话
const result = await collection("sessions").deleteMany({
  expiresAt: { $lt: new Date() }
});

console.log(`清理了 ${result.deletedCount} 个过期会话`);
```

### 场景 2: 批量删除用户相关数据

```javascript
// 删除用户的所有订单
const result = await collection("orders").deleteMany({
  userId: "user123"
});

console.log(`删除了用户的 ${result.deletedCount} 个订单`);
```

### 场景 3: 清理测试数据

```javascript
// 删除所有测试用户
const result = await collection("users").deleteMany({
  email: { $regex: /@test\.com$/ }
});

console.log(`清理了 ${result.deletedCount} 个测试用户`);
```

### 场景 4: 按时间范围清理日志

```javascript
// 删除 30 天前的日志
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const result = await collection("logs").deleteMany({
  createdAt: { $lt: thirtyDaysAgo }
});

console.log(`删除了 ${result.deletedCount} 条旧日志`);
```

### 场景 5: 使用索引提示优化大量删除

```javascript
// 删除大量数据时，指定使用索引
const result = await collection("analytics").deleteMany(
  { 
    userId: "user123",
    eventType: "page_view",
    timestamp: { $lt: new Date("2024-01-01") }
  },
  { 
    hint: { userId: 1, timestamp: 1 },  // 使用复合索引
    comment: "cleanup-old-analytics",
    maxTimeMS: 30000  // 30秒超时
  }
);

console.log(`删除了 ${result.deletedCount} 条分析记录`);
```

### 场景 6: 条件批量删除

```javascript
// 删除所有低评分且未支付的订单
const result = await collection("orders").deleteMany({
  rating: { $lt: 2 },
  status: "unpaid",
  createdAt: { $lt: new Date("2024-01-01") }
});

console.log(`删除了 ${result.deletedCount} 个低质量订单`);
```

## 与其他方法的区别

### vs deleteOne

| 特性 | deleteOne | deleteMany |
|------|-----------|------------|
| **删除数量** | 只删除第一个匹配的文档 | 删除所有匹配的文档 |
| **返回值** | `deletedCount: 0或1` | `deletedCount: 0或多个` |
| **性能** | 更快（找到第一个即停止） | 较慢（需要扫描所有匹配） |
| **使用场景** | 删除特定的单个记录 | 批量清理数据 |
| **风险** | 低 | 高（可能误删大量数据） |

```javascript
// deleteOne - 只删除一个
const result1 = await collection("users").deleteOne({ status: "inactive" });
console.log(result1.deletedCount); // 0 或 1

// deleteMany - 删除所有匹配
const result2 = await collection("users").deleteMany({ status: "inactive" });
console.log(result2.deletedCount); // 0, 1, 5, 100...
```

### vs findOneAndDelete

| 特性 | deleteMany | findOneAndDelete |
|------|-----------|------------------|
| **删除数量** | 删除所有匹配的文档 | 只删除一个文档 |
| **返回内容** | 删除计数 | 被删除的文档内容 |
| **原子性** | 否（多个删除操作） | 是（查找和删除是单个原子操作） |
| **使用场景** | 批量清理 | 需要删除前的文档内容 |

## 批量删除的性能考虑

### 1. 大量删除的策略

**问题**: 一次删除大量文档可能导致：
- 操作超时
- 阻塞其他操作
- 内存压力

**解决方案**: 分批删除

```javascript
// 不好：一次删除大量文档
await collection("logs").deleteMany({ 
  createdAt: { $lt: new Date("2020-01-01") } 
}); // 可能删除几百万条

// 好：分批删除
const batchSize = 10000;
let deletedTotal = 0;

while (true) {
  const result = await collection("logs").deleteMany(
    { createdAt: { $lt: new Date("2020-01-01") } },
    { maxTimeMS: 5000 }  // 每批最多 5 秒
  );
  
  deletedTotal += result.deletedCount;
  console.log(`已删除 ${deletedTotal} 条`);
  
  if (result.deletedCount < batchSize) {
    break;  // 所有数据已删除
  }
  
  // 暂停一下，避免持续高负载
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

### 2. 使用索引优化删除

```javascript
// 先创建索引
await collection("logs").createIndex({ createdAt: 1 });

// 然后删除（会使用索引）
const result = await collection("logs").deleteMany({
  createdAt: { $lt: new Date("2023-01-01") }
});
```

### 3. 使用索引提示

```javascript
// 明确指定使用哪个索引
await collection("events").deleteMany(
  { 
    userId: "user123",
    eventType: "click",
    timestamp: { $lt: new Date("2024-01-01") }
  },
  { 
    hint: { userId: 1, timestamp: 1 }  // 使用复合索引
  }
);
```

### 4. 监控删除进度

```javascript
// 先统计要删除的数量
const totalCount = await collection("logs").count({
  createdAt: { $lt: new Date("2020-01-01") }
});

console.log(`准备删除 ${totalCount} 条日志`);

// 执行删除
const result = await collection("logs").deleteMany({
  createdAt: { $lt: new Date("2020-01-01") }
});

console.log(`实际删除 ${result.deletedCount} 条`);
```

## 错误处理

### 无效的筛选条件

```javascript
try {
  // 错误：filter 必须是对象
  await collection("users").deleteMany(null);
} catch (error) {
  console.error(error.code); // INVALID_ARGUMENT
  console.error(error.message); // "filter 必须是对象类型"
}
```

### 操作超时

```javascript
try {
  // 大量删除可能超时
  await collection("logs").deleteMany(
    { level: "debug" },
    { maxTimeMS: 1000 }  // 1秒超时
  );
} catch (error) {
  if (error.code === ErrorCodes.OPERATION_TIMEOUT) {
    console.error("删除操作超时，可能需要分批删除");
  }
}
```

### 写关注错误

```javascript
try {
  await collection("users").deleteMany(
    { status: "inactive" },
    { 
      writeConcern: { w: "majority", wtimeout: 5000 } 
    }
  );
} catch (error) {
  if (error.code === ErrorCodes.WRITE_ERROR) {
    console.error("写操作失败:", error.message);
  }
}
```

## 安全建议

### ⚠️ 删除前先查询

在执行批量删除前，建议先查询确认要删除的数据：

```javascript
// 1. 先查询（使用 limit 避免返回过多数据）
const toDelete = await collection("users").find(
  { status: "inactive" },
  { limit: 10 }
);

console.log("将要删除的用户（示例）:", toDelete);

// 2. 确认后再删除
const confirmed = true; // 从用户输入获取
if (confirmed) {
  const result = await collection("users").deleteMany({ status: "inactive" });
  console.log(`已删除 ${result.deletedCount} 个用户`);
}
```

### ⚠️ 避免使用空筛选条件

```javascript
// 危险：删除所有文档
await collection("users").deleteMany({});

// 如果真的需要清空集合，明确说明
const CONFIRM_DELETE_ALL = true;
if (CONFIRM_DELETE_ALL) {
  const result = await collection("temp_data").deleteMany({});
  console.log(`已清空集合，删除了 ${result.deletedCount} 条数据`);
}
```

### ⚠️ 使用软删除作为替代

对于重要数据，考虑使用软删除（标记为已删除）而不是物理删除：

```javascript
// 物理删除（不可恢复）
await collection("users").deleteMany({ status: "inactive" });

// 软删除（可恢复）
await collection("users").updateMany(
  { status: "inactive" },
  { 
    $set: { 
      deleted: true,
      deletedAt: new Date(),
      deletedBy: "admin"
    } 
  }
);

// 查询时过滤已删除的数据
const activeUsers = await collection("users").find({
  deleted: { $ne: true }
});
```

### ⚠️ 记录删除操作日志

```javascript
// 删除前记录日志
const filter = { status: "inactive" };
const countBefore = await collection("users").count(filter);

// 执行删除
const result = await collection("users").deleteMany(filter, {
  comment: `cleanup-inactive-users-${new Date().toISOString()}`
});

// 记录审计日志
await collection("audit_logs").insertOne({
  action: "deleteMany",
  collection: "users",
  filter,
  deletedCount: result.deletedCount,
  expectedCount: countBefore,
  timestamp: new Date(),
  operator: "admin"
});
```

## 注意事项

### ⚠️ 删除是不可逆的

```javascript
// 一旦删除，无法恢复
const result = await collection("users").deleteMany({ status: "inactive" });
console.log(`永久删除了 ${result.deletedCount} 个用户`);
```

### ⚠️ 缓存失效的范围

自动缓存失效会清理整个集合的缓存：

```javascript
// 删除部分用户
await collection("users").deleteMany({ status: "inactive" });

// 所有 users 集合的缓存都会被清理
// 包括其他查询的缓存
```

### ⚠️ 性能影响

大量删除可能影响数据库性能，建议在低峰期执行：

```javascript
// 在低峰期执行大量删除
const isOffPeak = new Date().getHours() < 6;

if (isOffPeak) {
  const result = await collection("logs").deleteMany({
    createdAt: { $lt: new Date("2020-01-01") }
  });
  console.log(`删除了 ${result.deletedCount} 条日志`);
} else {
  console.log("等待低峰期再执行删除操作");
}
```

### ⚠️ 索引维护

删除大量文档后，索引会自动更新，这可能需要一些时间。

## 实用工具函数

### 安全的批量删除函数

```javascript
/**
 * 安全地批量删除文档（分批、有超时、有日志）
 */
async function safeDeleteMany(collectionName, filter, options = {}) {
  const {
    batchSize = 10000,
    maxTimeMS = 5000,
    pauseMs = 100,
    dryRun = false
  } = options;
  
  // 1. 先统计总数
  const totalCount = await collection(collectionName).count(filter);
  console.log(`准备删除 ${totalCount} 条数据`);
  
  if (dryRun) {
    console.log("[模拟模式] 不会实际删除");
    return { deletedCount: 0, totalCount };
  }
  
  // 2. 分批删除
  let deletedTotal = 0;
  let batchCount = 0;
  
  while (deletedTotal < totalCount) {
    batchCount++;
    
    const result = await collection(collectionName).deleteMany(
      filter,
      { maxTimeMS }
    );
    
    deletedTotal += result.deletedCount;
    console.log(`[批次 ${batchCount}] 删除 ${result.deletedCount} 条，累计 ${deletedTotal}/${totalCount}`);
    
    if (result.deletedCount === 0) {
      break;  // 没有更多数据可删除
    }
    
    // 暂停一下
    await new Promise(resolve => setTimeout(resolve, pauseMs));
  }
  
  console.log(`✅ 完成！共删除 ${deletedTotal} 条数据`);
  return { deletedCount: deletedTotal, totalCount };
}

// 使用示例
await safeDeleteMany("logs", 
  { createdAt: { $lt: new Date("2020-01-01") } },
  { dryRun: true }  // 先模拟运行
);
```

## 相关方法

- [deleteOne()](./delete-one.md) - 删除单个文档
- [findOneAndDelete()](./find-one-and-delete.md) - 原子地查找并删除文档，返回被删除的文档
- [updateMany()](./update-many.md) - 批量更新文档（软删除的替代方案）

## 示例代码

完整的示例代码请参考 [examples/delete-operations.examples.js](../examples/delete-operations.examples.js)

## MongoDB 文档

- [MongoDB deleteMany 文档](https://www.mongodb.com/docs/manual/reference/method/db.collection.deleteMany/)

