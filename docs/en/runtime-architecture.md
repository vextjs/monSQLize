# Runtime consistency and boundaries

monSQLize is a database-native runtime layer. It coordinates MongoDB access, model validation, cache, transactions, pools, sync, and observability, but it does not turn those capabilities into one global strict-consistency system.

Use this page to decide which entry point to use and where application-level guarantees are still required.

## Runtime layers

```text
MonSQLizeRuntime (src/entry/runtime-core.ts)
├── entry helpers / compat accessors
│   ├── runtime-helpers.ts
│   └── runtime-compat-accessors.ts
├── capabilities
│   ├── database query cache
│   ├── model
│   ├── pool
│   ├── sync
│   ├── slow-query-log
│   ├── transaction
│   └── count-queue
├── adapters
│   └── mongodb/common + writes
└── core
    ├── expression
    └── errors / logger / utils
```

## Runtime consistency contract

monSQLize provides runtime coordination helpers, not a global strict-consistency kernel. Current guarantees are:

| Area | Contract | Boundary |
|------|----------|----------|
| MongoDB transactions | MongoDB session-bound ACID semantics | Cache invalidation is flushed after commit and is best-effort; a post-commit cache failure does not roll back the database transaction. |
| Query cache | Read-through cache with explicit write invalidation | Redis/L2 cache and Pub/Sub invalidation provide shared cache state and eventual cross-instance coherence, not atomic cache/DB commits. |
| Transaction cache lock | Process-local cache write suppression during a transaction | `transaction.distributedLock` is kept as a compatibility config placeholder in v3 and is not wired into the transaction cache lock. |
| Change Stream sync | At-least-once delivery with strict resume-token persistence by default | A crash after target apply and before token save can replay the event; custom targets must be idempotent by change event `_id`. |
| Batch / CountQueue | Cooperative concurrency and timeout control | Timeouts abort the provided signal, but JavaScript cannot force-stop a task that ignores the signal. |

Use application/framework-level coordination, explicit `DistributedCacheLockManager` business locks, idempotency keys, fencing tokens, durable outbox/journals, or cache bypassing when a flow requires cross-instance strict consistency.

## Choosing the right entry point

| Need | Recommended entry |
|------|-------------------|
| Normal collection access | `const { collection } = await msq.connect()` |
| Model schema validation and hooks | `msq.model()` or `MonSQLize.Model` |
| Model-only writes for selected namespaces | `writePathPolicy` |
| Query cache | Query `cache` options plus `msq.cache` invalidation/stat APIs |
| Multi-pool routing | Constructor `pools: PoolConfig[]`, then `msq.pool()` |
| Transactions | `startSession()` and `withTransaction()` |
| Change Stream fanout | `startSync()`, `stopSync()`, and `getSyncStats()` |
| Strict business locks | `DistributedCacheLockManager` with an application idempotency/fencing design |

## When to add application-level guarantees

Add explicit application guarantees when a workflow requires all of the following at the same time:

1. Database write success and cache visibility must be atomic.
2. Sync targets cannot tolerate replay.
3. A lock must protect multiple Node.js processes or multiple regions.
4. A batch operation must behave exactly like a sequence of per-document business operations.

For those paths, combine monSQLize with durable outbox records, idempotency keys, application-level retries, or cache bypassing for the critical read path.
