# Cache Creation

monSQLize creates an in-memory cache by default. You can also pass a cache instance or configure a local/remote multi-level cache.

## Default Memory Cache

```ts
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri },
  cache: {
    maxEntries: 50_000
  }
});
```

Use this for local development and small deployments.

## Inject a Cache Instance

```ts
import { MemoryCache } from 'monsqlize';

const cache = new MemoryCache({ maxEntries: 10_000 });

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri },
  cache
});
```

Use instance injection when the application already owns cache lifecycle.

## Multi-Level Cache

```ts
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri },
  cache: {
    multiLevel: true,
    local: { maxEntries: 100_000 },
    remote: redisCache,
    policy: {
      writePolicy: 'both',
      backfillLocalOnRemoteHit: true
    }
  }
});
```

Use multi-level cache when several application instances should share a remote cache while keeping fast local reads.

## Distributed Invalidation

```ts
import MonSQLize from 'monsqlize';
import Redis from 'ioredis';

const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri },
  cache: {
    multiLevel: true,
    local: { maxEntries: 100_000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),
    distributed: {
      redis,
      channel: 'shop:cache:invalidate'
    }
  }
});
```

Distributed invalidation is best-effort. If the database write succeeds but Redis publish fails, monSQLize does not roll back MongoDB.
