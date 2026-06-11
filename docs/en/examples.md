# Examples Gallery

Every core API in the documentation site should map, as much as possible, to an example that can run directly inside the current repository.

> See the [official examples index](https://github.com/vextjs/monSQLize/blob/main/examples/README.md) for the full source list. `npm run test:examples` compiles and executes the current **56** TypeScript examples. `examples/helpers/bootstrap.ts` is a helper module and is not executed on its own.

## How to Run

```bash
npm run build
npm run test:examples
```

`npm run test:examples` starts a shared `mongodb-memory-server` standalone instance and replica set in the parent process. It performs health checks between examples and passes the URI to every example child process. Binary cache is fixed at `.cache/mongodb-memory-server/binaries`, while temporary data directories are fixed at `.cache/mongodb-memory-server/db` and cleaned up on exit.

You can also run any example individually:

```bash
tsc -p tsconfig.examples.json
node .generated/examples-dist/examples/docs/find.js
```

## Quick Start

| Document | Example |
|----------|---------|
| `getting-started.md` | `examples/quick-start/basic-connect.ts` |
| `cache-and-function-cache.md` | `examples/cache/with-cache.ts` |
| `function-cache.md` | `examples/docs/function-cache.ts` |

## Query Operations

| Document | Example |
|----------|---------|
| `find.md` | `examples/docs/find.ts` |
| `findOne.md` | `examples/docs/find-one.ts` |
| `find-one-by-id.md` | `examples/docs/find-one-by-id.ts` |
| `find-by-ids.md` | `examples/docs/find-by-ids.ts` |
| `findPage.md` | `examples/docs/find-page.ts` |
| `find-and-count.md` | `examples/docs/find-and-count.ts` |
| `count.md` | `examples/docs/count.ts` |
| `count-queue.md` | `examples/docs/count-queue.ts` |
| `distinct.md` | `examples/docs/distinct.ts` |
| `aggregate.md` | `examples/docs/aggregate.ts` |
| `explain.md` | `examples/docs/explain.ts` |
| `chaining-api.md` | `examples/docs/chaining-api.ts` |

## Write Operations

| Document | Example |
|----------|---------|
| `insert-one.md` | `examples/docs/insert.ts` |
| `insert-many.md` | `examples/docs/insert-many.ts` |
| `insertBatch.md` | `examples/docs/insert.ts` |
| `update-one.md` | `examples/docs/update-one.ts` |
| `update-many.md` | `examples/docs/update.ts` |
| `updateBatch.md` | `examples/docs/update.ts` |
| `update-aggregation.md` | `examples/docs/update-aggregation.ts` |
| `delete-one.md` | `examples/docs/delete.ts` |
| `delete-many.md` | `examples/docs/delete-many.ts` |
| `deleteBatch.md` | `examples/docs/delete.ts` |
| `upsert-one.md` | `examples/docs/upsert-one.ts` |
| `quick-upsert.md` | `examples/docs/quick-upsert.ts` |
| `replace-one.md` | `examples/docs/upsert.ts` |
| `find-one-and-update.md` | `examples/docs/upsert.ts` |
| `find-one-and-replace.md` | `examples/docs/upsert.ts` |
| `find-one-and-delete.md` | `examples/docs/delete.ts` |
| `increment-one.md` | `examples/docs/update.ts` |

## Advanced Capabilities

| Document | Example |
|----------|---------|
| `expression-functions.md` | `examples/docs/expression-functions.ts` |
| `model.md` | `examples/docs/model.ts` |
| `hooks.md` | `examples/docs/hooks.ts` |
| `collection-management.md` | `examples/docs/collection-management.ts` |
| `create-index.md` | `examples/docs/index-management.ts` |
| `create-indexes.md` | `examples/docs/index-management.ts` |
| `list-indexes.md` | `examples/docs/index-management.ts` |
| `drop-index.md` | `examples/docs/index-management.ts` |
| `bookmarks.md` | `examples/docs/bookmarks.ts` |
| `slow-query-log.md` | `examples/docs/slow-query-log.ts` |
| `transaction.md` | `examples/docs/transaction.ts` |
| `transaction-optimizations.md` | `examples/docs/transaction-optimizations.ts` |
| `events.md` | `examples/docs/events.ts` |
| `watch.md` | `examples/docs/watch.ts` |
| `aggregate.md` | `examples/docs/aggregate-advanced.ts` |
| `write-operations.md` | `examples/docs/batch-operations.ts` |
| `model.md` | `examples/docs/soft-delete.ts` |
| `cache.md` | `examples/docs/cache-multilevel.ts` |
| `objectid-auto-convert.md` | `examples/docs/objectid.ts` |
| `multi-pool.md` | `examples/docs/pool.ts` |
| `pool-chain-api.md` | `examples/docs/pool-chain-api.ts` |
| `failure-recovery-examples.md` | `examples/docs/pool-fallback.ts` |
| `multi-pool-health-check.md` | `examples/docs/multi-pool-health-check.ts` |
| `sync-backup.md` | `examples/docs/sync.ts` |
| `failure-recovery-examples.md` | `examples/docs/sync-target-failure.ts` |
| `business-lock.md` | `examples/docs/lock.ts` |
| `failure-recovery-examples.md` | `examples/docs/lock-timeout.ts` |
| `saga-transaction.md` | `examples/docs/saga.ts` |
| `saga-advanced.md` | `examples/docs/saga-advanced.ts` |
| `failure-recovery-examples.md` | `examples/docs/transaction-rollback.ts` |
| `populate.md` | `examples/docs/populate-relations.ts` |
| `relations.md` | `examples/docs/relations.ts` |
| `model/nested-populate.md` | `examples/docs/nested-populate.ts` |

Some conceptual pages intentionally reuse the same richer example instead of duplicating nearly identical scripts for every heading. The complete source of truth is the [official examples index](https://github.com/vextjs/monSQLize/blob/main/examples/README.md).
