# Connection Management

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Connection Management API](#connection-management-api)
  - [connect()](#connect)
  - [collection()](#collection)
  - [db()](#db)
  - [close()](#close)
- [Cross-Database Access](#cross-database-access)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
  - [1. Reuse Connections](#1-reuse-connections)
  - [2. Manage Application Lifecycle](#2-manage-application-lifecycle)
  - [3. Retry Connection Failures](#3-retry-connection-failures)
  - [4. Manage Connections in Tests](#4-manage-connections-in-tests)
- [Configuration Options](#configuration-options)
  - [Complete Configuration Example](#complete-configuration-example)
  - [Configuration Categories](#configuration-categories)
  - [Common Configuration Scenarios](#common-configuration-scenarios)
  - [Configuration Validation](#configuration-validation)
  - [Environment Variable Configuration](#environment-variable-configuration)
  - [Configuration Priority](#configuration-priority)
- [FAQ](#faq)
- [References](#references)

---

## Overview

monSQLize provides connection management for MongoDB applications, including concurrent connection protection, parameter validation, resource cleanup, and cross-database access. This document explains the connection API and the related configuration surface.

## Core Features

- Concurrent connection protection: only one connection is established under high concurrency.
- Parameter validation: collection and database names are validated before use.
- Resource cleanup: client resources and internal caches are released by `close()`.
- Error handling: failed connection attempts clear the in-flight connection lock.
- Cross-database access: a single instance can access collections in other databases.

---

## Connection Management API

### connect()

Establishes a database connection. The method is safe to call concurrently and reuses the same in-flight connection promise.

#### Method Signature

```javascript
async connect()
```

#### Return Value

```javascript
{
  collection: Function,      // Collection accessor for the default database.
  db: Function,              // Database-level accessor; db(name?) returns a DbAccessor.
  use: Function,             // Scoped collection/model access for another database.
  instance: MonSQLize        // Current MonSQLize instance.
}
```

#### Usage Example

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection, use } = await msq.connect();

// Connect to the database.
const users = collection('users');

// Use collection accessors.
const products = collection('products');

// Cross-database access.
const analyticsEvents = use('analytics').collection('events');
```

---

### Concurrent Connection Protection

`connect()` includes an internal lock so that high-concurrency code establishes one client connection instead of opening many duplicate clients.

#### How It Works

1. First call: starts the connection and caches the promise.
2. Concurrent calls: wait for the same promise.
3. Successful connection: clears the lock and returns the connection object.
4. Failed connection: clears the lock and rethrows the error.

#### High-Concurrency Example

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' }
});

// High-concurrency scenario: 10 concurrent requests.
const promises = Array(10).fill(null).map(() => msq.connect());
const results = await Promise.all(promises);

// All requests return the same connection object.
console.log(results[0] === results[1]);  // true
console.log(results[0] === results[9]);  // true
console.log('Only one connection was established.');
```

#### Benefits of Concurrent Protection

- Prevents connection-pool exhaustion.
- Reduces connection overhead.
- Avoids duplicate resource allocation.
- Improves stability under startup bursts.

---

### Parameter Validation

`collection()` and `db()` validate their inputs so invalid collection or database names fail early.

#### collection() Validation

Rules:

- The collection name must be a non-empty string.
- `null`, `undefined`, empty strings, and whitespace-only strings are rejected.
- Numbers, objects, and other non-string values are rejected.

```javascript
const { collection } = await msq.connect();

// Valid usage.
const users = collection('users');
const orders = collection('my-orders');

// Invalid parameters. These throw.
try {
  collection('');
  collection('   ');
  collection(null);
  collection(undefined);
  collection(123);
  collection({ name: 'test' });
} catch (err) {
  console.error(err.code, err.message);
  // INVALID_COLLECTION_NAME Collection name must be a non-empty string.
}
```

#### db() Validation

Important: `db(name)` validates the database name immediately when `name` is provided. Omit the argument, or pass `undefined`, to use the default database. Pass `null` only if you intentionally want an `INVALID_DATABASE_NAME` error in JavaScript.

Rules:

- If `databaseName` is provided, it must be a non-empty string.
- `undefined` and an omitted argument use the default database.
- `null`, empty strings, and whitespace-only strings are rejected.

```javascript
const { db } = await msq.connect();

// Valid usage.
const shopDb = db('shop');
const analyticsDb = db('analytics');

// Use the default database. This is valid.
const defaultDb1 = db();
const defaultDb2 = db(undefined);

// Verify that collections can be obtained normally.
const shopOrders = shopDb.collection('orders');
const analyticsEvents = analyticsDb.collection('events');

// Invalid parameters. These throw immediately.
try {
  db(null);
  db('');
  db('   ');
} catch (err) {
  console.error(err.code, err.message);
  // INVALID_DATABASE_NAME Database name must be a non-empty string.
}

// Omitted and undefined use the default database.
const users1 = db().collection('users');
const users2 = db(undefined).collection('users');
// No error is thrown.
console.log('Default database access succeeded.');
```

#### Error Codes

| Error code | Description | Example |
|------------|-------------|---------|
| `INVALID_COLLECTION_NAME` | Invalid collection name. | `collection('')` |
| `INVALID_DATABASE_NAME` | Invalid database name, such as `null`, an empty string, or a whitespace-only string. | `db('')` |

Notes:

- `db()` and `db(undefined)` use the default database configured on the MonSQLize instance.
- `db(null)` throws `INVALID_DATABASE_NAME` in JavaScript; TypeScript callers should omit the argument instead.
- `''` and strings such as `'   '` also trigger database-name validation errors.

---

### close()

Closes the database connection and releases internal resources.

#### Method Signature

```javascript
async close()
```

#### Cleanup Scope

- Closes the MongoDB client connection.
- Clears the instance ID cache (`_iidCache`).
- Clears the connection lock (`_connecting`).
- Clears the `ModelInstance` cache in v1.2.1+.
- Releases internal references.

#### Usage Example

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'example',
  config: { uri: 'mongodb://localhost:27017' }
});

// Connect.
const { collection } = await msq.connect();

// Use the connection.
await collection('test').find({ query: {} });

// Close the connection.
await msq.close();
console.log('Connection closed and resources cleaned.');
```

#### Repeated Connect-Close Cycles

```javascript
for (let i = 0; i < 5; i++) {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://localhost:27017' }
  });

  await msq.connect();
  const { collection } = await msq.connect();

  // Use the connection.
  await collection('test').find({ query: {} });

  // Close the connection.
  await msq.close();
  console.log(`Cycle ${i + 1} completed`);
}

// Repeated connect-close cycles are safe.
console.log('All cycles completed and memory was cleaned correctly.');
```

#### Notes

- Calling `close()` more than once is safe.
- Calling `connect()` after `close()` creates a new connection.
- Call `close()` when the application shuts down.
- In tests, close the instance in `afterEach` or `after` hooks.

---

## Cross-Database Access

monSQLize can access collections in different databases through one instance.

### Access Another Database

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection, use } = await msq.connect();

// 1. Access a collection in the default database.
const products = await collection('products').find({ query: {} });
console.log('shop.products ->', products);

// 2. Access a collection in another database.
const analyticsEvents = await use('analytics').collection('events').findOne({
  query: { type: 'click' },
  cache: 3000,
  maxTimeMS: 1500
});
console.log('analytics.events ->', analyticsEvents);

// 3. Query another database multiple times.
const [user1, user2] = await Promise.all([
  db('users_db').collection('users').findOne({ query: { name: 'Alice' }, cache: 2000 }),
  db('users_db').collection('users').findOne({ query: { name: 'Bob' } })
]);
console.log(user1, user2);
```

### Cross-Database Notes

- All cross-database access shares the same MongoDB client connection.
- Cache keys include the database name, so identical collection names in different databases have isolated cache entries.
- Per-query options such as `maxTimeMS` and `cache` work the same way for cross-database collections.
- Cross-database collections support monSQLize features such as caching and slow-query logging.

---

## Error Handling

### Connection Failure

```javascript
import MonSQLize from 'monsqlize';

try {
  const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'example',
    config: { uri: 'mongodb://invalid-host:27017' }
  });

  await msq.connect();
} catch (err) {
  // Connection failure.
  console.error('Connection failed:', err.message);

  // The connection lock has been cleared, so retrying is safe.
  console.log('The connection can be retried.');
}
```

### Parameter Validation Failure

```javascript
const { collection, db } = await msq.connect();

try {
  // Invalid collection name.
  collection('');
} catch (err) {
  if (err.code === 'INVALID_COLLECTION_NAME') {
    console.error('Invalid collection name:', err.message);
    console.log('Provide a valid collection name.');
  }
}

try {
  // Invalid database name: empty string.
  // db() validates database names immediately.
  db('');
} catch (err) {
  if (err.code === 'INVALID_DATABASE_NAME') {
    console.error('Invalid database name:', err.message);
    console.log('Provide a valid database name, or omit it for the default database.');
  }
}

// Correct usage: omit the argument or use undefined for the default database.
const defaultDb = db().collection('users');
const defaultDb2 = db(undefined).collection('users');
```

---

## Best Practices

### 1. Reuse Connections

```javascript
// db-connection.js
import MonSQLize from 'monsqlize';

let msqInstance = null;

export async function getConnection() {
  if (!msqInstance) {
    msqInstance = new MonSQLize({
      type: 'mongodb',
      databaseName: process.env.DB_NAME || 'shop',
      config: { uri: process.env.MONGODB_URI }
    });
  }

  return await msqInstance.connect();
}

export async function closeConnection() {
  if (msqInstance) {
    await msqInstance.close();
    msqInstance = null;
  }
}
```

```javascript
import { getConnection } from './db-connection.js';

// Use the singleton connection.
async function queryUsers() {
  const { collection } = await getConnection();
  return await collection('users').find({ query: {} });
}
```

### 2. Manage Application Lifecycle

```javascript
import MonSQLize from 'monsqlize';

class Application {
  constructor() {
    this.msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'shop',
      config: { uri: process.env.MONGODB_URI }
    });
  }

  async start() {
    console.log('Starting application...');

    // Establish the connection.
    const { collection } = await this.msq.connect();
    this.collection = collection;

    console.log('Database connection established.');
  }

  async stop() {
    console.log('Stopping application...');

    // Close the connection.
    await this.msq.close();

    console.log('Database connection closed.');
  }
}

const app = new Application();

// Use the application lifecycle.
async function main() {
  await app.start();

  // Application is running...
  process.on('SIGINT', async () => {
    // Graceful shutdown.
    await app.stop();
    process.exit(0);
  });
}

main();
```

### 3. Retry Connection Failures

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
      console.log('Connection established.');
      return msq;
    } catch (err) {
      console.error(`Connection failed (${i + 1}/${maxRetries}):`, err.message);

      if (i < maxRetries - 1) {
        console.log(`Retrying after ${delay} ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw new Error('Connection failed after the maximum retry count.');
      }
    }
  }
}
```

### 4. Manage Connections in Tests

```javascript
const { describe, it, before, after } = require('mocha');
import MonSQLize from 'monsqlize';

describe('user service', () => {
  let msq;
  let collection;

  before(async () => {
    // Establish the connection before tests.
    msq = new MonSQLize({
      type: 'mongodb',
      databaseName: 'test',
      config: { useMemoryServer: true }
    });

    const conn = await msq.connect();
    collection = conn.collection;
  });

  after(async () => {
    // Close the connection after tests.
    await msq.close();
  });

  it('queries users', async () => {
    const users = await collection('users').find({ query: {} });
    console.log('Users found:', users.length);
  });
});
```

`useMemoryServer` reuses the project-local `.cache/mongodb-memory-server/binaries` binary cache by default. Automatically created temporary data directories are placed under `.cache/mongodb-memory-server/db` and are cleaned when the instance closes. To pin a directory, pass `memoryServerOptions.instance.dbPath` or set `MONSQLIZE_MEMORY_SERVER_DB_DIR`.

---

## Configuration Options

monSQLize exposes configuration options for connection behavior, query defaults, caching, logging, multi-pool access, and optional infrastructure features.

### Complete Configuration Example

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  // ========================================
  // Base configuration.
  // Required.
  // ========================================
  type: 'mongodb',
  databaseName: 'myapp',

  config: {
    uri: 'mongodb://localhost:27017',
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    },

    // ========================================
    // SSH tunnel configuration.
    // This is configured under config.ssh.
    // ========================================
    ssh: {
      host: 'jump-server.example.com',
      port: 22,
      username: 'user',

      // Choose one authentication method: password, privateKeyPath, or privateKey.
      // Authentication method 1: password.
      password: 'your-password',

      // Authentication method 2: private-key file path. Supports ~ expansion.
      privateKeyPath: '~/.ssh/id_rsa',

      // Authentication method 3: private-key content.
      privateKey: '-----BEGIN RSA PRIVATE KEY-----...',
      passphrase: 'key-passphrase',

      // Target MongoDB server. Usually inferred from uri.
      // It usually does not need to be set manually.
      dstHost: 'mongodb.internal',
      dstPort: 27017,
      localPort: 27018,
      readyTimeout: 20000,
      keepaliveInterval: 30000
    }
  },

  // ========================================
  // Query defaults.
  // ========================================
  maxTimeMS: 3000,
  findLimit: 20,
  slowQueryMs: 500,

  // ========================================
  // Deep pagination.
  // ========================================
  findPageMaxLimit: 500,
  cursorSecret: 'your-secret-key',

  // ========================================
  // Cache configuration.
  // ========================================
  cache: {
    type: 'memory',
    maxSize: 100000,
    maxAge: 3600000,
    enableStats: true,
    autoInvalidate: true,

    redis: {
      // Redis cache configuration. Used when type='redis'.
      host: 'localhost',
      port: 6379,
      password: 'your-password',
      db: 0,
      keyPrefix: 'monsqlize:'
    },

    distributed: {
      // Distributed cache invalidation configuration.
      enabled: true,
      redis: { /* Redis configuration */ },
      channel: 'cache:invalidate'
    }
  },

  // ========================================
  // Namespace configuration for cache isolation.
  // ========================================
  namespace: {
    scope: 'database',
    instanceId: 'server-01'
  },

  // ========================================
  // Count queue configuration.
  // High-concurrency control.
  // ========================================
  countQueue: {
    enabled: true,
    concurrency: 8,
    maxQueueSize: 10000,
    timeout: 60000
  },

  // ========================================
  // Multiple connection pools.
  // v1.0.8+.
  // ========================================
  pools: {
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
  poolStrategy: 'auto',
  poolFallback: true,
  maxPoolsCount: 5,

  // ========================================
  // ObjectId auto conversion.
  // v1.3.0+.
  // ========================================
  autoConvertObjectId: {
    enabled: true,
    mode: 'auto',
    fields: ['_id', 'userId']
  },

  // ========================================
  // Logging.
  // ========================================
  logger: {
    level: 'info',
    enabled: true,
    // Custom log handler. Default: console.log.
    handler: (level, message, meta) => {
      console.log(`[${level}]`, message, meta);
    }
  },

  // ========================================
  // Slow-query tag configuration.
  // ========================================
  log: {
    slowQueryTag: {
      event: 'slow_query',
      code: 'SLOW_QUERY'
    }
  },

  // ========================================
  // Persistent slow-query log storage.
  // v1.3.1+.
  // ========================================
  slowQueryLog: {
    enabled: true,
    storage: 'mongodb',
    collection: 'slow_queries',
    databaseName: 'logs',

    file: {
      // File storage configuration. Used when storage='file'.
      path: './logs/slow-queries.log',
      maxSize: '10M',
      maxFiles: 5
    },

    // Filter. Default: undefined, which records all slow queries.
    filter: (query) => {
      return query.duration > 1000;
    }
  },

  // ========================================
  // Model auto loading.
  // v1.4.0+.
  // ========================================
  models: {
    enabled: true,
    dir: './models',
    pattern: '**/*.js',
    // Custom loader. Default: require.
    loader: (filePath) => {
      return require(filePath);
    }
  },

  // ========================================
  // Change Stream synchronization.
  // v1.0.9+.
  // ========================================
  sync: {
    enabled: true,
    collections: ['users', 'orders'],

    target: {
      // Synchronization target configuration.
      type: 'mongodb',
      uri: 'mongodb://backup:27017',
      databaseName: 'backup'
    },

    resumeToken: {
      // Resume Token configuration.
      storage: 'mongodb',
      collection: 'resume_tokens'
    }
  },

  // ========================================
  // Business-level distributed lock.
  // Enterprise feature.
  // ========================================
  businessLock: {
    enabled: true,
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'your-password'
    },
    keyPrefix: 'lock:',
    defaultTTL: 30000,
    retryDelay: 100,
    retryTimes: 10
  }
});
```

### Configuration Categories

#### 1. Base Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | `'mongodb'` | Database type. Currently only `mongodb` is supported. |
| `databaseName` | string | - | Default database name. |
| `config.uri` | string | - | MongoDB connection string. |
| `config.options` | object | - | MongoDB client options. |

#### 2. Query Defaults

| Option | Type | Default | Range | Description |
|--------|------|---------|-------|-------------|
| `maxTimeMS` | number | 2000 | 1-300000 | Global query timeout in milliseconds. |
| `findLimit` | number | 10 | 1-10000 | Default limit for `find`. |
| `findPageMaxLimit` | number | 500 | 1-10000 | Maximum limit for `findPage`. |
| `slowQueryMs` | number | 500 | 0-60000 | Slow-query threshold in milliseconds; `-1` disables it. |

#### 3. Cache Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cache.type` | string | `'memory'` | Cache type: `memory` or `redis`. |
| `cache.maxSize` | number | 100000 | Maximum number of memory cache entries. |
| `cache.maxAge` | number | 3600000 | Default cache duration in milliseconds. |
| `cache.enableStats` | boolean | true | Enables cache statistics. |
| `cache.autoInvalidate` | boolean | false | Enables precise cache invalidation. |
| `cache.redis` | object | - | Redis connection configuration. |
| `cache.distributed.enabled` | boolean | false | Enables distributed cache invalidation. |

#### 4. Advanced Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `namespace` | object | `{ scope: 'database' }` | Namespace settings for cache isolation. |
| `countQueue` | object | `{ enabled: true }` | Count queue configuration. |
| `pools` | object | - | Multiple connection-pool configuration. |
| `autoConvertObjectId` | object | `{ enabled: true }` | ObjectId auto conversion. |
| `logger` | object | - | Logging configuration. |
| `slowQueryLog` | object | - | Persistent slow-query log storage. |
| `models` | object | - | Model auto-loading configuration. |
| `sync` | object | - | Change Stream synchronization. |
| `config.ssh` | object | - | SSH tunnel configuration. `ssh2` is installed with monsqlize. |
| `businessLock` | object | - | Business-level distributed lock. |

### Common Configuration Scenarios

#### Scenario 1: Production

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

  // Performance tuning.
  maxTimeMS: 5000,
  findLimit: 20,
  slowQueryMs: 1000,

  // Enable cache.
  cache: {
    type: 'redis',
    redis: {
      host: process.env.REDIS_HOST,
      port: 6379,
      password: process.env.REDIS_PASSWORD
    },
    distributed: { enabled: true }
  },

  // Logging configuration.
  logger: { level: 'warn' },
  slowQueryLog: { enabled: true }
});
```

#### Scenario 2: Development

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'dev',
  config: { uri: 'mongodb://localhost:27017' },

  // Debug configuration.
  logger: { level: 'debug' },
  slowQueryMs: 100,

  // Simple in-memory cache.
  cache: { type: 'memory', maxSize: 10000 }
});
```

#### Scenario 3: Testing

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'test',
  config: { useMemoryServer: true },

  // Disable cache to keep test data deterministic.
  cache: false,

  // Disable slow-query logging to reduce noise.
  slowQueryMs: -1,

  // Fast timeout.
  maxTimeMS: 1000
});
```

### Configuration Validation

Some options have range limits and throw if the provided value is outside the allowed range.

| Option | Minimum | Maximum | Error message |
|--------|---------|---------|---------------|
| `maxTimeMS` | 1 | 300000 | maxTimeMS must be between 1 and 300000 |
| `findLimit` | 1 | 10000 | findLimit must be between 1 and 10000 |
| `findPageMaxLimit` | 1 | 10000 | findPageMaxLimit must be between 1 and 10000 |
| `slowQueryMs` | 0 | 60000 | slowQueryMs must be between 0 and 60000 |

### Environment Variable Configuration

Applications commonly load deploy-specific connection values from environment variables.

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
      port: parseInt(process.env.REDIS_PORT, 10),
      password: process.env.REDIS_PASSWORD
    }
  },
  cursorSecret: process.env.CURSOR_SECRET
});
```

### Configuration Priority

Configuration is resolved from highest to lowest priority:

1. Per-call parameters, such as `collection.find({}, { maxTimeMS: 5000 })`
2. Instance configuration, such as `new MonSQLize({ maxTimeMS: 3000 })`
3. Built-in defaults

```javascript
const msq = new MonSQLize({ maxTimeMS: 3000 });

// Default: 2000 ms.
// This query uses 5000 ms because method-level options take precedence.
await collection.find({}, { maxTimeMS: 5000 }); // Uses 5000 ms.
// This query uses 3000 ms because it falls back to the instance configuration.
await collection.find({});                      // Uses 3000 ms.
```

---

## FAQ

### Q: How do I ensure that only one connection is established?

`connect()` has a built-in concurrent lock, so repeated or concurrent calls reuse the same connection.

```javascript
const msq = new MonSQLize({ /* ... */ });

// Concurrent calls establish only one connection.
const [conn1, conn2, conn3] = await Promise.all([
  msq.connect(),
  msq.connect(),
  msq.connect()
]);

console.log(conn1 === conn2);  // true
```

### Q: When should I call close()?

Call `close()` when:

- The application is shutting down.
- A test finishes and should release its database resources.
- A connection will not be used for a long time.
- A connect-close lifecycle test needs deterministic cleanup.

### Q: Does cross-database access create multiple client connections?

No. Cross-database access shares the same MongoDB client connection and only targets different databases.

```javascript
const { use } = await msq.connect();

// These three operations share the same connection.
await use('shop').collection('products').find({ query: {} });
await use('analytics').collection('events').find({ query: {} });
await use('logs').collection('errors').find({ query: {} });
```

### Q: How do I retry after a failed connection?

After a connection failure, the `_connecting` lock is cleared automatically, so retrying is safe.

```javascript
async function connectWithRetry() {
  const msq = new MonSQLize({ /* ... */ });

  while (true) {
    try {
      await msq.connect();
      return msq;
    } catch (err) {
      console.error('Connection failed; retrying in 3 seconds...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
```

---

## References

- [MongoDB Node.js driver documentation](https://docs.mongodb.com/drivers/node/)
- [Connection string format](https://docs.mongodb.com/manual/reference/connection-string/)
- [Connection pool options](https://docs.mongodb.com/manual/reference/connection-string/#connection-pool-options)
- [monSQLize README](https://github.com/vextjs/monSQLize/blob/main/README.md)
