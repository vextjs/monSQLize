# Chain pool/database access API (Chain Access API)

## Overview

Use these accessors to route work to a specific connection pool or database from the same `MonSQLize` instance:

| Method | Purpose |
|------|------|
| `msq.pool(poolName)` | Switch to the specified connection pool and return `PoolAccessor` |
| `msq.use(dbName)` | Switch database (default connection pool), return `ScopedAccessor` |
| `msq.scopedCollection(name, opts)` | Low-level method: get a Collection by `{ pool, database }` |
| `msq.scopedModel(key, opts)` | Low-level method: get a Model by `{ pool, database }` |

Typical scenario:

```javascript
// Access the invoices collection in the main billing database
const col = msq.use('billing').collection('invoices');

// Access the invoices collection in the billing database on the cn pool
const col = msq.pool('cn').use('billing').collection('invoices');

// Access the BillingInvoice Model on the cn pool (database is included in the connection configuration)
const model = msq.pool('cn').model('BillingInvoice');
```

---

## API Overview

```text
msq
 ├── .pool(poolName)          → PoolAccessor
│ ├── .collection(name) → Collection (specified pool, default database)
│ ├── .model(key) → ModelInstance (specified pool)
│ └── .use(dbName) → ScopedAccessor (specified pool + specified database)
 │         ├── .collection(name)
 │         └── .model(key)
└── .use(dbName) → ScopedAccessor (default pool + specified database)
      ├── .collection(name)
      └── .model(key)
```

---

## pool(poolName)

Switch to the specified connection pool and return the `PoolAccessor` pure object.

```javascript
const accessor = msq.pool('cn');
```

**Parameters**:
- `poolName` {string} — The connection pool name declared in the constructor `pools: PoolConfig[]` and made available after `connect()`

**Return value**: `PoolAccessor` — includes three methods: `collection`, `model`, and `use`

**Exception**:

| Error code | Trigger condition |
|--------|---------|
| `NOT_CONNECTED` | `connect()` not called |
| `NO_POOL_MANAGER` | MonSQLize is not configured with multiple connection pools (the constructor does not pass pools) |
| `POOL_NOT_FOUND` | `poolName` is not declared in constructor `pools[]` or the corresponding pool failed to initialize |

---

## pool().collection()

Gets a Collection on the specified connection pool (using the pool's default database).

```javascript
const users = msq.pool('cn').collection('users');
const docs = await users.find({ status: 'active' }).toArray();
```

---

## pool().model()

Get a Model instance on the specified connection pool. If the `connection.database` defined by the Model has a value, the database configuration will be automatically merged.

```javascript
// BillingInvoice definition.connection = { database: 'billing' }
// Actual access: the invoices collection in the billing database on the cn pool
const Invoice = msq.pool('cn').model('BillingInvoice');
const result = await Invoice.find({ status: 'paid' });
```

**Exception**: Same as `pool()`, plus:

| Error code | Trigger condition |
|--------|---------|
| `MODEL_NOT_DEFINED` | `key` is not registered |

---

## pool().use()

On the specified connection pool, further switch the database and return `ScopedAccessor`.

```javascript
const accessor = msq.pool('cn').use('billing');
```

---

## pool().use().collection()

Specify the connection pool and database to obtain the Collection.

```javascript
const invoices = msq.pool('cn').use('billing').collection('invoices');
const rows = await invoices.find({ month: '2026-04' }).toArray();
```

---

## pool().use().model(key)

Specify the connection pool and database (prioritizing `connection.database` defined by the Model) to obtain the Model.

```javascript
// Force the analytics database instead of the billing database configured in the BillingInvoice definition
const Invoice = msq.pool('cn').use('analytics').model('BillingInvoice');
```

---

## use(dbName)

Switch databases on the default connection pool and return `ScopedAccessor`. This is useful for **single-pool, multi-database** scenarios.

```javascript
const accessor = msq.use('billing');
```

**Parameters**:
- `dbName` {string} — target database name

**Return value**: `ScopedAccessor` — includes two methods: `collection` and `model`

**Exception**:

| Error code | Trigger condition |
|--------|---------|
| `NOT_CONNECTED` | `connect()` not called |

---

## use().collection()

Get the Collection on the specified database.

```javascript
const logs = msq.use('logs').collection('access_logs');
const today = await logs.find({ date: '2026-04-26' }).toArray();
```

---

## use().model(key)

Get the Model on the specified database (overrides `connection.database` in definition).

```javascript
const Invoice = msq.use('billing').model('Invoice');
const list = await Invoice.findPage({ status: 'pending' }, { pageSize: 20 });
```

---

## scopedCollection()

The low-level method passes `{ pool, database }` options directly to obtain the Collection.

```javascript
// Equivalent to msq.pool('cn').use('billing').collection('invoices')
const col = msq.scopedCollection('invoices', { pool: 'cn', database: 'billing' });
```

**Parameters**:
- `collectionName` {string}
- `opts` {object}
  - `pool` {string?} — connection pool name (if not passed, the default pool will be used)
  - `database` {string?} — database name (if not passed, the default database will be used)

When `opts` is an empty object, it is equivalent to `msq.collection(collectionName)` (backwards compatible).

---

## scopedModel()

The low-level method passes `{ pool, database }` options directly to obtain the Model.

```javascript
const model = msq.scopedModel('BillingInvoice', { pool: 'cn' });
```

**Connection merge semantics**: `opts` field takes precedence, `definition.connection` acts as fallback.

```javascript
// BillingInvoice.connection = { database: 'billing' }
// opts = { pool: 'cn' }
// merged = { pool: 'cn', database: 'billing' } because opts overrides and definition.connection fills missing fields
const m = msq.scopedModel('BillingInvoice', { pool: 'cn' });

// Force override:
// opts = { pool: 'cn', database: 'analytics' }
// merged = { pool: 'cn', database: 'analytics' }
const m2 = msq.scopedModel('BillingInvoice', { pool: 'cn', database: 'analytics' });
```

**Exception**:

| Error code | Trigger condition |
|--------|---------|
| `NOT_CONNECTED` | `connect()` not called |
| `MODEL_NOT_DEFINED` | `key` is not registered |
| `NO_POOL_MANAGER` | `pool` was passed but constructor `pools[]` was not configured |
| `POOL_NOT_FOUND` | `pool` is not declared in constructor `pools[]` or failed to initialize |

---

## Chain combination example

## Single pool and multiple databases

```javascript
const msq = new MonSQLize({ uri: 'mongodb://localhost:27017' });
await msq.connect();

// Access the billing database
const invoices = await msq.use('billing').collection('invoices').find({}).toArray();

// Access the analytics database
const report = await msq.use('analytics').collection('monthly').findOne({ month: '2026-04' });
```

## Multiple pools and multiple databases

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

// cn pool, billing database
const cnInvoices = await msq.pool('cn').use('billing').collection('invoices').find({}).toArray();

// eu pool, billing database
const euInvoices = await msq.pool('eu').use('billing').collection('invoices').find({}).toArray();
```

## Cooperate with Model

```javascript
// Model definition (definition.connection has database set)
// file: models/billing/invoice.model.js
module.exports = {
  name: 'Invoice',
  collection: 'invoices',
  key: 'BillingInvoice',
  connection: { database: 'billing' },
  schema: { ... }
};

// Use (no need to specify database again)
const cnInvoice = msq.pool('cn').model('BillingInvoice');
const result = await cnInvoice.find({ status: 'paid' });

// Quick access with key alias (single pool)
const Invoice = msq.scopedModel('BillingInvoice');
```

---

## Error handling

```javascript
import { ErrorCodes } from 'monsqlize';

try {
  const accessor = msq.pool('missing-pool');
} catch (err) {
  if (err.code === 'NO_POOL_MANAGER') {
    console.error('Multiple connection pools are not configured, please pass in the pools configuration in the constructor');
  } else if (err.code === 'POOL_NOT_FOUND') {
    console.error(`The connection pool does not exist, available connection pool: ${err.available.join(', ')}`);
  }
}
```

The `POOL_NOT_FOUND` error contains the `err.available` field, which lists all currently available connection pool names.

---

## Choosing an access style

| Need | Use |
|------|-----|
| Collection on the default pool and default database | `msq.collection('users')` |
| Switch database on the default pool | `msq.use('billing').collection('invoices')` |
| Switch connection pool | `msq.pool('cn').collection('users')` |
| Switch connection pool and database | `msq.pool('cn').use('billing').collection('invoices')` |
| Model on a specific pool | `msq.pool('cn').model('BillingInvoice')` |

---

## TypeScript types

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

See the [public type declarations](../../types/index.d.ts) for details.

---

## Related documents

- [Pool configuration](./multi-pool.md)
- [Model layer document](./model.md)
- [Error code reference](./error-codes.md)
- [Connection configuration](./connection.md)
