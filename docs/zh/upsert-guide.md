# Upsert 操作指南 - 不存在就插入，存在则更新

## 📋 快速回答

**实现"不存在就插入，存在则更新"使用以下方法**：

### ⭐ 推荐方法：`findOneAndUpdate()` + `upsert: true`

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },              // 查询条件
  { 
    $set: { name: "Alice", age: 25 },  // 更新操作
    $setOnInsert: { createdAt: new Date() }  // 仅插入时设置
  },
  { 
    upsert: true,                      // 🔑 关键选项
    returnDocument: "after"            // 返回更新/插入后的文档
  }
);
```

---

## 🎯 所有支持 Upsert 的方法

| 方法 | 返回值 | 适用场景 | 推荐度 |
|------|--------|---------|--------|
| **`findOneAndUpdate()`** | 文档对象 | 需要返回文档内容 | ⭐⭐⭐⭐⭐ |
| **`updateOne()`** | 操作结果统计 | 只需要知道是否成功 | ⭐⭐⭐⭐ |
| **`updateMany()`** | 操作结果统计 | 批量 upsert | ⭐⭐⭐ |
| **`replaceOne()`** | 操作结果统计 | 替换整个文档 | ⭐⭐ |

---

## 💡 详细用法

### 1. `findOneAndUpdate()` - 推荐 ⭐⭐⭐⭐⭐

**优势**：
- ✅ 原子操作
- ✅ 返回文档内容
- ✅ 可以获取插入的 _id
- ✅ 支持 `$setOnInsert`

**基本用法**：

```javascript
const result = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { 
      name: "Alice",
      lastLogin: new Date()
    },
    $setOnInsert: {
      createdAt: new Date(),
      role: "user"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

console.log("文档:", result);
```

**获取是否为新插入**：

```javascript
const result = await collection("users").findOneAndUpdate(
  { email: "new@example.com" },
  { $set: { name: "New User" } },
  {
    upsert: true,
    returnDocument: "after",
    includeResultMetadata: true
  }
);

if (result.lastErrorObject.upserted) {
  console.log("✅ 创建了新文档");
  console.log("新 _id:", result.lastErrorObject.upserted);
} else {
  console.log("✅ 更新了现有文档");
}

console.log("文档内容:", result.value);
```

---

### 2. `updateOne()` - 简单场景 ⭐⭐⭐⭐

**优势**：
- ✅ 性能好（不返回文档）
- ✅ 返回操作统计

**基本用法**：

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { name: "Alice" },
    $setOnInsert: { createdAt: new Date() }
  },
  { upsert: true }
);

console.log("匹配数量:", result.matchedCount);
console.log("修改数量:", result.modifiedCount);
console.log("插入数量:", result.upsertedCount);

if (result.upsertedCount > 0) {
  console.log("新插入的 _id:", result.upsertedId);
}
```

---

### 3. `replaceOne()` - 替换整个文档 ⭐⭐

**优势**：
- ✅ 完全替换文档（不使用更新操作符）

**用法**：

```javascript
const newDoc = {
  userId: "user123",
  name: "Alice",
  age: 25,
  email: "alice@example.com"
};

const result = await collection("users").replaceOne(
  { userId: "user123" },
  newDoc,
  { upsert: true }
);

if (result.upsertedCount > 0) {
  console.log("创建了新文档");
} else {
  console.log("替换了现有文档");
}
```

---

## 🎯 常见使用场景

### 场景 1：用户配置

```javascript
// 保存用户偏好设置
const config = await collection("user_configs").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      theme: "dark",
      language: "zh-CN",
      updatedAt: new Date()
    },
    $setOnInsert: {
      createdAt: new Date()
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
```

### 场景 2：计数器

```javascript
// 页面访问统计
const stats = await collection("page_stats").findOneAndUpdate(
  { page: "/home", date: "2026-01-28" },
  {
    $inc: { views: 1 }  // 自动初始化为 0 再加 1
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

console.log("今日访问量:", stats.views);
```

### 场景 3：商品库存

```javascript
// 扣减库存（自动创建库存记录）
const inventory = await collection("inventory").findOneAndUpdate(
  { productId: "prod-456", warehouseId: "wh-01" },
  {
    $inc: { quantity: -1 },
    $set: { lastUpdated: new Date() },
    $setOnInsert: {
      productName: "iPhone 15",
      minStock: 10
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

if (inventory.quantity < inventory.minStock) {
  console.log("⚠️ 库存不足，需要补货");
}
```

### 场景 4：缓存管理

```javascript
// 缓存用户数据
const cache = await collection("cache").findOneAndUpdate(
  { key: "user:profile:123" },
  {
    $set: {
      value: userData,
      expireAt: new Date(Date.now() + 3600000) // 1小时后过期
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
```

### 场景 5：每日签到

```javascript
// 用户签到（防止重复签到）
const checkin = await collection("checkins").findOneAndUpdate(
  {
    userId: "user123",
    date: "2026-01-28"
  },
  {
    $setOnInsert: {
      userId: "user123",
      date: "2026-01-28",
      checkedAt: new Date(),
      points: 10  // 签到奖励积分
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

if (checkin.checkedAt.toDateString() === new Date().toDateString()) {
  console.log("✅ 签到成功！获得 10 积分");
} else {
  console.log("❌ 今天已经签到过了");
}
```

---

## ⚠️ 重要注意事项

### 1. 必须使用更新操作符

```javascript
// ❌ 错误：不能直接传对象（会报错）
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { name: "Alice", age: 25 },  // 错误！
  { upsert: true }
);

// ✅ 正确：使用 $set
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { name: "Alice", age: 25 } },
  { upsert: true }
);
```

### 2. `$setOnInsert` 的使用

`$setOnInsert` 只在 **插入新文档** 时生效：

```javascript
const result = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastLogin: new Date() },        // 每次都更新
    $setOnInsert: { createdAt: new Date() } // 仅插入时设置
  },
  { upsert: true }
);

// 第一次执行（插入）:
// { userId: "user123", lastLogin: <now>, createdAt: <now> }

// 第二次执行（更新）:
// { userId: "user123", lastLogin: <now>, createdAt: <第一次的时间> }
```

### 3. 唯一索引冲突

```javascript
// 如果有唯一索引，upsert 可能失败
try {
  const result = await collection("users").updateOne(
    { userId: "user123" },
    { 
      $set: { 
        email: "alice@example.com"  // 如果 email 有唯一索引且已存在
      } 
    },
    { upsert: true }
  );
} catch (err) {
  if (err.code === 11000) {
    console.error("唯一性约束冲突:", err.message);
  }
}
```

---

## 📊 性能对比

| 方法 | 性能 | 返回数据量 | 适用场景 |
|------|------|-----------|---------|
| `updateOne()` + upsert | ⭐⭐⭐⭐⭐ | 小（只返回统计）| 不需要文档内容 |
| `findOneAndUpdate()` + upsert | ⭐⭐⭐⭐ | 大（返回完整文档）| 需要文档内容 |
| `replaceOne()` + upsert | ⭐⭐⭐ | 小 | 替换整个文档 |

---

## 🎯 最佳实践

### 1. 优先使用 `findOneAndUpdate()`

大多数情况下推荐使用，因为：
- 可以获取文档内容
- 支持 `$setOnInsert`
- 原子操作保证

### 2. 性能优化场景使用 `updateOne()`

如果只需要知道是否成功：

```javascript
const result = await collection("stats").updateOne(
  { key: "pageViews" },
  { $inc: { value: 1 } },
  { upsert: true }
);

if (result.upsertedCount > 0) {
  console.log("创建了新文档");
}
```

### 3. 建立适当的索引

```javascript
// 在查询条件字段上建立唯一索引
await collection("users").createIndex(
  { userId: 1 },
  { unique: true }
);

// 然后安全地 upsert
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { name: "Alice" } },
  { upsert: true }
);
```

---

## 📚 相关文档

- [findOneAndUpdate() 详细文档](./find-one-and-update.md)
- [updateOne() 详细文档](./update-one.md)
- [replaceOne() 详细文档](./replace-one.md)
- [MongoDB Upsert 官方文档](https://docs.mongodb.com/manual/reference/method/db.collection.update/#upsert-option)

---

**版本**: v1.1.2  
**最后更新**: 2026-01-28
