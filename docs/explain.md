# explain 方法详细文档

## 概述

`explain` 方法用于分析查询执行计划，帮助诊断性能问题和优化查询策略。它不返回实际数据，专用于诊断。

## 核心特性

- ✅ 3 种 verbosity 模式（queryPlanner / executionStats / allPlansExecution）
- ✅ 支持所有查询参数（query, projection, sort, limit, skip, hint, collation, maxTimeMS）
- ✅ 禁用缓存（诊断专用）
- ✅ 慢查询日志集成（执行耗时 > `slowQueryMs` 阈值）
- ✅ 错误处理（无效 verbosity 抛出 `INVALID_EXPLAIN_VERBOSITY`）

## 使用场景

1. **验证索引使用** - 检查查询是否使用了预期的索引
2. **诊断慢查询** - 分析查询瓶颈（全表扫描、内存排序等）
3. **对比查询策略** - 比较不同 hint/query 的性能差异
4. **优化复杂查询** - 分析聚合、联表等复杂查询的执行计划

## 方法签名

```javascript
async explain(options = {})
```

## 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | Object | 否 | `{}` | 查询条件（同 find） |
| `projection` | Object | 否 | - | 字段投影 |
| `sort` | Object | 否 | - | 排序规则 |
| `limit` | Number | 否 | - | 返回文档数限制 |
| `skip` | Number | 否 | - | 跳过文档数 |
| `hint` | Object/String | 否 | - | 强制使用指定索引 |
| `collation` | Object | 否 | - | 排序规则（locale, strength 等） |
| `maxTimeMS` | Number | 否 | 全局配置 | 查询超时时间（毫秒） |
| `verbosity` | String | 否 | `'queryPlanner'` | 详细程度：`'queryPlanner'` / `'executionStats'` / `'allPlansExecution'` |

## verbosity 模式

### 1. queryPlanner（默认）

返回查询优化器选择的执行计划，**不执行查询**。最轻量，适合快速检查索引使用情况。

```javascript
const plan = await collection('users').explain({
  query: { age: { $gte: 25 } }
  // verbosity: 'queryPlanner' // 默认值
});

console.log('使用索引:', plan.queryPlanner.winningPlan.inputStage?.indexName);
console.log('执行策略:', plan.queryPlanner.winningPlan.stage);
```

**返回信息**：
- `queryPlanner.winningPlan`: 查询优化器选择的计划
- `queryPlanner.rejectedPlans`: 被拒绝的候选计划
- `queryPlanner.parsedQuery`: 解析后的查询条件

### 2. executionStats

实际执行查询并返回详细统计信息（扫描文档数、耗时等）。适合性能分析。

```javascript
const stats = await collection('products').explain({
  query: { category: 'Electronics', price: { $gte: 500 } },
  sort: { price: -1 },
  limit: 10,
  verbosity: 'executionStats'
});

console.log('扫描文档数:', stats.executionStats.totalDocsExamined);
console.log('返回文档数:', stats.executionStats.nReturned);
console.log('执行耗时:', stats.executionStats.executionTimeMillis, 'ms');
console.log('查询效率:', (stats.executionStats.nReturned / stats.executionStats.totalDocsExamined * 100).toFixed(2) + '%');
```

**返回信息**：
- `executionStats.executionTimeMillis`: 执行耗时（毫秒）
- `executionStats.totalDocsExamined`: 扫描的文档数
- `executionStats.totalKeysExamined`: 扫描的索引键数
- `executionStats.nReturned`: 返回的文档数
- `executionStats.executionStages`: 详细的执行阶段信息

### 3. allPlansExecution

返回所有候选执行计划及其试执行结果。适合理解优化器的选择过程。

```javascript
const allPlans = await collection('orders').explain({
  query: { customerId: 'CUS050', status: 'completed', total: { $gte: 1000 } },
  verbosity: 'allPlansExecution'
});

console.log('候选计划数:', allPlans.executionStats.allPlansExecution?.length);
console.log('获胜计划索引:', allPlans.queryPlanner.winningPlan.inputStage?.indexName);
```

**返回信息**：
- 包含 `queryPlanner` 和 `executionStats` 的所有信息
- `executionStats.allPlansExecution`: 所有候选计划的执行详情

## 使用示例

### 示例 1: 基本查询计划分析

```javascript
const MonSQLize = require('monsqlize');
const { collection } = await new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
}).connect();

// 查看基本执行计划
const plan = await collection('products').explain({
  query: { category: 'Electronics', inStock: true },
  sort: { price: 1 },
  limit: 20
});

console.log('查询计划:', JSON.stringify(plan.queryPlanner.winningPlan, null, 2));

// 检查是否使用了索引
if (plan.queryPlanner.winningPlan.stage === 'COLLSCAN') {
  console.warn('⚠️ 全表扫描！建议创建索引');
} else {
  console.log('✅ 使用了索引:', plan.queryPlanner.winningPlan.inputStage?.indexName);
}
```

### 示例 2: 执行统计分析

```javascript
// 分析查询性能
const stats = await collection('orders').explain({
  query: {
    createdAt: { $gte: new Date('2024-01-01'), $lte: new Date('2024-12-31') },
    status: 'paid'
  },
  sort: { createdAt: -1 },
  limit: 100,
  verbosity: 'executionStats'
});

console.log('\n📊 执行统计:');
console.log('  - 执行时间:', stats.executionStats.executionTimeMillis, 'ms');
console.log('  - 扫描文档数:', stats.executionStats.totalDocsExamined);
console.log('  - 返回文档数:', stats.executionStats.nReturned);
console.log('  - 扫描索引键数:', stats.executionStats.totalKeysExamined);

// 计算查询效率
const efficiency = (stats.executionStats.nReturned / stats.executionStats.totalDocsExamined * 100).toFixed(2);
console.log('  - 查询效率:', efficiency, '%');

if (efficiency < 10) {
  console.warn('\n⚠️ 查询效率低于 10%，建议优化索引');
}
```

### 示例 3: 索引优化分析

```javascript
// 对比有无索引的性能差异
console.log('===== 无索引查询 =====');
const noIndexPlan = await collection('logs').explain({
  query: { level: 'ERROR', service: 'api-server' },
  verbosity: 'executionStats'
});
console.log('扫描文档数:', noIndexPlan.executionStats.totalDocsExamined);
console.log('执行时间:', noIndexPlan.executionStats.executionTimeMillis, 'ms');

// 创建索引
await collection('logs')._collection.createIndex({ level: 1, service: 1 });

console.log('\n===== 有索引查询 =====');
const withIndexPlan = await collection('logs').explain({
  query: { level: 'ERROR', service: 'api-server' },
  verbosity: 'executionStats'
});
console.log('扫描文档数:', withIndexPlan.executionStats.totalDocsExamined);
console.log('执行时间:', withIndexPlan.executionStats.executionTimeMillis, 'ms');

const improvement = ((1 - withIndexPlan.executionStats.executionTimeMillis / noIndexPlan.executionStats.executionTimeMillis) * 100).toFixed(2);
console.log('\n✅ 性能提升:', improvement, '%');
```

### 示例 4: hint 强制索引选择

```javascript
// 创建多个索引
await collection('inventory')._collection.createIndex({ category: 1, quantity: 1 }, { name: 'cat_qty_idx' });
await collection('inventory')._collection.createIndex({ warehouse: 1, quantity: 1 }, { name: 'wh_qty_idx' });

// 让优化器自动选择
console.log('===== 自动选择索引 =====');
const autoPlan = await collection('inventory').explain({
  query: { category: 'electronics', warehouse: 'wh-01', quantity: { $gte: 500 } },
  verbosity: 'executionStats'
});
console.log('选择的索引:', autoPlan.queryPlanner.winningPlan.inputStage?.indexName);
console.log('扫描文档数:', autoPlan.executionStats.totalDocsExamined);

// 强制使用 category 索引
console.log('\n===== 强制使用 category 索引 =====');
const hintPlan = await collection('inventory').explain({
  query: { category: 'electronics', warehouse: 'wh-01', quantity: { $gte: 500 } },
  hint: { category: 1, quantity: 1 },
  verbosity: 'executionStats'
});
console.log('使用的索引:', hintPlan.queryPlanner.winningPlan.inputStage?.indexName);
console.log('扫描文档数:', hintPlan.executionStats.totalDocsExamined);

// 对比效果
if (hintPlan.executionStats.totalDocsExamined < autoPlan.executionStats.totalDocsExamined) {
  console.log('\n✅ 强制索引效果更好');
} else {
  console.log('\n⚠️ 自动选择的索引效果更好');
}
```

### 示例 5: 所有候选计划分析

```javascript
const allPlans = await collection('orders').explain({
  query: { customerId: 'CUS050', status: 'completed', total: { $gte: 1000 } },
  sort: { createdAt: -1 },
  verbosity: 'allPlansExecution'
});

console.log('📊 查询计划分析:\n');
console.log('候选计划数:', allPlans.executionStats.allPlansExecution?.length || 0);
console.log('获胜计划:', allPlans.queryPlanner.winningPlan.inputStage?.indexName);

if (allPlans.executionStats.allPlansExecution) {
  console.log('\n所有候选计划:');
  allPlans.executionStats.allPlansExecution.forEach((plan, index) => {
    console.log(`  ${index + 1}. 索引:`, plan.inputStage?.indexName || '无');
    console.log(`     扫描: ${plan.totalDocsExamined} 文档`);
    console.log(`     耗时: ${plan.executionTimeMillis} ms\n`);
  });
}
```

### 示例 6: 慢查询诊断

```javascript
// 诊断慢查询
const slowPlan = await collection('analytics').explain({
  query: {
    timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), $lte: new Date() },
    'metadata.device': 'mobile'
  },
  sort: { timestamp: -1 },
  limit: 100,
  verbosity: 'executionStats'
});

console.log('🔍 慢查询诊断:\n');
console.log('执行方式:', slowPlan.queryPlanner.winningPlan.stage);
console.log('扫描文档:', slowPlan.executionStats.totalDocsExamined);
console.log('返回文档:', slowPlan.executionStats.nReturned);
console.log('执行耗时:', slowPlan.executionStats.executionTimeMillis, 'ms\n');

// 诊断问题
if (slowPlan.queryPlanner.winningPlan.stage === 'COLLSCAN') {
  console.log('❌ 问题: 全表扫描');
  console.log('💡 建议: 创建索引 { timestamp: -1, "metadata.device": 1 }');
}

if (slowPlan.queryPlanner.winningPlan.inputStage?.stage === 'SORT') {
  console.log('❌ 问题: 内存排序');
  console.log('💡 建议: 创建支持排序的索引');
}

const efficiency = (slowPlan.executionStats.nReturned / slowPlan.executionStats.totalDocsExamined * 100).toFixed(2);
if (efficiency < 10) {
  console.log(`❌ 问题: 查询效率低 (${efficiency}%)`);
  console.log('💡 建议: 优化查询条件或索引设计');
}
```

## 性能优化建议

### 1. 识别全表扫描

```javascript
const plan = await collection('users').explain({
  query: { email: 'user@example.com' },
  verbosity: 'executionStats'
});

if (plan.queryPlanner.winningPlan.stage === 'COLLSCAN') {
  console.warn('⚠️ 全表扫描检测到！');
  console.log('建议创建索引: db.users.createIndex({ email: 1 })');
}
```

### 2. 检查索引覆盖

```javascript
const plan = await collection('products').explain({
  query: { category: 'electronics', price: { $lt: 1000 } },
  projection: { name: 1, price: 1 },
  verbosity: 'executionStats'
});

// 检查是否使用了覆盖索引（IXSCAN + PROJECTION_COVERED）
const isCovered = plan.queryPlanner.winningPlan.stage === 'PROJECTION_COVERED';
if (isCovered) {
  console.log('✅ 使用了覆盖索引（最佳性能）');
} else {
  console.log('⚠️ 未使用覆盖索引');
  console.log('建议创建覆盖索引: { category: 1, price: 1, name: 1 }');
}
```

### 3. 分析排序性能

```javascript
const plan = await collection('orders').explain({
  query: { status: 'paid' },
  sort: { createdAt: -1 },
  limit: 100,
  verbosity: 'executionStats'
});

// 检查是否在内存中排序
const hasMemorySort = plan.queryPlanner.winningPlan.inputStage?.stage === 'SORT';
if (hasMemorySort) {
  console.warn('⚠️ 内存排序（性能较差）');
  console.log('建议创建复合索引: { status: 1, createdAt: -1 }');
} else {
  console.log('✅ 使用索引排序');
}
```

## 注意事项

- **explain 不返回实际数据**，仅返回执行计划和统计信息
- **禁用缓存**：explain 查询不会触发缓存读写
- **慢查询日志**：当 `verbosity = 'executionStats'` 或 `'allPlansExecution'` 且执行耗时 > `slowQueryMs` 时，会记录慢查询日志
- **生产环境**：executionStats 和 allPlansExecution 会实际执行查询，可能影响性能，建议在低峰期使用
- **hint 谨慎使用**：强制指定索引可能绕过优化器的智能选择，使用前应通过 explain 验证性能提升

## 错误处理

```javascript
try {
  const plan = await collection('users').explain({
    query: { age: { $gte: 18 } },
    verbosity: 'invalidMode'  // 无效的 verbosity
  });
} catch (error) {
  if (error.code === 'INVALID_EXPLAIN_VERBOSITY') {
    console.error('无效的 verbosity 模式');
    console.log('有效值: queryPlanner, executionStats, allPlansExecution');
  } else {
    console.error('Explain 失败:', error.message);
  }
}
```

## 参考资料

- [MongoDB Explain 文档](https://docs.mongodb.com/manual/reference/method/cursor.explain/)
- [explain 示例代码](../examples/explain.examples.js)
- [性能优化指南](./performance.md)
- [索引设计最佳实践](./indexing.md)
