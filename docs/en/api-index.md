# API Reference Index

## Core Concepts

| Document | Description |
|----------|-------------|
| [Native API comparison](mongodb-native-vs-extensions.md) | **MongoDB native APIs vs monSQLize extensions** |
| [Connection configuration](connection.md) | Connection management and configuration |
| [Multi-pool management](multi-pool.md) | **Enterprise-grade multi-pool management: read/write split, load balancing, and failover (v1.0.8+)** |
| [Chain pool/database access](pool-chain-api.md) | **Chain pool/database access API: pool() / use() / scopedCollection() / scopedModel() (v1.3.0+)** |
| [ObjectId auto conversion](objectid-auto-convert.md) | **ObjectId auto conversion: simpler ObjectId handling (v1.3.0+)** |
| [Model layer](model.md) | **Model layer: schema validation, custom methods, lifecycle hooks (v1.0.3+)** |
| [Populate API](populate.md) | **Populate API: relation queries with six supported methods (v1.0.6+)** |
| [Relations API](relations.md) | **Relations API: hasOne / hasMany / belongsTo relation definitions (v1.0.6+)** |
| [Hooks API](hooks.md) | **Hooks API: insert / update / delete / find lifecycle hooks (v1.0.6+)** |
| [Relations and Populate](model/relations.md) | **Relations and Populate: relation definitions and related-data population (v1.2.0+)** |
| [Nested Populate](model/nested-populate.md) | **Nested Populate: multi-level relation population (v1.2.0+)** |
| [SSH tunnel](ssh-tunnel.md) | **SSH tunnel: securely connect to private-network databases (v1.3+)** |
| [Error code reference](error-codes.md) | **Error code reference: complete error-code definitions and handling guide** |
| [Cache system](cache.md) | Cache system (LRU + TTL) |
| [Function cache](function-cache.md) | **Function cache: add caching to any async function (v1.1.4+)** |
| [Transaction management](transaction.md) | Transaction management (automatic retry, cache locks) |
| [Saga transactions](saga-transaction.md) | **Saga distributed transactions: compensation-based cross-service workflows (v1.0.8+)** |
| [Advanced Saga](saga-advanced.md) | **Advanced Saga features and implementation details** |
| [Change Stream sync](sync-backup.md) | **Change Stream data sync: real-time backup to multiple databases (v1.0.8+)** |
| [Business locks](business-lock.md) | **Business-level distributed locks** |
| [Transaction optimizations](transaction-optimizations.md) | Transaction optimization strategies |
| [Distributed deployment](distributed-deployment.md) | **Distributed deployment guide for multi-instance cache consistency** |
| [Event system](events.md) | Event system |

---

## Query Operations

| Document | Method | Description |
|----------|--------|-------------|
| [Find documents](find.md) | `find()` | Query multiple documents |
| [Find one document](findOne.md) | `findOne()` | Query one document |
| [Find one by id](find-one-by-id.md) | `findOneById()` | Convenience method for querying one document by `_id` |
| [Find by ids](find-by-ids.md) | `findByIds()` | Convenience method for querying multiple documents by `_id` |
| [Paginated find](findPage.md) | `findPage()` | Cursor pagination query |
| [Count documents](count.md) | `count()` | Count documents |
| [Distinct values](distinct.md) | `distinct()` | Distinct query |
| [Watch changes](watch.md) | `watch()` | Watch real-time data changes with Change Streams |

---

## Write Operations

### Insert Operations

| Document | Method | Description |
|----------|--------|-------------|
| [Insert one document](insert-one.md) | `insertOne()` | Insert one document |
| [Insert many documents](insert-many.md) | `insertMany()` | Insert many documents |
| [Batch insert](insertBatch.md) | `insertBatch()` | Large batch insert with batching and retry |
| [Write operations guide](write-operations.md) | All insert methods | Complete write operations guide |

### Update Operations

| Document | Method | Description |
|----------|--------|-------------|
| [Update operations guide](update-operations.md) | All update methods | Complete update operations guide |
| [Upsert guide](upsert-guide.md) | **Upsert guide** | Insert when missing, update when present |
| [Update one document](update-one.md) | `updateOne()` | Update one document |
| [Update many documents](update-many.md) | `updateMany()` | Update many documents |
| [Aggregation pipeline updates](update-aggregation.md) | Aggregation pipeline update | Field-to-field calculation and conditional assignment |
| [Batch update](updateBatch.md) | `updateBatch()` | Large batch update with batching and retry |
| [Replace one document](replace-one.md) | `replaceOne()` | Replace a whole document |
| [Find one and update](find-one-and-update.md) | `findOneAndUpdate()` | Atomically update and return |
| [Find one and replace](find-one-and-replace.md) | `findOneAndReplace()` | Atomically replace and return |

### Convenience Methods

| Document | Method | Description |
|----------|--------|-------------|
| [Upsert one document](upsert-one.md) | `upsertOne()` | Update if present, insert if missing |
| [Increment one document](increment-one.md) | `incrementOne()` | Atomically increment or decrement field values |

### Delete Operations

| Document | Method | Description |
|----------|--------|-------------|
| [Delete one document](delete-one.md) | `deleteOne()` | Delete one document |
| [Delete many documents](delete-many.md) | `deleteMany()` | Delete many documents |
| [Batch delete](deleteBatch.md) | `deleteBatch()` | Large batch delete with batching and retry |
| [Find one and delete](find-one-and-delete.md) | `findOneAndDelete()` | Atomically delete and return |

---

## Aggregation Operations

| Document | Method | Description |
|----------|--------|-------------|
| [Aggregation pipeline](aggregate.md) | `aggregate()` | Aggregation pipeline query |

---

## Advanced Features

| Document | Description |
|----------|-------------|
| [Chain query API](chaining-api.md) | Chain query API |
| [Chain method reference](chaining-methods.md) | Detailed chain method reference |
| [Query plan analysis](explain.md) | Query plan analysis |
| [Pagination bookmarks](bookmarks.md) | Pagination bookmark management |

---

## Utilities and Configuration

| Document | Description |
|----------|-------------|
| [Utility functions](utilities.md) | Utility functions |
| [Collection management](collection-management.md) | Collection management |
| [Read preference](readPreference.md) | Read preference settings |
| [Count queue](count-queue.md) | Count queue control for high-concurrency optimization |
| [Distributed deployment](distributed-deployment.md) | Distributed deployment configuration |

---

## Compatibility and Testing

| Document | Description |
|----------|-------------|
| [MongoDB driver compatibility](mongodb-driver-compatibility.md) | Detailed MongoDB driver compatibility notes |
| [findOneAnd return values](findOneAnd-return-value-unified.md) | Unified `findOneAnd*` return-value behavior |
| [ESM support](esm-support.md) | ES Module (`import`) support |

---

## By Feature Category

### CRUD Operations

**Create**

- [Insert one document](insert-one.md) - `insertOne`
- [Insert many documents](insert-many.md) - `insertMany`
- [Batch insert](insertBatch.md) - `insertBatch`
- [Write operations guide](write-operations.md) - Complete write operations guide

**Read**

- [Find documents](find.md) - `find`
- [Find one document](findOne.md) - `findOne`
- [Paginated find](findPage.md) - `findPage`
- [Count documents](count.md) - `count`
- [Distinct values](distinct.md) - `distinct`

**Update**

- [Update operations guide](update-operations.md) - Complete update operations guide
- [Update one document](update-one.md) - `updateOne`
- [Update many documents](update-many.md) - `updateMany`
- [Replace one document](replace-one.md) - `replaceOne`
- [Find one and update](find-one-and-update.md) - `findOneAndUpdate`
- [Find one and replace](find-one-and-replace.md) - `findOneAndReplace`

**Delete**

- [Delete one document](delete-one.md) - `deleteOne`
- [Delete many documents](delete-many.md) - `deleteMany`
- [Find one and delete](find-one-and-delete.md) - `findOneAndDelete`

### Advanced Queries

- [Aggregation pipeline](aggregate.md) - Aggregation pipelines
- [Query plans](explain.md) - Query plans
- [Chain queries](chaining-api.md) - Chain queries

### Performance and Cache

- [Cache system](cache.md) - Cache system
- [Pagination bookmarks](bookmarks.md) - Pagination optimization

---

## Entries, Examples, and Site Pages

| Document | Description |
|----------|-------------|
| [Documentation index](README.md) | Documentation directory index |
| [Site home](index.md) | Documentation site home |
| [API reference index](api-index.md) | Current API reference index |
| [Getting started](getting-started.md) | Getting started guide |
| [Examples](examples.md) | Example index |
| [Recipes](recipes.md) | Common recipes |
| [Capability index](capability-index.md) | Capability index |

---

## Management, Indexes, and Expressions

| Document | Description |
|----------|-------------|
| [Administration API](admin.md) | Administration API |
| [Database operations](database-ops.md) | Database operations |
| [Create one index](create-index.md) | Create one index |
| [Create indexes in bulk](create-indexes.md) | Create indexes in bulk |
| [Drop an index](drop-index.md) | Drop an index |
| [List indexes](list-indexes.md) | List indexes |
| [Find and count](find-and-count.md) | Find and count |
| [Expression functions](expression-functions.md) | Expression functions |
| [Quick upsert](quick-upsert.md) | Quick upsert |

---

## Runtime, Deployment, and Governance

| Document | Description |
|----------|-------------|
| [Runtime architecture](runtime-architecture.md) | Runtime architecture |
| [Support matrix](support-matrix.md) | Support matrix |
| [Roadmap boundaries](roadmap-boundaries.md) | Roadmap boundaries |
| [File dependency governance](file-dependency-governance.md) | File dependency governance |
| [Capability traceability](capability-traceability.md) | Capability traceability |
| [Release preflight](release-preflight.md) | Release preflight |
| [Verification entry points](verification-entrypoints.md) | Verification entry points |
| [Validation notes](validation.md) | Validation notes |

---

## ObjectId, Cache, and Troubleshooting

| Document | Description |
|----------|-------------|
| [ObjectId conversion scope](objectid-conversion-scope.md) | ObjectId conversion scope |
| [ObjectId cross-version notes](objectid-cross-version.md) | ObjectId cross-version notes |
| [ObjectId cross-version FAQ](objectid-cross-version-faq.md) | ObjectId cross-version FAQ |
| [ObjectId logging optimization](objectid-logging-optimization.md) | ObjectId logging optimization |
| [Cache and function-cache comparison](cache-and-function-cache.md) | Cache and function-cache comparison |
| [`cache-hub` migration](cache-hub-migration.md) | `cache-hub` migration |
| [Slow-query logging](slow-query-log.md) | Slow-query logging |
| [Failure recovery examples](failure-recovery-examples.md) | Failure recovery examples |
| [Multi-pool health checks](multi-pool-health-check.md) | Multi-pool health checks |
| [Distributed deployment quick reference](distributed-deployment-quickref.md) | Distributed deployment quick reference |
| [Relations quick start](model/relations-quickstart.md) | Relations quick start |

---

## Quick Start Path

Recommended reading order for new users:

1. [Connection configuration](connection.md) - Learn how to connect to a database.
2. [Find documents](find.md) - Learn basic queries.
3. [Insert one document](insert-one.md) / [Insert many documents](insert-many.md) - Learn inserts.
4. [Update one document](update-one.md) / [Update many documents](update-many.md) - Learn updates.
5. [Delete one document](delete-one.md) / [Delete many documents](delete-many.md) - Learn deletes.
6. [Cache system](cache.md) - Understand the cache mechanism.
7. [Transaction management](transaction.md) - Learn transaction management.
8. [Distributed deployment](distributed-deployment.md) - Multi-instance deployment for production.

---

**Document count**: 97  
**Index coverage**: 97/97, including this index page  
**Last updated**: 2026-06-10

Recent additions:

- [ESM support](esm-support.md) - ES Module (`import`) support
- [findOneAnd return values](findOneAnd-return-value-unified.md) - Return-value unification notes
