# findOneAndUpdate() - Atomic find and update

## Syntax

```javascript
collection(collectionName).findOneAndUpdate(filter, update, options)
```

## Parameters


## filter (Object, required)
Filter criteria.


## update (Object, required)
For update operations, the update operator must be used.


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
| `arrayFilters` | Array | - | Array filter |
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
> monSQLize uses MongoDB Node.js driver 6.x, which makes important changes to the return value format of `findOneAndUpdate`:
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
//✅ Atomic operations - lookups and updates in the same transaction
const oldDoc = await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } }
);

//❌ Non-atomic - Risk of race conditions
const doc = await collection("counters").findOne({ counterName: "orderNumber" });
await collection("counters").updateOne(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } }
);
```


## returnDocument option

```javascript
//Return the document before updating (default)
const oldDoc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { loginCount: 1 } }
);
console.log("Old count:", oldDoc.loginCount); // 5

//Return updated document
const newDoc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { loginCount: 1 } },
  { returnDocument: "after" }
);
console.log("New count:", newDoc.loginCount); // 6
```

## Common scenarios


## Scenario 1: Distributed counter

```javascript
//Atomic increment and get new value
const counter = await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" },
  { $inc: { value: 1 } },
  { returnDocument: "after" }
);

const newOrderNumber = counter.value; // 1001
console.log(`New order number: ${newOrderNumber}`);
```


## Scenario 2: Optimistic locking (version control)

```javascript
//Use version numbers to prevent concurrency conflicts
const doc = await collection("documents").findOneAndUpdate(
  {
    docId: "doc1",
    version: 5  //Only update if version numbers match
  },
  {
    $set: { content: "Updated content" },
    $inc: { version: 1 }
  },
  { returnDocument: "after" }
);

if (!doc) {
  console.log("Update failed: version conflict");
} else {
  console.log("Update successful, new version:", doc.version);
}
```


## Scenario 3: Task Queue

```javascript
//Atomicly get and mark tasks
const task = await collection("tasks").findOneAndUpdate(
  { status: "pending" },
  {
    $set: {
      status: "processing",
      workerId: "worker-1",
      startedAt: new Date()
    }
  },
  {
    sort: { priority: -1 },  //highest priority
    returnDocument: "after"
  }
);

if (task) {
  console.log("Processing task:", task.taskId);
  //Processing tasks...
} else {
  console.log("No pending tasks");
}
```


## Scenario 4: Distributed lock

```javascript
//Get lock
const lock = await collection("locks").findOneAndUpdate(
  {
    lockKey: "resource-lock",
    locked: false
  },
  {
    $set: {
      locked: true,
      ownerId: "worker-1",
      acquiredAt: new Date()
    }
  },
  { returnDocument: "after" }
);

if (lock) {
  try {
    //Perform operations that require lock protection...
    console.log("Lock acquired");
  } finally {
    //release lock
    await collection("locks").updateOne(
      { lockKey: "resource-lock" },
      { $set: { locked: false } }
    );
  }
} else {
  console.log("Lock already held");
}
```


## Scenario 5: User’s last activity time

```javascript
//Update activity time and return user information
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastActiveAt: new Date() },
    $inc: { pageViews: 1 }
  },
  {
    projection: { name: 1, email: 1, lastActiveAt: 1 },
    returnDocument: "after"
  }
);

console.log(`Welcome back, ${user.name}!`);
```

## Example


## Basic usage

```javascript
const oldDoc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { status: "active" } }
);

if (oldDoc) {
  console.log("Old status:", oldDoc.status);
} else {
  console.log("User not found");
}
```


## Use sorting

```javascript
//Find the user with the highest score and update
const topUser = await collection("users").findOneAndUpdate(
  { status: "active" },
  { $set: { winner: true } },
  {
    sort: { score: -1 },
    returnDocument: "after"
  }
);
```


## Use projection

```javascript
//Only return required fields
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { loginCount: 1 } },
  {
    projection: { name: 1, loginCount: 1 },
    returnDocument: "after"
  }
);
//user only contains _id, name, loginCount
```


## Use upsert (insert if it does not exist, update if it exists) ⭐

```javascript
//Basic Usage: Counter Example
const counter = await collection("counters").findOneAndUpdate(
  { counterName: "pageViews" },
  { $inc: { value: 1 } },
  {
    upsert: true,
    returnDocument: "after"
  }
);
//Create a new document if it does not exist
```


### Upsert detailed description

Combination of **upsert = update + insert**:
- ✅ **EXISTS**: Perform update operation
- ✅ **Does not exist**: Insert new document

**Usage Scenario**:

```javascript
//Scenario 1: User configuration (create default configuration if it does not exist)
const userConfig = await collection("user_configs").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      theme: "dark",
      language: "zh-CN",
      updatedAt: new Date()
    },
    $setOnInsert: {
      //Set only on insert
      createdAt: new Date(),
      defaultSettings: true
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

//Scenario 2: Statistics (automatic initialization)
const stats = await collection("daily_stats").findOneAndUpdate(
  {
    date: "2026-01-28",
    userId: "user123"
  },
  {
    $inc: { pageViews: 1, loginCount: 1 }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
//Will be created if it does not exist: { date: "2026-01-28", userId: "user123", pageViews: 1, loginCount: 1 }

//Scenario 3: Cache update (cache new data if it does not exist)
const cache = await collection("cache").findOneAndUpdate(
  { key: "user:profile:123" },
  {
    $set: {
      value: profileData,
      expireAt: new Date(Date.now() + 3600000) //Expires in 1 hour
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

//Scenario 4: Product inventory (automatically create inventory records)
const inventory = await collection("inventory").findOneAndUpdate(
  { productId: "prod-456" },
  {
    $inc: { quantity: -1 },  //Reduce inventory
    $set: { lastUpdated: new Date() }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
```

**⚠️Upsert Notes**:

```javascript
//❌ Error: using $setOnInsert but forgetting upsert
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $setOnInsert: { createdAt: new Date() } }
  //Without upsert: true, $setOnInsert will not take effect
);

//✅ Correct: use both $set and $setOnInsert
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastLogin: new Date() },        //Update every time
    $setOnInsert: { createdAt: new Date() } //Set only when inserting
  },
  { upsert: true }
);

//✅ Correct: Get the _id of upsert
const result = await collection("users").findOneAndUpdate(
  { email: "new@example.com" },
  { $set: { name: "New User" } },
  {
    upsert: true,
    returnDocument: "after",
    includeResultMetadata: true
  }
);

if (result.lastErrorObject.upserted) {
  console.log("New document created, _id:", result.lastErrorObject.upserted);
} else {
  console.log("Updated existing documentation");
}
```


## Get complete metadata

```javascript
const result = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { status: "active" } },
  { includeResultMetadata: true }
);

console.log("Document:", result.value);
console.log("Updated existing:", result.lastErrorObject.updatedExisting);
console.log("Operation ok:", result.ok);
```

## Performance optimization


## 1. Use index

```javascript
//✅ Recommended - Index on filter fields
await collection("counters").findOneAndUpdate(
  { counterName: "orderNumber" }, //counterName should have an index
  { $inc: { value: 1 } }
);
```


## 2. Use projection to reduce data transmission

```javascript
//✅ Recommended - only return required fields
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { score: 10 } },
  {
    projection: { _id: 0, score: 1 },
    returnDocument: "after"
  }
);
```


## 3. Optimize queries with sort and hint

```javascript
const task = await collection("tasks").findOneAndUpdate(
  { status: "pending" },
  { $set: { status: "processing" } },
  {
    sort: { priority: -1, createdAt: 1 },
    hint: "status_priority_createdAt_idx", //Use composite index
    returnDocument: "after"
  }
);
```

## Error handling

```javascript
try {
  const doc = await collection("users").findOneAndUpdate(
    { userId: "user123" },
    { $inc: { score: 10 } }
  );

  if (!doc) {
    console.log("Document not found");
  }
} catch (err) {
  if (err.code === "INVALID_ARGUMENT") {
    console.error("Parameter error:", err.message);
  } else if (err.code === "DUPLICATE_KEY") {
    console.error("Unique constraint violation:", err.message);
  } else {
    console.error("Operation failed:", err);
  }
}
```

## Comparison with other methods

| Method | Atomicity | Return value | Scenario |
|------|--------|--------|------|
| `updateOne` | ❌ | Count | Normal update |
| `findOneAndUpdate` | ✅ | Documentation | Requires old value/atomic operation |
| `findOne` + `updateOne` | ❌ | Document + Count | ⚠️ There is a race risk |

## Concurrency safety


## Security Example

```javascript
//✅ Safe - Atomic operations
for (let i = 0; i < 10; i++) {
  await collection("counters").findOneAndUpdate(
    { name: "total" },
    { $inc: { value: 1 } }
  );
}
//final value = 10 (correct)

//❌ Unsafe - non-atomic operation
for (let i = 0; i < 10; i++) {
  const doc = await collection("counters").findOne({ name: "total" });
  await collection("counters").updateOne(
    { name: "total" },
    { $set: { value: doc.value + 1 } }
  );
}
//final value may < 10 (error, race condition)
```

## Best Practices


## 1. Reasonable choice of returnDocument

```javascript
//When old value is needed
const oldValue = await collection("counters").findOneAndUpdate(
  { name: "counter" },
  { $inc: { value: 1 } }
  //returnDocument: "before" is the default value
);

//When new values are needed
const newValue = await collection("counters").findOneAndUpdate(
  { name: "counter" },
  { $inc: { value: 1 } },
  { returnDocument: "after" }
);
```


## 2. Use version numbers to avoid conflicts

```javascript
async function updateWithRetry(docId, newContent, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const doc = await collection("documents").findOne({ docId });

    const result = await collection("documents").findOneAndUpdate(
      { docId, version: doc.version },
      {
        $set: { content: newContent },
        $inc: { version: 1 }
      },
      { returnDocument: "after" }
    );

    if (result) return result;

    console.log(`Retry ${i + 1}: version conflict`);
  }

  throw new Error("Update failed after retries");
}
```


## 3. Use projection to optimize performance

```javascript
//✅ Recommended
const user = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $inc: { score: 10 } },
  {
    projection: { score: 1 },
    returnDocument: "after"
  }
);
```

## Related methods

- [`findOneAndReplace()`](./find-one-and-replace.md) - find and replace atomically
- [`updateOne()`](./update-one.md) - Update a single document
- [`findOne()`](./findOne.md) - Find a single document

## References

- [MongoDB findOneAndUpdate Documentation](https://docs.mongodb.com/manual/reference/method/db.collection.findOneAndUpdate/)
