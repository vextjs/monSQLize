# updateOne() - update a single document

## Syntax

```javascript
collection(collectionName).updateOne(filter, update, options)
```

## Parameters

## filter (Object, required)
Filter criteria to match the documents to be updated.

```javascript
{ userId: "user123" }
{ age: { $gte: 18 }, status: "active" }
```

## update (Object, required)
For update operations, update operators (such as `$set`, `$inc`, etc.) must be used.

**Supported update operators**:
- `$set` - Set field value
- `$unset` - Delete field
- `$inc` - Incremental value
- `$mul` - multiply the value
- `$push` - Add array element
- `$pull` - delete array element
- `$addToSet` - Add unique array element
- Wait...

```javascript
{ $set: { status: "active" } }
{ $inc: { loginCount: 1 } }
{ $push: { tags: "premium" } }
```

## options (Object, optional)
Operation options.

| Options | Type | Default | Description |
|------|------|--------|------|
| `upsert` | Boolean | false | Whether to insert a new document if it does not exist |
| `writeConcern` | Object | - | Write follow options |
| `bypassDocumentValidation` | Boolean | false | Whether to bypass document verification |
| `comment` | String | - | Operation comment (for log tracking) |
| `collation` | Object | - | Sorting Rules |
| `arrayFilters` | Array | - | Array filter |
| `hint` | String/Object | - | Index Tips |

## Return value

Return `Promise<UpdateResult>` object:

```javascript
{
  acknowledged: true,      //Is the operation confirmed?
  matchedCount: 1,         //Number of matching documents
  modifiedCount: 1,        //The actual number of documents modified
  upsertedId: null,        //Document _id inserted when upsert
  upsertedCount: 0         //upsert The number of documents inserted
}
```

**Note**:
- `matchedCount` may be greater than `modifiedCount` (match but do not modify if the values are the same)
- When there is no match, both `matchedCount` and `modifiedCount` are 0

## Example

## Basic update

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active", updatedAt: new Date() } }
);

console.log("Modified:", result.modifiedCount); // 1
```

## Increment counter

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  { $inc: { loginCount: 1 } }
);
```

## Array operations

```javascript
//Add tag
await collection("users").updateOne(
  { userId: "user123" },
  { $push: { tags: "premium" } }
);

//Delete tag
await collection("users").updateOne(
  { userId: "user123" },
  { $pull: { tags: "trial" } }
);
```

## Multiple operator combinations

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { name: "Alice Updated", lastLoginAt: new Date() },
    $inc: { loginCount: 1 },
    $push: { tags: "active" }
  }
);
```

## Update nested fields

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { "profile.address.city": "Shanghai" } }
);
```

## Delete field

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $unset: { tempField: "", debugMode: "" } }
);
```

## Use upsert

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { name: "Alice", status: "active" },
    $setOnInsert: { createdAt: new Date() }
  },
  { upsert: true }
);

if (result.upsertedId) {
  console.log("Inserted new document:", result.upsertedId);
}
```

## Conditional update

```javascript
//Only update users with age >= 18 and status active
await collection("users").updateOne(
  { userId: "user123", age: { $gte: 18 }, status: "active" },
  { $set: { verified: true } }
);
```

## Use comments (facilitates log tracking)

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "verified" } },
  { comment: "User Authentication Update - Batch 202511" }
);
```

## Error handling

```javascript
try {
  await collection("users").updateOne(
    { userId: "user123" },
    { $set: { status: "active" } }
  );
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    console.error("Parameter error:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("Unique constraint violation:", err.message);
  } else if (err.code === "WRITE_ERROR") {
    console.error("Write error:", err.message);
  }
}
```

## Common mistakes

## Error: Missing update operator

```javascript
//❌ Error - Missing $ operator
await collection("users").updateOne(
  { userId: "user123" },
  { name: "Alice", age: 25 }
);
//Throws: INVALID_ARGUMENT - update must use the update operator

//✅ Correct - use $set
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { name: "Alice", age: 25 } }
);
```

**Note**: `updateOne` is used for partial update, and the update operator must be used. If a complete replacement document is required, use `replaceOne`.

## Error: filter parameter is invalid

```javascript
//❌ Error - filter is null
await collection("users").updateOne(null, { $set: { name: "Test" } });

//❌ Error - filter is an array
await collection("users").updateOne([], { $set: { name: "Test" } });

//✅ Correct
await collection("users").updateOne({}, { $set: { name: "Test" } });
```

## Performance recommendations

## 1. Use index optimization filtering

```javascript
//Make sure the userId field is indexed
await collection("users").updateOne(
  { userId: "user123" }, //Use index fields
  { $set: { status: "active" } }
);
```

## 2. Avoid full table scan

```javascript
//❌ Not recommended - may result in full table scan
await collection("users").updateOne(
  { name: "Alice" }, //If name has no index
  { $set: { status: "active" } }
);

//✅ Recommended - Use a unique identifier
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);
```

## 3. Batch update using updateMany

```javascript
//❌ Not recommended - calling updateOne in a loop
for (const userId of userIds) {
  await collection("users").updateOne(
    { userId },
    { $set: { status: "active" } }
  );
}

//✅ Recommended - use updateMany
await collection("users").updateMany(
  { userId: { $in: userIds } },
  { $set: { status: "active" } }
);
```

## Caching behavior

`updateOne` will **automatically invalidate the relevant cache** after successfully modifying the document:

```javascript
//Query and cache
await collection("users").find({ userId: "user123" }, { cache: 5000 });

//Update documentation - automatically clear cache
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);

//The next query will get the latest data from the database
```

**Note**:
- Invalid cache only if `modifiedCount > 0`
- Cache invalidation is automatic and does not need to be called manually

## Slow query log

When the operation time exceeds the threshold, slow query logs will be automatically recorded:

```javascript
//Default threshold 1000ms (configurable during initialization)
const msq = new MonSQLize({
  type: "mongodb",
  databaseName: "mydb",
  config: { slowQueryMs: 500 } //Custom threshold
});

//Slow operations are automatically logged
await collection("users").updateOne(
  { complexCondition: {...} },
  { $set: { status: "active" } }
);
//Log output: [updateOne] Slow operation warning { ns: 'mydb.users', duration: 520, ... }
```

## Comparison with other methods

| Method | Update quantity | Operator | Return value | Usage scenario |
|------|---------|--------|--------|----------|
| `updateOne` | first match | must be partially updated with $ | count | single |
| `updateMany` | All matches | Must be updated with $ | Count | Partial update multiple |
| `replaceOne` | first match | cannot be replaced with $ | count | complete replacement |
| `findOneAndUpdate` | First match | Must use $ | Documentation | Atomic update |

## Best Practices

## 1. Always use the update operator

```javascript
//✅ Recommended
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);
```

## 2. Use $setOnInsert with upsert

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { status: "active", updatedAt: new Date() },
    $setOnInsert: { createdAt: new Date() } //Set only when inserting
  },
  { upsert: true }
);
```

## 3. Add comments for easy tracking

```javascript
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } },
  { comment: "User Activation - Admin Action" }
);
```

## 4. Verify update results

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  { $set: { status: "active" } }
);

if (result.matchedCount === 0) {
  console.log("User does not exist");
} else if (result.modifiedCount === 0) {
  console.log("The status is already active and does not need to be updated.");
} else {
  console.log("Update successful");
}
```

## Related methods

- [`updateMany()`](./update-many.md) - Batch update multiple documents
- [`replaceOne()`](./replace-one.md) - complete replacement of a single document
- [`findOneAndUpdate()`](./find-one-and-update.md) - find and update atomically
- [`insertOne()`](./insert-one.md) - Insert a single document

## References

- [MongoDB update operator documentation](https://docs.mongodb.com/manual/reference/operator/update/)
- [MongoDB updateOne Documentation](https://docs.mongodb.com/manual/reference/method/db.collection.updateOne/)
