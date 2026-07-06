# Core runtime structure description

> Goal: Give subsequent maintainers a structural diagram of "from entry to capability layer" to avoid continuing to pile logic back to `runtime-core.ts`.

## Module layering

```text
MonSQLizeRuntime (src/entry/runtime-core.ts)
├── entry helpers / compat accessors
│   ├── runtime-helpers.ts
│   └── runtime-compat-accessors.ts
├── capabilities
│   ├── cache / legacy function-cache compatibility
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

## Maintain boundaries

## Runtime consistency contract

monSQLize provides runtime coordination helpers, not a global strict-consistency kernel. Current guarantees are:

| Area | Contract | Boundary |
|------|----------|----------|
| MongoDB transactions | MongoDB session-bound ACID semantics | Cache invalidation is flushed after commit and is best-effort; a post-commit cache failure does not roll back the database transaction. |
| Query cache | Read-through cache with write-triggered invalidation | Redis/L2 cache and Pub/Sub invalidation provide shared cache state and eventual cross-instance coherence, not atomic cache/DB commits. |
| Transaction cache lock | Process-local cache write suppression during a transaction | `transaction.distributedLock` is kept as a compatibility config placeholder in v2 and is not wired into the transaction cache lock. |
| Change Stream sync | At-least-once delivery with strict resume-token persistence by default | A crash after target apply and before token save can replay the event; custom targets must be idempotent by change event `_id`. |
| Batch / CountQueue | Cooperative concurrency and timeout control | Timeouts abort the provided signal, but JavaScript cannot force-stop a task that ignores the signal. |

Use application/framework-level coordination, explicit `DistributedCacheLockManager` business locks, idempotency keys, fencing tokens, durable outbox/journals, or cache bypassing when a flow requires cross-instance strict consistency.


## `runtime-core.ts`

Only responsible for:

- runtime main class public API
- Ability assembly
- Connect / close / collection / db / model and other entry delegates

The heap should not continue:

- Complex write orchestration
- expression parsing details
- sync records/stores details
- compat-only type cleaning logic


## `runtime-helpers.ts` / `runtime-compat-accessors.ts`

Responsible for:

- Assembly details of runtime and model/accessor
- getter/cache/dbInstance bridge for v1 compatible paths


## capability / adapter layer

Responsible for:

- True behavioral semantics
- Corresponding module’s internal helpers, queues, storage, and orchestration

## Current hot spot governance results

| Hot Topics | Current Strategies |
|------|----------|
| `slow-query-log` | Split into config/queue/records/storage/manager |
| `writes` | Split into utils/basic/batch |
| `expression` | The compiler has been separated, and only the public API and traversal remain at the entrance |
| `collection-accessor` | The writing path has been moved to the helper, and the main file has returned façade |
| `ModelInstance` | mutation orchestration has moved out of the master file |

## Subsequent maintenance rules

1. New capabilities are given priority to enter `capabilities/` or `adapters/`, do not change `runtime-core.ts` first.
2. When compat-only logic is involved, `runtime-compat-accessors.ts` is entered first.
3. After hotspot reconstruction, at least add `test:refactor-guard` + corresponding capability layer regression.
