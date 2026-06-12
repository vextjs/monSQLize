# Advanced Capability Index

This page lists the stable capability entry points in the current TypeScript version of `monSQLize`.

Principles:

- Start with the API entry points users can call.
- Then point to the corresponding documentation and runnable examples.

## Current Capability Overview

| Capability | Recommended entry | Notes |
|------------|----------------------|-------|
| Model | `msq.model()` / `MonSQLize.Model` | Supports model registration, relations, virtuals, populate, and common query entries |
| transaction / lock | `startSession()` / `withTransaction()` / `withLock()` / `acquireLock()` / `tryAcquireLock()` | Supports transaction wrappers, local business locks, and distributed lock entries |
| pool | `pool()` / `ConnectionPoolManager` | Supports multi-pool configuration, selection strategies, fallback, and status inspection |
| sync | `startSync()` / `stopSync()` / `getSyncStats()` | Supports Change Stream sync start, stop, and status inspection |
| slow-query-log | `recordSlowQuery()` / `getSlowQueryLogs()` | Supports slow-query recording, querying, and runtime management |
| saga | `defineSaga()` / `executeSaga()` / `getSagaStats()` | Supports Saga definition, execution, compensation, and stats queries |

## 1. Model

Available entries:

- `Model.define/get/list/undefine/redefine`
- `msq.model()`
- relations / virtuals / populate
- `findOneById()` / `findByIds()` / `findAndCount()`

Model documentation and examples:

- Docs: `docs/model.md`, `docs/populate.md`, `docs/relations.md`
- Example: `examples/docs/model.ts`

## 2. transaction / lock

Available entries:

- `startSession()`
- `withTransaction()`
- `withLock()`
- `acquireLock()`
- `tryAcquireLock()`

Good first-use cases:

- Identifying the transaction wrapper entry.
- Adding the basic business-lock entry.

More advanced distributed lock strategies will continue to be documented in this site. For now, the current API and verified test behavior are the source of truth.

## 3. pool

Available entries:

- `pool()`
- `ConnectionPoolManager`
- `pools` / `poolStrategy` / `poolFallback` / `maxPoolsCount`

This is the current entry point for:

- Multi-pool onboarding.
- Configuration contract and runtime routing explanations.

## 4. sync / slow-query-log / saga

Available entries:

- sync: contract / manager / lifecycle
- slow-query-log: manager / queue / runtime façade
- saga: orchestrator / runtime façade

These capabilities include topic pages and runnable examples:

- sync: `docs/sync-backup.md`, examples `examples/docs/sync.ts` and `examples/docs/sync-target-failure.ts`
- slow-query-log: `docs/slow-query-log.md`, example `examples/docs/slow-query-log.ts`
- saga: `docs/saga-transaction.md`, `docs/saga-advanced.md`, example `examples/docs/saga.ts`

Future documentation will continue to cover runtime fault injection, real deployment topology, and performance boundaries.

## 5. Recommended Entries in This Repository

1. Documentation home: `docs/index.md`
2. API index: `docs/api-index.md`
3. Example index: `docs/examples.md`
4. Runnable examples: `examples/docs/*.ts`

## 6. Suggested Expansion Order

The most natural next expansion order is:

1. Model topic
2. transaction / lock topic
3. pool topic
4. sync / slow-query-log / saga advanced topics
