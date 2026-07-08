# findOneById Reference

## 概述

`findOneById(id, options)` 是一个可选的 `_id` 查询 helper。它会校验并归一化 id，然后通过 MongoDB adapter 的同一套查询 helper 执行 `_id` 查询。

普通 `_id` 查询不需要额外记这个方法。标准查询 API 也支持 ObjectId 自动转换，主路径可以直接写：

```javascript
const userId = '507f1f77bcf86cd799439011';  // 来自请求参数
const user = await collection('users').findOne({ _id: userId });
```

当项目希望把“只按 `_id` 查询”写成独立 helper，或需要兼容既有代码时，可以使用 `findOneById()`：

```javascript
const userId = '507f1f77bcf86cd799439011';
const user = await collection('users').findOneById(userId);
```

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
| `projection` / `project` | Object/Array | 否 | - | 字段投影配置。`project` 是 `projection` 的别名；两者同时存在时 `projection` 优先。 |
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

// 第一次读取会查询数据库。
// 缓存有效期内的重复读取可以从缓存返回。
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
// 单次请求批量查询多个用户详情
async function getUsersByIds(userIds) {
  return collection('users').findByIds(userIds, {
    projection: { name: 1, email: 1, avatar: 1 },
    cache: 5000,
    preserveOrder: true
  });
}

// 提示：单个文档按 ID 查询用 findOneById()；批量 ID 查询用 findByIds()。
```

### 场景 5: 显式缓存失效处理

```javascript
async function updateUser(userId, updates) {
  // 1. 更新用户
  await collection('users').updateOne(
    { _id: new ObjectId(userId) },
    { $set: updates },
    {
      cache: {
        invalidate: [{
          operation: 'findOneById',
          id: userId,
          options: { projection: { password: 0 } }
        }]
      }
    }
  );
  // 上面的 cache.invalidate 会清理对应的 ID 查询缓存。

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

## 使用建议

### 只缓存可接受短暂延迟的数据

```javascript
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email', 'avatar'],
  cache: 10000
});

const balance = await collection('accounts').findOneById(accountId, {
  projection: ['balance'],
  cache: 0  // 不缓存余额
});
```

### 使用字段投影缩小返回体积

```javascript
const user = await collection('users').findOneById(userId, {
  projection: ['name', 'email']
});
```

### 对延迟敏感路径设置超时

```javascript
const user = await collection('users').findOneById(userId, {
  maxTimeMS: 3000  // 3 秒超时
});
```

---

## 与其他方法对比

### vs findOne

| 维度 | `findOne({ _id })` | `findOneById(id)` |
|------|---------|-------------|
| ObjectId 自动转换 | 支持 | 支持 |
| 查询形态 | 任意 filter | 仅 `_id` |
| 链式 API | 使用普通查询 API | 不支持链式；直接传 options |
| 适合场景 | 主查询路径 | 可选 id-only helper/reference |

### 代码对比

```javascript
const userId = req.params.id;

const user = await collection('users').findOne(
  { _id: userId },
  { projection: { password: 0 } }
);

const userId = req.params.id;

const user = await collection('users').findOneById(userId, {
  projection: { password: 0 }
});
```

---

## 最佳实践

### 1. 排除敏感字段

```javascript
const user = await collection('users').findOneById(userId, {
  projection: { password: 0, salt: 0, token: 0 }
});
```

### 2. 对需要追踪的路径添加查询注释

```javascript
const user = await collection('users').findOneById(userId, {
  comment: `${req.service}:getUser:${req.traceId}`
});
```

### 3. 按数据新鲜度设置缓存

```javascript
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

**A**: 在当前 MongoDB adapter 中，二者用于 `_id` 查询时功能等价，都支持 ObjectId 自动转换。`findOneById` 是紧凑的 id-only helper；`findOne({ _id })` 仍是主查询路径，并支持普通 filter 组合。

### Q2: 可以查询其他字段吗？

**A**: 不可以，`findOneById` 专门用于通过 `_id` 查询。如果需要查询其他字段，请使用 `findOne`。

```javascript
// 不存在 findOneByUserId 这样的方法

const user = await collection('users').findOne({ userId: 'USER-001' });
```

### Q3: 支持链式调用吗？

**A**: 不支持。`findOneById` 直接返回 Promise，不支持链式调用。如果需要链式调用，请使用 `findOne`。

```javascript
const user = await collection('users')
  .findOneById(userId)
  .project({ name: 1 });  // 错误！

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

**A**: 它使用与 `findOne({ _id })` 相同的 `_id` 查询形态。实际延迟取决于部署、网络、driver options、缓存配置和文档大小；请以 MongoDB profile 或你的 APM 数据为准。

---

## 相关文档

- [findOne 方法文档](./findOne.md)
- [find 方法文档](./find.md)
- [缓存系统文档](./cache.md)
- [字段投影文档](./find.md#projection-配置)

