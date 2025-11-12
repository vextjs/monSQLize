# explain 方法详细文档

## 概述

`explain` 方法用于分析查询执行计划，帮助诊断性能问题和优化查询策略。**直接使用 MongoDB 原生 `Cursor.explain()` 方法**，返回查询执行计划而非实际数据，专用于性能诊断。

## 核心特性

- ✅ **原生 MongoDB API**：直接调用 `cursor.explain()` 方法
- ✅ **3 种详细级别**：`queryPlanner`（默认）/ `executionStats` / `allPlansExecution`
- ✅ **完整查询支持**：filter、projection、sort、limit、skip、hint、collation 等所有原生选项
- ✅ **多操作支持**：find、aggregate、count、distinct 等查询操作
- ✅ **性能分析**：索引使用情况、扫描文档数、执行时间等详细统计

## 使用场景

### 1. 验证索引使用
检查查询是否使用了预期的索引，识别全表扫描（COLLSCAN）问题。

### 2. 诊断慢查询
分析查询瓶颈（全表扫描、内存排序、多阶段处理等），找出性能优化点。

### 3. 对比查询策略
比较不同 hint/query 的性能差异，选择最优索引和查询条件。

### 4. 优化复杂查询
分析聚合管道、多字段查询等复杂查询的执行计划，优化管道顺序和索引设计。

## 方法签名

monSQLize 提供**两种方式**使用 explain，与原生 MongoDB 完全兼容：

### 方式 1：链式调用（与原生 MongoDB 一致）

```javascript
// find 查询 - 链式调用
await collection('products').find({ category: 'electronics' }).explain('executionStats');

// aggregate 聚合 - 链式调用
await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $group: { _id: '$customerId', total: { $sum: '$amount' } } }
]).explain('executionStats');

// 完整示例
await collection('products')
  .find({ category: 'electronics', inStock: true })
  .explain('queryPlanner');  // 或 'executionStats' / 'allPlansExecution'
```

**优点**：
- ✅ 与原生 MongoDB API 完全一致
- ✅ 语法简洁直观
- ✅ 适合快速性能分析

**注意**：
- 链式调用时不能使用 sort、limit 等选项
- 如需这些选项，请使用方式 2

### 方式 2：options 参数（支持完整查询选项）

```javascript
// find 查询 - 完整选项
await collection('products').find(
  { category: 'electronics' },
  { 
    sort: { price: 1 },
    limit: 10,
    projection: { name: 1, price: 1 },
    hint: { category: 1 },
    explain: 'executionStats'
  }
);

// aggregate 聚合
await collection('orders').aggregate(
  [
    { $match: { status: 'paid' } },
    { $group: { _id: '$customerId', total: { $sum: '$amount' } } }
  ],
  { explain: 'executionStats' }
);

// count 计数
await collection('users').count(
  { status: 'active' },
  { explain: true }
);

// distinct 去重
await collection('products').distinct(
  'category',
  { inStock: true },
  { explain: 'queryPlanner' }
);
```

**优点**：
- ✅ 支持 sort、limit、skip、projection、hint 等所有查询选项
- ✅ 支持所有查询方法（find、aggregate、count、distinct）
- ✅ 参数集中，代码清晰



## 参数说明

### verbosity 参数

指定返回的详细级别，决定执行计划包含的信息量。

| 值 | 类型 | 说明 | 是否执行查询 |
|---|------|------|------------|
| `'queryPlanner'` | String | 返回查询优化器选择的执行计划（默认） | ❌ 否 |
| `'executionStats'` | String | 返回执行计划 + 实际执行统计信息 | ✅ 是 |
| `'allPlansExecution'` | String | 返回所有候选计划及其执行统计 | ✅ 是 |
| `true` | Boolean | 等同于 `'queryPlanner'` | ❌ 否 |

### 查询选项（所有 find/aggregate 支持的选项）

**核心选项**（MongoDB 原生支持）：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `filter` / `query` | Object | 否 | `{}` | 查询条件（find 操作） |
| `projection` | Object | 否 | - | 字段投影 |
| `sort` | Object | 否 | - | 排序规则 |
| `limit` | Number | 否 | - | 返回文档数限制 |
| `skip` | Number | 否 | - | 跳过文档数 |
| `hint` | Object/String | 否 | - | 强制使用指定索引 |
| `collation` | Object | 否 | - | 排序规则（locale、strength 等） |
| `maxTimeMS` | Number | 否 | - | 查询超时时间（毫秒） |
| `comment` | String | 否 | - | 查询注释，用于日志追踪 |

**聚合管道选项**（aggregate 操作）：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `pipeline` | Array | 是 | - | 聚合管道阶段数组 |
| `allowDiskUse` | Boolean | 否 | `false` | 是否允许使用磁盘进行大数据量排序/分组 |
| `maxTimeMS` | Number | 否 | - | 聚合操作超时时间 |
| `hint` | Object/String | 否 | - | 强制使用指定索引 |
| `comment` | String | 否 | - | 查询注释 |

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

// ========== 方式 1：链式调用（与原生 MongoDB 一致） ==========
const plan1 = await collection('products')
  .find({ category: 'Electronics', inStock: true })
  .explain('queryPlanner');

// ========== 方式 2：options 参数（支持更多选项） ==========
const plan2 = await collection('products').find(
  { category: 'Electronics', inStock: true },
  {
    sort: { price: 1 },
    limit: 20,
    explain: 'queryPlanner'
  }
);

console.log('查询计划:', JSON.stringify(plan1.queryPlanner.winningPlan, null, 2));

// 检查是否使用了索引
if (plan1.queryPlanner.winningPlan.stage === 'COLLSCAN') {
  console.warn('⚠️ 全表扫描！建议创建索引');
} else {
  console.log('✅ 使用了索引:', plan1.queryPlanner.winningPlan.inputStage?.indexName);
}
```

### 示例 2: 执行统计分析

```javascript
// 分析查询性能
const stats = await collection('orders').find(
  {
    createdAt: { $gte: new Date('2024-01-01'), $lte: new Date('2024-12-31') },
    status: 'paid'
  },
  {
    sort: { createdAt: -1 },
    limit: 100,
    explain: 'executionStats'
  }
);

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
const noIndexPlan = await collection('logs').find(
  { level: 'ERROR', service: 'api-server' },
  { explain: 'executionStats' }
);
console.log('扫描文档数:', noIndexPlan.executionStats.totalDocsExamined);
console.log('执行时间:', noIndexPlan.executionStats.executionTimeMillis, 'ms');

// 创建索引
await collection('logs')._collection.createIndex({ level: 1, service: 1 });

console.log('\n===== 有索引查询 =====');
const withIndexPlan = await collection('logs').find(
  { level: 'ERROR', service: 'api-server' },
  { explain: 'executionStats' }
);
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
const autoPlan = await collection('inventory').find(
  { category: 'electronics', warehouse: 'wh-01', quantity: { $gte: 500 } },
  { explain: 'executionStats' }
);
console.log('选择的索引:', autoPlan.queryPlanner.winningPlan.inputStage?.indexName);
console.log('扫描文档数:', autoPlan.executionStats.totalDocsExamined);

// 强制使用 category 索引
console.log('\n===== 强制使用 category 索引 =====');
const hintPlan = await collection('inventory').find(
  { category: 'electronics', warehouse: 'wh-01', quantity: { $gte: 500 } },
  {
    hint: { category: 1, quantity: 1 },
    explain: 'executionStats'
  }
);
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
const allPlans = await collection('orders').find(
  { customerId: 'CUS050', status: 'completed', total: { $gte: 1000 } },
  {
    sort: { createdAt: -1 },
    explain: 'allPlansExecution'
  }
);

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
const slowPlan = await collection('analytics').find(
  {
    timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), $lte: new Date() },
    'metadata.device': 'mobile'
  },
  {
    sort: { timestamp: -1 },
    limit: 100,
    explain: 'executionStats'
  }
);

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
const plan = await collection('users').find(
  { email: 'user@example.com' },
  { explain: 'executionStats' }
);

if (plan.queryPlanner.winningPlan.stage === 'COLLSCAN') {
  console.warn('⚠️ 全表扫描检测到！');
  console.log('建议创建索引: db.users.createIndex({ email: 1 })');
}
```

### 2. 检查索引覆盖

```javascript
const plan = await collection('products').find(
  { category: 'electronics', price: { $lt: 1000 } },
  {
    projection: { name: 1, price: 1 },
    explain: 'executionStats'
  }
);

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
const plan = await collection('orders').find(
  { status: 'paid' },
  {
    sort: { createdAt: -1 },
    limit: 100,
    explain: 'executionStats'
  }
);

// 检查是否在内存中排序
const hasMemorySort = plan.queryPlanner.winningPlan.inputStage?.stage === 'SORT';
if (hasMemorySort) {
  console.warn('⚠️ 内存排序（性能较差）');
  console.log('建议创建复合索引: { status: 1, createdAt: -1 }');
} else {
  console.log('✅ 使用索引排序');
}
```

## 聚合管道的 explain

### 聚合管道 explain 示例

```javascript
// 分析聚合管道的执行计划
const aggPlan = await collection('orders').aggregate(
  [
    { $match: { status: 'paid', createdAt: { $gte: new Date('2024-01-01') } } },
    { $group: { _id: '$customerId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 }
  ],
  { explain: 'executionStats' }
);

console.log('📊 聚合管道分析:');
console.log('总执行时间:', aggPlan.executionStats.executionTimeMillis, 'ms');

// 分析每个阶段
aggPlan.executionStats.executionStages.forEach((stage, index) => {
  console.log(`\n阶段 ${index + 1}: ${stage.stage}`);
  console.log('  - 处理文档数:', stage.nReturned);
  console.log('  - 执行时间:', stage.executionTimeMillis, 'ms');
});

// 检查是否使用了索引
if (aggPlan.executionStats.executionStages[0]?.indexName) {
  console.log('\n✅ $match 阶段使用了索引:', aggPlan.executionStats.executionStages[0].indexName);
} else {
  console.log('\n⚠️ $match 阶段未使用索引，建议优化');
}
```

### 聚合管道优化建议

```javascript
// ❌ 不好：先 $project 再 $match（无法使用索引）
const badPipeline = [
  { $project: { category: 1, price: 1, inStock: 1 } },
  { $match: { category: 'electronics', inStock: true } }
];

// ✅ 更好：先 $match 再 $project（可以使用索引）
const goodPipeline = [
  { $match: { category: 'electronics', inStock: true } },  // 可以使用索引
  { $project: { category: 1, price: 1, inStock: 1 } }
];

// 对比执行计划
const badPlan = await collection('products').aggregate(badPipeline, { explain: 'executionStats' });
const goodPlan = await collection('products').aggregate(goodPipeline, { explain: 'executionStats' });

console.log('不优化的管道:');
console.log('  - 扫描文档数:', badPlan.executionStats.totalDocsExamined);
console.log('  - 执行时间:', badPlan.executionStats.executionTimeMillis, 'ms');

console.log('\n优化后的管道:');
console.log('  - 扫描文档数:', goodPlan.executionStats.totalDocsExamined);
console.log('  - 执行时间:', goodPlan.executionStats.executionTimeMillis, 'ms');
```

## monSQLize explain 与原生 MongoDB 的对比

### 原生 MongoDB explain（链式调用）

```javascript
// 原生 MongoDB 驱动 - 链式调用
const cursor = db.collection('products').find({ category: 'electronics' })
  .sort({ price: 1 })
  .limit(10);

const plan = await cursor.explain('executionStats');

// 或者直接链式调用
const plan2 = await db.collection('products')
  .find({ category: 'electronics' })
  .sort({ price: 1 })
  .limit(10)
  .explain('executionStats');
```

### monSQLize explain（完全兼容）

**方式 1：链式调用（与原生一致）**

```javascript
// monSQLize - 链式调用（与原生 MongoDB 完全一致）
const plan = await collection('products')
  .find({ category: 'electronics' })
  .explain('executionStats');
```

**注意**：链式调用时，sort/limit/skip 等选项需要在 find 的第二个参数中指定：

```javascript
// ❌ 不支持：链式调用不能再添加 sort/limit
// await collection('products').find({ ... }).sort({ price: 1 }).explain()

// ✅ 正确：在 find 参数中指定选项
const plan = await collection('products')
  .find({ category: 'electronics' }, { sort: { price: 1 }, limit: 10 })
  .explain('executionStats');
```

**方式 2：options 参数（推荐，功能更完整）**

```javascript
// monSQLize - 使用 options 参数
const plan = await collection('products').find(
  { category: 'electronics' },
  {
    sort: { price: 1 },
    limit: 10,
    explain: 'executionStats'
  }
);
```

### 实现原理

monSQLize 通过在 Promise 对象上添加 `explain()` 方法来实现链式调用：

```javascript
// 内部实现示例
const resultPromise = run('find', { query, ...options }, async () => { ... });

// 添加 explain 方法
resultPromise.explain = async (verbosity = 'queryPlanner') => {
  const cursor = collection.find(query, driverOpts);
  return cursor.explain(verbosity);
};

return resultPromise;  // 返回增强的 Promise
```

这样既可以：
- 直接 `await collection('products').find({ ... })`  获取查询结果
- 也可以 `await collection('products').find({ ... }).explain('executionStats')` 获取执行计划

### 核心原则

- ✅ **完全兼容**：支持原生 MongoDB 的链式调用语法
- ✅ **返回值一致**：返回完全相同的执行计划对象
- ✅ **向后兼容**：仍然支持 options 参数方式
- ✅ **支持所有操作**：find、aggregate、count、distinct 等都支持 explain 选项

## 注意事项

- **explain 不返回实际数据**：仅返回执行计划和统计信息，不返回查询结果
- **executionStats 会执行查询**：`executionStats` 和 `allPlansExecution` 模式会实际执行查询以收集统计信息
- **生产环境谨慎使用**：在生产环境使用 `executionStats` 可能影响性能，建议在低峰期或测试环境使用
- **hint 谨慎使用**：强制指定索引可能绕过优化器的智能选择，使用前应通过 explain 验证效果
- **verbosity 参数**：
  - `queryPlanner`：不执行查询，开销最小
  - `executionStats`：执行查询，返回统计信息
  - `allPlansExecution`：执行所有候选计划，开销最大
- **与缓存的关系**：explain 查询不会触发 monSQLize 的缓存机制
- **慢查询日志**：当使用 `executionStats` 且执行时间超过配置的慢查询阈值时，会记录到慢查询日志

## 错误处理

```javascript
try {
  const plan = await collection('users').find(
    { age: { $gte: 18 } },
    { explain: 'invalidMode' }  // 无效的 verbosity
  );
} catch (error) {
  console.error('Explain 失败:', error.message);
  
  // 常见错误类型
  if (error.message.includes('verbosity')) {
    console.log('有效的 verbosity 值: queryPlanner, executionStats, allPlansExecution');
  }
  
  if (error.message.includes('hint')) {
    console.log('指定的 hint 索引不存在');
  }
}
```

## 常见问题

### Q1: explain 的 verbosity 应该选择哪个？

**选择建议**：
- **快速检查索引使用**：使用 `queryPlanner`（默认），不执行查询，开销最小
- **分析实际性能**：使用 `executionStats`，获取执行时间、扫描文档数等实际统计
- **对比多个索引方案**：使用 `allPlansExecution`，查看所有候选计划的性能

### Q2: explain 会影响数据库性能吗？

**影响程度**：
- `queryPlanner`：无影响，仅分析查询计划，不执行查询
- `executionStats`：有一定影响，需要实际执行查询收集统计
- `allPlansExecution`：影响较大，需要试执行所有候选计划

**建议**：
- 开发/测试环境：可随意使用
- 生产环境：优先使用 `queryPlanner`，需要 `executionStats` 时选择低峰期

### Q3: 如何理解 explain 返回的执行计划？

**关键字段**：
- `stage: 'COLLSCAN'`：全表扫描（性能差）
- `stage: 'IXSCAN'`：索引扫描（性能好）
- `stage: 'FETCH'`：根据索引获取完整文档
- `stage: 'SORT'`：内存排序（可优化）
- `stage: 'PROJECTION_COVERED'`：覆盖索引（最优）

**性能指标**：
- `totalDocsExamined`：扫描的文档数（越少越好）
- `totalKeysExamined`：扫描的索引键数
- `nReturned`：返回的文档数
- `executionTimeMillis`：执行时间（毫秒）
- 查询效率 = `nReturned / totalDocsExamined`（接近 100% 最好）

### Q4: 为什么我创建了索引，explain 还是显示 COLLSCAN？

**可能原因**：
1. **查询条件不匹配索引**：索引是 `{ name: 1 }`，但查询条件是 `{ email: 'xxx' }`
2. **数据量太小**：集合文档数少于 100 时，优化器可能选择全表扫描
3. **索引选择性差**：查询条件匹配的文档数超过集合的 30%，优化器认为全表扫描更快
4. **索引未生效**：索引正在构建中（`db.currentOp()` 查看）

**解决方法**：
```javascript
// 1. 使用 hint 强制使用索引
const plan = await collection('users').find(
  { name: 'Alice' },
  { 
    hint: { name: 1 },
    explain: 'executionStats' 
  }
);

// 2. 对比有无 hint 的性能差异
console.log('使用 hint 是否更快？');
```

### Q5: 聚合管道应该如何优化？

**优化原则**：
1. **$match 前置**：尽早过滤数据，减少后续阶段的处理量
2. **$project 延后**：在需要时才投影字段，避免传递不必要的数据
3. **利用索引**：$match、$sort 等阶段尽量使用索引
4. **避免 $lookup 大集合**：联表查询开销大，考虑数据冗余设计

**示例**：
```javascript
// ❌ 不好
const badPipeline = [
  { $project: { name: 1, status: 1 } },
  { $match: { status: 'active' } }  // 无法使用索引
];

// ✅ 更好
const goodPipeline = [
  { $match: { status: 'active' } },  // 可以使用索引
  { $project: { name: 1, status: 1 } }
];
```


## 参考资料

- [MongoDB Explain 文档](https://docs.mongodb.com/manual/reference/method/cursor.explain/)
- [explain 示例代码](../examples/explain.examples.js)
- [性能优化指南](./performance.md)
- [索引设计最佳实践](./indexing.md)
