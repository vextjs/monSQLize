# ObjectId 自动转换

> **版本**: v1.3.0+  
> **类型**: 功能特性  
> **分类**: 数据类型处理

---

## 📑 目录

- [概述](#概述)
- [为什么需要自动转换](#为什么需要自动转换)
- [转换规则](#转换规则)
- [配置选项](#配置选项)
- [使用示例](#使用示例)
- [支持的方法](#支持的方法)
- [高级配置](#高级配置)
- [性能考量](#性能考量)
- [常见问题](#常见问题)

---

## 概述

从 v1.3.0 版本开始，monSQLize 支持 **ObjectId 字符串自动转换** 功能。当你在查询条件、更新操作或删除操作中使用 ObjectId 字符串时，monSQLize 会自动将其转换为 MongoDB 的 ObjectId 对象。

**核心优势**:
- ✅ **简化代码**: 无需手动调用 `new ObjectId()`
- ✅ **提升开发效率**: 直接使用字符串，代码更简洁
- ✅ **自动识别**: 智能判断是否为有效的 ObjectId 字符串
- ✅ **深度转换**: 支持嵌套对象和数组中的 ObjectId
- ✅ **安全可控**: 支持排除特定字段，防止误转换

---

## 为什么需要自动转换

### 传统方式（v1.3.0 之前）

```javascript
const { ObjectId } = require('mongodb');

// ❌ 需要手动转换
const user = await collection('users').findOne({
    _id: new ObjectId('507f1f77bcf86cd799439011')
});

// ❌ 查询条件复杂时更繁琐
const posts = await collection('posts').find({
    authorId: new ObjectId(userId),
    categoryId: new ObjectId(categoryId),
    status: 'published'
});

// ❌ 嵌套对象中的转换更麻烦
const result = await collection('orders').updateOne(
    { _id: new ObjectId(orderId) },
    { 
        $set: {
            'customer.userId': new ObjectId(customerId),
            'items.0.productId': new ObjectId(productId)
        }
    }
);
```

### 自动转换方式（v1.3.0+）

```javascript
// ✅ 自动转换，无需手动处理
const user = await collection('users').findOne({
    _id: '507f1f77bcf86cd799439011'
});

// ✅ 代码更简洁
const posts = await collection('posts').find({
    authorId: userId,        // 自动转换
    categoryId: categoryId,  // 自动转换
    status: 'published'
});

// ✅ 嵌套对象也能自动转换
const result = await collection('orders').updateOne(
    { _id: orderId },  // 自动转换
    { 
        $set: {
            'customer.userId': customerId,     // 自动转换
            'items.0.productId': productId     // 自动转换
        }
    }
);
```

---

## 转换规则

### 自动识别条件

monSQLize 会自动将符合以下条件的字符串转换为 ObjectId：

1. ✅ **长度为 24 个字符**
2. ✅ **只包含十六进制字符** (`0-9`, `a-f`, `A-F`)
3. ✅ **字段名符合 ObjectId 模式**（默认规则）

### 默认转换字段模式

以下字段名会自动转换：
- `_id`
- `*Id`（如 `userId`, `postId`, `categoryId`）
- `*_id`（如 `user_id`, `post_id`）
- `*Ids`（数组形式，如 `userIds`, `postIds`）
- `*_ids`（数组形式，如 `user_ids`, `post_ids`）

### 示例

```javascript
// ✅ 会转换
{
    _id: '507f1f77bcf86cd799439011',           // _id
    userId: '507f1f77bcf86cd799439011',        // *Id
    author_id: '507f1f77bcf86cd799439011',     // *_id
    postIds: ['507f...', '508f...'],           // *Ids (数组)
    category_ids: ['507f...', '508f...']       // *_ids (数组)
}

// ❌ 不会转换
{
    username: 'user123',                       // 普通字符串
    email: 'test@example.com',                 // 非 ObjectId 格式
    code: '1234567890abcdef12345678'           // 长度符合但字段名不匹配
}
```

---

## 配置选项

### 启用/禁用自动转换

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },
    
    // 配置 ObjectId 自动转换
    autoConvertObjectId: {
        enabled: true,  // 默认启用
        
        // 排除特定字段（不转换）
        excludeFields: ['code', 'token'],
        
        // 自定义字段匹配模式
        customFieldPatterns: [
            /^ref/,           // ref 开头的字段
            /Reference$/      // Reference 结尾的字段
        ],
        
        // 最大转换深度（防止循环引用）
        maxDepth: 10
    }
});
```

### 配置说明

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否启用自动转换 |
| `excludeFields` | string[] | `[]` | 排除的字段名列表（不转换） |
| `customFieldPatterns` | RegExp[] | `[]` | 自定义字段匹配模式 |
| `maxDepth` | number | `10` | 最大转换深度（防止循环引用） |

---

## 使用示例

### 基础查询

```javascript
// findOne
const user = await collection('users').findOne({
    _id: '507f1f77bcf86cd799439011'  // ✅ 自动转换
});

// find
const posts = await collection('posts').find({
    authorId: userId,        // ✅ 自动转换
    categoryId: categoryId   // ✅ 自动转换
});

// findById（便利方法）
const product = await collection('products').findOneById(
    '507f1f77bcf86cd799439011'  // ✅ 自动转换
);
```

### 复杂查询条件

```javascript
// $in 操作符
const users = await collection('users').find({
    _id: { 
        $in: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012',
            '507f1f77bcf86cd799439013'
        ]  // ✅ 数组中每个元素都会自动转换
    }
});

// $or 操作符
const docs = await collection('documents').find({
    $or: [
        { authorId: userId1 },      // ✅ 自动转换
        { editorId: userId2 }       // ✅ 自动转换
    ]
});

// 嵌套查询
const orders = await collection('orders').find({
    'customer.userId': customerId,      // ✅ 嵌套字段自动转换
    'items.productId': productId        // ✅ 嵌套字段自动转换
});
```

### 更新操作

```javascript
// updateOne
await collection('posts').updateOne(
    { _id: postId },  // ✅ 查询条件自动转换
    {
        $set: {
            authorId: newAuthorId,          // ✅ 更新值自动转换
            'meta.createdBy': creatorId     // ✅ 嵌套字段自动转换
        }
    }
);

// updateMany
await collection('comments').updateMany(
    { postId: postId },  // ✅ 自动转换
    {
        $set: {
            postId: newPostId  // ✅ 自动转换
        }
    }
);
```

### 删除操作

```javascript
// deleteOne
await collection('users').deleteOne({
    _id: userId  // ✅ 自动转换
});

// deleteMany
await collection('posts').deleteMany({
    authorId: authorId  // ✅ 自动转换
});
```

---

## 支持的方法

ObjectId 自动转换在以下方法中生效：

### 查询方法
- ✅ `find(query)`
- ✅ `findOne(query)`
- ✅ `findOneById(id)`
- ✅ `findByIds(ids)`
- ✅ `findPage(options)`
- ✅ `findAndCount(query)`
- ✅ `count(query)`
- ✅ `distinct(field, query)`

### 写入方法
- ✅ `insertOne(doc)`
- ✅ `insertMany(docs)`
- ✅ `updateOne(query, update)`
- ✅ `updateMany(query, update)`
- ✅ `replaceOne(query, doc)`
- ✅ `upsertOne(query, update)`
- ✅ `deleteOne(query)`
- ✅ `deleteMany(query)`

### 批量方法
- ✅ `insertBatch(docs)`
- ✅ `updateBatch(query, update)`
- ✅ `deleteBatch(query)`

### 其他方法
- ✅ `aggregate(pipeline)`（在 $match、$lookup 等阶段）
- ✅ `findOneAndUpdate(query, update)`
- ✅ `findOneAndDelete(query)`
- ✅ `findOneAndReplace(query, doc)`

---

## 高级配置

### 配置选项详解

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `excludeFields` | string[] | `[]` | 排除的字段名列表，这些字段不会进行转换 |
| `customFieldPatterns` | RegExp[] | `[]` | 自定义字段名正则表达式，匹配的字段会进行转换 |
| `maxDepth` | number | `10` | 递归转换的最大深度，防止无限递归 |

### 使用示例（高级配置）

#### 1. 排除特定字段

某些字段虽然符合 ObjectId 格式，但实际上不是 ObjectId：

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },
    
    autoConvertObjectId: {
        enabled: true,
        // 排除这些字段，即使它们看起来像 ObjectId
        excludeFields: [
            'token',           // 认证令牌
            'code',            // 验证码
            'sessionId',       // 会话ID（非 MongoDB ObjectId）
            'traceId',         // 追踪ID
            'metadata.externalId',  // 嵌套字段也支持
            'legacyId'         // 遗留系统ID
        ]
    }
});

// 使用示例
await collection('sessions').find({
    userId: userId,          // ✅ 转换
    sessionId: sessionId     // ❌ 不转换（在 excludeFields 中）
});
```

**注意事项**：
- `excludeFields` 支持点号路径（如 `metadata.externalId`）
- 排除优先级高于默认规则和自定义模式
- 建议明确列出所有非 ObjectId 的 `*Id` 字段

#### 2. 自定义字段模式

扩展默认的字段匹配规则：

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },
    
    autoConvertObjectId: {
        enabled: true,
        // 自定义字段匹配模式
        customFieldPatterns: [
            /^.*Ref$/,        // 以Ref结尾的字段：userRef, postRef
            /^ref/,           // ref开头：refUser, refPost
            /Reference$/,     // Reference结尾：userReference
            /^parent/,        // parent开头：parentId, parentNode
            /^child/,         // child开头：childId, childNode
            /^related\w+Id$/  // related开头Id结尾：relatedUserId
        ]
    }
});

// 使用示例
await collection('nodes').find({
    userRef: userId,              // ✅ 转换（匹配 /^.*Ref$/）
    refUser: userId,              // ✅ 转换（匹配 /^ref/）
    userReference: userRefId,     // ✅ 转换（匹配 /Reference$/）
    parentId: parentId,           // ✅ 转换（匹配 /^parent/）
    childId: childId,             // ✅ 转换（匹配 /^child/）
    relatedUserId: relatedId      // ✅ 转换（匹配 /^related\w+Id$/）
});
```

**自定义模式优先级**：
1. `excludeFields` - 最高优先级（不转换）
2. `customFieldPatterns` - 自定义模式
3. 默认模式（`_id`, `*Id`, `*Ids`）

#### 3. 限制递归深度

防止嵌套过深导致的性能问题：

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },
    
    autoConvertObjectId: {
        enabled: true,
        maxDepth: 5  // 最多递归5层
    }
});

// 示例：深度嵌套对象
await collection('complex').find({
    level1: {                      // 深度 1
        level2: {                  // 深度 2
            level3: {              // 深度 3
                level4: {          // 深度 4
                    level5: {      // 深度 5
                        userId: userId  // ✅ 深度 5，仍会转换
                    }
                }
            }
        }
    }
});

// ⚠️ 超过 maxDepth 的嵌套不会转换
await collection('deep').find({
    level1: { level2: { level3: { level4: { level5: { level6: {
        userId: userId  // ❌ 深度 6，不会转换
    }}}}}}
});
```

**深度限制说明**：
- 默认 `maxDepth = 10`，适用于绝大多数场景
- 如果数据结构嵌套很深，建议设置较小值（如 5）
- 超过深度限制的字段不会转换，返回原始值

### 配置验证示例

#### 验证配置是否生效

```javascript
// 创建测试查询
const query = {
    userId: '507f1f77bcf86cd799439011',
    sessionId: '507f1f77bcf86cd799439011',  // 在 excludeFields 中
    metadata: {
        externalId: '507f1f77bcf86cd799439011'  // 在 excludeFields 中
    }
};

// 执行查询（启用日志）
const msq = new MonSQLize({
    type: 'mongodb',
    config: { uri: '...' },
    logger: console,  // 启用日志
    autoConvertObjectId: {
        enabled: true,
        excludeFields: ['sessionId', 'metadata.externalId']
    }
});

const result = await collection('users').findOne(query);

// 查看转换结果
console.log('userId转换了:', result.userId instanceof ObjectId);        // true
console.log('sessionId没转换:', typeof result.sessionId === 'string'); // true
console.log('externalId没转换:', typeof result.metadata.externalId === 'string'); // true
```

### 常见配置场景

#### 场景1：第三方系统集成

```javascript
// 第三方系统的ID可能是24位十六进制，但不是 ObjectId
autoConvertObjectId: {
    enabled: true,
    excludeFields: [
        'stripeCustomerId',    // Stripe客户ID
        'paypalOrderId',       // PayPal订单ID
        'externalSystemId',    // 外部系统ID
        'legacyUserId'         // 遗留系统用户ID
    ]
}
```

#### 场景2：多租户系统

```javascript
// 租户ID使用自定义格式
autoConvertObjectId: {
    enabled: true,
    excludeFields: [
        'tenantId',            // 租户ID（自定义格式）
        'organizationId'       // 组织ID（自定义格式）
    ],
    customFieldPatterns: [
        /^.*ResourceId$/       // 资源ID：userResourceId, fileResourceId
    ]
}
```

#### 场景3：性能敏感场景

```javascript
// 限制递归深度，优化性能
autoConvertObjectId: {
    enabled: true,
    maxDepth: 3,  // 只转换3层以内的嵌套
    excludeFields: [
        'metadata.tracking',   // 排除不常用字段
        'debug.traceId'        // 排除调试字段
    ]
}
```

---

## 性能考量

### 性能影响

ObjectId 自动转换对性能的影响非常小：

- **查询条件转换**: <1ms（单次查询）
- **文档插入转换**: <1ms（单个文档）
- **批量操作转换**: 约 0.1ms/文档

### 优化建议

1. **避免过深嵌套**
   - 建议嵌套深度 ≤ 5 层
   - 超过 5 层建议扁平化数据结构

2. **合理使用 excludeFields**
   - 排除明确不是 ObjectId 的字段
   - 减少不必要的检查

3. **批量操作优先**
   - 使用 `insertBatch` 而非多次 `insertOne`
   - 批量操作转换效率更高

---

## 常见问题

### Q1: 如何禁用自动转换？

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },
    
    autoConvertObjectId: {
        enabled: false  // 禁用自动转换
    }
});
```

或者在实例化后修改（不推荐）：
```javascript
msq.autoConvertConfig.enabled = false;
```

---

### Q2: 如何处理混合类型的字段？

有些字段可能既可以是 ObjectId，也可以是普通字符串：

```javascript
// 方案 1: 排除该字段（推荐）
autoConvertObjectId: {
    excludeFields: ['externalId']  // 不自动转换
}

// 方案 2: 手动判断和转换
const { ObjectId } = require('mongodb');

function isValidObjectIdString(str) {
    return typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
}

const query = {
    externalId: isValidObjectIdString(externalId) 
        ? new ObjectId(externalId) 
        : externalId
};

// 方案 3: 在查询前标准化（推荐用于混合场景）
function normalizeId(id) {
    if (isValidObjectIdString(id)) {
        return new ObjectId(id);
    }
    return id;
}

await collection('external').find({
    externalId: normalizeId(externalId)
});
```

**最佳实践**：
- 建议数据模型设计时避免混合类型
- 如果无法避免，优先使用 `excludeFields` + 手动转换
- 在应用层统一ID格式，减少类型判断

---

### Q3: 自定义字段模式的优先级如何？

优先级从高到低：

1. **excludeFields**（最高优先级）
   - 明确排除的字段，即使匹配自定义模式也不转换

2. **customFieldPatterns**
   - 自定义正则模式，优先于默认规则

3. **默认模式**（最低优先级）
   - 内置的 `_id`, `*Id`, `*Ids`, `*_id`, `*_ids` 规则

```javascript
// 示例：优先级演示
autoConvertObjectId: {
    excludeFields: ['sessionId'],  // 最高优先级：不转换
    customFieldPatterns: [/Id$/]   // 自定义模式：转换以Id结尾的字段
}

await collection('test').find({
    userId: '507f...',     // ✅ 转换（匹配自定义模式）
    sessionId: '507f...',  // ❌ 不转换（在 excludeFields 中）
    postId: '507f...'      // ✅ 转换（匹配默认模式 + 自定义模式）
});
```

---

### Q3: 自动转换会影响查询性能吗？

不会。ObjectId 转换在查询执行前完成，不影响 MongoDB 查询性能。

转换过程只增加了约 0.1-1ms 的开销，对整体性能影响可以忽略。

---

### Q4: 如何确认某个字段被转换了？

可以通过日志查看：

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },
    
    logger: console,  // 启用日志
    
    autoConvertObjectId: {
        enabled: true
    }
});

// 执行查询时，日志会显示转换信息
await collection('users').findOne({ _id: '507f...' });
// 日志: [DEBUG] ObjectId converted: _id
```

---

### Q5: 数组中的 ObjectId 会转换吗？

会。包括 `$in`、`$nin` 等操作符中的数组：

```javascript
// ✅ 数组中每个元素都会转换
await collection('users').find({
    _id: { 
        $in: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012'
        ]
    }
});

// ✅ 文档中的数组字段也会转换
await collection('posts').insertOne({
    authorId: '507f...',          // ✅ 转换
    tags: ['tag1', 'tag2'],       // ❌ 不转换（不是 ObjectId）
    relatedIds: ['507f...', ...]  // ✅ 转换（字段名匹配）
});
```

---

## 相关文档

- [find 方法](./find.md)
- [findOne 方法](./findOne.md)
- [update-one 方法](./update-one.md)
- [delete-one 方法](./delete-one.md)
- [配置选项](./connection.md)

---

**最后更新**: 2026-01-08  
**版本**: v1.0.6

