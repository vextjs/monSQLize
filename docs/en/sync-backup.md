# Change Stream data synchronization

> **Version**: v1.0.8
> **Function**: Real-time synchronization of data to backup database
> **Mode**: CDC (Change Data Capture)

---

## 📋 Overview

**Change Stream data synchronization** is based on MongoDB's native Change Stream mechanism, which monitors data changes in real time and synchronizes them to multiple backup databases.


## Core Features

- ✅ **Real-time synchronization**: Based on MongoDB Change Stream, delay 10-500ms
- ✅ **Decoupled design**: Primary database write operations are not affected; synchronization runs asynchronously
- ✅ **Resume breakpoint**: Resume Token is automatically saved and will continue after restarting
- ✅ **Multi-target support**: Sync to multiple backup databases at the same time
- ✅ **Data Filtering**: Custom filtering logic
- ✅ **Data conversion**: Support desensitization and field conversion
- ✅ **Automatic reconnect**: Automatically recover from network interruptions
- ✅ **Health Check**: Reuse ConnectionPoolManager

---

## ⚠️ Prerequisites


## Must satisfy

1. **MongoDB Replica Set** 🔴
   ```bash
   # Check whether it is a Replica Set
   rs.status()
   ```

2. **MongoDB version >= 4.0** 🔴

3. **User Permissions** 🔴
   ```javascript
   // Requires changeStream permission
   {
       resource: { db: "dbName", collection: "" },
       actions: ["changeStream", "find"]
   }
   ```

---

## 🚀 Quick Start


## Basic configuration

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    config: {
        uri: 'mongodb://localhost:27017/main',
        replicaSet: 'rs0'  // Required
    },

    // Synchronization configuration
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-main',
                uri: 'mongodb://backup:27017/backup',
                collections: ['users', 'orders']
            }
        ]
    }
});

await msq.connect();

// Normal use, automatic synchronization
await msq.collection('users').insertOne({ name: 'Alice' });
// Automatically sync to backup-main

await msq.close();
```

---

## 📖 Configuration options


## sync configuration

| Options | Type | Required | Default | Description |
|------|------|------|--------|------|
| `enabled` | boolean | ✅ | - | Whether to enable synchronization |
| `targets` | Array | ✅ | - | Backup target array |
| `resumeToken` | Object | ❌ | - | Resume Token Configuration |
| `filter` | Function | ❌ | - | Event filtering function |
| `transform` | Function | ❌ | - | Data conversion function |


## targets[].Configuration

| Options | Type | Required | Description |
|------|------|------|------|
| `name` | string | ✅ | Target name (unique) |
| `uri` | string | ✅ | MongoDB URI |
| `collections` | Array | ❌ | Synchronized collection, `['*']` represents all |
| `healthCheck` | Object | ❌ | Health Check Configuration |


## resumeToken configuration

| Options | Type | Required | Default | Description |
|------|------|------|--------|------|
| `storage` | string | ❌ | `'file'` | Storage type: `'file'` or `'redis'` |
| `path` | string | ❌ | `./.sync-resume-token` | File path (file mode) |
| `redis` | Object | ❌ | - | Redis instance (Redis mode) |

---

## 💡 Usage example


## Example 1: Multiple backup targets

```javascript
{
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-asia',
                uri: 'mongodb://asia:27017/backup',
                collections: ['*']
            },
            {
                name: 'backup-us',
                uri: 'mongodb://us:27017/backup',
                collections: ['*']
            }
        ]
    }
}
```


## Example 2: Data filtering

```javascript
{
    sync: {
        enabled: true,
        targets: [...],

        // Only sync active users
        filter: (event) => {
            if (event.ns?.coll === 'users') {
                return event.fullDocument?.status === 'active';
            }
            return true;
        }
    }
}
```


## Example 3: Data desensitization

```javascript
{
    sync: {
        enabled: true,
        targets: [...],

        // Remove sensitive fields
        transform: (doc) => {
            delete doc.password;
            delete doc.ssn;
            return doc;
        }
    }
}
```


## Example 4: Redis Resume Token

```javascript
const Redis = require('ioredis');
const redis = new Redis();

{
    sync: {
        enabled: true,
        targets: [...],
        resumeToken: {
            storage: 'redis',
            redis: redis
        }
    }
}
```

---

## 📊 Performance impact

| Write QPS | Primary database CPU | Primary database memory | Network bandwidth | Synchronization delay |
|---------|---------|---------|---------|---------|
| 100 | +0.5% | +10MB | 1MB/s | 10-50ms |
| 1000 | +1% | +20MB | 10MB/s | 50-200ms |
| 5000 | +2% | +50MB | 50MB/s | 200-500ms |

---

## 🔧 API


## Get statistics

```javascript
const stats = msq.getSyncStats();
console.log(stats);
// {
//   isRunning: true,
//   eventCount: 1234,
//   syncedCount: 1230,
//   errorCount: 4,
//   startTime: 2026-01-17T...,
//   lastEventTime: 2026-01-17T...,
//   targets: [...]
// }
```


## Manually stop synchronization

```javascript
await msq.stopSync();
```


## Manually start synchronization

```javascript
await msq.startSync();
```

---

## ❓ FAQ


## Q1: Prompt "Change Stream is not available"

**Reason**: MongoDB is not a Replica Set

**Solution**:
```bash
# 1. Check the topology
rs.status()

# 2. If it is a single node, switch to Replica Set
rs.initiate()
```


## Q2: Is there a delay in synchronization?

**Cause**: Network delay, backup database performance

**Solution**:
1. Check network delay: `ping backup-host`
2. Check backup database performance: `db.serverStatus()`
3. Reduce the number of synchronized collections


## Q3: What should I do if the Resume Token is lost?

**Impact**: After restarting, synchronization starts from the current time and intermediate data is lost.

**Solution**:
1. Use Redis to store Resume Token
2. Back up the Resume Token file regularly
3. Manually synchronize all data once


## Q4: How to deal with synchronization failure?

**Automatic processing**:
- Failure of a single target does not affect other targets
- Change Stream interrupts and automatically reconnects (up to 5 times)

**Manual processing**:
```javascript
// View error statistics
const stats = msq.getSyncStats();
console.log(stats.errorCount);
console.log(stats.targets[0].lastError);
```

---

## 🛡️ Best Practices


## 1. Production environment configuration

```javascript
{
    sync: {
        enabled: true,
        targets: [
            {
                name: 'backup-main',
                uri: 'mongodb://backup:27017/backup',
                collections: ['*'],
                healthCheck: {
                    enabled: true,
                    interval: 30000,  //30 seconds
                    timeout: 5000,
                    retries: 3
                }
            }
        ],
        resumeToken: {
            storage: 'redis',  //Use Redis
            redis: redisInstance
        }
    }
}
```


## 2. Monitoring and Alarming

```javascript
//Check statistics regularly
setInterval(() => {
    const stats = msq.getSyncStats();

    if (stats.errorCount > 100) {
        //Send alert
        sendAlert('Too many sync errors');
    }

    if (!stats.isRunning) {
        //Send alert
        sendAlert('Sync stopped');
    }
}, 60000);
```


## 3. Graceful shutdown

```javascript
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, closed gracefully...');
    await msq.close();
    process.exit(0);
});
```

---

## 📚 More resources

- [Sample code](https://github.com/vextjs/monSQLize/blob/main/examples/docs/sync.ts)
- [MongoDB Change Streams official documentation](https://www.mongodb.com/docs/manual/changeStreams/)
- [ConnectionPoolManager documentation](./multi-pool.md)

---

_Document update time: 2026-01-17_
_Version: v1.0.9_
