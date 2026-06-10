# incrementOne() - 原子递增/递减字段值

## 📑 目录

- [方法概述](#方法概述)
- [方法签名](#方法签名)
- [基础示例](#基础示例)
- [真实场景示例](#真实场景示例)
- [选项参数详解](#选项参数详解)
- [性能说明](#性能说明)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)
- [与其他方法对比](#与其他方法对比)
- [常见问题](#常见问题)
- [另请参阅](#另请参阅)

---

## 方法概述

`incrementOne` 是一个便利方法，用于原子地递增或递减单个文档的字段值，简化了 `updateOne({ $inc })` 的使用。

### 为什么需要 incrementOne？

**传统方式**（使用 `updateOne`）：
```javascript
// ❌ 需要构建 $inc 更新对象
await collection('users').updateOne(
  { userId: 'user123' },
  { $inc: { loginCount: 1 } }
);
```

**使用 incrementOne**：
```javascript
// ✅ 更简洁直观
await collection('users').incrementOne(
  { userId: 'user123' },
  'loginCount'
);
```

### 核心优势

| 优势 | 说明 |
|------|------|
| **原子操作** | 并发安全，无竞态条件 |
| **代码简洁** | 减少 60% 的样板代码 |
| **直观易读** | 语义清晰 |
| **返回结果** | 可选返回更新前/后的文档 |

---

## 方法签名

```typescript
async incrementOne(
  filter: Object,
  field: string | Object,
  increment?: number,
  options?: {
    returnDocument?: 'before' | 'after',
    projection?: Object,
    maxTimeMS?: number,
    comment?: string
  }
): Promise<IncrementOneResult>

interface IncrementOneResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  value: Document | null;  // 更新后（或前）的文档
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filter` | Object | ✅ | 查询条件 |
| `field` | string \| Object | ✅ | 字段名（单字段）或字段-增量对象（多字段） |
| `increment` | number | ❌ | 增量（默认 1，负数为递减） |
| `options` | Object | ❌ | 操作选项 |
| `options.returnDocument` | string | ❌ | 返回时机（'before' \| 'after'，默认 'after'） |
| `options.projection` | Object | ❌ | 字段投影 |
| `options.maxTimeMS` | number | ❌ | 操作超时（毫秒） |
| `options.comment` | string | ❌ | 查询注释 |

---

## 基础示例

### 示例 1：递增（默认 +1）

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  'loginCount'
);
// loginCount 递增 1
```

### 示例 2：指定增量

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  'points',
  50
);
// points 增加 50
```

### 示例 3：递减（负数）

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  'credits',
  -30
);
// credits 减少 30
```

### 示例 4：多字段同时操作

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  {
    loginCount: 1,    // +1
    points: 20,       // +20
    credits: -10      // -10
  }
);
```

### 示例 5：返回更新后的文档

```javascript
const result = await collection('users').incrementOne(
  { userId: 'user123' },
  'points',
  50
);

console.log(result.value.points);  // 更新后的值
```

---

## 真实场景示例

### 场景 1：登录次数统计

```javascript
async function recordLogin(userId) {
  const result = await collection('users').incrementOne(
    { userId },
    'loginCount'
  );
  
  console.log(`用户登录次数: ${result.value.loginCount}`);
  return result;
}
```

### 场景 2：积分系统

```javascript
// 完成任务，获得积分
async function earnPoints(userId, points) {
  const result = await collection('users').incrementOne(
    { userId },
    'points',
    points
  );
  
  console.log(`当前积分: ${result.value.points}`);
  return result;
}

// 兑换商品，扣除积分
async function spendPoints(userId, points) {
  const result = await collection('users').incrementOne(
    { userId },
    'points',
    -points
  );
  
  if (result.value.points < 0) {
    throw new Error('积分不足');
  }
  
  return result;
}
```

### 场景 3：文章浏览量

```javascript
async function incrementViews(articleId) {
  await collection('articles').incrementOne(
    { articleId },
    'views'
  );
}
```

### 场景 4：库存管理

```javascript
// 进货
async function addStock(productId, quantity) {
  const result = await collection('products').incrementOne(
    { productId },
    'stock',
    quantity
  );
  
  return result.value.stock;
}

// 出货
async function reduceStock(productId, quantity) {
  const result = await collection('products').incrementOne(
    { productId },
    'stock',
    -quantity,
    { returnDocument: 'before' }
  );
  
  // 检查库存是否足够
  if (result.value.stock < quantity) {
    throw new Error('库存不足');
  }
  
  return result;
}
```

### 场景 5：多维度统计

```javascript
async function recordArticleInteraction(articleId, action) {
  const increments = {};
  
  if (action === 'view') increments.views = 1;
  if (action === 'like') increments.likes = 1;
  if (action === 'share') increments.shares = 1;
  
  await collection('articles').incrementOne(
    { articleId },
    increments
  );
}
```

---

## 选项参数详解

### returnDocument - 返回时机

```javascript
// 返回更新后的文档（默认）
const result = await collection('users').incrementOne(
  { userId: 'user123' },
  'count',
  5,
  { returnDocument: 'after' }
);
console.log(result.value.count);  // 15

// 返回更新前的文档
const result2 = await collection('users').incrementOne(
  { userId: 'user123' },
  'count',
  5,
  { returnDocument: 'before' }
);
console.log(result2.value.count);  // 10（更新前的值）
```

### projection - 字段投影

```javascript
const result = await collection('users').incrementOne(
  { userId: 'user123' },
  'points',
  50,
  { projection: { points: 1, name: 1 } }
);
// 只返回 _id, points, name 字段
```

---

## 性能说明

### 原子性保证

`incrementOne` 使用 MongoDB 的 `$inc` 操作符，保证原子性：
- ✅ 并发安全
- ✅ 无竞态条件
- ✅ 不需要事务

### 性能对比

| 方法 | 操作步骤 | 并发安全 | 性能 |
|------|---------|---------|------|
| **incrementOne** | 1步（原子） | ✅ | ⭐⭐⭐⭐⭐ |
| **find + update** | 2步（非原子） | ❌ | ⭐⭐⭐ |

---

## 错误处理

### 错误类型

| 错误类型 | 错误码 | 触发条件 |
|---------|--------|---------|
| **参数错误** | `INVALID_ARGUMENT` | filter/field/increment 无效 |
| **超时错误** | `QUERY_TIMEOUT` | 超过 maxTimeMS |

### 错误处理示例

```javascript
try {
  const result = await collection('users').incrementOne(
    { userId: 'user123' },
    'points',
    50
  );
  
  if (result.matchedCount === 0) {
    console.log('用户不存在');
  }
} catch (error) {
  if (error.code === 'INVALID_ARGUMENT') {
    console.error('参数错误:', error.message);
  } else {
    console.error('未知错误:', error);
  }
}
```

---

## 最佳实践

### ✅ 推荐做法

1. **使用 incrementOne 替代 find + update**
   ```javascript
   // ✅ 推荐：原子操作
   await collection('users').incrementOne(
     { userId: 'user123' },
     'count',
     1
   );
   
   // ❌ 避免：非原子操作（竞态条件）
   const user = await collection('users').findOne({ userId: 'user123' });
   await collection('users').updateOne(
     { userId: 'user123' },
     { $set: { count: user.count + 1 } }
   );
   ```

2. **检查返回值**
   ```javascript
   const result = await collection('users').incrementOne(
     { userId: 'user123' },
     'points',
     50
   );
   
   if (result.matchedCount === 0) {
     throw new Error('用户不存在');
   }
   ```

### ❌ 避免的做法

1. **避免在循环中使用**
   ```javascript
   // ❌ 避免：N 次操作
   for (const userId of userIds) {
     await collection('users').incrementOne({ userId }, 'count');
   }
   
   // ✅ 推荐：使用 updateMany
   await collection('users').updateMany(
     { userId: { $in: userIds } },
     { $inc: { count: 1 } }
   );
   ```

---

## 与其他方法对比

### vs updateOne({ $inc })

| 维度 | incrementOne | updateOne({ $inc }) |
|------|-------------|---------------------|
| **代码行数** | 1-2 行 | 2-3 行 |
| **可读性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **功能** | 等价 | 等价 |

---

## 常见问题

### Q1: incrementOne 和 updateOne 有什么区别？

**A**: `incrementOne` 是 `updateOne({ $inc })` 的便利方法，语义更清晰，代码更简洁。

### Q2: 支持并发吗？

**A**: ✅ 是的！`incrementOne` 是原子操作，并发安全。

### Q3: 可以递减吗？

**A**: ✅ 可以！使用负数即可：
```javascript
await collection('users').incrementOne({ userId: 'user123' }, 'credits', -10);
```

### Q4: 字段不存在时会怎样？

**A**: MongoDB 会自动创建字段，从 0 开始递增。

### Q5: 如何同时操作多个字段？

**A**: 使用对象形式：
```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  { count: 1, points: 10 }
);
```

---

## 另请参阅

- [updateOne()](./update-one.md) - 更新单个文档
- [findOneAndUpdate()](./find-one-and-update.md) - 查找并更新
- [upsertOne()](./upsert-one.md) - 存在则更新，不存在则插入
- [MongoDB 官方文档：$inc 操作符](https://www.mongodb.com/docs/manual/reference/operator/update/inc/)

