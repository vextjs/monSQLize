# count 方法详细文档

## 📑 目录

- [概述](#概述)
- [方法签名](#方法签名)
- [参数说明](#参数说明)
- [返回值](#返回值)
- [使用模式](#使用模式)
- [错误处理](#错误处理)
- [性能优化建议](#性能优化建议)
- [最佳实践](#最佳实践)
- [常见问题](#常见问题)
- [相关方法](#相关方法)
- [示例代码](#示例代码)
- [测试用例](#测试用例)

---

## 概述

`count` 是 monSQLize 提供的统计查询方法，用于快速统计 MongoDB 集合中匹配指定条件的文档数量。内部使用 MongoDB 原生推荐的 `countDocuments()` 和 `estimatedDocumentCount()` 方法，支持索引提示、缓存和性能优化等功能。

## 方法签名

```javascript
async count(query = {}, options = {})
```

## 参数说明

### query 参数

查询条件对象，使用 MongoDB 标准查询语法。

**类型**：`Object`  
**必填**：否  
**默认值**：`{}`（空对象表示统计所有文档）

**示例**：

```javascript
// 简单查询
{ status: 'active' }

// 范围查询
{ age: { $gte: 18, $lt: 60 } }

// 逻辑查询
{
  $or: [
    { status: 'active' },
    { verified: true }
  ]
}

// 空查询（统计所有文档，自动使用 estimatedDocumentCount 优化）
{}
```

### options 参数对象

| 参数 | 类型 | 必填 | 默认值 | 来源 | 说明 |
|------|------|------|--------|------|------|
| `hint` | Object/String | 否 | - | MongoDB 原生 ✅ | 指定查询使用的索引（仅 countDocuments） |
| `collation` | Object | 否 | - | MongoDB 原生 ✅ | 指定排序规则（用于字符串比较，仅 countDocuments） |
| `skip` | Number | 否 | - | MongoDB 原生 ✅ | 跳过的文档数量（仅 countDocuments） |
| `limit` | Number | 否 | - | MongoDB 原生 ✅ | 限制统计的文档数量（仅 countDocuments） |
| `maxTimeMS` | Number | 否 | 全局配置 | MongoDB 原生 ✅ | 查询超时时间（毫秒） |
| `comment` | String | 否 | - | MongoDB 原生 ✅ | 查询注释，用于生产环境日志跟踪和性能分析 |
| `explain` | Boolean/String | 否 | - | MongoDB 原生 ✅ | 返回查询执行计划，可选值：`true`、`'queryPlanner'`、`'executionStats'`、`'allPlansExecution'` |
| `cache` | Number | 否 | `0` | monSQLize 扩展 🔧 | 缓存 TTL（毫秒），大于 0 时启用缓存 |
| `meta` | Boolean/Object | 否 | `false` | monSQLize 扩展 🔧 | 返回查询元数据（执行时间、缓存命中率等） |

**图例说明**:
- ✅ **MongoDB 原生**: 该参数是 MongoDB 官方支持的标准功能
- 🔧 **monSQLize 扩展**: monSQLize 独有的扩展功能

**MongoDB 参考文档**: 
- [countDocuments()](https://www.mongodb.com/docs/manual/reference/method/db.collection.countDocuments/)
- [estimatedDocumentCount()](https://www.mongodb.com/docs/manual/reference/method/db.collection.estimatedDocumentCount/)

### 性能优化说明

**自动选择最优方法**：
- 当 `query` 为空对象 `{}` 时，自动使用 `estimatedDocumentCount()`（基于集合元数据，性能最优）
- 当 `query` 有查询条件时，使用 `countDocuments()`（精确统计，支持索引）

### comment 配置

查询注释用于在 MongoDB 日志中标识统计查询的用途：

```javascript
comment: 'AdminDashboard:getTotalActiveUsers:admin_user_5'
```

**使用场景**：
- **仪表盘统计**：标识各种统计指标的查询来源
- **定期任务**：标识定时统计任务
- **监控告警**：标识监控系统的统计查询
- **数据分析**：标识数据分析相关的统计

**示例**：
```javascript
// 活跃用户统计
const activeCount = await collection('users').count(
  { status: 'active' },
  { comment: 'Dashboard:activeUsers:daily_report' }
);

// 订单量统计
const orderCount = await collection('orders').count(
  { createdAt: { $gte: today } },
  { comment: 'Analytics:todayOrders:cronjob_hourly' }
);
```

**参考**：完整的 comment 使用指南请参考 [find 方法文档](./find.md#comment-配置)

### hint 配置

强制 MongoDB 使用指定的索引（仅在使用 countDocuments 时有效）：

```javascript
// 使用索引名称
{ hint: 'status_createdAt_idx' }

// 使用索引定义
{ hint: { status: 1, createdAt: -1 } }
```

**使用场景**：
- MongoDB 查询优化器选择了错误的索引
- 需要强制使用特定索引以保证性能
- 测试不同索引的性能差异

### skip 和 limit 配置

控制统计的文档范围（仅在使用 countDocuments 时有效）：

```javascript
// 统计第 100 到第 200 个匹配的文档
await collection('users').count(
  { status: 'active' },
  { skip: 100, limit: 100 }
);
```

**使用场景**：
- 分页统计（仅统计当前页的文档数）
- 抽样统计（仅统计部分匹配文档）

### collation 配置

指定字符串比较规则：

```javascript
collation: {
  locale: 'zh',           // 中文
  strength: 2,            // 忽略大小写和重音符号
  caseLevel: false,
  numericOrdering: true   // 数字字符串按数值排序
}
```

**常见场景**：
- 需要不区分大小写的统计
- 多语言环境下的正确统计

## 返回值

### 普通模式返回数字

默认情况下，`count` 方法返回一个 Promise，resolve 为匹配的文档数量：

```javascript
### 普通模式返回数字

默认情况下，`count` 方法返回一个 Promise，resolve 为匹配的文档数量：

```javascript
const activeUserCount = await collection('users').count({ status: 'active' });

// activeUserCount = 42
```

**返回值类型**：`Promise<number>`

### explain 模式返回执行计划

当 `explain` 为 true 或指定级别时，返回查询执行计划：

```javascript
const plan = await collection('users').count(
  { status: 'active' },
  { explain: 'executionStats' }
);

// plan = {
//   queryPlanner: { ... },
//   executionStats: {
//     executionTimeMillis: 2,
//     totalDocsExamined: 0,
//     totalKeysExamined: 10,
//     ...
//   }
// }
```

**返回值类型**：`Promise<Object>`

## 使用模式

### 1. 基础统计

最简单的统计方式：

```javascript
// 统计所有用户（空查询，自动使用 estimatedDocumentCount）
const totalUsers = await collection('users').count();
console.log(`总用户数: ${totalUsers}`);

// 统计活跃用户
const activeUsers = await collection('users').count({ status: 'active' });
console.log(`活跃用户数: ${activeUsers}`);

// 统计特定角色用户
const adminCount = await collection('users').count({ role: 'admin' });
console.log(`管理员数量: ${adminCount}`);
```

**适用场景**：
- 统计集合总文档数
- 统计满足条件的文档数
- 数据概览和报表生成

### 2. 复杂条件统计

使用 MongoDB 查询操作符构建复杂统计：

```javascript
// 范围统计
const highValueOrders = await collection('orders').count({
  amount: { $gte: 1000 },
  status: 'completed'
});

// 逻辑组合统计
const vipOrHighLevelUsers = await collection('users').count({
  $or: [
    { role: 'vip' },
    { level: { $gte: 10 } }
  ],
  verified: true
});

// 数组字段统计
const featuredProducts = await collection('products').count({
  tags: 'featured',
  inStock: true
});

// 日期范围统计
const recentOrders = await collection('orders').count({
  createdAt: {
    $gte: new Date('2025-01-01'),
    $lt: new Date('2025-02-01')
  }
});
```

### 3. 使用索引优化

通过 hint 强制使用索引，explain 查看执行计划：

```javascript
// 强制使用索引
const count = await collection('orders').count(
  { 
    status: 'completed',
    createdAt: { $gte: new Date('2025-01-01') }
  },
  { hint: { status: 1, createdAt: -1 } }
);

// 查看执行计划
const plan = await collection('orders').count(
  { status: 'completed' },
  { explain: 'executionStats' }
);

console.log('执行时间:', plan.executionStats.executionTimeMillis, 'ms');
console.log('扫描文档数:', plan.executionStats.totalDocsExamined);
console.log('扫描索引键数:', plan.executionStats.totalKeysExamined);
```

**性能优化建议**：
- 为常用统计字段创建索引
- 使用复合索引优化多条件统计
- 定期分析慢查询并优化索引
- 空查询时自动使用 `estimatedDocumentCount`（性能最优）

### 4. 缓存使用

启用缓存以提升统计性能：

```javascript
// 缓存 5 分钟
const activeUserCount = await collection('users').count(
  { status: 'active' },
  { cache: 5 * 60 * 1000 }  // 5 分钟
);

// 第二次查询会从缓存返回
const cachedCount = await collection('users').count(
  { status: 'active' },
  { cache: 5 * 60 * 1000 }
);
```

**缓存策略**：
- 对频繁统计且数据变化不频繁的场景启用缓存
- 设置合理的 TTL 时间
- 注意缓存失效机制
- 数据更新后使用 `invalidate()` 清除缓存

### 5. 性能对比：空查询优化

monSQLize 自动优化空查询（无查询条件）：

```javascript
// 空查询自动使用 estimatedDocumentCount（快速，基于元数据）
const totalUsers = await collection('users').count();

// 有条件查询使用 countDocuments（精确，但较慢）
const activeUsers = await collection('users').count({ status: 'active' });
```

**性能差异**：
- `estimatedDocumentCount`: 毫秒级，基于集合元数据
- `countDocuments`: 秒级（大数据），需要扫描文档或索引

## 错误处理

`count` 方法可能抛出以下错误：

```javascript
try {
  const count = await collection('users').count(
    { status: 'active' },
    { maxTimeMS: 1000 }
  );
  console.log('统计结果:', count);
} catch (error) {
  if (error.code === 'NOT_CONNECTED') {
    console.error('数据库未连接');
  } else if (error.message.includes('timeout')) {
    console.error('查询超时');
  } else {
    console.error('统计失败:', error.message);
  }
}
```

**常见错误**：
- `NOT_CONNECTED`: 数据库未连接
- 查询超时错误（大数据量）
- 权限相关错误
- 无效查询条件错误

## 性能优化建议

### 1. 索引优化

```javascript
// ❌ 不推荐：未索引字段统计（慢）
const count = await collection('orders').count({ customerName: 'Alice' });  // customerName 未索引

// ✅ 推荐：索引字段统计（快）
const count = await collection('orders').count({ customerId: 'USER-001' });  // customerId 已索引
```

### 2. 查询条件优化

```javascript
// ❌ 不推荐：正则表达式统计（慢）
const count = await collection('users').count({ email: { $regex: /^admin/ } });

// ✅ 推荐：精确匹配或前缀索引
const count = await collection('users').count({ role: 'admin' });
```

### 3. 缓存策略

```javascript
// ✅ 推荐：频繁统计启用缓存
const getDashboardStats = async () => {
  const totalUsers = await collection('users').count({}, { cache: 60000 });  // 1 分钟缓存
  
  const activeUsers = await collection('users').count(
    { status: 'active' },
    { cache: 60000 }
  );
  
  return { totalUsers, activeUsers };
};
```

### 4. 超时设置

```javascript
// 为大数据量统计设置合理超时
const count = await collection('orders').count(
  { status: 'completed' },
  { maxTimeMS: 5000 }  // 5 秒超时
);
```

### 5. skip 和 limit 优化

```javascript
// 统计前 1000 个匹配的文档（抽样统计）
const sampleCount = await collection('orders').count(
  { status: 'completed' },
  { limit: 1000 }
);
```

## 最佳实践

1. **为统计字段创建索引**：确保查询条件中的字段有合适的索引
2. **使用缓存减少负载**：对频繁统计且数据变化不频繁的场景启用缓存
3. **避免全表扫描**：尽量使用索引字段进行统计
4. **设置超时保护**：为大数据量统计设置 maxTimeMS
5. **监控慢查询**：使用 explain 分析统计性能
6. **空查询优化**：利用 estimatedDocumentCount 的性能优势

## 常见问题

### Q: count 和 estimatedDocumentCount 的区别？

**A**: monSQLize 自动处理：
- 空查询 `count()` 自动使用 `estimatedDocumentCount`（快速，基于元数据）
- 有条件查询自动使用 `countDocuments`（精确，扫描索引或文档）

### Q: 如何提升大数据量统计性能？

**A**: 
1. 为查询字段创建索引
2. 使用缓存减少重复统计
3. 考虑使用聚合管道预计算统计数据
4. 对实时性要求不高的统计可以异步更新

### Q: count 会扫描所有文档吗？

**A**: 
- 有索引：只扫描索引，不扫描文档
- 无索引：需要扫描所有文档
- 空查询：使用集合元数据，不扫描文档

## 相关方法

- `find()`: 查询多条记录
- `findOne()`: 查询单条记录
- `findPage()`: 分页查询
- `aggregate()`: 聚合查询（更复杂的统计）
- `invalidate()`: 使缓存失效

## 示例代码

完整的使用示例请参考：`examples/count.examples.js`

## 测试用例

完整的测试用例请参考：`test/count.test.js`

