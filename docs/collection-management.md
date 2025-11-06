# 集合管理

## 概述

monSQLize 提供了 MongoDB 集合管理的基本功能，包括创建集合、删除集合和创建视图集合。这些方法用于动态管理数据库结构。

## 核心特性

- ✅ **创建集合**：支持标准集合和带选项的集合
- ✅ **删除集合**：快速删除集合及其所有数据
- ✅ **创建视图**：基于聚合管道创建视图集合
- ✅ **错误处理**：完善的错误提示和日志记录

---

## API 方法

### createCollection()

创建新集合或指定选项的集合。

#### 方法签名

```javascript
await collection('collectionName').createCollection(name?, options?)
```

#### 参数说明

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `name` | string | ❌ | 当前集合名 | 要创建的集合名称 |
| `options` | object | ❌ | `{}` | MongoDB createCollection 选项 |

#### options 选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `capped` | boolean | 是否创建固定大小集合 |
| `size` | number | 固定集合的最大字节数 |
| `max` | number | 固定集合的最大文档数 |
| `validationLevel` | string | 验证级别：'off'/'strict'/'moderate' |
| `validationAction` | string | 验证失败时的动作：'error'/'warn' |
| `validator` | object | 文档验证规则（JSON Schema） |

#### 返回值

```javascript
Promise<boolean>  // 创建成功返回 true
```

---

## 使用示例

### 基本用法

#### 1. 创建标准集合

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection } = await msq.connect();

// 创建新集合
await collection('products').createCollection('newCollection');

console.log('✅ 集合创建成功');
```

---

#### 2. 创建当前绑定的集合

```javascript
// 如果不传 name 参数，则创建当前绑定的集合
await collection('orders').createCollection();

// 等同于
await collection('orders').createCollection('orders');
```

---

#### 3. 创建固定大小集合（Capped Collection）

固定大小集合适用于日志、缓存等场景，当达到大小限制时会自动删除最旧的文档。

```javascript
// 创建 100MB 的固定集合
await collection('logs').createCollection('logs', {
  capped: true,
  size: 100 * 1024 * 1024,  // 100MB
  max: 10000                 // 最多 10000 个文档
});

console.log('✅ 固定集合创建成功');
```

---

#### 4. 创建带验证规则的集合

使用 JSON Schema 验证文档结构：

```javascript
// 创建带验证的用户集合
await collection('users').createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'email', 'age'],
      properties: {
        name: {
          bsonType: 'string',
          description: '用户名必须是字符串'
        },
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: '必须是有效的邮箱地址'
        },
        age: {
          bsonType: 'int',
          minimum: 0,
          maximum: 120,
          description: '年龄必须在 0-120 之间'
        }
      }
    }
  },
  validationLevel: 'strict',     // 严格验证
  validationAction: 'error'      // 验证失败则报错
});

console.log('✅ 带验证规则的集合创建成功');
```

---

### dropCollection()

删除集合及其所有数据。

#### 方法签名

```javascript
await collection('collectionName').dropCollection()
```

#### 参数说明

无参数。删除当前绑定的集合。

#### 返回值

```javascript
Promise<boolean>  // 删除成功返回 true
```

#### 使用示例

```javascript
const { collection } = await msq.connect();

// 删除集合
await collection('oldCollection').dropCollection();

console.log('✅ 集合已删除');
```

---

#### ⚠️ 注意事项

1. **不可逆操作**：删除集合会永久删除所有数据，无法恢复
2. **索引也会删除**：集合的所有索引会一并删除
3. **权限要求**：需要数据库的 `dropCollection` 权限

---

### createView()

创建视图集合（基于聚合管道的只读视图）。

#### 方法签名

```javascript
await collection('collectionName').createView(viewName, sourceCollection, pipeline)
```

#### 参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `viewName` | string | ✅ | 视图名称 |
| `sourceCollection` | string | ✅ | 源集合名称 |
| `pipeline` | array | ❌ | 聚合管道（默认 `[]`） |

#### 返回值

```javascript
Promise<boolean>  // 创建成功返回 true
```

---

## 视图集合示例

### 1. 创建基础视图

```javascript
const { collection } = await msq.connect();

// 创建活跃用户视图
await collection('users').createView(
  'activeUsers',        // 视图名称
  'users',              // 源集合
  [
    { $match: { status: 'active' } },
    { $project: { password: 0 } }  // 排除密码字段
  ]
);

console.log('✅ 视图创建成功');

// 查询视图（像普通集合一样使用）
const activeUsers = await collection('activeUsers').find({
  query: {},
  limit: 10
});

console.log('活跃用户:', activeUsers);
```

---

### 2. 创建统计视图

```javascript
// 创建订单统计视图
await collection('orders').createView(
  'orderStats',         // 视图名称
  'orders',             // 源集合
  [
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]
);

// 查询统计视图
const stats = await collection('orderStats').find({
  query: {},
  limit: 10
});

console.log('订单统计:', stats);
```

---

### 3. 创建连接视图（$lookup）

```javascript
// 创建订单详情视图（包含用户信息）
await collection('orders').createView(
  'orderDetails',
  'orders',
  [
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    {
      $unwind: '$userInfo'
    },
    {
      $project: {
        orderId: 1,
        amount: 1,
        status: 1,
        userName: '$userInfo.name',
        userEmail: '$userInfo.email'
      }
    }
  ]
);

// 查询订单详情视图
const orderDetails = await collection('orderDetails').find({
  query: { status: 'completed' },
  limit: 20
});

console.log('订单详情:', orderDetails);
```

---

### 4. 创建时间序列视图

```javascript
// 创建每日销售统计视图
await collection('sales').createView(
  'dailySales',
  'sales',
  [
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        totalSales: { $sum: '$amount' },
        orderCount: { $sum: 1 }
      }
    },
    {
      $sort: {
        '_id.year': -1,
        '_id.month': -1,
        '_id.day': -1
      }
    },
    {
      $project: {
        date: {
          $dateFromParts: {
            year: '$_id.year',
            month: '$_id.month',
            day: '$_id.day'
          }
        },
        totalSales: 1,
        orderCount: 1,
        avgOrderAmount: {
          $divide: ['$totalSales', '$orderCount']
        }
      }
    }
  ]
);

// 查询每日销售统计
const dailyStats = await collection('dailySales').find({
  query: {},
  limit: 30,
  sort: { date: -1 }
});

console.log('每日销售统计:', dailyStats);
```

---

## 最佳实践

### 1. 集合命名规范

```javascript
// ✅ 好的命名（使用复数、小写、下划线）
await collection('products').createCollection('user_profiles');
await collection('products').createCollection('order_items');

// ❌ 避免的命名
await collection('products').createCollection('UserProfile');  // 避免驼峰
await collection('products').createCollection('user-profile'); // 避免连字符
```

---

### 2. 验证规则的使用

```javascript
// ✅ 推荐：在生产环境使用验证规则
await collection('users').createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
        }
      }
    }
  },
  validationLevel: 'moderate',  // 中等验证（仅对新文档）
  validationAction: 'warn'      // 验证失败时警告（不阻止插入）
});
```

---

### 3. 视图的性能考虑

```javascript
// ✅ 好的做法：在源集合上创建索引
const { collection } = await msq.connect();

// 1. 先创建索引
await collection('orders').createIndex({ status: 1, createdAt: -1 });

// 2. 再创建视图
await collection('orders').createView(
  'completedOrders',
  'orders',
  [
    { $match: { status: 'completed' } },  // 索引会被使用
    { $sort: { createdAt: -1 } }
  ]
);

// 注意：视图是动态的，每次查询都会执行聚合管道
// 因此源集合的索引对视图性能至关重要
```

---

### 4. 固定集合的使用场景

```javascript
// ✅ 适合固定集合的场景
const scenarios = [
  '日志记录',
  '实时监控数据',
  '缓存数据',
  '会话数据',
  '消息队列'
];

// 创建日志固定集合
await collection('logs').createCollection('appLogs', {
  capped: true,
  size: 50 * 1024 * 1024,  // 50MB
  max: 50000                // 最多 5 万条
});

// ❌ 不适合固定集合的场景
const notSuitable = [
  '用户数据（需要更新）',
  '订单数据（需要长期保存）',
  '配置数据（需要精确查询）'
];
```

---

## 常见问题

### Q1: 如何检查集合是否已存在？

**A**: 可以使用 MongoDB 的 `listCollections` 方法：

```javascript
const { db } = await msq.connect();

// 获取数据库实例
const database = db();

// 列出所有集合
const collections = await database.listCollections().toArray();
const collectionNames = collections.map(c => c.name);

if (collectionNames.includes('myCollection')) {
  console.log('集合已存在');
} else {
  await collection('myCollection').createCollection();
  console.log('集合已创建');
}
```

---

### Q2: 删除集合时如何避免误删？

**A**: 建议在删除前进行确认和备份：

```javascript
// 1. 先检查集合是否存在
const collections = await db().listCollections({ name: 'oldCollection' }).toArray();

if (collections.length === 0) {
  console.log('集合不存在');
  return;
}

// 2. 获取文档数量
const count = await collection('oldCollection').count({ query: {} });
console.log(`集合包含 ${count} 个文档`);

// 3. 可选：备份数据
const backup = await collection('oldCollection').find({ query: {} });
// ... 保存到文件或其他集合

// 4. 确认后删除
await collection('oldCollection').dropCollection();
console.log('✅ 集合已删除');
```

---

### Q3: 视图可以被修改吗？

**A**: 视图是只读的，但可以删除后重新创建：

```javascript
// 1. 删除旧视图
await collection('oldView').dropCollection();

// 2. 创建新视图
await collection('users').createView(
  'oldView',
  'users',
  [
    { $match: { status: 'active' } },
    { $project: { name: 1, email: 1, age: 1 } }  // 新的投影
  ]
);

console.log('✅ 视图已更新');
```

---

### Q4: 固定集合有什么限制？

**A**: 固定集合的主要限制：

1. **不支持文档删除**：只能删除整个集合
2. **不支持更新导致文档增大**：更新后的文档大小不能超过原始大小
3. **不支持分片**：固定集合不能被分片
4. **插入顺序固定**：文档按插入顺序存储，无法更改

```javascript
// ✅ 固定集合支持的操作
await collection('logs').find({ query: {} });     // 查询
await collection('logs').insertOne({ ... });      // 插入

// ❌ 固定集合不支持的操作
// await collection('logs').deleteOne({ ... });    // 不支持删除单个文档
// await collection('logs').updateOne({ ... });    // 不支持增大文档
```

---

### Q5: 如何批量创建集合？

**A**: 可以使用循环或 Promise.all：

```javascript
const collectionsToCreate = [
  { name: 'users', options: {} },
  { name: 'orders', options: {} },
  { name: 'products', options: {} },
  { name: 'logs', options: { capped: true, size: 10 * 1024 * 1024 } }
];

// 方法 1：顺序创建
for (const { name, options } of collectionsToCreate) {
  await collection(name).createCollection(name, options);
  console.log(`✅ ${name} 创建成功`);
}

// 方法 2：并行创建（更快）
await Promise.all(
  collectionsToCreate.map(({ name, options }) =>
    collection(name).createCollection(name, options)
  )
);

console.log('✅ 所有集合创建完成');
```

---

## 参考资料

- [MongoDB createCollection 文档](https://www.mongodb.com/docs/manual/reference/method/db.createCollection/)
- [MongoDB 固定集合文档](https://www.mongodb.com/docs/manual/core/capped-collections/)
- [MongoDB 视图文档](https://www.mongodb.com/docs/manual/core/views/)
- [JSON Schema 验证文档](https://www.mongodb.com/docs/manual/core/schema-validation/)
- [连接管理](./connection.md)
- [缓存策略](./cache.md)
