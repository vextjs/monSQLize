# Examples Gallery

Every core API in the documentation site should map, as much as possible, to an example that can run directly inside the current repository.

> The full official example index lives in [`../../examples/README.md`](../../examples/README.md). `npm run test:examples` compiles and executes the current **43** TypeScript examples. `examples/helpers/bootstrap.ts` is a helper module and is not executed on its own.

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
| `delete-one.md` | `examples/docs/delete.ts` |
| `delete-many.md` | `examples/docs/delete-many.ts` |
| `deleteBatch.md` | `examples/docs/delete.ts` |
| `upsert-one.md` | `examples/docs/upsert-one.ts` |
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
| `collection-management.md` | `examples/docs/collection-management.ts` |
| `bookmarks.md` | `examples/docs/bookmarks.ts` |
| `slow-query-log.md` | `examples/docs/slow-query-log.ts` |
| `transaction.md` | `examples/docs/transaction.ts` |
| `watch.md` | `examples/docs/watch.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/aggregate-advanced.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/batch-operations.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/soft-delete.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/cache-multilevel.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/objectid.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/pool.ts` |
| `failure-recovery-examples.md` | `examples/docs/pool-fallback.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/sync.ts` |
| `failure-recovery-examples.md` | `examples/docs/sync-target-failure.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/lock.ts` |
| `failure-recovery-examples.md` | `examples/docs/lock-timeout.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/saga.ts` |
| `failure-recovery-examples.md` | `examples/docs/transaction-rollback.ts` |
| `examples/README.md` (combined capability index) | `examples/docs/populate-relations.ts` |

Some conceptual pages intentionally reuse the same richer example instead of duplicating nearly identical scripts for every heading. The complete source of truth is `examples/README.md`.
