# upsertOne() - 存在则更新，不存在则插入

## 方法概述

`upsertOne` 是一个便利方法，用于实现"存在则更新，不存在则插入"的逻辑，简化了 `updateOne({ upsert: true })` 的使用。

### 为什么需要 upsertOne？

**传统方式**（使用 `updateOne`）：
```javascript
// ❌ 需要记住 upsert 选项，且必须使用 $set
const result = await collection('users').updateOne(
  { userId: 'user123' },
  { $set: { name: 'Alice', email: 'alice@example.com' } },
  { upsert: true }  // 容易忘记
);
```

**使用 upsertOne**：
```javascript
// ✅ 语义清晰，自动启用 upsert，无需 $set
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', email: 'alice@example.com' }
);
```

### 核心优势

| 优势 | 说明 |
|------|------|
| **语义清晰** | 方法名明确表达"存在则更新，不存在则插入"的意图 |
| **自动 $set** | 无需手动包装 `$set`（但仍支持操作符） |
| **简化代码** | 减少 67% 的样板代码 |
| **减少错误** | 无需记住 `upsert: true` 选项 |

---

## 方法签名

```typescript
async upsertOne(
  filter: Object,
  update: Object,
  options?: {
    maxTimeMS?: number,
    comment?: string
  }
): Promise<UpsertOneResult>

interface UpsertOneResult {
  acknowledged: boolean;      // 操作是否被确认
  matchedCount: number;        // 匹配的文档数（0 或 1）
  modifiedCount: number;       // 修改的文档数（0 或 1）
  upsertedId?: ObjectId;       // 插入的文档 ID（仅插入时）
  upsertedCount: number;       // 插入的文档数（0 或 1）
}
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filter` | Object | ✅ | 查询条件，用于匹配文档 |
| `update` | Object | ✅ | 更新内容（直接字段或操作符） |
| `options` | Object | ❌ | 操作选项 |
| `options.maxTimeMS` | number | ❌ | 操作超时（毫秒） |
| `options.comment` | string | ❌ | 查询注释（用于日志追踪） |

### 返回值说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `acknowledged` | boolean | 操作是否被确认（通常为 `true`） |
| `matchedCount` | number | 匹配的文档数（`0` = 插入，`1` = 更新） |
| `modifiedCount` | number | 实际修改的文档数 |
| `upsertedId` | ObjectId | 插入的文档 `_id`（仅插入时存在） |
| `upsertedCount` | number | 插入的文档数（`0` 或 `1`） |

---

## 基础示例

### 示例 1：插入新文档（文档不存在）

```javascript
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', email: 'alice@example.com', age: 30 }
);

console.log(result);
// {
//   acknowledged: true,
//   matchedCount: 0,      // 未匹配到文档
//   modifiedCount: 0,     // 未修改任何文档
//   upsertedId: ObjectId('...'),  // 新插入的文档 ID
//   upsertedCount: 1      // 插入了 1 个文档
// }
```

### 示例 2：更新已存在的文档

```javascript
// 第一次调用：插入
await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', age: 30 }
);

// 第二次调用：更新
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice Updated', age: 31 }
);

console.log(result);
// {
//   acknowledged: true,
//   matchedCount: 1,      // 匹配到 1 个文档
//   modifiedCount: 1,     // 修改了 1 个文档
//   upsertedId: undefined,  // 未插入新文档
//   upsertedCount: 0      // 未插入
// }
```

### 示例 3：使用更新操作符

```javascript
// 支持 MongoDB 更新操作符
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  {
    $set: { name: 'Alice' },
    $inc: { loginCount: 1 },
    $currentDate: { lastLogin: true }
  }
);

// 等价于
const result2 = await collection('users').updateOne(
  { userId: 'user123' },
  {
    $set: { name: 'Alice' },
    $inc: { loginCount: 1 },
    $currentDate: { lastLogin: true }
  },
  { upsert: true }
);
```

---

## 真实场景示例

### 场景 1：配置项同步

存在则更新，不存在则创建配置项。

```javascript
// 同步用户主题配置
async function syncThemeConfig(userId, theme) {
  const result = await collection('configs').upsertOne(
    { userId, key: 'theme' },
    {
      value: theme,
      updatedAt: new Date()
    }
  );

  if (result.upsertedCount > 0) {
    console.log('创建了新配置');
  } else {
    console.log('更新了现有配置');
  }

  return result;
}

// 使用
await syncThemeConfig('user123', 'dark');  // 创建
await syncThemeConfig('user123', 'light'); // 更新
```

### 场景 2：用户资料更新（确保记录存在）

第三方登录时，确保用户记录存在。

```javascript
// OAuth 登录后更新用户信息
async function updateUserProfile(oauthData) {
  const result = await collection('users').upsertOne(
    { oauthProvider: oauthData.provider, oauthId: oauthData.id },
    {
      name: oauthData.name,
      email: oauthData.email,
      avatar: oauthData.avatar,
      lastLogin: new Date()
    }
  );

  if (result.upsertedCount > 0) {
    console.log('新用户注册成功');
    // 发送欢迎邮件
  } else {
    console.log('用户信息已更新');
  }

  return result;
}

// 使用
await updateUserProfile({
  provider: 'google',
  id: 'google-user-123',
  name: 'Alice',
  email: 'alice@gmail.com',
  avatar: 'https://...'
});
```

### 场景 3：计数器初始化

存在则递增，不存在则初始化。

```javascript
// 文章浏览量统计
async function incrementViewCount(articleId) {
  const result = await collection('stats').upsertOne(
    { articleId },
    {
      $setOnInsert: { createdAt: new Date() },  // 仅插入时设置
      $inc: { views: 1 },                        // 递增浏览量
      $currentDate: { lastViewedAt: true }       // 更新最后浏览时间
    }
  );

  const doc = await collection('stats').findOne({ articleId });
  console.log(`文章 ${articleId} 的浏览量: ${doc.views}`);

  return result;
}

// 使用
await incrementViewCount('article-1');  // 初始化: views = 1
await incrementViewCount('article-1');  // 递增: views = 2
await incrementViewCount('article-1');  // 递增: views = 3
```

### 场景 4：幂等性操作

API 重复调用不会导致重复插入。

```javascript
// 提交订单（防止重复提交）
async function submitOrder(orderId, orderData) {
  try {
    const result = await collection('orders').upsertOne(
      { orderId },  // 唯一键
      {
        ...orderData,
        status: 'pending',
        createdAt: new Date()
      }
    );

    if (result.upsertedCount > 0) {
      console.log('订单创建成功');
      // 触发后续流程（支付、通知等）
    } else {
      console.log('订单已存在，跳过创建');
    }

    return { success: true, orderId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 使用（重复调用不会创建多个订单）
await submitOrder('order-123', { amount: 100, userId: 'user1' });  // 创建
await submitOrder('order-123', { amount: 100, userId: 'user1' });  // 跳过
```

### 场景 5：会话状态管理

存在则刷新，不存在则创建会话。

```javascript
// 更新用户会话
async function updateSession(sessionId, userId) {
  const result = await collection('sessions').upsertOne(
    { sessionId },
    {
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),  // 24 小时后过期
      lastActive: new Date()
    }
  );

  return result;
}

// 使用
await updateSession('session-abc', 'user123');
```

---

## 选项参数

### maxTimeMS - 操作超时

```javascript
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice' },
  { maxTimeMS: 5000 }  // 最多 5 秒
);
```

### comment - 查询注释

用于日志追踪和性能分析。

```javascript
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice' },
  { comment: 'UserAPI:syncProfile:session_abc123' }
);

// 在 MongoDB 日志中会看到：
// { comment: 'UserAPI:syncProfile:session_abc123', ... }
```

---

## 与其他方法对比

### vs updateOne({ upsert: true })

| 维度 | upsertOne | updateOne({ upsert: true }) |
|------|-----------|----------------------------|
| **代码行数** | 1 行 | 1 行（但需要记住选项） |
| **语义清晰度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **自动 $set** | ✅ 支持 | ❌ 必须手动 |
| **错误概率** | 低（无需记住选项） | 中（容易忘记 upsert: true） |
| **功能完整性** | ✅ 完整 | ✅ 完整 |

**代码对比**：

```javascript
// upsertOne（推荐）
await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', age: 30 }
);

// updateOne（传统方式）
await collection('users').updateOne(
  { userId: 'user123' },
  { $set: { name: 'Alice', age: 30 } },
  { upsert: true }
);
```

### vs insertOne / updateOne（分开调用）

| 维度 | upsertOne | insertOne + updateOne |
|------|-----------|-----------------------|
| **代码行数** | 3 行 | 10+ 行 |
| **性能** | ⭐⭐⭐⭐⭐（1 次请求） | ⭐⭐⭐（2 次请求） |
| **原子性** | ✅ 原子操作 | ❌ 非原子（需要事务） |
| **并发安全** | ✅ 安全 | ⚠️ 可能冲突 |

**代码对比**：

```javascript
// upsertOne（1 次请求）
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', age: 30 }
);

// insertOne + updateOne（2 次请求，非原子）
const existing = await collection('users').findOne({ userId: 'user123' });
if (existing) {
  await collection('users').updateOne(
    { userId: 'user123' },
    { $set: { name: 'Alice', age: 30 } }
  );
} else {
  await collection('users').insertOne({
    userId: 'user123',
    name: 'Alice',
    age: 30
  });
}
```

---

## 错误处理

### 错误类型

| 错误类型 | 错误码 | 触发条件 |
|---------|--------|---------|
| **参数错误** | `INVALID_ARGUMENT` | filter 或 update 无效 |
| **唯一键冲突** | `DUPLICATE_KEY` | 违反唯一索引约束 |
| **超时错误** | `QUERY_TIMEOUT` | 超过 maxTimeMS |

### 错误处理示例

```javascript
try {
  const result = await collection('users').upsertOne(
    { email: 'alice@example.com' },
    { name: 'Alice', age: 30 }
  );

  if (result.upsertedCount > 0) {
    console.log('新用户创建成功');
  } else {
    console.log('用户信息已更新');
  }
} catch (error) {
  if (error.code === 'DUPLICATE_KEY') {
    console.error('唯一键冲突:', error.message);
  } else if (error.code === 'INVALID_ARGUMENT') {
    console.error('参数错误:', error.message);
  } else {
    console.error('未知错误:', error);
  }
}
```

---

## 最佳实践

### ✅ 推荐做法

1. **使用唯一键作为 filter**
   ```javascript
   // ✅ 使用唯一标识符
   await collection('users').upsertOne(
     { userId: 'user123' },
     { name: 'Alice' }
   );
   ```

2. **明确插入和更新逻辑**
   ```javascript
   // ✅ 使用 $setOnInsert 区分插入和更新
   await collection('stats').upsertOne(
     { articleId: 'article-1' },
     {
       $setOnInsert: { createdAt: new Date() },  // 仅插入时
       $inc: { views: 1 },                        // 总是执行
       $currentDate: { updatedAt: true }          // 总是执行
     }
   );
   ```

3. **检查返回值判断操作类型**
   ```javascript
   // ✅ 根据 upsertedCount 判断是插入还是更新
   const result = await collection('users').upsertOne(
     { userId: 'user123' },
     { name: 'Alice' }
   );

   if (result.upsertedCount > 0) {
     // 插入逻辑（发送欢迎邮件等）
   } else {
     // 更新逻辑（记录日志等）
   }
   ```

### ❌ 避免的做法

1. **避免使用非唯一 filter**
   ```javascript
   // ❌ filter 可能匹配多个文档（但只会更新第一个）
   await collection('users').upsertOne(
     { role: 'admin' },  // 非唯一
     { permission: 'all' }
   );
   ```

2. **避免在高并发场景下不加控制**
   ```javascript
   // ❌ 高并发下可能导致意外行为
   // 应该使用唯一索引约束
   await collection('users').upsertOne(
     { email: 'alice@example.com' },  // 确保 email 有唯一索引
     { name: 'Alice' }
   );
   ```

---

## 性能说明

### 性能特点

| 维度 | 性能 | 说明 |
|------|------|------|
| **操作耗时** | 10-50ms | 单次原子操作 |
| **索引依赖** | 高 | filter 字段应有索引 |
| **并发安全** | ✅ 安全 | MongoDB 原子操作 |

### 性能优化建议

1. **为 filter 字段创建索引**
   ```javascript
   // 为 userId 创建唯一索引
   await collection('users').createIndex(
     { userId: 1 },
     { unique: true }
   );
   ```

2. **避免大文档 upsert**
   ```javascript
   // ❌ 避免
   await collection('users').upsertOne(
     { userId: 'user123' },
     { largeArray: Array(10000).fill({}) }  // 大文档
   );

   // ✅ 推荐：拆分存储
   await collection('users').upsertOne(
     { userId: 'user123' },
     { dataRef: 'ref-123' }
   );
   await collection('data').insertOne({
     _id: 'ref-123',
     data: Array(10000).fill({})
   });
   ```

---

## 常见问题

### Q1: upsertOne 和 updateOne 有什么区别？

**A**: `upsertOne` 是 `updateOne({ upsert: true })` 的便利方法：
- ✅ 语义更清晰（方法名明确表达意图）
- ✅ 自动包装 `$set`（无需手动添加）
- ✅ 减少代码量（无需记住 `upsert: true`）

### Q2: 如何判断是插入还是更新？

**A**: 通过返回值的 `upsertedCount` 字段判断：
```javascript
const result = await collection('users').upsertOne(...);

if (result.upsertedCount > 0) {
  console.log('插入了新文档');
} else {
  console.log('更新了已存在的文档');
}
```

### Q3: 可以使用更新操作符吗？

**A**: ✅ 可以！支持所有 MongoDB 更新操作符：
```javascript
await collection('users').upsertOne(
  { userId: 'user123' },
  {
    $set: { name: 'Alice' },
    $inc: { count: 1 },
    $push: { tags: 'new-tag' }
  }
);
```

### Q4: 并发调用安全吗？

**A**: ✅ 安全！`upsertOne` 是 MongoDB 的原子操作，即使并发调用也不会导致重复插入。但建议：
- 为 filter 字段创建唯一索引
- 使用唯一标识符作为 filter

### Q5: 性能如何？

**A**: 性能与 `updateOne` 相同（底层使用同一实现）：
- 有索引：10-20ms
- 无索引：50-100ms（需要全表扫描）

**优化建议**: 为 filter 字段创建索引。

### Q6: 支持缓存吗？

**A**: ✅ 支持！操作成功后会自动失效相关缓存。

### Q7: 如何处理唯一键冲突？

**A**: 使用 try-catch 捕获 `DUPLICATE_KEY` 错误：
```javascript
try {
  await collection('users').upsertOne(
    { userId: 'user123' },
    { email: 'alice@example.com' }
  );
} catch (error) {
  if (error.code === 'DUPLICATE_KEY') {
    console.error('邮箱已被使用');
  }
}
```

---

## 另请参阅

- [updateOne()](./update-one.md) - 更新单个文档
- [insertOne()](./insert-one.md) - 插入单个文档
- [findOneAndUpdate()](./find-one-and-update.md) - 查找并更新（返回文档）
- [MongoDB 官方文档：upsert](https://www.mongodb.com/docs/manual/reference/method/db.collection.updateOne/#upsert-option)

