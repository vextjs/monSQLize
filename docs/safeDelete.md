# safeDelete 扩展方法

> **版本**: v1.2.0+  
> **类型**: 扩展方法  
> **优先级**: P0

---

## 📋 概述

`safeDelete` 是一个强大的扩展方法，用于安全删除文档。它在删除前自动检查依赖关系，防止孤儿数据和生产事故，支持软删除用于数据审计。

---

## 🎯 核心特性

| 特性 | 说明 |
|------|------|
| **依赖检查** | 删除前自动检查关联数据，防止孤儿数据 |
| **软删除** | 保留数据用于审计（deletedAt + deletedBy + deleteReason）|
| **代码减少** | 10+行原生代码 → 3行扩展方法（减少 80%）|
| **灵活配置** | 支持 allowCount、自定义错误消息 |
| **事务支持** | 完整支持 MongoDB 事务（session 参数）|

---

## 📖 API 签名

```typescript
safeDelete(
  query: Object,
  options?: SafeDeleteOptions
): Promise<SafeDeleteResult>

interface SafeDeleteOptions {
  checkDependencies?: Array<DependencyCheck>;  // 依赖检查配置
  soft?: boolean;                              // 是否软删除（默认: false）
  softDeleteField?: string;                    // 软删除字段名（默认: 'deletedAt'）
  softDeleteValue?: any;                       // 软删除字段值（默认: new Date()）
  additionalFields?: Object;                   // 软删除时的额外字段
  maxTimeMS?: number;                          // 查询超时时间
  comment?: string;                            // 查询注释
  session?: ClientSession;                     // MongoDB 会话（事务支持）
}

interface DependencyCheck {
  collection: string;                          // 依赖集合名
  query: Object;                               // 依赖查询条件
  allowCount?: number;                         // 允许的依赖数量（默认: 0）
  errorMessage?: string;                       // 自定义错误消息
}

interface SafeDeleteResult {
  deletedCount: number;                        // 删除的文档数量
  dependencyChecks: Array<{                    // 依赖检查结果
    collection: string;
    count: number;
    allowCount: number;
    passed: boolean;
  }>;
}
```

---

## 🚀 使用场景

### 场景 1: 删除用户前检查依赖关系

**业务需求**: 删除用户前检查是否有未完成订单、已发布文章等，防止数据孤儿。

#### ❌ 原生实现（10+行，容易出错）

```javascript
// 原生 API 需要 10+ 行代码
const userId = new ObjectId('...');

// 手动检查订单
const pendingOrders = await Order.countDocuments({
  userId,
  status: { $in: ['pending', 'paid'] }
});

if (pendingOrders > 0) {
  throw new Error('用户有未完成的订单');
}

// 手动检查文章
const publishedPosts = await Post.countDocuments({
  authorId: userId,
  published: true
});

if (publishedPosts > 0) {
  throw new Error('用户有已发布的文章');
}

// 删除用户
await User.deleteOne({ _id: userId });

// 问题：
// 1. 代码冗长（10+行）
// 2. 容易遗漏依赖检查
// 3. 错误消息不统一
// 4. 没有审计日志
```

#### ✅ safeDelete（3 行，安全可靠）

```javascript
try {
  const result = await User.safeDelete(
    { _id: userId },
    {
      checkDependencies: [
        {
          collection: 'orders',
          query: { userId, status: { $in: ['pending', 'paid'] } },
          errorMessage: '用户有未完成的订单'
        },
        {
          collection: 'posts',
          query: { authorId: userId, published: true },
          errorMessage: '用户有已发布的文章'
        }
      ]
    }
  );
  
  console.log('删除成功', result);
  // { deletedCount: 1, dependencyChecks: [...] }
} catch (err) {
  console.error('删除失败:', err.message);
  // "无法删除：用户有未完成的订单 (2 条记录)"
}

// 优势：
// ✅ 3 行代码（减少 70%）
// ✅ 自动检查所有依赖
// ✅ 统一错误消息格式
// ✅ 返回详细检查结果
```

---

### 场景 2: 软删除用户（数据审计）

**业务需求**: 用户注销时不立即删除数据，而是标记为已删除，保留用于审计和数据恢复。

#### ❌ 原生实现

```javascript
// 原生 API
const userId = new ObjectId('...');
const adminId = new ObjectId('...');

await User.updateOne(
  { _id: userId },
  {
    $set: {
      deletedAt: new Date(),
      deletedBy: adminId,
      deleteReason: '用户注销'
    }
  }
);

// 问题：
// 1. 没有依赖检查
// 2. 需要手动构建更新对象
// 3. 容易拼写错误字段名
```

#### ✅ safeDelete（软删除）

```javascript
const result = await User.safeDelete(
  { _id: userId },
  {
    checkDependencies: [
      {
        collection: 'orders',
        query: { userId, status: 'pending' },
        errorMessage: '用户有未完成的订单'
      }
    ],
    soft: true,
    additionalFields: {
      deletedBy: adminId,
      deleteReason: '用户注销',
      deletedBalance: user.balance  // 记录删除时的余额
    }
  }
);

// 数据库中的结果：
// {
//   _id: ObjectId('...'),
//   name: 'Alice',
//   email: 'alice@example.com',
//   deletedAt: ISODate('2024-12-04T12:00:00Z'),
//   deletedBy: ObjectId('...'),
//   deleteReason: '用户注销',
//   deletedBalance: 0
// }

// 优势：
// ✅ 数据保留用于审计
// ✅ 记录删除人和原因
// ✅ 可以恢复数据
// ✅ 依然检查依赖关系
```

---

### 场景 3: 删除商品（允许少量依赖）

**业务需求**: 删除商品前检查订单引用，允许已完成订单存在，但不允许未完成订单。允许少量购物车引用（自动清理）。

#### ✅ safeDelete（allowCount 配置）

```javascript
const result = await Product.safeDelete(
  { _id: productId },
  {
    checkDependencies: [
      {
        collection: 'order_items',
        query: { productId, orderStatus: { $in: ['pending', 'paid', 'shipping'] } },
        errorMessage: '商品在未完成的订单中'
      },
      {
        collection: 'cart_items',
        query: { productId },
        allowCount: 10,  // 允许 <= 10 个购物车引用
        errorMessage: '商品在过多购物车中'
      }
    ]
  }
);

// 检查结果：
// {
//   deletedCount: 1,
//   dependencyChecks: [
//     { collection: 'order_items', count: 0, allowCount: 0, passed: true },
//     { collection: 'cart_items', count: 3, allowCount: 10, passed: true }
//   ]
// }

// 删除成功后，清理购物车引用
if (result.deletedCount > 0) {
  await CartItem.deleteMany({ productId });
}

// 优势：
// ✅ 灵活的 allowCount 配置
// ✅ 返回详细的依赖统计
// ✅ 可以根据结果做后续清理
```

---

## ⚙️ 选项详解

### checkDependencies - 依赖检查配置

**类型**: `Array<Object>`  
**默认**: `[]`（不检查依赖）

```javascript
checkDependencies: [
  {
    collection: 'orders',              // 依赖集合名
    query: { userId, status: 'pending' },  // 查询条件
    allowCount: 0,                     // 允许的数量（默认: 0）
    errorMessage: '用户有未完成的订单'   // 自定义错误消息
  }
]
```

**工作流程**:
1. 执行 `db.collection(collection).countDocuments(query)`
2. 如果 `count > allowCount`，阻止删除
3. 返回检查结果：`{ collection, count, allowCount, passed }`

---

### soft - 软删除

**类型**: `boolean`  
**默认**: `false`（硬删除）

```javascript
// 硬删除（默认）
await User.safeDelete({ _id: userId });
// 数据库中文档被永久删除

// 软删除
await User.safeDelete({ _id: userId }, { soft: true });
// 数据库中文档仍然存在，但有 deletedAt 字段
```

---

### softDeleteField - 软删除字段名

**类型**: `string`  
**默认**: `'deletedAt'`

```javascript
// 使用默认字段名
await User.safeDelete({ _id: userId }, { soft: true });
// { deletedAt: ISODate('2024-12-04T12:00:00Z') }

// 使用自定义字段名
await User.safeDelete({ _id: userId }, {
  soft: true,
  softDeleteField: 'removedAt'
});
// { removedAt: ISODate('2024-12-04T12:00:00Z') }
```

---

### softDeleteValue - 软删除字段值

**类型**: `any`  
**默认**: `new Date()`

```javascript
// 使用默认值（当前时间）
await User.safeDelete({ _id: userId }, { soft: true });
// { deletedAt: ISODate('2024-12-04T12:00:00Z') }

// 使用自定义值
await User.safeDelete({ _id: userId }, {
  soft: true,
  softDeleteValue: true  // 布尔标记
});
// { deletedAt: true }

await User.safeDelete({ _id: userId }, {
  soft: true,
  softDeleteValue: 'archived'  // 字符串状态
});
// { deletedAt: 'archived' }
```

---

### additionalFields - 额外字段

**类型**: `Object`  
**默认**: `{}`

```javascript
await User.safeDelete({ _id: userId }, {
  soft: true,
  additionalFields: {
    deletedBy: currentUserId,
    deleteReason: '用户注销',
    deletedBalance: user.balance,
    deletedAt_timestamp: Date.now()
  }
});

// 数据库中的结果：
// {
//   _id: ObjectId('...'),
//   name: 'Alice',
//   deletedAt: ISODate('2024-12-04T12:00:00Z'),
//   deletedBy: ObjectId('...'),
//   deleteReason: '用户注销',
//   deletedBalance: 0,
//   deletedAt_timestamp: 1701691200000
// }
```

**常见用途**:
- `deletedBy`: 记录删除操作的用户
- `deleteReason`: 删除原因
- `deletedBalance`: 删除时的余额
- `deletedOrderCount`: 删除时的订单数量

---

### session - 事务支持

**类型**: `ClientSession`  
**默认**: 无

```javascript
const session = await client.startSession();
session.startTransaction();

try {
  // 软删除用户
  await User.safeDelete({ _id: userId }, { soft: true, session });
  
  // 清理用户会话
  await Session.deleteMany({ userId }, { session });
  
  // 记录审计日志
  await AuditLog.insertOne({
    action: 'user_delete',
    userId,
    timestamp: new Date()
  }, { session });
  
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

---

## 🔄 与其他方法对比

| 方法 | 行为 | 依赖检查 | 软删除 | 适用场景 |
|------|------|---------|--------|---------|
| **safeDelete** | 检查后删除 | ✅ 自动检查 | ✅ 支持 | 用户删除、商品下架 |
| **deleteOne** | 直接删除 | ❌ 无 | ❌ 无 | 简单删除场景 |
| **deleteMany** | 批量删除 | ❌ 无 | ❌ 无 | 批量清理 |
| **findOneAndDelete** | 查询并删除 | ❌ 无 | ❌ 无 | 需要返回删除的文档 |

**核心区别**:
- `safeDelete`: 删除前**自动检查依赖**，防止孤儿数据
- `deleteOne`: **直接删除**，不检查依赖（快速但不安全）

---

## 📊 性能建议

### 1. 依赖检查性能优化

```javascript
// ❌ 避免：没有索引的依赖检查
await User.safeDelete({ _id: userId }, {
  checkDependencies: [
    {
      collection: 'orders',
      query: { userId }  // userId 字段必须有索引
    }
  ]
});

// ✅ 推荐：确保依赖字段有索引
await Order.createIndex({ userId: 1 });
await Post.createIndex({ authorId: 1 });

await User.safeDelete({ _id: userId }, {
  checkDependencies: [
    { collection: 'orders', query: { userId } },
    { collection: 'posts', query: { authorId: userId } }
  ]
});
```

---

### 2. 软删除查询优化

```javascript
// 创建软删除索引（查询未删除数据）
await User.createIndex({ deletedAt: 1 });

// 查询未删除的用户
const activeUsers = await User.find({ deletedAt: { $exists: false } });

// 查询已删除的用户（审计）
const deletedUsers = await User.find({ deletedAt: { $exists: true } });
```

---

## ⚠️ 注意事项

### 1. 依赖集合必须存在

```javascript
// ❌ 错误：依赖集合不存在
await User.safeDelete({ _id: userId }, {
  checkDependencies: [
    { collection: 'non_existent_collection', query: { userId } }
  ]
});
// 可能抛出错误或返回 count: 0

// ✅ 正确：确保依赖集合存在
const collections = await db.listCollections().toArray();
const collectionNames = collections.map(c => c.name);

if (collectionNames.includes('orders')) {
  // 检查订单依赖
}
```

---

### 2. allowCount 的语义

```javascript
// allowCount 的含义：count <= allowCount 时通过

// 允许 0 个（默认）
{ allowCount: 0 }  // count 必须 = 0

// 允许 <= 5 个
{ allowCount: 5 }  // count 可以是 0, 1, 2, 3, 4, 5

// 允许 <= 10 个
{ allowCount: 10 }  // count 可以是 0 到 10
```

---

### 3. 软删除不影响查询

```javascript
// 软删除用户
await User.safeDelete({ _id: userId }, { soft: true });

// ⚠️ 默认查询仍然能查到已删除的用户
const user = await User.findOne({ _id: userId });
// user 存在，但有 deletedAt 字段

// ✅ 查询未删除的用户（推荐）
const activeUser = await User.findOne({ _id: userId, deletedAt: { $exists: false } });

// ✅ 或者使用应用层过滤
const users = await User.find({});
const activeUsers = users.filter(u => !u.deletedAt);
```

---

### 4. 硬删除无法恢复

```javascript
// 硬删除（默认）
await User.safeDelete({ _id: userId });
// 数据永久删除，无法恢复

// ✅ 推荐：重要数据使用软删除
await User.safeDelete({ _id: userId }, { soft: true });
// 数据仍然存在，可以恢复
```

---

## 📝 完整示例

### 示例 1: 用户管理系统

```javascript
// 删除用户前的完整检查
async function deleteUser(userId, adminId, reason) {
  try {
    const result = await User.safeDelete(
      { _id: userId },
      {
        checkDependencies: [
          {
            collection: 'orders',
            query: { userId, status: { $in: ['pending', 'paid', 'shipping'] } },
            errorMessage: '用户有未完成的订单'
          },
          {
            collection: 'posts',
            query: { authorId: userId, published: true },
            errorMessage: '用户有已发布的文章'
          },
          {
            collection: 'comments',
            query: { userId },
            allowCount: 100,  // 允许少量评论
            errorMessage: '用户有过多评论'
          }
        ],
        soft: true,
        additionalFields: {
          deletedBy: adminId,
          deleteReason: reason,
          deletedAt_timestamp: Date.now()
        }
      }
    );

    // 记录审计日志
    await AuditLog.insertOne({
      action: 'user_delete',
      userId,
      adminId,
      reason,
      timestamp: new Date(),
      dependencyChecks: result.dependencyChecks
    });

    return { success: true, result };

  } catch (error) {
    console.error('删除用户失败:', error.message);
    return { success: false, error: error.message };
  }
}

// 使用
const result = await deleteUser(
  userId,
  currentAdminId,
  '违反社区规则'
);
```

---

### 示例 2: 电商商品下架

```javascript
// 下架商品前的检查和清理
async function removeProduct(productId) {
  const result = await Product.safeDelete(
    { _id: productId },
    {
      checkDependencies: [
        {
          collection: 'order_items',
          query: { productId, orderStatus: { $in: ['pending', 'paid', 'shipping'] } },
          errorMessage: '商品在未完成的订单中'
        },
        {
          collection: 'cart_items',
          query: { productId },
          allowCount: 50,  // 允许少量购物车引用
          errorMessage: '商品在过多购物车中'
        }
      ],
      soft: true,
      softDeleteField: 'removedAt',
      additionalFields: {
        removedReason: 'out_of_stock',
        removedBy: 'system'
      }
    }
  );

  // 删除成功后，清理购物车引用
  if (result.deletedCount > 0) {
    const cartResult = await CartItem.deleteMany({ productId });
    console.log(`清理了 ${cartResult.deletedCount} 个购物车引用`);
  }

  return result;
}
```

---

## 🐛 错误处理

### 常见错误

```javascript
// 1. 依赖检查失败
try {
  await User.safeDelete({ _id: userId }, {
    checkDependencies: [
      { collection: 'orders', query: { userId, status: 'pending' } }
    ]
  });
} catch (err) {
  console.error(err.message);
  // "无法删除：无法删除：orders 中有 2 条关联数据 (2 条记录)"
}

// 2. 参数错误
try {
  await User.safeDelete('invalid');
} catch (err) {
  console.error(err.message);  // "query 必须是对象"
}

// 3. 依赖配置错误
try {
  await User.safeDelete({ _id: userId }, {
    checkDependencies: [
      { query: { userId } }  // 缺少 collection
    ]
  });
} catch (err) {
  console.error(err.message);  // "依赖检查配置必须包含 collection 和 query"
}
```

---

## 📚 相关文档

- [deleteOne](./deleteOne.md) - 直接删除文档
- [deleteMany](./deleteMany.md) - 批量删除文档
- [findOneAndDelete](./findOneAndDelete.md) - 查询并删除

---

> **文档版本**: v1.2.0  
> **最后更新**: 2024-12-04  
> **维护者**: monSQLize Team

