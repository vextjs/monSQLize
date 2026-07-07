# Comparison of MongoDB native vs monSQLize extended functions

This document provides a detailed comparison of the functional differences between MongoDB's native driver and monSQLize to help you understand the additional value provided by monSQLize.

## Quick comparison table

| Feature Category | MongoDB Native | monSQLize | Major Enhancements |
|---------|-------------|-----------|---------|
| **Query operation** | | | Smart cache, cursor paging, slow query log |
| **INSERT OPERATION** | | | High performance batch insert (10-50x), slow query monitoring |
| **Update operation** | | | Automatic cache invalidation, complete error handling |
| **Delete operation** | | | Automatic cache invalidation, slow query monitoring |
| **Aggregation operation** | | | Cache support, streaming processing |
| **Execution Plan** | | | Integrated into query chain |
| **Cross-database access** | Manual switching | | One line of code switching |
| **Cache Management** | | | TTL/LRU/auto-invalidation/multi-layer caching |
| **Performance Monitoring** | Configuration required | | Out-of-the-box slow query log |

---

## MongoDB native functions (full support)

monSQLize fully encapsulates all native functions of MongoDB. You can use the familiar MongoDB API:


## Complete CRUD operation

| Operations | Methods | Native Support | Documentation |
|------|------|---------|------|
| **Create** | insertOne, insertMany | | [insertOne guide](./insert-one.md), [insertMany guide](./insert-many.md) |
| **Read** | find, findOne, aggregate, count, distinct | | [find guide](./find.md), [findOne guide](./findOne.md) |
| **Update** | updateOne, updateMany, replaceOne | | [updateOne guide](./update-one.md), [updateMany guide](./update-many.md) |
| **Delete** | deleteOne, deleteMany | | [deleteOne guide](./delete-one.md), [deleteMany guide](./delete-many.md) |


## Atomic operations

| Methods | Native Support | Documentation |
|------|---------|------|
| findOneAndUpdate | | [findOneAndUpdate guide](./find-one-and-update.md) |
| findOneAndReplace | | [findOneAndReplace guide](./find-one-and-replace.md) |
| findOneAndDelete | | [findOneAndDelete guide](./find-one-and-delete.md) |


## Index management

| Methods | Native Support | Documentation |
|------|---------|------|
| createIndex, createIndexes | | [Index creation guide](./create-index.md) |
| listIndexes | | [Index listing guide](./list-indexes.md) |
| dropIndex, dropIndexes | | [Index drop guide](./drop-index.md) |


## All query options

| Options | Native support | Description |
|------|---------|------|
| projection | | Field projection |
| sort | | sort |
| limit / skip | | paging |
| hint | | Index hints |
| collation | | sorting rules |
| maxTimeMS | | Operation timed out |
| comment | | Operation comments |

---

## monSQLize’s unique extension functions

Based on MongoDB's native functions, monSQLize provides additional convenience and performance optimization:

---

## 1. Intelligent caching system


## MongoDB native: no cache

```javascript
//MongoDB native: query the database every time
const db = client.db('shop');
const products = await db.collection('products').find({
  category: 'electronics'
}).toArray();
//Time consumption: ~10-50ms

//Query again: still query the database
const products2 = await db.collection('products').find({
  category: 'electronics'
}).toArray();
//Time taken: ~10-50ms (no caching)
```


## monSQLize: smart caching

```javascript
//monSQLize: automatic caching
const products = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }  //Cache for 5 seconds
);
//The 1st time: Querying the database takes ~10-50ms

//Query again: return from cache
const products2 = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }
);
//Time 2: Returning from cache, takes ~0.001ms (1000x faster)
```


## Comparison of cache features

| Features | MongoDB native | monSQLize |
|------|-------------|-----------|
| **Query Cache** | None | TTL + LRU |
| **Automatic expiration** | None | Automatically clean up after writing operations |
| **Namespace Isolation** | None | Isolate by instance/database/collection |
| **Concurrent deduplication** | None | Prevent cache breakdown |
| **Cache Statistics** | None | Hit Rate/Number of Eliminations |
| **Multi-tier caching** | None | Local + Redis |

**Detailed documentation**: [Cache system](./cache.md)

**Performance improvement**: Speed increase when cache hits **1000x** (10-50ms → 0.001ms)

---

## 2. Automatic cache invalidation


## MongoDB native: Manual cache management

```javascript
//Requires manual management of cache consistency
const cache = new Map();

//Manually check cache when querying
const cacheKey = 'products:electronics';
let products = cache.get(cacheKey);

if (!products) {
  products = await db.collection('products').find({
    category: 'electronics'
  }).toArray();
  cache.set(cacheKey, products);
}

//Manually clear the cache when updating (easy to miss)
await db.collection('products').insertOne({
  name: 'New Product',
  category: 'electronics'
});

//The relevant cache must be cleared manually
cache.delete('products:electronics');  //Easy to forget or incomplete cleaning
```


## monSQLize: automatic cache invalidation

```javascript
//monSQLize: Automatically manage cache consistency
const products = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }
);
//Cache has been created automatically

//Insert new data
await collection('products').insertOne({
  name: 'New Product',
  category: 'electronics'
});
//Automatically clear cache of all products collections

//Query again: automatically obtain the latest data from the database
const freshProducts = await collection('products').find(
  { category: 'electronics' },
  { cache: 5000 }
);
//Data is up-to-date and requires no manual management
```


## Operations supported by automatic invalidation

| Operations | MongoDB native | monSQLize |
|------|-------------|-----------|
| insertOne / insertMany | Manual invalidation | Automatic invalidation |
| updateOne / updateMany | Manual invalidation | Automatic invalidation |
| deleteOne / deleteMany | Manual invalidation | Automatic invalidation |
| replaceOne | Manual invalidation | Automatic invalidation |
| findOneAndUpdate | Manual invalidation | Automatic invalidation |
| findOneAndReplace | Manual invalidation | Automatic invalidation |
| findOneAndDelete | Manual invalidation | Automatic invalidation |

**Benefits**: Prevents cache inconsistencies and ensures data is always up to date.

---

## 3. Depth paging (cursor paging)


## MongoDB native: offset/limit paging (poor performance)

```javascript
// MongoDB native: use skip + limit (deep paging is slow)
const page = 1000;  //Page 1000
const pageSize = 20;

const products = await db.collection('products')
  .find({ category: 'electronics' })
  .sort({ createdAt: -1 })
  .skip((page - 1) * pageSize)  // Skip 19980 documents (very slow)
  .limit(pageSize)
  .toArray();

// Problem:
// - skip requires scanning all previous documents (performance decreases linearly with the number of pages)
// - Page 1000 needs to scan 19980 documents, which is very slow
// - Paging results are unstable when data changes (insertions/deletions affect subsequent pages)
```

**Performance comparison**:

| Number of pages | skip + limit time consuming | performance |
|------|------------------|------|
| Page 1 | 10ms | Fast |
| Page 100 | 50ms | Slower |
| Page 1000 | 500ms | Very slow |
| Page 10000 | 5000ms | Not available |


## monSQLize: Cursor paging (stable performance)

```javascript
// monSQLize: use cursor paging (deep paging is also fast)
const page1 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    sort: { createdAt: -1 },
    bookmarks: {
      step: 10,      // Cache a bookmark every 10 pages
      maxHops: 20    // Jump up to 20 times
    }
  }
);

// Jump to page 1000 (jump via bookmark, no need to scan all data)
const page1000 = await collection('products').findPage(
  { category: 'electronics' },
  {
    limit: 20,
    page: 1000,    // Skip directly to page 1000
    bookmarks: { step: 10, maxHops: 20 }
  }
);

// Performance:
// - Skip through bookmarks to avoid scanning large amounts of data
// - Stable deep-paging performance (~10-20ms)
// - Data changes do not affect existing pages (the cursor locks the data set at query time)
```

**Performance comparison**:

| Number of pages | skip + limit | monSQLize cursor paging | Performance improvement |
|------|-------------|-------------------|---------|
| Page 1 | 10ms | 10ms | 1x |
| Page 100 | 50ms | 12ms | **4x** |
| Page 1000 | 500ms | 15ms | **33x** |
| Page 10000 | 5000ms | 20ms | **250x** |


## Comparison of paging features

| Features | MongoDB native (skip/limit) | monSQLize (cursor paging) |
|------|--------------------------|---------------------|
| **Deep paging performance** | Linear decline with the number of pages | Stable performance (bookmark jump) |
| **Flip forward and backward** | Support | Support (after/before) |
| **Jump page** | Supported (but slow) | Supported (and fast) |
| **Total statistics** | Need to be queried separately | Asynchronous statistics (no blocking) |
| **Data Stability** | Insertion/deletion affects paging | Cursor locked data set |

**Detailed documentation**: [findPage guide](./findPage.md)

---

## 4. Performance monitoring (slow query log)


## MongoDB native: profiling needs to be configured

```javascript
// MongoDB native: requires manual profiling configuration
await db.setProfilingLevel(1, { slowms: 100 });

// View the slow query log (requires querying system.profile separately)
const slowQueries = await db.collection('system.profile')
  .find({ millis: { $gt: 100 } })
  .toArray();

// Problem:
// - Requires manual configuration
// - Logs are stored in the database (occupying space)
// - Requires separate query and analysis
// - Slow-query warnings cannot be seen directly in the code
```


## monSQLize: Slow query log out of the box

```javascript
// monSQLize: automatically monitor slow queries
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 1000  // Log warning after 1 second (default)
});

// Automatically monitor slow query events
msq.on('slow-query', (data) => {
  console.warn('Slow query warning:', {
    operation: data.operation,
    collection: data.collectionName,
    duration: data.duration,
    query: data.query,
    options: data.options
  });
});

// Execute queries (automated monitoring)
const products = await collection('products').find({
  category: 'electronics'
});

// If the query takes more than 1 second, the slow-query event is automatically triggered.
// Output: Slow query warning: { operation: 'find', collection: 'products', duration: 1200, ... }
```


## Comparison of performance monitoring features

| Features | MongoDB native | monSQLize |
|------|-------------|-----------|
| **Slow Query Monitoring** | Requires profiling configuration | Ready to use out of the box |
| **Real-time Alarm** | Need to check the log separately | Events are automatically triggered |
| **Query Timeout** | maxTimeMS | Global + Query Level |
| **Operation time consuming** | Requires profiling | Automatic recording |
| **Log Storage** | Occupies database space | Application layer logs |

**Detailed documentation**: [Event system](./events.md)

---

## 5. Cross-database access


## MongoDB native: Manually switch databases

```javascript
// MongoDB native: switch databases manually
const client = new MongoClient('mongodb://localhost:27017');
await client.connect();

// Access the shop database
const shopDb = client.db('shop');
const products = await shopDb.collection('products').find({}).toArray();

// Access the analytics database (requires manual switching)
const analyticsDb = client.db('analytics');  // Manual switching
const events = await analyticsDb.collection('events').find({}).toArray();

// Problem:
// - Each cross-database access needs a manual switch
// - Verbose code
// - Error-prone
```


## monSQLize: scoped access across databases

```javascript
// monSQLize: cross-database access with an explicit scoped accessor
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',  // Default database
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection, use } = await msq.connect();

// Access the default database (shop)
const products = await collection('products').find({});

// Access analytics with a scoped database accessor
const events = await use('analytics').collection('events').find({});
// Concise and clear for business collection access

// Chained cross-database access
const logs = await use('logs').collection('access_logs').find({});
```


## Comparison of cross-database access features

| Features | MongoDB native | monSQLize |
|------|-------------|-----------|
| **Cross-database switching** | Manual `client.db(name)` | Scoped collection access with `use(name)` |
| **Default database** | No concept | Automatically use the default database |
| **Code Simplicity** | Lengthy | Concise |
| **Cache Isolation** | No cache | Automatic isolation by database |

**Detailed documentation**: [Connection configuration](./connection.md)

---

## 6. Type Safety (TypeScript)


## MongoDB native: generic types

```typescript
//MongoDB native: basic generic types
import { MongoClient, Collection } from 'mongodb';

interface Product {
  _id?: ObjectId;
  name: string;
  price: number;
}

const client = new MongoClient('mongodb://localhost:27017');
const db = client.db('shop');
const products: Collection<Product> = db.collection('products');

//Basic type inference
const result = await products.findOne({ name: 'iPhone' });
// result: Product | null
```


## monSQLize: complete type declaration

```typescript
//monSQLize: Complete TypeScript types
import MonSQLize from 'monsqlize';

interface Product {
  _id?: ObjectId;
  name: string;
  price: number;
  category: string;
}

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection } = await msq.connect();

//Type-safe queries
const products = await collection('products').find<Product>(
  { category: 'electronics' },
  {
    cache: 5000,         //Option type check
    projection: { name: 1, price: 1 },  //Projection type check
    limit: 20            //Parameter type checking
  }
);
// products: Product[]

//Option autocomplete
const result = await collection('products').findPage<Product>(
  { category: 'electronics' },
  {
    cache: 5000,
    bookmarks: {
      step: 10,          //IDE auto-completion
      maxHops: 20,       //Type tips
      ttlMs: 3600000     //Type checking
    }
  }
);
```


## TypeScript supports comparison

| Features | MongoDB native | monSQLize |
|------|-------------|-----------|
| **Basic types** | Generics support | Full type declaration |
| **Option Type** | Partial Support | Full Support |
| **IDE Completion** | Basic Completion | Full Completion |
| **Type Check** | Partial Check | Strict Check |

**Type declaration file**: [types/index.d.ts](../../types/index.d.ts)

---

## 7. Batch insert performance optimization


## MongoDB native: standard insertMany

```javascript
//MongoDB native: standard insertMany
const documents = Array.from({ length: 10000 }, (_, i) => ({
  index: i,
  name: `Product ${i}`,
  price: Math.random() * 1000
}));

//One-time insert (may timeout or run out of memory)
const result = await db.collection('products').insertMany(documents);
//Performance: ~2000ms
//Risk: Large batches may timeout or memory overflow
```


## monSQLize: Intelligent batch insertion

```javascript
//monSQLize: insertMany (automatic optimization)
const documents = Array.from({ length: 10000 }, (_, i) => ({
  index: i,
  name: `Product ${i}`,
  price: Math.random() * 1000
}));

//Standard insertMany (performance optimized)
const result = await collection('products').insertMany(documents);
//Performance: ~100ms (10-50x faster than native)

//Very large batches: use insertBatch (automatic batching)
const result2 = await collection('products').insertBatch(documents, {
  batchSize: 1000  //1000 pieces per batch
});
//Performance: ~200ms (more stable, no risk of timeout)
```


## Batch insert performance comparison

| Quantity | MongoDB native | monSQLize insertMany | monSQLize insertBatch |
|------|-------------|---------------------|----------------------|
| 100 | 20ms | 2ms (**10x**) | 5ms |
| 1,000 | 200ms | 10ms (**20x**) | 20ms |
| 10,000 | 2000ms | 100ms (**20x**) | 200ms |
| 100,000 | Timeout | 1000ms | 2000ms (batch safe) |

**Detailed documentation**: [insertMany guide](./insert-many.md), [insertBatch guide](./insertBatch.md)

---

## 8. Multi-layer caching (local + Redis)


## MongoDB native: no cache (8. Multi-layer cache (local + Redis))

```javascript
//MongoDB native: query the database every time
const products = await db.collection('products').find({
  category: 'electronics'
}).toArray();
//Time consumption: ~10-50ms (check the database every time)
```


## monSQLize: multi-layer caching

```javascript
//monSQLize: local memory + Redis multi-layer cache
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },

  cache: {
    multiLevel: true,
    local: { maxEntries: 10000 },  //Local cache 10,000 items
    remote: MonSQLize.createRedisCacheAdapter('redis://localhost:6379/0')
  }
});

//The 1st time: query MongoDB (10-50ms) → store locally + Redis
const products1 = await collection('products').find(
  { category: 'electronics' },
  { cache: 10000 }
);

//Time 2: Local cache hit (0.001ms)
const products2 = await collection('products').find(
  { category: 'electronics' },
  { cache: 10000 }
);

//If local cache expires but Redis still exists → read from Redis (1-2ms)
```


## Multi-layer cache performance comparison

| Cache layer | Hit time | Performance improvement |
|--------|---------|---------|
| **Database Query** | 10-50ms | Benchmark |
| **Redis cache** | 1-2ms | **10-50x** |
| **Local Cache** | 0.001ms | **10000-50000x** |


## Comparison of multi-layer cache features

| Features | MongoDB native | monSQLize |
|------|-------------|-----------|
| **Local Cache** | None | Memory LRU |
| **Remote Cache** | None | Redis Support |
| **Multi-tier caching** | None | Local + Redis |
| **Auto Backfill** | None | Backfill local on Redis hit |
| **Cache Consistency** | None | Write operations automatically invalidated |

**Detailed documentation**: [Multi-layer caching](./cache.md#multi-layer-caching)

---

## 9. Chain call API


## MongoDB native: cursor chain call

```javascript
//MongoDB native: cursor chain call
const cursor = db.collection('products')
  .find({ category: 'electronics' })
  .sort({ price: -1 })
  .skip(20)
  .limit(10);

const products = await cursor.toArray();
```


## monSQLize: complete chain call + cache

```javascript
//monSQLize: chained calls + cache support
const products = await collection('products')
  .find({ category: 'electronics' })
  .sort({ price: -1 })
  .skip(20)
  .limit(10)
  .cache(5000)        //Chain cache
  .maxTimeMS(3000)    //✅Chain timeout
  .comment('API:listProducts')  //✅Chained comments
  .toArray();
```


## Comparison of chain call features

| Features | MongoDB native | monSQLize |
|------|-------------|-----------|
| **Basic chaining** | find/sort/limit | Full support |
| **Cache Chain** | None | .cache() |
| **Timeout Chaining** | Required in find option | .maxTimeMS() |
| **Comment chaining** | Required in find option | .comment() |
| **Streaming chain** | .stream() | .stream() + cache |

**Detailed documentation**: [Chain query API](./chaining-api.md)

---

## 10. Event system


## MongoDB native: listening to driver events

```javascript
//MongoDB native: listening to underlying driver events
client.on('commandStarted', (event) => {
  console.log('Command:', event.commandName);
});

client.on('serverHeartbeatFailed', (event) => {
  console.error('Heartbeat failed');
});

//Question:
//- Only low-level driver events
//- No slow query events
//- No cache related events
```


## monSQLize: rich business events

```javascript
//monSQLize: business-level events
msq.on('slow-query', (data) => {
  console.warn('Slow query:', data.operation, data.duration);
});

msq.on('cache-hit', (data) => {
  console.log('Cache hit:', data.key);
});

msq.on('cache-miss', (data) => {
  console.log('Cache miss:', data.key);
});

msq.on('connected', () => {
  console.log('Database is connected');
});

msq.on('error', (data) => {
  console.error('Error:', data.error.message);
});
```


## Event system comparison

| Event type | MongoDB native | monSQLize |
|---------|-------------|-----------|
| **Connection Event** | | |
| **DRIVING EVENT** | | |
| **Slow Query Event** | | |
| **Cache Event** | | |
| **Business Event** | | |

**Detailed documentation**: [Event system](./events.md)

---

## Usage suggestions


## When to use MongoDB native driver?

**Suitable scene**:
- Simple script or tool
- No caching required
- No advanced pagination required
- Low performance requirements


## When to use monSQLize?

**Suitable scene**:
- **Production Application** - Requires caching and performance optimization
- **High Traffic API** - Caching can reduce database pressure
- **Deep Pagination** - list page, search results, etc.
- **Multi-database application** - requires cross-database access
- **Performance Monitoring** - Slow query alarm required
- **Complex Business** - Requires automatic cache invalidation

---

## Summary and comparison

| Dimensions | MongoDB native | monSQLize | Boost |
|------|-------------|-----------|------|
| **Functional Completeness** |  |  | 100% Compatible + Extensions |
| **Performance (No Cache)** |  |  | Bulk Inserts 10-50x |
| **Performance (With Cache)** | ☆☆☆☆ |  | Cache Hits 1000x |
| **Deep Paging** | ☆☆☆ |  | Deep Paging 250x |
| **Ease of Use** |  |  | Simpler API |
| **Maintainability** |  |  | Automatic cache invalidation |
| **Observability** | ☆☆☆ |  | Out-of-the-box monitoring |

---

## Quick Start

If you want to experience the extended capabilities of monSQLize, start here:

1. **Installation**: `npm install monsqlize`
2. **Enable cache**: Add `{ cache: 5000 }` to the query
3. **Use paging**: Use `findPage()` instead of `find()`
4. **Monitor slow query**: Listen for `slow-query` events
5. **Cross-database access**: use `use(name).collection(name)` for business collections; reserve `db(name)` for database-level commands

**Full example**: View the [getting started guide](./getting-started.md)

---

## Related documents

- [Cache system](./cache.md) - Detailed documentation of cache system
- [findPage guide](./findPage.md) - Query detailed documents by page
- [Event system](./events.md) - Event system detailed documentation
- [insertMany guide](./insert-many.md) - Batch insert performance optimization
- [Connection configuration](./connection.md) - Connection management and cross-database access
