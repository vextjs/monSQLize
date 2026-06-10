# ✅ Implement "insert if it does not exist, update if it exists"

## 🎯 Quick Answer


## Scenario 1: Insert and update using **same data** (most common) ⭐

If the data is exactly the same when inserting and updating, only `$set` is needed:

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },              //Query conditions
  {
    $set: {
      name: "Alice",
      age: 25,
      email: "alice@example.com"
    }
  },
  {
    upsert: true,                      //🔑 Key option: insert if not present
    returnDocument: "after"            //Return the updated/inserted document
  }
);

console.log(doc); //Returns the complete document object
```

**Description**:
- ✅ When does not exist: Create a new document containing all fields in `$set`
- ✅ When exists: Update the existing document and only modify the fields in `$set`
- ✅ **This is the most commonly used method**, simple and direct

---


## Scenario 2: Insert and update using **different data**

If you need to set some **extra fields** when inserting (such as `createdAt`), use `$setOnInsert`:

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },              //Query conditions
  {
    $set: {
      name: "Alice",
      age: 25,
      updatedAt: new Date()           //Update every time
    },
    $setOnInsert: {
      createdAt: new Date(),          //Set only on insert
      role: "user"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);
```

**Description**:
- ✅ When it does not exist: Create a new document containing all fields of `$set` + `$setOnInsert`
- ✅ When existing: only update the fields in `$set`, **will not modify** the fields in `$setOnInsert`

---


## 📊 Comparison of two scenarios

| Comparison items | Scenario 1: Same data | Scenario 2: Different data |
|--------|----------------|----------------|
| **Usage scenarios** | The same data is used for both inserting and updating | Additional fields need to be set when inserting |
| **Operator** | Just `$set` | `$set` + `$setOnInsert` |
| **Typical example** | Product information synchronization, status update | User configuration (`createdAt` needs to be recorded) |
| **When it does not exist** | Create a document containing the fields of `$set` | Create a document containing the fields of `$set` + `$setOnInsert` |
| **When exists** | Update the fields of `$set` | Only update `$set`, do not change `$setOnInsert` |
| **Recommendation** | ⭐⭐⭐⭐⭐ Most commonly used | ⭐⭐⭐⭐ Used for special needs |

**Selection Suggestions**:
- ✅ **Use scenario 1** in most cases (only use `$set`)
- ✅ Use scenario 2 only if you need to distinguish between "fields when inserting" and "fields when updating"

---

## 📋 Complete example


## Example 1: Same data - product information update ⭐

```javascript
//Synchronize product information (use the same data for both inserts and updates)
const product = await collection("products").findOneAndUpdate(
  { productId: "prod-123" },
  {
    $set: {
      name: "iPhone 15",
      price: 5999,
      stock: 100,
      category: "Electronics",
      lastSync: new Date()
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

//When it does not exist: Create a new product, including all fields
//When present: update all fields to the latest values
```


## Example 2: Same data - user status update

```javascript
//Update user online status (both insert and update have the same logic)
const userStatus = await collection("user_status").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      status: "online",
      lastSeen: new Date(),
      device: "mobile"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

//Regardless of whether the user status record exists, it is set to the latest status.
```


## Example 3: Different Data - User Configuration Management


## Example 3: Different Data - User Profile Management (Full Example)

```javascript
//Save user preferences (need to set defaults when inserting)
const userConfig = await collection("user_configs").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: {
      theme: "dark",           //Update every time
      language: "zh-CN",
      updatedAt: new Date()
    },
    $setOnInsert: {
      createdAt: new Date(),   //Set only on insert
      defaultSettings: true,
      role: "user"
    }
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

//When not present: create a new configuration containing all fields of $set + $setOnInsert
//When present: only update fields in $set, retain createdAt and role
```


## Example 4: Statistics - Counters

```javascript
//Page visit statistics (automatic initialization counter)
const stats = await collection("page_stats").findOneAndUpdate(
  {
    page: "/home",
    date: "2026-01-28"
  },
  {
    $inc: { views: 1 }  //When it does not exist, it is automatically initialized to 0 and then added to 1.
  },
  {
    upsert: true,
    returnDocument: "after"
  }
);

console.log("Today’s visits:", stats.views);
```

---

## 🔍 Determine whether it is a new insertion

```javascript
const result = await collection("users").findOneAndUpdate(
  { email: "new@example.com" },
  { $set: { name: "New User" } },
  {
    upsert: true,
    returnDocument: "after",
    includeResultMetadata: true  //🔑 Get complete metadata
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

## 📚 Other methods to support Upsert

| Method | Return value | Recommendation |
|------|--------|--------|
| **`findOneAndUpdate()`** | Document Object | ⭐⭐⭐⭐⭐ Recommended |
| `updateOne()` | Operation Statistics | ⭐⭐⭐⭐ |
| `updateMany()` | Operation statistics | ⭐⭐⭐ |
| `replaceOne()` | Operation statistics | ⭐⭐ |


## `updateOne()` Example

If you do not need to return the document content, you can use `updateOne()` (better performance):

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

## ⚠️ IMPORTANT NOTES


## 1. The update operator must be used

```javascript
//❌ Error
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { name: "Alice" },  //Error! missing operator
  { upsert: true }
);

//✅ Correct
await collection("users").findOneAndUpdate(
  { userId: "user123" },
  { $set: { name: "Alice" } },  //Use $set
  { upsert: true }
);
```


## 2. `$setOnInsert` only takes effect when inserted

```javascript
const doc = await collection("users").findOneAndUpdate(
  { userId: "user123" },
  {
    $set: { lastLogin: new Date() },        //Update every time
    $setOnInsert: { createdAt: new Date() } //Set only on insert
  },
  { upsert: true }
);

//First execution (insert):
//   { userId: "user123", lastLogin: <now>, createdAt: <now> }
//Second execution (update):
//{ userId: "user123", lastLogin: <now>, createdAt: <first time> }
```

---

## 📖 Detailed documentation

- **[Complete Guide to Upsert Operations](./upsert-guide.md)** - Contains all scenarios and best practices
- **[findOneAndUpdate() documentation](./find-one-and-update.md)** - Detailed API description
- **[updateOne() documentation](./update-one.md)** - Alternative for simple scenarios

---

**Date**: 2026-01-28
**Version**: v1.1.2
