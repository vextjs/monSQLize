# findOne 方法详细文档

## 概述

`findOne` 是 monSQLize 提供的基础查询方法，用于从 MongoDB 集合中查询第一条匹配的文档记录。支持查询条件、排序、投影和缓存等功能。

## 方法签名

```javascript
async findOne(query = {}, options = {})
```

## 参数说明

### query 参数

**类型**: `Object`  
**默认值**: `{}`  
**必填**: 否

MongoDB 查询条件对象，支持所有 MongoDB 查询操作符。

**示例**:
```javascript
{ status: 'active' }
{ age: { $gte: 18, $lte: 65 } }
{ tags: { $in: ['featured', 'hot'] } }
{ $or: [{ priority: 'high' }, { urgent: true }] }
```

### options 对象属性

| 参数 | 类型 | 必填 | 默认值 | 来源 | 说明 |
|------|------|------|--------|------|------|
| `projection` | Object/Array | 否 | - | MongoDB 原生 ✅ | 字段投影配置，指定返回的字段 |
| `sort` | Object | 否 | - | MongoDB 原生 ✅ | 排序规则，如 `{ createdAt: -1, name: 1 }` |
| `hint` | Object/String | 否 | - | MongoDB 原生 ✅ | 指定查询使用的索引 |
| `collation` | Object | 否 | - | MongoDB 原生 ✅ | 指定排序规则（用于字符串排序） |
| `maxTimeMS` | Number | 否 | 全局配置 | MongoDB 原生 ✅ | 查询超时时间（毫秒） |
| `comment` | String | 否 | - | MongoDB 原生 ✅ | 查询注释，用于生产环境日志跟踪和性能分析 |
| `explain` | Boolean/String | 否 | - | MongoDB 原生 ✅ | 返回查询执行计划，可选值：`true`、`'queryPlanner'`、`'executionStats'`、`'allPlansExecution'` |
| `cache` | Number | 否 | `0` | monSQLize 扩展 🔧 | 缓存 TTL（毫秒），大于 0 时启用缓存 |
| `meta` | Boolean/Object | 否 | `false` | monSQLize 扩展 🔧 | 返回查询元数据（执行时间、缓存命中率等） |

**图例说明**:
- ✅ **MongoDB 原生**: 该参数是 MongoDB 官方支持的标准功能
- 🔧 **monSQLize 扩展**: monSQLize 独有的扩展功能

**MongoDB 参考文档**: 
- [findOne() 方法](https://www.mongodb.com/docs/manual/reference/method/db.collection.findOne/)

### comment 配置

查询注释用于在 MongoDB 日志中标识查询来源，便于生产环境的运维监控和性能分析：

```javascript
comment: 'ProductDetailPage:loadProduct:session_abc123'
```

**使用场景**：
- **业务场景标识**：标识查询来自哪个页面或功能
- **用户追踪**：记录查询关联的用户或会话
- **分布式追踪**：结合 traceId 关联完整请求链路
- **性能分析**：在慢查询日志中快速定位问题

**示例**：
```javascript
// 用户详情页查询
const user = await collection('users').findOne(
  { _id: userId },
  {
    comment: 'UserProfile:loadUser:session_xyz'
  }
);

// 商品详情页查询
const product = await collection('products').findOne(
  { sku: 'PROD-001' },
  {
    comment: 'ProductPage:getDetails:traceId=abc123'
  }
);
```

**参考**：完整的 comment 使用指南请参考 [find 方法文档](./find.md#comment-配置)

### projection 配置

投影配置用于指定查询结果中包含或排除的字段，支持两种格式：

**对象格式**：
```javascript
projection: {
  name: 1,        // 包含 name 字段
  email: 1,       // 包含 email 字段
  password: 0     // 排除 password 字段
}
```

**数组格式**：
```javascript
projection: ['name', 'email', 'createdAt']  // 只返回这些字段（加上 _id）
```

**注意**：
- MongoDB 不允许混合使用包含（1）和排除（0），除了 `_id` 字段
- 数组格式会自动转换为包含模式
- `_id` 字段默认总是包含，除非显式排除：`{ _id: 0 }`

### sort 配置

排序配置指定结果的排序方式：

```javascript
sort: {
  createdAt: -1,  // -1 表示降序
  name: 1,        // 1 表示升序
  _id: 1          // 建议添加 _id 作为最后的排序字段，确保排序稳定
}
```

**性能建议**：
- 对于大数据集，确保排序字段上有索引
- 避免对未索引的字段进行排序
- 使用复合索引可以优化多字段排序

### hint 配置

强制 MongoDB 使用指定的索引：

```javascript
// 使用索引名称
hint: 'status_createdAt_idx'

// 使用索引定义
hint: { status: 1, createdAt: -1 }
```

**使用场景**：
- MongoDB 查询优化器选择了错误的索引
- 需要强制使用特定索引以保证性能
- 测试不同索引的性能差异

### collation 配置

指定字符串比较和排序的规则：

```javascript
collation: {
  locale: 'zh',           // 中文
  strength: 2,            // 忽略大小写和重音符号
  caseLevel: false,
  numericOrdering: true   // 数字字符串按数值排序
}
```

**常见场景**：
- 需要不区分大小写的查询和排序
- 多语言环境下的正确排序
- 数字字符串的自然排序

## 返回值

### 普通模式返回对象或 null

默认情况下，`findOne` 方法返回一个 Promise，resolve 为匹配的第一条文档或 null：

```javascript
const user = await collection('users').findOne(
  { email: 'alice@example.com' }
);

// user = { _id: '...', name: 'Alice', email: 'alice@example.com', ... }
// 或 null（如果未找到）
```

**返回值类型**：`Promise<Object|null>`

### explain 模式返回执行计划

当 `explain` 为 true 或指定级别时，返回查询执行计划：

```javascript
const plan = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    explain: 'executionStats'
  }
);

// plan = {
//   queryPlanner: { ... },
//   executionStats: {
//     executionTimeMillis: 2,
//     totalDocsExamined: 1,
//     totalKeysExamined: 1,
//     ...
//   }
// }
```

**返回值类型**：`Promise<Object>`

## 使用模式

### 1. 基础查询

最简单的查询方式，返回第一条匹配的文档：

```javascript
// 根据 ID 查询用户
const user = await collection('users').findOne(
  { _id: ObjectId('507f1f77bcf86cd799439011') }
);

// 根据条件查询
const activeUser = await collection('users').findOne(
  { status: 'active' },
  {
    sort: { createdAt: -1 }  // 获取最新的活跃用户
  }
);

// 指定返回字段
const userProfile = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    projection: { name: 1, email: 1, avatar: 1 }
  }
);
```

**适用场景**：
- 根据唯一标识查询单条记录
- 获取最新/最旧的记录
- 检查记录是否存在

### 2. 复杂查询条件

使用 MongoDB 查询操作符构建复杂查询：

```javascript
// 范围查询
const order = await collection('orders').findOne(
  {
    amount: { $gte: 1000 },
    status: 'paid'
  },
  {
    sort: { createdAt: -1 }
  }
);

// 逻辑组合查询
const user = await collection('users').findOne(
  {
    $or: [
      { role: 'admin' },
      { level: { $gte: 10 } }
    ],
    verified: true
  }
);

// 数组查询
const product = await collection('products').findOne(
  {
    tags: 'featured',
    'reviews.rating': { $gte: 4.5 }
  },
  {
    sort: { rating: -1 }
  }
);
```

### 3. 使用索引优化

通过 hint 强制使用索引，explain 查看执行计划：

```javascript
// 强制使用索引
const user = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    hint: { email: 1 }
  }
);

// 查看执行计划
const plan = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    explain: 'executionStats'
  }
);
```

**性能优化建议**：
- 为常用查询字段创建索引
- 使用复合索引优化多条件查询
- 定期分析慢查询并优化索引

### 4. 缓存使用

启用缓存以提升查询性能：

```javascript
// 缓存 5 分钟
const user = await collection('users').findOne(
  { _id: ObjectId('507f1f77bcf86cd799439011') },
  {
    cache: 5 * 60 * 1000  // 5 分钟
  }
);
```

**缓存策略**：
- 对频繁查询且数据变化不频繁的记录启用缓存
- 设置合理的 TTL 时间
- 注意缓存失效机制

## 错误处理

`findOne` 方法可能抛出以下错误：

```javascript
try {
  const user = await collection('users').findOne(
    { email: 'alice@example.com' }
  );
} catch (error) {
  if (error.code === 'NOT_CONNECTED') {
    console.error('数据库未连接');
  } else {
    console.error('查询失败:', error.message);
  }
}
```

**常见错误**：
- `NOT_CONNECTED`: 数据库未连接
- 查询超时错误
- 权限相关错误

## 最佳实践

1. **总是指定排序**：当有多条记录匹配时，确保返回结果的一致性
2. **使用投影**：只返回需要的字段，减少网络传输和内存使用
3. **合理使用缓存**：对读多写少的场景启用缓存
4. **创建适当索引**：确保查询性能
5. **处理 null 返回值**：检查查询结果是否为 null

## 相关方法

- `find()`: 查询多条记录
- `count()`: 统计记录数量
- `findPage()`: 分页查询
- `invalidate()`: 使缓存失效
