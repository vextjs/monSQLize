# count Method Reference

## 📑 Table of Contents

- [Overview](#overview)
- [Method Signature](#method-signature)
- [Parameters](#parameters)
- [Return Value](#return-value)
- [Usage Patterns](#usage-patterns)
- [Error Handling](#error-handling)
- [Performance Optimization Recommendations](#performance-optimization-recommendations)
- [Best Practices](#best-practices)
- [FAQ](#faq)
- [Related Methods](#related-methods)
- [Example Code](#example-code)
- [Test Cases](#test-cases)

---

## Overview

`count` is a statistical query method provided by monSQLize. It quickly counts the number of MongoDB collection documents that match specific criteria. Internally, it uses MongoDB's recommended native `countDocuments()` and `estimatedDocumentCount()` methods, and supports index hints, caching, performance optimization, and related options.

## Method Signature

```javascript
async count(query = {}, options = {})
```

## Parameters

### query Parameter

Query criteria object using standard MongoDB query syntax.

**Type**: `Object`  
**Required**: No  
**Default**: `{}`. An empty object counts all documents.

**Examples**:

```javascript
// Simple query
{ status: 'active' }

// Range query
{ age: { $gte: 18, $lt: 60 } }

// Logical query
{
  $or: [
    { status: 'active' },
    { verified: true }
  ]
}

// Empty query: counts all documents and automatically uses estimatedDocumentCount optimization
{}
```

### options Parameter Object

| Parameter | Type | Required | Default | Source | Description |
|------|------|------|--------|------|------|
| `hint` | Object/String | No | - | MongoDB native ✅ | Specifies the index to use for the query. Applies only to `countDocuments` |
| `collation` | Object | No | - | MongoDB native ✅ | Specifies collation rules for string comparison. Applies only to `countDocuments` |
| `skip` | Number | No | - | MongoDB native ✅ | Number of documents to skip. Applies only to `countDocuments` |
| `limit` | Number | No | - | MongoDB native ✅ | Limits the number of documents counted. Applies only to `countDocuments` |
| `maxTimeMS` | Number | No | Global config | MongoDB native ✅ | Query timeout in milliseconds |
| `comment` | String | No | - | MongoDB native ✅ | Query comment for production log tracing and performance analysis |
| `explain` | Boolean/String | No | - | MongoDB native ✅ | Returns the query execution plan. Supported values: `true`, `'queryPlanner'`, `'executionStats'`, `'allPlansExecution'` |
| `cache` | Number | No | `0` | monSQLize extension 🔧 | Cache TTL in milliseconds. Values greater than 0 enable caching |
| `meta` | Boolean/Object | No | `false` | monSQLize extension 🔧 | Returns query metadata, such as execution time and cache-hit information |

**Legend**:
- ✅ **MongoDB native**: a standard feature supported by official MongoDB APIs
- 🔧 **monSQLize extension**: functionality provided by monSQLize

**MongoDB references**:
- [countDocuments()](https://www.mongodb.com/docs/manual/reference/method/db.collection.countDocuments/)
- [estimatedDocumentCount()](https://www.mongodb.com/docs/manual/reference/method/db.collection.estimatedDocumentCount/)

### Performance Optimization Notes

**Automatic method selection**:
- When `query` is an empty object `{}`, monSQLize automatically uses `estimatedDocumentCount()`, which is based on collection metadata and has the best performance
- When `query` contains criteria, monSQLize uses `countDocuments()`, which provides accurate counts and supports indexes

### comment Configuration

Query comments identify the purpose of count queries in MongoDB logs:

```javascript
comment: 'AdminDashboard:getTotalActiveUsers:admin_user_5'
```

**Use cases**:
- **Dashboard metrics**: identify the source of metric queries
- **Scheduled jobs**: identify scheduled count tasks
- **Monitoring alerts**: identify count queries from monitoring systems
- **Data analysis**: identify analytics-related counts

**Examples**:
```javascript
// Active user count
const activeCount = await collection('users').count(
  { status: 'active' },
  { comment: 'Dashboard:activeUsers:daily_report' }
);

// Order count
const orderCount = await collection('orders').count(
  { createdAt: { $gte: today } },
  { comment: 'Analytics:todayOrders:cronjob_hourly' }
);
```

**Reference**: for the complete `comment` guide, see the [find method documentation](./find.md#comment-configuration).

### hint Configuration

Forces MongoDB to use a specific index. This applies only when `countDocuments` is used:

```javascript
// Use an index name
{ hint: 'status_createdAt_idx' }

// Use an index definition
{ hint: { status: 1, createdAt: -1 } }
```

**Use cases**:
- The MongoDB query optimizer picked the wrong index
- A specific index must be forced to guarantee performance
- You need to compare the performance of different indexes

### skip and limit Configuration

Controls the range of documents being counted. This applies only when `countDocuments` is used:

```javascript
// Count the 100th through 200th matching documents
await collection('users').count(
  { status: 'active' },
  { skip: 100, limit: 100 }
);
```

**Use cases**:
- Paginated counting, such as counting only the current page
- Sample counting, such as counting only part of the matched documents

### collation Configuration

Specifies string comparison rules:

```javascript
collation: {
  locale: 'zh',           // Chinese
  strength: 2,            // ignore case and diacritics
  caseLevel: false,
  numericOrdering: true   // sort numeric strings by numeric value
}
```

**Common scenarios**:
- Case-insensitive counting
- Correct counting in multilingual environments

## Return Value

### Normal Mode Returns a Number

By default, `count` returns a Promise that resolves to the number of matching documents:

```javascript
const activeUserCount = await collection('users').count({ status: 'active' });

// activeUserCount = 42
```

**Return type**: `Promise<number>`

### explain Mode Returns the Execution Plan

When `explain` is `true` or a specific verbosity level, the method returns the query execution plan:

```javascript
const plan = await collection('users').count(
  { status: 'active' },
  { explain: 'executionStats' }
);

// plan = {
//   queryPlanner: { ... },
//   executionStats: {
//     executionTimeMillis: 2,
//     totalDocsExamined: 0,
//     totalKeysExamined: 10,
//     ...
//   }
// }
```

**Return type**: `Promise<Object>`

## Usage Patterns

### 1. Basic Counts

The simplest count patterns:

```javascript
// Count all users. Empty query automatically uses estimatedDocumentCount
const totalUsers = await collection('users').count();
console.log(`Total users: ${totalUsers}`);

// Count active users
const activeUsers = await collection('users').count({ status: 'active' });
console.log(`Active users: ${activeUsers}`);

// Count users with a specific role
const adminCount = await collection('users').count({ role: 'admin' });
console.log(`Admin users: ${adminCount}`);
```

**Applicable scenarios**:
- Count the total number of documents in a collection
- Count documents that match criteria
- Generate data overviews and reports

### 2. Complex Conditional Counts

Build complex counts with MongoDB query operators:

```javascript
// Range count
const highValueOrders = await collection('orders').count({
  amount: { $gte: 1000 },
  status: 'completed'
});

// Logical combination count
const vipOrHighLevelUsers = await collection('users').count({
  $or: [
    { role: 'vip' },
    { level: { $gte: 10 } }
  ],
  verified: true
});

// Array field count
const featuredProducts = await collection('products').count({
  tags: 'featured',
  inStock: true
});

// Date range count
const recentOrders = await collection('orders').count({
  createdAt: {
    $gte: new Date('2025-01-01'),
    $lt: new Date('2025-02-01')
  }
});
```

### 3. Index Optimization

Use `hint` to force an index and `explain` to inspect the execution plan:

```javascript
// Force an index
const count = await collection('orders').count(
  { 
    status: 'completed',
    createdAt: { $gte: new Date('2025-01-01') }
  },
  { hint: { status: 1, createdAt: -1 } }
);

// Inspect the execution plan
const plan = await collection('orders').count(
  { status: 'completed' },
  { explain: 'executionStats' }
);

console.log('Execution time:', plan.executionStats.executionTimeMillis, 'ms');
console.log('Documents examined:', plan.executionStats.totalDocsExamined);
console.log('Index keys examined:', plan.executionStats.totalKeysExamined);
```

**Performance optimization recommendations**:
- Create indexes for commonly counted fields
- Use compound indexes to optimize multi-condition counts
- Regularly analyze slow queries and optimize indexes
- Empty queries automatically use `estimatedDocumentCount`, which has the best performance

### 4. Cache Usage

Enable caching to improve count performance:

```javascript
// Cache for 5 minutes
const activeUserCount = await collection('users').count(
  { status: 'active' },
  { cache: 5 * 60 * 1000 }  // 5 minutes
);

// The second query is returned from cache
const cachedCount = await collection('users').count(
  { status: 'active' },
  { cache: 5 * 60 * 1000 }
);
```

**Cache strategy**:
- Enable caching for frequently counted data that changes infrequently
- Set a reasonable TTL
- Pay attention to cache invalidation
- Use `invalidate()` to clear cache after data updates

### 5. Performance Comparison: Empty Query Optimization

monSQLize automatically optimizes empty queries with no criteria:

```javascript
// Empty query automatically uses estimatedDocumentCount, which is fast and metadata-based
const totalUsers = await collection('users').count();

// Conditional query uses countDocuments, which is accurate but slower
const activeUsers = await collection('users').count({ status: 'active' });
```

**Performance difference**:
- `estimatedDocumentCount`: millisecond-level, based on collection metadata
- `countDocuments`: can take seconds on large datasets because it needs to scan documents or indexes

## Error Handling

The `count` method may throw the following errors:

```javascript
try {
  const count = await collection('users').count(
    { status: 'active' },
    { maxTimeMS: 1000 }
  );
  console.log('Count result:', count);
} catch (error) {
  if (error.code === 'NOT_CONNECTED') {
    console.error('Database is not connected');
  } else if (error.message.includes('timeout')) {
    console.error('Query timed out');
  } else {
    console.error('Count failed:', error.message);
  }
}
```

**Common errors**:
- `NOT_CONNECTED`: the database is not connected
- Query timeout errors on large datasets
- Permission-related errors
- Invalid query criteria errors

## Performance Optimization Recommendations

### 1. Index Optimization

```javascript
// ❌ Not recommended: count on an unindexed field (slow)
const count = await collection('orders').count({ customerName: 'Alice' });  // customerName is not indexed

// ✅ Recommended: count on an indexed field (fast)
const count = await collection('orders').count({ customerId: 'USER-001' });  // customerId is indexed
```

### 2. Query Criteria Optimization

```javascript
// ❌ Not recommended: regex-based count (slow)
const count = await collection('users').count({ email: { $regex: /^admin/ } });

// ✅ Recommended: exact match or prefix index
const count = await collection('users').count({ role: 'admin' });
```

### 3. Cache Strategy

```javascript
// ✅ Recommended: enable cache for frequent counts
const getDashboardStats = async () => {
  const totalUsers = await collection('users').count({}, { cache: 60000 });  // 1-minute cache
  
  const activeUsers = await collection('users').count(
    { status: 'active' },
    { cache: 60000 }
  );
  
  return { totalUsers, activeUsers };
};
```

### 4. Timeout Settings

```javascript
// Set a reasonable timeout for large counts
const count = await collection('orders').count(
  { status: 'completed' },
  { maxTimeMS: 5000 }  // 5-second timeout
);
```

### 5. skip and limit Optimization

```javascript
// Count the first 1000 matching documents as a sampled count
const sampleCount = await collection('orders').count(
  { status: 'completed' },
  { limit: 1000 }
);
```

## Best Practices

1. **Create indexes for counted fields**: make sure fields used in criteria have suitable indexes
2. **Use cache to reduce load**: enable caching for frequent counts where data changes infrequently
3. **Avoid full collection scans**: count through indexed fields whenever possible
4. **Set timeout protection**: configure `maxTimeMS` for large counts
5. **Monitor slow queries**: use `explain` to analyze count performance
6. **Optimize empty queries**: take advantage of `estimatedDocumentCount`

## FAQ

### Q: What is the difference between count and estimatedDocumentCount?

**A**: monSQLize handles this automatically:
- Empty `count()` calls automatically use `estimatedDocumentCount`, which is fast and metadata-based
- Conditional queries automatically use `countDocuments`, which is accurate and scans indexes or documents

### Q: How can I improve count performance on large datasets?

**A**: 
1. Create indexes for queried fields
2. Use caching to reduce repeated counts
3. Consider using aggregation pipelines to precompute statistics
4. Update counts asynchronously when real-time accuracy is not required

### Q: Does count scan all documents?

**A**: 
- With an index: it scans only the index, not the documents
- Without an index: it needs to scan all documents
- Empty query: it uses collection metadata and does not scan documents

## Related Methods

- `find()`: query multiple records
- `findOne()`: query a single record
- `findPage()`: paginated query
- `aggregate()`: aggregation query for more complex statistics
- `invalidate()`: invalidate cache

## Example Code

For the complete usage example, see `examples/docs/count.ts`.

## Test Cases

For the complete test cases, see `test/integration/mongodb/queries.test.ts`.

