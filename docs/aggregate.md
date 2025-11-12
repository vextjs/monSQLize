# aggregate 方法详细文档

## 概述

`aggregate` 是 monSQLize 提供的聚合管道方法，用于执行 MongoDB 的聚合框架操作。支持复杂的数据处理、统计分析、联表查询、分组计算、流式处理和缓存等功能。

## 方法签名

```javascript
async aggregate(pipeline = [], options = {})
```

## 参数说明

### pipeline 数组

聚合管道是一个由多个阶段组成的数组，每个阶段对数据进行特定的处理操作。

**常用管道阶段**：

| 阶段 | 说明 | 示例 |
|------|------|------|
| `$match` | 过滤文档（类似 find 的 query） | `{ $match: { status: 'active' } }` |
| `$group` | 分组聚合计算 | `{ $group: { _id: '$category', total: { $sum: 1 } } }` |
| `$project` | 字段投影和转换 | `{ $project: { name: 1, total: { $add: ['$price', '$tax'] } } }` |
| `$sort` | 排序 | `{ $sort: { createdAt: -1 } }` |
| `$limit` | 限制返回数量 | `{ $limit: 10 }` |
| `$skip` | 跳过指定数量 | `{ $skip: 20 }` |
| `$lookup` | 关联其他集合（联表查询） | `{ $lookup: { from: 'users', ... } }` |
| `$unwind` | 展开数组字段 | `{ $unwind: '$tags' }` |
| `$addFields` | 添加新字段 | `{ $addFields: { fullName: { $concat: ['$firstName', ' ', '$lastName'] } } }` |
| `$count` | 统计文档数量 | `{ $count: 'total' }` |
| `$facet` | 多路聚合 | `{ $facet: { stats: [...], list: [...] } }` |

### options 对象属性

| 参数 | 类型 | 必填 | 默认值 | 来源 | 说明 |
|------|------|------|--------|------|------|
| `maxTimeMS` | Number | 否 | 全局配置 | MongoDB 原生 ✅ | 查询超时时间（毫秒） |
| `allowDiskUse` | Boolean | 否 | `false` | MongoDB 原生 ✅ | 是否允许使用磁盘（处理大数据集时） |
| `collation` | Object | 否 | - | MongoDB 原生 ✅ | 字符串排序规则 |
| `hint` | Object/String | 否 | - | MongoDB 原生 ✅ | 指定使用的索引 |
| `comment` | String | 否 | - | MongoDB 原生 ✅ | 查询注释（用于日志和分析） |
| `batchSize` | Number | 否 | - | MongoDB 原生 ✅ | 流式查询或数组查询时的批次大小 |
| `explain` | Boolean/String | 否 | - | MongoDB 原生 ✅ | 返回查询执行计划 |
| `stream` | Boolean | 否 | `false` | monSQLize 扩展 🔧 | 是否返回流对象（也可通过 `.stream()` 链式方法调用） |
| `cache` | Number | 否 | `0` | monSQLize 扩展 🔧 | 缓存 TTL（毫秒），大于 0 时启用缓存 |
| `meta` | Boolean/Object | 否 | `false` | monSQLize 扩展 🔧 | 返回查询元数据（执行时间、缓存命中率等） |

**图例说明**:
- ✅ **MongoDB 原生**: 该参数是 MongoDB 官方支持的标准功能
- 🔧 **monSQLize 扩展**: monSQLize 独有的扩展功能

**MongoDB 参考文档**: 
- [aggregate() 方法](https://www.mongodb.com/docs/manual/reference/method/db.collection.aggregate/)
- [聚合管道](https://www.mongodb.com/docs/manual/core/aggregation-pipeline/)

### allowDiskUse 说明

当聚合操作需要处理的数据量超过内存限制（默认 100MB）时，设置 `allowDiskUse: true` 允许 MongoDB 使用磁盘临时存储：

```javascript
// 处理大数据集的聚合操作
const result = await collection('orders').aggregate([
  { $match: { year: 2024 } },
  { $group: { _id: '$category', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } }
], {
  allowDiskUse: true  // 允许使用磁盘
});
```

**使用场景**：
- 处理百万级以上的数据
- 复杂的分组和排序操作
- 多表联合查询（$lookup）
- 避免内存溢出错误

### explain 配置

用于分析聚合操作的执行计划和性能：

```javascript
const plan = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $group: { _id: '$customerId', total: { $sum: '$amount' } } }
], {
  explain: 'executionStats'
});
```

**explain 级别**：
- `true` 或 `'queryPlanner'`：基本执行计划
- `'executionStats'`：执行统计信息
- `'allPlansExecution'`：所有候选计划的详细信息

## 返回值

### 普通模式返回数组

默认情况下，`aggregate` 方法返回一个 Promise，resolve 为结果文档数组：

```javascript
const stats = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $group: { 
      _id: '$category',
      total: { $sum: '$amount' },
      count: { $sum: 1 }
  } }
]);

// stats = [
//   { _id: 'electronics', total: 50000, count: 120 },
//   { _id: 'books', total: 30000, count: 200 },
//   ...
// ]
```

**返回值类型**：`Promise<Array<Object>>`

### 流式模式返回流对象

当 `stream: true` 时，返回一个 MongoDB Cursor Stream 对象：

```javascript
const stream = await collection('orders').aggregate([
  { $match: { year: 2024 } },
  { $project: { orderId: 1, amount: 1, customerId: 1 } }
], {
  stream: true,
  batchSize: 1000
});

stream.on('data', (doc) => console.log(doc));
stream.on('end', () => console.log('完成'));
stream.on('error', (err) => console.error('错误:', err));
```

**返回值类型**：`ReadableStream`

### explain 模式返回执行计划

当 `explain` 为 true 或指定级别时，返回聚合操作的执行计划：

```javascript
const plan = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $group: { _id: '$category', total: { $sum: 1 } } }
], {
  explain: 'executionStats'
});

// plan = {
//   stages: [...],
//   executionStats: {
//     executionTimeMillis: 15,
//     totalDocsExamined: 5000,
//     ...
//   }
// }
```

**返回值类型**：`Promise<Object>`

## 使用模式

### 1. 基础聚合统计

最常见的聚合操作，用于数据统计和分析：

```javascript
// 统计各状态订单的总金额和数量
const orderStats = await collection('orders').aggregate([
  {
    $match: {
      createdAt: { $gte: new Date('2024-01-01') }
    }
  },
  {
    $group: {
      _id: '$status',
      totalAmount: { $sum: '$amount' },
      count: { $sum: 1 },
      avgAmount: { $avg: '$amount' },
      maxAmount: { $max: '$amount' },
      minAmount: { $min: '$amount' }
    }
  },
  {
    $sort: { totalAmount: -1 }
  }
]);

// 统计每个分类的商品数量
const categoryStats = await collection('products').aggregate([
  {
    $group: {
      _id: '$category',
      productCount: { $sum: 1 },
      avgPrice: { $avg: '$price' },
      totalSales: { $sum: '$sales' }
    }
  },
  {
    $sort: { totalSales: -1 }
  },
  {
    $limit: 10
  }
]);
```

**适用场景**：
- 销售报表统计
- 用户行为分析
- 数据汇总计算
- Dashboard 数据展示

### 2. 联表查询（$lookup）

使用 `$lookup` 阶段关联其他集合，类似 SQL 的 JOIN：

```javascript
// 订单关联用户信息
const ordersWithUsers = await collection('orders').aggregate([
  {
    $match: { status: 'paid' }
  },
  {
    $lookup: {
      from: 'users',              // 关联的集合名
      localField: 'userId',       // 本集合的字段
      foreignField: '_id',        // 关联集合的字段
      as: 'userInfo'              // 结果字段名
    }
  },
  {
    $unwind: '$userInfo'          // 展开数组（一对一关联）
  },
  {
    $project: {
      orderId: 1,
      amount: 1,
      status: 1,
      userName: '$userInfo.name',
      userEmail: '$userInfo.email'
    }
  },
  {
    $limit: 20
  }
], {
  allowDiskUse: true
});

// 高级 $lookup 使用管道
const ordersWithDetails = await collection('orders').aggregate([
  {
    $match: { status: 'completed' }
  },
  {
    $lookup: {
      from: 'users',
      let: { customerId: '$userId' },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ['$_id', '$$customerId'] },
            status: 'active'      // 额外过滤条件
          }
        },
        {
          $project: { name: 1, email: 1, level: 1 }
        }
      ],
      as: 'customer'
    }
  }
]);
```

**性能提示**：
- 确保关联字段有索引
- 对于大数据集，设置 `allowDiskUse: true`
- 使用 pipeline 形式可以添加额外过滤条件
- 避免多级嵌套 $lookup（性能差）

### 3. 数据转换与计算

使用 `$project` 和 `$addFields` 进行字段转换和计算：

```javascript
// 字段计算和转换
const processedOrders = await collection('orders').aggregate([
  {
    $match: { status: 'paid' }
  },
  {
    $addFields: {
      // 计算折扣后价格
      finalAmount: {
        $subtract: [
          '$amount',
          { $multiply: ['$amount', { $divide: ['$discount', 100] }] }
        ]
      },
      // 计算订单利润
      profit: {
        $subtract: ['$amount', '$cost']
      },
      // 日期格式化
      orderDate: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$createdAt'
        }
      }
    }
  },
  {
    $project: {
      orderId: 1,
      originalAmount: '$amount',
      finalAmount: 1,
      profit: 1,
      profitRate: {
        $multiply: [
          { $divide: ['$profit', '$amount'] },
          100
        ]
      },
      orderDate: 1
    }
  }
]);

// 条件计算
const userLevels = await collection('users').aggregate([
  {
    $addFields: {
      level: {
        $switch: {
          branches: [
            { case: { $gte: ['$totalSpent', 10000] }, then: 'VIP' },
            { case: { $gte: ['$totalSpent', 5000] }, then: 'Gold' },
            { case: { $gte: ['$totalSpent', 1000] }, then: 'Silver' }
          ],
          default: 'Bronze'
        }
      }
    }
  },
  {
    $group: {
      _id: '$level',
      count: { $sum: 1 }
    }
  }
]);
```

### 4. 数组操作

处理包含数组字段的文档：

```javascript
// 展开数组并统计
const tagStats = await collection('products').aggregate([
  {
    $match: { status: 'active' }
  },
  {
    $unwind: '$tags'  // 展开 tags 数组
  },
  {
    $group: {
      _id: '$tags',
      count: { $sum: 1 },
      products: { $push: '$name' }  // 收集产品名称
    }
  },
  {
    $sort: { count: -1 }
  },
  {
    $limit: 10
  }
]);

// 数组过滤
const filteredOrders = await collection('orders').aggregate([
  {
    $addFields: {
      highValueItems: {
        $filter: {
          input: '$items',
          as: 'item',
          cond: { $gte: ['$$item.price', 100] }
        }
      }
    }
  },
  {
    $match: {
      highValueItems: { $ne: [] }  // 只保留有高价商品的订单
    }
  }
]);
```

### 5. 按日期分组统计

常用于生成时间序列报表：

```javascript
// 按日统计订单
const dailyStats = await collection('orders').aggregate([
  {
    $match: {
      createdAt: {
        $gte: new Date('2024-01-01'),
        $lt: new Date('2024-02-01')
      }
    }
  },
  {
    $group: {
      _id: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: '$createdAt'
        }
      },
      orderCount: { $sum: 1 },
      totalAmount: { $sum: '$amount' },
      avgAmount: { $avg: '$amount' }
    }
  },
  {
    $sort: { _id: 1 }
  }
]);

// 按月统计
const monthlyStats = await collection('orders').aggregate([
  {
    $match: {
      createdAt: { $gte: new Date('2024-01-01') }
    }
  },
  {
    $group: {
      _id: {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
      },
      orderCount: { $sum: 1 },
      totalRevenue: { $sum: '$amount' }
    }
  },
  {
    $sort: { '_id.year': 1, '_id.month': 1 }
  }
]);
```

### 6. 多路聚合（$facet）

在一次查询中执行多个独立的聚合管道：

```javascript
const multiStats = await collection('orders').aggregate([
  {
    $match: {
      createdAt: { $gte: new Date('2024-01-01') }
    }
  },
  {
    $facet: {
      // 统计信息
      statistics: [
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        }
      ],
      // 按状态分组
      byStatus: [
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ],
      // Top 10 订单
      topOrders: [
        {
          $sort: { amount: -1 }
        },
        {
          $limit: 10
        },
        {
          $project: {
            orderId: 1,
            amount: 1,
            customerId: 1
          }
        }
      ]
    }
  }
]);

// 结果结构：
// {
//   statistics: [{ totalOrders: 1000, totalAmount: 500000, avgAmount: 500 }],
//   byStatus: [{ _id: 'paid', count: 800 }, ...],
//   topOrders: [{ orderId: '...', amount: 5000 }, ...]
// }
```

### 7. 流式处理大数据集

对于大量数据，使用流式处理避免内存溢出：

```javascript
const stream = await collection('orders').aggregate([
  {
    $match: {
      createdAt: { $gte: new Date('2024-01-01') }
    }
  },
  {
    $lookup: {
      from: 'users',
      localField: 'userId',
      foreignField: '_id',
      as: 'user'
    }
  },
  {
    $project: {
      orderId: 1,
      amount: 1,
      userName: { $arrayElemAt: ['$user.name', 0] }
    }
  }
], {
  stream: true,
  batchSize: 1000,
  allowDiskUse: true
});

let processedCount = 0;
let totalAmount = 0;

stream.on('data', (order) => {
  processedCount++;
  totalAmount += order.amount;
  
  // 逐条处理数据
  // processOrder(order);
});

stream.on('end', () => {
  console.log(`处理完成: ${processedCount} 条订单，总金额: ${totalAmount}`);
});

stream.on('error', (err) => {
  console.error('流处理错误:', err);
});
```

## 性能优化建议

### 1. 管道阶段顺序优化

将过滤操作（$match）尽早执行，减少后续阶段处理的数据量：

```javascript
// ✅ 好：先过滤再处理
const result = await collection('orders').aggregate([
  { $match: { status: 'paid', amount: { $gte: 100 } } },  // 先过滤
  { $lookup: { from: 'users', ... } },                     // 再关联
  { $project: { ... } }                                    // 最后投影
]);

// ❌ 不好：处理完再过滤
const result = await collection('orders').aggregate([
  { $lookup: { from: 'users', ... } },                     // 关联所有数据
  { $project: { ... } },
  { $match: { status: 'paid', amount: { $gte: 100 } } }   // 最后才过滤
]);
```

### 2. 使用索引

确保 $match 和 $sort 阶段使用的字段有索引：

```javascript
// 创建索引：db.orders.createIndex({ status: 1, createdAt: -1 })

const result = await collection('orders').aggregate([
  {
    $match: { status: 'paid' }  // 使用索引
  },
  {
    $sort: { createdAt: -1 }    // 使用索引
  },
  {
    $limit: 100
  }
], {
  hint: { status: 1, createdAt: -1 }  // 强制使用索引
});
```

### 3. 限制返回数据量

尽早使用 $limit 和 $project 减少数据量：

```javascript
// ✅ 好：尽早限制数据量
const result = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $sort: { amount: -1 } },
  { $limit: 10 },                    // 尽早限制
  { $lookup: { from: 'users', ... } }, // 只关联 10 条
  { $project: { orderId: 1, amount: 1, userName: '$user.name' } }
]);

// ❌ 不好：处理完所有数据再限制
const result = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $lookup: { from: 'users', ... } }, // 关联所有数据
  { $project: { ... } },
  { $limit: 10 }                     // 最后才限制
]);
```

### 4. 大数据集启用 allowDiskUse

```javascript
const result = await collection('orders').aggregate([
  { $match: { year: 2024 } },
  { $group: { _id: '$category', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } }
], {
  allowDiskUse: true,  // 处理大数据集时必须
  maxTimeMS: 30000     // 适当增加超时时间
});
```

### 5. 使用 explain 分析性能

```javascript
const plan = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $group: { _id: '$category', total: { $sum: 1 } } }
], {
  explain: 'executionStats'
});

console.log('执行时间:', plan.executionStats?.executionTimeMillis, 'ms');
console.log('扫描文档数:', plan.executionStats?.totalDocsExamined);
```

### 6. 优化 $lookup 性能

```javascript
// ✅ 好：关联字段有索引，使用 pipeline 过滤
const result = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  {
    $lookup: {
      from: 'users',
      let: { userId: '$userId' },
      pipeline: [
        { $match: { 
            $expr: { $eq: ['$_id', '$$userId'] },
            status: 'active'  // 在关联时过滤
        } },
        { $project: { name: 1, email: 1 } }  // 只投影需要的字段
      ],
      as: 'user'
    }
  }
], {
  allowDiskUse: true
});
```

## 错误处理

```javascript
try {
  const result = await collection('orders').aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
  ], {
    maxTimeMS: 5000
  });
  
  console.log('聚合结果:', result);
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.error('聚合操作超时');
  } else if (error.message?.includes('exceeded memory limit')) {
    console.error('内存溢出，请设置 allowDiskUse: true');
  } else if (error.code === 31249) {
    console.error('路径冲突或无效的管道阶段');
  } else {
    console.error('聚合失败:', error.message);
  }
}
```

## 与 find 的区别

| 特性 | find | aggregate |
|------|------|-----------|
| 用途 | 简单查询 | 复杂数据处理 |
| 联表查询 | ❌ | ✅ ($lookup) |
| 分组统计 | ❌ | ✅ ($group) |
| 数据转换 | 有限 | ✅ 强大 |
| 计算字段 | ❌ | ✅ |
| 多路聚合 | ❌ | ✅ ($facet) |
| 性能 | 快（简单查询） | 慢（复杂操作） |
| 内存使用 | 低 | 高（可用 allowDiskUse） |
| 流式处理 | ✅ | ✅ |
| 适用场景 | 基础 CRUD | 统计分析、报表 |

**选择建议**：
- 简单的文档查询：使用 `find`
- 需要统计、分组、计算：使用 `aggregate`
- 需要联表查询：使用 `aggregate` + `$lookup`
- 需要复杂的数据转换：使用 `aggregate`

## 常见聚合操作符

### 分组累加器

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$sum` | 求和 | `{ total: { $sum: '$amount' } }` |
| `$avg` | 平均值 | `{ avgPrice: { $avg: '$price' } }` |
| `$max` | 最大值 | `{ maxScore: { $max: '$score' } }` |
| `$min` | 最小值 | `{ minPrice: { $min: '$price' } }` |
| `$first` | 第一个值 | `{ firstOrder: { $first: '$orderId' } }` |
| `$last` | 最后一个值 | `{ lastOrder: { $last: '$orderId' } }` |
| `$push` | 推入数组 | `{ items: { $push: '$name' } }` |
| `$addToSet` | 去重推入数组 | `{ tags: { $addToSet: '$tag' } }` |

### 条件操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$cond` | 三元条件 | `{ $cond: [{ $gte: ['$age', 18] }, 'adult', 'minor'] }` |
| `$switch` | 多分支条件 | `{ $switch: { branches: [...], default: '...' } }` |
| `$ifNull` | 空值处理 | `{ $ifNull: ['$email', 'N/A'] }` |

### 数学操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$add` | 加法 | `{ $add: ['$price', '$tax'] }` |
| `$subtract` | 减法 | `{ $subtract: ['$amount', '$discount'] }` |
| `$multiply` | 乘法 | `{ $multiply: ['$price', '$quantity'] }` |
| `$divide` | 除法 | `{ $divide: ['$total', '$count'] }` |

### 字符串操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$concat` | 字符串连接 | `{ $concat: ['$firstName', ' ', '$lastName'] }` |
| `$substr` | 子字符串 | `{ $substr: ['$name', 0, 3] }` |
| `$toUpper` | 转大写 | `{ $toUpper: '$code' }` |
| `$toLower` | 转小写 | `{ $toLower: '$email' }` |

### 日期操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$dateToString` | 日期格式化 | `{ $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }` |
| `$year` | 提取年份 | `{ $year: '$createdAt' }` |
| `$month` | 提取月份 | `{ $month: '$createdAt' }` |
| `$dayOfMonth` | 提取日期 | `{ $dayOfMonth: '$createdAt' }` |

## 参考资料

- [MongoDB Aggregation 文档](https://docs.mongodb.com/manual/aggregation/)
- [aggregate 方法示例](../examples/aggregate.examples.js)
- [aggregate 方法测试](../test/aggregate.test.js)
- [find 方法文档](./find.md)

## 常见问题 FAQ

### Q1: aggregate 和 find 应该如何选择？

**A**: 根据查询复杂度选择：
- **使用 find**：简单的文档查询、条件过滤、排序、分页
- **使用 aggregate**：需要统计、分组、联表、复杂计算

### Q2: 为什么 aggregate 比 find 慢？

**A**: aggregate 需要经过多个处理阶段，每个阶段都会消耗资源。优化建议：
- 尽早使用 $match 过滤数据
- 确保过滤字段有索引
- 使用 $limit 限制处理数量
- 只投影需要的字段

### Q3: 如何优化大数据量的聚合操作？

**A**: 
1. ✅ 设置 `allowDiskUse: true`
2. ✅ 确保关联字段和过滤字段有索引
3. ✅ 使用流式处理（`stream: true`）
4. ✅ 适当增加 `maxTimeMS`
5. ✅ 使用 explain 分析性能瓶颈

### Q4: $lookup 性能差怎么办？

**A**: 优化策略：
- 确保关联字段有索引
- 使用 pipeline 形式，在关联时就过滤数据
- 避免多级嵌套 $lookup
- 考虑数据冗余设计，减少 $lookup 使用
- 大数据量时设置 `allowDiskUse: true`

### Q5: 什么时候使用流式处理？

**A**: 适合场景：
- 数据量超过 10 万条
- 需要逐条处理或转换数据
- 内存有限制
- 数据导出或 ETL 操作

### Q6: 聚合管道的执行顺序重要吗？

**A**: 非常重要！优化顺序：
1. $match（尽早过滤）
2. $sort（使用索引排序）
3. $limit（尽早限制数量）
4. $lookup（关联其他集合）
5. $unwind（展开数组）
6. $group（分组计算）
7. $project（字段投影）

## 最佳实践

### 1. 尽早过滤数据

```javascript
// ✅ 好
await collection('orders').aggregate([
  { $match: { status: 'paid', amount: { $gte: 100 } } },  // 第一步过滤
  { $lookup: { from: 'users', ... } },
  { $project: { ... } }
]);
```

### 2. 使用索引

```javascript
// 创建复合索引
// db.orders.createIndex({ status: 1, createdAt: -1 })

await collection('orders').aggregate([
  { $match: { status: 'paid' } },  // 使用索引
  { $sort: { createdAt: -1 } }     // 使用索引
], {
  hint: { status: 1, createdAt: -1 }
});
```

### 3. 只投影需要的字段

```javascript
await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  {
    $project: {
      orderId: 1,
      amount: 1,
      createdAt: 1
      // 不要投影不需要的字段
    }
  }
]);
```

### 4. 大数据集使用流式处理

```javascript
const stream = await collection('orders').aggregate([
  { $match: { year: 2024 } },
  { $project: { orderId: 1, amount: 1 } }
], {
  stream: true,
  batchSize: 1000,
  allowDiskUse: true
});
```

### 5. 设置合理的超时时间

```javascript
await collection('orders').aggregate([
  { $match: { ... } },
  { $group: { ... } }
], {
  maxTimeMS: 10000  // 复杂聚合设置较长超时
});
```

