# findOne Method Reference

## Overview

`findOne` is a basic query method provided by monSQLize. It queries the first document that matches the criteria from a MongoDB collection and supports query criteria, sorting, projection, caching, and related options.

## Method Signature

```javascript
async findOne(query = {}, options = {})
```

## Parameters

### query Parameter

**Type**: `Object`
**Default**: `{}`
**Required**: No

MongoDB query criteria object. All MongoDB query operators are supported.

**Examples**:
```javascript
{ status: 'active' }
{ age: { $gte: 18, $lte: 65 } }
{ tags: { $in: ['featured', 'hot'] } }
{ $or: [{ priority: 'high' }, { urgent: true }] }
```

### options Object Properties

| Parameter | Type | Required | Default | Source | Description |
|------|------|------|--------|------|------|
| `projection` / `project` | Object/Array | No | - | MongoDB native ✅ | Field projection configuration that controls which fields are returned. `project` is an alias for `projection`; `projection` wins when both are provided. |
| `sort` | Object | No | - | MongoDB native ✅ | Sort rules, such as `{ createdAt: -1, name: 1 }` |
| `hint` | Object/String | No | - | MongoDB native ✅ | Specifies the index to use for the query |
| `collation` | Object | No | - | MongoDB native ✅ | Specifies collation rules for string comparison and sorting |
| `maxTimeMS` | Number | No | Global config | MongoDB native ✅ | Query timeout in milliseconds |
| `comment` | String | No | - | MongoDB native ✅ | Query comment for production log tracing and performance analysis |
| `explain` | Boolean/String | No | - | MongoDB native ✅ | Returns the query execution plan. Supported values: `true`, `'queryPlanner'`, `'executionStats'`, `'allPlansExecution'` |
| `cache` | Number | No | `0` | monSQLize extension 🔧 | Cache TTL in milliseconds. Values greater than 0 enable caching |
| `meta` | Boolean/Object | No | `false` | monSQLize extension 🔧 | Returns query metadata, such as execution time and cache-hit information |

**Legend**:
- ✅ **MongoDB native**: a standard feature supported by official MongoDB APIs
- 🔧 **monSQLize extension**: functionality provided by monSQLize

**MongoDB reference**:
- [findOne() method](https://www.mongodb.com/docs/manual/reference/method/db.collection.findOne/)

### comment Configuration

Query comments identify the query source in MongoDB logs, which helps production operations, monitoring, and performance analysis:

```javascript
comment: 'ProductDetailPage:loadProduct:session_abc123'
```

**Use cases**:
- **Business scenario identification**: identify which page or feature issued the query
- **User tracing**: record the user or session associated with the query
- **Distributed tracing**: associate the query with a complete request chain through a traceId
- **Performance analysis**: locate issues quickly in slow-query logs

**Examples**:
```javascript
// User profile page query
const user = await collection('users').findOne(
  { _id: userId },
  {
    comment: 'UserProfile:loadUser:session_xyz'
  }
);

// Product detail page query
const product = await collection('products').findOne(
  { sku: 'PROD-001' },
  {
    comment: 'ProductPage:getDetails:traceId=abc123'
  }
);
```

**Reference**: for the complete `comment` guide, see the [find method documentation](./find.md#comment-configuration).

### projection Configuration

Projection controls which fields are included in or excluded from the query result. Two formats are supported:

**Object format**:
```javascript
projection: {
  name: 1,        // include the name field
  email: 1,       // include the email field
  password: 0     // exclude the password field
}
```

**Array format**:
```javascript
projection: ['name', 'email', 'createdAt']  // return only these fields, plus _id
```

**Notes**:
- MongoDB does not allow mixing inclusion (`1`) and exclusion (`0`), except for the `_id` field
- The array format is automatically converted to inclusion mode
- The `_id` field is always included by default unless explicitly excluded with `{ _id: 0 }`

### sort Configuration

Sort configuration defines how results are ordered:

```javascript
sort: {
  createdAt: -1,  // -1 means descending
  name: 1,        // 1 means ascending
  _id: 1          // add _id as the final sort field to keep ordering stable
}
```

**Performance recommendations**:
- For large datasets, make sure the sorted fields are indexed
- Avoid sorting on unindexed fields
- Use compound indexes to optimize multi-field sorting

### hint Configuration

Forces MongoDB to use the specified index:

```javascript
// Use an index name
hint: 'status_createdAt_idx'

// Use an index definition
hint: { status: 1, createdAt: -1 }
```

**Use cases**:
- The MongoDB query optimizer picked the wrong index
- A specific index must be forced to guarantee performance
- You need to compare the performance of different indexes

### collation Configuration

Specifies string comparison and sorting rules:

```javascript
collation: {
  locale: 'zh',           // Chinese
  strength: 2,            // ignore case and diacritics
  caseLevel: false,
  numericOrdering: true   // sort numeric strings by numeric value
}
```

**Common scenarios**:
- Case-insensitive queries and sorting
- Correct ordering in multilingual environments
- Natural sorting for numeric strings

## Return Value

### Normal Mode Returns an Object or `null`

By default, `findOne` returns a Promise that resolves to the first matching document or `null`:

```javascript
const user = await collection('users').findOne(
  { email: 'alice@example.com' }
);

// user = { _id: '...', name: 'Alice', email: 'alice@example.com', ... }
// or null if no document was found
```

**Return type**: `Promise<Object|null>`

### explain Mode Returns the Execution Plan

When `explain` is `true` or a specific verbosity level, the method returns the query execution plan:

```javascript
const plan = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    explain: 'executionStats'
  }
);

// plan = {
//   queryPlanner: { ... },
//   executionStats: {
//     executionTimeMillis: 2,
//     totalDocsExamined: 1,
//     totalKeysExamined: 1,
//     ...
//   }
// }
```

**Return type**: `Promise<Object>`

## Usage Patterns

### 1. Basic Query

The simplest query pattern returns the first matching document:

```javascript
// Query a user by ID
const user = await collection('users').findOne(
  { _id: ObjectId('507f1f77bcf86cd799439011') }
);

// Query by criteria
const activeUser = await collection('users').findOne(
  { status: 'active' },
  {
    sort: { createdAt: -1 }  // get the latest active user
  }
);

// Select returned fields
const userProfile = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    projection: { name: 1, email: 1, avatar: 1 }
  }
);
```

**Applicable scenarios**:
- Query one record by a unique identifier
- Get the newest or oldest record
- Check whether a record exists

### 2. Complex Query Criteria

Build complex queries with MongoDB query operators:

```javascript
// Range query
const order = await collection('orders').findOne(
  {
    amount: { $gte: 1000 },
    status: 'paid'
  },
  {
    sort: { createdAt: -1 }
  }
);

// Logical combination query
const user = await collection('users').findOne(
  {
    $or: [
      { role: 'admin' },
      { level: { $gte: 10 } }
    ],
    verified: true
  }
);

// Array query
const product = await collection('products').findOne(
  {
    tags: 'featured',
    'reviews.rating': { $gte: 4.5 }
  },
  {
    sort: { rating: -1 }
  }
);
```

### 3. Index Optimization

Use `hint` to force an index and `explain` to inspect the execution plan:

```javascript
// Force an index
const user = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    hint: { email: 1 }
  }
);

// Inspect the execution plan
const plan = await collection('users').findOne(
  { email: 'alice@example.com' },
  {
    explain: 'executionStats'
  }
);
```

**Performance optimization recommendations**:
- Create indexes for commonly queried fields
- Use compound indexes to optimize multi-condition queries
- Regularly analyze slow queries and optimize indexes

### 4. Cache Usage

Enable caching to improve query performance:

```javascript
// Cache for 5 minutes
const user = await collection('users').findOne(
  { _id: ObjectId('507f1f77bcf86cd799439011') },
  {
    cache: 5 * 60 * 1000  // 5 minutes
  }
);
```

**Cache strategy**:
- Enable caching for frequently queried records that change infrequently
- Set a reasonable TTL
- Pay attention to cache invalidation

## Error Handling

The `findOne` method may throw the following errors:

```javascript
try {
  const user = await collection('users').findOne(
    { email: 'alice@example.com' }
  );
} catch (error) {
  if (error.code === 'NOT_CONNECTED') {
    console.error('Database is not connected');
  } else {
    console.error('Query failed:', error.message);
  }
}
```

**Common errors**:
- `NOT_CONNECTED`: the database is not connected
- Query timeout errors
- Permission-related errors

## Best Practices

1. **Always specify sorting**: ensure consistent results when multiple records match
2. **Use projection**: return only the required fields to reduce network transfer and memory usage
3. **Use caching appropriately**: enable caching for read-heavy, low-write scenarios
4. **Create suitable indexes**: make sure query performance is predictable
5. **Handle `null` returns**: check whether the query result is `null`

## Related Methods

- `find()`: query multiple records
- `count()`: count records
- `findPage()`: paginated query
- `invalidate()`: invalidate cache
