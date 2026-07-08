# replaceOne() - Complete document replacement

## Syntax

```javascript
collection(collectionName).replaceOne(filter, replacement, options)
```

## Parameters

## filter (Object, required)
Filter criteria to match documents to replace.

```javascript
{ userId: "user123" }
{ configKey: "app-settings" }
```

## replacement (Object, required)
Replacement document, **cannot contain update operators** (such as `$set`).

```javascript
{
  userId: "user123",
  name: "Alice",
  age: 26,
  status: "active"
}
```

**Important**:
- ❌ Cannot use `$set`, `$inc` and other operators
- ✅ Provide complete new document objects directly
- The `_id` field will be automatically retained

## options (Object, optional)

| Options | Type | Default | Description |
|------|------|--------|------|
| `upsert` | Boolean | false | Whether to insert a new document if it does not exist |
| `writeConcern` | Object | - | Write follow options |
| `bypassDocumentValidation` | Boolean | false | Whether to bypass document verification |
| `comment` | String | - | Operation comments |
| `collation` | Object | - | Sorting Rules |
| `hint` | String/Object | - | Index Tips |

## Return value

Return `Promise<ReplaceResult>`:

```javascript
{
  acknowledged: true,
  matchedCount: 1,
  modifiedCount: 1,
  upsertedId: null,
  upsertedCount: 0
}
```

## Key differences from updateOne

| Features | replaceOne | updateOne |
|------|------------|-----------|
| **Operator** | ❌ Cannot use $ | ✅ Must use $ |
| **Field handling** | Delete unspecified fields | Keep unspecified fields |
| **Usage scenarios** | Complete replacement | Partial update |
| **_id handle** | Reserved | Reserved |

## Behavior comparison example

```javascript
//original document
{ _id: 1, userId: "user1", name: "Alice", age: 25, status: "active", tags: ["premium"] }

//updateOne - update only the specified field
await collection("users").updateOne(
  { userId: "user1" },
  { $set: { age: 26 } }
);
//Result: { _id: 1, userId: "user1", name: "Alice", age: 26, status: "active", tags: ["premium"] }
//Other fields are reserved ✅

//replaceOne - complete replacement
await collection("users").replaceOne(
  { userId: "user1" },
  { userId: "user1", name: "Alice", age: 26 }
);
//Result: { _id: 1, userId: "user1", name: "Alice", age: 26 }
//status and tags deleted ⚠️
```

## Example

## Basic replacement

```javascript
const result = await collection("users").replaceOne(
  { userId: "user123" },
  {
    userId: "user123",
    name: "Alice Updated",
    age: 26,
    email: "alice@example.com"
  }
);

console.log("Replaced:", result.modifiedCount);
```

## Configuration management scenario

```javascript
//Replace application configuration (common scenario)
await collection("configs").replaceOne(
  { configKey: "app-settings" },
  {
    configKey: "app-settings",
    theme: "dark",
    language: "en-US",
    notifications: true,
    version: 2
  }
);
```

## Use upsert

```javascript
//insert if not present
const result = await collection("settings").replaceOne(
  { settingKey: "feature-flags" },
  {
    settingKey: "feature-flags",
    featureA: true,
    featureB: false,
    updatedAt: new Date()
  },
  { upsert: true }
);

if (result.upsertedId) {
  console.log("Inserted new document");
} else {
  console.log("Replaced existing document");
}
```

## Preserve _id replacement

```javascript
//Get the _id of the original document
const original = await collection("users").findOne({ userId: "user123" });

//Keep the same _id when replacing
await collection("users").replaceOne(
  { _id: original._id },
  {
    _id: original._id, //Specify _id explicitly (optional, automatically retained)
    userId: "user123",
    name: "New Name",
    status: "active"
  }
);
```

## Custom _id replacement

```javascript
const customId = "custom-id-123";

await collection("documents").replaceOne(
  { _id: customId },
  {
    _id: customId,
    title: "Document Title",
    content: "Document content",
    version: 2
  }
);
```

## Replace with empty document (clear all fields)

```javascript
//Remove all fields (except _id)
await collection("temp").replaceOne(
  { userId: "user123" },
  {} //empty object
);
//Result: { _id: <original-id> }
```

## Nested object replacement

```javascript
await collection("users").replaceOne(
  { userId: "user123" },
  {
    userId: "user123",
    profile: {
      name: "Alice",
      address: {
        city: "Shanghai",
        country: "China"
      },
      preferences: {
        theme: "dark",
        language: "zh-CN"
      }
    },
    tags: ["premium", "verified"]
  }
);
```

## Common scenarios

## Scenario 1: Configuration file management

```javascript
//Update application configuration
const newConfig = {
  configKey: "app-config",
  version: 2,
  features: {
    darkMode: true,
    notifications: true,
    betaFeatures: false
  },
  limits: {
    maxUsers: 1000,
    maxStorage: "10GB"
  },
  updatedAt: new Date()
};

await collection("configs").replaceOne(
  { configKey: "app-config" },
  newConfig,
  { upsert: true }
);
```

## Scenario 2: Document version management

```javascript
//Save old version to history
const oldDoc = await collection("documents").findOne({ docId: "doc1" });
await collection("document_history").insertOne({
  ...oldDoc,
  archivedAt: new Date()
});

//Replace with new version
await collection("documents").replaceOne(
  { docId: "doc1" },
  {
    docId: "doc1",
    content: "New content",
    version: oldDoc.version + 1,
    author: "Bob",
    updatedAt: new Date()
  }
);
```

## Scenario 3: Complete state machine switching

```javascript
//Complete task status switching
await collection("tasks").replaceOne(
  { taskId: "task1", status: "pending" },
  {
    taskId: "task1",
    status: "completed",
    result: "success",
    completedBy: "worker-1",
    completedAt: new Date(),
    metrics: {
      duration: 120,
      retries: 0
    }
  }
);
```

## Scenario 4: Clean and rebuild the document

```javascript
//Clean old data and rebuild
const userId = "user123";
await collection("users").replaceOne(
  { userId },
  {
    userId,
    name: "Fresh User",
    createdAt: new Date(),
    //All old fields are deleted and start from scratch
  }
);
```

## Error handling

```javascript
try {
  await collection("users").replaceOne(
    { userId: "user123" },
    {
      userId: "user123",
      name: "Alice"
    }
  );
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    //Possible reason: replacement contains $ operator
    console.error("Parameter error:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("Unique constraint violation:", err.message);
  } else if (err.code === "WRITE_ERROR") {
    console.error("Write error:", err.message);
  }
}
```

## Common mistakes

## Error 1: Using update operator

```javascript
//❌ Error - replaceOne cannot use $ operator
await collection("users").replaceOne(
  { userId: "user123" },
  { $set: { name: "Alice" } }
);
//Throws: INVALID_ARGUMENT - replacement cannot contain an update operator

//✅ Correct - full documentation provided
await collection("users").replaceOne(
  { userId: "user123" },
  { userId: "user123", name: "Alice" }
);

//💡 If partial update is required, use updateOne
await collection("users").updateOne(
  { userId: "user123" },
  { $set: { name: "Alice" } }
);
```

## Mistake 2: Not realizing fields will be deleted

```javascript
//original document
{ _id: 1, userId: "user1", name: "Alice", email: "alice@example.com", role: "admin" }

//❌ Danger - email and role will be lost
await collection("users").replaceOne(
  { userId: "user1" },
  { userId: "user1", name: "Alice Updated" }
);
//Result: { _id: 1, userId: "user1", name: "Alice Updated" }
//email and role were deleted ⚠️

//✅ Correct - if you want to retain a field, query the full document first
const doc = await collection("users").findOne({ userId: "user1" });
await collection("users").replaceOne(
  { userId: "user1" },
  {
    ...doc,
    name: "Alice Updated" //Only change this field
  }
);

//💡 More recommended - use updateOne for partial updates
await collection("users").updateOne(
  { userId: "user1" },
  { $set: { name: "Alice Updated" } }
);
```

## Performance recommendations

## 1. Filter using index fields

```javascript
//✅ Recommended - use index fields
await collection("users").replaceOne(
  { userId: "user123" }, //userId has an index
  newDocument
);

//❌ Avoid - Use non-indexed fields
await collection("users").replaceOne(
  { email: "alice@example.com" }, //email may not be indexed
  newDocument
);
```

## 2. Pay attention to performance when using it with findOne

```javascript
//❌ Not recommended - two queries
const doc = await collection("users").findOne({ userId: "user123" });
await collection("users").replaceOne(
  { userId: "user123" },
  { ...doc, name: "Updated" }
);

//✅ Recommended - Use findOneAndReplace atomic operation
const oldDoc = await collection("users").findOneAndReplace(
  { userId: "user123" },
  newDocument,
  { returnDocument: "before" }
);
```

## Caching behavior

`replaceOne` does not clear query caches by default after a successful replacement. Use `cache.invalidate` or `autoInvalidate: true` when the write should clear cache:

```javascript
//Query and cache
await collection("configs").find({ configKey: "app-settings" }, { cache: 5000 });

//Replace Document - Automatically clean cache
await collection("configs").replaceOne(
  { configKey: "app-settings" },
  newConfig
);
//cache cleared
```

## When to use replaceOne

## ✅ Suitable for scenarios where replaceOne is used

1. **Configuration Management** - complete replacement of configuration objects
2. **Documentation Version** - Replaced with new version
3. **State Machine** - Complete state switching
4. **Data Cleaning** - Delete old fields and rebuild

## ❌ Scenarios where replaceOne is not suitable

1. **Partial Update** - Use `updateOne` instead
2. **Count Up** - `$inc` using `updateOne`
3. **Array Operation** - `$push`/`$pull` using `updateOne`
4. **Keep unmodified fields** - use `updateOne`

## Decision tree

```text
Need to update documentation?
├─ Need to keep unmodified fields?
│ ├─ Yes → Use updateOne + $set
│ └─ No → Continue
├─ Need to completely replace all fields?
│ ├─ Yes → Use replaceOne
│ └─ No → Use updateOne
└─ Need an atomic operation and return a document?
├─ Partial update → Use findOneAndUpdate
└─ Complete replacement → use findOneAndReplace
```

## Best Practices

## 1. Clarify the document structure

```javascript
//✅ Recommended - Provide complete document structure
const newDocument = {
  configKey: "app-settings",
  version: 2,
  theme: "dark",
  language: "en-US",
  notifications: true,
  updatedAt: new Date()
};

await collection("configs").replaceOne(
  { configKey: "app-settings" },
  newDocument
);
```

## 2. Use TypeScript/JSDoc to define types

```javascript
/**
 * @typedef {Object} UserDocument
 * @property {string} userId
 * @property {string} name
 * @property {string} email
 * @property {string} status
 */

/** @type {UserDocument} */
const newUser = {
  userId: "user123",
  name: "Alice",
  email: "alice@example.com",
  status: "active"
};

await collection("users").replaceOne({ userId: "user123" }, newUser);
```

## 3. Verify the replacement result

```javascript
const result = await collection("configs").replaceOne(
  { configKey: "app-settings" },
  newConfig
);

if (result.matchedCount === 0) {
  console.warn("Configuration does not exist, consider using upsert: true");
} else if (result.modifiedCount === 0) {
  console.log("The configuration content is the same and has not been modified.");
} else {
  console.log("Configuration replaced successfully");
}
```

## Related methods

- [`updateOne()`](./update-one.md) - Partial update of a single document
- [`findOneAndReplace()`](./find-one-and-replace.md) - find and replace atomically
- [`insertOne()`](./insert-one.md) - Insert a single document

## References

- [MongoDB replaceOne document](https://docs.mongodb.com/manual/reference/method/db.collection.replaceOne/)
