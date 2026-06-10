# readPreference - MongoDB replica set read preference configuration

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [✅ 5 reading preference modes](#5-reading-preference-modes)
- [✅ Connection level global configuration](#connection-level-global-configuration)
- [API parameter description](#api-parameter-description)
- [Connection configuration](#connection-configuration)
- [Usage example](#usage-example)
- [Basic usage](#basic-usage)
  - [Example 1: Default read preference (primary)](#example-1-default-read-preference-primary)
  - [Example 2: secondaryPreferred (read slave node first)](#example-2-secondarypreferred-read-slave-node-first)
  - [Example 3: secondary (read only from the slave node)](#example-3-secondary-read-only-from-the-slave-node)
  - [Example 4: primaryPreferred (read primary node first)](#example-4-primarypreferred-read-primary-node-first)
  - [Example 5: nearest (nearest read, low latency)](#example-5-nearest-nearest-read-low-latency)
- [Advanced usage](#advanced-usage)
  - [Example 6: Use with other options](#example-6-use-with-other-options)
- [Best Practices](#best-practices)
- [✅ Recommended practices](#recommended-practices)
- [⚠️ Notes](#notes)
- [Performance impact](#performance-impact)
- [Impact of read preference on performance](#impact-of-read-preference-on-performance)
- [Performance optimization suggestions](#performance-optimization-suggestions)
- [FAQ](#faq)
- [Q: Does readPreference support query-level configuration?](#q-does-readpreference-support-query-level-configuration)
- [Q: How to verify that readPreference is effective?](#q-how-to-verify-that-readpreference-is-effective)
- [Q: How long is the replication delay?](#q-how-long-is-the-replication-delay)
- [Q: How to deal with replication delays?](#q-how-to-deal-with-replication-delays)
- [Q: How to test in stand-alone mode?](#q-how-to-test-in-stand-alone-mode)
- [References](#references)

## Overview

`readPreference` is a node selection strategy used to control read operations in MongoDB replica sets, and supports replica set read and write separation scenarios. By configuring `readPreference`, you can reduce the load on the master node and achieve low-latency reads for globally distributed deployments.

**Applicable scenarios**:
- ✅ Replica Set deployment (Replica Set)
- ✅ Read and write separation (reduce the load on the master node)
- ✅ Globally distributed deployment (low latency reading)
- ✅ Analysis/report query (isolate master node write load)

**Restrictions**:
- ⚠️ Only global configuration (connection level), query level override is not supported
- ⚠️ MongoDB exclusive features (no corresponding concept for PostgreSQL/MySQL)
- ⚠️ Read slave nodes may have replication delays (data is not the latest)
- ⚠️ Not valid in stand-alone mode (replica set environment required)

---

## Core Features


## ✅ 5 reading preference modes

| Mode | Read Node | Data Consistency | Applicable Scenarios |
|------|---------|-----------|---------|
| **primary** | Read-only primary node | Strong consistency | Default, latest data required |
| **primaryPreferred** | Read the primary node first, read from the slave node when the primary node fails | Usually strong consistency | Require strong consistency + fault tolerance |
| **secondary** | read-only slave | eventual consistency | analysis/reporting, isolated master |
| **secondaryPreferred** | Read from the slave node first, and read from the master node when the slave node is unavailable | Eventual consistency | Read more and write less, reducing the load on the master node |
| **nearest** | The node with the lowest read latency (master or slave) | Eventual consistency | Globally distributed deployment, low latency |


## ✅ Connection level global configuration

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: {
        uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
        readPreference: 'secondaryPreferred'  //← Global configuration
    }
});
```

**Features**:
- Configure once and all queries will take effect
- No need to repeat configuration in each query method
- Simplify the code and reduce the probability of errors

---

## API parameter description


## Connection configuration

| Parameters | Type | Required | Default | Description |
|------|------|------|--------|------|
| **config.readPreference** | string | ❌ | `'primary'` | Replica set read preference mode |

**Optional values**:
- `'primary'` - Read only from the master node (default)
- `'primaryPreferred'` - Read the master node first, read from the slave node when the master node is unavailable
- `'secondary'` - Read only from slave nodes
- `'secondaryPreferred'` - Read the slave node first, and read the master node when the slave node is unavailable.
- `'nearest'` - read nearest node (low latency)

---

## Usage example


## Basic usage


### Example 1: Default read preference (primary)

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: {
        uri: 'mongodb://localhost:27017',
        //If readPreference is not configured, the default is 'primary' (only read the primary node)
    }
});

await msq.connect();
const { collection } = msq;

//Query operations automatically read from the primary node
const users = await collection('users').find({ query: {} });
console.log(`✅ ${users.length} pieces of data were read from the master node`);

await msq.close();
```

---


### Example 2: secondaryPreferred (read slave node first)

**Applicable scenarios**: Read more and write less, reducing the load on the master node

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: {
        uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
        readPreference: 'secondaryPreferred'  //← Read slave nodes first
    }
});

await msq.connect();
const { collection } = msq;

//Query reads from slave nodes first (reduces load on master node)
const products = await collection('products').find({
    query: { category: 'electronics' }
});
console.log(`✅ Read ${products.length} product data from the slave node`);

//⚠️ NOTE: slave nodes may have replication delays
console.log('⚠️ NOTE: Slave node data may have a delay of a few milliseconds to a few seconds');

await msq.close();
```

---


### Example 3: secondary (read only from the slave node)

**Applicable scenarios**: Analysis/report query, completely isolating the write load of the master node

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'analytics_db',
    config: {
        uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
        readPreference: 'secondary'  //← Read only from slave nodes
    }
});

await msq.connect();
const { collection } = msq;

//Applicable scenarios: analysis/report query, complete isolation of master node write load
const reports = await collection('sales').aggregate([
    { $match: { date: { $gte: new Date('2025-01-01') } } },
    { $group: { _id: '$category', total: { $sum: '$amount' } } }
]);
console.log(`✅ Generate ${reports.length} report data from slave nodes`);
console.log('✅ The master node is not affected and focuses on processing write operations.');

await msq.close();
```

---


### Example 4: primaryPreferred (read primary node first)

**Applicable Scenario**: Strong consistency is required, but you want to have a backup plan when the master node fails

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: {
        uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
        readPreference: 'primaryPreferred'  //← Read the master node first, and read from the slave node when the master node fails.
    }
});

await msq.connect();
const { collection } = msq;

//Applicable scenarios: Strong consistency is required, but there is a backup plan when the master node fails.
const orders = await collection('orders').find({
    query: { status: 'pending' }
});
console.log(`✅ Read ${orders.length} orders from the master node first`);
console.log('✅ If the master node fails, automatically switch to the slave node');

await msq.close();
```

---


### Example 5: nearest (nearest read, low latency)

**Applicable scenarios**: Global distributed deployment, nearby reading to reduce latency

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: {
        uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
        readPreference: 'nearest'  //← The node with the lowest read latency (master or slave)
    }
});

await msq.connect();
const { collection } = msq;

//Applicable scenarios: Global distributed deployment, nearby reading to reduce latency
const articles = await collection('articles').find({
    query: { published: true },
    limit: 10
});
console.log(`✅ Read ${articles.length} articles from the node with the lowest latency`);
console.log('✅ Suitable for global distributed deployment scenarios');

await msq.close();
```

---


## Advanced usage


### Example 6: Use with other options

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'test_db',
    config: {
        uri: 'mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0',
        readPreference: 'secondaryPreferred'  //← Read Preferences
    },
    maxTimeMS: 3000,  //Query timeout
    slowQueryMs: 500  //Slow query threshold
});

await msq.connect();
const { collection } = msq;

//readPreference is compatible with other options (hint, collation, comment)
const results = await collection('products').find({
    query: { price: { $gt: 100 } },
    hint: { category: 1, price: 1 },  //index hint
    comment: 'expensive-products-query',  //Query comments
    maxTimeMS: 2000  //Single query timeout
});
console.log(`✅ Use multiple options to query: ${results.length} results`);

await msq.close();
```

---

## Best Practices


## ✅ Recommended practices

1. **Use secondaryPreferred** when reading more and writing less.
   ```javascript
   //✅ Recommendation: Reduce the load on the master node
   readPreference: 'secondaryPreferred'
   ```

2. **Strong consistency scenarios use primary (default)**
   ```javascript
   //✅ Recommendation: Use default values when the latest data is required
   //Do not configure readPreference, or explicitly configure it as 'primary'
   ```

3. **Globally distributed deployment uses nearest**
   ```javascript
   //✅ Recommended: low latency reading
   readPreference: 'nearest'
   ```

4. **Use secondary for analysis/report query**
   ```javascript
   //✅ Recommendation: Completely isolate the master node write load
   readPreference: 'secondary'
   ```

---


## ⚠️ Notes

1. **Replication delay problem**
   ```javascript
   //❌ Avoid: reading from the slave node immediately after writing data
   await collection('users').insertOne({ name: 'Alice' });  //← Write to master node

   //⚠️ The data just written may not be read (replication delay)
   const users = await collection('users').find({ query: { name: 'Alice' } });

   //✅ Solution: Use 'primary' to read immediately after writing or wait for copy to complete
   ```

2. **Single mode is invalid**
   ```javascript
   //⚠️ In stand-alone mode, the readPreference configuration is invalid and the only node is always read.
   const msq = new MonSQLize({
       config: {
           uri: 'mongodb://localhost:27017', // ← stand-alone mode
           readPreference: 'secondary'  //← Invalid configuration
       }
   });
   ```

3. **Replica Set URI Format**
   ```javascript
   //✅ Correct: Contains multiple nodes + replicaSet parameter
   uri: 'mongodb://host1:27017,host2:27018,host3:27019/?replicaSet=rs0'

   //❌ Error: Single node URI (cannot separate read and write)
   uri: 'mongodb://localhost:27017'
   ```

4. **Cross-database compatibility**
   ```javascript
   //⚠️ readPreference is a MongoDB exclusive feature
   //PostgreSQL/MySQL has no corresponding concept
   //This configuration needs to be removed when switching databases
   ```

---

## Performance impact


## Impact of read preference on performance

| Read preference | Master node load | Latency | Data consistency | Applicable scenarios |
|--------|-----------|------|-----------|---------|
| **primary** | High | Low | Strong consistency | More writes and less reads, the latest data is required |
| **primaryPreferred** | High | Low | Usually strongly consistent | Requires consistency + fault tolerance |
| **secondary** | Low | Medium (replication latency) | Eventually consistent | Analytics/reporting, isolated primary |
| **secondaryPreferred** | Low | Medium (replication latency) | Eventually consistent | Read more and write less, reduce the primary node |
| **nearest** | Medium | Lowest | Eventually consistent | Globally distributed, low latency |


## Performance optimization suggestions

1. **Read more and write less scenario**: Use `secondaryPreferred` to reduce the load of the master node by 20-50%
2. **Globally distributed**: Use `nearest` to reduce latency by 30-70% (depending on geographical location)
3. **Analysis/Report**: Use `secondary` to completely isolate the master node write load

---

## FAQ


## Q: Does readPreference support query-level configuration?
**A**: Not supported. monSQLize only supports connection-level global configuration, simplifying the API and reducing configuration complexity. For query-level control, use the native MongoDB driver.

---


## Q: How to verify that readPreference is effective?
**A**:
1. Check the MongoDB log/profile to confirm that the read operation hits the slave node
2. Set the delay on the slave node and observe whether there is a lag in the query results.
3. Use `db.currentOp()` to view the read preferences of active connections

---


## Q: How long is the replication delay?
**A**:
- LAN replica set: typically 10-100ms
- Cross-region replica set: maybe 100ms-1s
- When the network jitters: maybe 1s-5s
- It is recommended to monitor `optimeDate` differences in `rs.status()`

---


## Q: How to deal with replication delays?
**A**:
1. **Read immediately after writing**: use `primary` or `primaryPreferred`
2. **Acceptable Delay**: Use `secondaryPreferred` or `secondary`
3. **Mixed strategy**: Use `primary` for key queries and `secondary` for analytical queries.

---


## Q: How to test in stand-alone mode?
**A**:
`readPreference` is invalid in stand-alone mode. Suggestions:
1. Use Docker Compose to build a local replica set
2. Use MongoDB Atlas free cluster (M0)
3. Use `mongodb-memory-server` to simulate a replica set (configuration required)

---

## References

- [MongoDB official documentation - Read Preference](https://www.mongodb.com/docs/manual/core/read-preference/)
- [MongoDB Replica Set Deployment Guide](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/)
- [monSQLize connection configuration](./connection.md)
- [Example of multiple connection pools and read preferences](../../examples/docs/pool.ts)
