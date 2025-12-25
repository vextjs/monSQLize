# dropIndex() - 删除指定索引

安全地删除集合的指定索引。

---

## 📑 目录

- [概述](#概述)
- [语法](#语法)
- [代码示例](#代码示例)
- [错误处理](#错误处理)
- [安全建议](#安全建议)
- [相关方法](#相关方法)
- [dropIndexes() - 删除所有索引](#dropindexes---删除所有索引)
- [最佳实践](#最佳实践)
- [参考资源](#参考资源)

---

## 概述

`dropIndex()` 方法用于删除集合的指定索引。支持安全检查，禁止删除 `_id` 索引。

**使用场景**：
- 删除不再使用的索引
- 优化索引结构
- 索引重建前的清理
- 测试和开发环境清理

---

## 语法

```javascript
await collection(collectionName).dropIndex(indexName)
```

### 参数

#### indexName（必需）

要删除的索引名称。

**类型**: `String`

**示例**:
- `"email_1"` - 单字段索引
- `"email_unique"` - 自定义名称的索引
- `"user_status_idx"` - 复合索引

**限制**:
- ❌ 不能删除 `_id_` 索引（MongoDB 强制限制）
- ❌ 不能为空字符串

### 返回值

**类型**: `Promise<Object>`

**格式**:
```javascript
{
  ok: 1,
  nIndexesWas: 3  // 删除前的索引数量
}
```

---

## 代码示例

### 示例 1: 删除单个索引

```javascript
const MonSQLize = require('monsqlize');
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

// 删除索引
const result = await collection("users").dropIndex("email_1");
console.log(result);
// { ok: 1, nIndexesWas: 3 }

console.log("✓ 索引已删除");
```

### 示例 2: 检查后删除

```javascript
// 先检查索引是否存在
const indexes = await collection("users").listIndexes();
const exists = indexes.some(idx => idx.name === "old_index");

if (exists) {
  await collection("users").dropIndex("old_index");
  console.log("✓ 索引已删除");
} else {
  console.log("索引不存在，无需删除");
}
```

### 示例 3: 错误处理

```javascript
try {
  await collection("users").dropIndex("email_1");
  console.log("✓ 删除成功");
} catch (err) {
  if (err.code === 'MONGODB_ERROR') {
    if (err.message.includes('索引不存在')) {
      console.log("索引不存在");
    } else if (err.message.includes('不允许删除 _id 索引')) {
      console.log("不能删除 _id 索引");
    } else {
      console.error("删除失败:", err.message);
    }
  }
}
```

### 示例 4: 批量删除流程

```javascript
// 删除多个索引
const indexesToDrop = ["old_idx_1", "old_idx_2", "old_idx_3"];

for (const indexName of indexesToDrop) {
  try {
    await collection("users").dropIndex(indexName);
    console.log(`✓ 已删除: ${indexName}`);
  } catch (err) {
    console.log(`✗ 删除失败: ${indexName} - ${err.message}`);
  }
}
```

### 示例 5: 安全删除模式

```javascript
async function safeDropIndex(collectionName, indexName) {
  // 1. 检查索引是否存在
  const indexes = await collection(collectionName).listIndexes();
  const index = indexes.find(idx => idx.name === indexName);
  
  if (!index) {
    console.log(`索引 ${indexName} 不存在`);
    return false;
  }
  
  // 2. 不允许删除 _id 索引
  if (indexName === '_id_') {
    console.log('不允许删除 _id 索引');
    return false;
  }
  
  // 3. 记录索引信息（用于回滚）
  console.log('准备删除索引:', {
    name: index.name,
    key: index.key,
    unique: index.unique || false
  });
  
  // 4. 执行删除
  try {
    await collection(collectionName).dropIndex(indexName);
    console.log(`✓ 索引 ${indexName} 已删除`);
    return true;
  } catch (err) {
    console.error(`✗ 删除失败:`, err.message);
    return false;
  }
}

// 使用
await safeDropIndex("users", "old_email_idx");
```

---

## 错误处理

### 1. 索引不存在

**错误码**: `MONGODB_ERROR`  
**消息**: "索引不存在: {indexName}"

**解决方案**:
```javascript
// 先列出索引
const indexes = await collection("users").listIndexes();
console.log("现有索引:", indexes.map(idx => idx.name));

// 确认索引名称后再删除
```

### 2. 禁止删除 _id 索引

**错误码**: `INVALID_ARGUMENT`  
**消息**: "不允许删除 _id 索引"

**原因**: MongoDB 强制要求每个集合必须有 _id 索引

**解决方案**:
```javascript
// 检查索引名称
if (indexName !== '_id_') {
  await collection("users").dropIndex(indexName);
}
```

### 3. 权限不足

**错误码**: MongoDB 错误  
**消息**: "not authorized"

**解决方案**: 确保数据库用户有 `dropIndex` 权限

---

## 安全建议

### 1. 删除前备份

```javascript
// 1. 记录索引信息
const indexes = await collection("users").listIndexes();
const indexToDelete = indexes.find(idx => idx.name === "email_1");

console.log("索引信息（用于恢复）:");
console.log(JSON.stringify(indexToDelete, null, 2));

// 2. 删除索引
await collection("users").dropIndex("email_1");

// 3. 如果需要恢复
// await collection("users").createIndex(indexToDelete.key, {
//   name: indexToDelete.name,
//   unique: indexToDelete.unique
// });
```

### 2. 生产环境注意事项

```javascript
// 生产环境删除索引前的检查清单
async function productionDropIndex(collectionName, indexName) {
  // 1. 确认环境
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  警告：在生产环境删除索引');
    
    // 2. 确认索引未被使用
    const stats = await collection(collectionName)
      .find({})
      .explain('executionStats');
    
    // 3. 记录当前索引状态
    const indexes = await collection(collectionName).listIndexes();
    const backup = JSON.stringify(indexes, null, 2);
    
    // 保存到文件
    require('fs').writeFileSync(
      `./backups/indexes-${Date.now()}.json`,
      backup
    );
    
    console.log('✓ 索引备份已保存');
  }
  
  // 4. 执行删除
  await collection(collectionName).dropIndex(indexName);
}
```

### 3. 回滚方案

```javascript
// 删除前保存索引定义
const indexes = await collection("users").listIndexes();
const targetIndex = indexes.find(idx => idx.name === "email_1");

const rollback = {
  keys: targetIndex.key,
  options: {
    name: targetIndex.name,
    unique: targetIndex.unique,
    sparse: targetIndex.sparse,
    expireAfterSeconds: targetIndex.expireAfterSeconds
  }
};

// 删除索引
await collection("users").dropIndex("email_1");

// 如果出现问题，恢复索引
try {
  // ... 测试应用 ...
} catch (err) {
  console.log("回滚：重新创建索引");
  await collection("users").createIndex(rollback.keys, rollback.options);
}
```

---

## 相关方法

- [`dropIndexes()`](#dropIndexes) - 删除所有索引
- [`createIndex()`](./create-index.md) - 创建索引
- [`listIndexes()`](./list-indexes.md) - 列出所有索引
- [索引管理完整指南](./index-management.md) - 索引管理综合文档

---

## dropIndexes() - 删除所有索引

删除集合的所有索引（`_id` 索引除外）。

### 语法

```javascript
await collection(collectionName).dropIndexes()
```

### 参数

无参数。

### 返回值

**类型**: `Promise<Object>`

**格式**:
```javascript
{
  ok: 1,
  nIndexesWas: 5  // 删除前的索引数量
}
```

### 代码示例

#### 示例 1: 删除所有索引

```javascript
// 删除所有索引（_id 除外）
const result = await collection("users").dropIndexes();
console.log(result);
// { ok: 1, nIndexesWas: 5 }

// 验证
const indexes = await collection("users").listIndexes();
console.log("剩余索引:", indexes.length);  // 1 (_id 索引)
```

#### 示例 2: 重建所有索引

```javascript
// 1. 备份索引定义
const oldIndexes = await collection("users").listIndexes();
const backup = oldIndexes
  .filter(idx => idx.name !== '_id_')
  .map(idx => ({
    key: idx.key,
    name: idx.name,
    unique: idx.unique,
    sparse: idx.sparse
  }));

// 2. 删除所有索引
await collection("users").dropIndexes();

// 3. 重新创建索引
for (const idx of backup) {
  await collection("users").createIndex(idx.key, {
    name: idx.name,
    unique: idx.unique,
    sparse: idx.sparse
  });
}

console.log("✓ 索引重建完成");
```

#### 示例 3: 集合不存在时的处理

```javascript
try {
  const result = await collection("nonexistent").dropIndexes();
  console.log(result);
  // { ok: 1, msg: '集合不存在，无索引可删除', nIndexesWas: 0 }
} catch (err) {
  console.error(err.message);
}
```

### 安全建议

**重要警告**：
- ⚠️ 此操作会删除所有自定义索引
- ⚠️ 可能严重影响查询性能
- ⚠️ 生产环境慎用

**推荐做法**：
```javascript
// 生产环境使用前确认
if (process.env.NODE_ENV === 'production') {
  console.log('⚠️  警告：即将删除所有索引');
  
  // 需要手动确认
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    readline.question('确认删除所有索引？(yes/no): ', resolve);
  });
  
  if (answer !== 'yes') {
    console.log('操作已取消');
    return;
  }
  
  readline.close();
}

await collection("users").dropIndexes();
```

---

## 最佳实践

### 1. 索引生命周期管理

```javascript
// 定期清理未使用的索引
async function cleanupUnusedIndexes(collectionName) {
  const indexes = await collection(collectionName).listIndexes();
  
  // 分析索引使用情况（需要 MongoDB 4.2+）
  const stats = await db.admin().command({
    aggregate: collectionName,
    pipeline: [{ $indexStats: {} }],
    cursor: {}
  });
  
  // 找出未使用的索引
  const unused = indexes.filter(idx => {
    if (idx.name === '_id_') return false;
    const usage = stats.cursor.firstBatch.find(s => s.name === idx.name);
    return usage && usage.accesses.ops === 0;
  });
  
  // 删除未使用的索引
  for (const idx of unused) {
    console.log(`删除未使用的索引: ${idx.name}`);
    await collection(collectionName).dropIndex(idx.name);
  }
}
```

### 2. 索引维护窗口

```javascript
// 在维护窗口期间重建索引
async function maintenanceWindow(collectionName) {
  console.log('进入维护模式...');
  
  // 1. 备份索引
  const indexes = await collection(collectionName).listIndexes();
  const backup = indexes.filter(idx => idx.name !== '_id_');
  
  // 2. 删除所有索引
  await collection(collectionName).dropIndexes();
  console.log('✓ 旧索引已删除');
  
  // 3. 重新创建优化的索引
  await collection(collectionName).createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { status: 1, createdAt: -1 } },
    { key: { city: 1, age: 1 } }
  ]);
  console.log('✓ 新索引已创建');
  
  console.log('退出维护模式');
}
```

### 3. A/B 测试索引

```javascript
// 测试删除某个索引的影响
async function testIndexRemoval(collectionName, indexName) {
  // 1. 记录当前性能
  const before = await measureQueryPerformance(collectionName);
  
  // 2. 隐藏索引（MongoDB 4.4+）而不是删除
  // await collection(collectionName).hideIndex(indexName);
  
  // 如果不支持 hideIndex，则删除
  await collection(collectionName).dropIndex(indexName);
  
  // 3. 测试性能
  const after = await measureQueryPerformance(collectionName);
  
  // 4. 对比结果
  console.log('性能对比:');
  console.log('  删除前:', before.avgTime, 'ms');
  console.log('  删除后:', after.avgTime, 'ms');
  
  if (after.avgTime > before.avgTime * 1.5) {
    console.log('⚠️  性能下降超过 50%，建议保留索引');
  }
}
```

---

## 参考资源

- [MongoDB dropIndex 文档](https://www.mongodb.com/docs/manual/reference/method/db.collection.dropIndex/)
- [MongoDB dropIndexes 文档](https://www.mongodb.com/docs/manual/reference/method/db.collection.dropIndexes/)
- [索引管理最佳实践](https://www.mongodb.com/docs/manual/indexes/#index-maintenance)

