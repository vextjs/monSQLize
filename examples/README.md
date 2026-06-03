# monSQLize Examples

Runnable TypeScript examples for every major monSQLize API.
Each file uses an in-memory MongoDB server (`mongodb-memory-server`) — no real database needed.

> 当前共 **43 个**可执行 TypeScript 示例，另有 `examples/helpers/bootstrap.ts` 作为示例辅助模块；可执行示例统一由 `npm run test:examples` 编译并执行。

## Prerequisites

```bash
npm install       # install all deps
npm run build     # build the library
```

## Quick Start

```bash
# Compile all examples
tsc -p tsconfig.examples.json

# Run a single example
node .generated/examples-dist/examples/quick-start/basic-connect.js
```

## Run All Examples

```bash
npm run test:examples
```

## Example Index

### Quick Start

| File | Description |
|------|-------------|
| [`quick-start/basic-connect.ts`](quick-start/basic-connect.ts) | Connect, CRUD lifecycle, disconnect |

### Cache

| File | Description |
|------|-------------|
| [`cache/with-cache.ts`](cache/with-cache.ts) | Per-collection cache TTL, hit/miss, `invalidate()` |

### Docs — CRUD

| File | Description |
|------|-------------|
| [`docs/insert.ts`](docs/insert.ts) | `insertOne`, `insertMany`, `insertBatch` |
| [`docs/insert-many.ts`](docs/insert-many.ts) | Focused `insertMany()` example |
| [`docs/update.ts`](docs/update.ts) | `updateOne`, `updateMany`, `updateBatch`, `incrementOne` |
| [`docs/update-one.ts`](docs/update-one.ts) | Focused `updateOne()` example |
| [`docs/delete.ts`](docs/delete.ts) | `deleteOne`, `deleteMany`, `deleteBatch` |
| [`docs/delete-many.ts`](docs/delete-many.ts) | Focused `deleteMany()` example |
| [`docs/upsert.ts`](docs/upsert.ts) | `upsertOne`, `findOneAndUpdate`, `findOneAndReplace`, `replaceOne` |
| [`docs/upsert-one.ts`](docs/upsert-one.ts) | Focused `upsertOne()` example |

### Docs — Query

| File | Description |
|------|-------------|
| [`docs/find.ts`](docs/find.ts) | `find` with sort, limit, skip, project |
| [`docs/find-one.ts`](docs/find-one.ts) | `findOne`, `findOneById`, `findByIds` |
| [`docs/find-one-by-id.ts`](docs/find-one-by-id.ts) | Focused `findOneById()` example |
| [`docs/find-by-ids.ts`](docs/find-by-ids.ts) | Focused `findByIds()` example |
| [`docs/find-page.ts`](docs/find-page.ts) | `findPage` — cursor and offset pagination |
| [`docs/find-and-count.ts`](docs/find-and-count.ts) | `findAndCount` — returns `{ data, total }` |
| [`docs/count.ts`](docs/count.ts) | Focused `count()` example |
| [`docs/distinct.ts`](docs/distinct.ts) | Focused `distinct()` example |
| [`docs/explain.ts`](docs/explain.ts) | Focused `explain()` example |
| [`docs/aggregate.ts`](docs/aggregate.ts) | Aggregation pipeline stages |
| [`docs/chaining-api.ts`](docs/chaining-api.ts) | `FindChain` and `AggregateChain` fluent builders |

### Docs — Advanced

| File | Description |
|------|-------------|
| [`docs/aggregate-advanced.ts`](docs/aggregate-advanced.ts) | Multi-stage analytics aggregation with grouping, sorting, and post-processing |
| [`docs/batch-operations.ts`](docs/batch-operations.ts) | High-volume `insertBatch` / `updateBatch` / `deleteBatch` workflows |
| [`docs/expression-functions.ts`](docs/expression-functions.ts) | `MonSQLize.expr()` for reusable pipeline expressions |
| [`docs/model.ts`](docs/model.ts) | Model schema + lifecycle hooks (pre/post) |
| [`docs/collection-management.ts`](docs/collection-management.ts) | `createCollection`, `createView`, index management, `db().admin()` |
| [`docs/bookmarks.ts`](docs/bookmarks.ts) | `prewarmBookmarks`, `listBookmarks`, `clearBookmarks` |
| [`docs/transaction.ts`](docs/transaction.ts) | `withTransaction()` with an in-memory replica-set |
| [`docs/transaction-rollback.ts`](docs/transaction-rollback.ts) | Focused rollback / recovery path for failed transactions |
| [`docs/slow-query-log.ts`](docs/slow-query-log.ts) | Slow query log configuration |
| [`docs/watch.ts`](docs/watch.ts) | Change streams — native ChangeStream events |
| [`docs/lock.ts`](docs/lock.ts) | Distributed lock — acquire/release/try-lock |
| [`docs/lock-timeout.ts`](docs/lock-timeout.ts) | Lock contention / timeout / recovery flow |
| [`docs/saga.ts`](docs/saga.ts) | Saga / multi-step transactional workflow with rollback |
| [`docs/populate-relations.ts`](docs/populate-relations.ts) | Cross-collection populate relations |
| [`docs/increment-one.ts`](docs/increment-one.ts) | `incrementOne` — atomic counter field increments |
| [`docs/soft-delete.ts`](docs/soft-delete.ts) | Soft-delete lifecycle with filtered reads and restore-ready data shape |

### Docs — High-Level Capabilities

| File | Description |
|------|-------------|
| [`docs/cache-multilevel.ts`](docs/cache-multilevel.ts) | Multi-level cache: L1 MemoryCache + L2 Redis stub + DistributedCacheInvalidator + FunctionCache |
| [`docs/objectid.ts`](docs/objectid.ts) | ObjectId auto-conversion: insert/find/findByIds/update/delete with plain string IDs |
| [`docs/pool.ts`](docs/pool.ts) | ConnectionPoolManager — multi-pool routing with auto/round-robin/weighted strategies |
| [`docs/pool-fallback.ts`](docs/pool-fallback.ts) | Pool health degradation with automatic fallback and recovery |
| [`docs/sync.ts`](docs/sync.ts) | ChangeStreamSyncManager + ResumeTokenStore — resume-token-based change stream sync |
| [`docs/sync-target-failure.ts`](docs/sync-target-failure.ts) | Sync target failure accounting and recovery path |

## Running Individual Examples

```bash
# After building:
tsc -p tsconfig.examples.json

node .generated/examples-dist/examples/quick-start/basic-connect.js
node .generated/examples-dist/examples/cache/with-cache.js
node .generated/examples-dist/examples/docs/insert.js
node .generated/examples-dist/examples/docs/insert-many.js
node .generated/examples-dist/examples/docs/update.js
node .generated/examples-dist/examples/docs/update-one.js
node .generated/examples-dist/examples/docs/delete.js
node .generated/examples-dist/examples/docs/delete-many.js
node .generated/examples-dist/examples/docs/upsert.js
node .generated/examples-dist/examples/docs/upsert-one.js
node .generated/examples-dist/examples/docs/find.js
node .generated/examples-dist/examples/docs/find-one.js
node .generated/examples-dist/examples/docs/find-one-by-id.js
node .generated/examples-dist/examples/docs/find-by-ids.js
node .generated/examples-dist/examples/docs/find-page.js
node .generated/examples-dist/examples/docs/find-and-count.js
node .generated/examples-dist/examples/docs/count.js
node .generated/examples-dist/examples/docs/distinct.js
node .generated/examples-dist/examples/docs/explain.js
node .generated/examples-dist/examples/docs/aggregate.js
node .generated/examples-dist/examples/docs/aggregate-advanced.js
node .generated/examples-dist/examples/docs/batch-operations.js
node .generated/examples-dist/examples/docs/chaining-api.js
node .generated/examples-dist/examples/docs/expression-functions.js
node .generated/examples-dist/examples/docs/model.js
node .generated/examples-dist/examples/docs/collection-management.js
node .generated/examples-dist/examples/docs/bookmarks.js
node .generated/examples-dist/examples/docs/transaction.js
node .generated/examples-dist/examples/docs/transaction-rollback.js
node .generated/examples-dist/examples/docs/slow-query-log.js
node .generated/examples-dist/examples/docs/watch.js
node .generated/examples-dist/examples/docs/lock.js
node .generated/examples-dist/examples/docs/lock-timeout.js
node .generated/examples-dist/examples/docs/saga.js
node .generated/examples-dist/examples/docs/soft-delete.js
node .generated/examples-dist/examples/docs/populate-relations.js
node .generated/examples-dist/examples/docs/increment-one.js
node .generated/examples-dist/examples/docs/cache-multilevel.js
node .generated/examples-dist/examples/docs/objectid.js
node .generated/examples-dist/examples/docs/pool.js
node .generated/examples-dist/examples/docs/pool-fallback.js
node .generated/examples-dist/examples/docs/sync.js
node .generated/examples-dist/examples/docs/sync-target-failure.js
```
