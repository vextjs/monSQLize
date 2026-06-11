# 🚀 Distributed deployment quick reference

---

## Table of Contents

- [Simplest configuration (only 3 lines)](#simplest-configuration-only-3-lines)
- [Complete configuration (recommended)](#complete-configuration-recommended)
- [Parameter quick lookup table](#parameter-quick-lookup-table)
- [distributed (distributed cache invalidation)](#distributed-distributed-cache-invalidation)
- [transaction.distributedLock (transaction lock)](#transactiondistributedlock-transaction-lock)
- [Common scenarios](#common-scenarios)
- [Scenario 1: General Web application (recommended)](#scenario-1-general-web-application-recommended)
- [Scenario 2: Financial/payment system](#scenario-2-financial-payment-system)
- [Scenario 3: Kubernetes deployment](#scenario-3-kubernetes-deployment)
- [Environment variable settings](#environment-variable-settings)
- [Docker](#docker)
- [Kubernetes](#kubernetes)
- [PM2](#pm2)
- [Key point memory](#key-point-memory)
- [Verify configuration](#verify-configuration)

## Simplest configuration (only 3 lines)

```javascript
distributed: {
  enabled: true  //Just this one line! Everything else is optional
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
      instanceId: process.env.INSTANCE_ID         //③ Instance ID (recommended setting)
    }
  }
});
```

---

## Parameter quick lookup table


## distributed (distributed cache invalidation)

| Parameters | Required? |Default value|
|-----|-------|--------|
| `enabled` | ✅ YES | - |
| `redis` | ❌ No | Automatically extract from `remote` |
| `instanceId` | ❌ No | `instance-${timestamp}-${random}` |
| `channel` | ❌ No | `'monsqlize:cache:invalidate'` |


## transaction.distributedLock (transaction lock)

| Parameters | Required? |Default value|
|-----|-------|--------|
| `redis` | ✅ YES | - |
| `keyPrefix` | ❌ No | `'monsqlize:cache:lock:'` |

---

## Common scenarios


## Scenario 1: General Web application (recommended)

```javascript
distributed: {
  enabled: true,
  instanceId: process.env.INSTANCE_ID  //Use environment variables
}
```


## Scenario 2: Financial/payment system

```javascript
distributed: {
  enabled: true,
  instanceId: process.env.INSTANCE_ID
},
transaction: {
  distributedLock: {
    redis  //Must be configured explicitly (ES6 shorthand)
  }
}
```


## Scenario 3: Kubernetes deployment

```javascript
distributed: {
  enabled: true,
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

1. **`enabled: true`** - the only required configuration
2. **`redis`** - Automatically reused from `remote`, no need to repeat configuration
3. **`instanceId`** - Optional but recommended setting for easy debugging
4. **Transaction lock `redis`** - must be configured explicitly

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
