# cache-hub direct migration instructions

## Background

monSQLize cache exports delegate to the native `cache-hub` implementation. The root entry keeps compatibility wrappers for existing consumers so dependency upgrades do not require immediate business-code changes.

The core semantics of the following exposed capabilities are unified through `cache-hub`:

- `MemoryCache`
- `createRedisCacheAdapter()`
- `DistributedCacheInvalidator`
- `withCache()`
- `FunctionCache`

## Migration Overview

| Old way of writing | New way of writing | Explanation |
|------|------|------|
| `new MemoryCache({ maxSize: 1000 })` | `new MemoryCache({ maxEntries: 1000 })` | `cache-hub` Use `maxEntries` |
| `new MemoryCache({ defaultTTL: 60000 })` | `new MemoryCache({ defaultTtl: 60000 })` | TTL field name changed to `defaultTtl` |
| `createRedisCacheAdapter('redis://...')` / `createRedisCacheAdapter(redis)` | Remain available | monSQLize root entry retains old parameter checksum error semantics, underlying delegate `cache-hub/redis` |
| `createRedisCacheAdapter({ client, prefix })` | `createRedisCacheAdapter(client)` | `{ client, prefix }` objects do not belong to this round of smooth upgrade commitments; if you rely on `prefix`, you need to handle the key namespace on the caller yourself |
| `new DistributedCacheInvalidator({ cache: { local, remote } })` | `new DistributedCacheInvalidator({ cache: localCache, ...pubsub })` | Change to single-node local cache + Pub/Sub broadcast model |
| `cached.getCacheStats()` | `cached.stats()` | `withCache()` The returned wrapper function uses the native statistics interface instead |
| `await cached.invalidate()` returns `boolean` | `await cached.invalidate()` returns `void` | The invalidation semantics are changed to native `Promise<void>` |
| `new FunctionCache(runtime, { defaultTTL: 60000 })` | `new FunctionCache(runtime, { ttl: 60000 })` | The construction options are uniformly changed to `ttl` |

## Detailed mapping


## 1. `MemoryCache`


### Old way of writing

```ts
const cache = new MonSQLize.MemoryCache({
    maxSize: 1000,
    defaultTTL: 60_000,
});
```


### New writing method

```ts
const cache = new MonSQLize.MemoryCache({
    maxEntries: 1000,
    defaultTtl: 60_000,
});
```


## 2. `createRedisCacheAdapter()`


### Old writing method (2. createRedisCacheAdapter())

```ts
const cache = MonSQLize.createRedisCacheAdapter({
    client: redis,
    prefix: 'app:',
});
```


### New writing method (2. createRedisCacheAdapter())

```ts
const cache = MonSQLize.createRedisCacheAdapter('redis://localhost:6379');
//or
const cache = MonSQLize.createRedisCacheAdapter(redis);
```

> `createRedisCacheAdapter('redis://...')` and `createRedisCacheAdapter(redis)` are reserved entries for smooth upgrades; when `undefined`, empty string, and `ioredis` is unavailable due to incomplete installation, package manager clipping, or runtime parsing failure, the old version error semantics will still be maintained and will not be silently downgraded to the memory cache.

> If you rely on `prefix` in `{ client, prefix }` object writing, you need to encapsulate the key namespace yourself on the caller instead of continuing to rely on monSQLize to provide prefix packaging.


## 3. `DistributedCacheInvalidator`


### Old writing method (3. DistributedCacheInvalidator)

```ts
const invalidator = new MonSQLize.DistributedCacheInvalidator({
    cache: { local, remote },
    pub,
    sub,
    channel: 'cache-invalidation',
});
```


### New writing method (3. DistributedCacheInvalidator)

```ts
const invalidator = new MonSQLize.DistributedCacheInvalidator({
    cache: local,
    channel: 'cache-invalidation',
    redis,
});
```

When `redis` is provided, it must be an ioredis-compatible instance with `duplicate()` support. monSQLize uses the original connection for publishing and a duplicated connection for subscription so the subscriber mode does not block publish commands.

Or inject connections in test/custom scenarios:

```ts
const invalidator = new MonSQLize.DistributedCacheInvalidator({
    cache: local,
    channel: 'cache-invalidation',
    _connections: { pub, sub },
});
```

> Under the new semantics, remote nodes should each hold their own local cache and call their own `cache.delPattern()` after receiving the failure broadcast through Pub/Sub.


## 4. `withCache()`


### Old writing method (4. withCache())

```ts
const cached = MonSQLize.withCache(fetchUser, { ttl: 60_000 });
const stats = cached.getCacheStats();
const ok = await cached.invalidate('u1');
```


### New writing method (4. withCache())

```ts
const cached = MonSQLize.withCache(fetchUser, { ttl: 60_000 });
const stats = cached.stats();
await cached.invalidate('u1');
await cached.invalidateAll();
```


## 5. `FunctionCache`


### Old writing method (5. FunctionCache)

```ts
const fnCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    defaultTTL: 60_000,
});

const ok = await fnCache.invalidate('getUser', 'u1');
```


### New writing method (5. FunctionCache)

```ts
const fnCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    ttl: 60_000,
});

await fnCache.invalidate('getUser', 'u1');
```

## Behavior Differences (v2)


## Duck-typing detection priority in `cache` option

When you pass an object as `MonSQLizeOptions.cache`, v2 uses duck-typing to decide how to handle it:

```text
cache instanceof MemoryCache  →  use directly as MemoryCache
has get + set + del methods   →  use directly as CacheLike (pass-through)
has multiLevel: true          →  build MultiLevelCache
plain object                  →  build MemoryCache from config fields
```

**Important**: if your plain config object happens to have `get`, `set`, and `del` fields for unrelated reasons, v2 will treat it as a custom `CacheLike` instance and skip the `MemoryCache` builder entirely.

```ts
// ❌ Ambiguous — get/set/del look like CacheLike methods
const msq = new MonSQLize({
  cache: {
    maxEntries: 1000,
    get: someOtherThing,   // triggers duck-typing → treated as CacheLike
    set: someOtherThing,
    del: someOtherThing,
  },
});

// ✅ Safe — no get/set/del on the config object
const msq = new MonSQLize({
  cache: { maxEntries: 1000 },
});
```

If you need to pass a pre-built `MemoryCache` instance, do so directly:

```ts
const msq = new MonSQLize({
  cache: new MonSQLize.MemoryCache({ maxEntries: 1000 }),
});
```

---


## `MultiLevelCache.clear()` only clears L1 (local)

This is an architectural constraint from cache-hub (design rule A07). Calling `clear()` on a multi-level cache **does not** flush the remote (L2) store.

```ts
// Given: cache is MultiLevelCache with Redis as L2
await msq.getCache().clear();  // ✅ L1 (in-memory) cleared
                               // ❌ L2 (Redis) NOT cleared
```

**Why**: clearing a shared remote store from one application node would affect all other nodes unexpectedly — this is intentionally disallowed.

**If you need to flush Redis**, do it through the remote adapter directly:

```ts
// Access L2 via the remote adapter reference you constructed
const remote = MonSQLize.createRedisCacheAdapter(redis);
await remote.clear();  // Flushes the Redis keyspace

// Then use it in multi-level config
const msq = new MonSQLize({
  cache: {
    multiLevel: true,
    remote,
  },
});
```

Alternatively, use `delPattern('*')` on the remote to scope the flush to your key namespace:

```ts
await remote.delPattern('myapp:*');
```

---

## Verification suggestions

After migration, it is recommended to at least perform:

```powershell
npm run type-check
npm run test:examples
npm run verify:fast
```

## Related documents

- `docs/cache-and-function-cache.md`
- `docs/function-cache.md`
- `examples/docs/cache-multilevel.ts`
