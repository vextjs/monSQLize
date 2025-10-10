# Explain 功能文档

## 概述

`explain` 功能允许您查看 MongoDB 查询的执行计划，而不实际执行查询。这对于查询优化、索引分析和性能调优非常有用。

## 支持的方法

以下方法均支持 `explain` 参数：

- ✅ `findOne()`
- ✅ `find()`
- ✅ `stream()` (通过 `find()` 实现)
- ✅ `count()`
- ✅ `aggregate()`
- ✅ `distinct()`

## 使用方法

### 基础用法

```javascript
// 返回 queryPlanner 级别的执行计划
const explain = await collection.findOne({
  query: { age: { $gt: 25 } },
  explain: true
});
```

### Verbosity 级别

`explain` 参数支持以下级别：

| 级别 | 说明 | 返回内容 |
|------|------|----------|
| `true` 或 `'queryPlanner'` | 查询计划器（最快） | 仅返回查询计划，不执行查询 |
| `'executionStats'` | 执行统计（推荐） | 返回查询计划 + 实际执行统计 |
| `'allPlansExecution'` | 所有计划执行（最详细） | 返回所有候选计划的详细执行信息 |

## 示例

### 1. findOne - 查看单条查询计划

```javascript
// 基础 explain
const explain = await users.findOne({
  query: { email: 'user@example.com' },
  explain: true
});
console.log(explain.queryPlanner.winningPlan);

// 查看执行统计
const explainStats = await users.findOne({
  query: { age: { $gte: 18 } },
  sort: { createdAt: -1 },
  explain: 'executionStats'
});
console.log(`扫描文档数: ${explainStats.executionStats.totalDocsExamined}`);
console.log(`返回文档数: ${explainStats.executionStats.nReturned}`);
```

### 2. find - 查看多条查询计划

```javascript
// 分析复杂查询
const explain = await users.find({
  query: {
    status: 'active',
    age: { $gte: 18, $lte: 65 },
    city: { $in: ['Beijing', 'Shanghai'] }
  },
  sort: { score: -1 },
  limit: 100,
  explain: 'executionStats'
});

// 检查是否使用了索引
if (explain.executionStats.executionStages.stage === 'COLLSCAN') {
  console.warn('⚠️  警告：查询使用了全表扫描，建议添加索引');
}
```

### 3. count - 查看计数查询计划

```javascript
// 带条件的 count
const explainCount = await users.count({
  query: { status: 'active', age: { $gte: 18 } },
  explain: 'executionStats'
});

// 空查询的 count (estimatedDocumentCount)
const explainEmpty = await users.count({
  explain: true
});
// 注意：空查询使用 estimatedDocumentCount，explain 返回简化信息
```

### 4. aggregate - 查看聚合管道计划

```javascript
const explain = await orders.aggregate([
  { $match: { status: 'completed', date: { $gte: new Date('2024-01-01') } } },
  { $group: {
    _id: '$userId',
    totalAmount: { $sum: '$amount' },
    orderCount: { $sum: 1 }
  }},
  { $sort: { totalAmount: -1 } },
  { $limit: 10 }
], {
  explain: 'executionStats'
});

// 查看每个阶段的性能
explain.stages?.forEach((stage, i) => {
  console.log(`Stage ${i}:`, stage);
});
```

### 5. distinct - 查看去重查询计划

```javascript
const explain = await users.distinct('city', {
  query: { status: 'active' },
  explain: 'executionStats'
});

// distinct 通过聚合管道模拟
// 实际执行的是: [{ $match: {...} }, { $group: { _id: '$city' } }]
```

## 性能分析指南

### 关键指标

从 `executionStats` 中关注以下指标：

```javascript
const stats = explain.executionStats;

// 1. 执行时间
console.log(`执行时间: ${stats.executionTimeMillis}ms`);

// 2. 扫描文档数 vs 返回文档数
console.log(`扫描: ${stats.totalDocsExamined}, 返回: ${stats.nReturned}`);
// 比例越接近 1:1 越好

// 3. 是否使用索引
const stage = stats.executionStages.stage;
if (stage === 'IXSCAN') {
  console.log('✅ 使用了索引扫描');
} else if (stage === 'COLLSCAN') {
  console.log('⚠️  使用了全表扫描');
}

// 4. 索引键检查数
console.log(`索引键扫描: ${stats.totalKeysExamined}`);
```

### 性能优化建议

| 现象 | 原因 | 建议 |
|------|------|------|
| `totalDocsExamined >> nReturned` | 扫描了大量无关文档 | 添加或优化索引 |
| `stage === 'COLLSCAN'` | 全表扫描 | 为查询字段创建索引 |
| `executionTimeMillis > 100ms` | 查询慢 | 检查索引、查询条件、排序 |
| `totalKeysExamined >> nReturned` | 索引不够精确 | 优化索引字段顺序 |

## 注意事项

### 1. explain 模式下的行为

- ✅ 返回查询执行计划（对象）
- ❌ 不返回实际查询结果（文档）
- ❌ 结果不会被缓存
- ❌ 不触发慢查询日志

### 2. 互斥选项

```javascript
// ❌ explain 与 stream 互斥
await collection.find({
  query: { status: 'active' },
  stream: true,  // 将被忽略
  explain: true  // explain 优先
});

// ❌ explain 与 cache 互斥（explain 结果不缓存）
await collection.find({
  query: { status: 'active' },
  cache: 60000,  // 将被忽略
  explain: true
});
```

### 3. 特殊情况

**count 空查询：**
```javascript
// 使用 estimatedDocumentCount，没有实际的 explain
const explain = await collection.count({ explain: true });
// 返回简化的元信息而非完整的执行计划
```

**distinct 实现：**
```javascript
// distinct 通过聚合管道模拟来获取 explain
// 内部转换为: [{ $match: query }, { $group: { _id: '$field' } }]
```

## 实战案例

### 案例 1：发现缺失索引

```javascript
const explain = await users.find({
  query: { email: 'test@example.com' },
  explain: 'executionStats'
});

if (explain.executionStats.totalDocsExamined > 1000) {
  console.warn('⚠️  扫描了超过 1000 个文档，建议为 email 字段创建索引');
  // 创建索引: db.users.createIndex({ email: 1 })
}
```

### 案例 2：优化排序查询

```javascript
const explain = await orders.find({
  query: { status: 'pending' },
  sort: { createdAt: -1 },
  limit: 20,
  explain: 'executionStats'
});

// 检查是否需要内存排序
if (explain.executionStats.executionStages.sortPattern) {
  console.warn('⚠️  需要内存排序，建议创建复合索引: { status: 1, createdAt: -1 }');
}
```

### 案例 3：对比不同索引策略

```javascript
// 策略 1: 单字段索引
const explain1 = await users.find({
  query: { age: { $gte: 18 }, city: 'Beijing' },
  hint: { age: 1 },
  explain: 'executionStats'
});

// 策略 2: 复合索引
const explain2 = await users.find({
  query: { age: { $gte: 18 }, city: 'Beijing' },
  hint: { age: 1, city: 1 },
  explain: 'executionStats'
});

// 对比性能
console.log('单字段索引耗时:', explain1.executionStats.executionTimeMillis, 'ms');
console.log('复合索引耗时:', explain2.executionStats.executionTimeMillis, 'ms');
```

## 相关资源

- [MongoDB Explain 官方文档](https://www.mongodb.com/docs/manual/reference/method/cursor.explain/)
- [查询计划器文档](https://www.mongodb.com/docs/manual/core/query-plans/)
- [索引优化指南](https://www.mongodb.com/docs/manual/core/indexes/)

## 测试

运行测试以验证 explain 功能：

```bash
# 运行单元测试
node test/explain-test.js

# 运行演示示例
node examples/explain-demo.js
```

