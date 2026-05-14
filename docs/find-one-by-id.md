# findOneById 方法详细文档

## 📑 目录

- [概述](#概述)
- [为什么需要 findOneById？](#为什么需要-findoneyid)
- [方法签名](#方法签名)
- [使用示例](#使用示例)
- [真实场景示例](#真实场景示例)
- [错误处理](#错误处理)
- [性能说明](#性能说明)
- [与其他方法对比](#与其他方法对比)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [相关文档](#相关文档)

---

## 概述

`findOneById` 是 monSQLize 提供的便利方法，用于通过 `_id` 快速查询单个文档。它自动处理字符串到 ObjectId 的转换，简化了最常见的查询场景。

## 为什么需要 findOneById？

### 问题：样板代码过多

```javascript
// ❌ 传统方式：需要手动处理 ObjectId 转换
const { ObjectId } = require('mongodb');
const userId = '507f1f77bcf86cd799439011';  // 来自请求参数
const user = await collection('users').findOne({ 
  _id: new ObjectId(userId)  // 手动转换
});
```

### 解决方案：findOneById

```javascript
// ✅ 使用 findOneById：自动转换，简洁清晰
const userId = '507f1f77bcf86cd799439011';
const user = await collection('users').findOneById(userId);  // 自动转换 ✨
```

**收益**:
- ✅ 减少 80% 的样板代码
- ✅ 自动类型转换（字符串 → ObjectId）
- ✅ 更清晰的语义（明确表示通过 ID 查询）
- ✅ 完整的参数验证和错误处理

---

## 方法签名

```javascript
async findOneById(id, options = {})
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | String \| ObjectId | 是 | 文档的 `_id`，字符串会自动转换为 ObjectId |
| `options` | Object | 否 | 查询选项，与 `findOne` 选项相同 |

### options 对象属性

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `projection` | Object/Array | 否 | - | 字段投影配置 |
| `cache` | Number | 否 | `0` | 缓存 TTL（毫秒） |
| `maxTimeMS` | Number | 否 | 全局配置 | 查询超时时间（毫秒） |
| `comment` | String | 否 | - | 查询注释（用于日志追踪） |

### 返回值

```typescript
Promise<Object|null>
```

- **成功**: 返回查询到的文档对象
- **不存在**: 返回 `null`
- **错误**: 抛出异常

---

## 使用示例

### 1. 基础用法

#### 1.1 字符串 ID（最常用）

```javascript
// 从请求参数获取字符串 ID
const userId = req.params.id;  // "507f1f77bcf86cd799439011"

// 自动转换为 ObjectId 并查询
const user = await collection('users').findOneById(userId);

if (user) {
  console.log('用户名:', user.name);
} else {
  console.log('用户不存在');
}
```

#### 1.2 ObjectId（直接使用）

```javascript
const { ObjectId } = require('mongodb');

// 如果已经是 ObjectId，直接传入
const userId = new ObjectId('507f1f77bcf86cd799439011');
const user = await collection('users').findOneById(userId);
```

### 2. 字段投影

#### 2.1 对象格式投影

```javascript
// 只返回需要的字段
const user = await collection('users').findOneById(userId, {
  projection: { name: 1, email: 1, avatar: 1 }
});

// 结果: { _id: ..., name: "Alice", email: "alice@example.com", avatar: "..." }
// 不包含: password, createdAt, updatedAt 等
```

#### 2.2 数组格式投影

```javascript
// 数组格式更简洁
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar']
});

// 等价于: { name: 1, email: 1, avatar: 1 }
```

#### 2.3 排除敏感字段

```javascript
// 排除 password 字段（安全性）
const user = await collection('users').findOneById(userId, {
  projection: { password: 0, salt: 0 }
});
```

### 3. 缓存使用

#### 3.1 启用缓存

```javascript
// 缓存 5 秒（减少数据库压力）
const user = await collection('users').findOneById(userId, {
  cache: 5000
});

// 第 1 次：查询数据库（10-50ms）
// 第 2 次：从缓存返回（0.001ms） ⚡
```

#### 3.2 缓存与投影结合

```javascript
// 缓存用户基本信息
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar'],
  cache: 10000  // 缓存 10 秒
});
```

### 4. 超时控制

```javascript
// 设置查询超时（防止慢查询）
const user = await collection('users').findOneById(userId, {
  maxTimeMS: 3000  // 最多 3 秒
});
```

### 5. 查询注释（生产环境监控）

```javascript
// 添加注释用于日志追踪
const user = await collection('users').findOneById(userId, {
  comment: 'UserAPI:getProfile:session_abc123'
});

// MongoDB 日志中会显示该注释，便于定位慢查询
```

---

## 真实场景示例

### 场景 1: RESTful API - 获取用户详情

```javascript
// GET /api/users/:id
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await collection('users').findOneById(req.params.id, {
      projection: { password: 0, salt: 0 },  // 排除敏感字段
      cache: 5000,                           // 缓存 5 秒
      maxTimeMS: 3000                        // 超时 3 秒
    });

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ data: user });
  } catch (error) {
    if (error.message.includes('无效的 ObjectId')) {
      return res.status(400).json({ error: '无效的用户 ID' });
    }
    throw error;
  }
});
```

### 场景 2: 权限验证

```javascript
// 中间件：验证用户是否有权访问资源
async function checkOwnership(req, res, next) {
  const { id } = req.params;
  const currentUserId = req.user.id;

  try {
    const resource = await collection('articles').findOneById(id, {
      projection: ['authorId'],  // 只需要 authorId
      cache: 5000
    });

    if (!resource) {
      return res.status(404).json({ error: '资源不存在' });
    }

    if (resource.authorId !== currentUserId) {
      return res.status(403).json({ error: '无权访问' });
    }

    next();
  } catch (error) {
    next(error);
  }
}
```

### 场景 3: 关联数据查询

```javascript
// 查询订单及其用户信息
async function getOrderWithUser(orderId) {
  // 1. 查询订单
  const order = await collection('orders').findOneById(orderId);
  
  if (!order) {
    throw new Error('订单不存在');
  }

  // 2. 查询用户信息
  const user = await collection('users').findOneById(order.userId, {
    projection: ['name', 'email', 'phone'],
    cache: 10000  // 用户信息缓存 10 秒
  });

  return {
    ...order,
    user  // 嵌入用户信息
  };
}
```

### 场景 4: 批量查询优化

```javascript
// 查询多个用户详情（注意：这里适合用 findByIds，但先用 findOneById 示例）
async function getUsersByIds(userIds) {
  const users = await Promise.all(
    userIds.map(id => 
      collection('users').findOneById(id, {
        projection: ['name', 'email', 'avatar'],
        cache: 5000
      })
    )
  );

  // 过滤掉不存在的用户
  return users.filter(user => user !== null);
}

// ⚠️ 提示：如果需要批量查询，推荐使用 findByIds（阶段2计划实现）
```

### 场景 5: 缓存失效处理

```javascript
// 更新用户后，缓存自动失效
async function updateUser(userId, updates) {
  // 1. 更新用户
  await collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: updates }
  );
  // ✅ 缓存自动失效

  // 2. 查询最新数据（从数据库获取）
  const user = await collection('users').findOneById(userId, {
    projection: { password: 0 }
  });

  return user;
}
```

---

## 错误处理

### 常见错误

#### 1. 无效的 ID 格式

```javascript
try {
  const user = await collection('users').findOneById('invalid-id');
} catch (error) {
  console.error(error.message);
  // "无效的 ObjectId 格式: "invalid-id""
}
```

#### 2. 空 ID

```javascript
try {
  const user = await collection('users').findOneById(null);
} catch (error) {
  console.error(error.message);
  // "id 参数是必需的"
}
```

#### 3. 错误的参数类型

```javascript
try {
  const user = await collection('users').findOneById(12345);  // 数字
} catch (error) {
  console.error(error.message);
  // "id 必须是字符串或 ObjectId 实例"
}
```

### 错误处理最佳实践

```javascript
async function getUserById(userId) {
  try {
    const user = await collection('users').findOneById(userId, {
      projection: { password: 0 },
      cache: 5000,
      maxTimeMS: 3000
    });

    if (!user) {
      return {
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在'
      };
    }

    return {
      success: true,
      data: user
    };
  } catch (error) {
    if (error.message.includes('无效的 ObjectId')) {
      return {
        success: false,
        error: 'INVALID_ID',
        message: '无效的用户 ID'
      };
    }

    // 重新抛出其他错误
    throw error;
  }
}
```

---

## 性能说明

### 性能对比

| 方法 | 查询时间（无缓存） | 查询时间（缓存命中） | 代码复杂度 |
|------|------------------|---------------------|-----------|
| `findOne({ _id })` | 10-50ms | 不支持 | ⭐⭐⭐ |
| `findOneById` | 10-50ms | 0.001ms | ⭐ |

**结论**: 
- 无缓存时性能相当
- 有缓存时 `findOneById` 更快（支持缓存）
- 代码简洁度 `findOneById` 获胜

### 性能优化建议

#### 1. 合理使用缓存

```javascript
// ✅ 推荐：用户基本信息缓存 10 秒
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar'],
  cache: 10000
});

// ❌ 不推荐：实时性要求高的数据不要缓存
const balance = await collection('accounts').findOneById(accountId, {
  projection: ['balance'],
  cache: 0  // 不缓存余额
});
```

#### 2. 使用字段投影

```javascript
// ✅ 推荐：只查询需要的字段
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email']  // 只返回 2 个字段
});

// ❌ 不推荐：返回所有字段（包括大字段）
const user = await collection('users').findOneById(userId);
// 可能包含 avatar（大图片）、history（大数组）等
```

#### 3. 设置合理超时

```javascript
// ✅ 推荐：设置超时防止慢查询
const user = await collection('users').findOneById(userId, {
  maxTimeMS: 3000  // 3 秒超时
});
```

---

## 与其他方法对比

### vs findOne

| 维度 | findOne | findOneById |
|------|---------|-------------|
| **查询方式** | `findOne({ _id: ... })` | `findOneById(id)` |
| **自动转换** | ❌ 需要手动 | ✅ 自动转换 |
| **代码长度** | 3 行 | 1 行 |
| **语义清晰** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **灵活性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

**使用建议**:
- 通过 `_id` 查询 → 使用 `findOneById` ✅
- 复杂查询条件 → 使用 `findOne` ✅

### 代码对比

```javascript
// ❌ 使用 findOne（传统方式）
const { ObjectId } = require('mongodb');
const userId = req.params.id;

const user = await collection('users').findOne(
  { _id: new ObjectId(userId) },  // 手动转换
  { projection: { password: 0 } }
);

// ✅ 使用 findOneById（推荐方式）
const userId = req.params.id;

const user = await collection('users').findOneById(userId, {
  projection: { password: 0 }
});

// 代码减少 30%，语义更清晰
```

---

## 最佳实践

### 1. 统一使用 findOneById

```javascript
// ✅ 推荐：通过 ID 查询统一使用 findOneById
const user = await collection('users').findOneById(userId);
const order = await collection('orders').findOneById(orderId);
const product = await collection('products').findOneById(productId);

// ❌ 不推荐：混用两种方式
const user = await collection('users').findOne({ _id: new ObjectId(userId) });
const order = await collection('orders').findOneById(orderId);
```

### 2. 排除敏感字段

```javascript
// ✅ 推荐：始终排除敏感字段
const user = await collection('users').findOneById(userId, {
  projection: { password: 0, salt: 0, token: 0 }
});
```

### 3. 添加查询注释（生产环境）

```javascript
// ✅ 推荐：生产环境添加注释
const user = await collection('users').findOneById(userId, {
  comment: `${req.service}:getUser:${req.traceId}`
});
```

### 4. 合理设置缓存

```javascript
// ✅ 推荐：根据数据特性设置缓存
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'avatar'],
  cache: 10000  // 基本信息缓存 10 秒
});

const balance = await collection('accounts').findOneById(accountId, {
  projection: ['balance'],
  cache: 0  // 余额不缓存（实时性要求高）
});
```

---

## 常见问题

### Q1: findOneById 和 findOne({ _id }) 有什么区别？

**A**: 功能相同，但 `findOneById` 更简洁：

1. **自动类型转换**: 字符串自动转 ObjectId
2. **更清晰的语义**: 明确表示通过 ID 查询
3. **更少的样板代码**: 减少 30% 代码量

### Q2: 可以查询其他字段吗？

**A**: 不可以，`findOneById` 专门用于通过 `_id` 查询。如果需要查询其他字段，请使用 `findOne`。

```javascript
// ❌ 错误：findOneById 只能查询 _id
// 不存在 findOneByUserId 这样的方法

// ✅ 正确：使用 findOne 查询其他字段
const user = await collection('users').findOne({ userId: 'USER-001' });
```

### Q3: 支持链式调用吗？

**A**: 不支持。`findOneById` 直接返回 Promise，不支持链式调用。如果需要链式调用，请使用 `findOne`。

```javascript
// ❌ 不支持
const user = await collection('users')
  .findOneById(userId)
  .project({ name: 1 });  // 错误！

// ✅ 使用选项对象
const user = await collection('users').findOneById(userId, {
  projection: { name: 1 }
});
```

### Q4: 如何处理 ID 不存在的情况？

**A**: 返回 `null`，需要手动检查。

```javascript
const user = await collection('users').findOneById(userId);

if (!user) {
  // 处理不存在的情况
  throw new Error('用户不存在');
}

// 继续处理
```

### Q5: 性能如何？

**A**: 与 `findOne({ _id })` 性能相当，都使用 `_id` 索引，非常快（通常 <10ms）。如果启用缓存，第二次查询只需 0.001ms。

---

## 相关文档

- [findOne 方法文档](./findOne.md)
- [find 方法文档](./find.md)
- [缓存系统文档](./cache.md)
- [字段投影文档](./find.md#projection-配置)

---

**最后更新**: 2025-11-18

