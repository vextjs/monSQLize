# deleteMany() - delete documents in batches

## Table of Contents

- [Syntax](#syntax)
- [Parameters](#parameters)
- [filter (required)](#filter-required)
- [options (optional)](#options-optional)
- [Return value](#return-value)
- [Core Features](#core-features)
- [✅ Delete all matching documents](#delete-all-matching-documents)
- [✅ Automatic cache invalidation](#automatic-cache-invalidation)
- [✅ Slow query monitoring](#slow-query-monitoring)
- [Common scenarios](#common-scenarios)
- [Scenario 1: Batch cleaning of expired data](#scenario-1-batch-cleaning-of-expired-data)
- [Scenario 2: Delete user-related data in batches](#scenario-2-delete-user-related-data-in-batches)
- [Scenario 3: Cleaning test data](#scenario-3-cleaning-test-data)
- [Scenario 4: Clean logs by time range](#scenario-4-clean-logs-by-time-range)
- [Scenario 5: Optimizing bulk deletions using index hints](#scenario-5-optimizing-bulk-deletions-using-index-hints)
- [Scenario 6: Conditional batch deletion](#scenario-6-conditional-batch-deletion)
- [Differences from other methods](#differences-from-other-methods)
- [vs deleteOne](#vs-deleteone)
- [vs findOneAndDelete](#vs-findoneanddelete)
- [Performance considerations for batch deletion](#performance-considerations-for-batch-deletion)
- [1. Mass deletion strategy](#1-mass-deletion-strategy)
- [2. Use index optimization to delete](#2-use-index-optimization-to-delete)
- [3. Use index hints](#3-use-index-hints)
- [4. Monitor deletion progress](#4-monitor-deletion-progress)
- [Error handling](#error-handling)
- [Invalid filter criteria](#invalid-filter-criteria)
- [Operation timeout](#operation-timeout)
- [Write attention error](#write-attention-error)
- [Security Advice](#security-advice)
- [⚠️ Query before deleting](#query-before-deleting)
- [⚠️ Avoid using empty filters](#avoid-using-empty-filters)
- [⚠️ Use soft delete as an alternative](#use-soft-delete-as-an-alternative)
- [⚠️ Record deletion operation log](#record-deletion-operation-log)
- [Notes](#notes)
- [⚠️ Deletion is irreversible](#deletion-is-irreversible)
- [⚠️ Scope of cache invalidation](#scope-of-cache-invalidation)
- [⚠️Performance impact](#performance-impact)
- [⚠️ Index maintenance](#index-maintenance)
- [Utility functions](#utility-functions)
- [Safe batch deletion function](#safe-batch-deletion-function)
- [Related methods](#related-methods)
- [Sample code](#sample-code)
- [MongoDB Documentation](#mongodb-documentation)

## Syntax

```javascript
collection(name).deleteMany(filter, options?)
```

## Parameters


## filter (required)

**Type**: `Object`

Filter criteria used to match documents to be deleted. Use MongoDB query operators.

```javascript
//Delete all inactive users
await collection("users").deleteMany({ status: "inactive" });

//Delete all expired records
await collection("sessions").deleteMany({
  expiresAt: { $lt: new Date() }
});
```

**⚠️ WARNING**: Using the empty object `{}` as filter will delete all documents in the collection!

```javascript
//Danger: delete all documents
await collection("users").deleteMany({});
```


## options (optional)

**Type**: `Object`

| Options | Type | Default | Description |
|------|------|--------|------|
| `collation` | Object | - | Specify collation |
| `hint` | string \| Object | - | Index hint, force the use of a specific index |
| `maxTimeMS` | number | - | Maximum execution time of the operation (milliseconds) |
| `writeConcern` | Object | - | Write follow options |
| `comment` | string | - | Operation comments, used for log tracking |

## Return value

**Type**: `Promise<Object>`

Return an object containing the results of the deletion:

```javascript
{
  deletedCount: 5,     //Number of deleted documents
  acknowledged: true   //Is the operation confirmed?
}
```

## Core Features


## ✅ Delete all matching documents

Unlike `deleteOne()`, `deleteMany()` deletes all matching documents.

```javascript
//Delete all users with status="inactive"
const result = await collection("users").deleteMany({ status: "inactive" });
console.log(`${result.deletedCount} users deleted`); //It could be 0, 1, 5, 100...
```


## ✅ Automatic cache invalidation

After the deletion is successful, monSQLize will automatically clean up the related cache keys.

```javascript
//Query and cache
const users = await collection("users").find(
  { status: "inactive" },
  { cache: 5000 }
);

//Batch deletion (automatically clear cache)
await collection("users").deleteMany({ status: "inactive" });

//Query again (will not return from cache)
const remainingUsers = await collection("users").find(
  { status: "inactive" },
  { cache: 5000 }
); // []
```


## ✅ Slow query monitoring

Delete operations that exceed the threshold (default 1000ms) will automatically record a warning log.

```javascript
//Large deletes may trigger slow query warnings
await collection("logs").deleteMany({
  createdAt: { $lt: new Date("2023-01-01") }
});
//Log: [WARN] [deleteMany] Slow operation warning { duration: 1500ms, deletedCount: 50000 }
```

## Common scenarios


## Scenario 1: Batch cleaning of expired data

```javascript
//Delete all expired sessions
const result = await collection("sessions").deleteMany({
  expiresAt: { $lt: new Date() }
});

console.log(`Cleaned ${result.deletedCount} expired sessions`);
```


## Scenario 2: Delete user-related data in batches

```javascript
//Delete all orders for user
const result = await collection("orders").deleteMany({
  userId: "user123"
});

console.log(`User's ${result.deletedCount} orders deleted`);
```


## Scenario 3: Cleaning test data

```javascript
//Delete all test users
const result = await collection("users").deleteMany({
  email: { $regex: /@test\.com$/ }
});

console.log(`Cleaned ${result.deletedCount} test users`);
```


## Scenario 4: Clean logs by time range

```javascript
//Delete logs older than 30 days
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const result = await collection("logs").deleteMany({
  createdAt: { $lt: thirtyDaysAgo }
});

console.log(`${result.deletedCount} old logs deleted`);
```


## Scenario 5: Optimizing bulk deletions using index hints

```javascript
//When deleting large amounts of data, specify the use of indexes
const result = await collection("analytics").deleteMany(
  {
    userId: "user123",
    eventType: "page_view",
    timestamp: { $lt: new Date("2024-01-01") }
  },
  {
    hint: { userId: 1, timestamp: 1 },  //Use composite index
    comment: "cleanup-old-analytics",
    maxTimeMS: 30000  //30 seconds timeout
  }
);

console.log(`${result.deletedCount} analysis records deleted`);
```


## Scenario 6: Conditional batch deletion

```javascript
//Delete all low-rated and unpaid orders
const result = await collection("orders").deleteMany({
  rating: { $lt: 2 },
  status: "unpaid",
  createdAt: { $lt: new Date("2024-01-01") }
});

console.log(`${result.deletedCount} low quality orders deleted`);
```

## Differences from other methods


## vs deleteOne

| Features | deleteOne | deleteMany |
|------|-----------|------------|
| **Number of Delete** | Delete only the first matching document | Delete all matching documents |
| **Return value** | `deletedCount: 0 or 1` | `deletedCount: 0 or more` |
| **Performance** | Faster (stops when first found) | Slower (needs to scan all matches) |
| **Usage Scenarios** | Delete specific single records | Batch clean data |
| **Risk** | Low | High (a large amount of data may be accidentally deleted) |

```javascript
//deleteOne - delete only one
const result1 = await collection("users").deleteOne({ status: "inactive" });
console.log(result1.deletedCount); //0 or 1

//deleteMany - delete all matches
const result2 = await collection("users").deleteMany({ status: "inactive" });
console.log(result2.deletedCount); // 0, 1, 5, 100...
```


## vs findOneAndDelete

| Features | deleteMany | findOneAndDelete |
|------|-----------|------------------|
| **Number of Delete** | Delete all matching documents | Delete only one document |
| **Return content** | Deletion count | Deleted document content |
| **Atomicity** | No (multiple delete operations) | Yes (find and delete are single atomic operations) |
| **Usage scenarios** | Batch cleaning | Document content before deletion |

## Performance considerations for batch deletion


## 1. Mass deletion strategy

**Issue**: Deleting a large number of documents at once may result in:
- Operation timeout
- Block other operations
- Memory pressure

**Solution**: Delete in batches

```javascript
//Bad: Deleting a large number of documents at once
await collection("logs").deleteMany({
  createdAt: { $lt: new Date("2020-01-01") }
}); //Millions of items may be deleted

//Good: delete in batches
const batchSize = 10000;
let deletedTotal = 0;

while (true) {
  const result = await collection("logs").deleteMany(
    { createdAt: { $lt: new Date("2020-01-01") } },
    { maxTimeMS: 5000 }  //Maximum 5 seconds per batch
  );

  deletedTotal += result.deletedCount;
  console.log(`${deletedTotal} items deleted`);

  if (result.deletedCount < batchSize) {
    break;  //All data has been deleted
  }

  //Pause to avoid sustained high load
  await new Promise(resolve => setTimeout(resolve, 100));
}
```


## 2. Use index optimization to delete

```javascript
//Create index first
await collection("logs").createIndex({ createdAt: 1 });

//Then delete (index will be used)
const result = await collection("logs").deleteMany({
  createdAt: { $lt: new Date("2023-01-01") }
});
```


## 3. Use index hints

```javascript
//Explicitly specify which index to use
await collection("events").deleteMany(
  {
    userId: "user123",
    eventType: "click",
    timestamp: { $lt: new Date("2024-01-01") }
  },
  {
    hint: { userId: 1, timestamp: 1 }  //Use composite index
  }
);
```


## 4. Monitor deletion progress

```javascript
//First count the number to be deleted
const totalCount = await collection("logs").count({
  createdAt: { $lt: new Date("2020-01-01") }
});

console.log(`Prepare to delete ${totalCount} logs`);

//perform deletion
const result = await collection("logs").deleteMany({
  createdAt: { $lt: new Date("2020-01-01") }
});

console.log(`Actual deletion of ${result.deletedCount} items`);
```

## Error handling


## Invalid filter criteria

```javascript
try {
  //Error: filter must be an object
  await collection("users").deleteMany(null);
} catch (error) {
  console.error(error.code); // INVALID_ARGUMENT
  console.error(error.message); // "filter must be of object type"
}
```


## Operation timeout

```javascript
try {
  //Mass deletions may time out
  await collection("logs").deleteMany(
    { level: "debug" },
    { maxTimeMS: 1000 }  //1 second timeout
  );
} catch (error) {
  if (error.code === ErrorCodes.OPERATION_TIMEOUT) {
    console.error("The deletion operation timed out and may need to be deleted in batches.");
  }
}
```


## Write attention error

```javascript
try {
  await collection("users").deleteMany(
    { status: "inactive" },
    {
      writeConcern: { w: "majority", wtimeout: 5000 }
    }
  );
} catch (error) {
  if (error.code === ErrorCodes.WRITE_ERROR) {
    console.error("Write operation failed:", error.message);
  }
}
```

## Security Advice


## ⚠️ Query before deleting

Before performing batch deletion, it is recommended to first query and confirm the data to be deleted:

```javascript
//1. Query first (use limit to avoid returning too much data)
const toDelete = await collection("users").find(
  { status: "inactive" },
  { limit: 10 }
);

console.log("Users to be deleted (example):", toDelete);

//2. Confirm before deleting
const confirmed = true; //Get from user input
if (confirmed) {
  const result = await collection("users").deleteMany({ status: "inactive" });
  console.log(`${result.deletedCount} users deleted`);
}
```


## ⚠️ Avoid using empty filters

```javascript
//Danger: delete all documents
await collection("users").deleteMany({});

//If you really need to clear the collection, state it clearly
const CONFIRM_DELETE_ALL = true;
if (CONFIRM_DELETE_ALL) {
  const result = await collection("temp_data").deleteMany({});
  console.log(`The collection has been cleared and ${result.deletedCount} pieces of data have been deleted.`);
}
```


## ⚠️ Use soft delete as an alternative

For important data, consider using soft deletion (marked as deleted) instead of physical deletion:

```javascript
//Physically deleted (unrecoverable)
await collection("users").deleteMany({ status: "inactive" });

//Soft delete (recoverable)
await collection("users").updateMany(
  { status: "inactive" },
  {
    $set: {
      deleted: true,
      deletedAt: new Date(),
      deletedBy: "admin"
    }
  }
);

//Filter deleted data when querying
const activeUsers = await collection("users").find({
  deleted: { $ne: true }
});
```


## ⚠️ Record deletion operation log

```javascript
//Log before deletion
const filter = { status: "inactive" };
const countBefore = await collection("users").count(filter);

//perform deletion
const result = await collection("users").deleteMany(filter, {
  comment: `cleanup-inactive-users-${new Date().toISOString()}`
});

//Record audit log
await collection("audit_logs").insertOne({
  action: "deleteMany",
  collection: "users",
  filter,
  deletedCount: result.deletedCount,
  expectedCount: countBefore,
  timestamp: new Date(),
  operator: "admin"
});
```

## Notes


## ⚠️ Deletion is irreversible

```javascript
//Once deleted, it cannot be recovered
const result = await collection("users").deleteMany({ status: "inactive" });
console.log(`${result.deletedCount} users permanently deleted`);
```


## ⚠️ Scope of cache invalidation

Automatic cache invalidation clears the cache for the entire collection:

```javascript
//Delete some users
await collection("users").deleteMany({ status: "inactive" });

//The cache of all users collections will be cleared
//Include cache for other queries
```


## ⚠️Performance impact

A large number of deletions may affect database performance. It is recommended to perform the following during off-peak periods:

```javascript
//Perform large deletes during off-peak periods
const isOffPeak = new Date().getHours() < 6;

if (isOffPeak) {
  const result = await collection("logs").deleteMany({
    createdAt: { $lt: new Date("2020-01-01") }
  });
  console.log(`${result.deletedCount} logs deleted`);
} else {
  console.log("Wait for the off-peak period before performing the deletion operation");
}
```


## ⚠️ Index maintenance

When a large number of documents are deleted, the index is updated automatically, which may take some time.

## Utility functions


## Safe batch deletion function

```javascript
/**
 *Securely delete documents in bulk (in batches, with timeout, with logs)
 */
async function safeDeleteMany(collectionName, filter, options = {}) {
  const {
    batchSize = 10000,
    maxTimeMS = 5000,
    pauseMs = 100,
    dryRun = false
  } = options;

  //1. Count the total number first
  const totalCount = await collection(collectionName).count(filter);
  console.log(`Prepare to delete ${totalCount} pieces of data`);

  if (dryRun) {
    console.log("[Simulation Mode] Will not actually delete");
    return { deletedCount: 0, totalCount };
  }

  //2. Delete in batches
  let deletedTotal = 0;
  let batchCount = 0;

  while (deletedTotal < totalCount) {
    batchCount++;

    const result = await collection(collectionName).deleteMany(
      filter,
      { maxTimeMS }
    );

    deletedTotal += result.deletedCount;
    console.log(`[Batch ${batchCount}] deletes ${result.deletedCount} items, accumulating ${deletedTotal}/${totalCount}`);

    if (result.deletedCount === 0) {
      break;  //No more data to delete
    }

    //pause
    await new Promise(resolve => setTimeout(resolve, pauseMs));
  }

  console.log(`✅ Done! A total of ${deletedTotal} pieces of data were deleted`);
  return { deletedCount: deletedTotal, totalCount };
}

//Usage example
await safeDeleteMany("logs",
  { createdAt: { $lt: new Date("2020-01-01") } },
  { dryRun: true }  //Simulate the run first
);
```

## Related methods

- [deleteOne()](./delete-one.md) - delete a single document
- [findOneAndDelete()](./find-one-and-delete.md) - Atomically find and delete documents, returning the deleted documents
- [updateMany()](./update-many.md) - Batch update documents (alternative to soft delete)

## Sample code

For complete sample code, please refer to [examples/docs/delete-many.ts](../../examples/docs/delete-many.ts)

## MongoDB Documentation

- [MongoDB deleteMany Documentation](https://www.mongodb.com/docs/manual/reference/method/db.collection.deleteMany/)
