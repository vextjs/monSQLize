# Slow query log persistent storage function documentation

> **Version**: v1.0.1
> **Last updated**: 2025-12-29
> **Status**: Completed

---

## Table of Contents

- [Function Overview](#function-overview)
- [What is slow query log persistence storage?](#what-is-slow-query-log-persistence-storage)
- [Core Features](#core-features)
- [Working principle](#working-principle)
- [Quick start](#quick-start)
- [Simplest configuration (recommended)](#simplest-configuration-recommended)
- [Automatic effects](#automatic-effects)
- [Configuration instructions](#configuration-instructions)
- [Global slow query configuration](#global-slow-query-configuration)
  - [Basic configuration (set during initialization)](#basic-configuration-set-during-initialization)
  - [Detailed explanation of configuration options](#detailed-explanation-of-configuration-options)
- [Operation level configuration](#operation-level-configuration)
  - [Method 1: Through options parameter](#method-1-through-options-parameter)
  - [Method 2: Use global configuration](#method-2-use-global-configuration)
- [Log format](#log-format)
  - [JSON format (default)](#json-format-default)
  - [Text format](#text-format)
- [Log output configuration](#log-output-configuration)
  - [Use custom Logger](#use-custom-logger)
  - [Listen for slow query events](#listen-for-slow-query-events)
- [Configuration level](#configuration-level)
  - [Level 1: Zero configuration (recommended)](#level-1-zero-configuration-recommended)
  - [Level 2: Basic configuration (commonly used)](#level-2-basic-configuration-commonly-used)
  - [Level 3: Complete Configuration (Advanced)](#level-3-complete-configuration-advanced)
- [Detailed explanation of configuration parameters](#detailed-explanation-of-configuration-parameters)
  - [storage storage configuration](#storage-storage-configuration)
  - [storage.mongodb MongoDB storage configuration](#storagemongodb-mongodb-storage-configuration)
  - [deduplication deduplication configuration](#deduplication-deduplication-configuration)
  - [batch batch configuration](#batch-batch-configuration)
  - [filter filter configuration](#filter-filter-configuration)
- [API Reference](#api-reference)
- [getSlowQueryLogs(filter, options)](#getslowquerylogsfilter-options)
- [Usage example](#usage-example)
- [Example 1: Zero configuration enablement](#example-1-zero-configuration-enablement)
- [Example 2: Independent connection (isolated resources)](#example-2-independent-connection-isolated-resources)
- [Example 3: Custom TTL](#example-3-custom-ttl)
- [Example 4: Filter a specific collection](#example-4-filter-a-specific-collection)
- [Example 5: Solution A (no duplication)](#example-5-solution-a-no-duplication)
- [Example 6: Real-time writing mode](#example-6-real-time-writing-mode)
- [Best Practices](#best-practices)
- [Threshold setting suggestions](#threshold-setting-suggestions)
  - [Example: Different scenario configurations](#example-different-scenario-configurations)
- [Monitoring and Analysis](#monitoring-and-analysis)
  - [1. Real-time monitoring](#1-real-time-monitoring)
  - [2. Regular analysis](#2-regular-analysis)
  - [3. Export slow query statistics](#3-export-slow-query-statistics)
- [Optimization suggestions](#optimization-suggestions)
  - [1. Create index](#1-create-index)
  - [2. Optimize query conditions](#2-optimize-query-conditions)
  - [3. Use projection to reduce data transmission](#3-use-projection-to-reduce-data-transmission)
  - [4. Enable caching](#4-enable-caching)
- [Best Practices for Production Environments](#best-practices-for-production-environments)
  - [1. Set TTL appropriately](#1-set-ttl-appropriately)
  - [2. Use reuse connection (default)](#2-use-reuse-connection-default)
  - [3. Configure alarms](#3-configure-alarms)
  - [4. Monitor storage space](#4-monitor-storage-space)
  - [5. Integrated log system](#5-integrated-log-system)
- [Troubleshooting](#troubleshooting)
- [Problem 1: Slow query log is not saved](#problem-1-slow-query-log-is-not-saved)
- [Problem 2: Storage connection failed](#problem-2-storage-connection-failed)
- [Question 3: Querying the slow query log returns empty](#question-3-querying-the-slow-query-log-returns-empty)
- [Performance optimization](#performance-optimization)
- [Performance impact analysis](#performance-impact-analysis)
- [Optimization suggestions (performance optimization)](#optimization-suggestions-performance-optimization)
- [Appendix](#appendix)
- [A. Data model](#a-data-model)
- [B. Version History](#b-version-history)
- [C. Related links](#c-related-links)

## Function Overview


## What is slow query log persistence storage?

Slow query log persistent storage is a new feature introduced in monSQLize v1.0.1. It can automatically save query records that exceed the threshold to persistent storage (currently supports MongoDB) to facilitate subsequent analysis and optimization.


## Core Features

- ✅ **Zero configuration activation** - `slowQueryLog: true` one line activation
- ✅ **Plan B to remove duplicates** - Automatically aggregate statistics for the same query mode
- ✅ **Batch Write** - Asynchronous batch processing, no performance loss (<2ms additional overhead)
- ✅ **Automatic expiration** - TTL index automatically cleans historical data (default 7 days)
- ✅ **Query Interface** - built-in API query slow query log
- ✅ **Multiple Database Support** - Architecture supports MongoDB/PostgreSQL/MySQL extensions


## Working principle

```text
┌─────────────┐
│ Business query execution │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Slow query detection │ ← slowQueryMs: 500
│ (withSlowQueryLog)│
└──────┬──────────┘
│ If execution time > 500ms
       ▼
┌─────────────────┐
│ Generate queryHash │ ← SHA256(database+collection+operation+query)
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Add to batch queue │ ← BatchQueue (buffer)
└──────┬──────────┘
│ Reach 10 items or 5 seconds
       ▼
┌─────────────────┐
│ bulkWrite upsert│ ← MongoDB storage
│ (Plan B to remove duplicates) │
└─────────────────┘
```

---

## Quick start


## Simplest configuration (recommended)

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,      //Slow query threshold (milliseconds)
  slowQueryLog: true     //✅ Zero configuration enabled
});

await msq.connect();

//Execute query (slow query automatically saved)
const users = await msq.find('users', { status: 'active' });

//Query slow query log
const logs = await msq.getSlowQueryLogs(
  { collection: 'users' },
  { sort: { count: -1 }, limit: 10 }
);

console.log('Top 10 high-frequency slow queries:', logs);

await msq.close();
```


## Automatic effects

- Slow queries are automatically saved to the `admin.slow_query_logs` collection
- Automatic deduplication and aggregation of the same query (Plan B)
- TTL index automatically cleans data from 7 days ago
- Reuse business connections without additional connection overhead

---

## Configuration instructions


## Global slow query configuration


### Basic configuration (set during initialization)

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },

  //Global slow query threshold (milliseconds)
  slowQueryMs: 1000,  //Default 1000ms

  //Slow query log configuration
  slowQuery: {
    enabled: true,           //Whether to enable slow query monitoring (default true)
    threshold: 1000,         //Threshold (milliseconds), overrides slowQueryMs
    includeStack: false,     //Whether to include stack information (for debugging)
    logLevel: 'warn',        //Log level: debug/info/warn/error
    outputFormat: 'json',    //Output format: json/text
    excludeOperations: []    //Excluded operation types: ['find', 'aggregate']
  },

  //Slow query persistent storage (optional)
  slowQueryLog: true  //Or detailed configuration object
});
```


### Detailed explanation of configuration options

| Options | Type | Default | Description |
|------|------|--------|------|
| `slowQueryMs` | number | 1000 | Global slow query threshold (milliseconds) |
| `slowQuery.enabled` | boolean | true | Whether to enable slow query monitoring |
| `slowQuery.threshold` | number | 1000 | Slow query threshold, priority higher than slowQueryMs |
| `slowQuery.includeStack` | boolean | false | Whether to record the call stack (for debugging) |
| `slowQuery.logLevel` | string | 'warn' | Log level |
| `slowQuery.outputFormat` | string | 'json' | Output format |
| `slowQuery.excludeOperations` | string[] | [] | Excluded operation types |


## Operation level configuration

Slow query thresholds can be configured individually for certain operations:


### Method 1: Through options parameter

```javascript
//Set different thresholds for individual queries
await collection('products').find(
  { category: 'electronics' },
  {
    slowQueryMs: 500,  //The query threshold is 500ms
    maxTimeMS: 3000    //MongoDB query timeout
  }
);

//Aggregation queries are also supported
await collection('orders').aggregate(
  [
    { $match: { status: 'completed' } },
    { $group: { _id: '$userId', total: { $sum: '$amount' } } }
  ],
  {
    slowQueryMs: 2000  //Aggregation query threshold 2000ms
  }
);
```


### Method 2: Use global configuration

```javascript
//Use global threshold (without specifying slowQueryMs)
const products = await collection('products').find(
  { category: 'electronics' }
);  //Use globally configured slowQueryMs: 1000
```


## Log format


### JSON format (default)

```json
{
  "level": "warn",
  "message": "[SLOW QUERY] Operation exceeded threshold",
  "operation": "find",
  "collection": "products",
  "database": "mydb",
  "duration": 1523,
  "threshold": 1000,
  "query": { "category": "electronics" },
  "options": { "limit": 10 },
  "docCount": 10,
  "timestamp": "2026-01-20T08:30:15.123Z",
  "instanceId": "msq_abc123"
}
```


### Text format

```text
[2026-01-20 08:30:15] WARN: [SLOW QUERY] find on mydb.products took 1523ms (threshold: 1000ms)
Query: {"category":"electronics"}
Options: {"limit":10}
Documents returned: 10
```


## Log output configuration


### Use custom Logger

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'slow-query.log' }),
    new winston.transports.Console()
  ]
});

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  logger: logger,  //Using Winston logger
  slowQueryMs: 1000
});
```


### Listen for slow query events

```javascript
//Method 1: Listen for events
msq.on('slow-query', (info) => {
  console.log('Slow query detected:', {
    operation: info.op,
    collection: info.collection,
    duration: info.durationMs,
    query: info.query
  });

  //Send alert
  if (info.durationMs > 5000) {
    alerting.send({
      type: 'critical',
      message: `Extremely slow query: ${info.durationMs}ms`,
      details: info
    });
  }
});

//Method 2: Use event listener
msq.addEventListener('slow-query', handleSlowQuery);
```


## Configuration level

monSQLize provides a three-tier configuration architecture to meet different usage scenarios:


### Level 1: Zero configuration (recommended)

```javascript
slowQueryLog: true  //Use all default values
```

**Default configuration**:
- `enabled: true` - Enable
- `storage.type: 'mongodb'` - storage type (automatically inferred)
- `storage.useBusinessConnection: true` - Multiplexed business connection
- `storage.mongodb.database: 'admin'` - stored in admin database
- `storage.mongodb.collection: 'slow_query_logs'` - collection name
- `storage.mongodb.ttl: 604800` - Expires in 7 days
- `deduplication.enabled: true` - Enable deduplication
- `batch.enabled: true` - Enable batch writing
- `batch.size: 10` - batch size
- `batch.interval: 5000` - refresh in 5 seconds


### Level 2: Basic configuration (commonly used)

```javascript
slowQueryLog: {
  enabled: true,
  storage: {
    mongodb: {
      ttl: 3 * 24 * 3600  //Only modify the TTL to 3 days
    }
  }
}
```


### Level 3: Complete Configuration (Advanced)

```javascript
slowQueryLog: {
  enabled: true,

  //Storage configuration
  storage: {
    type: 'mongodb',                    //storage type
    useBusinessConnection: false,        //Do not reuse connections
    uri: 'mongodb://admin-host:27017', // Independent connection URI

    mongodb: {
      database: 'admin',
      collection: 'slow_query_logs',
      ttl: 7 * 24 * 3600,
      ttlField: 'lastSeen'
    }
  },

  //Deduplication
  deduplication: {
    enabled: true,                      //Enable option B
    strategy: 'aggregate',              //aggregation strategy
    keepRecentExecutions: 0             //No details retained
  },

  //Batch configuration
  batch: {
    enabled: true,
    size: 20,                           //20 items refreshed
    interval: 3000,                     //Refresh in 3 seconds
    maxBufferSize: 100                  //Maximum buffer 100 items
  },

  //Filter configuration
  filter: {
    excludeDatabases: [],               //exclude database
    excludeCollections: ['logs'],       //exclude collection
    excludeOperations: [],              //exclude operations
    minExecutionTimeMs: 0               //Minimum execution time
  }
}
```


## Detailed explanation of configuration parameters


### storage storage configuration

| Parameters | Type | Default value | Description |
|------|------|--------|------|
| `type` | string | null (automatically inferred) | Storage type: mongodb/postgresql/mysql/file |
| `useBusinessConnection` | boolean | true | Whether to reuse business connections |
| `uri` | string | null | Independent connection URI (required when useBusinessConnection=false) |


### storage.mongodb MongoDB storage configuration

| Parameters | Type | Default value | Description |
|------|------|--------|------|
| `database` | string | 'admin' | Storage database |
| `collection` | string | 'slow_query_logs' | Storage collection |
| `ttl` | number | 604800 (7 days) | TTL expiration time (seconds) |
| `ttlField` | string | 'lastSeen' | TTL field name |


### deduplication deduplication configuration

| Parameters | Type | Default value | Description |
|------|------|--------|------|
| `enabled` | boolean | true | Whether to enable deduplication |
| `strategy` | string | 'aggregate' | Deduplication strategy: aggregate (Plan B)/none (Plan A) |
| `keepRecentExecutions` | number | 0 | Keep the latest N execution details (v1.5+) |


### batch batch configuration

| Parameters | Type | Default value | Description |
|------|------|--------|------|
| `enabled` | boolean | true | Whether to enable batch writing |
| `size` | number | 10 | batch size (bar) |
| `interval` | number | 5000 | Refresh interval (milliseconds) |
| `maxBufferSize` | number | 100 | maximum buffer size |


### filter filter configuration

| Parameters | Type | Default value | Description |
|------|------|--------|------|
| `excludeDatabases` | string[] | [] | Excluded databases |
| `excludeCollections` | string[] | [] | Excluded collection |
| `excludeOperations` | string[] | [] | Excluded operation types |
| `minExecutionTimeMs` | number | 0 | Minimum execution time (milliseconds) |

---

## API Reference


## getSlowQueryLogs(filter, options)

Query slow query log (supports scheme B aggregation data)

**Parameters**:

```javascript
//filter - query conditions
{
  database: 'mydb',        //Database name
  collection: 'users',     //Collection name
  operation: 'find',       //Operation type
  queryHash: 'abc123def456' //Optional exact query hash
}

//options - query options
{
  sort: { count: -1 },     //Sorting rules
  limit: 10,               //limited quantity
  skip: 0                  //skip quantity
}
```

**Return Value**:

```javascript
[
  {
    queryHash: 'abc123def456',          //Query Hash (unique identifier)
    database: 'mydb',                   //Database name
    collection: 'users',                //Collection name
    operation: 'find',                  //Operation type
    sampleQuery: { status: 'active' },  //Sample query payload
    count: 2400,                        //Number of executions
    totalTimeMs: 1248000,               //total execution time
    minTimeMs: 500,                     //Minimum execution time
    maxTimeMs: 1200,                    //Maximum execution time
    avgTimeMs: 520,                     //Average execution time (dynamic calculation)
    firstSeen: ISODate('...'),          //Time of first discovery
    lastSeen: ISODate('...'),           //last time
    metadata: {}
  }
]
```

**Usage Example**:

```javascript
//Top 10 high-frequency and slow queries
const topFrequent = await msq.getSlowQueryLogs(
  {},
  { sort: { count: -1 }, limit: 10 }
);

//Top 10 slowest queries
const topSlow = await msq.getSlowQueryLogs(
  {},
  { sort: { maxTimeMs: -1 }, limit: 10 }
);

//Slow query for specific collection
const userLogs = await msq.getSlowQueryLogs(
  { database: 'mydb', collection: 'users' },
  { sort: { avgTimeMs: -1 } }
);

//Query for a specific operation type
const aggregateLogs = await msq.getSlowQueryLogs(
  { operation: 'aggregate' },
  { limit: 20 }
);
```

---

## Usage example


## Example 1: Zero configuration enablement

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: true  //✅ Enable in one line
});
```


## Example 2: Independent connection (isolated resources)

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    storage: {
      useBusinessConnection: false,
      uri: 'mongodb://admin-host:27017/admin'
    }
  }
});
```


## Example 3: Custom TTL

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    storage: {
      mongodb: {
        ttl: 24 * 3600  //Keep for 1 day
      }
    }
  }
});
```


## Example 4: Filter a specific collection

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    filter: {
      excludeCollections: ['logs', 'temp'],  //Exclude log collection
      minExecutionTimeMs: 1000               //Only records >1 second
    }
  }
});
```


## Example 5: Solution A (no duplication)

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    deduplication: {
      enabled: false  //Turn off deduplication and add new records each time
    }
  }
});
```


## Example 6: Real-time writing mode

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: 'mongodb://localhost:27017/mydb' },
  slowQueryMs: 500,
  slowQueryLog: {
    enabled: true,
    batch: {
      enabled: false  //Disable batch, real-time writing
    }
  }
});
```

---

## Best Practices


## Threshold setting suggestions

Choose an appropriate slow query threshold according to different scenarios:

| Scenario | Recommended Threshold | Description |
|------|---------|------|
| **High Concurrency API** | 100-300ms | Quick response to requirements, sensitive to user experience |
| **Background Task** | 1000-3000ms | Longer time is acceptable, pay attention to resource usage |
| **Analysis query** | 5000-10000ms | Complex aggregation query, focusing on optimizing extremely slow queries |
| **Batch operation** | 10000-30000ms | Large batch data processing, focusing on failure |


### Example: Different scenario configurations

```javascript
//Scenario 1: High Concurrency Web API
const apiMsq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  slowQueryMs: 200,  //200ms threshold
  slowQuery: {
    logLevel: 'error',  //Only severely slow queries are logged
    excludeOperations: []
  }
});

//Scenario 2: Data analysis services
const analyticsMsq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  slowQueryMs: 5000,  //5 second threshold
  slowQuery: {
    logLevel: 'info',
    excludeOperations: []  //Log all actions
  }
});

//Scenario 3: Mixed scenario (dynamic threshold)
await collection('users').find(
  { status: 'active' },
  { slowQueryMs: 100 }  //User query 100ms
);

await collection('analytics').aggregate(
  [...],
  { slowQueryMs: 5000 }  //Analyze query 5 seconds
);
```


## Monitoring and Analysis


### 1. Real-time monitoring

```javascript
//Listen for slow query events
msq.on('slow-query', (info) => {
  //Real-time recording to monitoring system
  monitoring.record('slow_query', {
    operation: info.op,
    collection: info.collection,
    duration: info.durationMs,
    timestamp: new Date()
  });

  //Send an alarm (5 seconds beyond the threshold)
  if (info.durationMs > 5000) {
    alerting.send({
      type: 'critical',
      title: 'Extremely Slow Query Detected',
      message: `${info.op} on ${info.collection} took ${info.durationMs}ms`,
      details: info
    });
  }
});
```


### 2. Regular analysis

```javascript
//Analyze slow queries every hour
setInterval(async () => {
  //Obtain the Top 10 high-frequency slow queries
  const topFrequent = await msq.getSlowQueryLogs(
    {},
    { sort: { count: -1 }, limit: 10 }
  );

  console.log('=== High-frequency slow query analysis ===');
  topFrequent.forEach((log, index) => {
    console.log(`${index + 1}. ${log.collection}.${log.operation}:`);
    console.log(`Number of executions: ${log.count}`);
    console.log(`Average time taken: ${log.avgTimeMs}ms`);
    console.log(`Maximum time taken: ${log.maxTimeMs}ms`);
    console.log(`Sample query:`, JSON.stringify(log.sampleQuery));
    console.log('');
  });
}, 3600000);  //hourly
```


### 3. Export slow query statistics

```javascript
//Export slow query statistics report
async function exportSlowQueryReport(startDate, endDate) {
  const logs = await msq.getSlowQueryLogs(
    {
      lastSeen: {
        $gte: startDate,
        $lte: endDate
      }
    },
    { sort: { avgTimeMs: -1 } }
  );

  const report = {
    period: { start: startDate, end: endDate },
    totalQueries: logs.reduce((sum, log) => sum + log.count, 0),
    uniquePatterns: logs.length,
    topSlow: logs.slice(0, 10),
    byCollection: {}
  };

  //Statistics grouped by collection
  logs.forEach(log => {
    if (!report.byCollection[log.collection]) {
      report.byCollection[log.collection] = {
        count: 0,
        totalTimeMs: 0,
        queries: []
      };
    }
    report.byCollection[log.collection].count += log.count;
    report.byCollection[log.collection].totalTimeMs += log.totalTimeMs;
    report.byCollection[log.collection].queries.push(log);
  });

  return report;
}

//Usage example
const report = await exportSlowQueryReport(
  new Date('2026-01-01'),
  new Date('2026-01-31')
);
console.log(JSON.stringify(report, null, 2));
```


## Optimization suggestions


### 1. Create index

```javascript
//Create index after analyzing slow queries
const slowQuery = {
  collection: 'users',
  sampleQuery: { status: 'active', createdAt: { $gte: someDate } }
};

//Create index based on query pattern
await msq.db('mydb').collection('users').createIndex(
  { status: 1, createdAt: -1 },
  { name: 'idx_status_createdAt' }
);

//Verify index effect
const result = await collection('users')
  .find({ status: 'active', createdAt: { $gte: someDate } })
  .explain('executionStats');

console.log('Index usage:', result.executionStats.totalKeysExamined);
```


### 2. Optimize query conditions

```javascript
//❌ Inefficient query
await collection('products').find({
  $where: 'this.price > 100'  //JavaScript expression, cannot use index
});

//✅ After optimization
await collection('products').find({
  price: { $gt: 100 }  //Standard operators, indexes can be used
});

//❌ Inefficient regular rules
await collection('users').find({
  email: { $regex: '.*@gmail.com' }  //Prefix wildcard, cannot use index
});

//✅ After optimization
await collection('users').find({
  email: { $regex: '^.*@gmail\\.com$' }  //Using anchor points, partial indexing can be used
});
```


### 3. Use projection to reduce data transmission

```javascript
//❌ Return all fields
const users = await collection('users').find({
  status: 'active'
});

//✅ Only return required fields
const users = await collection('users').find(
  { status: 'active' },
  {
    projection: { name: 1, email: 1, _id: 0 }
  }
);
```


### 4. Enable caching

```javascript
//Enable caching for high-frequency queries
const activeUsers = await collection('users').find(
  { status: 'active' },
  {
    cache: 60000,  //Cache for 1 minute
    slowQueryMs: 100
  }
);

//The second query is read from the cache and does not trigger the slow query log
```


## Best Practices for Production Environments


### 1. Set TTL appropriately

```javascript
//Set TTL based on storage capacity and analysis needs
storage: {
  mongodb: {
    ttl: 7 * 24 * 3600    //1 week (recommended) - balance storage and analysis needs
    //ttl: 30 * 24 * 3600 // January - Long-term trend analysis
    //ttl: 1 * 24 * 3600 // 1 day - storage sensitive scenes
  }
}
```


### 2. Use reuse connection (default)

```javascript
//✅ Recommendation: Reuse connection (default)
storage: {
  useBusinessConnection: true  //Zero additional connection overhead
}

//⚠️ Special scenario: independent connection
storage: {
  useBusinessConnection: false,
  uri: 'mongodb://admin-host:27017/admin'
}
```

**When to use independent connections**:
- Production database performance is extremely sensitive
- The amount of slow query logs is large (>10,000 entries/day)
- Requires independent permission control and resource isolation


### 3. Configure alarms

```javascript
//Send an alarm when slow query reaches the threshold
msq.on('slow-query', (info) => {
  if (info.durationMs > 5000) {
    //critical alarm
    alerting.send({
      type: 'critical',
      message: `Extremely slow query: ${info.durationMs}ms`,
      details: {
        operation: info.op,
        collection: info.collection,
        database: info.db,
        query: info.query,
        duration: info.durationMs
      },
      tags: ['mongodb', 'performance', 'slow-query']
    });
  } else if (info.durationMs > 2000) {
    //warning level
    alerting.send({
      type: 'warning',
      message: `Slow query detected: ${info.durationMs}ms`,
      details: info
    });
  }
});
```


### 4. Monitor storage space

```javascript
//Periodically check slow query log collection size
setInterval(async () => {
  const stats = await msq.db('admin').collection('slow_query_logs').stats();
  const sizeMB = stats.size / 1024 / 1024;

  console.log('Slow query log storage:', {
    size: `${sizeMB.toFixed(2)} MB`,
    count: stats.count,
    avgObjectSize: `${stats.avgObjSize} bytes`
  });

  //Warning: Storage exceeds 1GB
  if (sizeMB > 1024) {
    alerting.send({
      type: 'warning',
      message: 'Slow query logs collection exceeds 1GB',
      details: { sizeMB, count: stats.count }
    });
  }
}, 86400000);  //Check every day
```


### 5. Integrated log system

```javascript
//Integrate with Winston
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: 'slow-query.log',
      maxsize: 10485760,  // 10MB
      maxFiles: 5
    }),
    new winston.transports.Console()
  ]
});

const msq = new MonSQLize({
  type: 'mongodb',
  config: { uri: '...' },
  logger: logger,  //Use custom logger
  slowQueryMs: 1000
});
```

---

## Troubleshooting


## Problem 1: Slow query log is not saved

**Possible reasons**:

1. Function not enabled
   ```javascript
   //❌ Error
   slowQueryLog: false

   //✅ Correct
   slowQueryLog: true
   ```

2. The query does not exceed the threshold
   ```javascript
   //Check slowQueryMs settings
   slowQueryMs: 500  //Make sure the query does take >500ms
   ```

3. The batch queue is not refreshed
   ```javascript
   //Wait for the queue to be refreshed (default 5 seconds)
   await new Promise(resolve => setTimeout(resolve, 6000));
   ```

**Solution**:
1. Check whether the configuration is correct
2. Check the log output for errors
3. Manually call `msq.slowQueryLogManager.queue.flush()`


## Problem 2: Storage connection failed

**Error message**:
```text
[SlowQueryLog] Failed to initialize MongoDB storage: MongoServerError...
```

**Possible reasons**:
- MongoDB connection URI error
- The network is unreachable
- Insufficient permissions

**Solution**:
```javascript
//Check if the URI is correct
storage: {
  uri: 'mongodb://localhost:27017/admin' // Confirm that the URI is correct
}

//Or use multiplexing connection
storage: {
  useBusinessConnection: true  //Use business connections
}
```


## Question 3: Querying the slow query log returns empty

**Possible reasons**:
1. Slow query log is not generated
2. Expired (TTL deleted)
3. Query conditions do not match

**Solution**:
```javascript
//Query all slow query logs
const allLogs = await msq.getSlowQueryLogs({}, { limit: 100 });
console.log('Total:', allLogs.length);

//Check TTL settings
console.log('TTL:', msq.slowQueryLogManager.config.storage.mongodb.ttl);
```

---

## Performance optimization


## Performance impact analysis

| Metrics | Not enabled | After enabled | Impact |
|------|--------|--------|------|
| Single query time | X ms | X + 2ms | +2ms (queue add) |
| Memory usage | Y MB | Y + 0.3MB | +0.3MB (queue buffer) |
| Number of connections | N | N (multiplexed) | 0 |

**Conclusion**: The performance impact is minimal (<1%) and can be ignored


## Optimization suggestions (performance optimization)

1. **Use batch writes** (enabled by default)
   ```javascript
   batch: {
     enabled: true,     //✅ Enable batching
     size: 10,          //batch size
     interval: 5000     //refresh interval
   }
   ```

2. **Use scheme B to remove duplicates** (enabled by default)
   ```javascript
   deduplication: {
     enabled: true,     //✅ Enable deduplication
     strategy: 'aggregate'
   }
   ```

3. **Set TTL reasonably**
   ```javascript
   storage: {
     mongodb: {
       ttl: 7 * 24 * 3600  //Expires in 7 days
     }
   }
   ```

4. **Filter unimportant collections**
   ```javascript
   filter: {
     excludeCollections: ['logs', 'temp']  //Exclude log collection
   }
   ```

---

## Appendix


## A. Data model

**slow_query_logs collection structure**:

```javascript
{
  queryHash: 'abc123def456',          //Query Hash (unique)
  database: 'mydb',                   //Database name
  collection: 'users',                //Collection name
  operation: 'find',                  //Operation type
  sampleQuery: { status: 'active' },  //Sample query payload
  count: 2400,                        //Number of executions
  totalTimeMs: 1248000,               //total execution time
  minTimeMs: 500,                     //Minimum execution time
  maxTimeMs: 1200,                    //Maximum execution time
  firstSeen: ISODate('...'),          //Time of first discovery
  lastSeen: ISODate('...'),           //Last time (TTL field)
  metadata: {}
}
```

**Index**:

```javascript
//Unique index used by the storage backend
db.slow_query_logs.createIndex(
  { queryHash: 1, database: 1, collection: 1, operation: 1 },
  { unique: true, name: 'slow_query_log_unique' }
);

//TTL index (lastSeen)
db.slow_query_logs.createIndex(
  { lastSeen: 1 },
  { expireAfterSeconds: 604800 }
);

//query optimization index
db.slow_query_logs.createIndex({ database: 1, collection: 1 });
db.slow_query_logs.createIndex({ count: -1 });
```


## B. Version History

| Version | Date | Changes |
|------|------|------|
| v1.3.1 | 2025-12-22 | First release, supports MongoDB storage |


## C. Related links

- [Requirement plan document]
- [Usage Example](https://github.com/vextjs/monSQLize/blob/main/examples/docs/slow-query-log.ts)
- [Configuration design description]

---

**Documentation version**: v1.3.1
**Last update**: 2025-12-22
**Maintainer**: AI assistant
