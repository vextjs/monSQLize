# Advanced Capability Index

This page is the formal entry index for capabilities restored in the current TypeScript version of `monSQLize`.

Principles:

- First state what the current repository formally owns.
- Then point to the corresponding documentation and runnable examples in this repository.

## Current Capability Overview

| Capability | Current formal entry | Current status | Notes |
|------------|----------------------|----------------|-------|
| Model | `msq.model()` / `MonSQLize.Model` | ✅ Restored | Minimal registry / features loop is in place |
| transaction / lock | `startSession()` / `withTransaction()` / `withLock()` / `acquireLock()` / `tryAcquireLock()` | ✅ Restored | Current runtime / types / unit / integration coverage is closed |
| pool | `pool()` / `ConnectionPoolManager` | ✅ Restored | Minimal multi-pool loop is in place |
| sync | `startSync()` / `stopSync()` / `getSyncStats()` | ✅ Restored | Minimal lifecycle / manager loop is in place |
| slow-query-log | `recordSlowQuery()` / `getSlowQueryLogs()` | ✅ Restored | Manager / queue / runtime façade are in place |
| saga | `defineSaga()` / `executeSaga()` / `getSagaStats()` | ✅ Restored | Orchestrator / runtime façade are in place |

## 1. Model

The current repository formally restores:

- `Model.define/get/list/undefine/redefine`
- `msq.model()`
- relations / virtuals / populate
- `findById()` / `findByIds()` / `findAndCount()`

Current Model entries:

- Docs: `docs/model.md`, `docs/populate.md`, `docs/relations.md`
- Example: `examples/docs/model.ts`

## 2. transaction / lock

The current repository formally restores:

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

The current repository formally restores:

- `pool()`
- `ConnectionPoolManager`
- `pools` / `poolStrategy` / `poolFallback` / `maxPoolsCount`

This is the current entry point for:

- Multi-pool onboarding.
- Configuration contract and runtime routing explanations.

## 4. sync / slow-query-log / saga

The current repository formally restores the minimal public surface for:

- sync: contract / manager / lifecycle
- slow-query-log: manager / queue / runtime façade
- saga: orchestrator / runtime façade

The repository already provides topic pages and runnable examples:

- sync: `docs/sync-backup.md`, examples `examples/docs/sync.ts` and `examples/docs/sync-target-failure.ts`
- slow-query-log: `docs/slow-query-log.md`, example `examples/docs/slow-query-log.ts`
- saga: `docs/saga-transaction.md`, `docs/saga-advanced.md`, example `examples/docs/saga.ts`

The next expansion focus is runtime fault injection, real deployment topology, and performance boundaries rather than filling in basic entry points.

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
