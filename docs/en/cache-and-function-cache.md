# Cache and Function Cache

## Current Formal Coverage

This page covers cache-related capabilities formally owned by the current TypeScript version of `monSQLize`:

- `MemoryCache`
- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`
- `withCache()`
- `FunctionCache`

> If you are migrating from the legacy monSQLize cache wrapper API, read the [`cache-hub` direct-call migration guide](./cache-hub-migration.md) first.

## 1. `MemoryCache`

`MemoryCache` is the minimal local cache entry that can be used directly today. It fits:

- Single-process development environments
- Local function caching
- Fast onboarding without Redis

```typescript
import MonSQLize from 'monsqlize';

const cache = new MonSQLize.MemoryCache();
await cache.set('user:1', { id: 1, name: 'Ada' }, 1000);
const value = await cache.get('user:1');
console.log(value);
```

## 2. `withCache()`

`withCache()` wraps any async function with caching and concurrent request deduplication.

```typescript
import MonSQLize from 'monsqlize';

const cached = MonSQLize.withCache(async (userId) => {
    return { userId, from: 'origin' };
}, {
    namespace: 'docs-user',
    ttl: 1000,
});

const first = await cached('u1');
const second = await cached('u1');
console.log(first, second);
```

### Current Behavior Boundary

- Supports `namespace` and `ttl`
- Supports custom `cache`
- Supports `keyBuilder`
- Supports `condition`
- Supports concurrent request deduplication
- Supports `invalidate()` / `invalidateAll()` and `stats()`

## 3. `FunctionCache`

`FunctionCache` is useful when you want to centrally register, execute, and clear a group of named functions.

```typescript
import MonSQLize from 'monsqlize';

const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'function_cache_docs' });
const functionCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    ttl: 1000,
});

functionCache.register('getUser', async (userId) => ({ userId }));
const result = await functionCache.execute('getUser', 'u1');
console.log(result);
```

## 4. Runnable Example in This Repository

```bash
npm run build
npm run test:examples
```

The current official example is `examples/cache/with-cache.ts`. During verification, it is compiled before it runs. The example demonstrates:

1. `withCache()` computes only once for identical arguments.
2. The minimal `FunctionCache` path for `register()` / `execute()` / `list()` / `clear()`.

## 5. Redis and Distributed Capabilities

Available entries:

- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`

The first example batch does **not** depend on Redis because:

1. Its goal is to provide a minimal runnable example path.
2. Redis-related capabilities require explicit runtime configuration. `ioredis` is already installed with monsqlize.
3. The first formal documentation entry should not be coupled to distributed cache environment setup.

Advanced Redis and multi-level cache deployment guidance will continue to be filled in within this documentation site. The current repository already provides executable starting points:

- `examples/cache/with-cache.ts`
- `examples/docs/slow-query-log.ts`

## 6. Performance Evidence Boundary

The current repository's formal performance evidence comes from:

- `test/performance/baselines/function-cache.benchmark.js`

It is used for:

- Regression guarding
- Hot-path and concurrent deduplication behavior validation

It is **not**:

- The only source for public marketing numbers
- A complete cross-version or cross-machine performance conclusion
