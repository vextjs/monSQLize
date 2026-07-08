# 缓存创建

monSQLize 默认会创建内存缓存。你也可以传入已有 cache 实例，或配置本地/远端双层缓存。

## 默认内存缓存

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

适合本地开发和小规模部署。

## 注入已有 Cache 实例

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

当应用自己管理 cache 生命周期时，使用实例注入更直接。

## 双层缓存

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

多实例应用需要共享远端缓存，同时保留本地高速读取时，使用双层缓存。

## 分布式失效

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

分布式缓存失效是 best-effort。数据库写入成功后，如果 Redis publish 失败，monSQLize 不会回滚 MongoDB。
