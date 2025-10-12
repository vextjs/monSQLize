# distinct 方法详细文档

## 概述

`distinct` 是 monSQLize 提供的字段去重查询方法，用于从 MongoDB 集合中获取指定字段的所有唯一值。支持查询条件过滤、排序规则和缓存等功能。

## 方法签名

```javascript
async distinct(field, options = {})
```

## 参数说明

### field 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `field` | String | 是 | 要去重的字段名，支持嵌套字段（如 `'user.name'`、`'address.city'`） |

### options 对象属性

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | Object | 否 | `{}` | MongoDB 查询条件，只对匹配的文档进行去重 |
| `maxTimeMS` | Number | 否 | 全局配置 | 查询超时时间（毫秒） |
| `collation` | Object | 否 | - | 排序规则（用于字符串比较） |
| `cache` | Number | 否 | `0` | 缓存 TTL（毫秒），大于 0 时启用缓存 |
| `explain` | Boolean/String | 否 | - | 返回查询执行计划，可选值：`true`、`'queryPlanner'`、`'executionStats'`、`'allPlansExecution'` |

### collation 配置

指定字符串比较和去重的规则：

```javascript
collation: {
  locale: 'zh',           // 中文
  strength: 1,            // 1: 忽略大小写和重音，2: 区分大小写
  caseLevel: false,
  numericOrdering: true   // 数字字符串按数值排序
}
```

**常见场景**：
- 需要不区分大小写的去重（如邮箱、用户名）
- 多语言环境下的正确去重
- 数字字符串的自然去重

## 返回值

### 普通模式返回数组

默认情况下，`distinct` 方法返回一个 Promise，resolve 为去重后的值数组：

```javascript
const categories = await collection('products').distinct('category', {
  query: { inStock: true }
});

// categories = ['electronics', 'books', 'clothing']
```

**返回值类型**：`Promise<Array<any>>`

**注意**：
- 返回的数组元素类型取决于字段的实际数据类型
- 如果字段是数组类型，会展开数组并去重
- `null` 和不存在的字段会被视为一个唯一值

### explain 模式返回执行计划

当 `explain` 为 true 或指定级别时，返回查询执行计划：

```javascript
const plan = await collection('products').distinct('category', {
  query: { inStock: true },
  explain: 'executionStats'
});

// plan = {
//   queryPlanner: { ... },
//   executionStats: {
//     executionTimeMillis: 5,
//     totalDocsExamined: 100,
//     ...
//   }
// }
```

**返回值类型**：`Promise<Object>`

## 使用模式

### 1. 基础去重查询

最简单的去重方式，获取指定字段的所有唯一值：

```javascript
// 获取所有商品分类
const categories = await collection('products').distinct('category');
// 返回：['electronics', 'books', 'clothing']

// 获取所有用户状态
const statuses = await collection('users').distinct('status');
// 返回：['active', 'inactive', 'pending']

// 获取所有订单年份
const years = await collection('orders').distinct('year');
// 返回：[2021, 2022, 2023, 2024]
```

**适用场景**：
- 获取分类、标签等枚举值
- 统计数据的维度值
- 构建筛选器选项

### 2. 带条件的去重查询

结合查询条件，只对匹配的文档进行去重：

```javascript
// 获取在售商品的所有分类
const activeCategories = await collection('products').distinct('category', {
  query: { inStock: true }
});

// 获取活跃用户的角色列表
const activeRoles = await collection('users').distinct('role', {
  query: { status: 'active' }
});

// 获取已完成订单的客户ID列表
const completedCustomers = await collection('orders').distinct('customerId', {
  query: { status: 'completed' }
});
```

**适用场景**：
- 需要基于特定条件进行统计
- 动态筛选器选项
- 数据分析和报表

### 3. 嵌套字段去重

支持对嵌套字段进行去重：

```javascript
// 获取所有用户的城市
const cities = await collection('users').distinct('address.city');

// 获取所有订单的支付方式
const paymentMethods = await collection('orders').distinct('payment.method');

// 获取所有商品的主标签
const mainTags = await collection('products').distinct('tags.0');
```

**适用场景**：
- 复杂文档结构的字段统计
- 嵌套对象的维度分析

### 4. 数组字段去重

当字段本身是数组时，distinct 会展开数组并去重：

```javascript
// 假设商品文档结构：
// { name: "商品A", tags: ["sale", "hot", "new"] }
// { name: "商品B", tags: ["hot", "recommended"] }

const allTags = await collection('products').distinct('tags');
// 返回：["sale", "hot", "new", "recommended"]
// 自动展开所有商品的 tags 数组并去重
```

**适用场景**：
- 标签云、关键词统计
- 多选字段的所有可能值
- 分类聚合

### 5. 不区分大小写的去重

使用 `collation` 配置实现大小写不敏感的去重：

```javascript
// 不区分大小写获取用户名
const usernames = await collection('users').distinct('username', {
  collation: {
    locale: 'en',
    strength: 1  // 1 = 忽略大小写和重音
  }
});

// 假设数据：['Alice', 'alice', 'Bob', 'bob', 'Charlie']
// 返回：['Alice', 'Bob', 'Charlie']
```

**适用场景**：
- 用户名、邮箱等不区分大小写的字段
- 多语言文本去重
- 规范化数据统计

### 6. 复杂查询条件

结合 MongoDB 查询操作符进行复杂的条件去重：

```javascript
// 获取高价商品的分类
const expensiveCategories = await collection('products').distinct('category', {
  query: { price: { $gte: 1000 } }
});

// 获取近30天订单的客户ID
const recentCustomers = await collection('orders').distinct('customerId', {
  query: {
    createdAt: { $gte: new Date(Date.now() - 30 * 86400000) }
  }
});

// 获取评分高的商品标签
const topTags = await collection('products').distinct('tags', {
  query: {
    rating: { $gte: 4.5 },
    inStock: true
  }
});
```

**适用场景**：
- 数据分析和报表
- 条件筛选
- 业务逻辑统计

### 7. 启用缓存

对于频繁查询的去重结果，启用缓存可以显著提升性能：

```javascript
// 缓存商品分类列表 5 分钟
const categories = await collection('products').distinct('category', {
  cache: 5 * 60 * 1000
});

// 缓存用户角色列表 10 分钟
const roles = await collection('users').distinct('role', {
  query: { status: 'active' },
  cache: 10 * 60 * 1000
});
```

**适用场景**：
- 下拉列表、筛选器等 UI 组件数据
- 元数据和配置项
- 变化不频繁的统计数据

**注意事项**：
- 缓存时间不宜过长，避免数据不一致
- 数据更新频繁的场景不建议使用缓存
- 使用 `collection.invalidate('distinct')` 可手动清除缓存

### 8. 性能分析

使用 `explain` 参数查看查询性能和索引使用情况：

```javascript
// 查看基础执行计划
const plan1 = await collection('products').distinct('category', {
  explain: true
});

// 查看详细执行统计
const plan2 = await collection('products').distinct('category', {
  query: { inStock: true },
  explain: 'executionStats'
});

console.log('扫描文档数:', plan2.executionStats.totalDocsExamined);
console.log('执行时间:', plan2.executionStats.executionTimeMillis, 'ms');
```

**适用场景**：
- 性能优化和调试
- 索引效果验证
- 慢查询分析

## 性能优化建议

### 1. 使用索引

对频繁进行 distinct 查询的字段建立索引：

```javascript
// 为 category 字段创建索引
await db.collection('products').createIndex({ category: 1 });

// 为组合查询创建复合索引
await db.collection('products').createIndex({ inStock: 1, category: 1 });
```

**效果**：
- 大幅提升查询速度
- 减少扫描的文档数量
- 降低服务器负载

### 2. 合理使用查询条件

尽可能缩小查询范围，减少需要扫描的文档数量：

```javascript
// ❌ 不好：扫描所有文档
const allTags = await collection('products').distinct('tags');

// ✅ 更好：只扫描在售商品
const activeTags = await collection('products').distinct('tags', {
  query: { inStock: true }
});
```

### 3. 启用缓存

对于不常变化的数据，启用缓存：

```javascript
// 分类数据变化不频繁，缓存 30 分钟
const categories = await collection('products').distinct('category', {
  cache: 30 * 60 * 1000
});
```

### 4. 避免对大数组字段去重

对包含大量元素的数组字段进行 distinct 操作可能很慢：

```javascript
// ⚠️ 注意：如果 tags 数组很大，性能可能不佳
const allTags = await collection('products').distinct('tags');

// 考虑使用聚合管道进行更灵活的控制
```

## 常见问题

### Q1: distinct 与 aggregate + $group 的区别？

**distinct**：
- 简单易用，语法直观
- 专门用于字段去重
- 性能优化较好
- 不支持复杂的数据转换

**aggregate + $group**：
- 功能更强大，支持复杂聚合
- 可以同时计算多个字段
- 支持数据转换和计算
- 语法相对复杂

**选择建议**：
- 简单去重使用 `distinct`
- 需要计算、转换或多字段聚合使用 `aggregate`

### Q2: distinct 返回的数组是否有序？

默认情况下，distinct 返回的数组**无序**。如果需要排序，应在获取结果后手动排序：

```javascript
const categories = await collection('products').distinct('category');
const sortedCategories = categories.sort();
```

### Q3: 如何处理 null 值？

distinct 会将 `null` 值作为一个唯一值返回：

```javascript
// 假设有些文档的 category 字段为 null
const categories = await collection('products').distinct('category');
// 返回：['electronics', 'books', null]

// 如果想排除 null 值，使用查询条件
const categoriesWithoutNull = await collection('products').distinct('category', {
  query: { category: { $ne: null } }
});
```

### Q4: 如何统计每个唯一值的数量？

distinct 只返回唯一值，不返回计数。如需计数，使用 aggregate：

```javascript
// 使用 aggregate 统计每个分类的商品数量
const categoryCounts = await collection('products').aggregate([
  { $group: { _id: '$category', count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]);
// 返回：[{ _id: 'electronics', count: 45 }, { _id: 'books', count: 30 }, ...]
```

### Q5: distinct 支持多字段去重吗？

distinct 只支持单字段去重。如需多字段组合去重，使用 aggregate：

```javascript
// 获取唯一的 (category, brand) 组合
const combinations = await collection('products').aggregate([
  { $group: { _id: { category: '$category', brand: '$brand' } } }
]);
```

## 相关方法

- **find**: 查询多条记录，返回完整文档
- **findOne**: 查询单条记录
- **count**: 统计文档数量
- **aggregate**: 执行聚合管道操作

## 最佳实践

1. **为常用的 distinct 字段创建索引**
2. **使用查询条件缩小扫描范围**
3. **对不常变化的数据启用缓存**
4. **使用 explain 分析性能瓶颈**
5. **大数据集避免对数组字段进行 distinct**
6. **需要排序时手动对结果排序**
7. **需要计数时使用 aggregate 而非 distinct**

## 示例代码

更多完整示例请参考：
- [distinct.examples.js](../examples/distinct.examples.js) - 完整使用示例
- [distinct.test.js](../test/distinct.test.js) - 单元测试用例

