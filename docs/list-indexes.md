# listIndexes() - 列出所有索引

列出集合的所有索引，用于索引审计、监控和管理。

---

## 概述

`listIndexes()` 方法返回集合的所有索引信息，包括索引名称、键、选项等详细信息。

**使用场景**：
- 索引审计和检查
- 验证索引是否存在
- 索引监控和管理
- 部署验证
- 索引文档化

---

## 语法

```javascript
await collection(collectionName).listIndexes()
```

### 参数

无参数。

### 返回值

**类型**: `Promise<Array<Object>>`

返回索引信息对象数组。

**返回格式**:
```javascript
[
  {
    v: 2,                    // 索引版本
    key: { _id: 1 },         // 索引键
    name: "_id_"             // 索引名称
  },
  {
    v: 2,
    key: { email: 1 },
    name: "email_1",
    unique: true             // 唯一索引
  },
  // ... 更多索引
]
```

---

## 索引字段说明

### 通用字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `v` | Number | 索引版本（通常为 2） |
| `key` | Object | 索引键定义 |
| `name` | String | 索引名称 |
| `ns` | String | 命名空间（数据库.集合） |

### 选项字段

根据索引类型和选项，可能包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `unique` | Boolean | 是否唯一索引 |
| `sparse` | Boolean | 是否稀疏索引 |
| `expireAfterSeconds` | Number | TTL 过期时间（秒） |
| `partialFilterExpression` | Object | 部分索引过滤条件 |
| `collation` | Object | 排序规则 |
| `hidden` | Boolean | 是否隐藏（MongoDB 4.4+） |
| `weights` | Object | 文本索引权重 |
| `default_language` | String | 文本索引默认语言 |
| `language_override` | String | 语言覆盖字段 |
| `textIndexVersion` | Number | 文本索引版本 |
| `2dsphereIndexVersion` | Number | 2dsphere 索引版本 |

---

## 代码示例

### 示例 1: 列出所有索引

```javascript
const MonSQLize = require('monsqlize');
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

// 列出索引
const indexes = await collection("users").listIndexes();

console.log(`共有 ${indexes.length} 个索引`);
indexes.forEach(idx => {
  console.log(`- ${idx.name}:`, idx.key);
});

// 输出示例:
// 共有 3 个索引
// - _id_: { _id: 1 }
// - email_1: { email: 1 }
// - age_1: { age: 1 }
```

### 示例 2: 查找特定索引

```javascript
// 查找指定名称的索引
const indexes = await collection("users").listIndexes();
const emailIndex = indexes.find(idx => idx.name === 'email_1');

if (emailIndex) {
  console.log("找到索引:", emailIndex);
  console.log("  键:", emailIndex.key);
  console.log("  唯一:", emailIndex.unique || false);
} else {
  console.log("索引不存在");
}
```

### 示例 3: 检查索引是否存在

```javascript
// 检查索引是否存在
async function indexExists(collectionName, indexName) {
  const indexes = await collection(collectionName).listIndexes();
  return indexes.some(idx => idx.name === indexName);
}

// 使用
if (await indexExists("users", "email_1")) {
  console.log("邮箱索引已存在");
} else {
  // 创建索引
  await collection("users").createIndex({ email: 1 });
}
```

### 示例 4: 过滤特定类型的索引

```javascript
const indexes = await collection("users").listIndexes();

// 查找唯一索引
const uniqueIndexes = indexes.filter(idx => idx.unique === true);
console.log("唯一索引:", uniqueIndexes.map(idx => idx.name));

// 查找 TTL 索引
const ttlIndexes = indexes.filter(idx => idx.expireAfterSeconds !== undefined);
console.log("TTL 索引:", ttlIndexes.map(idx => ({
  name: idx.name,
  ttl: idx.expireAfterSeconds
})));

// 查找复合索引
const compoundIndexes = indexes.filter(idx => 
  Object.keys(idx.key).length > 1
);
console.log("复合索引:", compoundIndexes.map(idx => idx.name));
```

### 示例 5: 索引信息展示

```javascript
const indexes = await collection("users").listIndexes();

console.log("\n索引详情:");
console.log("=".repeat(70));

indexes.forEach(idx => {
  console.log(`\n索引名称: ${idx.name}`);
  console.log(`  键: ${JSON.stringify(idx.key)}`);
  
  if (idx.unique) console.log(`  类型: 唯一索引`);
  if (idx.sparse) console.log(`  类型: 稀疏索引`);
  if (idx.expireAfterSeconds) {
    console.log(`  类型: TTL 索引 (${idx.expireAfterSeconds}秒)`);
  }
  if (idx.partialFilterExpression) {
    console.log(`  类型: 部分索引`);
    console.log(`  条件: ${JSON.stringify(idx.partialFilterExpression)}`);
  }
  if (idx.hidden) console.log(`  状态: 隐藏`);
});

// 输出示例:
// 索引详情:
// ======================================================================
// 
// 索引名称: _id_
//   键: {"_id":1}
// 
// 索引名称: email_unique
//   键: {"email":1}
//   类型: 唯一索引
// 
// 索引名称: age_adult
//   键: {"age":1}
//   类型: 部分索引
//   条件: {"age":{"$gte":18}}
```

### 示例 6: 集合不存在时的处理

```javascript
// 集合不存在时返回空数组
const indexes = await collection("nonexistent_collection").listIndexes();

console.log(`索引数量: ${indexes.length}`);
// 输出: 索引数量: 0

// 安全检查
if (indexes.length === 0) {
  console.log("集合不存在或没有索引");
} else {
  console.log("找到索引:", indexes.map(idx => idx.name));
}
```

### 示例 7: 索引统计分析

```javascript
const indexes = await collection("users").listIndexes();

// 统计索引类型
const stats = {
  total: indexes.length,
  unique: indexes.filter(idx => idx.unique).length,
  sparse: indexes.filter(idx => idx.sparse).length,
  ttl: indexes.filter(idx => idx.expireAfterSeconds).length,
  partial: indexes.filter(idx => idx.partialFilterExpression).length,
  compound: indexes.filter(idx => Object.keys(idx.key).length > 1).length,
  hidden: indexes.filter(idx => idx.hidden).length
};

console.log("索引统计:");
console.log(`  总数: ${stats.total}`);
console.log(`  唯一索引: ${stats.unique}`);
console.log(`  稀疏索引: ${stats.sparse}`);
console.log(`  TTL 索引: ${stats.ttl}`);
console.log(`  部分索引: ${stats.partial}`);
console.log(`  复合索引: ${stats.compound}`);
console.log(`  隐藏索引: ${stats.hidden}`);
```

### 示例 8: 索引对比（部署验证）

```javascript
// 期望的索引配置
const expectedIndexes = [
  { name: "_id_", key: { _id: 1 } },
  { name: "email_unique", key: { email: 1 }, unique: true },
  { name: "created_idx", key: { createdAt: -1 } }
];

// 获取实际索引
const actualIndexes = await collection("users").listIndexes();

// 对比
const missing = expectedIndexes.filter(expected => 
  !actualIndexes.some(actual => actual.name === expected.name)
);

if (missing.length > 0) {
  console.log("缺少的索引:");
  missing.forEach(idx => {
    console.log(`  - ${idx.name}:`, idx.key);
  });
  
  // 创建缺少的索引
  for (const idx of missing) {
    await collection("users").createIndex(idx.key, {
      name: idx.name,
      unique: idx.unique
    });
  }
} else {
  console.log("✓ 所有索引已创建");
}
```

---

## 实际应用

### 1. 索引审计

定期检查索引配置，确保符合预期。

```javascript
async function auditIndexes(collectionName) {
  const indexes = await collection(collectionName).listIndexes();
  
  const report = {
    collection: collectionName,
    totalIndexes: indexes.length,
    indexes: indexes.map(idx => ({
      name: idx.name,
      keys: idx.key,
      unique: idx.unique || false,
      sparse: idx.sparse || false,
      ttl: idx.expireAfterSeconds,
      size: idx.size || 'N/A'
    }))
  };
  
  console.log(JSON.stringify(report, null, 2));
  return report;
}

// 审计所有集合
await auditIndexes("users");
await auditIndexes("products");
await auditIndexes("orders");
```

### 2. 索引监控

监控索引变化，及时发现问题。

```javascript
async function monitorIndexes(collectionName) {
  const currentIndexes = await collection(collectionName).listIndexes();
  
  // 保存基线（首次运行）
  const baseline = JSON.parse(localStorage.getItem('indexBaseline')) || {};
  
  if (!baseline[collectionName]) {
    baseline[collectionName] = currentIndexes;
    localStorage.setItem('indexBaseline', JSON.stringify(baseline));
    console.log(`✓ 基线已保存: ${collectionName}`);
    return;
  }
  
  // 对比变化
  const baselineIndexes = baseline[collectionName];
  const currentNames = currentIndexes.map(idx => idx.name);
  const baselineNames = baselineIndexes.map(idx => idx.name);
  
  const added = currentNames.filter(name => !baselineNames.includes(name));
  const removed = baselineNames.filter(name => !currentNames.includes(name));
  
  if (added.length > 0) {
    console.log(`⚠️  新增索引: ${added.join(', ')}`);
  }
  if (removed.length > 0) {
    console.log(`⚠️  删除索引: ${removed.join(', ')}`);
  }
  if (added.length === 0 && removed.length === 0) {
    console.log(`✓ 无变化: ${collectionName}`);
  }
}
```

### 3. 部署验证

部署后验证索引是否正确创建。

```javascript
async function verifyDeployment() {
  const requirements = {
    users: [
      { name: "email_unique", key: { email: 1 }, unique: true },
      { name: "created_idx", key: { createdAt: -1 } }
    ],
    products: [
      { name: "category_price_idx", key: { category: 1, price: -1 } },
      { name: "sku_unique", key: { sku: 1 }, unique: true }
    ]
  };
  
  let allValid = true;
  
  for (const [collName, requiredIndexes] of Object.entries(requirements)) {
    const actualIndexes = await collection(collName).listIndexes();
    
    for (const required of requiredIndexes) {
      const found = actualIndexes.find(idx => idx.name === required.name);
      
      if (!found) {
        console.log(`✗ ${collName}: 缺少索引 ${required.name}`);
        allValid = false;
      } else if (required.unique && !found.unique) {
        console.log(`✗ ${collName}: 索引 ${required.name} 应该是唯一索引`);
        allValid = false;
      } else {
        console.log(`✓ ${collName}: 索引 ${required.name} 正确`);
      }
    }
  }
  
  if (allValid) {
    console.log("\n✓ 部署验证通过");
  } else {
    console.log("\n✗ 部署验证失败");
    process.exit(1);
  }
}

// 运行验证
await verifyDeployment();
```

---

## 错误处理

### 集合不存在

当集合不存在时，`listIndexes()` 返回空数组，不会抛出错误。

```javascript
const indexes = await collection("nonexistent").listIndexes();
console.log(indexes.length);  // 0

// 安全检查
if (indexes.length === 0) {
  console.log("集合可能不存在或没有索引");
}
```

### 权限问题

如果没有权限访问集合，可能会抛出错误。

```javascript
try {
  const indexes = await collection("protected_collection").listIndexes();
} catch (err) {
  if (err.message.includes('not authorized')) {
    console.error("权限不足，无法列出索引");
  } else {
    console.error("列出索引失败:", err.message);
  }
}
```

---

## 性能建议

### 1. 缓存索引信息

```javascript
// 索引信息变化不频繁，可以缓存
const indexCache = new Map();

async function getCachedIndexes(collectionName, ttl = 300000) {
  const cached = indexCache.get(collectionName);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.indexes;
  }
  
  const indexes = await collection(collectionName).listIndexes();
  indexCache.set(collectionName, {
    indexes,
    timestamp: Date.now()
  });
  
  return indexes;
}

// 使用缓存
const indexes = await getCachedIndexes("users");
```

### 2. 减少调用频率

```javascript
// ✗ 不好：频繁调用
for (let i = 0; i < 100; i++) {
  const indexes = await collection("users").listIndexes();
  // ...
}

// ✓ 好：调用一次，重复使用
const indexes = await collection("users").listIndexes();
for (let i = 0; i < 100; i++) {
  // 使用 indexes
}
```

---

## 最佳实践

### 1. 索引文档化

将索引信息导出为文档。

```javascript
const indexes = await collection("users").listIndexes();

const doc = indexes.map(idx => {
  const lines = [
    `### ${idx.name}`,
    `- **键**: \`${JSON.stringify(idx.key)}\``,
  ];
  
  if (idx.unique) lines.push(`- **类型**: 唯一索引`);
  if (idx.sparse) lines.push(`- **类型**: 稀疏索引`);
  if (idx.expireAfterSeconds) {
    lines.push(`- **类型**: TTL 索引 (${idx.expireAfterSeconds}秒)`);
  }
  
  return lines.join('\n');
});

console.log(doc.join('\n\n'));
```

### 2. 索引命名规范检查

```javascript
const indexes = await collection("users").listIndexes();

// 检查命名规范
indexes.forEach(idx => {
  if (idx.name === '_id_') return;  // 跳过默认索引
  
  // 规范：字段名_方向 或自定义描述性名称
  const hasDescriptiveName = idx.name.includes('idx') || 
                             idx.name.includes('unique') ||
                             idx.name.includes('ttl');
  
  if (!hasDescriptiveName && idx.name.match(/_[1-]$/)) {
    console.log(`⚠️  ${idx.name}: 建议使用更描述性的名称`);
  }
});
```

### 3. 定期审计

```javascript
// 定期执行（如每天）
async function dailyIndexAudit() {
  const collections = ['users', 'products', 'orders'];
  
  for (const coll of collections) {
    const indexes = await collection(coll).listIndexes();
    
    console.log(`\n${coll}: ${indexes.length} 个索引`);
    
    // 检查大小（需要 MongoDB 4.4+）
    if (indexes.some(idx => idx.size && idx.size > 1024 * 1024 * 100)) {
      console.log(`  ⚠️  发现大索引（>100MB）`);
    }
    
    // 检查隐藏索引
    const hidden = indexes.filter(idx => idx.hidden);
    if (hidden.length > 0) {
      console.log(`  ⚠️  发现 ${hidden.length} 个隐藏索引`);
    }
  }
}
```

---

## 相关方法

- [`createIndex()`](./create-index.md) - 创建单个索引
- [`createIndexes()`](./create-indexes.md) - 批量创建索引
- [`dropIndex()`](./drop-index.md) - 删除指定索引
- [`explain()`](./explain.md) - 分析查询执行计划（查看索引使用情况）
- [索引管理完整指南](./index-management.md) - 索引管理综合文档

---

## 参考资源

- [MongoDB listIndexes 文档](https://www.mongodb.com/docs/manual/reference/method/db.collection.getIndexes/)
- [索引信息字段](https://www.mongodb.com/docs/manual/reference/command/listIndexes/)

