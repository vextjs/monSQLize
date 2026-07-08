# Cache Invalidation

Read caching is opt-in per query, and write invalidation is opt-in per write or per runtime configuration.

## Default Behavior

Writes do not invalidate read caches by default:

```ts
await products.find({ category: 'phone' }, { cache: 60_000 });

await products.updateOne(
  { sku: 'p-100' },
  { $set: { price: 799 } }
);

// This can still return the cached value until TTL expiry.
await products.find({ category: 'phone' }, { cache: 60_000 });
```

This avoids unexpected broad cache deletes on write-heavy systems.

## Per-Write Precise Invalidation

Use `cache.invalidate` when a write is known to affect a cached read:

```ts
await products.updateOne(
  { sku: 'p-100' },
  { $set: { price: 799 } },
  {
    cache: {
      invalidate: [{
        operation: 'findOne',
        query: { sku: 'p-100' },
        options: { cache: 60_000 }
      }]
    }
  }
);
```

Supported descriptor operations: `find`, `findOne`, `count`, `findPage`, `aggregate`, `distinct`, `findOneById`, and `findByIds`.

## Per-Write No-Op Override

`cache.invalidate: false` and `cache.invalidate: []` mean "do not invalidate anything for this write". They override instance-level `cache.autoInvalidate: true`:

```ts
await products.updateOne(
  { sku: 'p-100' },
  { $set: { viewedAt: new Date() } },
  { cache: { invalidate: [] } }
);
```

## Broad Invalidation

Use broad invalidation when the write can affect many cached reads:

```ts
await products.insertOne(
  { sku: 'p-101', category: 'phone' },
  { autoInvalidate: true }
);
```

Or enable it globally:

```ts
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri },
  cache: {
    autoInvalidate: true
  }
});
```

Global broad invalidation is convenient but can increase cache delete volume, Redis Pub/Sub traffic, and cache refill pressure.

## Manual Invalidation

Use `collection.invalidate()` after native driver writes, external jobs, or maintenance scripts:

```ts
await products.invalidate('find');
await products.invalidate();
```

`invalidate()` clears collection read-cache patterns. It does not make MongoDB writes and cache invalidation atomic.

