# Advanced Capability Index

This page lists the stable capability entry points in the current TypeScript version of `monSQLize`.

monSQLize is a database-native production data runtime layer. The current stable adapter is MongoDB; MySQL and PostgreSQL are planned as future adapters and are not part of the current npm runtime.

Principles:

- Start with the API entry points users can call.
- Then point to the corresponding documentation and runnable examples.

## Current Capability Overview

| Layer | Current status | Scope |
|-------|----------------|-------|
| Shared runtime | Stable where exposed by the current runtime | Database cache, pools, transactions, model constraints, sync, slow-query logging, and runtime diagnostics |
| MongoDB adapter | Stable | `collection()`, `db()`, `use()`, `pool()`, query/write helpers, aggregation, indexes, transactions, Change Streams |
| MySQL adapter | Planned / in development | Future database-native adapter, no current public runtime API |
| PostgreSQL adapter | Planned / in development | Future database-native adapter, no current public runtime API |

| Capability | Recommended entry | Notes |
|------------|----------------------|-------|
| Model | `msq.model()` / `MonSQLize.Model` | Supports model registration, relations, virtuals, populate, and common query entries |
| write-path-policy | `writePathPolicy` | Optional runtime guard for Model-only write namespaces |
| cache | Query `cache` options / `msq.cache` | Database query cache, multi-layer cache access, invalidation, and statistics |
| transaction | `startSession()` / `withTransaction()` | Supports MongoDB transaction wrappers and transaction statistics |
| pool | `pools` / `pool()` / `ConnectionPoolManager` | Declare `pools: PoolConfig[]` in the constructor, route with `pool()`, and use the low-level manager for advanced inspection or manual management |
| sync | `startSync()` / `stopSync()` / `getSyncStats()` | Supports Change Stream sync start, stop, and status inspection |
| slow-query-log | `recordSlowQuery()` / `getSlowQueryLogs()` | Supports slow-query recording, querying, and runtime management |

## 1. Model

Available entries:

- `Model.define/get/list/undefine/redefine`
- `msq.model()`
- relations / virtuals / populate
- common model queries such as `findOne()` and `findAndCount()`

Model documentation and examples:

- Docs: `docs/model.md`, `docs/populate.md`, `docs/relations.md`
- Example: `examples/docs/model.ts`

## 2. write-path-policy

Available entries:

- `writePathPolicy.default`
- `writePathPolicy.namespaces`
- `WritePathPolicyOptions`

Use this when selected namespaces should be written through `msq.model()` instead of direct `collection()` writes. See `docs/en/write-path-policy.md`.

## 3. transaction

Available entries:

- `startSession()`
- `withTransaction()`

Good first-use cases:

- Identifying the transaction wrapper entry.
- Inspecting transaction retry, timeout, and statistics behavior.

## 4. pool

Available entries:

- `pool()`
- `ConnectionPoolManager`
- `pools` / `poolStrategy` / `poolFallback` / `maxPoolsCount`

This is the current entry point for:

- Multi-pool onboarding.
- Configuration contract and runtime routing explanations.

## 5. sync / slow-query-log

Available entries:

- sync: contract / manager / lifecycle
- slow-query-log: manager / queue / runtime façade

These capabilities include topic pages and runnable examples:

- sync: `docs/sync-backup.md`, examples `examples/docs/sync.ts` and `examples/docs/sync-target-failure.ts`
- slow-query-log: `docs/slow-query-log.md`, example `examples/docs/slow-query-log.ts`

Future documentation will continue to cover runtime fault injection, real deployment topology, and performance boundaries.

## 6. Recommended Entries in This Repository

1. Documentation home: `docs/index.md`
2. API index: `docs/api-index.md`
3. Example index: `docs/examples.md`
4. Runnable examples: `examples/docs/*.ts`

## 7. Suggested Expansion Order

The most natural next expansion order is:

1. Model topic
2. transaction topic
3. pool topic
4. sync / slow-query-log advanced topics
