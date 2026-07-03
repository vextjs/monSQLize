# monSQLize

Database-native production data runtime layer for TypeScript services. monSQLize keeps database semantics explicit while adding shared runtime capabilities for caching, transactions, connection pools, models, synchronization, observability, and CommonJS / ESM / TypeScript declaration outputs.

[![npm version](https://img.shields.io/npm/v/monsqlize.svg)](https://www.npmjs.com/package/monsqlize)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x%20%2F%207.x-green.svg)](https://www.mongodb.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)](https://nodejs.org/)

Documentation: [English](https://vextjs.github.io/monSQLize/) · [简体中文](https://vextjs.github.io/monSQLize/zh/)

```bash
npm install monsqlize
```

MongoDB is the first complete adapter. MySQL and PostgreSQL adapters are planned as database-native runtime adapters, not as a transparent promise that every database already accepts the same query syntax.

## Table of Contents

- [Why monSQLize](#why-monsqlize)
- [Adapter Status](#adapter-status)
- [Runtime Consistency Contract](#runtime-consistency-contract)
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

monSQLize is not an ORM and it is not just a CRUD wrapper. It is a production data runtime layer: the database driver remains visible, while the operational features teams usually build around the driver are provided in one runtime.

- Database-native adapter APIs: the current stable adapter preserves MongoDB-style CRUD, aggregation, indexes, transactions, and Change Streams.
- Smart caching through `cache-hub`, including local memory caching, optional Redis-backed L2 caching, automatic invalidation, and function-level caching.
- A lightweight Model layer with `schema-dsl` validation, hooks, relations, populate, custom methods, timestamps, soft delete, optimistic locking, and production-safe index preflight.
- Multi-connection-pool support, pool health checks, pool-scoped collections/models, and fallback strategies.
- Change Stream sync helpers with resume token storage.
- Slow-query logging and query diagnostics.
- CommonJS, ESM, and TypeScript declaration outputs from `dist/**`.

## Adapter Status

| Adapter | Current status | Public entry |
|---|---|---|
| MongoDB | Stable and fully implemented | `type: 'mongodb'`, `collection()`, `db()`, `use()`, `pool()` |
| MySQL | Planned / in development | Not part of the current npm runtime yet |
| PostgreSQL | Planned / in development | Not part of the current npm runtime yet |

The shared runtime direction is cache consistency, connection lifecycle, transaction helpers, model constraints, synchronization, and observability across adapters. Adapter-native query, transaction, and connection semantics will stay explicit.

## Runtime Consistency Contract

monSQLize coordinates cache, transactions, sync, and queues inside the runtime, but it does not provide a global strict-consistency kernel. MongoDB transactions keep MongoDB session ACID semantics. Cache invalidation runs around writes or transaction commit and is best-effort; a short-lived dirty barrier makes cached reads bypass and avoid refilling cache while a namespace is being invalidated, but Redis/L2 cache and Pub/Sub invalidation still provide eventual cross-instance coherence rather than atomic cache/DB commits. Change Stream sync is at-least-once; custom targets should be idempotent by change event `_id`, and `sync.idempotency` can record per-target replay markers when a durable store is provided. Transaction cache locks are process-local in the v2 runtime; use explicit business coordination, idempotency/fencing, or cache bypassing for cross-instance strict flows.

## Write Path Policy

By default, both `collection()` and `model()` may write. Applications that want all writes for selected namespaces to pass through Model defaults, hooks, timestamps, versioning, and soft-delete rules can enable `writePathPolicy`.

```ts
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'app',
  config: { uri: 'mongodb://localhost:27017' },
  writePathPolicy: {
    default: 'model-only',
    namespaces: {
      'app.audit_logs': 'allow-both'
    }
  }
});
```

`model-only` blocks direct collection/db/legacy write surfaces by default, including raw access and `$out` / `$merge` aggregate writes, while Model write and Model management methods remain available. See [Write Path Policy](./docs/en/write-path-policy.md).

## When to Use It

monSQLize is a good fit when you need:

| Scenario | Benefit |
|---|---|
| High-concurrency reads | Cache hot data and reduce repeated database work. |
| MongoDB API compatibility today | Keep familiar MongoDB syntax while adding higher-level runtime helpers. |
| A future multi-database runtime boundary | Prepare for MySQL/PostgreSQL adapters without turning SQL into fake MongoDB syntax. |
| Multi-instance services | Use Redis invalidation and pool health checks to keep instances coordinated. |
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
- `ioredis` - Redis-backed L2 cache and distributed invalidation support.
- `ssh2` - SSH tunnel support for restricted/private network deployment.

## Quick Start

The current stable quick start uses the MongoDB adapter.

### CommonJS

```js
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
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

await msq.connect();

const users = msq.collection('users');

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

await msq.close();
```

### ESM and TypeScript

```ts
import MonSQLize from 'monsqlize';
import type { Collection } from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: {
    uri: 'mongodb://localhost:27017'
  }
});

await msq.connect();

const users: Collection = msq.collection('users');
const activeUsers = await users.find({ status: 'active' }).toArray();

await msq.close();
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

`schema-dsl` is installed automatically as a runtime dependency of monSQLize. monSQLize creates an isolated `schema-dsl/runtime` instance for each `MonSQLize` runtime, then compiles Model schema callbacks when a Model is bound to that runtime.

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

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' }
});

await msq.connect();

const User = msq.model('users');
const user = await User.insertOne({
  username: 'john',
  email: 'john@example.com',
  password: 'secret123',
  age: 25
});
```

When a service needs runtime-local custom types, messages, locale, or an already-owned schema-dsl runtime, configure `schemaDsl` on the MonSQLize instance:

```js
const { createRuntime } = require('schema-dsl/runtime');

const schemaRuntime = createRuntime({
  types: {
    tenantId: { type: 'string', pattern: '^tenant_[a-z0-9]+$' }
  }
});

Model.define('tenantUsers', {
  schema: (dsl) => dsl({
    tenantId: 'tenantId!',
    email: 'email!'
  })
});

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  schemaDsl: { runtime: schemaRuntime }
});
```

For monSQLize-only Model validation, no direct application import from `schema-dsl` is required. Direct application imports should use `schema-dsl/runtime` when they need to share the same isolated runtime state with monSQLize.
Use `schemaDsl: { extensions }` when monSQLize should own the runtime and register extension definitions. When the application owns the schema-dsl lifecycle, configure that runtime directly, including `runtime.registerExtensions([...])`, and inject it with `schemaDsl: { runtime }`. If the default `schema-dsl/runtime` entry cannot be resolved or does not expose the required runtime APIs, monSQLize throws `INVALID_CONFIG`; validation is disabled only when `schemaDsl: false` or `schemaDsl: { enabled: false }` is set explicitly.

### Automatic Model Loading

```js
const path = require('path');
const MonSQLize = require('monsqlize');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  models: path.join(__dirname, 'models')
});

await msq.connect();

const User = msq.model('users');
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

### Production Model Index Rollout

Model-declared indexes are still created automatically by default for backward compatibility. Production services can turn off automatic indexing and run an explicit preflight before creating missing indexes:

```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  autoIndex: false
});

const plan = await msq.ensureModelIndexes({ models: ['users'], dryRun: true });

if (plan.totals.conflicts === 0) {
  await msq.ensureModelIndexes({ models: ['users'], throwOnError: true });
}
```

`ensureModelIndexes()` creates only missing indexes. It does not drop, rename, or rebuild conflicting indexes.

### Versioned Writes

Models with `options.version` use single-document optimistic concurrency control. When the filter contains a direct `_id`, monSQLize reads the current version automatically. You can still pass an explicit version in the filter or as `expectedVersion` when you want to control the expected version yourself:

```js
await User.updateOne(
  { _id: userId },
  { $set: { status: 'active' } }
);

await User.replaceOne(
  { _id: userId },
  nextUser,
  { expectedVersion: user.version }
);
```

Successful `save()`, `updateOne()`, `replaceOne()`, `findOneAndUpdate()`, and `findOneAndReplace()` advance the version. Stale writes throw a `WRITE_CONFLICT` error.

For `updateMany()` and `updateBatch()`, choose the batch version behavior explicitly when needed:

```js
await User.updateMany({ status: 'pending' }, { $set: { status: 'active' } }, {
  versionMode: 'strict' // 'counter' | 'strict' | 'off'
});
```

`counter` is the default and only increments the version counter; it is not optimistic locking. `strict` pre-reads matching document IDs and versions, conditionally updates each document, and returns `conflictCount` / `conflictedIds` on the result object.

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

For has-many relations, `skip` and `limit` are applied per parent document after related records are grouped. Nested populate has a default `maxDepth` of `5`; set `maxDepth` on a populate branch when a self-referencing relation needs a different cap.

### Soft Delete Visibility

When `softDelete` is enabled, standard model read paths hide deleted documents by default: `find()`, `findOne()`, `findOneById()`, `findByIds()`, `findPage()`, `findAndCount()`, `count()`, `distinct()`, `aggregate()`, `stream()`, and `explain()`. Pass `withDeleted: true` to include deleted documents or `onlyDeleted: true` to query only deleted documents.

For aggregation, monSQLize prepends a soft-delete `$match` stage before the user pipeline, or after `$geoNear` when that stage is first. Soft-delete filtering inside user-authored `$lookup` pipelines remains the application's responsibility.

## Caching and Performance

monSQLize can cache collection queries and arbitrary async functions.

```js
const users = msq.collection('users');

const hotUser = await users.findOne(
  { email: 'john@example.com' },
  { cache: 60_000 }
);
```

```js
const { withCache } = require('monsqlize');

async function getUserProfile(userId) {
  const user = await msq.collection('users').findOneById(userId);
  const orders = await msq.collection('orders').find({ userId }).toArray();
  return { user, orders };
}

const cachedGetUserProfile = withCache(getUserProfile, {
  ttl: 300_000,
  cache: msq.getCache()
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
await msq.withTransaction(async (tx) => {
  await msq.collection('orders').insertOne({ userId, status: 'pending' }, { session: tx.session });
  await msq.collection('users').updateOne(
    { _id: userId },
    { $inc: { orderCount: 1 } },
    { session: tx.session }
  );
});
```

Read options such as `session`, `readConcern`, `readPreference`, `collation`, `hint`, `maxTimeMS`, and `allowDiskUse` are forwarded to the MongoDB driver. Query caches are bypassed while a `session` is present, so transaction reads use the driver snapshot instead of a shared cache entry.

Transaction cache invalidations are recorded during the transaction and flushed only after a successful commit. If the transaction aborts, pending invalidations are discarded.

### Connection Pools

```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'main',
  config: { uri: 'mongodb://primary:27017' },
  pools: [
    { name: 'analytics', uri: 'mongodb://analytics:27017' }
  ]
});

const reports = msq.pool('analytics').collection('reports');
```

### Change Streams

```js
const watcher = msq.collection('orders').watch([
  { $match: { 'fullDocument.status': 'pending' } }
]);

watcher.on('change', (change) => {
  console.log('Order changed:', change.fullDocument);
});
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

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { enabled: true }
});

await msq.connect();
const users = msq.collection('users');
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

- Complete docs: [English](https://vextjs.github.io/monSQLize/) · [简体中文](https://vextjs.github.io/monSQLize/zh/)
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

Release preflight runs linting, type checks, size guards, runtime checks, compatibility checks, refactor guards, production dependency audit, the default test suite, and `npm pack --dry-run`.

`npm run release:publish` runs the preflight gate once and then calls `npm publish --ignore-scripts` so the final publish step does not repeat the full lifecycle gate. Raw `npm publish` is still guarded by `prepublishOnly`.

Optional commands:

```bash
npm run check:docs-examples
npm run test:examples
npm run test:coverage
npm run test:audit
npm run test:server-matrix
npm run test:real-env:private
```

`check:docs-examples` verifies the 97/97 bilingual documentation matrix, runnable-example runner parity, shared-example targets, doc-check targets, and user-facing path text.

`test:examples`, `test:server-matrix`, and `config.useMemoryServer` use a fixed `mongodb-memory-server` policy: MongoDB `7.0.14` by default, binaries cached under `.cache/mongodb-memory-server/binaries`, and temporary data paths created under `.cache/mongodb-memory-server/db` with forced cleanup for project-managed paths. Stale managed data paths whose owner PID is no longer alive are pruned before new memory-server launches. Override with `MONSQLIZE_MEMORY_MONGO_BINARY_VERSION`, `MONSQLIZE_REPLSET_BINARY_VERSION`, `MONGOMS_DOWNLOAD_DIR`, or `MONSQLIZE_MEMORY_SERVER_DB_DIR` when needed.

`test:coverage` is the independent 90% coverage governance gate for the published CJS runtime artifact. `test:audit` checks production dependencies against the npm registry. `test:real-env:private` is intentionally opt-in and expects private environment variables. Coverage and private real-environment checks are not part of the default CI or release gate.

## Release Status

The current release train targets `v2.0.7`.

Key release-readiness points:

- TypeScript rewrite completed for the current runtime and test entry points.
- Package exports are consolidated under `dist/cjs`, `dist/esm`, and `dist/types`.
- npm packages include the runtime bundles and declaration files only; source maps are disabled by default and can be generated locally with `MONSQLIZE_BUILD_SOURCEMAPS=1 npm run build`.
- v1 smooth-upgrade compatibility has been validated against the target workspace consumers.
- `schema-dsl` follows the npm `latest` TypeScript line `schema-dsl@2.1.1`; deprecated `2.3.x` mistake releases are intentionally excluded.
- GitHub Actions publishes to npm from `v*` tags after running `npm run release:preflight`; the publish step skips duplicate lifecycle scripts because the gate already ran in the same job.

## Roadmap

### Adapter roadmap

- MongoDB remains the stable adapter and the current production runtime.
- MySQL and PostgreSQL adapters will be introduced as database-native adapters under the same production runtime contract.
- Adapter status will move from planned to alpha/stable only after runtime support, public types, examples, and verification coverage are present.
- The project does not currently promise production-ready "one query syntax automatically adapts to every database" behavior.

### v2.0.7

- Package metadata and public release indexes now match the current data-runtime positioning without promoting business lock or Saga orchestration as primary package capabilities.
- Hidden business lock and Saga compatibility pages now make their v2 runtime boundaries explicit for existing callers.
- `npm run test:unit` uses the maintained unified runner unit group.
- Validation ledgers now match the current 56 runnable TypeScript documentation examples.
- Model v1 methods factory warnings now route through the runtime logger instead of direct console output.

### v2.0.8

- Model schema validation now uses an isolated `schema-dsl/runtime` instance per MonSQLize runtime, with `schemaDsl` configuration for runtime options, extension registration, runtime injection, explicit validation disablement, and fail-closed dependency resolution diagnostics.

### v2.0.6

- Dependency alignment carried the shared schema-dsl ESM/CJS custom type registry fix to downstream vext applications.
- NodeNext declaration compatibility for ESM consumers through generated `*.d.mts` mirrors and import-side `types` conditions.
- Restored v1-compatible root option type exports.

### v2.0.4

- Production-safe Model index rollout controls with `autoIndex`, dry-run preflight, conflict reporting, and explicit `ensureIndexes()` / `ensureModelIndexes()` APIs.
- `schema-dsl` updated to `2.0.9`, with transitive `cache-hub` aligned to `2.2.4`.
- User-facing capability and verification documentation wording cleaned up, plus documentation home experience refinements.

### v2.0.3

- v1 compatibility patch for documented `findPage({ cache })` behavior.
- Public transaction and distributed cache invalidator statistics APIs.
- Standalone documentation-site link safety and bilingual docs consistency fixes.
- Release preflight alignment for bilingual docs paths and production dependency audit.

### v2.0.2

- Deterministic dependency metadata patch.
- `ioredis` and `ssh2` are installed with monSQLize by default, so Redis-backed cache invalidation and SSH tunnels no longer require a separate dependency install step.

### v2.0.1

- v1 smooth-upgrade compatibility patch for Model actual collection names, scoped pools/databases, automatic-index dedupe, and cache/pool option aliases.
- Documentation and public types aligned with the current runtime behavior.

### v2.0.0

- TypeScript-native runtime and declarations.
- v1 smooth-upgrade compatibility bridge.
- Multi-level cache and function-cache support through `cache-hub`.
- Transactions, connection pools, Change Stream sync, and slow-query logging.
- Model layer with `schema-dsl` validation, relations, populate, hooks, and custom methods.

### v2.x

- Query analyzer improvements.
- Automatic index suggestions.
- Migration tooling.
- GraphQL integration experiments.
- More real-environment validation coverage.

### v3.0+

- MySQL runtime adapter experiments.
- PostgreSQL runtime adapter experiments.
- Shared production runtime capabilities across database-native adapters.
- Cross-database sync middleware experiments.

## License

monSQLize is released under the [Apache License 2.0](./LICENSE).

## Support

- Issues: [GitHub Issues](https://github.com/vextjs/monSQLize/issues)
- npm: [monsqlize](https://www.npmjs.com/package/monsqlize)
- Website: [https://vextjs.github.io/monSQLize/](https://vextjs.github.io/monSQLize/)
