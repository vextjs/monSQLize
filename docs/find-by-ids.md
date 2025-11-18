# findByIds() - 批量通过 _id 查询多个文档

## 方法概述

`findByIds` 是一个便利方法，用于批量通过 `_id` 数组查询多个文档，简化了 `find({ _id: { $in: ids } })` 的使用。

### 为什么需要 findByIds？

**传统方式**（使用 `find`）：
```javascript
// ❌ 需要手动构建 $in 查询，且需要转换 ObjectId
const { ObjectId } = require('mongodb');
const users = await collection('users').find({
  _id: { $in: userIds.map(id => new ObjectId(id)) }
}).toArray();
```

**使用 findByIds**：
```javascript
// ✅ 自动转换 ObjectId，自动去重，代码简洁
const users = await collection('users').findByIds(userIds);
```

### 核心优势

| 优势 | 说明 |
|------|------|
| **自动类型转换** | 字符串 ID 自动转换为 ObjectId |
| **自动去重** | 重复的 ID 只查询一次 |
| **性能优化** | 1 次查询替代 N 次查询 |
| **代码简化** | 减少 75% 的样板代码 |

---

## 方法签名

```typescript
async findByIds(
  ids: Array<string | ObjectId>,
  options?: {
    projection?: Object,
    sort?: Object,
    cache?: number,
    maxTimeMS?: number,
    comment?: string,
    preserveOrder?: boolean
  }
): Promise<Array<Document>>
```

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ids` | Array<string \| ObjectId> | ✅ | _id 数组（支持字符串和 ObjectId 混合） |
| `options` | Object | ❌ | 查询选项 |
| `options.projection` | Object | ❌ | 字段投影（同 find） |
| `options.sort` | Object | ❌ | 排序方式 |
| `options.cache` | number | ❌ | 缓存时间（毫秒） |
| `options.maxTimeMS` | number | ❌ | 查询超时（毫秒） |
| `options.comment` | string | ❌ | 查询注释 |
| `options.preserveOrder` | boolean | ❌ | 是否保持 ids 数组的顺序（默认 false） |

### 返回值说明

返回文档数组，不存在的 ID 不会返回结果。

---

## 基础示例

### 示例 1：批量查询文档（字符串 ID）

```javascript
const userIds = [
  '507f1f77bcf86cd799439011',
  '507f1f77bcf86cd799439012',
  '507f1f77bcf86cd799439013'
];

const users = await collection('users').findByIds(userIds);
console.log(`找到 ${users.length} 个用户`);
```

### 示例 2：批量查询文档（ObjectId）

```javascript
const { ObjectId } = require('mongodb');
const userIds = [
  new ObjectId('507f1f77bcf86cd799439011'),
  new ObjectId('507f1f77bcf86cd799439012')
];

const users = await collection('users').findByIds(userIds);
```

### 示例 3：混合类型（字符串 + ObjectId）

```javascript
const userIds = [
  '507f1f77bcf86cd799439011',  // 字符串
  new ObjectId('507f1f77bcf86cd799439012'),  // ObjectId
  '507f1f77bcf86cd799439013'   // 字符串
];

const users = await collection('users').findByIds(userIds);
```

### 示例 4：使用 projection（只返回特定字段）

```javascript
const users = await collection('users').findByIds(userIds, {
  projection: { name: 1, email: 1, role: 1 }
});

// 结果只包含 _id, name, email, role
```

### 示例 5：使用 sort（排序结果）

```javascript
const users = await collection('users').findByIds(userIds, {
  sort: { name: 1 }  // 按名称升序
});
```

### 示例 6：保持原始顺序

```javascript
const orderedIds = ['id3', 'id1', 'id2'];
const users = await collection('users').findByIds(orderedIds, {
  preserveOrder: true  // 结果顺序与 orderedIds 一致
});
```

---

## 真实场景示例

### 场景 1：批量查询用户资料（关联查询）

从评论列表中提取用户 ID，批量查询用户资料。

```javascript
// 评论列表
const comments = [
  { _id: 1, userId: '507f...011', content: 'Great!' },
  { _id: 2, userId: '507f...012', content: 'Nice!' },
  { _id: 3, userId: '507f...011', content: 'Thanks!' }  // 重复
];

// 提取唯一用户 ID
const userIds = [...new Set(comments.map(c => c.userId))];

// 批量查询用户
const users = await collection('users').findByIds(userIds, {
  projection: { name: 1, avatar: 1 }
});

// 构建用户映射
const userMap = new Map(users.map(u => [u._id.toString(), u]));

// 填充评论的用户信息
const commentsWithUser = comments.map(comment => ({
  ...comment,
  user: userMap.get(comment.userId)
}));

console.log(commentsWithUser);
```

### 场景 2：批量权限验证

检查多个用户是否有特定权限。

```javascript
async function checkUsersPermission(userIds, requiredPermission) {
  const users = await collection('users').findByIds(userIds, {
    projection: { permissions: 1, role: 1 }
  });

  const authorized = users.filter(user => 
    user.role === 'admin' || 
    user.permissions?.includes(requiredPermission)
  );

  return {
    total: userIds.length,
    authorized: authorized.length,
    authorizedIds: authorized.map(u => u._id.toString())
  };
}

// 使用
const result = await checkUsersPermission(
  ['user1', 'user2', 'user3'],
  'edit_content'
);
console.log(`${result.authorized}/${result.total} 用户有权限`);
```

### 场景 3：批量数据导出（保持顺序）

按指定顺序导出用户数据。

```javascript
async function exportUsers(orderedUserIds) {
  const users = await collection('users').findByIds(orderedUserIds, {
    projection: { password: 0, internalNotes: 0 },  // 排除敏感字段
    preserveOrder: true  // 保持导出顺序
  });

  // 转换为 CSV 格式
  const csv = users.map(user => 
    `${user._id},${user.name},${user.email},${user.role}`
  ).join('\n');

  return csv;
}

// 使用
const csvData = await exportUsers(['id1', 'id2', 'id3']);
```

### 场景 4：批量数据预加载（缓存）

预加载热门用户数据到缓存。

```javascript
async function preloadPopularUsers() {
  // 获取热门用户 ID
  const popularUserIds = await collection('stats')
    .aggregate([
      { $sort: { views: -1 } },
      { $limit: 100 },
      { $project: { userId: 1 } }
    ]);

  const ids = popularUserIds.map(s => s.userId);

  // 批量查询并缓存（1 小时）
  const users = await collection('users').findByIds(ids, {
    cache: 60 * 60 * 1000  // 1 小时
  });

  console.log(`预加载了 ${users.length} 个热门用户`);
  return users;
}
```

### 场景 5：批量好友信息查询

查询用户的所有好友信息。

```javascript
async function getUserFriends(userId) {
  // 获取用户的好友列表
  const user = await collection('users').findOne(
    { _id: new ObjectId(userId) },
    { projection: { friends: 1 } }
  );

  if (!user || !user.friends || user.friends.length === 0) {
    return [];
  }

  // 批量查询好友信息
  const friends = await collection('users').findByIds(user.friends, {
    projection: { name: 1, avatar: 1, status: 1 }
  });

  return friends;
}

// 使用
const friends = await getUserFriends('507f1f77bcf86cd799439011');
console.log(`该用户有 ${friends.length} 个好友`);
```

### 场景 6：批量通知发送

根据用户 ID 列表批量发送通知。

```javascript
async function sendBatchNotifications(userIds, notification) {
  // 批量查询用户（只需要通知设置和联系方式）
  const users = await collection('users').findByIds(userIds, {
    projection: { 
      email: 1, 
      phone: 1, 
      notificationSettings: 1 
    }
  });

  const results = {
    email: 0,
    sms: 0,
    skipped: 0
  };

  for (const user of users) {
    // 根据用户偏好发送通知
    if (user.notificationSettings?.email) {
      await sendEmail(user.email, notification);
      results.email++;
    }
    
    if (user.notificationSettings?.sms) {
      await sendSMS(user.phone, notification);
      results.sms++;
    }
    
    if (!user.notificationSettings?.email && !user.notificationSettings?.sms) {
      results.skipped++;
    }
  }

  return results;
}
```

---

## 选项参数详解

### projection - 字段投影

只返回需要的字段，减少数据传输量。

```javascript
// 只返回 name 和 email
const users = await collection('users').findByIds(userIds, {
  projection: { name: 1, email: 1 }
});

// 排除敏感字段
const users = await collection('users').findByIds(userIds, {
  projection: { password: 0, secretKey: 0 }
});
```

### sort - 排序

对结果进行排序。

```javascript
// 按名称升序
const users = await collection('users').findByIds(userIds, {
  sort: { name: 1 }
});

// 按创建时间降序
const users = await collection('users').findByIds(userIds, {
  sort: { createdAt: -1 }
});
```

### cache - 缓存

缓存查询结果，加速重复查询。

```javascript
// 缓存 5 分钟
const users = await collection('users').findByIds(userIds, {
  cache: 5 * 60 * 1000
});
```

### maxTimeMS - 查询超时

限制查询最大执行时间。

```javascript
const users = await collection('users').findByIds(userIds, {
  maxTimeMS: 5000  // 最多 5 秒
});
```

### comment - 查询注释

用于日志追踪和性能分析。

```javascript
const users = await collection('users').findByIds(userIds, {
  comment: 'CommentAPI:loadUsers:v1.2'
});
```

### preserveOrder - 保持顺序

结果顺序与输入 ids 数组一致。

```javascript
const orderedIds = ['id3', 'id1', 'id2'];
const users = await collection('users').findByIds(orderedIds, {
  preserveOrder: true
});

// users[0]._id === 'id3'
// users[1]._id === 'id1'
// users[2]._id === 'id2'
```

---

## 性能说明

### 性能对比

| 方法 | 查询次数 | 平均耗时 | 推荐场景 |
|------|---------|---------|---------|
| **findByIds(100个)** | 1次 | 10-20ms | ✅ 批量查询 |
| **find({ _id: { $in }})** | 1次 | 10-20ms | ⚠️ 需要手动处理 |
| **findOneById x100** | 100次 | 1000-2000ms | ❌ 不推荐 |

### 性能优化建议

1. **使用 projection 减少数据量**
   ```javascript
   // ✅ 推荐：只查询需要的字段
   const users = await collection('users').findByIds(ids, {
     projection: { name: 1, email: 1 }
   });
   ```

2. **启用缓存加速重复查询**
   ```javascript
   // ✅ 推荐：缓存热门数据
   const users = await collection('users').findByIds(hotUserIds, {
     cache: 60000  // 1 分钟
   });
   ```

3. **避免过大的 ID 数组**
   ```javascript
   // ❌ 避免：一次查询超过 1000 个
   const users = await collection('users').findByIds(tenThousandIds);

   // ✅ 推荐：分批查询
   const batchSize = 100;
   const results = [];
   for (let i = 0; i < ids.length; i += batchSize) {
     const batch = await collection('users').findByIds(
       ids.slice(i, i + batchSize)
     );
     results.push(...batch);
   }
   ```

---

## 错误处理

### 错误类型

| 错误类型 | 错误码 | 触发条件 |
|---------|--------|---------|
| **参数错误** | `INVALID_ARGUMENT` | ids 不是数组或包含无效 ID |
| **超时错误** | `QUERY_TIMEOUT` | 超过 maxTimeMS |

### 错误处理示例

```javascript
try {
  const users = await collection('users').findByIds(userIds);
  
  // 检查缺失的用户
  const foundIds = new Set(users.map(u => u._id.toString()));
  const missingIds = userIds.filter(id => !foundIds.has(id));
  
  if (missingIds.length > 0) {
    console.warn(`未找到 ${missingIds.length} 个用户:`, missingIds);
  }
} catch (error) {
  if (error.code === 'INVALID_ARGUMENT') {
    console.error('参数错误:', error.message);
  } else if (error.code === 'QUERY_TIMEOUT') {
    console.error('查询超时');
  } else {
    console.error('未知错误:', error);
  }
}
```

---

## 最佳实践

### ✅ 推荐做法

1. **使用 findByIds 替代循环查询**
   ```javascript
   // ✅ 推荐：1 次查询
   const users = await collection('users').findByIds(userIds);
   
   // ❌ 避免：N 次查询
   const users = await Promise.all(
     userIds.map(id => collection('users').findOneById(id))
   );
   ```

2. **自动去重，无需手动处理**
   ```javascript
   // ✅ 推荐：自动去重
   const users = await collection('users').findByIds(userIds);
   
   // ❌ 不需要手动去重
   const uniqueIds = [...new Set(userIds)];
   const users = await collection('users').findByIds(uniqueIds);
   ```

3. **检查缺失的 ID**
   ```javascript
   // ✅ 推荐：检查缺失
   const users = await collection('users').findByIds(userIds);
   if (users.length < userIds.length) {
     console.warn('部分用户不存在');
   }
   ```

### ❌ 避免的做法

1. **避免过大的 ID 数组**
   ```javascript
   // ❌ 避免：一次查询 10000+ 个
   const users = await collection('users').findByIds(hugeIdArray);
   
   // ✅ 推荐：分批查询
   const users = await batchQuery(hugeIdArray, 100);
   ```

2. **避免重复查询**
   ```javascript
   // ❌ 避免：每次都查询
   for (const comment of comments) {
     const user = await collection('users').findOneById(comment.userId);
   }
   
   // ✅ 推荐：批量查询
   const userIds = [...new Set(comments.map(c => c.userId))];
   const users = await collection('users').findByIds(userIds);
   ```

---

## 与其他方法对比

### vs findOneById

| 维度 | findByIds | findOneById |
|------|-----------|-------------|
| **查询数量** | 批量（N 个） | 单个 |
| **查询次数** | 1 次 | N 次 |
| **性能** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **使用场景** | 批量关联查询 | 单个文档查询 |

### vs find({ _id: { $in }})

| 维度 | findByIds | find({ _id: { $in }}) |
|------|-----------|-----------------------|
| **代码行数** | 1 行 | 3-5 行 |
| **自动转换 ObjectId** | ✅ | ❌ |
| **自动去重** | ✅ | ❌ |
| **代码可读性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 常见问题

### Q1: findByIds 和 find 有什么区别？

**A**: `findByIds` 是 `find({ _id: { $in: ids } })` 的便利方法：
- ✅ 自动转换 ObjectId（字符串 → ObjectId）
- ✅ 自动去重（重复 ID 只查询一次）
- ✅ 更简洁的 API

### Q2: 如何处理不存在的 ID？

**A**: `findByIds` 只返回存在的文档，不存在的 ID 不会返回结果。

```javascript
const users = await collection('users').findByIds([
  'existingId1',
  'nonExistentId',  // 不存在
  'existingId2'
]);
// users.length === 2（只返回存在的）
```

### Q3: 支持多少个 ID？

**A**: 理论上没有限制，但建议：
- 单次查询 ≤ 1000 个 ID（性能最优）
- 超过 1000 个建议分批查询

### Q4: preserveOrder 选项有性能影响吗？

**A**: 有轻微影响（需要重新排序），但通常可以忽略：
- 无 preserveOrder: O(n)
- 有 preserveOrder: O(n log n)

### Q5: 会自动去重吗？

**A**: ✅ 是的！重复的 ID 只会查询一次。

```javascript
const users = await collection('users').findByIds([
  'id1', 'id1', 'id2', 'id2', 'id2'  // 重复
]);
// 实际只查询 ['id1', 'id2']（自动去重）
```

### Q6: 支持缓存吗？

**A**: ✅ 支持！使用 `cache` 选项。

```javascript
const users = await collection('users').findByIds(ids, {
  cache: 60000  // 缓存 1 分钟
});
```

### Q7: 性能如何？

**A**: 性能优秀：
- 有索引：10-20ms（查询 100 个）
- 无索引：50-100ms（全表扫描）

**优化建议**: `_id` 字段默认有索引，无需额外创建。

---

## 另请参阅

- [findOneById()](./find-one-by-id.md) - 通过 _id 查询单个文档
- [find()](./find.md) - 基础查询方法
- [findOne()](./find-one.md) - 查询单个文档
- [MongoDB 官方文档：$in 操作符](https://www.mongodb.com/docs/manual/reference/operator/query/in/)

