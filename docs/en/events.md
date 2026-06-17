# Event system documentation

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Event type](#event-type)
- [connected](#connected)
- [closed](#closed)
- [error](#error)
- [slow-query](#slow-query)
- [query](#query)
- [Event listening method](#event-listening-method)
- [on()](#on)
- [once()](#once)
- [off()](#off)
- [removeAllListeners()](#removealllisteners)
- [Usage scenarios](#usage-scenarios)
- [1. Logging](#1-logging)
- [2. Performance monitoring](#2-performance-monitoring)
- [3. Alarm system](#3-alarm-system)
- [4. Debug mode](#4-debug-mode)
- [5. Connection health check](#5-connection-health-check)
- [Best Practices](#best-practices)
- [1. The production environment only listens to necessary events](#1-the-production-environment-only-listens-to-necessary-events)
- [2. Use structured logs](#2-use-structured-logs)
- [3. Avoid blocking event processing](#3-avoid-blocking-event-processing)
- [4. Clean up the listener](#4-clean-up-the-listener)
- [5. Hierarchical alarm](#5-hierarchical-alarm)
- [FAQ](#faq)
- [Q: Will query events affect performance?](#q-will-query-events-affect-performance)
- [Q: When does the slow-query event trigger?](#q-when-does-the-slow-query-event-trigger)
- [Q: What is the difference between error event and try-catch?](#q-what-is-the-difference-between-error-event-and-try-catch)
- [Q: How to use events in unit testing?](#q-how-to-use-events-in-unit-testing)
- [Q: Will events from multiple instances interfere with each other?](#q-will-events-from-multiple-instances-interfere-with-each-other)
- [Related documents](#related-documents)
- [watch events](#watch-events)
- [References](#references)

## Overview

monSQLize provides a complete event system, allowing you to monitor database connection status, query performance and error messages. The event system is based on `EventEmitter` of Node.js and supports standard event listening methods.

## Core Features

- ✅ **Connection Events**: Monitor connection success and closure
- ✅ **ERROR EVENT**: Listening connection and query errors
- ✅ **Slow Query Event**: Monitor slow queries that exceed the threshold
- ✅ **Query Event**: Monitor all query operations (for debugging)
- ✅ **Standard EventEmitter**: Supports standard methods such as `on/once/off`

---

## Event type


## connected

Triggered when the database connection is successful.

**Event Data**:
```javascript
{
  iid: String,           //Instance ID (8-digit random string)
  uri: String,           //Connection URI (desensitized)
  databaseName: String   //Database name
}
```

**Usage Example**:
```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

//Listen for connection success events
msq.on('connected', (data) => {
  console.log('✅ Database connection successful');
  console.log('Instance ID:', data.iid);
  console.log('Connection URI:', data.uri);
  console.log('Database name:', data.databaseName);
});

//Establish connection
await msq.connect();
```

**Example output**:
```text
✅ Database connection successful
Instance ID: a1b2c3d4
Connection URI: mongodb://[REDACTED]@localhost:27017
Database name: shop
```

---


## closed

Fired when the database connection is closed.

**Event Data**:
```javascript
{
  iid: String            //Instance ID
}
```

**Usage Example**:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

//Listen for connection close events
msq.on('closed', (data) => {
  console.log('🛑 The database connection has been closed');
  console.log('Instance ID:', data.iid);
});

//Establish connection
await msq.connect();

//close connection
await msq.close();
```

**Example output**:
```text
🛑 The database connection has been closed
Instance ID: a1b2c3d4
```

---


## error

Fired when there is a connection or query error.

**Event Data**:
```javascript
{
  iid: String,           //Instance ID
  error: Error,          //error object
  context: String        //Error context ('connect' or 'query')
}
```

**Usage Example**:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://invalid-host:27017' }
});

//Listen for error events
msq.on('error', (data) => {
  console.error('❌ An error occurred');
  console.error('Instance ID:', data.iid);
  console.error('Error context:', data.context);
  console.error('Error message:', data.error.message);
});

//Try to connect (will fail)
try {
  await msq.connect();
} catch (err) {
  console.log('Connection failed (caught)');
}
```

**Example output**:
```text
❌ An error occurred
Instance ID: a1b2c3d4
Error context: connect
Error message: connect ECONNREFUSED 127.0.0.1:27017
Connection failed (caught)
```

---


## slow-query

Triggered when query execution time exceeds the threshold.

**Event Data**:
```javascript
{
  iid: String,              //Instance ID
  operation: String,        //Operation type ('find' / 'findOne' / 'aggregate' / 'distinct' / 'count' / 'estimatedDocumentCount' / 'countDocuments' )
  collectionName: String,   //Collection name
  query: Object,            //Query conditions
  duration: Number,         //Query time (milliseconds)
  threshold: Number,        //Slow query threshold (milliseconds)
  cacheHit: Boolean,        //Whether cache hit
  timestamp: Date           //Timestamp
}
```

**Configure slow query threshold**:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100       //More than 100ms triggers slow-query event
});
```

**Usage Example**:
```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100       //Slow query threshold 100ms
});

//Listen for slow query events
msq.on('slow-query', (data) => {
  console.warn('🐢 Slow query warning');
  console.warn('Operation:', data.operation);
  console.warn('Collection:', data.collectionName);
  console.warn('Query:', JSON.stringify(data.query));
  console.warn('Time taken:', data.duration, 'ms');
  console.warn('Threshold:', data.threshold, 'ms');
  console.warn('Cache hit:', data.cacheHit);
  console.warn('Time:', data.timestamp);
});

const { collection } = await msq.connect();

//Execute slow query (assuming more than 100ms)
const products = await collection('products').find(
  { category: 'electronics' },
  { maxTimeMS: 3000 }
);
```

**Example output**:
```text
🐢 Slow query warning
Operation: find
Collection: products
Query: {"category":"electronics"}
Time taken: 235 ms
Threshold: 100 ms
cache hit: false
Time: 2025-11-06T10:30:45.123Z
```

---


## query

Fired on every query operation (including cache hits).

**Event Data**:
```javascript
{
  iid: String,              //Instance ID
  operation: String,        //Operation type
  collectionName: String,   //Collection name
  query: Object,            //Query conditions
  duration: Number,         //Query time (milliseconds)
  cacheHit: Boolean,        //Whether cache hit
  timestamp: Date           //Timestamp
}
```

**Usage Example**:
```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' }
});

//Listen to all query events (for debugging)
msq.on('query', (data) => {
  console.log('[Query]', {
    operation: data.operation,
    collection: data.collectionName,
    duration: `${data.duration}ms`,
    cacheHit: data.cacheHit,
    query: data.query
  });
});

const { collection } = await msq.connect();

//First query (cache miss)
await collection('products').find(
  { category: 'electronics' },
  {
    cache: 5000,
    maxTimeMS: 3000
  }
);

//Second query (cache hit)
await collection('products').find(
  { category: 'electronics' },
  {
    cache: 5000,
    maxTimeMS: 3000
  }
);
```

**Example output**:
```text
[Query] {
  operation: 'find',
  collection: 'products',
  duration: '45ms',
  cacheHit: false,
  query: { category: 'electronics' }
}
[Query] {
  operation: 'find',
  collection: 'products',
  duration: '0.5ms',
  cacheHit: true,
  query: { category: 'electronics' }
}
```

---

## Event listening method


## on()

Register a persistent event listener (executed every time it is triggered).

```javascript
msq.on('slow-query', (data) => {
  console.warn('Slow query:', data);
});
```


## once()

Register a one-time event listener (executed only once and then automatically removed).

```javascript
msq.once('connected', (data) => {
  console.log('First connection successful:', data);
});
```


## off()

Remove event listener.

```javascript
const handler = (data) => {
  console.log('Connection successful:', data);
};

msq.on('connected', handler);

//Remove listener
msq.off('connected', handler);
```


## removeAllListeners()

Removes all listeners (or all listeners for a specified event).

```javascript
//Remove all listeners for all events
msq.removeAllListeners();

//Removes all listeners for the specified event
msq.removeAllListeners('slow-query');
```

---

## Usage scenarios


## 1. Logging

```javascript
import MonSQLize from 'monsqlize';
const logger = require('./logger');

const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: process.env.MONGODB_URI },
  slowQueryMs: 100
});

//connection log
msq.on('connected', (data) => {
  logger.info('Database connection successful', {
    iid: data.iid,
    database: data.databaseName
  });
});

//error log
msq.on('error', (data) => {
  logger.error('Database error', {
    iid: data.iid,
    context: data.context,
    error: data.error.message
  });
});

//Slow query log
msq.on('slow-query', (data) => {
  logger.warn('Slow query warning', {
    operation: data.operation,
    collection: data.collectionName,
    duration: data.duration,
    query: data.query
  });
});
```

---


## 2. Performance monitoring

```javascript
//Statistics query performance
const queryStats = {
  total: 0,
  slow: 0,
  cacheHits: 0,
  totalDuration: 0
};

msq.on('query', (data) => {
  queryStats.total++;
  queryStats.totalDuration += data.duration;

  if (data.cacheHit) {
    queryStats.cacheHits++;
  }
});

msq.on('slow-query', () => {
  queryStats.slow++;
});

//Periodically output statistics
setInterval(() => {
  console.log('Query statistics:', {
    totalQueries: queryStats.total,
    slowQueries: queryStats.slow,
    slowQueryRatio: `${(queryStats.slow / queryStats.total * 100).toFixed(2)}%`,
    cacheHitRate: `${(queryStats.cacheHits / queryStats.total * 100).toFixed(2)}%`,
    averageDuration: `${(queryStats.totalDuration / queryStats.total).toFixed(2)}ms`
  });
}, 60000);  //Output every minute
```

---


## 3. Alarm system

```javascript
//Slow query alarm
let slowQueryCount = 0;

msq.on('slow-query', (data) => {
  slowQueryCount++;

  //If there are more than 10 slow queries within 1 minute, an alarm will be sent.
  if (slowQueryCount > 10) {
    sendAlert({
      type: 'Slow query alarm',
      message: `${slowQueryCount} slow queries occurred within 1 minute`,
      details: {
        operation: data.operation,
        collection: data.collectionName,
        duration: data.duration
      }
    });
  }
});

//Count reset every minute
setInterval(() => {
  slowQueryCount = 0;
}, 60000);

//Connection error alarm
msq.on('error', (data) => {
  if (data.context === 'connect') {
    sendAlert({
      type: 'Database connection failed',
      message: data.error.message,
      severity: 'critical'
    });
  }
});
```

---


## 4. Debug mode

```javascript
//Enable detailed logging in the development environment
if (process.env.NODE_ENV === 'development') {
  msq.on('query', (data) => {
    console.log(`[${data.operation}] ${data.collectionName}`, {
      query: data.query,
      duration: `${data.duration}ms`,
      cacheHit: data.cacheHit ? '✅ HIT' : '❌ MISS'
    });
  });

  msq.on('slow-query', (data) => {
    console.warn(`⚠️ [SLOW] ${data.operation} ${data.collectionName}`, {
      duration: `${data.duration}ms`,
      threshold: `${data.threshold}ms`,
      query: data.query
    });
  });
}
```

---


## 5. Connection health check

```javascript
let isConnected = false;

msq.on('connected', () => {
  isConnected = true;
  console.log('✅ Database connection is normal');
});

msq.on('closed', () => {
  isConnected = false;
  console.warn('⚠️ The database connection has been closed');
});

msq.on('error', (data) => {
  if (data.context === 'connect') {
    isConnected = false;
    console.error('❌ Database connection failed');
  }
});

//Health check interface
app.get('/health', (req, res) => {
  res.json({
    status: isConnected ? 'healthy' : 'unhealthy',
    database: 'mongodb'
  });
});
```

---

## Best Practices


## 1. The production environment only listens to necessary events

```javascript
//❌ Not recommended: listen to all query events (high performance overhead)
msq.on('query', (data) => {
  console.log('Query:', data);
});

//✅ Recommendation: Only listen to slow-query and error
msq.on('slow-query', (data) => {
  logger.warn('slow query', data);
});

msq.on('error', (data) => {
  logger.error('Error', data);
});
```


## 2. Use structured logs

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'db-slow-queries.log' })
  ]
});

msq.on('slow-query', (data) => {
  logger.warn({
    event: 'slow-query',
    iid: data.iid,
    operation: data.operation,
    collection: data.collectionName,
    duration: data.duration,
    query: data.query,
    timestamp: data.timestamp
  });
});
```


## 3. Avoid blocking event processing

```javascript
//❌ Not recommended: synchronous blocking operations
msq.on('slow-query', (data) => {
  //Write files synchronously (will block)
  fs.writeFileSync('slow-queries.log', JSON.stringify(data) + '\n', { flag: 'a' });
});

//✅ Recommended: Asynchronous non-blocking operations
msq.on('slow-query', async (data) => {
  //Write files asynchronously (no blocking)
  await fs.promises.appendFile('slow-queries.log', JSON.stringify(data) + '\n');
});
```


## 4. Clean up the listener

```javascript
class DatabaseService {
  constructor() {
    this.msq = new MonSQLize({ /* ... */ });

    //Save listener reference
    this.slowQueryHandler = (data) => {
      console.warn('Slow query:', data);
    };

    this.msq.on('slow-query', this.slowQueryHandler);
  }

  async stop() {
    //Clean up listeners
    this.msq.off('slow-query', this.slowQueryHandler);

    //close connection
    await this.msq.close();
  }
}
```


## 5. Hierarchical alarm

```javascript
msq.on('slow-query', (data) => {
  if (data.duration > 1000) {
    //More than 1 second: serious alarm
    sendAlert({ level: 'critical', message: `Query timeout: ${data.duration}ms` });
  } else if (data.duration > 500) {
    //More than 500ms: warning
    sendAlert({ level: 'warning', message: `Slow query: ${data.duration}ms` });
  } else {
    //100-500ms: Record logs
    logger.info({ event: 'slow-query', duration: data.duration });
  }
});
```

---

## FAQ


## Q: Will query events affect performance?

**A**: Yes, the `query` event will fire on every query, including cache hits. If the listener performs complex operations, performance will be affected.

**Suggestions**:
- Avoid listening to the `query` event in the production environment
- Only enabled in development/debug environments
- If monitoring is required, ensure that the processing logic is very lightweight


## Q: When does the slow-query event trigger?

**A**: Triggered when the query time exceeds the `slowQueryMs` threshold.

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'shop',
  config: { uri: 'mongodb://localhost:27017' },
  slowQueryMs: 100       //More than 100ms triggers slow-query
});
```

**Note**: Queries that hit the cache usually do not trigger slow-query (it takes very little time).


## Q: What is the difference between error event and try-catch?

**A**: Both can be used at the same time without conflicting with each other:

```javascript
msq.on('error', (data) => {
  //Global error handling (log/alarm)
  logger.error('Database error', data);
});

try {
  await msq.connect();
} catch (err) {
  //Local error handling (business logic)
  console.error('Connection failed, use downgrade solution');
}
```


## Q: How to use events in unit testing?

**A**: Use `once()` or Promise wrapper:

```javascript
const { expect } = require('chai');

it('The slow-query event should be triggered', (done) => {
  msq.once('slow-query', (data) => {
    expect(data.operation).to.equal('find');
    expect(data.duration).to.be.above(100);
    done();
  });

  //Execute slow query
  collection('test').find({}, { maxTimeMS: 3000 });
});

//Or use Promise
it('The connected event should be triggered', async () => {
  const promise = new Promise((resolve) => {
    msq.once('connected', resolve);
  });

  await msq.connect();
  await promise;
});
```


## Q: Will events from multiple instances interfere with each other?

**A**: No. Each MonSQLize instance has an independent event system.

```javascript
const msq1 = new MonSQLize({ databaseName: 'db1', /* ... */ });
const msq2 = new MonSQLize({ databaseName: 'db2', /* ... */ });

//msq1 events will not trigger msq2 listeners
msq1.on('slow-query', () => console.log('msq1 slow query'));
msq2.on('slow-query', () => console.log('msq2 slow query'));
```

---

## Related documents


## watch events

If you need to monitor MongoDB data changes (rather than application query operations), please refer to:

- [watch method document](./watch.md) - MongoDB Change Streams

**Difference**:
- Global events (this document): Monitor application query operations
- watch event: monitor MongoDB data changes

**Example**:
```javascript
//Global events: Monitor application slow queries
msq.on('slow-query', (meta) => {
  console.warn('The application performed a slow query');
});

//watch event: monitor MongoDB data changes
const watcher = collection.watch();
watcher.on('change', (change) => {
  console.log('MongoDB data changes');
});
```

---

## References

- [Node.js EventEmitter Documentation](https://nodejs.org/api/events.html)
- [Logging Best Practices](https://www.npmjs.com/package/winston)
- [Alarm system design](https://prometheus.io/docs/alerting/latest/overview/)
- [monSQLize README](../../README.md)
