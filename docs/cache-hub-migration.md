# cache-hub 直调迁移说明

## 背景

从本轮开始，`monSQLize` 的缓存公开能力不再维持本地兼容包装层，而是直接转向 `cache-hub` 原生实现。

这意味着以下公开能力已经统一到 `cache-hub` 语义：

- `MemoryCache`
- `createRedisCacheAdapter()`
- `DistributedCacheInvalidator`
- `withCache()`
- `FunctionCache`

## 迁移总览

| 旧写法 | 新写法 | 说明 |
|------|------|------|
| `new MemoryCache({ maxSize: 1000 })` | `new MemoryCache({ maxEntries: 1000 })` | `cache-hub` 使用 `maxEntries` |
| `new MemoryCache({ defaultTTL: 60000 })` | `new MemoryCache({ defaultTtl: 60000 })` | TTL 字段名改为 `defaultTtl` |
| `createRedisCacheAdapter({ client, prefix })` | `createRedisCacheAdapter(client)` | 不再支持 monSQLize 自定义 `prefix` 包装 |
| `new DistributedCacheInvalidator({ cache: { local, remote } })` | `new DistributedCacheInvalidator({ cache: localCache, ...pubsub })` | 改为单节点本地 cache + Pub/Sub 广播模型 |
| `cached.getCacheStats()` | `cached.stats()` | `withCache()` 返回的包装函数改用原生统计接口 |
| `await cached.invalidate()` 返回 `boolean` | `await cached.invalidate()` 返回 `void` | 失效语义改为原生 `Promise<void>` |
| `new FunctionCache(runtime, { defaultTTL: 60000 })` | `new FunctionCache(runtime, { ttl: 60000 })` | 构造选项统一改为 `ttl` |

## 详细映射

### 1. `MemoryCache`

#### 旧写法

```ts
const cache = new MonSQLize.MemoryCache({
    maxSize: 1000,
    defaultTTL: 60_000,
});
```

#### 新写法

```ts
const cache = new MonSQLize.MemoryCache({
    maxEntries: 1000,
    defaultTtl: 60_000,
});
```

### 2. `createRedisCacheAdapter()`

#### 旧写法

```ts
const cache = MonSQLize.createRedisCacheAdapter({
    client: redis,
    prefix: 'app:',
});
```

#### 新写法

```ts
const cache = MonSQLize.createRedisCacheAdapter(redis);
```

> 若你依赖 `prefix`，需要在调用方自行封装 key 命名空间，而不是继续依赖 monSQLize 包装层。

### 3. `DistributedCacheInvalidator`

#### 旧写法

```ts
const invalidator = new MonSQLize.DistributedCacheInvalidator({
    cache: { local, remote },
    pub,
    sub,
    channel: 'cache-invalidation',
});
```

#### 新写法

```ts
const invalidator = new MonSQLize.DistributedCacheInvalidator({
    cache: local,
    channel: 'cache-invalidation',
    redis,
});
```

或在测试/自定义场景下注入连接：

```ts
const invalidator = new MonSQLize.DistributedCacheInvalidator({
    cache: local,
    channel: 'cache-invalidation',
    _connections: { pub, sub },
});
```

> 新语义下，远端节点应各自持有自己的本地 cache，并通过 Pub/Sub 收到失效广播后调用各自的 `cache.delPattern()`。

### 4. `withCache()`

#### 旧写法

```ts
const cached = MonSQLize.withCache(fetchUser, { ttl: 60_000 });
const stats = cached.getCacheStats();
const ok = await cached.invalidate('u1');
```

#### 新写法

```ts
const cached = MonSQLize.withCache(fetchUser, { ttl: 60_000 });
const stats = cached.stats();
await cached.invalidate('u1');
await cached.invalidateAll();
```

### 5. `FunctionCache`

#### 旧写法

```ts
const fnCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    defaultTTL: 60_000,
});

const ok = await fnCache.invalidate('getUser', 'u1');
```

#### 新写法

```ts
const fnCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    ttl: 60_000,
});

await fnCache.invalidate('getUser', 'u1');
```

## Behavior Differences (v2)

### Duck-typing detection priority in `cache` option

When you pass an object as `MonSQLizeOptions.cache`, v2 uses duck-typing to decide how to handle it:

```
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

### `MultiLevelCache.clear()` only clears L1 (local)

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

## 验证建议

迁移后建议至少执行：

```powershell
npm run type-check
npm run test:examples
npm run verify:fast
```

## 相关文档

- `docs/cache-and-function-cache.md`
- `docs/function-cache.md`
- `examples/docs/cache-multilevel.ts`

