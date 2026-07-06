# Cache API Overview

## Current Formal Coverage

This page covers cache-related capabilities formally owned by the current TypeScript version of `monSQLize` for database runtime usage:

- `MemoryCache`
- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`

`withCache()` and `FunctionCache` remain exported for legacy compatibility, but non-database function caching is no longer an actively maintained monSQLize feature area and is hidden from the current documentation navigation. For generic function-level caching, use `cache-hub` directly or an application-owned cache layer.

> If you are migrating from the legacy monSQLize cache wrapper API, read the [`cache-hub` direct-call migration guide](./cache-hub-migration.md) first.

## 1. `MemoryCache`

`MemoryCache` is the minimal local cache entry that can be used directly today. It fits:

- Single-process development environments
- Local query-cache experiments
- Fast onboarding without Redis

```typescript
import MonSQLize from 'monsqlize';

const cache = new MonSQLize.MemoryCache();
await cache.set('user:1', { id: 1, name: 'Ada' }, 1000);
const value = await cache.get('user:1');
console.log(value);
```

## 2. Runnable Example in This Repository

```bash
npm run build
npm run test:examples
```

The current database-cache examples are compiled before they run. Start with:

- `examples/docs/cache-multilevel.ts`
- `examples/docs/slow-query-log.ts`

## 3. Redis and Distributed Capabilities

Available entries:

- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`

The first example batch does **not** depend on Redis because:

1. Its goal is to provide a minimal runnable example path.
2. Redis-related capabilities require explicit runtime configuration. Provide a Redis URL or an existing Redis-like client when you enable those paths.
3. The first formal documentation entry should not be coupled to distributed cache environment setup.

Advanced Redis and multi-level cache deployment guidance will continue to be filled in within this documentation site. The current repository already provides executable starting points:

- `examples/docs/slow-query-log.ts`
- `examples/docs/cache-multilevel.ts`

## 4. Legacy Function-Cache Boundary

The repository still keeps compatibility tests and performance guardrails for `withCache()` / `FunctionCache` so existing consumers can upgrade safely. Those guardrails are compatibility evidence, not a current product recommendation for new non-database caching usage.

Related compatibility evidence:

- `test/unit/function-cache/function-cache.test.ts`
- `test/unit/function-cache/function-cache-behavior.test.ts`
- `test/performance/baselines/function-cache.benchmark.js`
