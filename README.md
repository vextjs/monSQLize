# monSQLize

TypeScript-native MongoDB ODM and enhancement layer with v1-compatible APIs, multi-level caching, distributed locks, transactions, Saga orchestration, model validation, connection pools, Change Stream sync, slow-query logging, and CommonJS / ESM / TypeScript declaration outputs.

[![npm version](https://img.shields.io/npm/v/monsqlize.svg)](https://www.npmjs.com/package/monsqlize)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x%20%2F%207.x-green.svg)](https://www.mongodb.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)

```bash
npm install monsqlize
```

monSQLize is currently a MongoDB-focused package. The long-term product direction is to keep the MongoDB-style query experience while gradually extending the same high-level API shape to additional database backends.

## Table of Contents

- [Why monSQLize](#why-monsqlize)
- [When to Use It](#when-to-use-it)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Model Layer](#model-layer)
- [Caching and Performance](#caching-and-performance)
- [Advanced Capabilities](#advanced-capabilities)
- [Migration from the MongoDB Driver](#migration-from-the-mongodb-driver)
- [Compatibility](#compatibility)
- [Documentation](#documentation)
- [Development](#development)
- [Release Status](#release-status)
- [Roadmap](#roadmap)
- [License](#license)
- [Support](#support)

## Why monSQLize

monSQLize keeps the MongoDB driver mental model while adding the production features most teams end up building around it:

- Drop-in collection helpers that preserve MongoDB-style CRUD, aggregation, indexes, transactions, and Change Streams.
- Smart caching through `cache-hub`, including local memory caching, optional Redis-backed L2 caching, automatic invalidation, and function-level caching.
- A lightweight Model layer with `schema-dsl` validation, hooks, relations, populate, custom methods, timestamps, soft delete, and optimistic locking.
- Multi-connection-pool support, pool health checks, pool-scoped collections/models, and fallback strategies.
- Business locks and distributed locks for multi-instance deployments.
- Saga orchestration for multi-step business workflows.
- Change Stream sync helpers with resume token storage.
- Slow-query logging and query diagnostics.
- CommonJS, ESM, and TypeScript declaration outputs from `dist/**`.

## When to Use It

monSQLize is a good fit when you need:

| Scenario | Benefit |
|---|---|
| High-concurrency reads | Cache hot data and reduce repeated database work. |
| MongoDB API compatibility | Keep familiar query syntax while adding higher-level helpers. |
| Multi-instance services | Use Redis invalidation and distributed locks to keep instances coordinated. |
| Transaction-heavy flows | Use `withTransaction()` and transaction-aware helpers instead of hand-rolled lifecycle code. |
| Model-level ergonomics | Add schema validation, hooks, populate, and custom methods only where needed. |
| Smooth upgrade from v1 | Keep legacy application source stable while adopting the TypeScript rewrite. |

monSQLize is usually not the best first choice for pure write-heavy workloads, extremely strict real-time reads where every query must bypass cache, or very small applications that do not need the extra operational layer.

## Installation

```bash
npm install monsqlize
```

Runtime dependencies installed with the package:

- `mongodb` - official MongoDB driver.
- `schema-dsl` - model schema validation runtime dependency.
- `cache-hub` - cache and function-cache foundation.
- `async-lock` - local concurrency lock support.
- `ioredis` - Redis-backed L2 cache, distributed invalidation, and distributed lock support.
- `ssh2` - SSH tunnel support for restricted/private network deployment.

## Quick Start

### CommonJS

```js
const MonSQLize = require('monsqlize');

const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: {
    uri: 'mongodb://localhost:27017'
  },
  cache: {
    enabled: true,
    ttl: 60_000
  }
});

await db.connect();

const users = db.collection('users');

await users.insertOne({
  username: 'john',
  email: 'john@example.com',
  createdAt: new Date()
});

const user = await users.findOne({ email: 'john@example.com' });
const userById = await users.findOneById('507f1f77bcf86cd799439011');

await users.updateOne(
  { email: 'john@example.com' },
  { $set: { lastLoginAt: new Date() } }
);

await db.close();
```

### ESM and TypeScript

```ts
import MonSQLize from 'monsqlize';
import type { Collection } from 'monsqlize';

const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: {
    uri: 'mongodb://localhost:27017'
  }
});

await db.connect();

const users: Collection = db.collection('users');
const activeUsers = await users.find({ status: 'active' }).toArray();

await db.close();
```

Published entry points:

| Format | Entry |
|---|---|
| CommonJS | `dist/cjs/index.cjs` |
| ESM | `dist/esm/index.mjs` |
| Types | `dist/types/index.d.ts` |

The package root exports only the public package contract. Deep imports into historical `lib/**` files are not part of the v2 publishing surface.

## Model Layer

The Model layer is optional. Use it when you want schema validation, hooks, relations, populate, custom methods, timestamps, soft delete, or optimistic locking.

`schema-dsl` is installed automatically as a runtime dependency of monSQLize. You only need to declare `schema-dsl` in your own app if your application imports it directly.

### Manual Model Registration

```js
const MonSQLize = require('monsqlize');
const { Model } = MonSQLize;

Model.define('users', {
  schema: (dsl) => dsl({
    username: 'string:3-32!',
    email: 'email!',
    password: 'string:6-!',
    age: 'number:0-120'
  }),
  relations: {
    posts: {
      from: 'posts',
      localField: '_id',
      foreignField: 'userId',
      single: false
    }
  },
  hooks: (model) => ({
    insert: {
      before: async (ctx, doc) => {
        doc.createdAt = new Date();
        return doc;
      }
    }
  }),
  methods: (model) => ({
    instance: {
      checkPassword(password) {
        return this.password === password;
      }
    },
    static: {
      async findByUsername(username) {
        return model.findOne({ username });
      }
    }
  })
});

const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' }
});

await db.connect();

const User = db.model('users');
const user = await User.insertOne({
  username: 'john',
  email: 'john@example.com',
  password: 'secret123',
  age: 25
});
```

### Automatic Model Loading

```js
const path = require('path');
const MonSQLize = require('monsqlize');

const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  models: path.join(__dirname, 'models')
});

await db.connect();

const User = db.model('users');
```

```js
// models/user.model.js
module.exports = {
  name: 'users',
  schema: (dsl) => dsl({
    username: 'string:3-32!',
    email: 'email!'
  }),
  methods: (model) => ({
    static: {
      async findByUsername(username) {
        return model.findOne({ username });
      }
    }
  })
};
```

Relative model paths are resolved from `process.cwd()`. In production services, prefer absolute paths such as `path.join(__dirname, 'models')`.

### Populate

```js
Model.define('posts', {
  schema: (dsl) => dsl({
    title: 'string:1-200!',
    content: 'string!',
    userId: 'objectId!'
  })
});

const userWithPosts = await User.findOne({ username: 'john' })
  .populate('posts', {
    select: 'title content',
    match: { status: 'published' },
    sort: { createdAt: -1 },
    limit: 10
  });
```

Populate is supported by `find()`, `findOne()`, `findByIds()`, `findOneById()`, `findAndCount()`, and `findPage()`.

## Caching and Performance

monSQLize can cache collection queries and arbitrary async functions.

```js
const users = db.collection('users');

const hotUser = await users.findOne(
  { email: 'john@example.com' },
  { cache: 60_000 }
);
```

```js
const { withCache } = require('monsqlize');

async function getUserProfile(userId) {
  const user = await db.collection('users').findOneById(userId);
  const orders = await db.collection('orders').find({ userId }).toArray();
  return { user, orders };
}

const cachedGetUserProfile = withCache(getUserProfile, {
  ttl: 300_000,
  cache: db.getCache()
});

await cachedGetUserProfile('user-1');
```

Cache capabilities include:

- In-memory L1 cache.
- Optional Redis-backed L2 cache.
- Automatic invalidation after writes.
- Function-level caching through `withCache()`.
- In-flight request deduplication.
- Namespaces, TTLs, statistics, and conditional caching.

## Advanced Capabilities

### Transactions

```js
await db.withTransaction(async (session) => {
  await db.collection('orders').insertOne({ userId, status: 'pending' }, { session });
  await db.collection('users').updateOne(
    { _id: userId },
    { $inc: { orderCount: 1 } },
    { session }
  );
});
```

### Connection Pools

```js
const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'main',
  config: { uri: 'mongodb://primary:27017' },
  pools: [
    { name: 'analytics', uri: 'mongodb://analytics:27017' }
  ]
});

const reports = db.pool('analytics').collection('reports');
```

### Distributed Locks

```js
await db.withLock('inventory:sku-1', async () => {
  await db.collection('inventory').updateOne(
    { sku: 'sku-1' },
    { $inc: { stock: -1 } }
  );
});
```

### Change Streams

```js
const watcher = db.collection('orders').watch([
  { $match: { 'fullDocument.status': 'pending' } }
]);

watcher.on('change', (change) => {
  console.log('Order changed:', change.fullDocument);
});
```

### Saga Orchestration

```js
db.defineSaga('checkout', [
  {
    name: 'reserveInventory',
    execute: async (ctx) => reserveInventory(ctx),
    compensate: async (ctx) => releaseInventory(ctx)
  },
  {
    name: 'chargePayment',
    execute: async (ctx) => chargePayment(ctx),
    compensate: async (ctx) => refundPayment(ctx)
  }
]);

await db.executeSaga('checkout', { orderId });
```

## Migration from the MongoDB Driver

The smallest migration is usually to replace only initialization:

```js
const { MongoClient } = require('mongodb');

const nativeClient = await MongoClient.connect('mongodb://localhost:27017');
const nativeUsers = nativeClient.db('mydb').collection('users');
```

```js
const MonSQLize = require('monsqlize');

const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { enabled: true }
});

await db.connect();
const users = db.collection('users');
```

MongoDB-style collection calls can remain unchanged in most cases:

```js
const user = await users.findOne({ email });
const list = await users.find({ status: 'active' }).toArray();
```

The v2 line has been validated against the workspace consumers `chat`, `payment`, `user`, `admin`, `search`, `vext`, and `permission-core` without requiring business-source changes in those projects.

## Compatibility

| Surface | Current Support |
|---|---|
| Node.js | `>=18.0.0`; CI covers Node 18 / 20 / 22. |
| MongoDB driver | `mongodb@6.21.0` runtime baseline; driver 7.2.0 has additional compatibility coverage. |
| MongoDB server | Memory-server based 6.x / 7.x validation is covered by the project test matrix. |
| Module systems | CommonJS and ESM are both validated. |
| TypeScript | Public declarations are published from `dist/types/index.d.ts`. |
| Package license | Apache-2.0. |

See the current support and verification documents:

- [English documentation](https://github.com/vextjs/monSQLize/blob/main/docs/en/README.md)
- [Chinese documentation](https://github.com/vextjs/monSQLize/blob/main/docs/zh/README.md)
- [English recipes](https://github.com/vextjs/monSQLize/blob/main/docs/en/recipes.md)
- [Support matrix](https://github.com/vextjs/monSQLize/blob/main/docs/en/support-matrix.md)
- [Verification entry points](https://github.com/vextjs/monSQLize/blob/main/docs/en/verification-entrypoints.md)
- [test/compatibility/README.md](https://github.com/vextjs/monSQLize/blob/main/test/compatibility/README.md)
- [test/validation/VERIFICATION-PROGRESS.md](https://github.com/vextjs/monSQLize/blob/main/test/validation/VERIFICATION-PROGRESS.md)

## Documentation

Current TypeScript documentation and examples are the source of truth for the v2 package:

- `docs/en/**` - default English documentation.
- `docs/zh/**` - Simplified Chinese documentation.
- `docs/en/recipes.md` / `docs/zh/recipes.md` - shortest copy-ready paths for common setup scenarios.
- `examples/**` - TypeScript examples.
- `test/compatibility/**` - package exports and compatibility guards.
- `test/validation/**` - verification ledgers and mapping notes.

Historical v1 assets are useful for tracing old behavior, but they are not the current publishing surface for v2.

## Development

```bash
git clone https://github.com/vextjs/monSQLize.git
cd monSQLize
npm install
```

Common commands:

```bash
npm run build
npm run type-check
npm test
npm run verify:fast
npm run verify:full
npm run release:preflight
```

Release preflight runs linting, type checks, size guards, runtime checks, compatibility checks, refactor guards, the default test suite, and `npm pack --dry-run`.

`npm run release:publish` runs the preflight gate once and then calls `npm publish --ignore-scripts` so the final publish step does not repeat the full lifecycle gate. Raw `npm publish` is still guarded by `prepublishOnly`.

Optional commands:

```bash
npm run check:docs-examples
npm run test:examples
npm run test:coverage
npm run test:server-matrix
npm run test:real-env:private
```

`check:docs-examples` verifies the 97/97 bilingual documentation matrix, runnable-example runner parity, shared-example targets, doc-check targets, and user-facing path text.

`test:examples`, `test:server-matrix`, and `config.useMemoryServer` use a fixed `mongodb-memory-server` policy: MongoDB `7.0.14` by default, binaries cached under `.cache/mongodb-memory-server/binaries`, and temporary data paths created under `.cache/mongodb-memory-server/db` with forced cleanup for project-managed paths. Stale managed data paths whose owner PID is no longer alive are pruned before new memory-server launches. Override with `MONSQLIZE_MEMORY_MONGO_BINARY_VERSION`, `MONSQLIZE_REPLSET_BINARY_VERSION`, `MONGOMS_DOWNLOAD_DIR`, or `MONSQLIZE_MEMORY_SERVER_DB_DIR` when needed.

`test:coverage` is the independent 90% coverage governance gate for the published CJS runtime artifact. `test:real-env:private` is intentionally opt-in and expects private environment variables. Neither command is part of the default CI or release gate.

## Release Status

The current published release is `v2.0.2`.

Key release-readiness points:

- TypeScript rewrite completed for the current runtime and test entry points.
- Package exports are consolidated under `dist/cjs`, `dist/esm`, and `dist/types`.
- npm packages include the runtime bundles and declaration files only; source maps are disabled by default and can be generated locally with `MONSQLIZE_BUILD_SOURCEMAPS=1 npm run build`.
- v1 smooth-upgrade compatibility has been validated against the target workspace consumers.
- `schema-dsl` follows the npm `latest` TypeScript line `schema-dsl@2.0.8`; deprecated `2.3.x` mistake releases are intentionally excluded.
- GitHub Actions publishes to npm from `v*` tags after running `npm run release:preflight`; the publish step skips duplicate lifecycle scripts because the gate already ran in the same job.

## Roadmap

### v2.0.2

- Deterministic dependency metadata patch.
- `ioredis` and `ssh2` are installed with monSQLize by default, so Redis-backed cache/locks and SSH tunnels no longer require a separate dependency install step.

### v2.0.1

- v1 smooth-upgrade compatibility patch for Model actual collection names, scoped pools/databases, automatic-index dedupe, and cache/pool option aliases.
- Documentation and public types aligned with the current runtime behavior.

### v2.0.0

- TypeScript-native runtime and declarations.
- v1 smooth-upgrade compatibility bridge.
- Multi-level cache and function-cache support through `cache-hub`.
- Transactions, business locks, distributed locks, Saga orchestration, connection pools, Change Stream sync, and slow-query logging.
- Model layer with `schema-dsl` validation, relations, populate, hooks, and custom methods.

### v2.x

- Query analyzer improvements.
- Automatic index suggestions.
- Migration tooling.
- GraphQL integration experiments.
- More real-environment validation coverage.

### v3.0+

- Unified API experiments for MySQL.
- Unified API experiments for PostgreSQL.
- Broader ORM capabilities.
- Cross-database sync middleware.

## License

monSQLize is released under the [Apache License 2.0](./LICENSE).

## Support

- Issues: [GitHub Issues](https://github.com/vextjs/monSQLize/issues)
- npm: [monsqlize](https://www.npmjs.com/package/monsqlize)
- Website: [https://vextjs.github.io/monSQLize/](https://vextjs.github.io/monSQLize/)
