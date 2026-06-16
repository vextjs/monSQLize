# Cache policy document

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Cache configuration](#cache-configuration)
- [Global cache configuration](#global-cache-configuration)
- [Query-level cache configuration](#query-level-cache-configuration)
- [Cache key generation](#cache-key-generation)
- [TTL (time to live) expiration](#ttl-time-to-live-expiration)
- [Automatically expire](#automatically-expire)
- [TTL Best Practices](#ttl-best-practices)
- [LRU (least recently used) elimination](#lru-least-recently-used-elimination)
- [Elimination mechanism](#elimination-mechanism)
- [LRU access sequence](#lru-access-sequence)
- [Multi-layer caching](#multi-layer-caching)
- [1. Local + remote cache architecture (MultiLevelCache)](#1-local-remote-cache-architecture-multilevelcache)
  - [CacheLike interface specification](#cachelike-interface-specification)
  - [Caching strategy](#caching-strategy)
  - [Configuration example](#configuration-example)
    - [Method 1: Only use remote Redis cache (no local cache)](#method-1-only-use-remote-redis-cache-no-local-cache)
    - [Method 2: Local + remote double-layer cache (recommended for high-performance scenarios)](#method-2-local-remote-double-layer-cache-recommended-for-high-performance-scenarios)
    - [Method 3: Use an already created Redis instance](#method-3-use-an-already-created-redis-instance)
    - [Method 4: Manually encapsulate Redis (suitable for custom requirements)](#method-4-manually-encapsulate-redis-suitable-for-custom-requirements)
  - [Policy configuration](#policy-configuration)
  - [Performance comparison](#performance-comparison)
  - [Best Practices](#best-practices)
- [2. Query results + Bookmark double-layer caching](#2-query-results-bookmark-double-layer-caching)
- [Bookmark paging cache](#bookmark-paging-cache)
- [Cache invalidation mechanism](#cache-invalidation-mechanism)
- [🆕 Accurate failure (v1.1.6+)](#accurate-failure-v116)
  - [Configuration method](#configuration-method)
  - [Precise failure example](#precise-failure-example)
  - [Supported query conditions](#supported-query-conditions)
  - [ObjectId field support](#objectid-field-support)
- [Manual cleanup](#manual-cleanup)
- [Statistical monitoring](#statistical-monitoring)
- [Get cache statistics](#get-cache-statistics)
- [Description of statistical indicators](#description-of-statistical-indicators)
- [Monitoring and Alarming](#monitoring-and-alarming)
- [Performance Benchmark](#performance-benchmark)
- [Cache acceleration effect](#cache-acceleration-effect)
  - [find query cache](#find-query-cache)
  - [findPage query cache](#findpage-query-cache)
  - [distinct query cache](#distinct-query-cache)
- [Best Practices (Cache Policy Document)](#best-practices-cache-policy-document)
- [1. Select TTL based on data characteristics](#1-select-ttl-based-on-data-characteristics)
- [2. Set maxEntries appropriately](#2-set-maxentries-appropriately)
- [3. Monitor cache health](#3-monitor-cache-health)
- [4. Batch warm cache](#4-batch-warm-cache)
- [5. Cache penetration protection](#5-cache-penetration-protection)
- [FAQ](#faq)
- [Q: How much memory will the cache occupy?](#q-how-much-memory-will-the-cache-occupy)
- [Q: How to choose the appropriate maxEntries?](#q-how-to-choose-the-appropriate-maxentries)
- [Q: How to manually clear the cache?](#q-how-to-manually-clear-the-cache)
- [Q: How to disable cache?](#q-how-to-disable-cache)
- [Q: What is the difference between cache and Bookmark?](#q-what-is-the-difference-between-cache-and-bookmark)
- [Cache invalidation API](#cache-invalidation-api)
- [invalidate()](#invalidate)
  - [Method signature](#method-signature)
  - [Parameter description](#parameter-description)
  - [Return value](#return-value)
- [Usage scenarios](#usage-scenarios)
  - [1. Refresh cache after external tool modifies data](#1-refresh-cache-after-external-tool-modifies-data)
  - [2. Refresh the cache regularly](#2-refresh-the-cache-regularly)
  - [3. Multi-collection cache clearing](#3-multi-collection-cache-clearing)
- [Instructions for use](#instructions-for-use)
- [Best Practices (Cache Invalidation API)](#best-practices-cache-invalidation-api)
  - [1. Avoid overuse](#1-avoid-overuse)
  - [2. Combined with cache monitoring](#2-combined-with-cache-monitoring)
  - [3. Use parallelism when cleaning in batches](#3-use-parallelism-when-cleaning-in-batches)
  - [4. Error handling of scheduled refresh](#4-error-handling-of-scheduled-refresh)
- [Notes](#notes)
- [Related methods](#related-methods)
- [References](#references)

## Overview

monSQLize provides a powerful built-in caching system that supports TTL (time to live), LRU (least recently used) eviction strategy, multi-layer caching, cache invalidation mechanism and statistical monitoring. This document details the configuration and use of cache.

> ⚠️ If you are concerned about the upgrade and migration of public cache classes/functions (`MemoryCache`, `createRedisCacheAdapter()`, `DistributedCacheInvalidator`, `withCache()`, `FunctionCache`), please read the [`cache-hub` direct-call migration guide](./cache-hub-migration.md) first. This page mainly covers monSQLize's query cache and multi-layer cache access methods.

## Core Features

- ✅ **TTL Expiration**: Automatically eliminate expired data
- ✅ **LRU eviction**: evict the least used entries when the cache is full
- ✅ **Multi-layer cache architecture**: local cache (LRU-Cache) + remote cache (Redis/Memcached)
- ✅ **Double-layer caching mechanism**: Query result caching + Bookmark paging caching
- ✅ **Manual invalidation**: Clean the cache of the specified collection through the `invalidate()` method
- ✅ **Statistics monitoring**: hit rate, elimination statistics, memory usage

---

## Cache configuration


## Global cache configuration

Configure global cache parameters in the constructor:

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  //Global cache configuration
  cache: {
    maxEntries: 100000,           //Maximum number of cache entries (default 100000)
    enableStats: true             //Enable statistics (default true)
  }
});
```


## Query-level cache configuration

Specify cache TTL (milliseconds) in specific queries:

```javascript
const { collection } = await msq.connect();
const products = collection('products');

//Cache for 5 seconds (5000 milliseconds)
const result1 = await products.find(
  { category: 'electronics' },
  {
    cache: 5000,        //Cache 5000ms
    maxTimeMS: 3000
  }
);

//Do not use cache (cache: 0)
const realtimeData = await collection('orders').find(
  { status: 'pending' },
  {
    cache: 0,           //Disable caching
    maxTimeMS: 3000
  }
);

//Long term cache (1 hour = 3600000 milliseconds)
const staticConfig = await collection('config').findOne(
  { key: 'site_settings' },
  {
    cache: 3600000,     //Caching for 1 hour
    maxTimeMS: 3000
  }
);
```

**Important Note**:
- ✅ The value of the `cache` parameter is **milliseconds** (TTL)
- ✅ `cache: 0` means caching is disabled
- ✅Default: Do not use cache when not set
- ❌ **Not supported** `cache: true` and individual `ttl` parameters

---

## Cache key generation

The cache key consists of the following parts:
- database name
- collection name
- Query conditions (stringify)
- Projection (stringify)
- Sort (stringify)
- limit/skip

```javascript
//Example: cache key generation
const key = `${dbName}:${collName}:${hash(query)}:${hash(projection)}:${hash(sort)}:${limit}:${skip}`;
```

**Different parameters for the same query will generate different cache keys**:

```javascript
//The following 3 queries will generate 3 different cache keys

//Query 1
await collection('products').find(
  { category: 'electronics' },
  { limit: 10, cache: 5000 }
);

//Query 2 (different limit)
await collection('products').find(
  { category: 'electronics' },
  { limit: 20, cache: 5000 }  //← limit different
);

//Query 3 (different sort)
await collection('products').find(
  { category: 'electronics' },
  { limit: 10, sort: { price: 1 }, cache: 5000 }  //← There is sort
);

await collection('products').find({
  query: { category: 'books' },  //different queries
  limit: 10,
  cache: 5000
});
```

---

## TTL (time to live) expiration


## Automatically expire

Cache entries automatically expire after the TTL expires:

```javascript
const { collection } = await msq.connect();

//First query: cache miss, read from database
const products1 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 3000,           //Cache for 3 seconds
  maxTimeMS: 3000
});
console.log('First query: read from database');

//Query after 2 seconds: cache hit, read from cache
await new Promise(r => setTimeout(r, 2000));
const products2 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 3000,
  maxTimeMS: 3000
});
console.log('Query after 2 seconds: read from cache (cache hit)');

//Wait another 2 seconds (total 4 seconds): cache expires, read from database again
await new Promise(r => setTimeout(r, 2000));
const products3 = await collection('products').find({
  query: { category: 'electronics' },
  cache: 3000,
  maxTimeMS: 3000
});
console.log('Query after 4 seconds: cache expires, read from database again');
```


## TTL Best Practices

| Data Type | Recommended TTL | Description |
|---------|---------|------|
| **Static Configuration** | 1-24 hours | Rarely changing data |
| **User Information** | 5-30 minutes | Medium change frequency |
| **Product List** | 30 seconds - 5 minutes | Frequently updated data |
| **Real-time orders** | 0 (disable caching) | Data that requires real-time performance |
| **Statistics** | 10-60 seconds | Allow short delays |

---

## LRU (least recently used) elimination


## Elimination mechanism

When the number of cache entries reaches `maxEntries`, the entries that have not been accessed for the longest time are automatically eliminated.

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  cache: {
    maxEntries: 1000,       //Cache up to 1000 items
    enableStats: true
  }
});

const { collection } = await msq.connect();

//Cache 1001 different queries
for (let i = 0; i < 1001; i++) {
  await collection('products').find({
    query: { id: i },
    cache: 60000,           //Cache for 1 minute
    maxTimeMS: 3000
  });
}

//View elimination statistics
const stats = msq.getCache().getStats();
console.log('Number of eliminations:', stats.evictions);
console.log('Current number of cache entries:', stats.entries);  //Should be 1000 (maximum value)
```


## LRU access sequence

```javascript
//Scenario: maxEntries = 3

//1. Add 3 caches
await collection('test').find({ query: { a: 1 }, cache: 60000 });  //cache[a:1]
await collection('test').find({ query: { b: 2 }, cache: 60000 });  //cache [a:1, b:2]
await collection('test').find({ query: { c: 3 }, cache: 60000 });  //cache [a:1, b:2, c:3]

//2. Access the first cache (refresh LRU order)
await collection('test').find({ query: { a: 1 }, cache: 60000 });  //cache [b:2, c:3, a:1]

//3. Add 4th cache (eliminate least used b:2)
await collection('test').find({ query: { d: 4 }, cache: 60000 });  //cache [c:3, a:1, d:4]
```

---

## Multi-layer caching

monSQLize provides two multi-level caching mechanisms:


## 1. Local + remote cache architecture (MultiLevelCache)

Supports the two-layer architecture of local memory cache (LRU-Cache) + remote cache (Redis/Memcached) to achieve higher cache hit rate and larger cache capacity.


### CacheLike interface specification

To be used as `remote`, a cache instance must implement the following 10 methods (`CacheLike` interface):

| Method | Signature | Description | Required |
|------|------|------|------|
| **get** | `async get(key: string): any` | Get a single cached value | ✅ |
| **set** | `async set(key: string, val: any, ttl?: number): void` | Set a single cache value (ttl unit: milliseconds) | ✅ |
| **del** | `async del(key: string): boolean` | Delete a single cache item | ✅ |
| **exists** | `async exists(key: string): boolean` | Check if the key exists | ✅ |
| **getMany** | `async getMany(keys: string[]): Object` | Batch acquisition (return `{key: value}`) | ✅ |
| **setMany** | `async setMany(obj: Object, ttl?: number): boolean` | Batch settings | ✅ |
| **delMany** | `async delMany(keys: string[]): number` | Batch deletion (returns the number of deletions) | ✅ |
| **delPattern** | `async delPattern(pattern: string): number` | Delete by pattern (supports wildcard `*`) | ✅ |
| **clear** | `async clear(): void` | Clear all cache | ✅ |
| **keys** | `async keys(pattern?: string): string[]` | Get all keys (optional pattern matching) | ✅ |

**Verification Suggestions**:

- Prioritize using `MonSQLize.createRedisCacheAdapter()` directly to avoid handwriting `CacheLike` adapter
- If you must customize the remote cache, please ensure that the 10 methods listed in the above table are implemented one by one.
- The `MemoryCache.isValidCache()` verification tool in the old packaging layer is currently no longer provided


### Caching strategy

**Read operation**:
1. Prioritize reading from local cache (memory, fast)
2. If there is a local miss, query the remote cache (network, slower)
3. If the remote end hits, it will be backfilled to the local cache asynchronously (configurable)
4. If the remote end fails, it will degrade gracefully (return undefined)

**Write operation**:
- `both` (default): local + remote double writing to ensure consistency
- `local-first-async-remote`: local priority, remote asynchronous writing, improved performance

**Delete operation**:
- Delete local cache (effective immediately)
- Delete remote cache (best effort)
- `delPattern` supports optional cluster broadcast mechanism


### Configuration example


#### Method 1: Only use remote Redis cache (no local cache)

If local memory caching is not required, the Redis adapter can be passed directly as the cache instance:

```javascript
import MonSQLize from 'monsqlize';

//✅ Only use Redis cache (not multiLevel)
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  //Pass in the Redis adapter directly (multiLevel: true is not required)
  cache: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0')
});

const { collection } = await msq.connect();

//All query caches are stored directly in Redis
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 10000,                           //Cache for 10 seconds
  maxTimeMS: 3000
});
```

**Applicable scenarios**:
-Multi-instance deployment requires shared cache
- Server memory is limited and not suitable for local caching
- The amount of cached data is large (millions)
- Requires persistent cache (Redis persistence)

**Performance Features**:
- Read latency: 1-2ms (network + Redis query)
- Cache capacity: depends on Redis memory (up to GB level)
- Cache consistency: shared across instances, strong consistency

---


#### Method 2: Local + remote double-layer cache (recommended for high-performance scenarios)

Use `multiLevel: true` to enable local memory + Redis two-tier architecture:

```javascript
import MonSQLize from 'monsqlize';

//✅ Local + remote double-layer cache
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  cache: {
    multiLevel: true,                     //Enable double-tier caching

    //Local cache configuration
    local: {
      maxEntries: 10000,                  //Local cache 10,000 items
      enableStats: true
    },

    //Remote Redis cache (pass URL directly)
    remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0'),

    //caching strategy
    policy: {
      writePolicy: 'both',                // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true      //Backfill local when remote hits (default true)
    }
  }
});

const { collection } = await msq.connect();

//Hit process:
//1. Check the local cache → return if hit (0.001ms)
//2. Local miss → check Redis → if hit, return (1-2ms) + backfill local
//3. Redis miss → Query MongoDB → Store locally + Redis
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 10000,
  maxTimeMS: 3000
});
```

**Applicable scenarios**:
- High concurrent reading scenarios
- Hotspot data is frequently accessed
- Requires extreme performance (local cache 0.001ms)
- Multi-instance deployment + requires cache consistency

**Performance Features**:
- Local cache hit: 0.001ms (memory read)
- Redis cache hit: 1-2ms (network + Redis)
- Database query: 10ms+

---


#### Method 3: Use an already created Redis instance

```javascript
import MonSQLize from 'monsqlize';
const Redis = require('ioredis');

//Create a Redis instance (custom configuration)
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

//Only use Redis cache (no local cache)
const msq1 = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: MonSQLize.createRedisCacheAdapter(redis)  //Pass in the instance directly
});

//Or use double layer caching
const msq2 = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  cache: {
    multiLevel: true,
    local: { maxEntries: 10000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),  //Pass in instance
    policy: { writePolicy: 'both' }
  }
});
```

---


#### Method 4: Manually encapsulate Redis (suitable for custom requirements)

```javascript
import MonSQLize from 'monsqlize';
const { MemoryCache } = MonSQLize;  //Public caching tool class
const Redis = require('ioredis');

//Create a Redis client (remote cache)
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0
});

//Encapsulate Redis into the CacheLike interface (the following 10 methods must be implemented)
const remoteCache = {
  async get(key) {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : undefined;
  },
  async set(key, val, ttl = 0) {
    const str = JSON.stringify(val);
    if (ttl > 0) {
      await redis.setex(key, Math.ceil(ttl / 1000), str);
    } else {
      await redis.set(key, str);
    }
  },
  async del(key) {
    return await redis.del(key) > 0;
  },
  async exists(key) {
    return await redis.exists(key) > 0;
  },
  async getMany(keys) {
    const values = await redis.mget(keys);
    const result = {};
    keys.forEach((key, i) => {
      if (values[i]) result[key] = JSON.parse(values[i]);
    });
    return result;
  },
  async setMany(obj, ttl = 0) {
    const pipeline = redis.pipeline();
    for (const [key, val] of Object.entries(obj)) {
      const str = JSON.stringify(val);
      if (ttl > 0) {
        pipeline.setex(key, Math.ceil(ttl / 1000), str);
      } else {
        pipeline.set(key, str);
      }
    }
    await pipeline.exec();
    return true;
  },
  async delMany(keys) {
    return await redis.del(...keys);
  },
  async delPattern(pattern) {
    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    return 0;
  },
  async clear() {
    await redis.flushdb();
  },
  async keys(pattern = '*') {
    const keys = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
};

//✅ It is recommended to do a minimum contract check by yourself first
const hasRequiredMethods = ['get', 'set', 'del', 'exists', 'getMany', 'setMany', 'delMany', 'delPattern', 'clear', 'keys']
  .every((name) => typeof remoteCache[name] === 'function');

console.log('Whether remoteCache conforms to the CacheLike interface:', hasRequiredMethods);

//Configure local + remote cache (monSQLize has built-in MultiLevelCache)
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  cache: {
    multiLevel: true,     //⚠️ Enable multi-layer caching (remote must be configured to make sense)

    //Local cache configuration
    local: {
      maxEntries: 10000,  //Local cache 10,000 items
      enableStats: true
    },

    //Remote cache configuration (must be configured, otherwise it is equivalent to using only local cache)

    //Method 1: Pass in a Redis instance that implements the CacheLike interface (✅ Recommended for production environment)
    remote: remoteCache,  //The Redis cache instance encapsulated above

    //Method 2: Pass in the configuration object (❌ Not recommended: it will create a memory cache placeholder and lose the meaning of distributed cache)
    // remote: {
    //maxEntries: 50000, // What is created is a memory cache, not a real Redis
    //timeoutMs: 50 // Remote operation timeout (default 50ms)
    // },

    //⚠️ If remote is not configured, MultiLevelCache will degrade to only using local cache

    //Cache policy configuration
    policy: {
      writePolicy: 'both',                    // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true          //Backfill local when remote hits (default true)
    }
  }
});

const { collection } = await msq.connect();

//Use cached query (automatically use local + remote layers)
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,           //Cache for 5 seconds
  maxTimeMS: 3000
});

//Hit process:
//1. Check local cache → return if hit (fastest)
//2. Local miss → check remote cache → return if hit + backfill local
//3. Remote miss → Query MongoDB → Store locally + remote
```


### Policy configuration

```javascript
const msq = new MonSQLize({
  // ...
  cache: {
    maxEntries: 10000,
    remote: remoteCache,

    //Write policy configuration
    policy: {
      writePolicy: 'both',                      // 'both' | 'local-first-async-remote'
      backfillLocalOnRemoteHit: true            //Backfill local when remote hits (default true)
    }
  }
});
```


### Performance comparison

**Comparison of three caching strategies**:

| Dimensions | No cache | Local cache (MemoryCache) | Remote cache (Redis) | Double-layer cache (MultiLevel) |
|------|-------|----------------------|------------------|---------------------|
| **Response Time** | 10-50ms | 0.001-0.1ms | 1-2ms | 0.001-2ms |
| **Cache Capacity** | - | 10,000-100,000 items | GB level (millions of items+) | 100,000+ million items |
| **Cluster Consistency** | ❌ Database check every time | ❌ Each node is independent | ✅ Shared Redis | ✅ Shared Redis |
| **Memory usage** | - | High (local) | Low (remote) | Medium (local) + Low (remote) |
| **Reliability** | ✅ Direct database check | ⚠️ Restart loss | ✅ Persistence | ✅ Persistence |
| **Single point failure impact** | DB only | Single machine restart lost | Redis failure degradation database check | Redis failure degradation local |
| **Applicable scenarios** | Low QPS | Stand-alone application | Multi-instance cluster | High QPS cluster |

**Scene selection suggestions**:

| Scenario | Recommended strategy | Reason |
|------|---------|------|
| Stand-alone application, low QPS | Local cache (MemoryCache) | Simple and efficient, no Redis dependency required |
| Multi-instance deployment, consistency required | Remote cache (Redis) | Cross-node sharing, strong consistency |
| High QPS, concentrated hot data | Double-layer cache (MultiLevel) | Hot spot 0.001ms, cold data 1-2ms |
| Memory constrained server | Remote cache (Redis) | Save local memory, large capacity |
| Data persistence requirements | Remote or dual-tier | Redis supports RDB/AOF persistence |

**Performance Improvement Example**:

| Scenarios | Local Cache Only | Local + Remote Cache | Boost |
|------|-----------|----------------|------|
| Hotspot data | 0.1ms | 0.1ms | No difference |
| Cold data (local miss) | Query MongoDB (10ms+) | Query Redis (1-2ms) | **5-10 times** |
| Cache capacity | Limited by memory (10,000-100,000) | Redis can reach millions | **10-100 times** |
| Cluster consistency | Each node is independent | Shared Redis, strong consistency | ✅ |


### Best Practices

1. **Local cache configuration**
   - Set a reasonable `maxEntries` (recommended 1-100,000)
   - Hotspot data is saved locally first

2. **Remote cache configuration**
   - Redis connection pool configuration (to avoid connection exhaustion)
   -Set a reasonable timeout (50-100ms recommended)
   - Monitor Redis memory usage

3. **Writing strategy selection**
   - Strong consistency scenario: use `both` (default)
   - High concurrent writing: use `local-first-async-remote`

4. **Fault degradation**
   - Remote cache failure automatically downgrades to local cache
   - Does not affect normal business operations

---


## 2. Query results + Bookmark double-layer caching

```javascript
const { collection } = await msq.connect();

//find query cache
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 5000,           //Cache for 5 seconds
  maxTimeMS: 3000
});

//findOne query cache
const user = await collection('users').findOne({
  query: { email: 'user@example.com' },
  cache: 30000,          //Cache for 30 seconds
  maxTimeMS: 3000
});

//aggregate query cache
const stats = await collection('orders').aggregate({
  pipeline: [
    { $match: { status: 'completed' } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
  ],
  cache: 60000,          //Cache for 1 minute
  maxTimeMS: 3000
});

//distinct query cache
const categories = await collection('products').distinct({
  field: 'category',
  query: { inStock: true },
  cache: 10000,          //Cache for 10 seconds
  maxTimeMS: 3000
});
```


## Bookmark paging cache

```javascript
//findPage uses Bookmark to cache paging cursors
const page1 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  bookmarks: {
    step: 10,            //Cache a bookmark every 10 pages
    maxHops: 20,         //Jump up to 20 times
    ttlMs: 3600000,      //Bookmark cache 1 hour
    maxPages: 10000      //Cache up to 10,000 pages
  },
  maxTimeMS: 3000
});

//Jump to page 100 (accelerated using bookmark cache)
const page100 = await collection('products').findPage({
  query: { category: 'electronics' },
  limit: 20,
  page: 100,             //Skip to page 100
  bookmarks: {
    step: 10,
    maxHops: 20,
    ttlMs: 3600000,
    maxPages: 10000
  },
  maxTimeMS: 3000
});
```

---

## Cache invalidation mechanism


## 🆕 Accurate failure (v1.1.6+)

**Precise Invalidation** Only clears the actual affected cache, not the entire set of caches.


### Configuration method

**Method 1: Instance-level global configuration** (recommended)

Precise invalidation is enabled by default for all write operations:

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: {
    maxEntries: 100000,
    autoInvalidate: true  //🆕 Enable precise invalidation globally (default false)
  }
});

//After connection, all write operations automatically enable precise invalidation
const { collection } = await msq.connect();

//✅ Automatic and precise invalidation (using instance configuration)
await collection('products').insertOne({
  name: 'New Product',
  category: 'electronics'
});

//✅ Automatic and precise invalidation (using instance configuration)
await collection('products').updateOne(
  { _id: productId },
  { $set: { price: 99 } }
);
```

**Method 2: Write operation level configuration** (override instance configuration)

A single operation controls whether precise invalidation is enabled:

```javascript
//Instance configuration autoInvalidate = false
const msq = new MonSQLize({
  cache: { maxEntries: 100000 }  //Does not automatically expire by default
});

const { collection } = await msq.connect();

//✅ Enable precise invalidation in a single operation (override instance configuration)
await collection('products').insertOne(
  { name: 'New Product', category: 'electronics' },
  { autoInvalidate: true }  //Single activation
);

//❌ Use instance configuration (not invalid)
await collection('products').updateOne(
  { _id: productId },
  { $set: { price: 99 } }
);
```

**Configuration Priority**: Write Operation Configuration > Instance Configuration

**⚠️ IMPORTANT NOTE**:
- `autoInvalidate` option **for write operations only** (insert/update/delete)
- Query operation (find/findOne) **not supported** `autoInvalidate` option
- The query only needs to specify the cache time using the `cache` option


### Precise failure example

```javascript
const { collection } = await msq.connect();

//1. Query and cache (two different queries)
await collection('products').find(
  { category: 'electronics' },
  { cache: 60000 }
);

await collection('products').find(
  { category: 'books' },
  { cache: 60000 }
);

//2. Insert new products (only affects electronics cache)
await collection('products').insertOne(
  { name: 'New Phone', category: 'electronics', price: 999 },
  { autoInvalidate: true }
);

//✅ Exact failure: only clear cache matching { category: 'electronics' }
//✅ Reserved: { category: 'books' } cache is not affected
```


### Supported query conditions

Precise failure supports simple query conditions:

✅ **Supported Operators**:
- Equality match: `{ status: 'active' }`
- `$eq`: `{ status: { $eq: 'active' } }`
- `$ne`: `{ status: { $ne: 'deleted' } }`
- `$gt`, `$gte`, `$lt`, `$lte`: `{ price: { $gte: 100 } }`
- `$in`: `{ category: { $in: ['a', 'b'] } }`
- `$nin`: `{ status: { $nin: ['deleted'] } }`

❌ **Unsupported operators** (automatically skipped, expires by TTL):
- `$regex`, `$exists`, `$type`
- `$elemMatch`, `$size`, `$all`
- `$where`


### ObjectId field support

Precise invalidation fully supports the ObjectId field (including `_id`):

```javascript
//✅ Use string _id (auto-normalization)
await collection('users').find(
  { _id: "507f1f77bcf86cd799439011" },
  { cache: 5000 }
);

await collection('users').updateOne(
  { _id: "507f1f77bcf86cd799439011" },
  { $set: { name: 'Updated' } },
  { autoInvalidate: true }
);
//✅ Accurate failure successful

//✅Related query
await collection('orders').find(
  { userId: userId.toString() },
  { cache: 5000 }
);

await collection('orders').updateMany(
  { userId: userId.toString() },
  { $set: { status: 'shipped' } },
  { autoInvalidate: true }
);
//✅ Accurate failure successful
```


## Manual cleanup

Use `clearBookmarks()` to manually clear the Bookmark cache:

```javascript
const { collection } = await msq.connect();

//Clean all bookmarks for a specific collection
await collection('products').clearBookmarks();
console.log('✅ The bookmarks of the products collection have been cleared');

//Clean bookmarks for a specific query
await collection('products').clearBookmarks({
  query: { category: 'electronics' },
  sort: { createdAt: -1 }
});
console.log('✅ Bookmarks for specific queries have been cleared');
```

---

## Statistical monitoring


## Get cache statistics

```javascript
const { collection } = await msq.connect();

//execute some queries
await collection('products').find({ query: {}, cache: 5000, maxTimeMS: 3000 });
await collection('products').find({ query: {}, cache: 5000, maxTimeMS: 3000 });  //cache hit
await collection('users').find({ query: {}, cache: 5000, maxTimeMS: 3000 });

//Get statistics
const stats = msq.getCache().getStats();

console.log('Cache statistics:', {
  entries: stats.entries,     //Current number of cache entries
  hits: stats.hits,           //Number of cache hits
  misses: stats.misses,       //Number of cache misses
  sets: stats.sets,           //Number of cache settings
  deletes: stats.deletes,     //Cache deletion times
  evictions: stats.evictions, //LRU elimination times
  hitRate: stats.hitRate      //Hit rate (0~1)
});

//Output example:
// {
//   entries: 2,
//   hits: 1,
//   misses: 2,
//   sets: 2,
//   deletes: 0,
//   evictions: 0,
//   hitRate: 0.3333
// }
```


## Description of statistical indicators

| Indicators | Description | Optimization Goals |
|------|------|---------|
| **entries** | The current number of cache entries | Close to maxEntries indicates high utilization |
| **hits** | Number of cache hits | The higher, the better |
| **misses** | Number of cache misses | The lower the better |
| **sets** | Number of cache settings | Normal fluctuation |
| **deletes** | Number of cache deletions (triggered by write operations) | Normal fluctuations |
| **evictions** | Number of LRU eliminations | Description of frequent eliminations maxEntries is too small |
| **hitRate** | hit rate (hits / (hits + misses), 0~1) | target > 0.8 |


## Monitoring and Alarming

```javascript
const cache = msq.getCache();
const CACHE_MAX_ENTRIES = 100000;

//Monitor cache performance regularly
setInterval(() => {
  const stats = cache.getStats();

  //Alarm for low hit rate
  if (stats.hitRate < 0.5) {
    console.warn('⚠️Cache hit rate is too low:', stats.hitRate);
    console.warn('Suggestion: Increase TTL or maxEntries');
  }

  //Frequently eliminate alarms
  if (stats.evictions > 1000) {
    console.warn('⚠️ Frequent cache elimination:', stats.evictions);
    console.warn('Suggestion: Increase maxEntries');
  }

  //Low cache utilization alarm
  if (stats.entries < CACHE_MAX_ENTRIES * 0.1) {
    console.warn('⚠️ Cache utilization is too low:', `${stats.entries}/${CACHE_MAX_ENTRIES}`);
    console.warn('Recommendation: Reduce maxEntries or increase cache usage');
  }
}, 60000);  //Check every minute
```

---

## Performance Benchmark


## Cache acceleration effect

The following are the results of monSQLize’s built-in performance benchmarks:


### find query cache

```bash
Test: find query (100 records)
Number of iterations: 10000

Cache hit:
Total time taken: 15ms
Average time: 0.0015ms/time

Cache miss (database query):
Total time taken: 4523ms
Average time: 0.4523ms/time

Speedup ratio: 301.5x
```


### findPage query cache

```bash
Test: findPage query (cursor paging)
Number of iterations: 10000

Cache hit:
Total time taken: 18ms
Average time: 0.0018ms/time

Cache miss (database query):
Total time taken: 5234ms
Average time: 0.5234ms/time

Speedup ratio: 290.8x
```


### distinct query cache

```bash
Test: distinct query (statistical deduplication fields)
Number of iterations: 10000

Cache hit:
Total time taken: 14ms
Average time: 0.0014ms/time

Cache miss (database query):
Total time taken: 3892ms
Average time: 0.3892ms/time

Speedup: 278.0x
```

**Conclusion**: Cache hits can provide **200-300x** performance improvements.

---

## Best Practices (Cache Policy Document)


## 1. Select TTL based on data characteristics

```javascript
const { collection } = await msq.connect();

//Static configuration: long-term caching
const siteConfig = await collection('config').findOne({
  query: { key: 'site_settings' },
  cache: 3600000,        //1 hour
  maxTimeMS: 3000
});

//User Information: Medium Cache
const user = await collection('users').findOne({
  query: { id: userId },
  cache: 300000,         //5 minutes
  maxTimeMS: 3000
});

//Product List: Short-Term Caching
const products = await collection('products').find({
  query: { category: 'electronics' },
  cache: 60000,          //1 minute
  maxTimeMS: 3000
});

//Live orders: disable caching
const orders = await collection('orders').find({
  query: { status: 'pending' },
  cache: 0,              //Do not cache
  maxTimeMS: 3000
});
```


## 2. Set maxEntries appropriately

```javascript
//Low traffic scenario: smaller maxEntries
const msqLow = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxEntries: 1000 }    //1000 is enough
});

//Medium traffic scenario: standard maxEntries
const msqMedium = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxEntries: 100000 }  //Default 100,000
});

//High traffic scenario: larger maxEntries
const msqHigh = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cache: { maxEntries: 500000 }  //500,000
});
```


## 3. Monitor cache health

```javascript
//health check function
function checkCacheHealth(msq) {
  const stats = msq.getCache().getStats();
  const hitRate = stats.hitRate;
  const evictionRate = stats.evictions / (stats.sets || 1);

  return {
    healthy: hitRate > 0.7 && evictionRate < 0.1,
    hitRate,
    evictionRate,
    recommendations: [
      hitRate < 0.7 && 'The hit rate is too low, it is recommended to increase the TTL',
      evictionRate > 0.1 && 'Frequent elimination, it is recommended to increase maxEntries',
      stats.entries < 100000 * 0.1 && 'Low utilization, it is recommended to reduce maxEntries'
    ].filter(Boolean)
  };
}

//use
const health = checkCacheHealth(msq);
if (!health.healthy) {
  console.warn('⚠️ Abnormal cache health');
  health.recommendations.forEach(r => console.warn('  -', r));
}
```


## 4. Batch warm cache

```javascript
async function prewarmCache(collection, queries) {
  console.log('Start cache warm-up...');

  for (const [index, query] of queries.entries()) {
    await collection('products').find({
      query,
      cache: 300000,     //Cache for 5 minutes
      maxTimeMS: 3000
    });

    if ((index + 1) % 10 === 0) {
      console.log(`Warm-up progress: ${index + 1}/${queries.length}`);
    }
  }

  const stats = msq.getCache().getStats();
  console.log(`✅ Preheating completed, ${stats.entries} queries have been cached`);
}

//use
const hotQueries = [
  { category: 'electronics' },
  { category: 'books' },
  { inStock: true },
  { price: { $lt: 100 } }
];

await prewarmCache(collection, hotQueries);
```


## 5. Cache penetration protection

```javascript
//Queries that may return empty results should also be cached
const product = await collection('products').findOne({
  query: { id: 'non-existent' },
  cache: 60000,          //Cache empty results for 1 minute
  maxTimeMS: 3000
});

//Query the same ID for the second time and return null from the cache to avoid repeatedly querying the database.
const product2 = await collection('products').findOne({
  query: { id: 'non-existent' },
  cache: 60000,
  maxTimeMS: 3000
});
```

---

## FAQ


## Q: How much memory will the cache occupy?

**A**: Each cache entry contains the query key (~100-200 bytes) and the query result (depending on data size).

Estimating formula:
```text
Memory usage ≈ number of cache entries × average result size

Example:
- 10,000 entries cached
- Average 1KB per result
- Total memory usage ≈ 10000 × 1KB = 10MB
```


## Q: How to choose the appropriate maxEntries?

**A**: Select based on server memory and query hotspot data volume:

```javascript
//formula
//maxEntries = available memory / average result size

//Example 1: Server has 1GB of free memory, average result is 1KB
//maxEntries ≈ 1GB / 1KB = 1000000 entries

//Example 2: Server has 100MB of free memory, average result is 500 bytes
//maxEntries ≈ 100MB / 500B = 200000 entries
```

**Suggestions**:
- Start from default value 100000
- Monitor eviction rate (evictionRate)
- If evictionRate > 10%, increase maxEntries


## Q: How to manually clear the cache?

**A**: monSQLize already supports write operations; however, it is still recommended to manually clear the cache in the following scenarios:

```javascript
const { collection } = await msq.connect();

//Scenario 1: Data is modified by an external tool (such as MongoDB Shell)
//Need to clear cache manually
await collection('products').invalidate();
console.log('✅ products collection cache cleared');

//Scenario 2: Refresh cache regularly
setInterval(async () => {
  await collection('products').invalidate();
  console.log('✅ Cache has been refreshed');
}, 5 * 60 * 1000);  //Refresh every 5 minutes

//Scenario 3: Batch clear multiple collections
const collections = ['products', 'users', 'orders'];
for (const name of collections) {
  await collection(name).invalidate();
  console.log(`✅ ${name} cache cleared`);
}
```

**Note**:
- After using external tools to modify data, you still need to manually call `invalidate()` to clear the cache
- For write operations initiated through monSQLize, automatic invalidation can be used in conjunction with `autoInvalidate`
- If your caching strategy is cross-process/cross-node, it is recommended to combine it with distributed invalidation broadcast.


## Q: How to disable cache?

**A**: There are three ways:

```javascript
//Method 1: Disable globally (no cache configuration is passed during construction)
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
  //Do not pass cache configuration
});

//Method 2: Query-level disable
await collection('orders').find({
  query: {},
  cache: 0,              //cache: 0 means no caching
  maxTimeMS: 3000
});

//Method 3: Do not pass cache parameters
await collection('orders').find({
  query: {},
  maxTimeMS: 3000        //Do not pass cache parameters
});
```


## Q: What is the difference between cache and Bookmark?

**A**:
- **Cache (find/findOne/aggregate/distinct)**: cache query results (complete document list)
- **Bookmark(findPage)**: Cache paging cursor (only stores the starting position of every N pages)

```javascript
//Cache query results (store complete data)
const products = await collection('products').find({
  query: {},
  cache: 60000           //Cache the complete products list
});

//Bookmark paging (only stores cursor position)
const page1 = await collection('products').findPage({
  query: {},
  limit: 20,
  bookmarks: {
    step: 10,            //Store a cursor every 10 pages
    ttlMs: 3600000       //Cursor cache 1 hour
  }
});
```

---

## Cache invalidation API


## invalidate()

Manually clear all caches for the specified collection. Suitable for scenarios where the cache needs to be refreshed immediately.


### Method signature

```javascript
await collection('collectionName').invalidate()
```


### Parameter description

No parameters. Clears all query caches for the currently bound collection.


### Return value

Return `Promise<void>`.

---


## Usage scenarios


### 1. Refresh cache after external tool modifies data

```javascript
const { collection } = await msq.connect();

// Scenario: data is modified using MongoDB Shell, Compass, or other tools.
// Clear the monSQLize cache manually.

// Clear the cache of the products collection.
await collection('products').invalidate();

console.log('✅ The cache has been cleared and the next query will get the latest data');
```

---


### 2. Refresh the cache regularly

```javascript
const { collection } = await msq.connect();

//Refresh the products cache every 5 minutes
setInterval(async () => {
  await collection('products').invalidate();
  console.log('✅ products cache has been refreshed');
}, 5 * 60 * 1000);
```

---


### 3. Multi-collection cache clearing

```javascript
const { collection } = await msq.connect();

//Clear cache for multiple collections
async function clearAllCache() {
  const collections = ['products', 'users', 'orders', 'configs'];

  for (const name of collections) {
    await collection(name).invalidate();
    console.log(`✅ ${name} cache cleared`);
  }
}

await clearAllCache();
```

---


## Instructions for use

**Important note**: The current version of monSQLize already supports write operations such as `insertOne` / `updateOne` / `deleteOne`; when writing through monSQLize, the relevant cache will be processed according to the current invalidation policy. `invalidate()` is still used in the following scenarios:

1. **Explicit cleanup after external writes**:
   - After directly modifying data using MongoDB Shell, Compass or other applications
   - After bypassing bulk import, migration scripts or manual data repair
2. **Active refresh strategy**:
   - Regularly refresh the hotspot collection cache
   - Temporarily force clear the query cache of a certain collection
3. **Custom cache boundaries**:
   - When using a custom cache adapter or additional cache on the business side, you need to decide the scope of cleaning by yourself

**Current Best Practices**:
-Business writes are first executed through monSQLize to avoid bypassing cache invalid links
- Immediately after the external tool or bypass script modifies the data, call `invalidate()`
- Regularly monitor the cache hit rate to determine whether regular refresh is needed
- Avoid overuse and only clear cache when necessary

---


## Best Practices (Cache Invalidation API)


### 1. Avoid overuse

```javascript
//❌ Not recommended: clear cache before each query
await collection('products').invalidate();
const products = await collection('products').find({
  query: {},
  cache: 60000
});

//✅ Recommended: Clear cache only when necessary
//Only clear manually when data is modified externally or when there are special needs
```

---


### 2. Combined with cache monitoring

```javascript
const cache = msq.getCache();

//Record statistics before clearing cache
const beforeStats = cache.getStats();
console.log('Clear cached items:', beforeStats.size);

//clear cache
await collection('products').invalidate();

//Record statistics after clearing
const afterStats = cache.getStats();
console.log('Cache items after clearing:', afterStats.size);
console.log('Clear quantity:', beforeStats.size - afterStats.size);
```

---


### 3. Use parallelism when cleaning in batches

```javascript
//✅ Parallel cleaning (faster)
const collections = ['products', 'users', 'orders'];

await Promise.all(
  collections.map(name => collection(name).invalidate())
);

console.log('✅ All caches cleared');
```

---


### 4. Error handling of scheduled refresh

```javascript
//Refresh the cache regularly with error handling
setInterval(async () => {
  try {
    await collection('products').invalidate();
    console.log('✅ products cache has been refreshed');
  } catch (error) {
    console.error('❌ Cache refresh failed:', error.message);
  }
}, 5 * 60 * 1000);
```

---


## Notes

1. **Clear Range**: `invalidate()` Only clears the query cache of the specified collection, without affecting other collections
2. **Performance impact**: After clearing the cache, the next query needs to access the database, which will cause performance loss.
3. **Do not clear Bookmarks**: `invalidate()` does not clear the Bookmark cache of findPage, you need to use `clearBookmarks()`
4. **Bypass write restrictions**: When writing by bypassing monSQLize through external tools or other services, you must manually call `invalidate()` or perform equivalent business cleanup actions

---


## Related methods

- **`clearBookmarks(collectionName?)`** - Clear findPage's Bookmark cache (see [Bookmarks documentation](./bookmarks.md))
- **`getCache()`** - Get the cache instance, you can call `clear()` to clear all caches (see [Tool Method Document](./utilities.md))

---

## References

- [LRU cache algorithm](https://en.wikipedia.org/wiki/Cache_replacement_policies#Least_recently_used_(LRU))
- [Redis cache strategy](https://redis.io/topics/lru-cache)
- [HTTP Cache Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [monSQLize README](../../README.md)
- [findPage document](./findPage.md)
- [Bookmarks Document](./bookmarks.md)
- [Tool method document](./utilities.md)
