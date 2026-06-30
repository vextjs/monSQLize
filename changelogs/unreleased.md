# Unreleased

## Compatibility-impacting changes

- Versioned Model single-document writes now enforce true optimistic concurrency control: stale writes throw `WRITE_CONFLICT`, and writes without `expectedVersion`, `version`, or a direct `_id` automatic lookup path may throw `INVALID_ARGUMENT`.
- `find()` now defaults to `findLimit: 500`; explicit positive `limit` and `skip` values are bounded by `findMaxLimit` and `findMaxSkip`. `limit(0)` intentionally keeps MongoDB's unlimited cursor semantics.
- Change Stream resume token persistence is strict by default: token save/load failures stop synchronization unless `strictSave: false` / `strictLoad: false` is configured for legacy best-effort behavior.
- `updateBatch({ upsert: true })` is rejected because `updateBatch` walks existing matching `_id` values and cannot express MongoDB's single-document `updateMany(..., { upsert: true })` insert semantics. Use `upsertOne()` or native `updateMany(..., { upsert: true })` instead.
- `dropDatabase()` treats `NODE_ENV=production`, `prod`, and `live` as production-like environments that require `allowProduction: true`.
- Soft-delete filtering now covers the standard Model read surface including `findPage`, ID reads, `distinct`, `aggregate`, `stream`, and `explain`.
- Populate `skip` / `limit` for has-many relations is applied per parent document, and nested populate is capped by `maxDepth` (default `5`).
- `ConnectionPoolManager.addPool()` now applies the same strict pool config validation as the public validator before opening a client.
- Change Stream `collections: ['*']` now means all collections rather than a literal collection named `*`.

## Fixed / changed

- Fixed aggregate direct `.toArray()` to honor cache/meta execution paths, extended `find()` ObjectId auto-conversion to comparison operators, forwarded CountQueue abort signals into MongoDB count options, and added a warning when sync idempotency falls back to in-memory storage.
- Added a short-lived read-cache dirty barrier around writes and transaction commits. Cached reads now bypass and avoid refilling query cache while a namespace is being invalidated, reducing stale-cache windows when a process exits between a database write and post-write invalidation.
- Added optional Change Stream sync idempotency gates (`sync.idempotency`) with per-target keys and duplicate stats, so supervised restarts can skip targets already marked as applied before saving the shared resume token.
- Added strict optimistic-locking support to Model `updateBatch(..., { versionMode: 'strict' })`; default `counter` behavior remains unchanged.
- Clarified the runtime consistency contract across cache, transactions, Change Stream sync, and CountQueue; `transaction.distributedLock` now warns as a v1 compatibility placeholder because v2 transaction cache locks remain process-local.
- Added an event-level barrier for Change Stream sync target failures, passed a cooperative `AbortSignal` through `CountQueue.execute()` timeouts, and unified ObjectId auto-conversion field matching across query/write paths including nested array path segments.
- Clarified `updateMany(..., { upsert: true })` documentation: MongoDB inserts only one derived document when no documents match, so it is not a per-input bulk upsert replacement for `updateBatch`.
- Fixed Change Stream sync wildcard collection filters, made `updateBatch` / `deleteBatch` stream matching `_id` values while forwarding read options such as `session` / `collation` / `hint`, hardened pool config validation and health-check timeout cleanup, and aligned release/profile metadata.
- Added automatic optimistic locking for versioned Model single-document writes, including automatic direct-`_id` version lookup, explicit `expectedVersion` overrides, versioned `save()` replacement guards, and configurable `updateMany` version modes.
- Forwarded transaction/read options such as `session` into automatic model OCC version pre-reads, hardened file-backed Change Stream resume tokens with atomic replacement plus strict load validation, and made unexpected Change Stream closes visible through `isRunning: false` / `lastError`.
- Awaited async query-cache reads/writes so Redis/MultiLevel cache backends no longer make first cached reads resolve to `undefined`, and made Change Stream resume-token saves strict by default with retry knobs plus explicit `strictSave: false` legacy mode.
- Fixed `findPage` cursor anchors for nested dot-path sort fields, accepted `project` as a query projection alias across read helpers, and documented process-level Model registration plus ObjectId `maxDepth` conversion boundaries.
- Fixed `incrementOne` driver-option forwarding, closed runtime-owned Redis cache adapters on `runtime.close()`, made SSH tunnels fail fast for multi-host/SRV MongoDB URIs and post-ready disconnects, enforced slow-query batch `maxBufferSize` during in-flight flushes, wired prewarmed `findPage` bookmarks into page-jump reads, and reduced redundant rebuilds in the memory-server validation matrix.
- Fixed model mutable defaults cloning, preserved model aggregation-pipeline updates when timestamps/versioning are enabled, restored aggregate/distinct read-through cache plus targeted invalidation, and prevented sync resume tokens from advancing when any eligible target fails.
- Clarified hooks return-value compatibility and sync transform/delete-event boundaries in bilingual documentation, with regression coverage for the documented behavior.
- Prepared v2.0.7 release-readiness metadata, aligned package metadata with the legacy lock/Saga positioning, routed Model v1 methods factory warnings through the runtime logger, and aligned the unit runner plus validation ledgers with the current maintained suites.
- Fixed expression compiler precedence for mixed arithmetic/comparison expressions, preserved `$$` variables in FILTER/MAP/REDUCE, made ObjectId conversion handle shared object references consistently, routed `updateOne` update documents through `autoConvertObjectId` defaults, switched Redis lock scans to SCAN when available, and verified cursor signatures with timing-safe comparison.
- Added ObjectId conversion escape hatches (`excludeFields`, `{ field: false }`, `maxDepth`) while preserving value-based conversion by default; added `cursorTypes`, `cursorValueNormalizer`, and `requireCursorSecret` for findPage cursor safety and type restoration.
- Repositioned business lock and Saga APIs as legacy compatibility surfaces: public APIs remain available, but primary README, API index, capability index, examples index, recipes, and website navigation no longer promote them as recommended monSQLize capabilities.
- Added regression tests for expression variable references and precedence, ObjectId shared-reference conversion, `updateOne` conversion disabling, Redis lock SCAN usage, and cursor signature length mismatch.
- Clarified business lock, Saga, and cursor pagination documentation around process-local lock boundaries, Saga execution-state durability, unsigned cursor tokens, and ObjectId/Date cursor value normalization.
- Corrected ObjectId auto-conversion documentation to match the current value-based runtime behavior, including the instance-level `autoConvertObjectId` switch and the lack of stable field include/exclude or conversion-log controls.
- Clarified the `db()` / `collection()` / `use()` documentation path: quick-start and import examples now name the runtime `msq`, cross-database business examples prefer `use(name).collection(name)`, and `db(null)` validation docs now match the current runtime behavior.
- Repositioned README, package metadata, and bilingual documentation as a database-native production data runtime layer, with MongoDB stable today and MySQL/PostgreSQL adapters clearly marked as planned.
- Enhanced the documentation home hero illustration with CSS-driven SVG line flow, moving data packets, staggered node pulses, subtle scene breathing, and reduced-motion-safe visible cues.
