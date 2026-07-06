# Tool methods

## Overview

monSQLize provides a set of practical utility methods for accessing internal state, obtaining configuration information, and namespace information. These methods help developers better understand and debug applications.

## Core Features

- ✅ **Cache instance access**: Get the underlying cache instance for advanced operations
- ✅ **Configuration Query**: View the current default configuration and parameters
- ✅ **Namespace Information**: Get the complete namespace of a collection

---

## API methods


## getCache()

Obtain the underlying cache instance and support direct operation of the cache.


### Method signature

```javascript
const cache = msq.getCache()
```


### Parameter description

No parameters.


### Return value

```javascript
MultiLevelCache | null  //Cache instance, or null if caching is not enabled
```


### Cache instance method

| Method | Description |
|------|------|
| `get(key)` | Get cached value |
| `set(key, value, ttl)` | Set cache value |
| `delete(key)` | Delete cache items |
| `clear()` | Clear all cache |
| `keys(pattern)` | Get a list of cache keys matching the pattern |
| `getStats()` | Get cache statistics |

---

## Usage example


## Basic usage


### 1. Get cache instance

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cacheEnabled: true  //Enable caching
});

await msq.connect();

//Get cache instance
const cache = msq.getCache();

if (cache) {
  console.log('✅ Caching is enabled');
  console.log('Cache type:', cache.constructor.name);
} else {
  console.log('⚠️ Caching is not enabled');
}
```

---


### 2. View cache statistics

```javascript
const cache = msq.getCache();

if (cache) {
  const stats = cache.getStats();
  console.log('Cache statistics:', {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(2)}%`,
    cacheItems: stats.size,
    memoryUsage: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`
  });
}
```

**Example output**:
```javascript
{
Number of hits: 150,
Number of misses: 50,
Hit rate: '75.00%',
Number of cached items: 85,
Memory usage: '2.34 MB'
}
```

---


### 3. Manual cache operation

```javascript
const { collection } = await msq.connect();
const cache = msq.getCache();

if (cache) {
  //Manually set cache
  const cacheKey = 'custom:data:123';
  cache.set(cacheKey, { id: 123, name: 'Product A' }, 3600000); //1 hour

  //Get cache manually
  const cached = cache.get(cacheKey);
  console.log('Cached data:', cached);

  //Manually delete cache
  cache.delete(cacheKey);
  console.log('✅ Cache has been deleted');
}
```

---


### 4. Clear all caches

```javascript
const cache = msq.getCache();

if (cache) {
  //Clear all cache
  cache.clear();
  console.log('✅ All caches have been cleared');

  //Verify
  const stats = cache.getStats();
  console.log('Number of cached items:', stats.size);  //should be 0
}
```

---


## getDefaults()

Get the default configuration parameters of the current instance.


### Method signature (getDefaults())

```javascript
const defaults = msq.getDefaults()
```


### Parameter description (getDefaults())

No parameters.


### Return value (getDefaults())

```javascript
{
  limit: number,          //Default query limit
  cache: number | false,  //Default cache TTL (milliseconds)
  maxTimeMS: number,      //Default query timeout (milliseconds)
  bookmarkTTL: number     //Bookmark cache TTL (milliseconds)
}
```

---


### 5. Get the cache information of a specific collection (recommended method ⭐)

**Method 1: Use `getNamespace()` + `cache.keys()` combination** (most convenient)

```javascript
const { collection } = await msq.connect();
const cache = msq.getCache();

if (cache) {
  //Get namespace information
  const ns = collection('products').getNamespace();
  console.log('Namespace:', ns);  // { iid: '...', type: 'mongodb', db: 'shop', collection: 'products' }

  //Build schemas using namespaces (more precise)
  const pattern = `*"collection":"${ns.collection}"*"db":"${ns.db}"*`;
  const productsCacheKeys = cache.keys(pattern);

  console.log('products collection cache information:');
  console.log('Number of cache keys:', productsCacheKeys.length);

  //View the contents of each cache key
  for (const key of productsCacheKeys.slice(0, 5)) {  //Show only first 5
    const value = await cache.get(key);
    console.log('Key:', key);
    console.log('Value:', value ? `${value.length} documents` : 'null');
  }
}
```

**Method 2: Use the collection name directly (simple but possible cross-database matching)**

```javascript
const cache = msq.getCache();

if (cache) {
  //Use only collection names (may match collections of the same name from other databases)
  const productsCacheKeys = cache.keys('*"collection":"products"*');

  console.log('Products collection cache quantity:', productsCacheKeys.length);
}
```

**Example output**:
```javascript
products collection cache information:
Number of cache keys: 12
  Key: {"ns":{"p":"monSQLize","v":1,"iid":"...","type":"mongodb","db":"shop","collection":"products"},"op":"find","query":{"status":"active"}}
Value: 25 documents
  Key: {"ns":{"p":"monSQLize","v":1,"iid":"...","type":"mongodb","db":"shop","collection":"products"},"op":"count","query":{}}
Value: null
  ...
```

---


### 6. Get the cache of a specific operation

```javascript
const cache = msq.getCache();

if (cache) {
  //Get cache keys for all find operations
  const findCacheKeys = cache.keys('*"op":"find"*');
  console.log('Number of find operation caches:', findCacheKeys.length);

  //Get cache keys for all count operations
  const countCacheKeys = cache.keys('*"op":"count"*');
  console.log('count number of operation caches:', countCacheKeys.length);

  //Get the find operation cache of the products collection
  const productsFind = cache.keys('*"collection":"products"*"op":"find"*');
  console.log('products find cache quantity:', productsFind.length);
}
```

---


### 7. Analyze cache usage (simplified method ⭐)

```javascript
const { collection } = await msq.getCache();
const cache = msq.getCache();

if (cache) {
  //Method 1: Use getNamespace() to get the exact namespace (recommended)
  async function getCacheInfoByCollection(collectionName) {
    const ns = collection(collectionName).getNamespace();
    const pattern = `*"collection":"${ns.collection}"*"db":"${ns.db}"*`;
    const allKeys = cache.keys(pattern);

    const info = {
      collection: ns.collection,
      database: ns.db,
      total: allKeys.length,
      operations: {}
    };

    //Statistics of various operation types
    for (const key of allKeys) {
      try {
        const keyObj = JSON.parse(key);
        const op = keyObj.op || 'unknown';
        info.operations[op] = (info.operations[op] || 0) + 1;
      } catch (e) {
        //Ignore unresolved keys
      }
    }

    return info;
  }

  //Get cached information for the products collection
  const productsInfo = await getCacheInfoByCollection('products');
  console.log('products cache information:', productsInfo);

  //Get multiple collections in batches
  const collections = ['products', 'users', 'orders'];
  const allInfo = {};
  for (const name of collections) {
    allInfo[name] = await getCacheInfoByCollection(name);
  }
  console.log('All collection cache:', allInfo);
}
```

**Example output**:
```javascript
products cache information: {
  collection: 'products',
  database: 'shop',
  total: 15,
  operations: { find: 8, count: 4, findOne: 3 }
}

all collection caches: {
  products: { collection: 'products', database: 'shop', total: 15, operations: { find: 8, count: 4, findOne: 3 } },
  users: { collection: 'users', database: 'shop', total: 8, operations: { find: 5, findOne: 3 } },
  orders: { collection: 'orders', database: 'shop', total: 6, operations: { find: 4, count: 2 } }
}
```

---


### 8. Complete cache management tool function

```javascript
const { collection } = await msq.connect();
const cache = msq.getCache();

//Encapsulated into tool class
class CacheManager {
  constructor(msq) {
    this.msq = msq;
    this.cache = msq.getCache();
  }

  //Get collection cache information
  async getCollectionCacheInfo(collectionName) {
    if (!this.cache) return null;

    const ns = this.msq.collection(collectionName).getNamespace();
    const pattern = `*"collection":"${ns.collection}"*"db":"${ns.db}"*`;
    const keys = this.cache.keys(pattern);

    return {
      collection: ns.collection,
      database: ns.db,
      namespace: `${ns.db}.${ns.collection}`,
      totalKeys: keys.length,
      operations: this._groupByOperation(keys),
      keys: keys
    };
  }

  //Group by operation type
  _groupByOperation(keys) {
    const ops = {};
    for (const key of keys) {
      try {
        const keyObj = JSON.parse(key);
        const op = keyObj.op || 'unknown';
        if (!ops[op]) ops[op] = [];
        ops[op].push(key);
      } catch (e) {
        //ignore
      }
    }
    return ops;
  }

  //Get global cache statistics
  getGlobalStats() {
    if (!this.cache) return null;
    return this.cache.getStats();
  }

  //Get the cache distribution of all collections
  getAllCollectionsCacheInfo() {
    if (!this.cache) return null;

    const allKeys = this.cache.keys('*');
    const collectionsMap = {};

    for (const key of allKeys) {
      try {
        const keyObj = JSON.parse(key);
        const ns = keyObj.ns;
        if (!ns || !ns.collection) continue;

        const collKey = `${ns.db}.${ns.collection}`;
        if (!collectionsMap[collKey]) {
          collectionsMap[collKey] = {
            database: ns.db,
            collection: ns.collection,
            totalKeys: 0,
            operations: {}
          };
        }

        collectionsMap[collKey].totalKeys++;
        const op = keyObj.op || 'unknown';
        collectionsMap[collKey].operations[op] =
          (collectionsMap[collKey].operations[op] || 0) + 1;
      } catch (e) {
        //ignore
      }
    }

    return collectionsMap;
  }
}

//Usage example
const cacheManager = new CacheManager(msq);

//Get products cache information
const productsCache = await cacheManager.getCollectionCacheInfo('products');
console.log('products cache:', productsCache);

//Get global statistics
const globalStats = cacheManager.getGlobalStats();
console.log('Global cache statistics:', globalStats);

//Get the cache distribution of all collections
const allCollections = cacheManager.getAllCollectionsCacheInfo();
console.log('All collection cache:', allCollections);
```

---

## getDefaults() example


## 1. View the default configuration

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  defaults: {
    limit: 50,
    cache: 10000,
    maxTimeMS: 5000
  }
});

await msq.connect();

//Get default configuration
const defaults = msq.getDefaults();
console.log('Default configuration:', defaults);
```

**Example output**:
```javascript
{
  limit: 50,
  cache: 10000,
  maxTimeMS: 5000,
  bookmarkTTL: 300000
}
```

---


## 2. Verify that the configuration takes effect

```javascript
const { collection } = await msq.connect();

//Get default configuration
const defaults = msq.getDefaults();

//No parameters are specified when querying, and default values are used.
const products = await collection('products').find(
  { status: 'active' },
  {
    //limit: use defaults.limit (50)
    //cache: use defaults.cache (10000)
    //maxTimeMS: use defaults.maxTimeMS (5000)
  }
);

console.log(`Query results: ${products.length} documents`);
console.log(`Default limits applied: ${defaults.limit}`);
```

---


## 3. Debugging configuration issues

```javascript
const defaults = msq.getDefaults();

//Check if caching is enabled
if (defaults.cache === false) {
  console.log('⚠️ Caching disabled');
} else {
  console.log(`✅ Cache is enabled, default TTL: ${defaults.cache}ms`);
}

//Check query timeout
if (defaults.maxTimeMS < 3000) {
  console.warn(`⚠️Shorter query timeout: ${defaults.maxTimeMS}ms`);
}

//Check paging limits
if (defaults.limit > 100) {
  console.warn(`⚠️ The default paging limit is large: ${defaults.limit}`);
}
```

---


## 4. Runtime configuration comparison

```javascript
//Create multiple instances and compare configurations
const msq1 = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  defaults: { limit: 20, cache: 5000 }
});

const msq2 = new MonSQLize({
  type: 'mongodb',
  databaseName: 'analytics',
  config: { uri: 'mongodb://localhost:27017' },
  defaults: { limit: 100, cache: false }
});

await msq1.connect();
await msq2.connect();

console.log('Example 1 configuration:', msq1.getDefaults());
console.log('Example 2 configuration:', msq2.getDefaults());

//Output:
//Example 1 configuration: { limit: 20, cache: 5000, maxTimeMS: 3000, bookmarkTTL: 300000 }
//Example 2 configuration: { limit: 100, cache: false, maxTimeMS: 3000, bookmarkTTL: 300000 }
```

---


## getNamespace()

Get the complete namespace of the collection (format: `databaseName.collectionName`).


### Method signature (getNamespace())

```javascript
const namespace = collection('collectionName').getNamespace()
```


### Parameter description (getNamespace())

No parameters. Returns the namespace of the currently bound collection.


### Return value (getNamespace())

```javascript
string  //Format: "databaseName.collectionName"
```

---

## getNamespace() example


## 1. Get the namespace

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const { collection } = await msq.connect();

//Get namespace
const namespace = collection('products').getNamespace();
console.log('Namespace:', namespace);  //Output: "shop.products"
```

---


## 2. Multiple collection namespaces

```javascript
const { collection } = await msq.connect();

//Get the namespace of multiple collections
const collections = ['users', 'orders', 'products', 'logs'];

collections.forEach(name => {
  const namespace = collection(name).getNamespace();
  console.log(`Namespace of ${name}: ${namespace}`);
});

//Output:
//users namespace: shop.users
//Namespace of orders: shop.orders
//products namespace: shop.products
//Namespace of logs: shop.logs
```

---


## 3. Application of namespace in logs

```javascript
const { collection } = await msq.connect();

//Record namespace before querying
const namespace = collection('products').getNamespace();
console.log(`[${new Date().toISOString()}] Query collection: ${namespace}`);

const result = await collection('products').find(
  { status: 'active' },
  { limit: 10 }
);

console.log(`[${new Date().toISOString()}] Query completed: ${namespace}, result: ${result.length} documents`);

//Output:
//[2025-11-06T10:30:00.000Z] Query collection: shop.products
//[2025-11-06T10:30:00.123Z] Query completed: shop.products, results: 10 documents
```

---


## 4. Namespace verification

```javascript
const { collection } = await msq.connect();

//Verify namespace format
function validateNamespace(collectionName) {
  const namespace = collection(collectionName).getNamespace();
  const [dbName, colName] = namespace.split('.');

  console.log(`Database name: ${dbName}`);
  console.log(`Collection name: ${colName}`);
  console.log(`Full namespace: ${namespace}`);

  return { dbName, colName, namespace };
}

validateNamespace('products');

//Output:
//Database name: shop
//Collection name: products
//Full namespace: shop.products
```

---


## 5. Namespace when operating across databases

```javascript
//Create two instances of different databases
const shopDB = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const analyticsDB = new MonSQLize({
  type: 'mongodb',
  databaseName: 'analytics',
  config: { uri: 'mongodb://localhost:27017' }
});

await shopDB.connect();
await analyticsDB.connect();

//Compare namespaces
const shopCollection = shopDB.collection('products');
const analyticsCollection = analyticsDB.collection('products');

console.log('Shop namespace:', shopCollection.getNamespace());        // shop.products
console.log('Analytics namespace:', analyticsCollection.getNamespace()); // analytics.products
```

---

## Best Practices


## 1. Cache monitoring

Regularly monitor cache statistics and optimize cache strategies:

```javascript
const cache = msq.getCache();

if (cache) {
  //Periodically output cache statistics
  setInterval(() => {
    const stats = cache.getStats();
    const hitRate = (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2);

    console.log('Cache statistics:', {
      hitRate: `${hitRate}%`,
      cacheItems: stats.size,
      memory: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`
    });

    //If the hit rate is less than 50%, consider adjusting the cache strategy
    if (parseFloat(hitRate) < 50) {
      console.warn('⚠️ The cache hit rate is too low, it is recommended to optimize the cache strategy');
    }
  }, 60000); //Check every minute
}
```

---


## 1.1 Monitor the cache of a specific collection (using getNamespace ⭐)

```javascript
const { collection } = await msq.connect();
const cache = msq.getCache();

if (cache) {
  //Recommendation: Use getNamespace() to get the exact namespace
  setInterval(() => {
    const ns = collection('products').getNamespace();
    const pattern = `*"collection":"${ns.collection}"*"db":"${ns.db}"*`;
    const productsKeys = cache.keys(pattern);

    //Statistics by operation type
    const findKeys = cache.keys(`${pattern}*"op":"find"*`);
    const countKeys = cache.keys(`${pattern}*"op":"count"*`);
    const findOneKeys = cache.keys(`${pattern}*"op":"findOne"*`);

    console.log('products collection cache:', {
      namespace: `${ns.db}.${ns.collection}`,
      totalCacheKeys: productsKeys.length,
      findOperations: findKeys.length,
      countOperations: countKeys.length,
      findOneOperations: findOneKeys.length
    });

    //If you have too many cache keys, you may need to adjust the TTL or cleanup policy
    if (productsKeys.length > 100) {
      console.warn('⚠️ There are too many cache keys in the products collection, it is recommended to shorten the TTL');
    }
  }, 60000);
}
```

---


## 2. Configuration verification

Verify the configuration is reasonable at startup:

```javascript
const defaults = msq.getDefaults();

//Verify configuration rationality
function validateConfig(defaults) {
  const warnings = [];

  if (defaults.limit > 100) {
    warnings.push(`The limit is too large (${defaults.limit}), which may affect performance`);
  }

  if (defaults.maxTimeMS < 1000) {
    warnings.push(`maxTimeMS is too small (${defaults.maxTimeMS}), which may cause query timeout`);
  }

  if (defaults.cache !== false && defaults.cache < 1000) {
    warnings.push(`cache TTL is too small (${defaults.cache}), cache effect is limited`);
  }

  if (warnings.length > 0) {
    console.warn('⚠️ Configuration warning:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  } else {
    console.log('✅ Configuration verification passed');
  }
}

validateConfig(defaults);
```

---


## 3. Namespace tracking

Use namespaces in logs to facilitate tracking:

```javascript
const { collection } = await msq.connect();

//Encapsulate log function with namespace
function logWithNamespace(collectionName, level, message, data) {
  const namespace = collection(collectionName).getNamespace();
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] [${level}] [${namespace}] ${message}`, data || '');
}

//Usage example
logWithNamespace('products', 'INFO', 'Start query', { query: { status: 'active' } });

const result = await collection('products').find(
  { status: 'active' },
  { limit: 10 }
);

logWithNamespace('products', 'INFO', 'Query completed', { count: result.length });

//Output:
//[2025-11-06T10:30:00.000Z] [INFO] [shop.products] Start query { query: { status: 'active' } }
//[2025-11-06T10:30:00.123Z] [INFO] [shop.products] Query completed { count: 10 }
```

---


## 4. Cache warm-up

Use `getCache()` to implement cache warm-up:

```javascript
const { collection } = await msq.connect();
const cache = msq.getCache();

if (cache) {
  //Warm up popular data
  async function prewarmCache() {
    console.log('Start cache warm-up...');

    //Warm up popular products
    const hotProducts = await collection('products').find(
      { featured: true },
      {
        limit: 100,
        cache: 3600000  //1 hour
      }
    );

    console.log(`✅ ${hotProducts.length} hot products have been preheated`);

    //Warm up user configuration
    const userConfigs = await collection('configs').find(
      { type: 'user' },
      {
        limit: 50,
        cache: 7200000  //2 hours
      }
    );

    console.log(`✅ ${userConfigs.length} user configurations have been warmed up`);

    //Show cache statistics
    const stats = cache.getStats();
    console.log('Cache warm-up completed:', {
      cacheItems: stats.size,
      memoryUsage: `${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`
    });
  }

  await prewarmCache();
}
```

---

## FAQ


## Q1: What should I do if `getCache()` returns `null`?

**A**: Description cache is not enabled and `cacheEnabled: true` needs to be configured during initialization:

```javascript
//❌ Caching is not enabled
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

const cache = msq.getCache();
console.log(cache);  // null

//✅ Enable caching
const msqWithCache = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  cacheEnabled: true  //Enable caching
});

const cacheEnabled = msqWithCache.getCache();
console.log(cacheEnabled);  //MultiLevelCache instance
```

---


## Q2: How to view the cache key of a query?

**A**: The cache key is automatically generated by the query parameters, the format is: `<namespace>:<query-hash>`

```javascript
const { collection } = await msq.connect();

//The query automatically generates a cache key
const result = await collection('products').find(
  { status: 'active' },
  {
    limit: 10,
    cache: 5000
  }
);

//Cache key example: "shop.products:hash({"status":"active"},10,{})"
//Contains: namespace + query parameter hash
```

---


## Q3: How to clear the cache of a specific collection?

**A**: You can use the `invalidate()` method:

```javascript
const { collection } = await msq.connect();

//Clear all caches for the products collection
await collection('products').invalidate();

console.log('✅ products collection cache cleared');

//Or manually clear all caches
const cache = msq.getCache();
if (cache) {
  cache.clear();
  console.log('✅ All caches cleared');
}
```

For details, see: [Caching Policy Document](./cache.md)

---


## Q4: Can the configuration of `getDefaults()` be modified?

**A**: cannot be modified directly, but can be overwritten during query:

```javascript
const defaults = msq.getDefaults();
console.log('Default limit:', defaults.limit);  // 20

//❌ The default configuration cannot be modified
//defaults.limit = 50; // invalid

//✅ Override default value when querying
const result = await collection('products').find(
  {},
  { limit: 50 }  //Override the default 20
);
```

If you need to modify the global defaults, you should recreate the MonSQLize instance.

---


## Q5: What are the practical uses of `getNamespace()`?

**A**: Identification mainly used for logging, debugging and cross-database operations:

```javascript
const { collection } = await msq.connect();

//Purpose 1: Logging
function logQuery(collectionName, query) {
  const namespace = collection(collectionName).getNamespace();
  console.log(`[${namespace}] query:`, query);
}

//Purpose 2: Cache key prefix
function getCacheKey(collectionName, query) {
  const namespace = collection(collectionName).getNamespace();
  return `${namespace}:${JSON.stringify(query)}`;
}

//Purpose 3: Debugging multi-database environments
const shopProducts = collection('products').getNamespace();    // shop.products
const testProducts = collection('products').getNamespace();    // test.products

if (shopProducts !== testProducts) {
  console.log('⚠️ Working on different databases');
}
```

---


## Q6: How to check how many caches a specific collection has? (Recommended method ⭐)

**A**: The most convenient way is to use `getNamespace()` + `cache.keys()`:

```javascript
const { collection } = await msq.connect();
const cache = msq.getCache();

if (cache) {
  //Method 1: Use getNamespace() (recommended, more precise)
  const ns = collection('products').getNamespace();
  const pattern = `*"collection":"${ns.collection}"*"db":"${ns.db}"*`;
  const productsKeys = cache.keys(pattern);

  console.log(`Products collection cache quantity: ${productsKeys.length}`);
  console.log(`Namespace: ${ns.db}.${ns.collection}`);

  //Method 2: Use collection name only (simple but possible cross-database match)
  const simpleKeys = cache.keys('*"collection":"products"*');
  console.log(`Simple match: ${simpleKeys.length}`);

  //Statistics by operation type (mode using getNamespace)
  const findKeys = cache.keys(`${pattern}*"op":"find"*`);
  const countKeys = cache.keys(`${pattern}*"op":"count"*`);
  const findOneKeys = cache.keys(`${pattern}*"op":"findOne"*`);

  console.log('Cache details:', {
Total: productsKeys.length,
    find: findKeys.length,
    count: countKeys.length,
    findOne: findOneKeys.length
  });
}
```

**Why is it recommended to use `getNamespace()`? **
- ✅ More precise: match both database name and collection name
- ✅ Avoid cross-database matching: collections with the same name in other databases will not be matched
- ✅ Type safety: returns structured namespace object
- ✅ Easy to expand: you can directly obtain `iid`, `type` and other information

**Mode Description**:
- `*"collection":"products"*"db":"shop"*` - Exact match (recommended)
- `*"collection":"products"*` - simple match (possibly across databases)
- `*"op":"find"*` - matches specific operation types

---


## Q7: How to clear the cache of an operation for a specific collection?

**A**: Use the `invalidate(op)` method to specify the operation type:

```javascript
const { collection } = await msq.connect();

//Only clear the find operation cache for products
await collection('products').invalidate('find');

console.log('✅ products find cache has been cleared');

//count and findOne caches still work
```

For details, see: [Caching Policy Document](./cache.md)

---

## References

- [Cache Policy](./cache.md) - Detailed cache configuration and invalidate() method
- [Connection Management](./connection.md) - Instance initialization and defaults configuration
- [Query method](./find.md) - Use of query parameters and default values
- [Best Practice](./getting-started.md) - Configuration optimization suggestions
