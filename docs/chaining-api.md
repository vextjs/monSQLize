# 链式调用方法 (Chaining Methods)

## 概述

monSQLize 现已支持完整的 MongoDB 风格链式调用 API，提供更直观、更灵活的查询构建方式。链式调用方法与 options 参数方式完全兼容，您可以根据需要选择任一方式。

### 🔵 MongoDB 原生 vs monSQLize 扩展

本文档中的所有链式方法都是 **MongoDB 原生支持的游标方法**，monSQLize 提供了完整的封装和实现：

- ✅ **MongoDB 原生支持**: 所有列出的链式方法都对应 MongoDB 游标的原生方法
- 🔄 **monSQLize 封装**: 在原生方法基础上增加了缓存、错误处理、性能监控等功能
- 📚 **参考**: [MongoDB Cursor 官方文档](https://www.mongodb.com/docs/manual/reference/method/js-cursor/)

**monSQLize 独有的扩展参数** (仅在 options 方式中可用):
- `cache` - 缓存 TTL 配置（monSQLize 扩展）
- `stream` - 流式返回（通过 `.stream()` 方法调用）

---

## 支持的链式方法

### find() 链式方法

所有方法均为 **MongoDB 原生支持** ✅

| 方法 | 参数 | MongoDB 原生 | 说明 | 示例 |
|------|------|-------------|------|------|
| **`.limit(n)`** | `number` | ✅ | 限制返回文档数量 | `.limit(10)` |
| **`.skip(n)`** | `number` | ✅ | 跳过文档数量 | `.skip(20)` |
| **`.sort(spec)`** | `Object` | ✅ | 排序规则 | `.sort({ price: -1 })` |
| **`.project(spec)`** | `Object` | ✅ | 字段投影 | `.project({ name: 1, price: 1 })` |
| **`.hint(spec)`** | `Object\|String` | ✅ | 索引提示 | `.hint({ category: 1 })` |
| **`.collation(spec)`** | `Object` | ✅ | 排序规则 | `.collation({ locale: 'zh' })` |
| **`.comment(str)`** | `String` | ✅ | 查询注释 | `.comment('test query')` |
| **`.maxTimeMS(ms)`** | `Number` | ✅ | 超时时间 | `.maxTimeMS(5000)` |
| **`.batchSize(n)`** | `Number` | ✅ | 批处理大小 | `.batchSize(100)` |
| **`.explain(v)`** | `String` | ✅ | 执行计划 | `.explain('executionStats')` |
| **`.stream()`** | - | ✅ | 返回流 | `.stream()` |
| **`.toArray()`** | - | ✅ | 显式执行 | `.toArray()` |

**MongoDB 参考文档**:
- [cursor.limit()](https://www.mongodb.com/docs/manual/reference/method/cursor.limit/)
- [cursor.skip()](https://www.mongodb.com/docs/manual/reference/method/cursor.skip/)
- [cursor.sort()](https://www.mongodb.com/docs/manual/reference/method/cursor.sort/)
- [cursor.project()](https://www.mongodb.com/docs/manual/reference/method/cursor.project/)
- [更多游标方法...](https://www.mongodb.com/docs/manual/reference/method/js-cursor/)

---

### aggregate() 链式方法

所有方法均为 **MongoDB 原生支持** ✅

### aggregate() 链式方法

所有方法均为 **MongoDB 原生支持** ✅

| 方法 | 参数 | MongoDB 原生 | 说明 | 示例 |
|------|------|-------------|------|------|
| **`.hint(spec)`** | `Object\|String` | ✅ | 索引提示 | `.hint({ status: 1 })` |
| **`.collation(spec)`** | `Object` | ✅ | 排序规则 | `.collation({ locale: 'zh' })` |
| **`.comment(str)`** | `String` | ✅ | 查询注释 | `.comment('test')` |
| **`.maxTimeMS(ms)`** | `Number` | ✅ | 超时时间 | `.maxTimeMS(5000)` |
| **`.allowDiskUse(bool)`** | `Boolean` | ✅ | 允许磁盘使用 | `.allowDiskUse(true)` |
| **`.batchSize(n)`** | `Number` | ✅ | 批处理大小 | `.batchSize(100)` |
| **`.explain(v)`** | `String` | ✅ | 执行计划 | `.explain('executionStats')` |
| **`.stream()`** | - | ✅ | 返回流 | `.stream()` |
| **`.toArray()`** | - | ✅ | 显式执行 | `.toArray()` |

**MongoDB 参考文档**:
- [cursor.hint()](https://www.mongodb.com/docs/manual/reference/method/cursor.hint/)
- [cursor.collation()](https://www.mongodb.com/docs/manual/reference/method/cursor.collation/)
- [cursor.allowDiskUse()](https://www.mongodb.com/docs/manual/reference/method/cursor.allowDiskUse/)
- [更多聚合游标方法...](https://www.mongodb.com/docs/manual/reference/method/js-cursor/)

---

## 使用示例

### 基础链式调用

```javascript
const MonSQLize = require("monsqlize");
const { collection } = await new MonSQLize({...}).connect();

// 简单的 limit 和 skip
const results = await collection("products")
    .find({ category: "electronics" })
    .limit(10)
    .skip(5);

console.log(`找到 ${results.length} 个商品`);
```

### 排序查询

```javascript
// 按价格降序排列
const results = await collection("products")
    .find({ inStock: true })
    .sort({ price: -1 })
    .limit(10);

console.log(`最高价: ${results[0].price}`);
```

### 字段投影

```javascript
// 只返回指定字段
const results = await collection("products")
    .find({ category: "books" })
    .project({ name: 1, price: 1, author: 1 })
    .limit(5);

console.log("字段:", Object.keys(results[0])); // ['_id', 'name', 'price', 'author']
```

### 复杂查询组合

```javascript
// 组合多个链式方法
const results = await collection("products")
    .find({ category: "electronics", inStock: true })
    .sort({ rating: -1, sales: -1 })
    .skip(5)
    .limit(10)
    .project({ name: 1, price: 1, rating: 1 })
    .maxTimeMS(5000)
    .comment("复杂查询示例");

console.log(`找到 ${results.length} 个商品`);
```

### 使用索引提示

```javascript
// 强制使用指定索引
const results = await collection("products")
    .find({ category: "electronics", price: { $gte: 500 } })
    .hint({ category: 1, price: -1 })
    .limit(10);

console.log(`使用索引查询，找到 ${results.length} 个商品`);
```

### 查询执行计划

```javascript
// 分析查询性能
const plan = await collection("products")
    .find({ category: "electronics" })
    .sort({ price: -1 })
    .limit(10)
    .explain("executionStats");

console.log("执行统计:");
console.log(`  扫描文档: ${plan.executionStats.totalDocsExamined}`);
console.log(`  返回文档: ${plan.executionStats.nReturned}`);
console.log(`  执行时间: ${plan.executionStats.executionTimeMillis}ms`);
```

### 流式查询

```javascript
// 使用流式处理大量数据
const stream = collection("products")
    .find({ category: "books" })
    .sort({ createdAt: -1 })
    .limit(100)
    .stream();

stream.on("data", (doc) => {
    console.log(`处理文档: ${doc.name}`);
});

stream.on("end", () => {
    console.log("流式读取完成");
});
```

### aggregate 链式调用

```javascript
// 聚合管道链式调用
const results = await collection("orders")
    .aggregate([
        { $match: { status: "paid" } },
        { $group: { _id: "$category", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } }
    ])
    .allowDiskUse(true)
    .maxTimeMS(10000)
    .comment("分类销售统计");

console.log(`找到 ${results.length} 个分类`);
```

### 显式 toArray() 调用

```javascript
// 显式调用 toArray()（可选）
const results = await collection("products")
    .find({ rating: { $gte: 4.5 } })
    .sort({ rating: -1 })
    .limit(5)
    .toArray();  // 显式转换为数组

console.log(`找到 ${results.length} 个高评分商品`);
```

---

## 与 options 参数对比

### 链式调用方式（新）

```javascript
const results = await collection("products")
    .find({ category: "electronics" })
    .sort({ price: -1 })
    .limit(10)
    .project({ name: 1, price: 1 });
```

### options 参数方式（原有，仍然支持）

```javascript
const results = await collection("products").find(
    { category: "electronics" },
    {
        sort: { price: -1 },
        limit: 10,
        projection: { name: 1, price: 1 }
    }
);
```

**两种方式完全等价，结果相同**。

---

## Promise 兼容性

链式调用返回的对象实现了 Promise 接口，可以像 Promise 一样使用：

```javascript
// 使用 .then()
collection("products")
    .find({ category: "books" })
    .limit(5)
    .then(results => {
        console.log(results);
    })
    .catch(err => {
        console.error(err);
    });

// 使用 await
const results = await collection("products")
    .find({ category: "books" })
    .limit(5);

// 使用 .catch()
const results = await collection("products")
    .find({ category: "books" })
    .limit(5)
    .catch(err => {
        console.error("查询失败:", err);
        return [];
    });
```

---

## 参数验证

链式方法会自动验证参数类型和值：

```javascript
// ✅ 正确
.limit(10)
.skip(5)
.sort({ price: -1 })

// ❌ 错误 - 会抛出异常
.limit(-1)        // Error: limit() requires a non-negative number
.skip("5")        // Error: skip() requires a non-negative number
.sort("invalid")  // Error: sort() requires an object or array
```

---

## 执行保护

链式对象只能执行一次，防止意外的重复执行：

```javascript
const chain = collection("products")
    .find({ category: "electronics" })
    .limit(5);

// 第一次执行 ✅
const results1 = await chain.toArray();

// 第二次执行 ❌ 抛出错误
try {
    const results2 = await chain.toArray();
} catch (err) {
    console.error(err.message); // "Query already executed"
}
```

---

## 缓存支持

链式调用完全支持 monSQLize 的缓存机制：

```javascript
// 第一次查询 - 从数据库获取
const results1 = await collection("products")
    .find({ category: "electronics" })
    .limit(10);

// 第二次相同查询 - 从缓存获取（如果启用缓存）
const results2 = await collection("products")
    .find({ category: "electronics" })
    .limit(10);
```

**注意**：链式调用和 options 参数方式使用相同的缓存键生成逻辑。

---

## 向后兼容性

### 完全向后兼容

所有现有的 options 参数方式代码**无需修改**，仍然正常工作：

```javascript
// 旧代码 - 继续工作 ✅
const results = await collection("products").find(
    { category: "electronics" },
    { limit: 10, sort: { price: -1 } }
);

// 新代码 - 链式调用 ✅
const results = await collection("products")
    .find({ category: "electronics" })
    .limit(10)
    .sort({ price: -1 });
```

### 自动检测

monSQLize 会自动检测调用方式：

- **无 options 参数** → 返回链式构建器（支持链式调用）
- **有 options 参数** → 直接执行查询（原有行为）

```javascript
// 情况 1: 无 options → 返回链式构建器
const chain = collection("products").find({ category: "electronics" });
// 类型: FindChain，可以继续链式调用

// 情况 2: 有 options → 直接执行
const results = collection("products").find(
    { category: "electronics" },
    { limit: 10 }
);
// 类型: Promise<Array>，直接返回结果
```

---

## 性能说明

### 缓存键生成

链式调用和 options 参数方式生成**相同的缓存键**，共享缓存：

```javascript
// 方式 1: 链式调用
const results1 = await collection("products")
    .find({ category: "electronics" })
    .limit(10)
    .sort({ price: -1 });

// 方式 2: options 参数
const results2 = await collection("products").find(
    { category: "electronics" },
    { limit: 10, sort: { price: -1 } }
);

// results1 和 results2 使用相同的缓存键
// 如果 results1 已缓存，results2 将直接从缓存获取
```

### 执行效率

链式调用不会影响查询执行效率：

- **构建阶段**：链式方法仅修改内部选项对象，无额外开销
- **执行阶段**：最终调用与 options 参数方式完全相同的底层逻辑
- **缓存命中**：与 options 参数方式享有相同的缓存优化

---

## 最佳实践

### 1. 选择合适的调用方式

**链式调用适用于**：
- 动态构建查询（条件逐步添加）
- 代码可读性优先
- 需要多步骤构建复杂查询

**options 参数适用于**：
- 简单查询（一次性传递所有选项）
- 选项较多时集中管理
- 现有代码维护

### 2. 充分利用 TypeScript 类型提示

```typescript
// TypeScript 会自动推断链式方法的类型
const results = await collection("products")
    .find({ category: "electronics" })
    .limit(10)        // TypeScript 知道 limit 需要 number
    .sort({ price: -1 })  // TypeScript 知道 sort 需要 object
    .project({ name: 1 }); // TypeScript 知道返回类型
```

### 3. 错误处理

```javascript
try {
    const results = await collection("products")
        .find({ category: "electronics" })
        .limit(10)
        .sort({ price: -1 });
} catch (err) {
    if (err.message.includes("already executed")) {
        console.error("查询已执行，请创建新的链式对象");
    } else {
        console.error("查询失败:", err);
    }
}
```

### 4. 避免重复执行

```javascript
// ❌ 错误 - 重复执行
const chain = collection("products").find({}).limit(10);
await chain.toArray();
await chain.toArray(); // Error!

// ✅ 正确 - 每次创建新的链式对象
const results1 = await collection("products").find({}).limit(10);
const results2 = await collection("products").find({}).limit(10);
```

---

## 常见问题 (FAQ)

### Q: 链式调用和 options 参数哪个更好？

**A**: 两者功能完全等价，选择取决于个人偏好和场景：
- **链式调用**：更直观，适合动态构建查询
- **options 参数**：更简洁，适合简单静态查询

### Q: 链式调用会影响缓存吗？

**A**: 不会。链式调用和 options 参数使用相同的缓存键生成逻辑，共享缓存。

### Q: 可以混合使用吗？

**A**: 不推荐。虽然技术上可以（通过传递空 options 然后链式调用），但会导致代码混乱。建议选择一种方式并保持一致。

### Q: 执行顺序重要吗？

**A**: 不重要。链式方法仅修改内部选项对象，最终执行时才会应用所有选项。

```javascript
// 这两种写法完全等价
.limit(10).skip(5)
.skip(5).limit(10)
```

### Q: 如何调试链式查询？

**A**: 使用 `.explain()` 方法查看执行计划：

```javascript
const plan = await collection("products")
    .find({ category: "electronics" })
    .limit(10)
    .explain("executionStats");

console.log("查询计划:", plan);
```

---

## 相关文档

- [find 方法文档](./find.md)
- [aggregate 方法文档](../README.md#aggregate)
- [explain 方法文档](./explain.md)
- [完整 API 参考](../README.md)

---

## 更新日志

| 版本 | 日期 | 更新内容 |
|------|------|---------|
| v1.0.0 | 2025-11-12 | 首次发布链式调用支持 |

---

**反馈与建议**: 如有问题或建议，请提交 [GitHub Issue](https://github.com/your-org/monsqlize/issues)。

