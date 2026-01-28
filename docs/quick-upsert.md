# ✅ 实现"不存在就插入，存在则更新"

## 🎯 快速回答

### 场景 1：插入和更新使用**相同数据**（最常见）⭐

如果插入和更新时数据完全一样，**只需要 `$set`**：

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },              // 查询条件
  { 
    $set: { 
      name: "Alice",
      age: 25,
      email: "alice@example.com"
    }
  },
  { 
    upsert: true,                      // 🔑 关键选项：不存在就插入
    returnDocument: "after"            // 返回更新/插入后的文档
  }
);

console.log(doc); // 返回完整的文档对象
```

**说明**：
- ✅ 不存在时：创建新文档，包含 `$set` 中的所有字段
- ✅ 存在时：更新现有文档，只修改 `$set` 中的字段
- ✅ **这是最常用的方式**，简单直接

---

### 场景 2：插入和更新使用**不同数据**

如果需要在插入时设置一些**额外的字段**（如 `createdAt`），使用 `$setOnInsert`：

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },              // 查询条件
  { 
    $set: { 
      name: "Alice",
      age: 25,
      updatedAt: new Date()           // 每次都更新
    },
    $setOnInsert: { 
      createdAt: new Date(),          // 仅在插入时设置
      role: "user"
    }
  },
  { 
    upsert: true,
    returnDocument: "after"
  }
);
```

**说明**：
- ✅ 不存在时：创建新文档，包含 `$set` + `$setOnInsert` 的所有字段
- ✅ 存在时：只更新 `$set` 中的字段，**不会修改** `$setOnInsert` 的字段

---

### 📊 两种场景对比

| 对比项 | 场景 1：相同数据 | 场景 2：不同数据 |
|--------|----------------|----------------|
| **使用场景** | 插入和更新都用相同的数据 | 插入时需要设置额外字段 |
| **操作符** | 只需 `$set` | `$set` + `$setOnInsert` |
| **典型例子** | 商品信息同步、状态更新 | 用户配置（需记录 `createdAt`）|
| **不存在时** | 创建文档，包含 `$set` 的字段 | 创建文档，包含 `$set` + `$setOnInsert` |
| **存在时** | 更新 `$set` 的字段 | 只更新 `$set`，不改 `$setOnInsert` |
| **推荐度** | ⭐⭐⭐⭐⭐ 最常用 | ⭐⭐⭐⭐ 特殊需求时使用 |

**选择建议**：
- ✅ **大多数情况用场景 1**（只用 `$set`）
- ✅ 只有需要区分"插入时的字段"和"更新时的字段"才用场景 2

---

## 📋 完整示例

### 示例 1：相同数据 - 商品信息更新 ⭐

```javascript
// 同步商品信息（插入和更新都使用相同的数据）
const product = await collection("products").findOneAndUpdate(
  { productId: "prod-123" },
  {
    $set: {
      name: "iPhone 15",
      price: 5999,
      stock: 100,
      category: "Electronics",
      lastSync: new Date()
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

// 不存在时：创建新商品，包含所有字段
// 存在时：更新所有字段为最新值
```

### 示例 2：相同数据 - 用户状态更新

```javascript
// 更新用户在线状态（插入和更新都是相同的逻辑）
const userStatus = await collection("user_status").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      status: "online",
      lastSeen: new Date(),
      device: "mobile"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

// 不管用户状态记录是否存在，都设置为最新状态
```

### 示例 3：不同数据 - 用户配置管理

### 示例 3：不同数据 - 用户配置管理

```javascript
// 保存用户偏好设置（插入时需要设置默认值）
const userConfig = await collection("user_configs").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      theme: "dark",           // 每次都更新
      language: "zh-CN",
      updatedAt: new Date()
    },
    $setOnInsert: {
      createdAt: new Date(),   // 仅在插入时设置
      defaultSettings: true,
      role: "user"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

// 不存在时：创建新配置，包含 $set + $setOnInsert 的所有字段
// 存在时：只更新 $set 中的字段，保留 createdAt 和 role
```

### 示例 4：统计数据 - 计数器

```javascript
// 页面访问统计（自动初始化计数器）
const stats = await collection("page_stats").findOneAndUpdate(
  { 
    page: "/home",
    date: "2026-01-28"
  },
  {
    $inc: { views: 1 }  // 不存在时自动初始化为 0 再加 1
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

console.log("今日访问量:", stats.views);
```

---

## 🔍 判断是否为新插入

```javascript
const result = await collection("users").findOneAndUpdate(
  { email: "new@example.com" },
  { $set: { name: "New User" } },
  {
    upsert: true,
    returnDocument: "after",
    includeResultMetadata: true  // 🔑 获取完整元数据
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

## 📚 其他支持 Upsert 的方法

| 方法 | 返回值 | 推荐度 |
|------|--------|--------|
| **`findOneAndUpdate()`** | 文档对象 | ⭐⭐⭐⭐⭐ 推荐 |
| `updateOne()` | 操作统计 | ⭐⭐⭐⭐ |
| `updateMany()` | 操作统计 | ⭐⭐⭐ |
| `replaceOne()` | 操作统计 | ⭐⭐ |

### `updateOne()` 示例

如果不需要返回文档内容，可以使用 `updateOne()`（性能更好）：

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

## ⚠️ 重要注意事项

### 1. 必须使用更新操作符

```javascript
// ❌ 错误
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { name: "Alice" },  // 错误！缺少操作符
  { upsert: true }
);

// ✅ 正确
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { name: "Alice" } },  // 使用 $set
  { upsert: true }
);
```

### 2. `$setOnInsert` 只在插入时生效

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastLogin: new Date() },        // 每次都更新
    $setOnInsert: { createdAt: new Date() } // 仅在插入时设置
  },
  { upsert: true }
);

// 第一次执行（插入）: 
//   { userId: "user123", lastLogin: <now>, createdAt: <now> }
// 第二次执行（更新）: 
//   { userId: "user123", lastLogin: <now>, createdAt: <第一次的时间> }
```

---

## 📖 详细文档

- **[Upsert 操作完整指南](./upsert-guide.md)** - 包含所有场景和最佳实践
- **[findOneAndUpdate() 文档](./find-one-and-update.md)** - 详细 API 说明
- **[updateOne() 文档](./update-one.md)** - 简单场景的替代方案

---

**日期**: 2026-01-28  
**版本**: v1.1.2
