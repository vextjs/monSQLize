# updateMany() - Update documents in batches

## Table of Contents

- [Syntax](#syntax)
- [Parameters](#parameters)
- [filter (Object, required)](#filter-object-required)
- [update (Object, required)](#update-object-required)
- [options (Object, optional)](#options-object-optional)
- [Return value](#return-value)
- [Example](#example)
- [Batch update status](#batch-update-status)
- [Batch increment](#batch-increment)
- [Conditional batch update](#conditional-batch-update)
- [Add fields in batches](#add-fields-in-batches)
- [Delete fields in batches](#delete-fields-in-batches)
- [Use array filter](#use-array-filter)
- [Complex updates with multiple conditions](#complex-updates-with-multiple-conditions)
- [Batch update nested fields](#batch-update-nested-fields)
- [Performance optimization](#performance-optimization)
- [1. Use index optimization filtering](#1-use-index-optimization-filtering)
- [2. Process large-scale updates in batches](#2-process-large-scale-updates-in-batches)
- [3. Performance test example](#3-performance-test-example)
- [Differences from updateOne](#differences-from-updateone)
- [Common scenarios](#common-scenarios)
- [Scenario 1: Batch activation of users](#scenario-1-batch-activation-of-users)
- [Scenario 2: Mark expired data in batches](#scenario-2-mark-expired-data-in-batches)
- [Scenario 3: Bulk price adjustment](#scenario-3-bulk-price-adjustment)
- [Scenario 4: Batch data migration](#scenario-4-batch-data-migration)
- [Error handling](#error-handling)
- [Caching behavior](#caching-behavior)
- [Slow query log](#slow-query-log)
- [Best Practices](#best-practices)
- [1. Verify update results](#1-verify-update-results)
- [2. Add operation comments](#2-add-operation-comments)
- [3. Use transaction processing key batch update](#3-use-transaction-processing-key-batch-update)
- [4. Monitor update progress](#4-monitor-update-progress)
- [Related methods](#related-methods)
- [References](#references)

## Syntax

```javascript
collection(collectionName).updateMany(filter, update, options)
```

## Parameters


## filter (Object, required)
Filter criteria to match the documents to be updated.

```javascript
{ status: "inactive" }
{ age: { $gte: 18, $lt: 65 }, role: "user" }
```


## update (Object, required)
For update operations, the update operator must be used.

```javascript
{ $set: { status: "active", updatedAt: new Date() } }
{ $inc: { views: 1 } }
```


## options (Object, optional)

| Options | Type | Default | Description |
|------|------|--------|------|
| `upsert` | Boolean | false | Whether to insert a new document if it does not exist |
| `writeConcern` | Object | - | Write follow options |
| `bypassDocumentValidation` | Boolean | false | Whether to bypass document verification |
| `comment` | String | - | Operation comments |
| `collation` | Object | - | Sorting Rules |
| `arrayFilters` | Array | - | Array filter |
| `hint` | String/Object | - | Index Tips |

## Return value

Return `Promise<UpdateResult>`:

```javascript
{
  acknowledged: true,
  matchedCount: 10,      //Number of matching documents
  modifiedCount: 10,     //The actual number of documents modified
  upsertedId: null,
  upsertedCount: 0
}
```

## Example


## Batch update status

```javascript
//Activate all inactive users
const result = await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active", updatedAt: new Date() } }
);

console.log("Updated:", result.modifiedCount, "users");
```


## Batch increment

```javascript
//All product views +10
const result = await collection("products").updateMany(
  {},
  { $inc: { views: 10 } }
);

console.log("Updated:", result.modifiedCount, "products");
```


## Conditional batch update

```javascript
//Mark large orders as high priority
const result = await collection("orders").updateMany(
  {
    status: "pending",
    amount: { $gte: 1000 }
  },
  { $set: { priority: "high" } }
);
```


## Add fields in batches

```javascript
//Add new fields to all articles
await collection("articles").updateMany(
  {},
  {
    $set: {
      published: true,
      publishedAt: new Date(),
      version: 1
    }
  }
);
```


## Delete fields in batches

```javascript
//Clean temporary fields for all documents
await collection("documents").updateMany(
  {},
  { $unset: { tempField: "", debugMode: "" } }
);
```


## Use array filter

```javascript
//Update subject grades with grades >= 80
await collection("students").updateMany(
  { studentId: { $exists: true } },
  { $set: { "scores.$[elem].grade": "A" } },
  {
    arrayFilters: [{ "elem.score": { $gte: 80 } }]
  }
);
```


## Complex updates with multiple conditions

```javascript
await collection("users").updateMany(
  {
    role: "user",
    age: { $gte: 18, $lt: 65 },
    status: "active"
  },
  {
    $set: { category: "adult", verifiedAt: new Date() },
    $inc: { loginBonus: 10 }
  }
);
```


## Batch update nested fields

```javascript
//Add default address for all users
await collection("users").updateMany(
  {},
  {
    $set: {
      "profile.address.country": "China",
      "profile.verified": true
    }
  }
);
```

## Performance optimization


## 1. Use index optimization filtering

```javascript
//Make sure filter fields are indexed
await collection("users").updateMany(
  { status: "inactive" }, //The status field should have an index
  { $set: { status: "active" } }
);
```


## 2. Process large-scale updates in batches

```javascript
//❌ Not recommended - update millions of documents at once
await collection("users").updateMany(
  {},
  { $set: { migrated: true } }
);

//✅ Recommended - batch processing
let lastId = null;
const batchSize = 10000;

while (true) {
  const filter = lastId
    ? { _id: { $gt: lastId } }
    : {};

  const result = await collection("users")
    .find(filter)
    .limit(batchSize)
    .toArray();

  if (result.length === 0) break;

  const ids = result.map(doc => doc._id);
  await collection("users").updateMany(
    { _id: { $in: ids } },
    { $set: { migrated: true } }
  );

  lastId = result[result.length - 1]._id;
  console.log(`Processed ${batchSize} documents`);
}
```


## 3. Performance test example

```javascript
//Mass update performance test
const startTime = Date.now();

const result = await collection("logs").updateMany(
  { processed: false },
  {
    $set: { processed: true, processedAt: new Date() }
  }
);

const duration = Date.now() - startTime;
console.log(`Updated ${result.modifiedCount} documents in ${duration}ms`);
console.log(`Speed: ${Math.round(result.modifiedCount / duration * 1000)} docs/sec`);
```

## Differences from updateOne

| Features | updateOne | updateMany |
|------|-----------|------------|
| **UPDATE NUMBER** | First match only | All matches |
| **Performance** | Fast (single write) | Slow (batch write) |
| **Usage Scenarios** | Update a single document | Batch update |
| **Return value** | Counting information | Counting information |

```javascript
//updateOne - update only the first one
await collection("users").updateOne(
  { status: "inactive" },
  { $set: { status: "active" } }
);
//Result: modifiedCount = 1

//updateMany - updates all matches
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
);
//Result: modifiedCount = N (number of all matches)
```

## Common scenarios


## Scenario 1: Batch activation of users

```javascript
const result = await collection("users").updateMany(
  {
    status: "pending",
    emailVerified: true,
    createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  },
  {
    $set: {
      status: "active",
      activatedAt: new Date()
    }
  }
);

console.log(`Activated ${result.modifiedCount} users`);
```


## Scenario 2: Mark expired data in batches

```javascript
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

await collection("sessions").updateMany(
  {
    lastAccessAt: { $lt: thirtyDaysAgo },
    expired: { $ne: true }
  },
  {
    $set: {
      expired: true,
      expiredAt: new Date()
    }
  }
);
```


## Scenario 3: Bulk price adjustment

```javascript
//10% off on all products in selected categories
await collection("products").updateMany(
  { category: "electronics", onSale: false },
  {
    $mul: { price: 0.9 },
    $set: { onSale: true, saleStartAt: new Date() }
  }
);
```


## Scenario 4: Batch data migration

```javascript
//Migrate old fields to new fields
await collection("users").updateMany(
  { oldField: { $exists: true } },
  [
    {
      $set: {
        newField: "$oldField"
      }
    },
    {
      $unset: "oldField"
    }
  ]
);
```

## Error handling

```javascript
try {
  const result = await collection("users").updateMany(
    { status: "inactive" },
    { $set: { status: "active" } }
  );

  if (result.matchedCount === 0) {
    console.log("No matching document found");
  } else {
    console.log(`Successfully updated ${result.modifiedCount}/${result.matchedCount} documents`);
  }
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    console.error("Parameter error:", err.message);
  } else if (err.code === "WRITE_ERROR") {
    console.error("Batch write error:", err.message);
  } else {
    console.error("Unknown error:", err);
  }
}
```

## Caching behavior

`updateMany` will **automatically invalidate the relevant cache** after successfully modifying the document:

```javascript
//Caching query results
await collection("users").find({ status: "inactive" }, { cache: 5000 });

//Batch updates - automatically clear cache
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
);
//cache cleared

//The next query will get it from the database
```

**Note**: The cache will only be invalidated if `matchedCount > 0`.

## Slow query log

If the batch update operation takes a long time, slow query logs will be automatically recorded:

```javascript
//Large batch updates may trigger slow query logs
await collection("logs").updateMany(
  { processed: false },
  { $set: { processed: true } }
);
//If it takes > 1000ms (default threshold), a log will be logged:
//[updateMany] Slow operation warning { ns: 'db.logs', duration: 1520, matchedCount: 50000, ... }
```

## Best Practices


## 1. Verify update results

```javascript
const result = await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } }
);

if (result.matchedCount !== result.modifiedCount) {
  console.warn(
    `Some documents are not modified: ${result.matchedCount - result.modifiedCount} document values are already target values`
  );
}
```


## 2. Add operation comments

```javascript
await collection("users").updateMany(
  { status: "inactive" },
  { $set: { status: "active" } },
  { comment: "Batch activation of users - Operation activity 202511" }
);
```


## 3. Use transaction processing key batch update

```javascript
const session = client.startSession();
try {
  await session.withTransaction(async () => {
    await collection("users").updateMany(
      { status: "pending" },
      { $set: { status: "active" } },
      { session }
    );

    await collection("audit_logs").insertOne(
      {
        action: "batch_activate",
        timestamp: new Date(),
        count: result.modifiedCount
      },
      { session }
    );
  });
} finally {
  await session.endSession();
}
```


## 4. Monitor update progress

```javascript
let totalUpdated = 0;
const batchSize = 1000;

while (true) {
  const result = await collection("users").updateMany(
    {
      status: "inactive",
      updated: { $ne: true }
    },
    {
      $set: { status: "active", updated: true }
    }
  );

  totalUpdated += result.modifiedCount;

  if (result.matchedCount < batchSize) {
    break;
  }

  console.log(`Progress: ${totalUpdated} documents updated`);
  await new Promise(resolve => setTimeout(resolve, 100)); //avoid overload
}

console.log(`Completed: ${totalUpdated} documents updated`);
```

## Related methods

- [`updateOne()`](./update-one.md) - Update a single document
- [`replaceOne()`](./replace-one.md) - complete replacement of a single document
- [`insertMany()`](./insert-many.md) - Batch insert documents

## References

- [MongoDB updateMany Document](https://docs.mongodb.com/manual/reference/method/db.collection.updateMany/)
- [MongoDB batch write operation](https://docs.mongodb.com/manual/core/bulk-write-operations/)

