# 链式API执行原理 (Chain API Implementation Principles)

> **技术深度**: ⭐⭐⭐⭐⭐  
> **版本**: monSQLize v1.0.9+  
> **前置阅读**: [链式调用 API](./chaining-api.md), [缓存机制实现](./cache-implementation.md)

---

## 📚 目录
1. [概述](#概述)
2. [核心架构](#核心架构)
3. [Builder模式实现](#builder模式实现)
4. [状态管理机制](#状态管理机制)
5. [执行流程](#执行流程)
6. [缓存集成](#缓存集成)
7. [错误处理](#错误处理)
8. [源码剖析](#源码剖析)
9. [最佳实践](#最佳实践)

---

## 概述

### 设计理念

monSQLize 的链式API采用 **Builder模式** + **Fluent Interface**，提供了类似 MongoDB 原生驱动的链式调用体验，同时集成了缓存、错误处理、参数验证等高级特性。

### 核心目标

```javascript
// ✅ 目标 1: 流畅的API体验
const users = await collection('users')
  .find({ status: 'active' })
  .sort({ createdAt: -1 })
  .limit(20)
  .project({ name: 1, email: 1 });

// ✅ 目标 2: 类型安全与参数验证
const orders = await collection('orders')
  .aggregate([
    { $match: { total: { $gt: 100 } } },
    { $group: { _id: '$userId', total: { $sum: '$total' } } }
  ])
  .allowDiskUse(true)
  .maxTimeMS(5000);

// ✅ 目标 3: 自动缓存与优化
const products = await collection('products')
  .find({ category: 'electronics' })
  .limit(10)
  .hint({ category: 1, price: -1 }); // 自动利用缓存
```

### 技术特性

| 特性 | 实现方式 | 优势 |
|------|---------|------|
| **Fluent Interface** | 每个方法返回 `this` | 支持链式调用，代码简洁 |
| **一次执行原则** | `_executed` 标志位 | 防止重复执行，避免意外行为 |
| **参数验证** | 每个方法前置校验 | 提前发现错误，友好提示 |
| **Promise集成** | `then/catch/finally` | 可直接 `await` 链式对象 |
| **缓存透明** | 通过 `run()` 执行器 | 自动缓存热点查询 |
| **ObjectId转换** | 自动检测并转换字符串 | 简化代码，避免手动转换 |

---

## 核心架构

### 类图结构

```
┌─────────────────────────────────────────────────┐
│             Chain API 架构层级                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐         ┌──────────────┐    │
│  │  FindChain   │         │AggregateChain│    │
│  │              │         │              │    │
│  │ - _context   │         │ - _context   │    │
│  │ - _query     │         │ - _pipeline  │    │
│  │ - _options   │         │ - _options   │    │
│  │ - _executed  │         │ - _executed  │    │
│  └──────┬───────┘         └──────┬───────┘    │
│         │                        │            │
│         │ 调用                   │            │
│         ▼                        ▼            │
│  ┌────────────────────────────────────┐      │
│  │      run() 执行器（缓存层）          │      │
│  │                                    │      │
│  │  • 缓存查询检测                      │      │
│  │  • Inflight 去重                   │      │
│  │  • 慢查询日志                       │      │
│  │  • 错误统一处理                     │      │
│  └──────────────┬─────────────────────┘      │
│                 │                            │
│                 ▼                            │
│  ┌────────────────────────────────────┐      │
│  │   MongoDB Native Driver            │      │
│  │   collection.find() / aggregate()  │      │
│  └────────────────────────────────────┘      │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 两大核心类

#### 1. FindChain - 查询链

```javascript
class FindChain {
  constructor(context, query, initialOptions) {
    this._context = context;      // { collection, run, defaults }
    this._query = query;           // MongoDB 查询对象
    this._options = initialOptions; // { projection, sort, limit, ... }
    this._executed = false;        // 执行标志位
  }

  // 配置方法（返回 this）
  limit(value) { /* ... */ return this; }
  skip(value) { /* ... */ return this; }
  sort(value) { /* ... */ return this; }
  project(value) { /* ... */ return this; }
  hint(value) { /* ... */ return this; }
  collation(value) { /* ... */ return this; }
  comment(value) { /* ... */ return this; }
  maxTimeMS(value) { /* ... */ return this; }
  batchSize(value) { /* ... */ return this; }

  // 终止方法（执行查询）
  async toArray() { /* 执行查询 */ }
  async explain(verbosity) { /* 返回执行计划 */ }
  stream() { /* 返回流 */ }

  // Promise 集成
  then(resolve, reject) { return this.toArray().then(resolve, reject); }
  catch(reject) { return this.toArray().catch(reject); }
  finally(fn) { return this.toArray().finally(fn); }
}
```

#### 2. AggregateChain - 聚合链

```javascript
class AggregateChain {
  constructor(context, pipeline, initialOptions) {
    this._context = context;
    this._pipeline = pipeline;     // 聚合管道数组
    this._options = initialOptions;
    this._executed = false;
  }

  // 配置方法
  hint(value) { /* ... */ return this; }
  collation(value) { /* ... */ return this; }
  comment(value) { /* ... */ return this; }
  maxTimeMS(value) { /* ... */ return this; }
  allowDiskUse(value) { /* ... */ return this; }
  batchSize(value) { /* ... */ return this; }

  // 终止方法
  async toArray() { /* ... */ }
  async explain(verbosity) { /* ... */ }
  stream() { /* ... */ }

  // Promise 集成
  then(resolve, reject) { return this.toArray().then(resolve, reject); }
  catch(reject) { return this.toArray().catch(reject); }
  finally(fn) { return this.toArray().finally(fn); }
}
```

---

## Builder模式实现

### 方法链原理

```javascript
// 核心：每个配置方法返回 this
class FindChain {
  limit(value) {
    // 1. 验证状态
    if (this._executed) {
      throw new Error('Cannot modify after execution');
    }
    
    // 2. 验证参数
    if (typeof value !== 'number' || value < 0) {
      throw new Error('limit() requires non-negative number');
    }
    
    // 3. 保存配置
    this._options.limit = value;
    
    // 4. 返回自身，支持链式调用
    return this;
  }

  skip(value) {
    if (this._executed) throw new Error('Cannot modify after execution');
    if (typeof value !== 'number' || value < 0) {
      throw new Error('skip() requires non-negative number');
    }
    this._options.skip = value;
    return this; // 返回自身
  }
}

// 使用效果
const chain = new FindChain(context, {}, {});
chain
  .limit(10)   // 返回 chain
  .skip(20)    // 返回 chain
  .sort({ createdAt: -1 }); // 返回 chain
```

### 内部状态积累

```javascript
// 初始状态
const chain = new FindChain(context, { status: 'active' }, {});
console.log(chain._options); // {}

// 第一次调用
chain.limit(10);
console.log(chain._options); // { limit: 10 }

// 第二次调用
chain.skip(20);
console.log(chain._options); // { limit: 10, skip: 20 }

// 第三次调用
chain.sort({ createdAt: -1 });
console.log(chain._options); 
// { limit: 10, skip: 20, sort: { createdAt: -1 } }

// 执行查询
await chain.toArray();
// MongoDB 驱动收到完整的 options: 
// { limit: 10, skip: 20, sort: { createdAt: -1 } }
```

### 方法分类

| 类型 | 方法 | 返回值 | 是否修改状态 |
|-----|------|-------|------------|
| **配置方法** | `limit()`, `skip()`, `sort()`, `project()`, `hint()`, `collation()`, `comment()`, `maxTimeMS()`, `batchSize()` | `this` | ✅ 修改 `_options` |
| **终止方法** | `toArray()`, `explain()`, `stream()` | `Promise` / `Stream` | ✅ 设置 `_executed = true` |
| **Promise方法** | `then()`, `catch()`, `finally()` | `Promise` | 🔄 委托给 `toArray()` |

---

## 状态管理机制

### 执行状态标志

```javascript
class FindChain {
  constructor(context, query, initialOptions) {
    this._executed = false; // 初始状态：未执行
  }

  // 配置方法：检查执行状态
  limit(value) {
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Cannot call .limit() after query execution.',
        'chaining.limit'
      ));
    }
    this._options.limit = value;
    return this;
  }

  // 终止方法：标记为已执行
  async toArray() {
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Query already executed. Create a new chain for another query.\n' +
        'Tip: Each chain can only be executed once:\n' +
        "  const results1 = await collection('products').find({}).limit(10);\n" +
        "  const results2 = await collection('products').find({}).limit(20); // Create new chain",
        'chaining.toArray'
      ));
    }
    
    // 标记为已执行
    this._executed = true;
    
    // 执行查询...
  }
}
```

### 防止重复执行

```javascript
// ❌ 错误示例：尝试重复执行
const chain = collection('users').find({}).limit(10);
const result1 = await chain.toArray(); // ✅ 第一次执行成功
const result2 = await chain.toArray(); // ❌ 抛出错误
// Error: Query already executed. Create a new chain...

// ❌ 错误示例：执行后修改配置
const chain2 = collection('users').find({}).limit(10);
await chain2.toArray(); // 执行查询
chain2.skip(5);         // ❌ 抛出错误
// Error: Cannot call .skip() after query execution.

// ✅ 正确示例：每次查询创建新链
const result1 = await collection('users').find({}).limit(10);
const result2 = await collection('users').find({}).limit(20);
```

### 状态转换图

```
┌──────────────┐
│   创建链      │ _executed = false
└──────┬───────┘
       │
       │ .limit(10)
       │ .skip(5)      ✅ 允许配置
       │ .sort({...})
       ▼
┌──────────────┐
│  配置完成     │ _executed = false
└──────┬───────┘
       │
       │ .toArray()
       ▼
┌──────────────┐
│  设置标志位   │ _executed = true
└──────┬───────┘
       │
       │ 执行查询
       ▼
┌──────────────┐
│  返回结果     │ _executed = true
└──────┬───────┘
       │
       │ .limit(20) ❌ 抛出错误
       │ .toArray() ❌ 抛出错误
       ▼
    (终止状态)
```

---

## 执行流程

### toArray() 完整流程

```javascript
async toArray() {
  // ============ 阶段 1: 状态检查 ============
  if (this._executed) {
    throw new Error(createErrorMessage(
      'Query already executed. Create a new chain for another query.',
      'chaining.toArray'
    ));
  }

  // ============ 阶段 2: 参数标准化 ============
  const { normalizeProjection, normalizeSort } = require('../../common/normalize');
  const { collection, defaults, run } = this._context;

  // 标准化投影（处理数组、对象格式）
  this._options.projection = normalizeProjection(this._options.projection);
  
  // 标准化排序（处理数组、对象格式）
  const sort = normalizeSort(this._options.sort);

  // 应用默认值
  const limit = this._options.limit !== undefined 
    ? this._options.limit 
    : defaults.findLimit; // 例如: 1000

  const skip = this._options.skip;
  const maxTimeMS = this._options.maxTimeMS !== undefined 
    ? this._options.maxTimeMS 
    : defaults.maxTimeMS; // 例如: 30000

  // ============ 阶段 3: 构建驱动选项 ============
  const driverOpts = {
    projection: this._options.projection,
    sort,
    skip,
    maxTimeMS
  };

  // 可选参数（只有设置时才添加）
  if (this._options.hint) driverOpts.hint = this._options.hint;
  if (this._options.collation) driverOpts.collation = this._options.collation;
  if (limit !== undefined) driverOpts.limit = limit;
  if (this._options.batchSize !== undefined) driverOpts.batchSize = this._options.batchSize;
  if (this._options.comment) driverOpts.comment = this._options.comment;

  // ============ 阶段 4: 标记已执行 ============
  this._executed = true;

  // ============ 阶段 5: 通过 run() 执行器 ============
  return run(
    'find',                                    // 操作类型
    { query: this._query, ...this._options }, // 缓存键
    async () => collection.find(this._query, driverOpts).toArray() // 执行函数
  );
}
```

### run() 执行器集成

```javascript
// run() 执行器位于 lib/mongodb/collection.js
async function run(operation, options, execFn) {
  // 1. 生成缓存键
  const cacheKey = generateCacheKey(collectionName, operation, options);
  
  // 2. 检查缓存
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  
  // 3. Inflight 去重
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }
  
  // 4. 执行查询
  const promise = (async () => {
    const startTime = Date.now();
    try {
      const result = await execFn(); // 调用传入的执行函数
      
      // 5. 记录慢查询日志
      const duration = Date.now() - startTime;
      if (duration > slowQueryThreshold) {
        logger.warn(`Slow query detected: ${operation} took ${duration}ms`);
      }
      
      // 6. 缓存结果
      cache.set(cacheKey, result);
      return result;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();
  
  inflightRequests.set(cacheKey, promise);
  return promise;
}
```

### Promise集成原理

```javascript
class FindChain {
  // ============ Promise/A+ 规范方法 ============
  
  /**
   * 使 FindChain 可以直接 await
   * @example
   *   const users = await collection('users').find({}).limit(10);
   *   // 等价于:
   *   const chain = collection('users').find({}).limit(10);
   *   const users = await chain.then(r => r);
   */
  then(resolve, reject) {
    return this.toArray().then(resolve, reject);
  }

  /**
   * 错误处理
   * @example
   *   await collection('users').find({}).catch(err => {
   *     console.error('Query failed:', err);
   *   });
   */
  catch(reject) {
    return this.toArray().catch(reject);
  }

  /**
   * 清理操作
   * @example
   *   await collection('users').find({}).finally(() => {
   *     console.log('Query completed');
   *   });
   */
  finally(fn) {
    return this.toArray().finally(fn);
  }
}

// ============ 使用示例 ============

// 方式 1: 直接 await（最常用）
const users = await collection('users').find({}).limit(10);

// 方式 2: 使用 .then()
collection('users').find({}).limit(10).then(users => {
  console.log(users);
});

// 方式 3: 使用 .catch()
const users = await collection('users').find({}).limit(10).catch(err => {
  console.error('Error:', err);
  return []; // 默认值
});

// 方式 4: 使用 .finally()
const users = await collection('users').find({}).limit(10).finally(() => {
  console.log('Query completed');
});
```

---

## 缓存集成

### 缓存键生成

```javascript
// 缓存键基于操作类型 + 查询参数
function generateCacheKey(collectionName, operation, options) {
  const parts = [collectionName, operation];
  
  if (options.query) {
    parts.push(JSON.stringify(options.query));
  }
  
  if (options.projection) {
    parts.push(JSON.stringify(options.projection));
  }
  
  if (options.sort) {
    parts.push(JSON.stringify(options.sort));
  }
  
  if (options.limit !== undefined) {
    parts.push(`limit:${options.limit}`);
  }
  
  if (options.skip !== undefined) {
    parts.push(`skip:${options.skip}`);
  }
  
  return parts.join('|');
}

// 示例
const key1 = generateCacheKey('users', 'find', {
  query: { status: 'active' },
  limit: 10,
  sort: { createdAt: -1 }
});
// => "users|find|{\"status\":\"active\"}|{\"createdAt\":-1}|limit:10"

const key2 = generateCacheKey('users', 'find', {
  query: { status: 'active' },
  limit: 20, // 不同的 limit
  sort: { createdAt: -1 }
});
// => "users|find|{\"status\":\"active\"}|{\"createdAt\":-1}|limit:20"
// ✅ 不同的缓存键，独立缓存
```

### 缓存命中场景

```javascript
// ============ 场景 1: 完全相同的查询 ============
const users1 = await collection('users')
  .find({ status: 'active' })
  .limit(10)
  .sort({ createdAt: -1 });
// => 缓存 MISS，执行查询

const users2 = await collection('users')
  .find({ status: 'active' })
  .limit(10)
  .sort({ createdAt: -1 });
// => 缓存 HIT，直接返回结果 ✅

// ============ 场景 2: 不同的查询参数 ============
const users3 = await collection('users')
  .find({ status: 'active' })
  .limit(20) // 不同的 limit
  .sort({ createdAt: -1 });
// => 缓存 MISS，执行新查询

// ============ 场景 3: 方法调用顺序无关 ============
const chain1 = collection('users').find({}).limit(10).skip(5);
const chain2 = collection('users').find({}).skip(5).limit(10);
// ✅ 两者生成相同的缓存键（内部标准化顺序）
```

### Inflight 去重

```javascript
// 防止并发相同查询
const promise1 = collection('users').find({}).limit(10); // 执行查询
const promise2 = collection('users').find({}).limit(10); // 复用 promise1
const promise3 = collection('users').find({}).limit(10); // 复用 promise1

const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
// ✅ 只执行一次数据库查询，三个请求共享结果

// 时间线：
// T0: promise1 开始执行查询
// T0: promise2 发现 inflight 请求，复用 promise1
// T0: promise3 发现 inflight 请求，复用 promise1
// T1: 查询完成，三个 promise 同时 resolve
```

---

## 错误处理

### 统一错误信息格式

```javascript
/**
 * 创建格式化的错误消息
 * @param {string} message - 错误描述
 * @param {string} code - 错误代码
 * @returns {string} 格式化的错误消息
 */
function createErrorMessage(message, code) {
  return `[monSQLize:${code}] ${message}`;
}

// 使用示例
throw new Error(createErrorMessage(
  'Cannot call .limit() after query execution.',
  'chaining.limit'
));
// => [monSQLize:chaining.limit] Cannot call .limit() after query execution.
```

### 参数验证错误

```javascript
limit(value) {
  if (typeof value !== 'number' || value < 0) {
    throw new Error(createErrorMessage(
      `limit() requires a non-negative number, got: ${typeof value} (${value})\n` +
      'Usage: .limit(10)',
      'chaining.limit'
    ));
  }
  this._options.limit = value;
  return this;
}

// ❌ 错误调用
chain.limit('10');
// Error: [monSQLize:chaining.limit] limit() requires a non-negative number, got: string (10)
// Usage: .limit(10)

chain.limit(-5);
// Error: [monSQLize:chaining.limit] limit() requires a non-negative number, got: number (-5)
// Usage: .limit(10)
```

### 状态错误

```javascript
// ❌ 执行后修改
const chain = collection('users').find({}).limit(10);
await chain.toArray();
chain.skip(5);
// Error: [monSQLize:chaining.skip] Cannot call .skip() after query execution.

// ❌ 重复执行
const chain2 = collection('users').find({}).limit(10);
await chain2.toArray();
await chain2.toArray();
// Error: [monSQLize:chaining.toArray] Query already executed. Create a new chain for another query.
// Tip: Each chain can only be executed once:
//   const results1 = await collection('products').find({}).limit(10);
//   const results2 = await collection('products').find({}).limit(20); // Create new chain
```

---

## 源码剖析

### FindChain 关键源码

```javascript
class FindChain {
  /**
   * 设置查询限制数量
   * @param {number} value - 限制数量
   * @returns {FindChain} 返回自身以支持链式调用
   */
  limit(value) {
    // 1️⃣ 状态检查：防止执行后修改
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Cannot call .limit() after query execution.',
        'chaining.limit'
      ));
    }
    
    // 2️⃣ 参数验证：类型 + 范围检查
    if (typeof value !== 'number' || value < 0) {
      throw new Error(createErrorMessage(
        `limit() requires a non-negative number, got: ${typeof value} (${value})\n` +
        'Usage: .limit(10)',
        'chaining.limit'
      ));
    }
    
    // 3️⃣ 保存配置到内部状态
    this._options.limit = value;
    
    // 4️⃣ 返回自身，支持链式调用
    return this;
  }

  /**
   * 设置字段投影
   * @param {Object} value - 投影配置
   * @returns {FindChain} 返回自身以支持链式调用
   */
  project(value) {
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Cannot call .project() after query execution.',
        'chaining.project'
      ));
    }
    
    // ⚠️ 注意：不验证投影格式，交给 normalizeProjection() 处理
    if (!value) {
      throw new Error(createErrorMessage(
        'project() requires a projection object\n' +
        'Usage: .project({ name: 1, email: 1 })',
        'chaining.project'
      ));
    }
    
    this._options.projection = value;
    return this;
  }

  /**
   * 执行查询并返回结果数组
   * @returns {Promise<Array>} 查询结果数组
   */
  async toArray() {
    // 1️⃣ 防止重复执行
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Query already executed. Create a new chain for another query.\n' +
        'Tip: Each chain can only be executed once:\n' +
        "  const results1 = await collection('products').find({}).limit(10);\n" +
        "  const results2 = await collection('products').find({}).limit(20); // Create new chain",
        'chaining.toArray'
      ));
    }

    // 2️⃣ 导入标准化工具
    const { normalizeProjection, normalizeSort } = require('../../common/normalize');
    const { collection, defaults, run } = this._context;

    // 3️⃣ 标准化参数
    this._options.projection = normalizeProjection(this._options.projection);
    const sort = normalizeSort(this._options.sort);
    const limit = this._options.limit !== undefined ? this._options.limit : defaults.findLimit;
    const skip = this._options.skip;
    const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;

    // 4️⃣ 构建驱动选项
    const driverOpts = { projection: this._options.projection, sort, skip, maxTimeMS };
    if (this._options.hint) driverOpts.hint = this._options.hint;
    if (this._options.collation) driverOpts.collation = this._options.collation;
    if (limit !== undefined) driverOpts.limit = limit;
    if (this._options.batchSize !== undefined) driverOpts.batchSize = this._options.batchSize;
    if (this._options.comment) driverOpts.comment = this._options.comment;

    // 5️⃣ 标记为已执行
    this._executed = true;

    // 6️⃣ 通过 run() 执行器（支持缓存）
    return run(
      'find',
      { query: this._query, ...this._options },
      async () => collection.find(this._query, driverOpts).toArray()
    );
  }
}
```

### AggregateChain 关键源码

```javascript
class AggregateChain {
  /**
   * 设置是否允许使用磁盘
   * @param {boolean} value - 是否允许
   * @returns {AggregateChain} 返回自身以支持链式调用
   */
  allowDiskUse(value) {
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Cannot call .allowDiskUse() after query execution.',
        'chaining.allowDiskUse'
      ));
    }
    
    // 布尔类型验证
    if (typeof value !== 'boolean') {
      throw new Error(createErrorMessage(
        `allowDiskUse() requires a boolean, got: ${typeof value}\n` +
        'Usage: .allowDiskUse(true)',
        'chaining.allowDiskUse'
      ));
    }
    
    this._options.allowDiskUse = value;
    return this;
  }

  /**
   * 执行聚合并返回结果数组
   * @returns {Promise<Array>} 聚合结果数组
   */
  async toArray() {
    if (this._executed) {
      throw new Error(createErrorMessage(
        'Query already executed. Create a new chain for another query.\n' +
        'Tip: Each chain can only be executed once:\n' +
        "  const results1 = await collection('orders').aggregate([...]).allowDiskUse(true);\n" +
        "  const results2 = await collection('orders').aggregate([...]).maxTimeMS(5000); // Create new chain",
        'chaining.toArray'
      ));
    }

    const { collection, defaults, run } = this._context;

    const maxTimeMS = this._options.maxTimeMS !== undefined ? this._options.maxTimeMS : defaults.maxTimeMS;
    const allowDiskUse = this._options.allowDiskUse !== undefined ? this._options.allowDiskUse : false;

    const aggOptions = { maxTimeMS, allowDiskUse };
    if (this._options.collation) aggOptions.collation = this._options.collation;
    if (this._options.hint) aggOptions.hint = this._options.hint;
    if (this._options.comment) aggOptions.comment = this._options.comment;
    if (this._options.batchSize !== undefined) aggOptions.batchSize = this._options.batchSize;

    this._executed = true;

    // 聚合查询同样支持缓存
    return run(
      'aggregate',
      this._options,
      async () => collection.aggregate(this._pipeline, aggOptions).toArray()
    );
  }
}
```

---

## 最佳实践

### ✅ 推荐用法

```javascript
// 1. 每次查询创建新链
const activeUsers = await collection('users')
  .find({ status: 'active' })
  .limit(10)
  .sort({ createdAt: -1 });

const inactiveUsers = await collection('users')
  .find({ status: 'inactive' })
  .limit(20)
  .sort({ lastLoginAt: -1 });

// 2. 利用 Promise 特性
const users = await collection('users')
  .find({ status: 'active' })
  .limit(10)
  .catch(err => {
    logger.error('Query failed:', err);
    return []; // 默认值
  });

// 3. 合理使用 hint 优化查询
const orders = await collection('orders')
  .find({ userId: '507f1f77bcf86cd799439011', status: 'completed' })
  .hint({ userId: 1, status: 1 }) // 使用复合索引
  .limit(50);

// 4. 设置查询超时
const heavyQuery = await collection('analytics')
  .aggregate([
    { $match: { year: 2024 } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
  ])
  .allowDiskUse(true)
  .maxTimeMS(10000); // 10秒超时

// 5. 添加查询注释（便于日志分析）
const products = await collection('products')
  .find({ category: 'electronics' })
  .comment('ProductAPI:listElectronics')
  .limit(20);
```

### ❌ 反模式

```javascript
// ❌ 反模式 1: 重用链对象
const chain = collection('users').find({}).limit(10);
const result1 = await chain.toArray();
const result2 = await chain.toArray(); // 错误！

// ✅ 正确：每次创建新链
const result1 = await collection('users').find({}).limit(10);
const result2 = await collection('users').find({}).limit(10);

// ❌ 反模式 2: 执行后修改配置
const chain = collection('users').find({}).limit(10);
await chain.toArray();
chain.skip(5); // 错误！

// ✅ 正确：修改配置后再执行
const chain = collection('users').find({}).limit(10).skip(5);
await chain.toArray();

// ❌ 反模式 3: 不必要的复杂链
const users = await collection('users')
  .find({})
  .limit(10)
  .skip(0) // 不必要，默认就是 0
  .maxTimeMS(30000); // 不必要，默认已设置

// ✅ 正确：只设置非默认值
const users = await collection('users')
  .find({})
  .limit(10);

// ❌ 反模式 4: 过度依赖缓存
for (let i = 0; i < 1000; i++) {
  // 每次循环都会缓存一个不同的结果
  const users = await collection('users').find({}).skip(i).limit(1);
}

// ✅ 正确：一次性获取所有数据
const allUsers = await collection('users').find({}).limit(1000);
for (let i = 0; i < allUsers.length; i++) {
  // 处理数据
}
```

### 性能优化建议

```javascript
// 1️⃣ 合理使用 limit（减少网络传输）
const users = await collection('users')
  .find({ status: 'active' })
  .limit(100); // ✅ 限制结果数量

// 2️⃣ 使用 projection 减少字段（减少内存占用）
const users = await collection('users')
  .find({ status: 'active' })
  .project({ name: 1, email: 1 }) // ✅ 只返回需要的字段
  .limit(100);

// 3️⃣ 使用 hint 强制索引（避免全表扫描）
const orders = await collection('orders')
  .find({ userId: '507f1f77bcf86cd799439011', status: 'completed' })
  .hint({ userId: 1, status: 1 }) // ✅ 使用复合索引
  .limit(50);

// 4️⃣ 聚合查询启用磁盘（处理大数据集）
const analytics = await collection('orders')
  .aggregate([
    { $match: { year: 2024 } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } },
    { $sort: { total: -1 } }
  ])
  .allowDiskUse(true) // ✅ 允许使用磁盘（避免内存溢出）
  .maxTimeMS(30000);

// 5️⃣ 使用 batchSize 控制游标批次大小
const largeDataset = await collection('logs')
  .find({ level: 'error' })
  .batchSize(1000) // ✅ 每批次 1000 条
  .limit(10000);
```

---

## 相关文档

- **[链式调用 API 文档](./chaining-api.md)** - 用户使用指南
- **[缓存机制实现原理](./cache-implementation.md)** - 缓存层详解
- **[慢查询日志配置](./slow-query-log.md)** - 慢查询监控
- **[ObjectId自动转换](./objectid-auto-convert.md)** - ObjectId 处理
- **[错误代码参考](./error-codes.md)** - 错误码大全

---

## 总结

### 设计亮点

| 特性 | 实现 | 优势 |
|------|------|------|
| **Builder模式** | 每个方法返回 `this` | 代码简洁，易于阅读 |
| **一次执行** | `_executed` 标志位 | 防止状态污染 |
| **参数验证** | 前置类型检查 | 提前发现错误 |
| **Promise集成** | `then/catch/finally` | 直接 `await` |
| **缓存透明** | `run()` 执行器 | 自动优化性能 |
| **错误友好** | `createErrorMessage()` | 清晰的错误提示 |

### 核心原则

1. **不可变性**：链对象一旦执行，状态不可再变
2. **可预测性**：相同的链式调用产生相同的查询
3. **易用性**：API 设计接近 MongoDB 原生驱动
4. **安全性**：全面的参数验证和错误提示
5. **高性能**：自动缓存和 Inflight 去重

---

**文档版本**: v1.0  
**最后更新**: 2024-01  
**维护者**: monSQLize Team
