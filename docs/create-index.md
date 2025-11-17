# createIndex() - 创建单个索引

创建单个索引，支持所有 MongoDB 索引选项。

---

## 概述

`createIndex()` 方法用于在集合上创建单个索引。索引可以显著提升查询性能，支持多种类型和选项。

**使用场景**：
- 优化查询性能
- 实现唯一性约束
- 自动删除过期文档（TTL）
- 支持全文搜索
- 实现部分索引和稀疏索引

---

## 语法

```javascript
await collection(collectionName).createIndex(keys, options)
```

### 参数

#### keys（必需）

索引键定义对象，指定要索引的字段及其排序方向。

**类型**: `Object`

**格式**:
```javascript
{
  field1: 1,    // 升序
  field2: -1,   // 降序
  field3: "text" // 文本索引
}
```

**允许的值**:
- `1` - 升序索引
- `-1` - 降序索引
- `"text"` - 文本索引
- `"2d"` - 2D 地理空间索引
- `"2dsphere"` - 2D 球面地理空间索引
- `"hashed"` - 哈希索引
- `"columnstore"` - 列存储索引（MongoDB 6.0+）

#### options（可选）

索引配置选项对象。

**类型**: `Object`

**选项列表**:

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | String | 自动生成 | 索引名称 |
| `unique` | Boolean | false | 是否为唯一索引 |
| `sparse` | Boolean | false | 是否为稀疏索引 |
| `expireAfterSeconds` | Number | - | TTL 索引过期时间（秒） |
| `partialFilterExpression` | Object | - | 部分索引过滤表达式 |
| `collation` | Object | - | 排序规则 |
| `hidden` | Boolean | false | 是否隐藏索引（MongoDB 4.4+） |
| `background` | Boolean | - | 后台创建（已废弃但保留兼容） |
| `wildcardProjection` | Object | - | 通配符投影 |
| `weights` | Object | - | 文本索引权重 |
| `default_language` | String | "english" | 文本索引默认语言 |
| `language_override` | String | "language" | 文本索引语言覆盖字段 |

### 返回值

**类型**: `Promise<Object>`

**格式**:
```javascript
{
  name: "index_name"  // 创建的索引名称
}
```

---

## 索引选项详解

### unique - 唯一索引

确保索引字段的值在集合中唯一。

```javascript
await collection("users").createIndex(
  { email: 1 },
  { unique: true }
);
```

**特点**：
- 防止重复值插入
- 自动拒绝重复数据（抛出错误码 11000）
- 适用于邮箱、用户名、订单号等唯一标识

**注意**：
- 如果字段已有重复值，创建唯一索引会失败
- null 值也被视为唯一（只能有一个 null）

### sparse - 稀疏索引

仅索引包含该字段的文档，忽略缺失字段的文档。

```javascript
await collection("users").createIndex(
  { phone: 1 },
  { sparse: true }
);
```

**特点**：
- 节省存储空间
- 适用于可选字段
- 查询时只包含有该字段的文档

**对比**：
- 普通索引：索引所有文档（缺失字段视为 null）
- 稀疏索引：仅索引包含字段的文档

### expireAfterSeconds - TTL 索引

自动删除过期文档，适用于会话、日志、临时数据。

```javascript
await collection("sessions").createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 3600 }  // 1 小时后过期
);
```

**特点**：
- MongoDB 后台线程自动清理
- 清理周期约 60 秒
- 仅适用于 Date 类型字段

**注意**：
- 文档可能在过期后最多延迟 60 秒才被删除
- 不能用于 _id 字段
- 不能与其他索引类型（如唯一索引）冲突

### partialFilterExpression - 部分索引

仅索引满足条件的文档，减少索引大小。

```javascript
await collection("users").createIndex(
  { age: 1 },
  {
    partialFilterExpression: {
      age: { $gte: 18 }
    }
  }
);
```

**特点**：
- 节省存储空间
- 提高索引维护效率
- 仅对满足条件的查询有效

**支持的操作符**：
- `$eq`, `$gt`, `$gte`, `$lt`, `$lte`
- `$exists`, `$type`
- `$and`, `$or`

### collation - 排序规则

指定字符串比较和排序规则，支持多语言。

```javascript
await collection("products").createIndex(
  { name: 1 },
  {
    collation: {
      locale: "zh",  // 中文
      strength: 2    // 忽略大小写和重音
    }
  }
);
```

**常用 locale**：
- `"en"` - 英语
- `"zh"` - 中文
- `"es"` - 西班牙语
- `"fr"` - 法语

**strength 等级**：
- `1` - 仅比较基础字符
- `2` - 比较基础字符和重音（默认）
- `3` - 比较大小写

### hidden - 隐藏索引

索引存在但不被查询使用，用于测试索引删除的影响。

```javascript
await collection("users").createIndex(
  { email: 1 },
  { hidden: true }
);
```

**用途**：
- 测试删除索引的影响
- 暂时禁用索引而不删除
- A/B 测试索引效果

**注意**：
- MongoDB 4.4+ 支持
- 索引仍会维护（写入时更新）
- 可以通过 `unhideIndex()` 取消隐藏

### wildcardProjection - 通配符投影

配合通配符索引使用，指定包含或排除的字段。

```javascript
await collection("products").createIndex(
  { "attributes.$**": 1 },
  {
    wildcardProjection: {
      "attributes.color": 1,
      "attributes.size": 1
    }
  }
);
```

**特点**：
- 适用于动态字段
- 灵活索引嵌套文档
- 控制索引字段范围

### weights - 文本索引权重

指定文本索引中各字段的权重，影响搜索相关性评分。

```javascript
await collection("articles").createIndex(
  {
    title: "text",
    content: "text"
  },
  {
    weights: {
      title: 10,    // 标题权重更高
      content: 1
    }
  }
);
```

**默认权重**: 1

**影响**：
- 权重越高，匹配时得分越高
- 影响搜索结果排序

---

## 代码示例

### 示例 1: 创建基本索引

```javascript
const MonSQLize = require('monsqlize');
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

// 升序索引
const result = await collection("users").createIndex({ email: 1 });
console.log(result);
// { name: "email_1" }

// 降序索引
await collection("posts").createIndex({ publishedAt: -1 });
```

### 示例 2: 创建唯一索引

```javascript
// 唯一邮箱索引
await collection("users").createIndex(
  { email: 1 },
  { unique: true, name: "email_unique" }
);

// 尝试插入重复邮箱会失败
try {
  await collection("users").insertOne({ email: "test@example.com" });
  await collection("users").insertOne({ email: "test@example.com" });
} catch (err) {
  console.error("重复键错误:", err.message);
  // Error: E11000 duplicate key error
}
```

### 示例 3: 创建复合索引

```javascript
// 复合索引（多字段）
await collection("orders").createIndex({
  userId: 1,
  status: 1
});

// 优化查询
const orders = await collection("orders").find({
  userId: "user123",
  status: "pending"
});
```

**复合索引的前缀原则**：
```javascript
// 索引: { a: 1, b: 1, c: 1 }

// ✓ 使用索引
find({ a: 1 })
find({ a: 1, b: 1 })
find({ a: 1, b: 1, c: 1 })

// ✗ 不使用索引
find({ b: 1 })
find({ c: 1 })
find({ b: 1, c: 1 })
```

### 示例 4: 创建 TTL 索引

```javascript
// 会话自动过期（1 小时）
await collection("sessions").createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 3600 }
);

// 插入会话
await collection("sessions").insertOne({
  sessionId: "abc123",
  userId: "user1",
  createdAt: new Date()  // 1 小时后自动删除
});
```

### 示例 5: 创建部分索引

```javascript
// 仅索引成年用户
await collection("users").createIndex(
  { age: 1 },
  {
    partialFilterExpression: { age: { $gte: 18 } },
    name: "age_adult_only"
  }
);

// 查询成年用户（使用索引）
const adults = await collection("users").find({ age: { $gte: 18 } });

// 查询未成年用户（不使用索引）
const minors = await collection("users").find({ age: { $lt: 18 } });
```

### 示例 6: 创建稀疏索引

```javascript
// 仅索引有电话号码的用户
await collection("users").createIndex(
  { phone: 1 },
  { sparse: true }
);

// 插入数据
await collection("users").insertMany([
  { name: "Alice", phone: "1234567890" },  // 被索引
  { name: "Bob" },                          // 不被索引（无 phone）
  { name: "Charlie", phone: "0987654321" }  // 被索引
]);
```

### 示例 7: 创建文本索引

```javascript
// 全文搜索索引
await collection("articles").createIndex({
  title: "text",
  content: "text"
}, {
  weights: {
    title: 10,
    content: 1
  },
  default_language: "english"
});

// 使用文本搜索
const results = await collection("articles").find({
  $text: { $search: "mongodb indexing" }
});
```

### 示例 8: 创建隐藏索引

```javascript
// 创建隐藏索引（测试用）
await collection("users").createIndex(
  { email: 1 },
  { hidden: true, name: "email_hidden" }
);

// 查询不会使用此索引
const users = await collection("users").find({ email: "test@example.com" });
```

### 示例 9: 创建通配符索引

```javascript
// 索引所有嵌套字段
await collection("products").createIndex({ "$**": 1 });

// 索引特定路径下的所有字段
await collection("products").createIndex(
  { "attributes.$**": 1 },
  {
    wildcardProjection: {
      "attributes.color": 1,
      "attributes.size": 1
    }
  }
);
```

### 示例 10: 错误处理

```javascript
try {
  // 创建索引
  await collection("users").createIndex({ email: 1 });
  
  // 尝试创建相同索引（会失败）
  await collection("users").createIndex({ email: 1 });
} catch (err) {
  if (err.code === 'MONGODB_ERROR') {
    if (err.message.includes('索引已存在')) {
      console.log("索引已存在，无需重复创建");
    } else {
      console.error("创建索引失败:", err.message);
    }
  }
}
```

---

## 错误处理

### 常见错误

#### 1. 索引已存在

**错误码**: `MONGODB_ERROR`  
**消息**: "索引已存在或名称冲突"

**原因**: 尝试创建已存在的索引

**解决方案**:
```javascript
// 方案 1: 先检查索引是否存在
const indexes = await collection("users").listIndexes();
const exists = indexes.some(idx => idx.name === 'email_1');

if (!exists) {
  await collection("users").createIndex({ email: 1 });
}

// 方案 2: 捕获错误并忽略
try {
  await collection("users").createIndex({ email: 1 });
} catch (err) {
  if (!err.message.includes('索引已存在')) {
    throw err;  // 重新抛出其他错误
  }
}
```

#### 2. 索引键无效

**错误码**: `INVALID_ARGUMENT`  
**消息**: "索引键的值无效"

**原因**: 使用了不支持的索引值（如 2, 0 等）

**解决方案**:
```javascript
// ✗ 错误
await collection("users").createIndex({ email: 2 });

// ✓ 正确
await collection("users").createIndex({ email: 1 });   // 升序
await collection("users").createIndex({ email: -1 });  // 降序
```

#### 3. 唯一索引冲突

**错误码**: MongoDB 11000  
**消息**: "E11000 duplicate key error"

**原因**: 创建唯一索引时，集合中已有重复值

**解决方案**:
```javascript
// 1. 先清理重复数据
const pipeline = [
  { $group: { _id: "$email", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
];
const duplicates = await collection("users").aggregate(pipeline);

// 2. 处理重复数据
for (const dup of duplicates) {
  // 保留一个，删除其他
  const docs = await collection("users").find({ email: dup._id });
  for (let i = 1; i < docs.length; i++) {
    await collection("users").deleteOne({ _id: docs[i]._id });
  }
}

// 3. 创建唯一索引
await collection("users").createIndex({ email: 1 }, { unique: true });
```

#### 4. 不支持的索引类型

**错误码**: `MONGODB_ERROR`  
**消息**: "不支持的索引类型"

**原因**: MongoDB 版本不支持该索引类型

**解决方案**:
- 检查 MongoDB 版本
- 升级 MongoDB 到支持的版本
- 使用替代索引类型

---

## 性能建议

### 何时创建索引

**应该创建索引**：
- ✅ 频繁查询的字段
- ✅ 排序字段（ORDER BY）
- ✅ 分组字段（GROUP BY）
- ✅ 连接字段（JOIN）
- ✅ 唯一性约束字段

**不应该创建索引**：
- ❌ 很少查询的字段
- ❌ 频繁更新的字段
- ❌ 低基数字段（如性别、布尔值）
- ❌ 小表（<1000 条记录）

### 索引开销

**存储开销**：
- 每个索引占用额外存储空间
- 复合索引比单字段索引占用更多空间
- 文本索引占用最多空间

**写入开销**：
- 每次写入需要更新所有相关索引
- 索引越多，写入越慢
- 平衡查询性能和写入性能

**维护建议**：
```javascript
// 1. 定期检查索引使用情况
const stats = await collection("users").find({ email: "test@example.com" })
  .explain('executionStats');

console.log("索引使用:", stats.executionStats.totalKeysExamined);
console.log("文档扫描:", stats.executionStats.totalDocsExamined);

// 2. 删除未使用的索引
const indexes = await collection("users").listIndexes();
// 分析后删除不需要的索引
await collection("users").dropIndex("unused_index");
```

### ESR 原则

设计复合索引时遵循 **ESR 原则**：

1. **Equality（等值）**：等值查询字段放在最前
2. **Sort（排序）**：排序字段放在中间
3. **Range（范围）**：范围查询字段放在最后

```javascript
// 查询: { status: "active", age: { $gte: 18 } } 排序: { createdAt: -1 }

// ✓ 最优索引设计
await collection("users").createIndex({
  status: 1,      // Equality
  createdAt: -1,  // Sort
  age: 1          // Range
});

// ✗ 次优索引设计
await collection("users").createIndex({
  age: 1,         // Range 在前（不推荐）
  status: 1,
  createdAt: -1
});
```

---

## 最佳实践

### 1. 索引命名规范

```javascript
// ✓ 好的命名
await collection("users").createIndex(
  { email: 1 },
  { name: "email_unique", unique: true }
);

await collection("orders").createIndex(
  { userId: 1, status: 1 },
  { name: "user_status_idx" }
);

// ✗ 不好的命名（使用自动生成的名称）
await collection("users").createIndex({ email: 1 });
// 生成: email_1（不够描述性）
```

### 2. 索引顺序很重要

```javascript
// 索引 A: { userId: 1, createdAt: -1 }
// 索引 B: { createdAt: -1, userId: 1 }
// 这是两个不同的索引！

// 选择取决于查询模式
// 如果查询通常是: find({ userId: "xxx" }).sort({ createdAt: -1 })
// 使用索引 A

// 如果查询通常是: find({}).sort({ createdAt: -1 })
// 使用索引 B
```

### 3. 避免过度索引

```javascript
// ✗ 不好：创建太多索引
await collection("users").createIndex({ email: 1 });
await collection("users").createIndex({ name: 1 });
await collection("users").createIndex({ age: 1 });
await collection("users").createIndex({ city: 1 });
// ... 10+ 个索引

// ✓ 好：创建必要的索引
await collection("users").createIndex({ email: 1 }, { unique: true });
await collection("users").createIndex({ city: 1, age: -1 });  // 复合索引
```

### 4. 索引覆盖查询

```javascript
// 创建覆盖索引
await collection("users").createIndex({ name: 1, email: 1, age: 1 });

// 覆盖查询（仅访问索引，不访问文档）
const users = await collection("users").find(
  { name: "Alice" },
  { projection: { name: 1, email: 1, age: 1, _id: 0 } }
);
// 性能最优：只读取索引，不读取文档
```

### 5. 生产环境注意事项

```javascript
// 生产环境创建索引
await collection("users").createIndex(
  { email: 1 },
  {
    unique: true,
    background: true,  // 后台创建（不阻塞）
    name: "email_unique"
  }
);

// 监控索引创建进度
const operations = await db.admin().command({
  currentOp: true,
  "command.createIndexes": { $exists: true }
});
```

---

## 相关方法

- [`createIndexes()`](./create-indexes.md) - 批量创建多个索引
- [`listIndexes()`](./list-indexes.md) - 列出集合的所有索引
- [`dropIndex()`](./drop-index.md) - 删除指定索引
- [`dropIndexes()`](./drop-index.md#dropIndexes) - 删除所有索引
- [索引管理完整指南](./index-management.md) - 索引管理综合文档

---

## 参考资源

- [MongoDB 索引文档](https://www.mongodb.com/docs/manual/indexes/)
- [索引类型](https://www.mongodb.com/docs/manual/indexes/#index-types)
- [索引属性](https://www.mongodb.com/docs/manual/indexes/#index-properties)
- [ESR 原则](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/)

