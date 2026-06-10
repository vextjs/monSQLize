# API Reference Index

## Core Concepts

| Document | Description |
|----------|-------------|
| [mongodb-native-vs-extensions.md](mongodb-native-vs-extensions.md) | **MongoDB native APIs vs monSQLize extensions** |
| [connection.md](connection.md) | Connection management and configuration |
| [multi-pool.md](multi-pool.md) | **Enterprise-grade multi-pool management: read/write split, load balancing, and failover (v1.0.8+)** |
| [pool-chain-api.md](pool-chain-api.md) | **Chain pool/database access API: pool() / use() / scopedCollection() / scopedModel() (v1.3.0+)** |
| [objectid-auto-convert.md](objectid-auto-convert.md) | **ObjectId auto conversion: simpler ObjectId handling (v1.3.0+)** |
| [model.md](model.md) | **Model layer: schema validation, custom methods, lifecycle hooks (v1.0.3+)** |
| [populate.md](populate.md) | **Populate API: relation queries with six supported methods (v1.0.6+)** |
| [relations.md](relations.md) | **Relations API: hasOne / hasMany / belongsTo relation definitions (v1.0.6+)** |
| [hooks.md](hooks.md) | **Hooks API: insert / update / delete / find lifecycle hooks (v1.0.6+)** |
| [model/relations.md](model/relations.md) | **Relations and Populate: relation definitions and related-data population (v1.2.0+)** |
| [model/nested-populate.md](model/nested-populate.md) | **Nested Populate: multi-level relation population (v1.2.0+)** |
| [ssh-tunnel.md](ssh-tunnel.md) | **SSH tunnel: securely connect to private-network databases (v1.3+)** |
| [error-codes.md](error-codes.md) | **Error code reference: complete error-code definitions and handling guide** |
| [cache.md](cache.md) | Cache system (LRU + TTL) |
| [function-cache.md](function-cache.md) | **Function cache: add caching to any async function (v1.1.4+)** |
| [transaction.md](transaction.md) | Transaction management (automatic retry, cache locks) |
| [saga-transaction.md](saga-transaction.md) | **Saga distributed transactions: compensation-based cross-service workflows (v1.0.8+)** |
| [saga-advanced.md](saga-advanced.md) | **Advanced Saga features and implementation details** |
| [sync-backup.md](sync-backup.md) | **Change Stream data sync: real-time backup to multiple databases (v1.0.8+)** |
| [business-lock.md](business-lock.md) | **Business-level distributed locks** |
| [transaction-optimizations.md](transaction-optimizations.md) | Transaction optimization strategies |
| [distributed-deployment.md](distributed-deployment.md) | **Distributed deployment guide for multi-instance cache consistency** |
| [events.md](events.md) | Event system |

---

## Query Operations

| Document | Method | Description |
|----------|--------|-------------|
| [find.md](find.md) | `find()` | Query multiple documents |
| [findOne.md](findOne.md) | `findOne()` | Query one document |
| [find-one-by-id.md](find-one-by-id.md) | `findOneById()` | Convenience method for querying one document by `_id` |
| [find-by-ids.md](find-by-ids.md) | `findByIds()` | Convenience method for querying multiple documents by `_id` |
| [findPage.md](findPage.md) | `findPage()` | Cursor pagination query |
| [count.md](count.md) | `count()` | Count documents |
| [distinct.md](distinct.md) | `distinct()` | Distinct query |
| [watch.md](watch.md) | `watch()` | Watch real-time data changes with Change Streams |

---

## Write Operations

### Insert Operations

| Document | Method | Description |
|----------|--------|-------------|
| [insert-one.md](insert-one.md) | `insertOne()` | Insert one document |
| [insert-many.md](insert-many.md) | `insertMany()` | Insert many documents |
| [insertBatch.md](insertBatch.md) | `insertBatch()` | Large batch insert with batching and retry |
| [write-operations.md](write-operations.md) | All insert methods | Complete write operations guide |

### Update Operations

| Document | Method | Description |
|----------|--------|-------------|
| [update-operations.md](update-operations.md) | All update methods | Complete update operations guide |
| [upsert-guide.md](upsert-guide.md) | **Upsert guide** | Insert when missing, update when present |
| [update-one.md](update-one.md) | `updateOne()` | Update one document |
| [update-many.md](update-many.md) | `updateMany()` | Update many documents |
| [update-aggregation.md](update-aggregation.md) | Aggregation pipeline update | Field-to-field calculation and conditional assignment |
| [updateBatch.md](updateBatch.md) | `updateBatch()` | Large batch update with batching and retry |
| [replace-one.md](replace-one.md) | `replaceOne()` | Replace a whole document |
| [find-one-and-update.md](find-one-and-update.md) | `findOneAndUpdate()` | Atomically update and return |
| [find-one-and-replace.md](find-one-and-replace.md) | `findOneAndReplace()` | Atomically replace and return |

### Convenience Methods

| Document | Method | Description |
|----------|--------|-------------|
| [upsert-one.md](upsert-one.md) | `upsertOne()` | Update if present, insert if missing |
| [increment-one.md](increment-one.md) | `incrementOne()` | Atomically increment or decrement field values |

### Delete Operations

| Document | Method | Description |
|----------|--------|-------------|
| [delete-one.md](delete-one.md) | `deleteOne()` | Delete one document |
| [delete-many.md](delete-many.md) | `deleteMany()` | Delete many documents |
| [deleteBatch.md](deleteBatch.md) | `deleteBatch()` | Large batch delete with batching and retry |
| [find-one-and-delete.md](find-one-and-delete.md) | `findOneAndDelete()` | Atomically delete and return |

---

## Aggregation Operations

| Document | Method | Description |
|----------|--------|-------------|
| [aggregate.md](aggregate.md) | `aggregate()` | Aggregation pipeline query |

---

## Advanced Features

| Document | Description |
|----------|-------------|
| [chaining-api.md](chaining-api.md) | Chain query API |
| [chaining-methods.md](chaining-methods.md) | Detailed chain method reference |
| [explain.md](explain.md) | Query plan analysis |
| [bookmarks.md](bookmarks.md) | Pagination bookmark management |

---

## Utilities and Configuration

| Document | Description |
|----------|-------------|
| [utilities.md](utilities.md) | Utility functions |
| [collection-management.md](collection-management.md) | Collection management |
| [readPreference.md](readPreference.md) | Read preference settings |
| [count-queue.md](count-queue.md) | Count queue control for high-concurrency optimization |
| [distributed-deployment.md](distributed-deployment.md) | Distributed deployment configuration |

---

## Compatibility and Testing

| Document | Description |
|----------|-------------|
| [mongodb-driver-compatibility.md](mongodb-driver-compatibility.md) | Detailed MongoDB driver compatibility notes |
| [findOneAnd-return-value-unified.md](findOneAnd-return-value-unified.md) | Unified `findOneAnd*` return-value behavior |
| [esm-support.md](esm-support.md) | ES Module (`import`) support |

---

## By Feature Category

### CRUD Operations

**Create**

- [insert-one.md](insert-one.md) - `insertOne`
- [insert-many.md](insert-many.md) - `insertMany`
- [insertBatch.md](insertBatch.md) - `insertBatch`
- [write-operations.md](write-operations.md) - Complete write operations guide

**Read**

- [find.md](find.md) - `find`
- [findOne.md](findOne.md) - `findOne`
- [findPage.md](findPage.md) - `findPage`
- [count.md](count.md) - `count`
- [distinct.md](distinct.md) - `distinct`

**Update**

- [update-operations.md](update-operations.md) - Complete update operations guide
- [update-one.md](update-one.md) - `updateOne`
- [update-many.md](update-many.md) - `updateMany`
- [replace-one.md](replace-one.md) - `replaceOne`
- [find-one-and-update.md](find-one-and-update.md) - `findOneAndUpdate`
- [find-one-and-replace.md](find-one-and-replace.md) - `findOneAndReplace`

**Delete**

- [delete-one.md](delete-one.md) - `deleteOne`
- [delete-many.md](delete-many.md) - `deleteMany`
- [find-one-and-delete.md](find-one-and-delete.md) - `findOneAndDelete`

### Advanced Queries

- [aggregate.md](aggregate.md) - Aggregation pipelines
- [explain.md](explain.md) - Query plans
- [chaining-api.md](chaining-api.md) - Chain queries

### Performance and Cache

- [cache.md](cache.md) - Cache system
- [bookmarks.md](bookmarks.md) - Pagination optimization

---

## Entries, Examples, and Site Pages

| Document | Description |
|----------|-------------|
| [README.md](README.md) | Documentation directory index |
| [index.md](index.md) | Documentation site home |
| [api-index.md](api-index.md) | Current API reference index |
| [getting-started.md](getting-started.md) | Getting started guide |
| [examples.md](examples.md) | Example index |
| [recipes.md](recipes.md) | Common recipes |
| [capability-index.md](capability-index.md) | Capability index |

---

## Management, Indexes, and Expressions

| Document | Description |
|----------|-------------|
| [admin.md](admin.md) | Administration API |
| [database-ops.md](database-ops.md) | Database operations |
| [create-index.md](create-index.md) | Create one index |
| [create-indexes.md](create-indexes.md) | Create indexes in bulk |
| [drop-index.md](drop-index.md) | Drop an index |
| [list-indexes.md](list-indexes.md) | List indexes |
| [find-and-count.md](find-and-count.md) | Find and count |
| [expression-functions.md](expression-functions.md) | Expression functions |
| [quick-upsert.md](quick-upsert.md) | Quick upsert |

---

## Runtime, Deployment, and Governance

| Document | Description |
|----------|-------------|
| [runtime-architecture.md](runtime-architecture.md) | Runtime architecture |
| [support-matrix.md](support-matrix.md) | Support matrix |
| [roadmap-boundaries.md](roadmap-boundaries.md) | Roadmap boundaries |
| [file-dependency-governance.md](file-dependency-governance.md) | File dependency governance |
| [capability-traceability.md](capability-traceability.md) | Capability traceability |
| [release-preflight.md](release-preflight.md) | Release preflight |
| [verification-entrypoints.md](verification-entrypoints.md) | Verification entry points |
| [validation.md](validation.md) | Validation notes |

---

## ObjectId, Cache, and Troubleshooting

| Document | Description |
|----------|-------------|
| [objectid-conversion-scope.md](objectid-conversion-scope.md) | ObjectId conversion scope |
| [objectid-cross-version.md](objectid-cross-version.md) | ObjectId cross-version notes |
| [objectid-cross-version-faq.md](objectid-cross-version-faq.md) | ObjectId cross-version FAQ |
| [objectid-logging-optimization.md](objectid-logging-optimization.md) | ObjectId logging optimization |
| [cache-and-function-cache.md](cache-and-function-cache.md) | Cache and function-cache comparison |
| [cache-hub-migration.md](cache-hub-migration.md) | `cache-hub` migration |
| [slow-query-log.md](slow-query-log.md) | Slow-query logging |
| [failure-recovery-examples.md](failure-recovery-examples.md) | Failure recovery examples |
| [multi-pool-health-check.md](multi-pool-health-check.md) | Multi-pool health checks |
| [distributed-deployment-quickref.md](distributed-deployment-quickref.md) | Distributed deployment quick reference |
| [model/relations-quickstart.md](model/relations-quickstart.md) | Relations quick start |

---

## Quick Start Path

Recommended reading order for new users:

1. [connection.md](connection.md) - Learn how to connect to a database.
2. [find.md](find.md) - Learn basic queries.
3. [insert-one.md](insert-one.md) / [insert-many.md](insert-many.md) - Learn inserts.
4. [update-one.md](update-one.md) / [update-many.md](update-many.md) - Learn updates.
5. [delete-one.md](delete-one.md) / [delete-many.md](delete-many.md) - Learn deletes.
6. [cache.md](cache.md) - Understand the cache mechanism.
7. [transaction.md](transaction.md) - Learn transaction management.
8. [distributed-deployment.md](distributed-deployment.md) - Multi-instance deployment for production.

---

**Document count**: 97  
**Index coverage**: 97/97, including this index page  
**Last updated**: 2026-06-10

Recent additions:

- `esm-support.md` - ES Module (`import`) support
- `findOneAnd-return-value-unified.md` - Return-value unification notes
