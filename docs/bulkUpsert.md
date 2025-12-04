# bulkUpsert 扩展方法

> **版本**: v1.2.0+  
> **类型**: 扩展方法  
> **优先级**: P1

---

## 📋 概述

`bulkUpsert` 是一个高性能的批量 upsert 方法，用于批量更新或插入大量数据。它支持自动分批处理、进度监控、错误恢复，性能比循环 upsertOne 提升 **8-100 倍**。

---

## 🎯 核心特性

| 特性 | 说明 |
|------|------|
| **高性能** | 比循环 upsertOne 快 **8-100 倍** |
| **自动分批** | 默认 1000 条/批，避免内存溢出 |
| **进度监控** | 实时回调，监控处理进度 |
| **错误恢复** | 批次失败不影响其他批次 |
| **大数据支持** | 轻松处理 10 万+ 记录 |

---

## 📖 API 签名

```typescript
bulkUpsert(
  items: Array<Object>,
  options: BulkUpsertOptions
): Promise<BulkUpsertResult>

interface BulkUpsertOptions {
  matchOn: (item: Object) => Object;               // 匹配函数（必需）
  batchSize?: number;                              // 批次大小（默认: 1000）
  onProgress?: (processed, total, batch, totalBatches) => void;  // 进度回调
  maxTimeMS?: number;                              // 查询超时时间
  comment?: string;                                // 查询注释
  session?: ClientSession;                         // MongoDB 会话（事务支持）
}

interface BulkUpsertResult {
  upsertedCount: number;                           // 插入的文档数量
  modifiedCount: number;                           // 修改的文档数量
  totalCount: number;                              // 总处理数量
  errors: Array<{                                  // 错误列表
    batch: number;
    startIndex: number;
    endIndex: number;
    error: string;
  }>;
}
```

---

## 🚀 使用场景

### 场景 1: 批量同步用户数据

**业务需求**: 从外部系统同步 10000+ 用户数据，已存在的更新，不存在的插入。

#### ❌ 原生实现（慢，容易超时）

```javascript
// 循环 upsertOne
const users = [/* 10000 个用户 */];

for (const user of users) {
  await User.updateOne(
    { email: user.email },
    { $set: user },
    { upsert: true }
  );
}

// 问题：
// 1. 性能极差（10000 次 DB 调用）
// 2. 耗时长（100 条 83ms → 10000 条 8300ms = 8.3秒）
// 3. 容易超时
// 4. 无法监控进度
// 5. 失败后难以恢复
```

#### ✅ bulkUpsert（快速，可靠）

```javascript
const users = [/* 10000 个用户 */];

const result = await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 500,
  onProgress: (processed, total, batch, totalBatches) => {
    console.log(`进度: ${processed}/${total} (批次 ${batch}/${totalBatches})`);
  }
});

console.log(`
  插入: ${result.upsertedCount}
  更新: ${result.modifiedCount}
  总计: ${result.totalCount}
  错误: ${result.errors.length}
`);

// 优势：
// ✅ 性能提升 8-100 倍（100条：10ms vs 83ms，提升 8.3倍）
// ✅ 自动分批（500 条/批，共 20 批）
// ✅ 进度监控（实时显示进度）
// ✅ 错误恢复（批次失败不影响其他批次）
// ✅ 耗时短（10000 条约 200ms）
```

---

### 场景 2: 批量导入商品数据

**业务需求**: 从 CSV 导入 5000 个商品，SKU 已存在的更新，不存在的插入。

#### ✅ bulkUpsert（进度监控）

```javascript
// 1. 解析 CSV
const products = await parseCSV('products.csv');

console.log(`准备导入 ${products.length} 个商品...`);

// 2. 批量 upsert
const result = await Product.bulkUpsert(products, {
  matchOn: (product) => ({ sku: product.sku }),
  batchSize: 250,
  onProgress: (processed, total, batch, totalBatches) => {
    const percent = ((processed / total) * 100).toFixed(1);
    console.log(`[${percent}%] 批次 ${batch}/${totalBatches}: ${processed}/${total}`);
  }
});

console.log(`
  ✅ 导入完成
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  新增商品: ${result.upsertedCount}
  更新商品: ${result.modifiedCount}
  总计处理: ${result.totalCount}
  失败批次: ${result.errors.length}
`);

// 输出示例：
// [10.0%] 批次 1/20: 250/5000
// [20.0%] 批次 2/20: 500/5000
// [30.0%] 批次 3/20: 750/5000
// ...
// [100.0%] 批次 20/20: 5000/5000
//
// ✅ 导入完成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 新增商品: 3000
// 更新商品: 2000
// 总计处理: 5000
// 失败批次: 0
```

---

### 场景 3: 数据库迁移

**业务需求**: 从旧系统迁移 50000 条用户数据到新系统。

#### ✅ bulkUpsert（大数据处理）

```javascript
async function migrateUsers(oldDbConnection) {
  console.log('开始用户数据迁移...');
  
  // 1. 从旧系统查询数据
  const oldUsers = await oldDbConnection.query('SELECT * FROM users');
  console.log(`查询到 ${oldUsers.length} 条用户数据`);
  
  // 2. 转换数据格式
  const users = oldUsers.map(oldUser => ({
    email: oldUser.email,
    name: oldUser.username,
    createdAt: new Date(oldUser.created_at),
    status: oldUser.is_active ? 'active' : 'inactive'
  }));
  
  // 3. 批量 upsert
  const startTime = Date.now();
  
  const result = await User.bulkUpsert(users, {
    matchOn: (user) => ({ email: user.email }),
    batchSize: 1000,  // 1000 条/批
    onProgress: (processed, total, batch, totalBatches) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const speed = Math.floor(processed / elapsed);
      console.log(`[${batch}/${totalBatches}] ${processed}/${total} (${speed} 条/秒)`);
    }
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgSpeed = Math.floor(result.totalCount / duration);
  
  console.log(`
    ✅ 迁移完成
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    总用户数: ${result.totalCount}
    新增用户: ${result.upsertedCount}
    更新用户: ${result.modifiedCount}
    耗时: ${duration} 秒
    平均速度: ${avgSpeed} 条/秒
    失败批次: ${result.errors.length}
  `);
  
  return result;
}

// 输出示例：
// 开始用户数据迁移...
// 查询到 50000 条用户数据
// [1/50] 1000/50000 (2500 条/秒)
// [2/50] 2000/50000 (2666 条/秒)
// ...
// [50/50] 50000/50000 (2500 条/秒)
//
// ✅ 迁移完成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 总用户数: 50000
// 新增用户: 30000
// 更新用户: 20000
// 耗时: 20.00 秒
// 平均速度: 2500 条/秒
// 失败批次: 0
```

---

## ⚙️ 选项详解

### matchOn - 匹配函数（必需）

**类型**: `Function`  
**参数**: `(item: Object) => Object`  
**返回**: 查询条件对象

```javascript
// 示例 1: 匹配 email
matchOn: (user) => ({ email: user.email })

// 示例 2: 匹配 sku
matchOn: (product) => ({ sku: product.sku })

// 示例 3: 匹配多个字段
matchOn: (order) => ({
  userId: order.userId,
  orderNumber: order.orderNumber
})

// 示例 4: 复杂匹配条件
matchOn: (item) => ({
  $or: [
    { email: item.email },
    { phone: item.phone }
  ]
})
```

**注意**: matchOn 返回的字段应该有 **unique 索引**，否则可能更新错误的文档。

---

### batchSize - 批次大小

**类型**: `number`  
**默认**: `1000`

```javascript
// 小数据量（< 1000）
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 100  // 100 条/批
});

// 中等数据量（1000-10000）
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 500  // 500 条/批（推荐）
});

// 大数据量（10000+）
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 1000  // 1000 条/批（默认）
});

// 超大数据量（100000+）
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 2000  // 2000 条/批
});
```

**建议**:
- 小文档（< 1KB）: 1000-2000 条/批
- 中等文档（1-10KB）: 500-1000 条/批
- 大文档（> 10KB）: 100-500 条/批

---

### onProgress - 进度回调

**类型**: `Function`  
**参数**: `(processed: number, total: number, batch: number, totalBatches: number) => void`

```javascript
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 500,
  onProgress: (processed, total, batch, totalBatches) => {
    // 1. 简单进度
    console.log(`${processed}/${total}`);
    
    // 2. 百分比进度
    const percent = ((processed / total) * 100).toFixed(1);
    console.log(`[${percent}%] ${processed}/${total}`);
    
    // 3. 批次进度
    console.log(`批次 ${batch}/${totalBatches}: ${processed}/${total}`);
    
    // 4. 进度条（需要 cli-progress 包）
    progressBar.update(processed);
    
    // 5. WebSocket 通知前端
    io.emit('import-progress', {
      processed,
      total,
      percent: (processed / total) * 100
    });
  }
});
```

---

### session - 事务支持

**类型**: `ClientSession`  
**默认**: 无

```javascript
const session = await client.startSession();
session.startTransaction();

try {
  // 批量 upsert 用户
  const result1 = await User.bulkUpsert(users, {
    matchOn: (user) => ({ email: user.email }),
    session
  });
  
  // 批量 upsert 订单
  const result2 = await Order.bulkUpsert(orders, {
    matchOn: (order) => ({ orderNumber: order.orderNumber }),
    session
  });
  
  await session.commitTransaction();
  console.log('事务提交成功');
} catch (error) {
  await session.abortTransaction();
  console.error('事务回滚:', error.message);
} finally {
  session.endSession();
}
```

**注意**: 在事务中，如果某个批次失败，整个事务会回滚。

---

## 📊 性能数据

### 基准测试

**测试环境**: MongoDB 5.0, Node.js 18, 本地测试

| 数据量 | 循环 upsertOne | bulkUpsert | 提升倍数 |
|--------|---------------|-----------|---------|
| **100 条** | 83ms | 10ms | **8.3 倍** |
| **1000 条** | 830ms | 50ms | **16.6 倍** |
| **10000 条** | 8300ms | 200ms | **41.5 倍** |
| **50000 条** | 41500ms | 1000ms | **41.5 倍** |

**结论**: 数据量越大，性能提升越明显。

---

### 实际案例

#### 案例 1: 用户数据同步（2500 条）

```javascript
const result = await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 500
});

// 耗时: 4036ms（分 5 个批次）
// 平均: 808ms/批次
// 速度: 620 条/秒
```

---

#### 案例 2: 商品导入（1000 条）

```javascript
const result = await Product.bulkUpsert(products, {
  matchOn: (product) => ({ sku: product.sku }),
  batchSize: 250
});

// 耗时: 551ms（分 4 个批次）
// 平均: 137ms/批次
// 速度: 1814 条/秒
```

---

## 🔄 与其他方法对比

| 方法 | 性能 | 进度监控 | 错误恢复 | 适用场景 |
|------|------|---------|---------|---------|
| **bulkUpsert** | ⭐⭐⭐⭐⭐ | ✅ | ✅ | 大批量数据同步 |
| **循环 upsertOne** | ⭐ | ❌ | ❌ | 少量数据（< 10 条）|
| **insertMany** | ⭐⭐⭐⭐ | ❌ | ❌ | 批量插入（无更新）|
| **bulkWrite** | ⭐⭐⭐⭐ | ❌ | ✅ | 复杂批量操作 |

**核心区别**:
- `bulkUpsert`: **自动分批 + 进度监控**，最适合大批量 upsert
- `insertMany`: 只能插入，不能更新
- `bulkWrite`: 需要手动构建操作，更灵活但更复杂

---

## ⚠️ 注意事项

### 1. matchOn 字段必须有索引

```javascript
// ❌ 避免：matchOn 字段没有索引
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email })  // email 必须有索引
});

// ✅ 推荐：先创建索引
await User.createIndex({ email: 1 }, { unique: true });

await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email })
});
```

**原因**: 没有索引会导致全表扫描，性能极差。

---

### 2. batchSize 不是越大越好

```javascript
// ❌ 避免：batchSize 过大
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 10000  // 太大，可能内存溢出
});

// ✅ 推荐：根据文档大小选择合适的 batchSize
await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email }),
  batchSize: 500-1000  // 适中
});
```

**建议**: 文档越大，batchSize 越小。

---

### 3. 错误不会中止整个操作

```javascript
const result = await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email })
});

if (result.errors.length > 0) {
  console.error(`有 ${result.errors.length} 个批次失败:`);
  result.errors.forEach(err => {
    console.error(`批次 ${err.batch}: ${err.error}`);
  });
  
  // 重试失败的批次
  const failedItems = [];
  result.errors.forEach(err => {
    failedItems.push(...users.slice(err.startIndex, err.endIndex));
  });
  
  console.log(`重试 ${failedItems.length} 条失败记录...`);
  await User.bulkUpsert(failedItems, {
    matchOn: (user) => ({ email: user.email })
  });
}
```

**注意**: 如果在事务中，任何批次失败都会导致整个事务回滚。

---

### 4. 内存占用

```javascript
// ⚠️ 大数据量可能占用大量内存
const users = [/* 100万条 */];  // 可能占用 1GB+ 内存

// ✅ 推荐：分段加载
async function importLargeData() {
  const CHUNK_SIZE = 10000;
  let offset = 0;
  
  while (true) {
    const chunk = await fetchUsersFromAPI(offset, CHUNK_SIZE);
    if (chunk.length === 0) break;
    
    await User.bulkUpsert(chunk, {
      matchOn: (user) => ({ email: user.email }),
      batchSize: 1000
    });
    
    offset += CHUNK_SIZE;
  }
}
```

---

## 📝 完整示例

### 示例 1: CSV 批量导入系统

```javascript
const fs = require('fs');
const csv = require('csv-parser');

async function importFromCSV(filePath, collection, matchOn, options = {}) {
  const items = [];
  
  // 1. 读取 CSV
  console.log('正在读取 CSV 文件...');
  
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => items.push(row))
      .on('end', resolve)
      .on('error', reject);
  });
  
  console.log(`读取到 ${items.length} 条记录`);
  
  // 2. 批量 upsert
  const startTime = Date.now();
  
  const result = await collection.bulkUpsert(items, {
    matchOn,
    batchSize: options.batchSize || 500,
    onProgress: (processed, total, batch, totalBatches) => {
      const percent = ((processed / total) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const speed = Math.floor(processed / elapsed);
      
      process.stdout.write(`\r[${percent}%] ${processed}/${total} (${speed} 条/秒)`);
      
      if (processed === total) {
        console.log('');  // 换行
      }
    }
  });
  
  // 3. 输出结果
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log(`
    ✅ 导入完成
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    总记录数: ${result.totalCount}
    新增记录: ${result.upsertedCount}
    更新记录: ${result.modifiedCount}
    失败批次: ${result.errors.length}
    耗时: ${duration} 秒
    平均速度: ${Math.floor(result.totalCount / duration)} 条/秒
  `);
  
  return result;
}

// 使用
await importFromCSV(
  'users.csv',
  User,
  (user) => ({ email: user.email }),
  { batchSize: 500 }
);
```

---

### 示例 2: API 数据同步系统

```javascript
class DataSyncService {
  async syncUsers(apiUrl, apiKey) {
    console.log('开始同步用户数据...');
    
    // 1. 从 API 获取数据
    const users = await this.fetchAllUsers(apiUrl, apiKey);
    console.log(`获取到 ${users.length} 个用户`);
    
    // 2. 转换数据格式
    const transformedUsers = users.map(user => ({
      externalId: user.id,
      email: user.email,
      name: user.name,
      status: user.active ? 'active' : 'inactive',
      syncedAt: new Date()
    }));
    
    // 3. 批量 upsert
    const result = await User.bulkUpsert(transformedUsers, {
      matchOn: (user) => ({ externalId: user.externalId }),
      batchSize: 500,
      onProgress: (processed, total) => {
        const percent = ((processed / total) * 100).toFixed(1);
        console.log(`同步进度: ${percent}%`);
        
        // 发送 WebSocket 通知
        this.notifyProgress(percent);
      }
    });
    
    // 4. 记录同步日志
    await SyncLog.insertOne({
      type: 'user_sync',
      source: apiUrl,
      totalCount: result.totalCount,
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
      errorCount: result.errors.length,
      timestamp: new Date()
    });
    
    console.log('同步完成:', result);
    return result;
  }
  
  async fetchAllUsers(apiUrl, apiKey) {
    // 分页获取所有用户
    const users = [];
    let page = 1;
    
    while (true) {
      const response = await fetch(`${apiUrl}/users?page=${page}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const data = await response.json();
      users.push(...data.users);
      
      if (data.users.length === 0) break;
      page++;
    }
    
    return users;
  }
}

// 使用
const syncService = new DataSyncService();
await syncService.syncUsers(
  'https://api.example.com',
  'your-api-key'
);
```

---

## 🐛 错误处理

### 常见错误

```javascript
// 1. 缺少 matchOn
try {
  await User.bulkUpsert([/* items */], {});
} catch (err) {
  console.error(err.message);  // "options.matchOn 必须是函数"
}

// 2. 非数组 items
try {
  await User.bulkUpsert('invalid', {
    matchOn: (user) => ({ email: user.email })
  });
} catch (err) {
  console.error(err.message);  // "items 必须是数组"
}

// 3. 批次失败
const result = await User.bulkUpsert(users, {
  matchOn: (user) => ({ email: user.email })
});

if (result.errors.length > 0) {
  console.error('部分批次失败:');
  result.errors.forEach(err => {
    console.error(`批次 ${err.batch} (${err.startIndex}-${err.endIndex}): ${err.error}`);
  });
}
```

---

## 📚 相关文档

- [upsertOne](./upsertOne.md) - 单个文档 upsert
- [insertMany](./insertMany.md) - 批量插入
- [insertBatch](./insertBatch.md) - 分批插入

---

> **文档版本**: v1.2.0  
> **最后更新**: 2024-12-04  
> **维护者**: monSQLize Team

