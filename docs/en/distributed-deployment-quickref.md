# Distributed Deployment Quick Reference

## Minimal configuration

```javascript
distributed: {
  enabled: true,
  redisUrl: process.env.REDIS_URL,
  instanceId: process.env.INSTANCE_ID
}
```

---

## Complete configuration (recommended)

```javascript
const Redis = require('ioredis');
const redis = new Redis('redis://localhost:6379');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  config: { uri: 'mongodb://...' },
  cache: {
    multiLevel: true,
    local: { maxSize: 1000 },
    remote: MonSQLize.createRedisCacheAdapter(redis),  //① Redis cache
    distributed: {
      enabled: true,                              //② Enable distributed failure
      redis,                                      //③ Pub/Sub connection
      instanceId: process.env.INSTANCE_ID         //④ Instance ID (recommended setting)
    }
  }
});
```

---

## Parameter quick lookup table


## distributed (distributed cache invalidation)

| Parameters | Required? |Default value|
|-----|-------|--------|
| `enabled` | No | `true` when the block exists |
| `redis` | Use `redis` or `redisUrl` | Not inferred from `remote` |
| `redisUrl` | Use `redis` or `redisUrl` | - |
| `instanceId` | ❌ No | `instance-${timestamp}-${random}` |
| `channel` | ❌ No | `'monsqlize:cache:invalidate'` |


## transaction.distributedLock (compatibility placeholder)

`transaction.distributedLock` is retained only as a compatibility placeholder. It is not wired into transaction cache-lock interception, and transaction cache locks remain process-local.

For cross-instance critical sections, use explicit business coordination such as `DistributedCacheLockManager` plus idempotency/fencing, or bypass cache for strict freshness paths.

---

## Common scenarios


## Scenario 1: General Web application (recommended)

```javascript
distributed: {
  enabled: true,
  redisUrl: process.env.REDIS_URL,
  instanceId: process.env.INSTANCE_ID  //Use environment variables
}
```


## Scenario 2: Financial/payment system

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'mydb',
  cache: {
    distributed: {
      enabled: true,
      redisUrl: process.env.REDIS_URL,
      instanceId: process.env.INSTANCE_ID
    }
  }
});

// Explicit business coordination, not transaction.distributedLock.
const lock = new MonSQLize.DistributedCacheLockManager({
  redis,
  lockKeyPrefix: 'myapp:business:lock:'
});

await lock.withLock(`payment:${paymentId}`, async () => {
  // Idempotent critical section.
});
```


## Scenario 3: Kubernetes deployment

```javascript
distributed: {
  enabled: true,
  redisUrl: process.env.REDIS_URL,
  instanceId: process.env.HOSTNAME  //Use Pod name
}
```

---

## Environment variable settings


## Docker

```bash
docker run -e INSTANCE_ID=server-1 myapp
```


## Kubernetes

```yaml
env:
  - name: INSTANCE_ID
    valueFrom:
      fieldRef:
fieldPath: metadata.name # Use Pod name
```


## PM2

```json
{
  "apps": [{
    "name": "app-1",
    "script": "server.js",
    "env": {
      "INSTANCE_ID": "app-1"
    }
  }]
}
```

---

## Key point memory

1. **`redis` or `redisUrl`** - required for distributed invalidation; the runtime does not inspect `cache.remote`
2. **`enabled`** - optional when the block exists; set it to `false` to disable the block without deleting it
3. **`instanceId`** - Optional but recommended setting for easy debugging
4. **Strict cross-instance flows** - use explicit business coordination or bypass cache

---

## Verify configuration

```javascript
//Check after startup
const stats = msq.getDistributedCacheInvalidatorStats();
console.log('Distributed invalidator status:', stats);
//Output: { messagesSent: 0, messagesReceived: 0, instanceId: 'xxx', ... }
```

---

**Documentation**: [Full Description](./distributed-deployment.md)
**Update**: 2025-11-25
