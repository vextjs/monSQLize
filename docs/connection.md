# 连接管理文档

## 📑 目录

- [概述](#概述)
- [核心特性](#核心特性)
- [连接管理 API](#连接管理-api)
- [跨库访问](#跨库访问)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)
- [配置选项](#配置选项)
- [常见问题](#常见问题)
- [参考资料](#参考资料)

---

## 概述

monSQLize 提供了完善的数据库连接管理功能，包括并发连接保护、参数验证、资源清理等。本文档详细说明连接管理的各个方面。

## 核心特性

- ✅ **并发连接保护**：确保高并发场景下只建立一个连接
- ✅ **参数验证**：集合名和数据库名自动校验
- ✅ **资源清理**：正确释放所有资源，防止内存泄漏
- ✅ **错误处理**：连接失败自动清理锁状态
- ✅ **跨库访问**：支持访问不同数据库的集合

---

## 连接管理 API

### connect()

建立数据库连接。支持并发调用，确保只建立一个连接。

#### 方法签名

```javascript
async connect()
```

#### 返回值

```javascript
{
  db: Function,              // 数据库访问函数
  collection: Function,      // 集合访问函数（当前数据库）
  _client: MongoClient,      // 原生 MongoDB 客户端
  _iid: String              // 实例 ID
}
```

#### 使用示例

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

// 连接数据库
const { db, collection } = await msq.connect();

// 使用集合访问器
const users = collection('users');
const products = collection('products');

// 跨库访问
const analyticsEvents = db('analytics').collection('events');
```

---

### 并发连接保护

`connect()` 方法内置并发锁机制，确保高并发场景下只建立一个连接。

#### 工作原理

1. **首次调用**：建立连接，缓存 Promise
2. **并发调用**：等待同一个 Promise，不会重复连接
3. **连接完成**：清理锁状态，返回连接对象
4. **连接失败**：清理锁状态，抛出错误

#### 高并发场景示例

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' }
});

// 高并发场景：10 个并发请求
const promises = Array(10).fill(null).map(() => msq.connect());
const results = await Promise.all(promises);

// 所有请求返回同一个连接对象
console.log(results[0] === results[1]);  // true
console.log(results[0] === results[9]);  // true
console.log('✅ 只建立了一个连接');
```

#### 并发保护的优势

- ✅ 避免连接池耗尽
- ✅ 减少连接开销
- ✅ 防止资源浪费
- ✅ 提高系统稳定性

---

### 参数验证

`collection()` 和 `db()` 方法内置参数校验，确保接收合法参数。

#### collection() 验证

**验证规则**：
- 必须是非空字符串
- 不允许 `null`、`undefined`、空字符串、纯空格
- 不允许数字、对象等其他类型

```javascript
const { collection } = await msq.connect();

// ✅ 正常使用
const users = collection('users');
const orders = collection('my-orders');

// ❌ 无效参数（会抛出错误）
try {
  collection('');           // 错误：INVALID_COLLECTION_NAME - 空字符串
  collection('   ');        // 错误：INVALID_COLLECTION_NAME - 纯空格
  collection(null);         // 错误：INVALID_COLLECTION_NAME - null
  collection(undefined);    // 错误：INVALID_COLLECTION_NAME - undefined
  collection(123);          // 错误：INVALID_COLLECTION_NAME - 数字
  collection({ name: 'test' }); // 错误：INVALID_COLLECTION_NAME - 对象
} catch (err) {
  console.error(err.code, err.message);
  // 输出: INVALID_COLLECTION_NAME 集合名必须是非空字符串
}
```

#### db() 验证

**验证规则**：
- 必须是非空字符串
- 不允许 `null`、`undefined`、空字符串、纯空格

```javascript
const { db } = await msq.connect();

// ✅ 正常使用
const shopDb = db('shop');
const analyticsDb = db('analytics');

// ❌ 无效参数（会抛出错误）
try {
  db('');               // 错误：INVALID_DATABASE_NAME - 空字符串
  db(null);             // 错误：INVALID_DATABASE_NAME - null
  db(undefined);        // 错误：INVALID_DATABASE_NAME - undefined
} catch (err) {
  console.error(err.code, err.message);
  // 输出: INVALID_DATABASE_NAME 数据库名必须是非空字符串
}
```

#### 错误信息

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `INVALID_COLLECTION_NAME` | 集合名无效 | `collection('')` |
| `INVALID_DATABASE_NAME` | 数据库名无效 | `db(null)` |

---

### close()

关闭数据库连接，正确清理所有资源。

#### 方法签名

```javascript
async close()
```

#### 清理内容

- ✅ 关闭 MongoDB 客户端连接
- ✅ 清理实例 ID 缓存（`_iidCache`）
- ✅ 清理连接锁（`_connecting`）
- ✅ 释放所有内部引用

#### 使用示例

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' }
});

// 连接
const { collection } = await msq.connect();

// 使用连接...
await collection('test').find({ query: {} });

// 关闭连接
await msq.close();
console.log('✅ 连接已关闭，资源已清理');
```

#### 多次连接-关闭循环

```javascript
// 多次连接-关闭循环（安全）
for (let i = 0; i < 5; i++) {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' }
  });
  
  await msq.connect();
  const { collection } = await msq.connect();
  
  // 使用连接...
  await collection('test').find({ query: {} });
  
  // 关闭连接
  await msq.close();
  console.log(`第 ${i + 1} 次循环完成`);
}
console.log('✅ 所有循环完成，内存已正确清理');
```

#### 注意事项

- 多次调用 `close()` 是安全的，不会抛出错误
- 关闭后再调用 `connect()` 会重新建立连接
- 建议在应用关闭时调用 `close()` 释放资源
- 单元测试中应在 `afterEach` 或 `after` 钩子中关闭连接

---

## 跨库访问

monSQLize 支持访问不同数据库的集合，无需创建多个实例。

### 访问其他数据库

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',  // 默认数据库
  config: { uri: 'mongodb://localhost:27017' }
});

const { db, collection } = await msq.connect();

// 1. 访问默认数据库的集合
const products = await collection('products').find({ query: {} });
console.log('shop.products ->', products);

// 2. 访问其他数据库的集合
const analyticsEvents = await db('analytics').collection('events').findOne({
  query: { type: 'click' },
  cache: 3000,
  maxTimeMS: 1500
});
console.log('analytics.events ->', analyticsEvents);

// 3. 多次跨库查询
const [user1, user2] = await Promise.all([
  db('users_db').collection('users').findOne({ query: { name: 'Alice' }, cache: 2000 }),
  db('users_db').collection('users').findOne({ query: { name: 'Bob' } })
]);
console.log(user1, user2);
```

### 跨库访问注意事项

- 所有跨库访问共享同一个 MongoDB 客户端连接
- 缓存键包含数据库名，不同数据库的相同集合有独立缓存
- 跨库查询的配置（maxTimeMS、cache 等）与主数据库配置独立
- 支持在跨库查询中使用所有 monSQLize 功能（缓存、慢查询日志等）

---

## 错误处理

### 连接失败

```javascript
const MonSQLize = require('monsqlize');

try {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://invalid-host:27017' }
  });
  
  await msq.connect();
} catch (err) {
  // 连接失败错误
  console.error('连接失败:', err.message);
  
  // ✅ 连接锁已自动清理，可以安全重试
  console.log('可以重新尝试连接');
}
```

### 参数验证失败

```javascript
const { collection, db } = await msq.connect();

try {
  // 无效的集合名
  const users = collection('');
} catch (err) {
  if (err.code === 'INVALID_COLLECTION_NAME') {
    console.error('集合名无效:', err.message);
    console.log('请提供有效的集合名');
  }
}

try {
  // 无效的数据库名
  const otherDb = db(null);
} catch (err) {
  if (err.code === 'INVALID_DATABASE_NAME') {
    console.error('数据库名无效:', err.message);
    console.log('请提供有效的数据库名');
  }
}
```

---

## 最佳实践

### 1. 单例模式

```javascript
// db-connection.js
const MonSQLize = require('monsqlize');

let msqInstance = null;

async function getConnection() {
  if (!msqInstance) {
    msqInstance = new MonSQLize({
      type: 'mongodb',
      databaseName: process.env.DB_NAME || 'shop',
      config: { uri: process.env.MONGODB_URI }
    });
  }
  
  return await msqInstance.connect();
}

async function closeConnection() {
  if (msqInstance) {
    await msqInstance.close();
    msqInstance = null;
  }
}

module.exports = { getConnection, closeConnection };
```

```javascript
// 使用单例
const { getConnection } = require('./db-connection');

async function queryUsers() {
  const { collection } = await getConnection();
  return await collection('users').find({ query: {} });
}
```

### 2. 应用生命周期管理

```javascript
const MonSQLize = require('monsqlize');

class Application {
  constructor() {
    this.msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'shop',
      config: { uri: process.env.MONGODB_URI }
    });
  }
  
  async start() {
    console.log('🚀 启动应用...');
    
    // 建立连接
    const { collection } = await this.msq.connect();
    this.collection = collection;
    
    console.log('✅ 数据库连接成功');
  }
  
  async stop() {
    console.log('🛑 停止应用...');
    
    // 关闭连接
    await this.msq.close();
    
    console.log('✅ 数据库连接已关闭');
  }
}

// 使用
const app = new Application();

async function main() {
  await app.start();
  
  // 应用运行...
  
  // 优雅关闭
  process.on('SIGINT', async () => {
    await app.stop();
    process.exit(0);
  });
}

main();
```

### 3. 错误重试

```javascript
async function connectWithRetry(maxRetries = 3, delay = 1000) {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'shop',
    config: { uri: process.env.MONGODB_URI }
  });
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await msq.connect();
      console.log('✅ 连接成功');
      return msq;
    } catch (err) {
      console.error(`连接失败 (${i + 1}/${maxRetries}):`, err.message);
      
      if (i < maxRetries - 1) {
        console.log(`等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error('连接失败，已达到最大重试次数');
      }
    }
  }
}
```

### 4. 单元测试中的连接管理

```javascript
const { describe, it, before, after } = require('mocha');
const MonSQLize = require('monsqlize');

describe('用户服务测试', () => {
  let msq;
  let collection;
  
  before(async () => {
    // 测试前建立连接
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test',
      config: { uri: 'mongodb://localhost:27017' }
    });
    
    const conn = await msq.connect();
    collection = conn.collection;
  });
  
  after(async () => {
    // 测试后关闭连接
    await msq.close();
  });
  
  it('应该查询用户', async () => {
    const users = await collection('users').find({ query: {} });
    console.log('找到用户:', users.length);
  });
});
```

---

## 配置选项

### MonSQLize 构造函数参数

```javascript
const msq = new MonSQLize({
  type: 'mongodb',               // 数据库类型（目前仅支持 mongodb）
  databaseName: 'shop',          // 默认数据库名
  config: {
    uri: 'mongodb://localhost:27017',  // MongoDB 连接字符串
    options: {                    // MongoDB 客户端选项（可选）
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000
    }
  },
  
  // 全局默认配置
  maxTimeMS: 3000,                // 全局查询超时（毫秒）
  findLimit: 10,                  // find 默认 limit
  slowQueryMs: 500,               // 慢查询阈值（毫秒）
  
  // 缓存配置
  cache: {
    maxSize: 100000,              // 最大缓存条目数
    enableStats: true             // 启用统计
  },
  
  // Bookmark 配置
  bookmarks: {
    step: 10,                     // 书签步长
    maxHops: 20,                  // 最大跳跃次数
    ttlMs: 6 * 3600000,           // 缓存 6 小时
    maxPages: 10000               // 最多缓存 10000 页
  }
});
```

---

## 常见问题

### Q: 如何确保只建立一个连接？

**A**: `connect()` 方法内置并发锁机制，无论调用多少次，都只建立一个连接。

```javascript
const msq = new MonSQLize({ /* ... */ });

// 并发调用，但只建立一个连接
const [conn1, conn2, conn3] = await Promise.all([
  msq.connect(),
  msq.connect(),
  msq.connect()
]);

console.log(conn1 === conn2);  // true
```

### Q: 什么时候需要调用 close()？

**A**: 以下场景建议调用 `close()`：
- 应用关闭时
- 单元测试后清理
- 长时间不使用连接时
- 多次连接-关闭循环测试

### Q: 跨库访问会建立多个连接吗？

**A**: 不会。所有跨库访问共享同一个 MongoDB 客户端连接，只是访问不同的数据库。

```javascript
const { db } = await msq.connect();

// 这三个操作共享同一个连接
await db('shop').collection('products').find({ query: {} });
await db('analytics').collection('events').find({ query: {} });
await db('logs').collection('errors').find({ query: {} });
```

### Q: 连接失败后如何重试？

**A**: 连接失败后，`_connecting` 锁会自动清理，可以安全重试：

```javascript
async function connectWithRetry() {
  const msq = new MonSQLize({ /* ... */ });
  
  while (true) {
    try {
      await msq.connect();
      return msq;
    } catch (err) {
      console.error('连接失败，3秒后重试...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
```

---

## 参考资料

- [MongoDB Node.js 驱动文档](https://docs.mongodb.com/drivers/node/)
- [连接字符串格式](https://docs.mongodb.com/manual/reference/connection-string/)
- [连接池配置](https://docs.mongodb.com/manual/reference/connection-string/#connection-pool-options)
- [monSQLize README](../README.md)
