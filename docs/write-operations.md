# 写入操作（Write Operations）

本文档详细介绍 monSQLize 的写入操作 API，包括 `insertOne` 和 `insertMany`。

---

## 概述

monSQLize 提供两种写入方法：

| 方法 | 用途 | 性能 | 适用场景 |
|------|------|------|---------|
| **insertOne** | 插入单个文档 | ~10-20ms/条 | 实时单条写入、交互式操作 |
| **insertMany** | 批量插入文档 | ~0.5-1ms/条 **(10-50x 更快)** | 数据导入、批量创建、初始化数据 |

### 🔵 MongoDB 原生 vs monSQLize 扩展

**方法本身**: MongoDB 原生 ✅
- `insertOne()` 和 `insertMany()` 都是 MongoDB 官方支持的标准方法
- 所有参数（writeConcern、ordered、comment 等）都是 MongoDB 原生支持

**monSQLize 扩展功能**: 🔧
- ✅ **自动缓存失效** - 插入后自动清理相关缓存（monSQLize 独有）
- ✅ **统一错误码** - DUPLICATE_KEY/VALIDATION_ERROR 等统一错误处理
- ✅ **慢查询监控** - 自动记录耗时超过阈值的写入操作
- ✅ **详细日志** - DEBUG/WARN 级别的操作日志

**核心特性**:
- ✅ **自动缓存失效** 🔧 - 插入后自动清理相关缓存（monSQLize 扩展）
- ✅ **写确认级别** ✅ - 支持自定义 writeConcern（MongoDB 原生）
- ✅ **错误处理** 🔧 - 统一错误码（monSQLize 扩展）
- ✅ **日志跟踪** ✅ - 支持 comment 参数用于生产环境监控（MongoDB 原生）
- ✅ **慢查询监控** 🔧 - 自动记录耗时超过阈值的写入操作（monSQLize 扩展）

---

## API 参数说明

### insertOne()

插入单个文档到集合。

#### 方法签名

```typescript
collection(name: string).insertOne(document: object, options?: InsertOneOptions): Promise<InsertOneResult>
```

#### 参数详解

**第一个参数：document**（必需）
- 类型：`object`
- 说明：要插入的文档对象

**第二个参数：options**（可选）

| 参数 | 类型 | 默认值 | 来源 | 说明 |
|------|------|--------|------|------|
| **writeConcern** | `object` | `{ w: 1 }` | MongoDB 原生 ✅ | 写确认级别 |
| **writeConcern.w** | `number \| 'majority'` | `1` | MongoDB 原生 ✅ | 写确认级别（1=主节点确认，'majority'=多数节点确认） |
| **writeConcern.j** | `boolean` | `false` | MongoDB 原生 ✅ | 是否等待日志落盘 |
| **writeConcern.wtimeout** | `number` | - | MongoDB 原生 ✅ | 写超时时间（毫秒） |
| **bypassDocumentValidation** | `boolean` | `false` | MongoDB 原生 ✅ | 跳过文档验证（不推荐） |
| **comment** | `string` | - | MongoDB 原生 ✅ | 查询注释，用于生产环境日志跟踪 |

**图例说明**:
- ✅ **MongoDB 原生**: 该参数是 MongoDB 官方支持的标准功能

**MongoDB 参考文档**: 
- [insertOne()](https://www.mongodb.com/docs/manual/reference/method/db.collection.insertOne/)

#### 返回值

```typescript
{
  acknowledged: boolean,  // 是否被确认（通常为 true）
  insertedId: ObjectId    // 插入的文档 _id
}
```

---

### insertMany()

批量插入多个文档到集合（**10-50x 性能提升**）。

#### 方法签名

```typescript
collection(name: string).insertMany(documents: object[], options?: InsertManyOptions): Promise<InsertManyResult>
```

#### 参数详解

**第一个参数：documents**（必需）
- 类型：`object[]`
- 说明：要插入的文档数组

**第二个参数：options**（可选）

| 参数 | 类型 | 默认值 | 来源 | 说明 |
|------|------|--------|------|------|
| **ordered** | `boolean` | `true` | MongoDB 原生 ✅ | 是否有序插入（true=遇到错误时停止，false=继续插入其他文档） |
| **writeConcern** | `object` | `{ w: 1 }` | MongoDB 原生 ✅ | 写确认级别（同 insertOne） |
| **bypassDocumentValidation** | `boolean` | `false` | MongoDB 原生 ✅ | 跳过文档验证（不推荐） |
| **comment** | `string` | - | MongoDB 原生 ✅ | 查询注释，用于生产环境日志跟踪 |

**图例说明**:
- ✅ **MongoDB 原生**: 该参数是 MongoDB 官方支持的标准功能

**MongoDB 参考文档**: 
- [insertMany()](https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany/)

#### 返回值

```typescript
{
  acknowledged: boolean,           // 是否被确认
  insertedCount: number,           // 成功插入的文档数量
  insertedIds: {                   // 插入的文档 _id 映射表
    0: ObjectId(...),
    1: ObjectId(...),
    2: ObjectId(...)
  }
}
```

---

## 使用示例

### 基本用法

#### 1. 插入单个文档

```javascript
const { collection } = await msq.connect();

const result = await collection('products').insertOne({
  name: 'iPhone 15 Pro',
  price: 999,
  category: 'electronics',
  inStock: true,
  createdAt: new Date()
});

console.log('插入成功:', result.insertedId);
// 输出: 插入成功: 507f1f77bcf86cd799439011
```

#### 2. 批量插入文档

```javascript
const result = await collection('products').insertMany([
  { name: 'MacBook Pro', price: 2499, category: 'electronics' },
  { name: 'iPad Air', price: 599, category: 'electronics' },
  { name: 'AirPods Pro', price: 249, category: 'accessories' }
]);

console.log(`成功插入 ${result.insertedCount} 条数据`);
console.log('插入的 ID:', result.insertedIds);
// 输出: 成功插入 3 条数据
// 输出: 插入的 ID: { 0: ObjectId(...), 1: ObjectId(...), 2: ObjectId(...) }
```

---

### 高级场景

#### 3. 使用 comment 参数（生产环境日志跟踪）

```javascript
// 在生产环境中，使用 comment 标识查询来源，便于日志分析和慢查询追踪
const result = await collection('orders').insertOne(
  {
    userId: 'user_123',
    items: [{ productId: 'prod_456', quantity: 2 }],
    totalAmount: 1998,
    status: 'pending'
  },
  {
    comment: 'OrderAPI:createOrder:user_123'  // 格式: 服务名:方法名:用户ID
  }
);

// MongoDB 日志会包含此 comment，便于追踪和分析
console.log('订单创建成功:', result.insertedId);
```

**comment 最佳实践**:
```javascript
// 推荐格式: "服务名:方法名:唯一标识"
comment: 'ProductAPI:createProduct:admin_456'
comment: 'OrderService:batchImport:session_abc123'
comment: 'DataMigration:seedUsers:v2.0'

// 慢查询日志示例:
// [慢写入] insertOne - orders (45ms) | comment: "OrderAPI:createOrder:user_123"
```

---

#### 4. 使用 writeConcern（关键数据持久化）

```javascript
// 金融交易、订单等关键数据，使用 { w: 'majority', j: true } 确保数据安全
const result = await collection('transactions').insertOne(
  {
    userId: 'user_789',
    amount: 10000,
    type: 'transfer',
    timestamp: new Date()
  },
  {
    writeConcern: {
      w: 'majority',    // 等待多数节点确认
      j: true,          // 等待日志落盘
      wtimeout: 5000    // 5 秒超时
    }
  }
);

console.log('交易记录已安全写入:', result.insertedId);
```

**writeConcern 选择指南**:

| 场景 | w | j | 说明 |
|------|---|---|------|
| **默认场景** | 1 | false | 主节点确认即返回，性能最佳 |
| **关键数据** | 'majority' | true | 多数节点确认且日志落盘，数据最安全 |
| **高性能要求** | 1 | false | 主节点内存确认，最快 |
| **读写分离场景** | 'majority' | false | 保证数据可被从节点读取 |

---

#### 5. ordered vs unordered 模式（insertMany）

##### 5.1 ordered 模式（默认）

遇到错误时**停止**插入，适合需要事务一致性的场景。

```javascript
// ordered: true（默认）- 遇到错误时停止
const result = await collection('products').insertMany(
  [
    { _id: 1, name: 'Product A' },  // ✅ 插入成功
    { _id: 1, name: 'Product B' },  // ❌ 重复键错误，停止
    { _id: 2, name: 'Product C' }   // ⏸️ 不会尝试插入
  ],
  { ordered: true }  // 遇到错误时停止（默认）
);

// 结果: 只有第 1 条成功插入
```

##### 5.2 unordered 模式

遇到错误时**继续**插入其他文档，适合数据导入场景。

```javascript
// ordered: false - 遇到错误时继续插入其他文档
const result = await collection('products').insertMany(
  [
    { _id: 1, name: 'Product A' },  // ✅ 插入成功
    { _id: 1, name: 'Product B' },  // ❌ 重复键错误，但继续
    { _id: 2, name: 'Product C' }   // ✅ 插入成功
  ],
  { ordered: false }  // 继续插入其他文档
);

console.log(`成功插入 ${result.insertedCount} 条`);
// 输出: 成功插入 2 条（第 1 和第 3 条）
```

**模式选择指南**:

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| **数据导入** | unordered | 尽可能多地导入数据，跳过错误 |
| **事务性操作** | ordered | 保证数据一致性，全成功或全失败 |
| **初始化数据** | unordered | 允许部分失败，提高导入成功率 |
| **关键业务** | ordered | 严格控制数据完整性 |

---

#### 6. 错误处理

```javascript
try {
  const result = await collection('products').insertOne({
    _id: 'duplicate_id',
    name: 'Product X'
  });
  console.log('插入成功:', result.insertedId);
} catch (err) {
  if (err.code === 'DUPLICATE_KEY') {
    console.error('错误: 文档 ID 已存在', err.details);
    // 处理重复键错误
  } else if (err.code === 'VALIDATION_ERROR') {
    console.error('错误: 文档验证失败', err.details);
    // 处理验证错误
  } else {
    console.error('未知错误:', err.message);
  }
}
```

**常见错误码**:

| 错误码 | 说明 | 处理建议 |
|--------|------|---------|
| `DUPLICATE_KEY` | 文档 _id 已存在 | 使用不同的 _id 或更新现有文档 |
| `VALIDATION_ERROR` | 文档验证失败 | 检查文档格式和字段 |
| `DATABASE_ERROR` | 数据库操作失败 | 检查连接状态和权限 |
| `INVALID_COLLECTION_NAME` | 集合名称无效 | 使用有效的集合名称 |

---

#### 7. 自动缓存失效

插入操作会**自动清理相关缓存**，无需手动调用 `invalidate()`。

```javascript
// 第 1 步: 查询产品（缓存结果）
const products1 = await collection('products').find(
  { category: 'electronics' },
  { cache: 60000 }  // 缓存 60 秒
);
console.log('首次查询:', products1.length);  // 输出: 10

// 第 2 步: 插入新产品（自动失效缓存）
await collection('products').insertOne({
  name: 'New Product',
  category: 'electronics',
  price: 599
});
console.log('✅ 插入后自动清理缓存');

// 第 3 步: 再次查询（缓存已失效，重新查询数据库）
const products2 = await collection('products').find(
  { category: 'electronics' },
  { cache: 60000 }
);
console.log('插入后查询:', products2.length);  // 输出: 11（新数据）
```

**自动失效的缓存操作**:
- ✅ `find()`
- ✅ `findOne()`
- ✅ `count()`
- ✅ `findPage()`
- ✅ `aggregate()`
- ✅ `distinct()`

---

## 性能优化

### 批量插入性能对比

```javascript
const testData = Array.from({ length: 100 }, (_, i) => ({
  name: `Product ${i + 1}`,
  price: Math.floor(Math.random() * 1000),
  category: 'test'
}));

// ❌ 方式 1: 循环单条插入（慢）
console.time('单条插入');
for (const doc of testData) {
  await collection('products').insertOne(doc);
}
console.timeEnd('单条插入');
// 输出: 单条插入: 1250ms

// ✅ 方式 2: 批量插入（快 10-50 倍）
console.time('批量插入');
await collection('products').insertMany(testData);
console.timeEnd('批量插入');
// 输出: 批量插入: 45ms

// 性能提升: 1250ms ÷ 45ms ≈ 27.8 倍
```

**性能建议**:
- 🚀 **批量插入** - 优先使用 `insertMany()`，性能提升 10-50 倍
- 🚀 **批量大小** - 建议每批 100-1000 条，平衡性能和内存
- 🚀 **unordered 模式** - 数据导入时使用 `ordered: false` 提高成功率
- 🚀 **禁用验证** - 非生产环境可使用 `bypassDocumentValidation: true` 加速

---

## 最佳实践

### 1. 日志跟踪（comment）

```javascript
// ✅ 好的做法: 使用 comment 标识查询来源
await collection('orders').insertOne(
  orderData,
  { comment: 'OrderAPI:createOrder:user_123' }
);

// ❌ 不好的做法: 不使用 comment，难以追踪慢查询
await collection('orders').insertOne(orderData);
```

### 2. 写确认级别（writeConcern）

```javascript
// ✅ 好的做法: 关键数据使用 majority + j: true
await collection('transactions').insertOne(
  transactionData,
  { writeConcern: { w: 'majority', j: true } }
);

// ❌ 不好的做法: 关键数据使用默认设置（可能丢失数据）
await collection('transactions').insertOne(transactionData);
```

### 3. 错误处理

```javascript
// ✅ 好的做法: 捕获并处理特定错误
try {
  await collection('products').insertOne(productData);
} catch (err) {
  if (err.code === 'DUPLICATE_KEY') {
    // 处理重复键
  } else if (err.code === 'VALIDATION_ERROR') {
    // 处理验证错误
  } else {
    throw err;  // 重新抛出未知错误
  }
}

// ❌ 不好的做法: 忽略错误或笼统处理
try {
  await collection('products').insertOne(productData);
} catch (err) {
  console.log('插入失败');  // 信息不足
}
```

### 4. 批量插入

```javascript
// ✅ 好的做法: 使用 insertMany() 批量插入
await collection('products').insertMany([doc1, doc2, doc3, ...]);

// ❌ 不好的做法: 循环单条插入
for (const doc of documents) {
  await collection('products').insertOne(doc);
}
```

### 5. ordered vs unordered

```javascript
// ✅ 数据导入场景: 使用 unordered 提高成功率
await collection('products').insertMany(
  importedData,
  { ordered: false }  // 跳过错误，继续插入
);

// ✅ 事务性操作: 使用 ordered 保证一致性
await collection('orders').insertMany(
  orderItems,
  { ordered: true }  // 遇到错误时停止
);
```

---

## 慢查询监控

插入操作耗时超过阈值时，会触发 `slow-query` 事件：

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 50  // 慢查询阈值 50ms
});

// 监听慢查询
msq.on('slow-query', (meta) => {
  console.warn('[慢写入]', {
    操作: meta.operation,      // 'insertOne' 或 'insertMany'
    集合: meta.collectionName, // 'products'
    耗时: meta.duration,       // 75 (ms)
    注释: meta.comment         // 'ProductAPI:createProduct:user_123'
  });
});

await msq.connect();
```

**输出示例**:
```
[慢写入] {
  操作: 'insertOne',
  集合: 'orders',
  耗时: 75,
  注释: 'OrderAPI:createOrder:user_123'
}
```

---

## 常见问题

### Q: insertMany 和多次 insertOne 有什么区别？

**A**: 性能差异巨大：
- `insertMany`: 单次网络往返，批量写入，~0.5-1ms/条
- `insertOne`（循环调用）: 多次网络往返，~10-20ms/条
- **性能提升**: 10-50 倍

### Q: ordered 和 unordered 应该选哪个？

**A**: 根据场景选择：
- **ordered（默认）**: 事务性操作，需要全成功或全失败
- **unordered**: 数据导入，允许部分失败

### Q: writeConcern 应该如何设置？

**A**: 根据数据重要性选择：
- **默认（w: 1）**: 普通数据，性能优先
- **关键数据（w: 'majority', j: true）**: 金融交易、订单等

### Q: 插入后需要手动清理缓存吗？

**A**: 不需要，`insertOne` 和 `insertMany` 会**自动失效相关缓存**。

### Q: 如何处理重复键错误？

**A**: 捕获 `DUPLICATE_KEY` 错误：
```javascript
try {
  await collection('products').insertOne({ _id: 'dup', name: 'Product' });
} catch (err) {
  if (err.code === 'DUPLICATE_KEY') {
    console.log('文档已存在，跳过插入');
  }
}
```

### Q: 插入大量数据时内存会不会溢出？

**A**: 建议分批插入：
```javascript
const BATCH_SIZE = 1000;
for (let i = 0; i < allData.length; i += BATCH_SIZE) {
  const batch = allData.slice(i, i + BATCH_SIZE);
  await collection('products').insertMany(batch);
}
```

---

## 参考资料

- [examples/insertOne.examples.js](../examples/insertOne.examples.js) - 8 个完整示例
- [examples/insertMany.examples.js](../examples/insertMany.examples.js) - 8 个完整示例（含性能测试）
- [docs/cache.md](./cache.md) - 缓存失效机制
- [docs/events.md](./events.md) - 慢查询监听
- [MongoDB writeConcern 文档](https://www.mongodb.com/docs/manual/reference/write-concern/)
