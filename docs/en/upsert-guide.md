# Upsert operation guide - insert if it does not exist, update if it exists

## 📋 Quick Answer

**To implement "insert if it does not exist, update if it exists" use the following method**:


## ⭐ Recommended method: `findOneAndUpdate()` + `upsert: true`

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },              //Query conditions
  {
    $set: { name: "Alice", age: 25 },  //update operation
    $setOnInsert: { createdAt: new Date() }  //Set only when inserting
  },
  {
    upsert: true,                      //🔑 Key options
    returnDocument: "after"            //Return the updated/inserted document
  }
);
```

---

## 🎯 All methods that support Upsert

| Method | Return value | Applicable scenarios | Recommendation |
|------|--------|---------|--------|
| **`findOneAndUpdate()`** | Document object | Need to return document content | ⭐⭐⭐⭐⭐ |
| **`updateOne()`** | Operation result statistics | Just need to know whether it was successful | ⭐⭐⭐⭐ |
| **`updateMany()`** | Operation result statistics | Update all matches; insert one document if none match | ⭐⭐⭐ |
| **`replaceOne()`** | Operation result statistics | Replace the entire document | ⭐⭐ |

---

## 💡 Detailed usage

> **About `updateMany()` upsert**: MongoDB supports `updateMany(filter, update, { upsert: true })`, but the no-match branch inserts a single document derived from `filter` and `update`. It is not a per-input bulk upsert. For many independent keys, prefer repeated `upsertOne()` calls or native `bulkWrite` `updateOne` operations with `upsert: true`.


## 1. `findOneAndUpdate()` - Recommended ⭐⭐⭐⭐⭐

**Advantages**:
- ✅ Atomic operations
- ✅ Return to document content
- ✅ Can get the inserted _id
- ✅ Support `$setOnInsert`

**Basic Usage**:

```javascript
const result = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      name: "Alice",
      lastLogin: new Date()
    },
    $setOnInsert: {
      createdAt: new Date(),
      role: "user"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

console.log("Documentation:", result);
```

**Get whether it is a new insertion**:

```javascript
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
  console.log("✅ New document created");
  console.log("new_id:", result.lastErrorObject.upserted);
} else {
  console.log("✅ Updated existing documentation");
}

console.log("Document content:", result.value);
```

---


## 2. `updateOne()` - Simple scene ⭐⭐⭐⭐

**Advantages**:
- ✅ Good performance (does not return documents)
- ✅ Return to operation statistics

**Basic Usage**:

```javascript
const result = await collection("users").updateOne(
  { userId: "user123" },
  {
    $set: { name: "Alice" },
    $setOnInsert: { createdAt: new Date() }
  },
  { upsert: true }
);

console.log("Match quantity:", result.matchedCount);
console.log("Modification quantity:", result.modifiedCount);
console.log("Insert quantity:", result.upsertedCount);

if (result.upsertedCount > 0) {
  console.log("Newly inserted _id:", result.upsertedId);
}
```

---


## 3. `replaceOne()` - Replace the entire document ⭐⭐

**Advantages**:
- ✅ Completely replace the document (without using the update operator)

**Usage**:

```javascript
const newDoc = {
  userId: "user123",
  name: "Alice",
  age: 25,
  email: "alice@example.com"
};

const result = await collection("users").replaceOne(
  { userId: "user123" },
  newDoc,
  { upsert: true }
);

if (result.upsertedCount > 0) {
  console.log("New document created");
} else {
  console.log("Replaced existing document");
}
```

---

## 🎯 Common usage scenarios


## Scenario 1: User configuration

```javascript
//Save user preferences
const config = await collection("user_configs").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      theme: "dark",
      language: "zh-CN",
      updatedAt: new Date()
    },
    $setOnInsert: {
      createdAt: new Date()
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
```


## Scenario 2: Counter

```javascript
//Page visit statistics
const stats = await collection("page_stats").findOneAndUpdate(
  { page: "/home", date: "2026-01-28" },
  {
    $inc: { views: 1 }  //Automatically initialized to 0 plus 1
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

console.log("Today’s visits:", stats.views);
```


## Scenario 3: Product inventory

```javascript
//Deduct inventory (automatically create inventory records)
const inventory = await collection("inventory").findOneAndUpdate(
  { productId: "prod-456", warehouseId: "wh-01" },
  {
    $inc: { quantity: -1 },
    $set: { lastUpdated: new Date() },
    $setOnInsert: {
      productName: "iPhone 15",
      minStock: 10
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

if (inventory.quantity < inventory.minStock) {
  console.log("⚠️ Insufficient stock, need to restock");
}
```


## Scenario 4: Cache Management

```javascript
//Caching user data
const cache = await collection("cache").findOneAndUpdate(
  { key: "user:profile:123" },
  {
    $set: {
      value: userData,
      expireAt: new Date(Date.now() + 3600000) //Expires in 1 hour
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
```


## Scenario 5: Daily check-in

```javascript
//User sign-in (prevent repeated sign-in)
const checkin = await collection("checkins").findOneAndUpdate(
  {
    userId: "user123",
    date: "2026-01-28"
  },
  {
    $setOnInsert: {
      userId: "user123",
      date: "2026-01-28",
      checkedAt: new Date(),
      points: 10  //Sign-in bonus points
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

if (checkin.checkedAt.toDateString() === new Date().toDateString()) {
  console.log("✅ Sign in successfully! Earn 10 points");
} else {
  console.log("❌ Already signed in today");
}
```

---

## ⚠️ IMPORTANT NOTES


## 1. The update operator must be used

```javascript
//❌ Error: The object cannot be passed directly (an error will be reported)
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { name: "Alice", age: 25 },  //Error!
  { upsert: true }
);

//✅ Correct: use $set
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { name: "Alice", age: 25 } },
  { upsert: true }
);
```


## 2. Use of `$setOnInsert`

`$setOnInsert` only takes effect when inserting a new document:

```javascript
const result = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastLogin: new Date() },        //Update every time
    $setOnInsert: { createdAt: new Date() } //Set only when inserting
  },
  { upsert: true }
);

//First execution (insert):
// { userId: "user123", lastLogin: <now>, createdAt: <now> }

//Second execution (update):
//{ userId: "user123", lastLogin: <now>, createdAt: <first time> }
```


## 3. Unique index conflict

```javascript
//upsert may fail if there is a unique index
try {
  const result = await collection("users").updateOne(
    { userId: "user123" },
    {
      $set: {
        email: "alice@example.com"  //If email has a unique index and exists
      }
    },
    { upsert: true }
  );
} catch (err) {
  if (err.code === 11000) {
    console.error("Unique constraint violation:", err.message);
  }
}
```

---

## 📊 Performance comparison

| Method | Performance | Return data amount | Applicable scenarios |
|------|------|-----------|---------|
| `updateOne()` + upsert | ⭐⭐⭐⭐⭐ | Small (only returns statistics) | No document content required |
| `findOneAndUpdate()` + upsert | ⭐⭐⭐⭐ | Large (return to full document) | Document content required |
| `replaceOne()` + upsert | ⭐⭐⭐ | Small | Replace entire document |

---

## 🎯 Best Practices


## 1. Prioritize the use of `findOneAndUpdate()`

Recommended in most cases because:
- Can obtain document content
- Support `$setOnInsert`
- Atomic operation guaranteed


## 2. Use `updateOne()` in performance optimization scenarios

If you just need to know if it was successful:

```javascript
const result = await collection("stats").updateOne(
  { key: "pageViews" },
  { $inc: { value: 1 } },
  { upsert: true }
);

if (result.upsertedCount > 0) {
  console.log("New document created");
}
```


## 3. Create appropriate indexes

```javascript
//Create a unique index on the query condition field
await collection("users").createIndex(
  { userId: 1 },
  { unique: true }
);

//and then safely upsert
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { name: "Alice" } },
  { upsert: true }
);
```

---

## 📚 Related documents

- [findOneAndUpdate() detailed documentation](./find-one-and-update.md)
- [updateOne() detailed documentation](./update-one.md)
- [replaceOne() detailed documentation](./replace-one.md)
- [MongoDB Upsert official document](https://docs.mongodb.com/manual/reference/method/db.collection.update/#upsert-option)

---

**Version**: v1.1.2
**Last updated**: 2026-01-28
