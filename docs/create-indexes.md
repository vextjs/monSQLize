# createIndexes() - 批量创建索引

一次性创建多个索引，提高部署效率。

---

## 概述

`createIndexes()` 方法用于批量创建多个索引。相比多次调用 `createIndex()`，批量创建更高效，特别适合初始化部署和索引维护。

**使用场景**：
- 应用初始化部署
- 数据库迁移
- 索引批量维护
- 测试环境快速搭建

---

## 语法

```javascript
await collection(collectionName).createIndexes(indexSpecs)
```

### 参数

#### indexSpecs（必需）

索引规范数组，每个元素定义一个索引。

**类型**: `Array<Object>`

**格式**:
```javascript
[
  {
    key: { field1: 1 },      // 索引键（必需）
    name: "index_name",       // 索引名称（可选）
    unique: true,             // 唯一索引（可选）
    // ... 其他索引选项
  },
  // ... 更多索引
]
```

**索引规范字段**:

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `key` | Object | ✅ | 索引键定义 |
| `name` | String | ❌ | 索引名称（未指定则自动生成） |
| `unique` | Boolean | ❌ | 是否唯一索引 |
| `sparse` | Boolean | ❌ | 是否稀疏索引 |
| `expireAfterSeconds` | Number | ❌ | TTL 过期时间 |
| `partialFilterExpression` | Object | ❌ | 部分索引过滤条件 |
| `collation` | Object | ❌ | 排序规则 |
| 其他选项 | - | ❌ | 参见 [createIndex](./create-index.md) |

### 返回值

**类型**: `Promise<Array<String>>`

返回创建的索引名称数组。

**格式**:
```javascript
["email_1", "age_1", "city_1_age_-1"]
```

---

## 与 createIndex 的对比

| 特性 | createIndex | createIndexes |
|------|-------------|---------------|
| **创建数量** | 单个 | 多个 |
| **网络往返** | 每次一次 | 一次 |
| **性能** | 较慢 | 较快 |
| **适用场景** | 单个索引 | 批量创建 |
| **原子性** | 单个原子 | 批量原子 |

**性能对比示例**:
```javascript
// 方式 1: 逐个创建（3 次网络往返）
await collection("users").createIndex({ email: 1 });
await collection("users").createIndex({ age: 1 });
await collection("users").createIndex({ city: 1 });

// 方式 2: 批量创建（1 次网络往返）✓ 更快
await collection("users").createIndexes([
  { key: { email: 1 } },
  { key: { age: 1 } },
  { key: { city: 1 } }
]);
```

---

## 代码示例

### 示例 1: 基本批量创建

```javascript
const MonSQLize = require('monsqlize');
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

// 批量创建索引
const result = await collection("users").createIndexes([
  { key: { email: 1 } },
  { key: { age: 1 } },
  { key: { createdAt: -1 } }
]);

console.log("创建的索引:", result);
// ["email_1", "age_1", "createdAt_-1"]
```

### 示例 2: 混合索引类型

```javascript
// 创建不同类型的索引
await collection("users").createIndexes([
  // 唯一索引
  { 
    key: { email: 1 },
    unique: true,
    name: "email_unique"
  },
  // 复合索引
  {
    key: { city: 1, age: -1 },
    name: "city_age_idx"
  },
  // TTL 索引
  {
    key: { createdAt: 1 },
    expireAfterSeconds: 86400,  // 24 小时
    name: "session_ttl"
  },
  // 稀疏索引
  {
    key: { phone: 1 },
    sparse: true
  }
]);
```

### 示例 3: 应用初始化

```javascript
// 应用启动时初始化索引
async function initializeIndexes() {
  console.log("初始化数据库索引...");
  
  // Users 集合
  await collection("users").createIndexes([
    { key: { email: 1 }, unique: true, name: "email_unique" },
    { key: { username: 1 }, unique: true, name: "username_unique" },
    { key: { status: 1 }, name: "status_idx" },
    { key: { createdAt: -1 }, name: "created_idx" }
  ]);
  console.log("✓ Users 索引已创建");
  
  // Products 集合
  await collection("products").createIndexes([
    { key: { sku: 1 }, unique: true },
    { key: { category: 1, price: -1 } },
    { key: { name: "text" } }
  ]);
  console.log("✓ Products 索引已创建");
  
  // Orders 集合
  await collection("orders").createIndexes([
    { key: { userId: 1, status: 1 } },
    { key: { orderNumber: 1 }, unique: true },
    { key: { createdAt: -1 } }
  ]);
  console.log("✓ Orders 索引已创建");
  
  console.log("✓ 所有索引初始化完成");
}

// 应用启动时调用
await initializeIndexes();
```

### 示例 4: 部署脚本

```javascript
// 部署脚本：创建或更新索引
async function deployIndexes() {
  const indexDefinitions = {
    users: [
      { key: { email: 1 }, unique: true, name: "email_unique" },
      { key: { "profile.city": 1, "profile.age": 1 } }
    ],
    products: [
      { key: { category: 1, price: -1 } },
      { key: { tags: 1 } }
    ]
  };
  
  for (const [collName, indexes] of Object.entries(indexDefinitions)) {
    try {
      // 获取现有索引
      const existing = await collection(collName).listIndexes();
      const existingNames = existing.map(idx => idx.name);
      
      // 过滤出需要创建的索引
      const toCreate = indexes.filter(idx => {
        const name = idx.name || Object.keys(idx.key).join('_');
        return !existingNames.includes(name);
      });
      
      if (toCreate.length > 0) {
        await collection(collName).createIndexes(toCreate);
        console.log(`✓ ${collName}: 创建了 ${toCreate.length} 个索引`);
      } else {
        console.log(`✓ ${collName}: 所有索引已存在`);
      }
    } catch (err) {
      console.error(`✗ ${collName}: ${err.message}`);
    }
  }
}

await deployIndexes();
```

### 示例 5: 错误处理

```javascript
try {
  const result = await collection("users").createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { age: 1 } }
  ]);
  
  console.log("✓ 索引创建成功:", result);
} catch (err) {
  if (err.code === 'MONGODB_ERROR') {
    if (err.message.includes('索引已存在')) {
      console.log("部分索引已存在");
    } else if (err.message.includes('duplicate key')) {
      console.error("数据中有重复值，无法创建唯一索引");
    } else {
      console.error("创建失败:", err.message);
    }
  }
}
```

---

## 部分失败处理

### 行为说明

MongoDB 的 `createIndexes` 操作具有以下特点：

**原子性**：
- 批量操作作为单个命令执行
- 如果某个索引失败，整个操作失败
- 已创建的索引会保留（不会回滚）

**失败场景**：
```javascript
// 假设 email_1 索引已存在
await collection("users").createIndexes([
  { key: { email: 1 } },      // 失败（已存在）
  { key: { age: 1 } },         // 不会执行
  { key: { city: 1 } }         // 不会执行
]);
// 整个操作失败，age 和 city 索引不会创建
```

### 推荐做法

```javascript
// 逐个检查并创建
async function safeCreateIndexes(collectionName, indexSpecs) {
  const results = {
    created: [],
    skipped: [],
    failed: []
  };
  
  // 获取现有索引
  const existing = await collection(collectionName).listIndexes();
  const existingNames = existing.map(idx => idx.name);
  
  for (const spec of indexSpecs) {
    const indexName = spec.name || generateIndexName(spec.key);
    
    // 跳过已存在的索引
    if (existingNames.includes(indexName)) {
      results.skipped.push(indexName);
      continue;
    }
    
    // 尝试创建
    try {
      await collection(collectionName).createIndex(spec.key, spec);
      results.created.push(indexName);
    } catch (err) {
      results.failed.push({ indexName, error: err.message });
    }
  }
  
  return results;
}

// 使用
const results = await safeCreateIndexes("users", [
  { key: { email: 1 }, unique: true },
  { key: { age: 1 } },
  { key: { city: 1 } }
]);

console.log("创建:", results.created);
console.log("跳过:", results.skipped);
console.log("失败:", results.failed);
```

---

## 性能优化

### 1. 批量 vs 单个

**测试对比**（创建 10 个索引）:
```javascript
const indexes = [
  { key: { field1: 1 } },
  { key: { field2: 1 } },
  // ... 8 个更多
];

// 方式 1: 逐个创建
console.time('逐个创建');
for (const idx of indexes) {
  await collection("test").createIndex(idx.key);
}
console.timeEnd('逐个创建');
// 逐个创建: ~2000ms

// 方式 2: 批量创建
console.time('批量创建');
await collection("test").createIndexes(indexes);
console.timeEnd('批量创建');
// 批量创建: ~500ms
```

**结论**: 批量创建快 **4 倍**

### 2. 后台创建

```javascript
// 大数据集合使用后台创建（不阻塞）
await collection("large_collection").createIndexes([
  { 
    key: { field1: 1 },
    background: true  // 后台创建
  },
  {
    key: { field2: 1 },
    background: true
  }
]);
```

**注意**: `background` 选项在 MongoDB 4.2+ 已废弃，但保留兼容。

---

## 最佳实践

### 1. 配置化管理

```javascript
// config/indexes.js
module.exports = {
  users: [
    { key: { email: 1 }, unique: true, name: "email_unique" },
    { key: { username: 1 }, unique: true },
    { key: { status: 1, createdAt: -1 } }
  ],
  products: [
    { key: { sku: 1 }, unique: true },
    { key: { category: 1, price: -1 } }
  ]
};

// 使用
const indexConfig = require('./config/indexes');

async function applyIndexes() {
  for (const [collName, indexes] of Object.entries(indexConfig)) {
    await collection(collName).createIndexes(indexes);
    console.log(`✓ ${collName} 索引已创建`);
  }
}
```

### 2. 环境区分

```javascript
// 不同环境使用不同索引
const indexConfig = {
  development: {
    users: [
      { key: { email: 1 } }  // 开发环境简化
    ]
  },
  production: {
    users: [
      { key: { email: 1 }, unique: true },
      { key: { status: 1, createdAt: -1 } },
      { key: { "profile.city": 1 } }
    ]
  }
};

const env = process.env.NODE_ENV || 'development';
await collection("users").createIndexes(indexConfig[env].users);
```

### 3. 版本控制

```javascript
// migrations/001_create_indexes.js
module.exports = {
  version: 1,
  up: async (db) => {
    await db.collection("users").createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { createdAt: -1 } }
    ]);
  },
  down: async (db) => {
    await db.collection("users").dropIndex("email_1");
    await db.collection("users").dropIndex("createdAt_-1");
  }
};
```

---

## 相关方法

- [`createIndex()`](./create-index.md) - 创建单个索引
- [`listIndexes()`](./list-indexes.md) - 列出所有索引
- [`dropIndex()`](./drop-index.md) - 删除索引
- [索引管理完整指南](./index-management.md) - 索引管理综合文档

---

## 参考资源

- [MongoDB createIndexes 文档](https://www.mongodb.com/docs/manual/reference/method/db.collection.createIndexes/)
- [批量操作最佳实践](https://www.mongodb.com/docs/manual/core/bulk-write-operations/)

