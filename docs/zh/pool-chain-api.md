# 链式池/库访问 API（Chain Access API）

## 概述

使用这些访问器，可以在同一个 `MonSQLize` 实例中把操作路由到指定连接池或数据库：

| 方法 | 用途 |
|------|------|
| `msq.pool(poolName)` | 切换到指定连接池，返回 `PoolAccessor` |
| `msq.use(dbName)` | 切换数据库（默认连接池），返回 `ScopedAccessor` |
| `msq.scopedCollection(name, opts)` | 底层方法：按 `{pool, database}` 获取 Collection |
| `msq.scopedModel(key, opts)` | 底层方法：按 `{pool, database}` 获取 Model |

典型场景：

```javascript
// 访问主库 billing 数据库的 invoices 集合
const col = msq.use('billing').collection('invoices');

// 访问 cn 连接池 billing 数据库的 invoices 集合
const col = msq.pool('cn').use('billing').collection('invoices');

// 访问 cn 连接池 BillingInvoice Model（connection 配置中已含 database）
const model = msq.pool('cn').model('BillingInvoice');
```

---

## API 总览

```text
msq
 ├── .pool(poolName)          → PoolAccessor
 │    ├── .collection(name)   → Collection（指定池，默认库）
 │    ├── .model(key)         → ModelInstance（指定池）
 │    └── .use(dbName)        → ScopedAccessor（指定池 + 指定库）
 │         ├── .collection(name)
 │         └── .model(key)
 └── .use(dbName)             → ScopedAccessor（默认池 + 指定库）
      ├── .collection(name)
      └── .model(key)
```

---

## pool(poolName)

切换到指定连接池，返回 `PoolAccessor` 纯对象。

```javascript
const accessor = msq.pool('cn');
```

**参数**：
- `poolName` {string} — 构造函数 `pools: PoolConfig[]` 中声明、并在 `connect()` 后可用的连接池名称

**返回值**：`PoolAccessor` — 包含 `collection`、`model`、`use` 三个方法

**异常**：

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_CONNECTED` | 未调用 `connect()` |
| `NO_POOL_MANAGER` | MonSQLize 未配置多连接池（构造函数未传 pools） |
| `POOL_NOT_FOUND` | `poolName` 未在构造函数 `pools[]` 中声明，或对应连接池初始化失败 |

---

### pool().collection()

在指定连接池上获取 Collection（使用该池的默认数据库）。

```javascript
const users = msq.pool('cn').collection('users');
const docs = await users.find({ status: 'active' }).toArray();
```

---

### pool().model()

在指定连接池上获取 Model 实例。若 Model 定义的 `connection.database` 有值，则自动合并该数据库配置。

```javascript
// BillingInvoice 的 definition.connection = { database: 'billing' }
// 实际访问：cn 池 billing 库 invoices 集合
const Invoice = msq.pool('cn').model('BillingInvoice');
const result = await Invoice.find({ status: 'paid' });
```

**异常**：同 `pool()`，另加：

| 错误码 | 触发条件 |
|--------|---------|
| `MODEL_NOT_DEFINED` | `key` 未注册 |

---

### pool().use()

在指定连接池上，进一步切换数据库，返回 `ScopedAccessor`。

```javascript
const accessor = msq.pool('cn').use('billing');
```

---

### pool().use().collection()

指定连接池 + 指定数据库，获取 Collection。

```javascript
const invoices = msq.pool('cn').use('billing').collection('invoices');
const rows = await invoices.find({ month: '2026-04' }).toArray();
```

---

### pool().use().model(key)

指定连接池 + 指定数据库（优先于 Model 定义的 `connection.database`），获取 Model。

```javascript
// 强制使用 analytics 库，而非 BillingInvoice definition 中配置的 billing 库
const Invoice = msq.pool('cn').use('analytics').model('BillingInvoice');
```

---

## use(dbName)

在默认连接池上切换数据库，返回 `ScopedAccessor`。适用于**单池多库**场景。

```javascript
const accessor = msq.use('billing');
```

**参数**：
- `dbName` {string} — 目标数据库名称

**返回值**：`ScopedAccessor` — 包含 `collection`、`model` 两个方法

**异常**：

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_CONNECTED` | 未调用 `connect()` |

---

### use().collection()

在指定数据库上获取 Collection。

```javascript
const logs = msq.use('logs').collection('access_logs');
const today = await logs.find({ date: '2026-04-26' }).toArray();
```

---

### use().model(key)

在指定数据库上获取 Model（覆盖 definition 中的 `connection.database`）。

```javascript
const Invoice = msq.use('billing').model('Invoice');
const list = await Invoice.findPage({ status: 'pending' }, { pageSize: 20 });
```

---

## scopedCollection()

底层方法，直接传递 `{pool, database}` opts 获取 Collection。

```javascript
// 等价于 msq.pool('cn').use('billing').collection('invoices')
const col = msq.scopedCollection('invoices', { pool: 'cn', database: 'billing' });
```

**参数**：
- `collectionName` {string}
- `opts` {object}
  - `pool` {string?} — 连接池名称（不传则用默认池）
  - `database` {string?} — 数据库名称（不传则用默认库）

当 `opts` 为空对象时，等价于 `msq.collection(collectionName)`（向后兼容）。

---

## scopedModel()

底层方法，直接传递 `{pool, database}` opts 获取 Model。

```javascript
const model = msq.scopedModel('BillingInvoice', { pool: 'cn' });
```

**connection 合并语义**：`opts` 字段优先，`definition.connection` 作为 fallback。

```javascript
// BillingInvoice.connection = { database: 'billing' }
// opts = { pool: 'cn' }
// merged = { pool: 'cn', database: 'billing' }   ← opts 补充，definition 填空
const m = msq.scopedModel('BillingInvoice', { pool: 'cn' });

// 强制覆盖：
// opts = { pool: 'cn', database: 'analytics' }
// merged = { pool: 'cn', database: 'analytics' } ← opts 完全覆盖
const m2 = msq.scopedModel('BillingInvoice', { pool: 'cn', database: 'analytics' });
```

**异常**：

| 错误码 | 触发条件 |
|--------|---------|
| `NOT_CONNECTED` | 未调用 `connect()` |
| `MODEL_NOT_DEFINED` | `key` 未注册 |
| `NO_POOL_MANAGER` | 传了 `pool` 但构造函数未配置 `pools[]` |
| `POOL_NOT_FOUND` | `pool` 未在构造函数 `pools[]` 中声明，或初始化失败 |

---

## 链式组合示例

### 单池多库

```javascript
const msq = new MonSQLize({ uri: 'mongodb://localhost:27017' });
await msq.connect();

// 访问 billing 库
const invoices = await msq.use('billing').collection('invoices').find({}).toArray();

// 访问 analytics 库
const report = await msq.use('analytics').collection('monthly').findOne({ month: '2026-04' });
```

### 多池多库

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'main',
  config: { uri: 'mongodb://primary:27017' },
  pools: [
    { name: 'cn', uri: 'mongodb://cn-server:27017/main', role: 'primary' },
    { name: 'eu', uri: 'mongodb://eu-server:27017/main', role: 'primary' },
  ]
});
await msq.connect();

// cn 池 billing 库
const cnInvoices = await msq.pool('cn').use('billing').collection('invoices').find({}).toArray();

// eu 池 billing 库
const euInvoices = await msq.pool('eu').use('billing').collection('invoices').find({}).toArray();
```

### 配合 Model

```javascript
// Model 定义（definition.connection 已设置 database）
// file: models/billing/invoice.model.js
module.exports = {
  name: 'Invoice',
  collection: 'invoices',
  key: 'BillingInvoice',
  connection: { database: 'billing' },
  schema: { ... }
};

// 使用（无需重复指定 database）
const cnInvoice = msq.pool('cn').model('BillingInvoice');
const result = await cnInvoice.find({ status: 'paid' });

// 用 key 别名快速访问（单池）
const Invoice = msq.scopedModel('BillingInvoice');
```

---

## 错误处理

```javascript
import { ErrorCodes } from 'monsqlize';

try {
  const accessor = msq.pool('missing-pool');
} catch (err) {
  if (err.code === 'NO_POOL_MANAGER') {
    console.error('未配置多连接池，请在构造函数中传入 pools 配置');
  } else if (err.code === 'POOL_NOT_FOUND') {
    console.error(`连接池不存在，可用连接池：${err.available.join(', ')}`);
  }
}
```

`POOL_NOT_FOUND` 错误包含 `err.available` 字段，列出当前所有可用连接池名称。

---

## 如何选择访问方式

| 需求 | 使用方式 |
|------|----------|
| 默认池默认库的 Collection | `msq.collection('users')` |
| 默认池切换数据库 | `msq.use('billing').collection('invoices')` |
| 切换连接池 | `msq.pool('cn').collection('users')` |
| 切换连接池和数据库 | `msq.pool('cn').use('billing').collection('invoices')` |
| 指定连接池上的 Model | `msq.pool('cn').model('BillingInvoice')` |

---

## TypeScript 类型

```typescript
interface ScopedAccessor {
  collection(name: string): Collection;
  model(key: string): ModelInstance;
}

interface PoolAccessor {
  collection(name: string): Collection;
  model(key: string): ModelInstance;
  use(dbName: string): ScopedAccessor;
}

class MonSQLize {
  pool(poolName: string): PoolAccessor;
  use(dbName: string): ScopedAccessor;
  scopedCollection(name: string, opts?: { pool?: string; database?: string }): Collection;
  scopedModel(key: string, opts?: { pool?: string; database?: string }): ModelInstance;
}
```

详见 [types/index.d.ts](../../types/index.d.ts)。

---

## 相关文档

- [连接池配置](./multi-pool.md)
- [Model 层文档](./model.md)
- [错误码参考](./error-codes.md)
- [连接配置](./connection.md)
