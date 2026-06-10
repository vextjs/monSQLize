# watch method API documentation

> **Version**: v1.1.0
> **Status**: ✅ Achieved

---

## Table of Contents

- [Overview](#overview)
- [Basic usage](#basic-usage)
- [API Reference](#api-reference)
- [collection.watch([pipeline], [options])](#collectionwatchpipeline-options)
- [Configuration options](#configuration-options)
- [MongoDB native options](#mongodb-native-options)
- [ChangeStream native method](#changestream-native-method)
- [cs.on(event, handler)](#csonevent-handler)
- [cs.once(event, handler)](#csonceevent-handler)
- [cs.close()](#csclose)
- [cs.closed](#csclosed)
- [cs.resumeToken](#csresumetoken)
- [cs.next()](#csnext)
- [Usage example](#usage-example)
- [Example 1: Basic monitoring](#example-1-basic-monitoring)
- [Example 2: Filter events](#example-2-filter-events)
- [Example 3: Error handling](#example-3-error-handling)
- [Example 4: Statistics monitoring (via ChangeStreamSyncManager)](#example-4-statistics-monitoring-via-changestreamsyncmanager)
- [Example 5: Graceful shutdown](#example-5-graceful-shutdown)
- [Cache invalidation integration](#cache-invalidation-integration)
- [Solution 1: Manual processing (lightweight scenario recommended)](#solution-1-manual-processing-lightweight-scenario-recommended)
- [Solution 2: ChangeStreamSyncManager (recommended for production scenarios)](#solution-2-changestreamsyncmanager-recommended-for-production-scenarios)
- [Notes](#notes)
- [1. MongoDB version requirements](#1-mongodb-version-requirements)
- [2. Performance impact](#2-performance-impact)
- [3. resumeToken expires](#3-resumetoken-expires)
- [4. Memory management](#4-memory-management)
- [Troubleshooting](#troubleshooting)
- [Problem 1: watch closes immediately](#problem-1-watch-closes-immediately)
- [Issue 2: ChangeStream closed unexpectedly](#issue-2-changestream-closed-unexpectedly)
- [Question 3: Cache integration](#question-3-cache-integration)
- [watch event vs global event](#watch-event-vs-global-event)
- [Difference description](#difference-description)
- [Usage scenario comparison](#usage-scenario-comparison)
- [Example: Use both](#example-use-both)
- [Related documents](#related-documents)
- [Version history](#version-history)

## Overview

The `watch()` method directly returns the native `ChangeStream<T>` object of MongoDB Change Streams, supporting real-time monitoring of data changes in the collection. If you need automatic breakpoint resumption, multi-target synchronization or cache invalidation, please use it in conjunction with [`ChangeStreamSyncManager`](./sync-backup.md).

---

## Basic usage

```javascript
import MonSQLize from 'monsqlize';
const db = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://localhost:27017' }
});

await db.connect();
const collection = db.dbInstance.collection('users');

//Listen for all changes
const watcher = collection.watch();

watcher.on('change', (change) => {
  console.log('Data changes:', change.operationType);
  console.log('Documentation:', change.fullDocument);
});
```

---

## API Reference


## collection.watch([pipeline], [options])

Monitor collection data changes.

**Parameters**:
- `pipeline` (Array, optional): aggregation pipeline for filtering events
- `options` (Object, optional): Configuration options

**Return value**: `ChangeStream<TSchema>` — MongoDB driver native ChangeStream object

> ⚠️ `collection.watch()` directly returns the MongoDB driven `ChangeStream` without additional packaging.
> Please refer to [MongoDB ChangeStream official documentation](https://www.mongodb.com/docs/manual/changeStreams/).

---

## Configuration options


## MongoDB native options

| Options | Type | Default | Description |
|------|------|--------|------|
| `fullDocument` | string | `'updateLookup'` | Return to full document (`'default'` \| `'updateLookup'` \| `'whenAvailable'` \| `'required'`) |
| `fullDocumentBeforeChange` | string | - | Return to the document before modification (`'off'` \| `'whenAvailable'` \| `'required'`) |
| `resumeAfter` | Object | - | Continue from the specified resumeToken |
| `startAfter` | Object | - | Start from the specified resumeToken (transaction friendly) |
| `startAtOperationTime` | Timestamp | - | Starting from the specified time |
| `maxAwaitTimeMS` | number | - | Maximum waiting time (milliseconds) |
| `batchSize` | number | - | batch size |

---

## ChangeStream native method

`watch()` returns the MongoDB-driven `ChangeStream<T>` object, which supports the following native APIs:


## cs.on(event, handler)

Listen for events (EventEmitter interface).

**Event List**:
- `'change'`: Data change
- `'error'`: Error
- `'close'`: Close
- `'end'`: end of stream


## cs.once(event, handler)

Listen for events (one-time).


## cs.close()

Close ChangeStream.

**Return value**: `Promise<void>`


## cs.closed

Read-only property that checks whether the ChangeStream has been closed.

**Type**: `boolean`


## cs.resumeToken

Read-only attribute, obtains the latest resumeToken (used for resumed transmission).

**Type**: `unknown`


## cs.next()

Explicitly get the next change event (iterator pattern).

**Return value**: `Promise<ChangeStreamDocument<T>>`

> 💡 If you want to resume interrupted downloads, multi-target synchronization or automatic reconnection, please use [`ChangeStreamSyncManager`](./sync-backup.md).

---

## Usage example


## Example 1: Basic monitoring

```javascript
const watcher = collection.watch();

watcher.on('change', (change) => {
  console.log('Operation type:', change.operationType);
  console.log('Document ID:', change.documentKey._id);
});
```


## Example 2: Filter events

```javascript
//Only listen to insert and update
const watcher = collection.watch([
  { $match: { operationType: { $in: ['insert', 'update'] } } }
]);

watcher.on('change', (change) => {
  console.log('Add or modify:', change.fullDocument);
});
```


## Example 3: Error handling

```javascript
const cs = collection.watch();

cs.on('error', (error) => {
  console.error('Change Stream error:', error);
});

cs.on('close', () => {
  console.log('Change Stream is closed');
});
```


## Example 4: Statistics monitoring (via ChangeStreamSyncManager)

> For built-in statistics (eventCount / syncedCount / errorCount), please use `ChangeStreamSyncManager`:

```javascript
import MonSQLize from 'monsqlize';

const syncManager = new MonSQLize.ChangeStreamSyncManager({ db, config: { ... } });
await syncManager.start();

setInterval(() => {
  const stats = syncManager.getStats();
  console.log('Synced events:', stats.syncedCount, 'Error:', stats.errorCount);
}, 60000);
```


## Example 5: Graceful shutdown

```javascript
const cs = collection.watch();

process.on('SIGTERM', async () => {
  console.log('Closing watch...');
  await cs.close();
  console.log('watch is closed');
  process.exit(0);
});
```

---

## Cache invalidation integration

> ⚠️ `collection.watch()` itself **does not provide** built-in cache invalidation function. If you want to integrate watch with cache, there are two options:


## Solution 1: Manual processing (lightweight scenario recommended)

```javascript
const cs = collection.watch();

cs.on('change', async (change) => {
  //Manually invalidate corresponding cache keys based on operation type
  if (['insert', 'update', 'replace', 'delete'].includes(change.operationType)) {
    myCache.delete('user-list');
    myCache.delete(`user:${change.documentKey?._id}`);
  }
});
```


## Solution 2: ChangeStreamSyncManager (recommended for production scenarios)

[`ChangeStreamSyncManager`](./sync-backup.md) has built-in breakpoint resumption, multi-target synchronization and statistical capabilities, and can handle caching in the `apply` callback:

```javascript
const syncManager = new MonSQLize.ChangeStreamSyncManager({
  db,
  config: {
    enabled: true,
    targets: [{
      name: 'cache-invalidation',
      apply: async (event) => {
        //Handle cache invalidation in apply
        myCache.delete('user-list');
      }
    }]
  }
});
await syncManager.start();
```

**Cross-instance synchronization**: If you need distributed cache synchronization, please use [`DistributedCacheInvalidator`](./cache-and-function-cache.md), which supports broadcasting invalidation signals to other instances through Pub/Sub.

---

## Notes


## 1. MongoDB version requirements

Change Streams requires MongoDB 4.0+ and a replica set or sharded cluster environment.

**Single node environment will report an error**:
```text
Error: The $changeStream stage is only supported on replica sets
```

**Solution**:

**Dev/Test Environment** - using mongodb-memory-server:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: {
    useMemoryServer: true,
    memoryServerOptions: {
      instance: {
        replSet: 'rs0'  //Enable replica set mode
      }
    }
  }
});

await msq.connect();
const collection = msq.dbInstance.collection('users');

//✅ Watch is now available
const watcher = collection.watch();
```

`useMemoryServer` uses a single-node replica set, the binary cache is pinned at `.cache/mongodb-memory-server/binaries`, and the automatically created temporary dbPath is pinned at `.cache/mongodb-memory-server/db` and cleaned up on shutdown.

**Production environment** - using replica sets or sharded clusters:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: {
    uri: 'mongodb://host1:27017,host2:27017,host3:27017/mydb?replicaSet=rs0'
  }
});
```


## 2. Performance impact

- watch itself has little impact on performance (natively supported by MongoDB)
- ChangeStream monitoring is asynchronous and does not block the main process


## 3. resumeToken expires

The MongoDB oplog has a size limit and the resumeToken may expire (default hours).

**Handling Suggestions**:
- Monitor `error` events and detect `ChangeStreamHistoryLost` errors
- Close the current ChangeStream and call `collection.watch()` again (without `resumeAfter`)
- If you need to automatically handle breakpoint resumption, please use [`ChangeStreamSyncManager`](./sync-backup.md)


## 4. Memory management

Long-running watches need to pay attention to:
- Correctly call `watcher.close()` to release resources
- Listening process signal is closed gracefully
- Don’t create too many watchers (1-2 per collection is enough)

---

## Troubleshooting


## Problem 1: watch closes immediately

**Reason**: MongoDB is not a replica set environment

**Solution**: Use replica set or `mongodb-memory-server`


## Issue 2: ChangeStream closed unexpectedly

**Cause**: If the network is unstable or MongoDB load is too high, `ChangeStream` will automatically shut down and trigger the `close` event.

**Troubleshooting**:
```javascript
const cs = collection.watch();

cs.on('close', () => {
  console.warn('ChangeStream is closed, please check network and MongoDB status');
  //If you need to automatically reconnect, you can call collection.watch() again here
});

cs.on('error', (err) => {
  console.error('ChangeStream error:', err.message);
});
```

## Question 3: Cache integration

See the [Cache Invalidation Integration](#cache-invalidation-integration) chapter.

---

## watch event vs global event


## Difference description

monSQLize has two event systems:

**1. Global event (msq object)**:
- Monitoring object: query operation of the application
- Event type: `slow-query`, `query`, `connected`, `error`, `closed`
- Applicable scenarios: performance monitoring, operation and maintenance alarms
- Document: [Event System](./events.md)

**2. watch event (ChangeStream object)**:
- Monitoring object: MongoDB data changes
- Event types: `change`, `error`, `close`, `end` (MongoDB native events)
- Applicable scenarios: real-time data synchronization, cache invalidation
- Documentation: This document


## Usage scenario comparison

| Requirements | Usage |
|------|------|
| Monitor application query performance | `msq.on('slow-query', ...)` |
| Debug all query operations | `msq.on('query', ...)` |
| Monitor data changes | `cs.on('change', ...)` |
| Application layer cache invalidation | `cs.on('change', ...)` + manual cache.delete |
| Cross-system data synchronization | `cs.on('change', ...)` or `ChangeStreamSyncManager` |


## Example: Use both

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100
});

await msq.connect();

//✅ Monitor slow queries (operation and maintenance)
msq.on('slow-query', (meta) => {
  console.warn('Slow query:', meta.operation, meta.duration + 'ms');
  //Send alert
});

//✅ Monitor data changes (business)
const collection = msq.dbInstance.collection('products');
const cs = collection.watch();

cs.on('change', (change) => {
  console.log('Data changes:', change.operationType);
  //Cache invalidation, business notification
});
```

---

## Related documents

- [MongoDB Change Streams official documentation](https://www.mongodb.com/docs/manual/changeStreams/)
- [Distributed Deployment Guide](./distributed-deployment.md)
- [Caching System](./cache.md)
- [Event System](./events.md)

---

## Version history

- **v1.1.0** (2025-12): First release of watch function
