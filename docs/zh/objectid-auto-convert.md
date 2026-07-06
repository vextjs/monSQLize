# ObjectId 自动转换

## 概述

monSQLize 可以在执行操作前，把合法的 24 位十六进制字符串转换为 MongoDB `ObjectId`。这让应用代码可以直接传入来自请求参数的字符串 ID。

**核心优势**:
- ✅ **简化代码**: 无需手动调用 `new ObjectId()`
- ✅ **提升开发效率**: 直接使用字符串，代码更简洁
- ✅ **自动识别**: 智能判断是否为有效的 ObjectId 字符串
- ✅ **深度转换**: 支持嵌套对象和数组中的 ObjectId
- ✅ **兼容旧行为**: ObjectId 形态的值会被自动归一化

---

## 为什么需要自动转换

### 手动转换

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

### 自动转换

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
3. ✅ **MongoDB 接受其作为合法 ObjectId**
4. ✅ **不是 MongoDB 字段引用**（例如 `"$userId"`）

当前稳定行为是按值判断，不是按字段白名单判断。内部仍有 `_id`、`*Id` 等字段模式辅助函数，用于兼容嵌套对象处理，但这些模式不会限制合法裸字符串的转换。只要递归遍历到一个合法 ObjectId 形态的字符串，它就可能被转换，不论字段名是什么。

转换器也会跳过 `$expr`、`$function`、`$where`、`$accumulator` 等 MongoDB 表达式操作符，避免改写可执行表达式。

### 示例

```javascript
// ✅ 会转换
{
    _id: '507f1f77bcf86cd799439011',           // _id
    userId: '507f1f77bcf86cd799439011',        // *Id
    author_id: '507f1f77bcf86cd799439011',     // *_id
    code: '1234567890abcdef12345678',          // 合法 ObjectId 形态
    postIds: ['507f...', '508f...'],           // *Ids (数组)
    category_ids: ['507f...', '508f...']       // *_ids (数组)
}

// ❌ 不会转换
{
    username: 'user123',                       // 普通字符串
    email: 'test@example.com',                 // 非 ObjectId 格式
    ref: '$userId'                             // MongoDB 字段引用
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
    
    // 启用 ObjectId 自动转换。MongoDB 适配器默认启用。
    autoConvertObjectId: true
});
```

### 配置说明

| 值 | 说明 |
|------|------|
| `true` | 启用自动转换。MongoDB 适配器默认启用。 |
| `false` | 禁用当前实例的自动转换。 |
| `{ enabled: true }` | 显式启用自动转换。 |
| `{ enabled: false }` | 显式禁用自动转换。 |
| `{ excludeFields: ['token'] }` | 让匹配的字段名、路径片段或完整字段路径保持字符串。 |
| `{ token: false }` | 让指定字段名或路径保持字符串，同时保留其他位置的自动转换。 |
| `{ maxDepth: 3 }` | 超过指定递归深度后停止转换；超过深度限制的值会保持原样。 |

`maxDepth` 是遍历保护上限。如果非常深的 `$and` / `$or` 树或嵌套文档在该深度之后仍包含像 ObjectId 的字符串，monSQLize 会保持字符串不变。确实需要深层自动转换时，请提高 `maxDepth`。

`excludeFields` 与 `{ field: false }` 在 query 和 write 路径使用同一套 matcher。`b` 这类配置会匹配 `b`、`a.b` 以及 `a.b[0].c` 这类数组深层路径；通配符仍按标准化后的点路径匹配。

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

// _id 查询
const product = await collection('products').findOne({
    _id: '507f1f77bcf86cd799439011'  // 自动转换
});
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

普通 ID 查询直接使用 MongoDB 心智模型即可：单条用 `findOne({ _id })`，多条用 `find({ _id: { $in: ids } })`。`findOneById(id)` 与 `findByIds(ids)` 仍作为 API 参考方法保留，但不是使用自动转换的必要入口。

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

### 当前稳定控制项

当前稳定控制项是实例级开关：

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },

    autoConvertObjectId: false
});
```

默认行为仍然是按值转换：只要递归遍历到合法 24 位十六进制字符串，就可能转换为 ObjectId。可以保持默认开启，并为必须保留字符串的字段添加逃生开关：

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },

    autoConvertObjectId: {
        enabled: true,
        excludeFields: ['token', 'paymentHash', 'metadata.signature'],
        externalOrderId: false,
        maxDepth: 10
    }
});
```

如果某些集合或代码路径必须保留所有 24 位十六进制字符串，可以使用 `autoConvertObjectId: false` 或 `{ enabled: false }`。如果只是交易哈希、幂等键、签名、外部支付单号等业务字段需要保留字符串，使用 `excludeFields` 或 `{ fieldName: false }` 即可。

### 混合字符串和 ObjectId 标识的处理方式

当同一 schema 同时包含 ObjectId 字段和“长得像 ObjectId”的业务字符串时，优先选择以下方式：

- 在存储层使用不会与 ObjectId 混淆的类型保存业务字符串。
- 对该 monSQLize 实例禁用自动转换，或只排除必须保留字符串的业务字段。
- 对需要完全保留字符串的特殊路径，直接使用底层 MongoDB collection。

### 作用范围说明

自动转换会作用于查询条件、插入文档、替换文档、常见更新操作符载荷、删除条件和聚合管道。更新管道会保持原样。

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

2. **需要保留任意 24 位十六进制字符串时禁用自动转换**
   - 在这些路径中手动转换真正的 ObjectId 字段
   - 避免混合标识字段进入自动转换路径

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

    autoConvertObjectId: false
});
```

也可以使用 `{ enabled: false }`。建议在实例创建时配置。该设置现在会一致作用于查询条件、插入/替换文档、常见更新操作符载荷、删除条件和聚合管道。

---

### Q2: 如何处理混合类型的字段？

有些字段可能既可以是 ObjectId，也可以是普通字符串：

```javascript
// 为该实例禁用自动转换
autoConvertObjectId: false

// 手动判断和转换
const { ObjectId } = require('mongodb');

function isValidObjectIdString(str) {
    return typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
}

const query = {
    externalId: isValidObjectIdString(externalId) 
        ? new ObjectId(externalId) 
        : externalId
};

// 在查询前标准化
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
- 如果无法避免，为该实例禁用自动转换，或通过 `excludeFields` / `{ field: false }` 只排除字符串业务字段
- 在应用层统一ID格式，减少类型判断

---

### Q3: `excludeFields` 或字段映射逃生开关是否可用？

可用。默认仍然按值转换，但 `excludeFields`、`{ fieldName: false }` 与 `maxDepth` 可作为字符串业务字段的逃生开关。

---

### Q4: 自动转换会影响查询性能吗？

不会。ObjectId 转换在查询执行前完成，不影响 MongoDB 查询性能。

转换过程只增加了约 0.1-1ms 的开销，对整体性能影响可以忽略。

---

### Q5: 如何确认某个字段被转换了？

可以通过集成测试或 MongoDB command monitoring 检查最终发送给驱动的值。当前转换器不会输出逐字段转换日志。

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: '...' },

    autoConvertObjectId: true
});

const result = await collection('users').findOne({
    _id: '507f1f77bcf86cd799439011'
});
```

---

### Q6: 数组中的 ObjectId 会转换吗？

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
    relatedIds: ['507f...', ...]  // ✅ 合法 ObjectId 形态的数组元素会转换
});
```

---

## 相关文档

- [find 方法](./find.md)
- [findOne 方法](./findOne.md)
- [update-one 方法](./update-one.md)
- [delete-one 方法](./delete-one.md)
- [配置选项](./connection.md)

