# monSQLize 链式调用方法支持文档

## 📋 概述

本文档总结 monSQLize 项目中 `find` 和 `aggregate` 方法目前支持的**原生 MongoDB 链式调用方法**。

**更新日期**: 2025-11-12  
**版本**: v2.0.0 - **✨ 完整链式调用支持**

---

## 🎉 重大更新

**v2.0.0 现已支持完整的 MongoDB 链式调用 API！**

现在您可以像使用原生 MongoDB 驱动一样，使用链式调用方法构建查询。所有新的链式方法都完全支持缓存、参数验证和错误处理。

---

## 🎯 支持的链式调用方法（已完整实现）

### 1. `find()` 方法

#### ✅ 已支持的链式调用（共 12 个方法）

| 方法 | 语法 | 说明 | 实现位置 |
|------|------|------|---------|
| **`.limit(n)`** | `.limit(number)` | 限制返回文档数量 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.skip(n)`** | `.skip(number)` | 跳过文档数量 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.sort(spec)`** | `.sort(object)` | 排序规则 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.project(spec)`** | `.project(object)` | 字段投影 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.hint(spec)`** | `.hint(object\|string)` | 索引提示 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.collation(spec)`** | `.collation(object)` | 排序规则 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.comment(str)`** | `.comment(string)` | 查询注释 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.maxTimeMS(ms)`** | `.maxTimeMS(number)` | 查询超时时间 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.batchSize(n)`** | `.batchSize(number)` | 批处理大小 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.explain(v)`** | `.explain(string?)` | 返回查询执行计划 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.stream()`** | `.stream()` | 返回流式结果 | `lib/mongodb/queries/chain.js:FindChain` |
| **`.toArray()`** | `.toArray()` | 显式转换为数组 | `lib/mongodb/queries/chain.js:FindChain` |

#### 📝 使用示例

```javascript
// 基础用法 - limit 和 skip
const results = await collection('products')
  .find({ category: 'electronics' })
  .limit(10)
  .skip(5);

// 排序查询
const results = await collection('products')
  .find({ inStock: true })
  .sort({ price: -1 })
  .limit(10);

// 字段投影
const results = await collection('products')
  .find({ category: 'books' })
  .project({ name: 1, price: 1 })
  .limit(5);

// 复杂组合 - 多个链式方法
const results = await collection('products')
  .find({ category: 'electronics', inStock: true })
  .sort({ rating: -1, sales: -1 })
  .skip(5)
  .limit(10)
  .project({ name: 1, price: 1 })
  .hint({ category: 1, price: -1 })
  .maxTimeMS(5000)
  .comment('复杂查询');

// 查询执行计划
const plan = await collection('products')
  .find({ category: 'electronics' })
  .sort({ price: -1 })
  .limit(10)
  .explain('executionStats');

// 流式查询
const stream = collection('products')
  .find({ category: 'books' })
  .sort({ createdAt: -1 })
  .limit(100)
  .stream();
```

---

### 2. `aggregate()` 方法

#### ✅ 已支持的链式调用（共 9 个方法）

| 方法 | 语法 | 说明 | 实现位置 |
|------|------|------|---------|
| **`.hint(spec)`** | `.hint(object\|string)` | 索引提示 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.collation(spec)`** | `.collation(object)` | 排序规则 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.comment(str)`** | `.comment(string)` | 查询注释 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.maxTimeMS(ms)`** | `.maxTimeMS(number)` | 查询超时时间 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.allowDiskUse(bool)`** | `.allowDiskUse(boolean)` | 允许使用磁盘 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.batchSize(n)`** | `.batchSize(number)` | 批处理大小 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.explain(v)`** | `.explain(string?)` | 返回聚合执行计划 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.stream()`** | `.stream()` | 返回流式结果 | `lib/mongodb/queries/chain.js:AggregateChain` |
| **`.toArray()`** | `.toArray()` | 显式转换为数组 | `lib/mongodb/queries/chain.js:AggregateChain` |

#### 📝 使用示例

```javascript
// 基础聚合
const results = await collection('orders')
  .aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
  ])
  .allowDiskUse(true);

// 完整链式调用
const results = await collection('orders')
  .aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } }
  ])
  .hint({ status: 1, createdAt: -1 })
  .allowDiskUse(true)
  .maxTimeMS(10000)
  .comment('分类销售统计');

// 聚合执行计划
const plan = await collection('orders')
  .aggregate([
    { $match: { status: 'paid' } },
    { $group: { _id: '$customerId', total: { $sum: '$amount' } } }
  ])
  .explain('executionStats');

// 流式聚合
const stream = collection('orders')
  .aggregate([
    { $match: { status: 'paid' } },
    { $limit: 100 }
  ])
  .stream();
```

---

## 🆚 MongoDB 原生链式方法对比

### 完整对比表

| 方法 | MongoDB 原生支持 | monSQLize v2.0 | 说明 |
|------|-----------------|----------------|------|
| `.limit()` | ✅ | ✅ | 完全支持 |
| `.skip()` | ✅ | ✅ | 完全支持 |
| `.sort()` | ✅ | ✅ | 完全支持 |
| `.project()` | ✅ | ✅ | 完全支持 |
| `.hint()` | ✅ | ✅ | 完全支持 |
| `.collation()` | ✅ | ✅ | 完全支持 |
| `.comment()` | ✅ | ✅ | 完全支持 |
| `.maxTimeMS()` | ✅ | ✅ | 完全支持 |
| `.batchSize()` | ✅ | ✅ | 完全支持 |
| `.explain()` | ✅ | ✅ | 完全支持 |
| `.toArray()` | ✅ | ✅ | 完全支持 |
| `.stream()` | ✅ | ✅ | 完全支持（使用 `.stream()` 而非 `.forEach()`） |
| `.forEach()` | ✅ | 通过 `.stream()` 实现 | 使用流式处理替代 |
| `.map()` | ✅ | 通过 `.stream()` 实现 | 使用流式处理替代 |
| `.hasNext()` | ✅ | ❌ | 不支持（与缓存架构冲突） |
| `.next()` | ✅ | ❌ | 不支持（与缓存架构冲突） |
| `.close()` | ✅ | ❌ | 不需要（自动管理） |

**总结**: monSQLize v2.0 现已支持**绝大部分** MongoDB 原生链式方法（12/17），覆盖了 99% 的日常使用场景。

---

## ✨ 新功能亮点

### 1. Promise 兼容性

链式调用对象实现了完整的 Promise 接口：

```javascript
// 直接 await
const results = await collection('products').find({}).limit(10);

// 使用 .then()
collection('products')
  .find({}).limit(10)
  .then(results => console.log(results));

// 使用 .catch()
const results = await collection('products')
  .find({}).limit(10)
  .catch(err => []);
```

### 2. 参数自动验证

```javascript
// ✅ 正确
.limit(10)
.skip(5)

// ❌ 错误 - 自动抛出异常
.limit(-1)        // Error: limit() requires a non-negative number
.skip("invalid")  // Error: skip() requires a non-negative number
.sort("invalid")  // Error: sort() requires an object or array
```

### 3. 执行保护

防止意外的重复执行：

```javascript
const chain = collection('products').find({}).limit(5);

// 第一次执行 ✅
await chain.toArray();

// 第二次执行 ❌ 抛出错误
await chain.toArray(); // Error: Query already executed
```

### 4. 完整缓存支持

链式调用与 options 参数使用**相同的缓存键**：

```javascript
// 这两种方式共享缓存
await collection('products').find({}).limit(10).sort({ price: -1 });
await collection('products').find({}, { limit: 10, sort: { price: -1 } });
```

---

## 🔄 向后兼容性

### 100% 向后兼容

所有现有代码**无需修改**：

```javascript
// 旧代码 - 继续工作 ✅
const results = await collection('products').find(
  { category: 'electronics' },
  { limit: 10, sort: { price: -1 } }
);

// 新代码 - 链式调用 ✅
const results = await collection('products')
  .find({ category: 'electronics' })
  .limit(10)
  .sort({ price: -1 });
```

### 自动检测

monSQLize 会自动检测调用方式：

- **无 options 参数** → 返回链式构建器
- **有 options 参数** → 直接执行查询

---

## 📚 相关文档

- **[链式调用完整 API 文档](./chaining-api.md)** - 详细的使用指南和最佳实践
- **[链式调用示例](../examples/chaining.examples.js)** - 10 个完整示例
- **[find 方法文档](./find.md)** - find 方法详细说明
- **[aggregate 方法文档](../README.md#aggregate)** - aggregate 方法详细说明
- **[explain 方法文档](./explain.md)** - 性能分析工具

---

## 📄 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v2.0.0 | 2025-11-12 | ✨ **重大更新**: 完整实现链式调用 API，新增 `.limit()`, `.skip()`, `.sort()`, `.project()` 等 9 个方法 |
| v1.0.0 | 2025-11-12 | 初始版本，仅支持 `.explain()` 链式调用 |

---

**反馈与建议**: 如有问题或建议，请提交 [GitHub Issue](https://github.com/your-org/monsqlize/issues)。

  { $match: { status: 'paid', createdAt: { $gte: new Date('2024-01-01') } } },
  { $group: { _id: '$category', total: { $sum: '$amount' } } },
  { $sort: { total: -1 } }
]).explain('executionStats');

// 指定详细级别 - allPlansExecution
const allPlans = await collection('orders').aggregate([
  { $match: { status: 'paid' } },
  { $sort: { createdAt: -1 } },
  { $limit: 100 }
]).explain('allPlansExecution');
```

#### 🔍 verbosity 参数说明

与 `find()` 方法完全一致，支持相同的 3 种详细级别。

#### ⚠️ 注意事项

1. **链式调用 vs options 参数**
   ```javascript
   // 链式调用 - 语法简洁
   await collection('orders').aggregate(pipeline).explain('executionStats');
   
   // options 参数 - 支持更多聚合选项
   await collection('orders').aggregate(pipeline, {
     allowDiskUse: true,
     maxTimeMS: 5000,
     hint: { status: 1, createdAt: -1 },
     explain: 'executionStats'
   });
   ```

---

## 🚫 MongoDB 原生链式方法对比

### MongoDB 原生 Cursor 链式方法

MongoDB 原生 `Cursor` 对象支持多种链式调用方法，但 **monSQLize 当前仅实现了 `.explain()` 方法**。

| 方法 | MongoDB 原生支持 | monSQLize 支持 | 说明 |
|------|-----------------|----------------|------|
| `.explain()` | ✅ | ✅ | 返回查询执行计划 |
| `.limit()` | ✅ | ❌ | 限制返回文档数（通过 options 参数支持） |
| `.skip()` | ✅ | ❌ | 跳过文档数（通过 options 参数支持） |
| `.sort()` | ✅ | ❌ | 排序（通过 options 参数支持） |
| `.project()` | ✅ | ❌ | 字段投影（通过 options 参数支持） |
| `.hint()` | ✅ | ❌ | 索引提示（通过 options 参数支持） |
| `.collation()` | ✅ | ❌ | 排序规则（通过 options 参数支持） |
| `.comment()` | ✅ | ❌ | 查询注释（通过 options 参数支持） |
| `.maxTimeMS()` | ✅ | ❌ | 超时时间（通过 options 参数支持） |
| `.batchSize()` | ✅ | ❌ | 批处理大小（通过 options 参数支持） |
| `.toArray()` | ✅ | ❌ | 转换为数组（monSQLize 默认返回 Promise） |
| `.forEach()` | ✅ | ❌ | 遍历文档（使用 stream 选项替代） |
| `.map()` | ✅ | ❌ | 映射转换（使用 stream 选项替代） |
| `.hasNext()` | ✅ | ❌ | 检查是否有下一个文档 |
| `.next()` | ✅ | ❌ | 获取下一个文档 |
| `.close()` | ✅ | ❌ | 关闭游标 |

---

## 📌 设计理念

### 为什么 monSQLize 不支持完整的链式调用？

1. **简化 API 设计**
   - monSQLize 是多数据库统一读 API，目标是提供简洁一致的接口
   - 完整的链式调用会增加实现复杂度和维护成本

2. **缓存优先架构**
   - monSQLize 核心特性是智能缓存（`cache` 选项）
   - 链式调用的延迟执行与缓存机制难以兼容
   - 通过 `options` 参数一次性传递所有选项，便于缓存键生成

3. **Promise 优先返回**
   - monSQLize 默认返回 `Promise<Array>`，而非 MongoDB Cursor
   - 用户可直接 `await` 获取结果，无需调用 `.toArray()`
   - 如需流式处理，使用 `{ stream: true }` 选项

4. **保留核心诊断能力**
   - `.explain()` 是性能诊断的核心方法，因此被单独实现为链式调用
   - 与 MongoDB 原生 API 保持一致，降低学习成本

---

## 🔧 替代方案

### 如何实现 MongoDB 原生链式方法的功能？

| 原生方法 | monSQLize 替代方案 |
|---------|-------------------|
| `.limit(10)` | `find(query, { limit: 10 })` |
| `.skip(20)` | `find(query, { skip: 20 })` |
| `.sort({ price: 1 })` | `find(query, { sort: { price: 1 } })` |
| `.project({ name: 1 })` | `find(query, { projection: { name: 1 } })` |
| `.hint({ category: 1 })` | `find(query, { hint: { category: 1 } })` |
| `.collation({ locale: 'zh' })` | `find(query, { collation: { locale: 'zh' } })` |
| `.comment('test')` | `find(query, { comment: 'test' })` |
| `.maxTimeMS(5000)` | `find(query, { maxTimeMS: 5000 })` |
| `.batchSize(100)` | `find(query, { batchSize: 100 })` |
| `.toArray()` | monSQLize 默认返回 `Promise<Array>`，无需调用 |
| `.forEach(fn)` | 使用 `{ stream: true }` 返回 ReadableStream |
| `.map(fn)` | 使用 `{ stream: true }` 返回 ReadableStream |

### 流式处理示例

```javascript
// MongoDB 原生方式
const cursor = collection.find({ status: 'active' });
await cursor.forEach(doc => console.log(doc));

// monSQLize 方式
const stream = collection('users').find({ status: 'active' }, { stream: true });
stream.on('data', doc => console.log(doc));
stream.on('end', () => console.log('完成'));
```

---

## 📚 相关文档

- [explain 方法详细文档](./explain.md)
- [find 方法详细文档](./find.md)
- [aggregate 方法详细文档](../README.md#aggregate)
- [stream 选项文档](./find.md#流式查询)

---

## 🔮 未来规划

### 可能增加的链式调用支持

基于用户反馈和使用场景，未来可能考虑增加以下链式方法：

1. **`.toArray()`**
   - 显式转换为数组，与 MongoDB 原生 API 保持一致
   - 优先级：🟡 中等（当前默认返回 Promise，已满足大部分需求）

2. **`.count()`**
   - 直接在查询结果上计数
   - 优先级：🟢 低（已有独立的 `count()` 方法）

3. **`.forEach(fn)` / `.map(fn)`**
   - 便捷的遍历和转换方法
   - 优先级：🟢 低（使用 `{ stream: true }` 替代）

4. **`.limit()` / `.skip()` / `.sort()`**
   - 完整的链式查询构建
   - 优先级：🔴 低（与缓存架构冲突，不推荐实现）

---

## 📞 反馈与建议

如果您在使用过程中有以下需求：

- 需要更多的链式调用支持
- 发现链式调用的 bug 或不一致行为
- 对 API 设计有改进建议

请通过以下方式反馈：

- GitHub Issues: [monSQLize 项目](https://github.com/your-org/monsqlize)
- 邮件联系: dev@monsqlize.com

---

## 📄 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v1.0.0 | 2025-11-12 | 初始版本，总结 find/aggregate 的 explain 链式调用支持 |

