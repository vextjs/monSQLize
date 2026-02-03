# 连接管理文档

## 📑 目录

- [概述](#概述)
- [核心特性](#核心特性)
- [连接管理 API](#连接管理-api)
  - [connect()](#connect)
  - [collection()](#collection)
  - [db()](#db)
  - [close()](#close)
- [跨库访问](#跨库访问)
- [错误处理](#错误处理)
- [最佳实践](#最佳实践)
  - [1. 连接复用](#1-连接复用)
  - [2. 资源管理](#2-资源管理)
  - [3. 连接失败重试](#3-连接失败重试)
  - [4. 单元测试中的连接管理](#4-单元测试中的连接管理)
- [配置选项](#配置选项)
  - [完整配置示例](#完整配置示例)
  - [配置分类说明](#配置分类说明)
  - [常用配置场景](#常用配置场景)
  - [配置验证](#配置验证)
  - [环境变量配置](#环境变量配置)
  - [配置优先级](#配置优先级)
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

**重要说明**：`db()` 函数本身不会立即验证参数，它只是返回一个包含 `collection()` 方法的对象。参数验证只在调用 `db().collection()` 时才会触发。

**验证规则**：
- 如果提供了 `databaseName`，必须是非空字符串
- **允许** `null` 或 `undefined`（会使用默认数据库）
- **不允许**空字符串或纯空格字符串

```javascript
const { db } = await msq.connect();

// ✅ 正常使用
const shopDb = db('shop');
const analyticsDb = db('analytics');

// ✅ 使用默认数据库（合法）
const defaultDb1 = db(null);           // 合法：使用默认数据库
const defaultDb2 = db(undefined);      // 合法：使用默认数据库

// 验证可以正常获取集合
const shopOrders = shopDb.collection('orders');
const analyticsEvents = analyticsDb.collection('events');

// ❌ 无效参数（会抛出错误）
// 注意：db() 本身不会验证，需要调用 collection() 才会触发验证
try {
  db('').collection('test');        // 错误：INVALID_DATABASE_NAME - 空字符串
  db('   ').collection('test');     // 错误：INVALID_DATABASE_NAME - 纯空格
} catch (err) {
  console.error(err.code, err.message);
  // 输出: INVALID_DATABASE_NAME Database name must be a non-empty string or null/undefined.
}

// ✅ null 和 undefined 是合法的
try {
  const users1 = db(null).collection('users');       // ✅ 使用默认数据库
  const users2 = db(undefined).collection('users');  // ✅ 使用默认数据库
  console.log('✅ 使用默认数据库成功');
} catch (err) {
  // 不会抛出错误
}
```

#### 错误信息

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `INVALID_COLLECTION_NAME` | 集合名无效 | `collection('')` |
| `INVALID_DATABASE_NAME` | 数据库名无效（空字符串或纯空格） | `db('').collection('test')` |

**注意**：
- `db(null)` 和 `db(undefined)` **不会**抛出错误，它们是合法的用法
- 这些参数会使用创建 MonSQLize 实例时指定的默认数据库名
- 只有空字符串 `''` 和纯空格字符串 `'   '` 才会触发验证错误

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
  // 无效的数据库名（空字符串）
  // 注意：db() 本身不验证，需要调用 collection() 才会触发验证
  const otherDb = db('').collection('users');
} catch (err) {
  if (err.code === 'INVALID_DATABASE_NAME') {
    console.error('数据库名无效:', err.message);
    console.log('请提供有效的数据库名（或使用 null/undefined 表示默认数据库）');
  }
}

// ✅ 正确用法：使用 null 或 undefined 表示默认数据库
const defaultDb = db(null).collection('users');  // 合法
const defaultDb2 = db(undefined).collection('users');  // 合法
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
      config: { useMemoryServer: true }
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

monSQLize 提供了丰富的配置选项，满足不同场景的需求。

### 完整配置示例

```javascript
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  // ========================================
  // 基础配置（必需）
  // ========================================
  type: 'mongodb',                    // 数据库类型（目前仅支持 mongodb）【必需】
  databaseName: 'myapp',              // 默认数据库名【必需】
  
  config: {
    uri: 'mongodb://localhost:27017', // MongoDB 连接字符串【必需】
    options: {                         // MongoDB 客户端选项【可选】
      maxPoolSize: 10,                // 连接池最大连接数【默认: 10】
      minPoolSize: 2,                 // 连接池最小连接数【默认: 2】
      serverSelectionTimeoutMS: 5000, // 服务器选择超时【默认: 30000】
      socketTimeoutMS: 45000,         // Socket 超时【默认: 360000】
      family: 4                       // IP 版本（4 或 6）【默认: 4】
    }
  },
  
  // ========================================
  // 查询默认配置
  // ========================================
  maxTimeMS: 3000,                    // 全局查询超时时间（毫秒），默认 2000
  findLimit: 20,                      // find 默认 limit，默认 10
  slowQueryMs: 500,                   // 慢查询阈值（毫秒），默认 500
  
  // ========================================
  // 深分页配置
  // ========================================
  findPageMaxLimit: 500,              // findPage 最大 limit【默认: 500】
  cursorSecret: 'your-secret-key',    // 游标加密密钥【默认: undefined，建议设置】
  
  // ========================================
  // 缓存配置
  // ========================================
  cache: {
    type: 'memory',                   // 缓存类型: 'memory' | 'redis'【默认: 'memory'】
    maxSize: 100000,                  // 最大缓存条目数【默认: 100000】
    maxAge: 3600000,                  // 默认缓存时长（毫秒）【默认: 3600000 (1小时)】
    enableStats: true,                // 启用统计信息【默认: true】
    
    // Redis 缓存配置（当 type='redis' 时）
    redis: {
      host: 'localhost',              // Redis 主机【默认: 'localhost'】
      port: 6379,                     // Redis 端口【默认: 6379】
      password: 'your-password',      // Redis 密码【默认: undefined】
      db: 0,                          // Redis 数据库【默认: 0】
      keyPrefix: 'monsqlize:'         // 键前缀【默认: 'monsqlize:'】
    },
    
    // 分布式缓存失效配置
    distributed: {
      enabled: true,                  // 启用分布式缓存失效【默认: false】
      redis: { /* Redis 配置 */ },
      channel: 'cache:invalidate'     // Redis 发布/订阅频道【默认: 'monsqlize:cache:invalidate'】
    }
  },
  
  // ========================================
  // 命名空间配置（用于缓存隔离）
  // ========================================
  namespace: {
    scope: 'database',                // 'global' | 'database' | 'collection'【默认: 'database'】
    instanceId: 'server-01'           // 实例 ID【默认: undefined】
  },
  
  // ========================================
  // Count 队列配置（高并发控制）
  // ========================================
  countQueue: {
    enabled: true,                    // 启用 count 队列，默认 true
    concurrency: 8,                   // 并发数，默认 CPU 核心数
    maxQueueSize: 10000,              // 最大队列长度，默认 10000
    timeout: 60000                    // 超时时间（毫秒），默认 60000
  },
  
  // ========================================
  // 多连接池配置（v1.0.8+）
  // ========================================
  pools: {                            // 多连接池配置【默认: undefined (单连接池模式)】
    primary: {
      uri: 'mongodb://localhost:27017',
      options: { maxPoolSize: 10 }
    },
    secondary: {
      uri: 'mongodb://secondary:27017',
      options: { maxPoolSize: 5 }
    },
    analytics: {
      uri: 'mongodb://analytics:27017',
      options: { maxPoolSize: 3 }
    }
  },
  poolStrategy: 'auto',               // 'auto' | 'manual'【默认: 'auto'】
  poolFallback: true,                 // 主池失败时是否降级【默认: false】
  maxPoolsCount: 5,                   // 最大连接池数量【默认: 10】
  
  // ========================================
  // ObjectId 自动转换配置（v1.3.0+）
  // ========================================
  autoConvertObjectId: {
    enabled: true,                    // 启用自动转换【默认: true】
    mode: 'auto',                     // 'auto' | 'strict' | 'disabled'【默认: 'auto'】
    fields: ['_id', 'userId'],        // 需要转换的字段列表【默认: undefined (转换所有)】
  },
  
  // ========================================
  // 日志配置
  // ========================================
  logger: {
    level: 'info',                    // 日志级别: 'debug' | 'info' | 'warn' | 'error'【默认: 'info'】
    enabled: true,                    // 是否启用日志【默认: true】
    
    // 自定义日志处理器【默认: console.log】
    handler: (level, message, meta) => {
      console.log(`[${level}]`, message, meta);
    }
  },
  
  // ========================================
  // 慢查询日志配置
  // ========================================
  log: {
    slowQueryTag: {
      event: 'slow_query',            // 慢查询事件名称【默认: 'slow_query'】
      code: 'SLOW_QUERY'              // 慢查询错误码【默认: 'SLOW_QUERY'】
    }
  },
  
  // ========================================
  // 慢查询日志持久化存储配置（v1.3.1+）
  // ========================================
  slowQueryLog: {
    enabled: true,                    // 启用持久化存储【默认: false】
    storage: 'mongodb',               // 存储类型: 'mongodb' | 'file'【默认: 'mongodb'】
    collection: 'slow_queries',       // MongoDB 集合名【默认: 'slow_queries'】
    databaseName: 'logs',             // 数据库名【默认: 当前数据库】
    
    // 文件存储配置（当 storage='file' 时）
    file: {
      path: './logs/slow-queries.log',  // 日志文件路径【必需】
      maxSize: '10M',                 // 单个文件最大大小【默认: '10M'】
      maxFiles: 5                     // 最多保留文件数【默认: 5】
    },
    
    // 过滤器【默认: undefined (记录所有)】
    filter: (query) => {
      return query.duration > 1000;   // 只记录 > 1秒的查询
    }
  },
  
  // ========================================
  // Model 自动加载配置（v1.4.0+）
  // ========================================
  models: {
    enabled: true,                    // 启用 Model 自动加载【默认: false】
    dir: './models',                  // Model 文件目录【默认: './models'】
    pattern: '**/*.js',               // 文件匹配模式【默认: '**/*.js'】
    
    // 自定义加载器【默认: require】
    loader: (filePath) => {
      return require(filePath);
    }
  },
  
  // ========================================
  // 数据同步配置（v1.0.9+）
  // ========================================
  sync: {
    enabled: true,                    // 启用 Change Stream 同步【默认: false】
    collections: ['users', 'orders'], // 监听的集合列表【必需】
    
    // 同步目标配置
    target: {
      type: 'mongodb',                // 目标类型【默认: 'mongodb'】
      uri: 'mongodb://backup:27017',  // 目标 URI【必需】
      databaseName: 'backup'          // 目标数据库【必需】
    },
    
    // Resume Token 配置
    resumeToken: {
      storage: 'mongodb',             // 'mongodb' | 'redis' | 'memory'【默认: 'mongodb'】
      collection: 'resume_tokens'     // Token 集合名【默认: 'resume_tokens'】
    }
  },
  
  // ========================================
  // SSH 隧道配置（企业级功能）
  // ========================================
  sshTunnel: {
    enabled: true,                    // 启用 SSH 隧道【默认: false】
    host: 'jump-server.example.com',  // SSH 服务器地址【必需】
    port: 22,                         // SSH 端口【默认: 22】
    username: 'user',                 // SSH 用户名【必需】
    
    // 认证方式 1: 密码【password 和 privateKey 二选一】
    password: 'your-password',
    
    // 认证方式 2: 私钥（推荐）
    privateKey: require('fs').readFileSync('/path/to/private-key'),
    passphrase: 'key-passphrase',    // 私钥密码【默认: undefined】
    
    // 目标 MongoDB 服务器（隧道另一端）
    dstHost: 'mongodb.internal',     // 内网 MongoDB 地址【必需】
    dstPort: 27017                   // 内网 MongoDB 端口【默认: 27017】
  },
  
  // ========================================
  // 业务级分布式锁配置（企业级功能）
  // ========================================
  businessLock: {
    enabled: true,                    // 启用业务锁【默认: false】
    redis: {                          // Redis 配置【必需】
      host: 'localhost',              // Redis 主机【默认: 'localhost'】
      port: 6379,                     // Redis 端口【默认: 6379】
      password: 'your-password'       // Redis 密码【默认: undefined】
    },
    keyPrefix: 'lock:',              // 锁键前缀【默认: 'business:lock:'】
    defaultTTL: 30000,               // 默认锁超时时间（毫秒）【默认: 30000】
    retryDelay: 100,                 // 重试延迟（毫秒）【默认: 100】
    retryTimes: 10                   // 最大重试次数【默认: 3】
  }
});
```

### 配置分类说明

#### 1. 基础配置（必需）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `type` | string | 'mongodb' | 数据库类型，目前仅支持 'mongodb' |
| `databaseName` | string | - | 默认数据库名 |
| `config.uri` | string | - | MongoDB 连接字符串 |
| `config.options` | object | - | MongoDB 客户端配置选项 |

#### 2. 查询默认配置

| 配置项 | 类型 | 默认值 | 范围 | 说明 |
|--------|------|--------|------|------|
| `maxTimeMS` | number | 2000 | 1-300000 | 全局查询超时时间（毫秒） |
| `findLimit` | number | 10 | 1-10000 | find 查询默认 limit |
| `findPageMaxLimit` | number | 500 | 1-10000 | findPage 最大 limit |
| `slowQueryMs` | number | 500 | 0-60000 | 慢查询阈值（毫秒），-1 禁用 |

#### 3. 缓存配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `cache.type` | string | 'memory' | 缓存类型: 'memory' 或 'redis' |
| `cache.maxSize` | number | 100000 | 内存缓存最大条目数 |
| `cache.maxAge` | number | 3600000 | 默认缓存时长（毫秒） |
| `cache.enableStats` | boolean | true | 启用缓存统计信息 |
| `cache.redis` | object | - | Redis 连接配置 |
| `cache.distributed.enabled` | boolean | false | 启用分布式缓存失效 |

#### 4. 高级配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `namespace` | object | {scope:'database'} | 命名空间配置（缓存隔离） |
| `countQueue` | object | {enabled:true} | Count 队列配置 |
| `pools` | object | - | 多连接池配置 |
| `autoConvertObjectId` | object | {enabled:true} | ObjectId 自动转换 |
| `logger` | object | - | 日志配置 |
| `slowQueryLog` | object | - | 慢查询日志持久化 |
| `models` | object | - | Model 自动加载 |
| `sync` | object | - | Change Stream 同步 |
| `sshTunnel` | object | - | SSH 隧道配置（企业级） |
| `businessLock` | object | - | 业务级分布式锁（企业级） |

### 常用配置场景

#### 场景 1: 生产环境配置

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'production',
  config: {
    uri: process.env.MONGO_URI,
    options: {
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000
    }
  },
  
  // 性能优化
  maxTimeMS: 5000,
  findLimit: 20,
  slowQueryMs: 1000,
  
  // 启用缓存
  cache: {
    type: 'redis',
    redis: {
      host: process.env.REDIS_HOST,
      port: 6379,
      password: process.env.REDIS_PASSWORD
    },
    distributed: { enabled: true }
  },
  
  // 日志配置
  logger: { level: 'warn' },
  slowQueryLog: { enabled: true }
});
```

#### 场景 2: 开发环境配置

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'dev',
  config: { uri: 'mongodb://localhost:27017' },
  
  // 调试配置
  logger: { level: 'debug' },
  slowQueryMs: 100,  // 更低的慢查询阈值
  
  // 简单的内存缓存
  cache: { type: 'memory', maxSize: 10000 }
});
```

#### 场景 3: 测试环境配置

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'test',
  config: { useMemoryServer: true },  // 使用内存数据库进行测试
  
  // 禁用缓存（测试数据一致性）
  cache: false,
  
  // 禁用慢查询日志（减少噪音）
  slowQueryMs: -1,
  
  // 快速超时
  maxTimeMS: 1000
});
```

### 配置验证

某些配置项有范围限制，超出范围会抛出错误：

| 配置项 | 最小值 | 最大值 | 错误提示 |
|--------|--------|--------|----------|
| `maxTimeMS` | 1 | 300000 | maxTimeMS must be between 1 and 300000 |
| `findLimit` | 1 | 10000 | findLimit must be between 1 and 10000 |
| `findPageMaxLimit` | 1 | 10000 | findPageMaxLimit must be between 1 and 10000 |
| `slowQueryMs` | 0 | 60000 | slowQueryMs must be between 0 and 60000 |

### 环境变量配置

推荐使用环境变量管理敏感配置：

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: process.env.MONGO_DATABASE,
  config: {
    uri: process.env.MONGO_URI
  },
  cache: {
    type: 'redis',
    redis: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD
    }
  },
  cursorSecret: process.env.CURSOR_SECRET
});
```

### 配置优先级

配置的优先级从高到低：

1. **方法调用时的参数** - `collection.find({}, { maxTimeMS: 5000 })`
2. **实例配置** - `new MonSQLize({ maxTimeMS: 3000 })`
3. **默认配置** - 库内置的默认值

```javascript
// 默认: 2000ms
const msq = new MonSQLize({ maxTimeMS: 3000 });  // 实例级: 3000ms

// 这个查询使用 5000ms（方法级优先）
await collection.find({}, { maxTimeMS: 5000 });

// 这个查询使用 3000ms（实例级）
await collection.find({});
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


