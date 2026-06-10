# findOneAndReplace() - Atomic find and replace

## Table of Contents

- [Syntax](#syntax)
- [Parameters](#parameters)
- [filter (Object, required)](#filter-object-required)
- [replacement (Object, required)](#replacement-object-required)
- [options (Object, optional)](#options-object-optional)
- [Return value](#return-value)
- [Core Features](#core-features)
- [Atomic guarantee](#atomic-guarantee)
- [Differences from findOneAndUpdate](#differences-from-findoneandupdate)
- [Common scenarios](#common-scenarios)
- [Scenario 1: Configuring atomic replacement](#scenario-1-configuring-atomic-replacement)
- [Scenario 2: Version Management](#scenario-2-version-management)
- [Scenario 3: State machine transition](#scenario-3-state-machine-transition)
- [Scenario 4: Distributed lock configuration](#scenario-4-distributed-lock-configuration)
- [Example](#example)
- [Basic usage](#basic-usage)
- [Return the replaced document](#return-the-replaced-document)
- [Use sorting](#use-sorting)
- [Use projection](#use-projection)
- [Use upsert](#use-upsert)
- [Error handling](#error-handling)
- [Common mistakes](#common-mistakes)
- [Error 1: Using update operator](#error-1-using-update-operator)
- [Mistake 2: Forgot fields will be deleted](#mistake-2-forgot-fields-will-be-deleted)
- [Performance recommendations](#performance-recommendations)
- [1. Use index](#1-use-index)
- [2. Use projection to reduce data transmission](#2-use-projection-to-reduce-data-transmission)
- [Concurrency safety](#concurrency-safety)
- [Security Example](#security-example)
- [Best Practices](#best-practices)
- [1. Save historical versions](#1-save-historical-versions)
- [2. Use version number](#2-use-version-number)
- [3. Verification results](#3-verification-results)
- [When to use](#when-to-use)
- [✅ Suitable for use findOneAndReplace](#suitable-for-use-findoneandreplace)
- [❌ Not suitable for use with findOneAndReplace](#not-suitable-for-use-with-findoneandreplace)
- [Related methods](#related-methods)
- [References](#references)

## Syntax

```javascript
collection(collectionName).findOneAndReplace(filter, replacement, options)
```

## Parameters


## filter (Object, required)
Filter criteria.


## replacement (Object, required)
Replacement document, **cannot contain update operators**.


## options (Object, optional)

| Options | Type | Default | Description |
|------|------|--------|------|
| `projection` | Object | - | Field projection |
| `sort` | Object | - | Sorting conditions |
| `upsert` | Boolean | false | Whether to insert if it does not exist |
| `returnDocument` | String | "before" | "before" or "after" |
| `maxTimeMS` | Number | - | Maximum execution time |
| `comment` | String | - | Operation comments |
| `collation` | Object | - | Sorting Rules |
| `hint` | String/Object | - | Index Tips |
| `includeResultMetadata` | Boolean | false | Whether to include complete metadata |

## Return value

Default returns **Document Object** or **null** (not found).

If `includeResultMetadata: true`, return:
```javascript
{
value: <document or null>,
  ok: 1,
  lastErrorObject: {
    updatedExisting: true,
    n: 1,
    upserted: <id>  //Only when upsert
  }
}
```

> **⚠️ IMPORTANT NOTE - MongoDB Driver 6.x Compatibility**
>
> monSQLize uses MongoDB Node.js driver 6.x, which makes important changes to the return value format of `findOneAndReplace`:
>
> **Driver 6.x (current version)**:
> - By default, the document object is returned directly
> - Requires explicit setting of `includeResultMetadata: true` to return complete metadata
>
> **Driver 5.x and earlier**:
> - Return complete metadata `{ value, ok, lastErrorObject }` by default
>
> **✅ monSQLize processing**:
> - This difference has been automatically handled internally, users do not need to care about the driver version
> - API behavior remains consistent and backward compatible
> - For the current verification entry, see [MongoDB Driver Version Compatibility Guide](./mongodb-driver-compatibility.md) and [findOneAnd* Return Value Unified Description](./findOneAnd-return-value-unified.md)

## Core Features


## Atomic guarantee

```javascript
//✅ Atomic operations - find and replace in the same transaction
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "app-settings" },
  newConfig
);

//❌ Non-atomic - Risk of race conditions
const config = await collection("configs").findOne({ configKey: "app-settings" });
await collection("configs").replaceOne({ configKey: "app-settings" }, newConfig);
```


## Differences from findOneAndUpdate

| Features | findOneAndReplace | findOneAndUpdate |
|------|------------------|------------------|
| **Operator** | ❌ Cannot use $ | ✅ Must use $ |
| **Field handling** | Delete unspecified fields | Keep unspecified fields |
| **Usage scenarios** | Complete replacement | Partial update |

```javascript
//original document
{ _id: 1, userId: "user1", name: "Alice", email: "alice@example.com", role: "admin" }

//findOneAndUpdate - partial update
const doc1 = await collection("users").findOneAndUpdate(
  { userId: "user1" },
  { $set: { name: "Alice Updated" } }
);
//Result: email and role retained ✅

//findOneAndReplace - complete replacement
const doc2 = await collection("users").findOneAndReplace(
  { userId: "user1" },
  { userId: "user1", name: "Alice Updated" }
);
//Result: email and role were deleted ⚠️
```

## Common scenarios


## Scenario 1: Configuring atomic replacement

```javascript
//Atomically replace the configuration and return the old configuration
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "feature-flags" },
  {
    configKey: "feature-flags",
    featureA: true,
    featureB: false,
    featureC: true,
    version: 2,
    updatedAt: new Date()
  }
);

if (oldConfig) {
  console.log("Previous version:", oldConfig.version);
  //Can be saved to history
  await collection("config_history").insertOne({
    ...oldConfig,
    archivedAt: new Date()
  });
}
```


## Scenario 2: Version Management

```javascript
//Get old version and create new version
const oldDoc = await collection("documents").findOneAndReplace(
  { docId: "doc1" },
  {
    docId: "doc1",
    content: "Version 2 content",
    version: 2,
    author: "Bob",
    createdAt: new Date()
  }
);

if (oldDoc) {
  //Save old version to history
  await collection("document_history").insertOne({
    ...oldDoc,
    archivedAt: new Date()
  });
}
```


## Scenario 3: State machine transition

```javascript
//Get tasks atomically and switch states completely
const task = await collection("tasks").findOneAndReplace(
  {
    taskId: "task1",
    status: "pending"
  },
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
  },
  { returnDocument: "after" }
);

if (task) {
  console.log("Task completed:", task.taskId);
} else {
  console.log("Task not found or already completed");
}
```


## Scenario 4: Distributed lock configuration

```javascript
//Atomicly obtain lock configuration
const lockConfig = await collection("locks").findOneAndReplace(
  {
    lockKey: "resource-lock",
    available: true
  },
  {
    lockKey: "resource-lock",
    available: false,
    ownerId: "worker-1",
    acquiredAt: new Date(),
    expiresAt: new Date(Date.now() + 60000)
  },
  { returnDocument: "after" }
);

if (lockConfig) {
  try {
    //Perform operations that require lock protection
    console.log("Lock acquired");
  } finally {
    //release lock
    await collection("locks").replaceOne(
      { lockKey: "resource-lock" },
      {
        lockKey: "resource-lock",
        available: true
      }
    );
  }
}
```

## Example


## Basic usage

```javascript
const oldDoc = await collection("settings").findOneAndReplace(
  { settingKey: "app-theme" },
  {
    settingKey: "app-theme",
    value: "dark",
    updatedAt: new Date()
  }
);

if (oldDoc) {
  console.log("Old theme:", oldDoc.value);
}
```


## Return the replaced document

```javascript
const newDoc = await collection("configs").findOneAndReplace(
  { configKey: "limits" },
  {
    configKey: "limits",
    maxUsers: 2000,
    maxStorage: "20GB",
    version: 2
  },
  { returnDocument: "after" }
);

console.log("New version:", newDoc.version);
```


## Use sorting

```javascript
//Find the highest priority configuration and replace
const config = await collection("configs").findOneAndReplace(
  { type: "feature" },
  newConfig,
  {
    sort: { priority: -1 },
    returnDocument: "after"
  }
);
```


## Use projection

```javascript
const doc = await collection("documents").findOneAndReplace(
  { docId: "doc1" },
  newDocument,
  {
    projection: { _id: 0, title: 1, version: 1 }
  }
);
//Only the title and version fields are returned
```


## Use upsert

```javascript
const config = await collection("configs").findOneAndReplace(
  { configKey: "new-config" },
  {
    configKey: "new-config",
    value: "default",
    createdAt: new Date()
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
//If it does not exist, a new document will be inserted.
```

## Error handling

```javascript
try {
  const doc = await collection("configs").findOneAndReplace(
    { configKey: "app-settings" },
    newConfig
  );

  if (!doc) {
    console.log("Config not found");
  }
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    //Possible reason: replacement contains $ operator
    console.error("Parameter error:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("Unique constraint violation:", err.message);
  } else {
    console.error("Operation failed:", err);
  }
}
```

## Common mistakes


## Error 1: Using update operator

```javascript
//❌ Error - cannot use $ operator
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  { $set: { value: "test" } }
);
//Throws: INVALID_ARGUMENT

//✅ Correct - full documentation provided
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  { configKey: "app", value: "test" }
);
```


## Mistake 2: Forgot fields will be deleted

```javascript
//original document
{ _id: 1, configKey: "app", theme: "light", lang: "zh", notifications: true }

//❌ Danger - lang and notifications will be lost
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  { configKey: "app", theme: "dark" }
);
//Result: { _id: 1, configKey: "app", theme: "dark" }

//✅ Correct - full documentation provided
await collection("configs").findOneAndReplace(
  { configKey: "app" },
  {
    configKey: "app",
    theme: "dark",
    lang: "zh",
    notifications: true
  }
);
```

## Performance recommendations


## 1. Use index

```javascript
//✅ Recommended - Index on filter fields
await collection("configs").findOneAndReplace(
  { configKey: "app-settings" }, //configKey should have a unique index
  newConfig
);
```


## 2. Use projection to reduce data transmission

```javascript
const oldConfig = await collection("configs").findOneAndReplace(
  { configKey: "app-settings" },
  newConfig,
  {
    projection: { _id: 0, version: 1, updatedAt: 1 }
  }
);
//Only return required fields
```

## Concurrency safety


## Security Example

```javascript
//✅ Safe - Atomic operation, only one of multiple concurrent requests succeeds
const results = await Promise.all([
  collection("locks").findOneAndReplace(
    { lockKey: "lock1", available: true },
    { lockKey: "lock1", available: false, owner: "w1" }
  ),
  collection("locks").findOneAndReplace(
    { lockKey: "lock1", available: true },
    { lockKey: "lock1", available: false, owner: "w2" }
  )
]);

//Only one returns the document, the other returns null
const winner = results.find(r => r !== null);
console.log("Lock acquired by:", winner?.owner);
```

## Best Practices


## 1. Save historical versions

```javascript
async function replaceWithHistory(filter, replacement) {
  const oldDoc = await collection("documents").findOneAndReplace(
    filter,
    replacement
  );

  if (oldDoc) {
    //Save to history collection
    await collection("documents_history").insertOne({
      ...oldDoc,
      archivedAt: new Date()
    });
  }

  return oldDoc;
}
```


## 2. Use version number

```javascript
const oldConfig = await collection("configs").findOneAndReplace(
  {
    configKey: "app-settings",
    version: 1  //Make sure the versions match
  },
  {
    configKey: "app-settings",
    value: "new value",
    version: 2
  }
);

if (!oldConfig) {
  console.log("Version mismatch or not found");
}
```


## 3. Verification results

```javascript
const result = await collection("configs").findOneAndReplace(
  { configKey: "app-settings" },
  newConfig,
  { returnDocument: "after" }
);

if (!result) {
  console.log("Config not found, consider upsert");
} else {
  console.log("Config replaced successfully");
}
```

## When to use


## ✅ Suitable for use findOneAndReplace

1. **Old value required** - You need to view the original document before replacing
2. **Atomic Operations** - Prevent race conditions
3. **Configuration Management** - complete replacement configuration
4. **State Machine** - complete state switching


## ❌ Not suitable for use with findOneAndReplace

1. **Partial Update** - Use `findOneAndUpdate`
2. **Old value not required** - use `replaceOne`
3. **RESERVED FIELD** - Use `findOneAndUpdate`

## Related methods

- [`findOneAndUpdate()`](./find-one-and-update.md) - atomically find and partially update
- [`replaceOne()`](./replace-one.md) - complete replacement of a single document
- [`findOne()`](./findOne.md) - Find a single document

## References

- [MongoDB findOneAndReplace documentation](https://docs.mongodb.com/manual/reference/method/db.collection.findOneAndReplace/)

