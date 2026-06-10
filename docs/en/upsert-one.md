# upsertOne() - update if it exists, insert if it does not exist

## Table of Contents

- [Method overview](#method-overview)
- [Why is upsertOne needed?](#why-is-upsertone-needed)
- [Core Advantages](#core-advantages)
- [Method signature](#method-signature)
- [Parameter description](#parameter-description)
- [Return value description](#return-value-description)
- [Basic example](#basic-example)
- [Example 1: Insert new document (document does not exist)](#example-1-insert-new-document-document-does-not-exist)
- [Example 2: Update an existing document](#example-2-update-an-existing-document)
- [Example 3: Using the update operator](#example-3-using-the-update-operator)
- [Real scene example](#real-scene-example)
- [Scenario 1: Configuration item synchronization](#scenario-1-configuration-item-synchronization)
- [Scenario 2: User profile update (make sure the record exists)](#scenario-2-user-profile-update-make-sure-the-record-exists)
- [Scenario 3: Counter initialization](#scenario-3-counter-initialization)
- [Scenario 4: Idempotent operation](#scenario-4-idempotent-operation)
- [Scenario 5: Session state management](#scenario-5-session-state-management)
- [Option parameters](#option-parameters)
- [maxTimeMS - Operation timeout](#maxtimems-operation-timeout)
- [comment - Query comments](#comment-query-comments)
- [Compare with other methods](#compare-with-other-methods)
- [vs updateOne({ upsert: true })](#vs-updateone-upsert-true)
- [vs insertOne / updateOne (called separately)](#vs-insertone-updateone-called-separately)
- [Error handling](#error-handling)
- [Error type](#error-type)
- [Error handling example](#error-handling-example)
- [Best Practices](#best-practices)
- [✅ Recommended practices](#recommended-practices)
- [❌ Things to avoid](#things-to-avoid)
- [Performance Notes](#performance-notes)
- [Performance characteristics](#performance-characteristics)
- [Performance optimization suggestions](#performance-optimization-suggestions)
- [FAQ](#faq)
- [Q1: What is the difference between upsertOne and updateOne?](#q1-what-is-the-difference-between-upsertone-and-updateone)
- [Q2: How to determine whether to insert or update?](#q2-how-to-determine-whether-to-insert-or-update)
- [Q3: Can I use the update operator?](#q3-can-i-use-the-update-operator)
- [Q4: Are concurrent calls safe?](#q4-are-concurrent-calls-safe)
- [Q5: How is the performance?](#q5-how-is-the-performance)
- [Q6: Does it support caching?](#q6-does-it-support-caching)
- [Q7: How to deal with unique key conflicts?](#q7-how-to-deal-with-unique-key-conflicts)
- [See also](#see-also)

## Method overview

`upsertOne` is a convenience method used to implement the logic of "update if it exists, insert if it does not exist", simplifying the use of `updateOne({ upsert: true })`.


## Why is upsertOne needed?

**Traditional way** (using `updateOne`):
```javascript
//❌ Need to remember the upsert option and must use $set
const result = await collection('users').updateOne(
  { userId: 'user123' },
  { $set: { name: 'Alice', email: 'alice@example.com' } },
  { upsert: true }  //easy to forget
);
```

**Use upsertOne**:
```javascript
//✅ Clear semantics, automatically enable upsert, no $set required
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', email: 'alice@example.com' }
);
```


## Core Advantages

| Advantages | Description |
|------|------|
| **Clear semantics** | The method name clearly expresses the intention of "update if it exists, insert if it does not exist" |
| **Automatic $set** | No need to manually wrap `$set` (but operator is still supported) |
| **Simplified Code** | 67% reduction in boilerplate code |
| **REDUCED ERRORS** | No need to remember the `upsert: true` option |

---

## Method signature

```typescript
async upsertOne(
  filter: Object,
  update: Object,
  options?: {
    maxTimeMS?: number,
    comment?: string
  }
): Promise<UpsertOneResult>

interface UpsertOneResult {
  acknowledged: boolean;      //Is the operation confirmed?
  matchedCount: number;        //Number of matching documents (0 or 1)
  modifiedCount: number;       //Number of modified documents (0 or 1)
  upsertedId?: ObjectId;       //Inserted document ID (only when inserting)
  upsertedCount: number;       //Number of documents inserted (0 or 1)
}
```


## Parameter description

| Parameters | Type | Required | Description |
|------|------|------|------|
| `filter` | Object | ✅ | Query conditions, used to match documents |
| `update` | Object | ✅ | Update content (direct field or operator) |
| `options` | Object | ❌ | Operation Options |
| `options.maxTimeMS` | number | ❌ | Operation timeout (milliseconds) |
| `options.comment` | string | ❌ | Query comments (for log tracking) |


## Return value description

| Field | Type | Description |
|------|------|------|
| `acknowledged` | boolean | Whether the operation is confirmed (usually `true`) |
| `matchedCount` | number | Number of matching documents (`0` = insert, `1` = update) |
| `modifiedCount` | number | Number of documents actually modified |
| `upsertedId` | ObjectId | Inserted document `_id` (exists only when inserted) |
| `upsertedCount` | number | Number of inserted documents (`0` or `1`) |

---

## Basic example


## Example 1: Insert new document (document does not exist)

```javascript
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', email: 'alice@example.com', age: 30 }
);

console.log(result);
// {
//   acknowledged: true,
//matchedCount: 0, // No document matched
//modifiedCount: 0, // No documents have been modified
//upsertedId: ObjectId('...'), // Newly inserted document ID
//upsertedCount: 1 // 1 document inserted
// }
```


## Example 2: Update an existing document

```javascript
//First call: insert
await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', age: 30 }
);

//Second call: update
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice Updated', age: 31 }
);

console.log(result);
// {
//   acknowledged: true,
//matchedCount: 1, // 1 document matched
//modifiedCount: 1, // 1 document modified
//upsertedId: undefined, // No new document inserted
//upsertedCount: 0 // not inserted
// }
```


## Example 3: Using the update operator

```javascript
//Support for MongoDB update operators
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  {
    $set: { name: 'Alice' },
    $inc: { loginCount: 1 },
    $currentDate: { lastLogin: true }
  }
);

//Equivalent to
const result2 = await collection('users').updateOne(
  { userId: 'user123' },
  {
    $set: { name: 'Alice' },
    $inc: { loginCount: 1 },
    $currentDate: { lastLogin: true }
  },
  { upsert: true }
);
```

---

## Real scene example


## Scenario 1: Configuration item synchronization

If it exists, update it; if it does not exist, create the configuration item.

```javascript
//Synchronize user theme configuration
async function syncThemeConfig(userId, theme) {
  const result = await collection('configs').upsertOne(
    { userId, key: 'theme' },
    {
      value: theme,
      updatedAt: new Date()
    }
  );

  if (result.upsertedCount > 0) {
    console.log('New configuration created');
  } else {
    console.log('Updated existing configuration');
  }

  return result;
}

//use
await syncThemeConfig('user123', 'dark');  //Create
await syncThemeConfig('user123', 'light'); //update
```


## Scenario 2: User profile update (make sure the record exists)

When logging in from a third party, ensure that the user record exists.

```javascript
//Update user information after OAuth login
async function updateUserProfile(oauthData) {
  const result = await collection('users').upsertOne(
    { oauthProvider: oauthData.provider, oauthId: oauthData.id },
    {
      name: oauthData.name,
      email: oauthData.email,
      avatar: oauthData.avatar,
      lastLogin: new Date()
    }
  );

  if (result.upsertedCount > 0) {
    console.log('New user registration successful');
    //Send welcome email
  } else {
    console.log('User information has been updated');
  }

  return result;
}

//use
await updateUserProfile({
  provider: 'google',
  id: 'google-user-123',
  name: 'Alice',
  email: 'alice@gmail.com',
  avatar: 'https://...'
});
```


## Scenario 3: Counter initialization

If it exists, it will be incremented, if it does not exist, it will be initialized.

```javascript
//Article views statistics
async function incrementViewCount(articleId) {
  const result = await collection('stats').upsertOne(
    { articleId },
    {
      $setOnInsert: { createdAt: new Date() },  //Set only when inserting
      $inc: { views: 1 },                        //Incremental views
      $currentDate: { lastViewedAt: true }       //Update last viewed time
    }
  );

  const doc = await collection('stats').findOne({ articleId });
  console.log(`Views of article ${articleId}: ${doc.views}`);

  return result;
}

//use
await incrementViewCount('article-1');  //Initialization: views = 1
await incrementViewCount('article-1');  //Increment: views = 2
await incrementViewCount('article-1');  //Increment: views = 3
```


## Scenario 4: Idempotent operation

Repeated calls to the API will not result in repeated insertions.

```javascript
//Submit order (prevent duplicate submission)
async function submitOrder(orderId, orderData) {
  try {
    const result = await collection('orders').upsertOne(
      { orderId },  //unique key
      {
        ...orderData,
        status: 'pending',
        createdAt: new Date()
      }
    );

    if (result.upsertedCount > 0) {
      console.log('Order created successfully');
      //Trigger subsequent processes (payment, notification, etc.)
    } else {
      console.log('Order already exists, skip creation');
    }

    return { success: true, orderId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

//Use (repeated calls will not create multiple orders)
await submitOrder('order-123', { amount: 100, userId: 'user1' });  //Create
await submitOrder('order-123', { amount: 100, userId: 'user1' });  //skip
```


## Scenario 5: Session state management

If it exists, refresh it; if it does not exist, create a session.

```javascript
//Update user session
async function updateSession(sessionId, userId) {
  const result = await collection('sessions').upsertOne(
    { sessionId },
    {
      userId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),  //Expires in 24 hours
      lastActive: new Date()
    }
  );

  return result;
}

//use
await updateSession('session-abc', 'user123');
```

---

## Option parameters


## maxTimeMS - Operation timeout

```javascript
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice' },
  { maxTimeMS: 5000 }  //up to 5 seconds
);
```


## comment - Query comments

Used for log tracing and performance analysis.

```javascript
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice' },
  { comment: 'UserAPI:syncProfile:session_abc123' }
);

//In the MongoDB logs you will see:
// { comment: 'UserAPI:syncProfile:session_abc123', ... }
```

---

## Compare with other methods


## vs updateOne({ upsert: true })

| dimensions | upsertOne | updateOne({ upsert: true }) |
|------|-----------|----------------------------|
| **Lines of code** | 1 line | 1 line (but options need to be remembered) |
| **Semantic Clarity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Auto $set** | ✅ Support | ❌ Must be done manually |
| **Error probability** | Low (no need to remember options) | Medium (easy to forget upsert: true) |
| **Functional Completeness** | ✅ Complete | ✅ Complete |

**Code comparison**:

```javascript
//upsertOne (recommended)
await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', age: 30 }
);

//updateOne (traditional way)
await collection('users').updateOne(
  { userId: 'user123' },
  { $set: { name: 'Alice', age: 30 } },
  { upsert: true }
);
```


## vs insertOne / updateOne (called separately)

| dimensions | upsertOne | insertOne + updateOne |
|------|-----------|-----------------------|
| **Lines of code** | 3 lines | 10+ lines |
| **Performance** | ⭐⭐⭐⭐⭐ (1 request) | ⭐⭐⭐ (2 requests) |
| **Atomic** | ✅ Atomic operations | ❌ Non-atomic (requires transaction) |
| **Concurrency Safety** | ✅ Safety | ⚠️ Possible Conflicts |

**Code comparison**:

```javascript
//upsertOne (1 request)
const result = await collection('users').upsertOne(
  { userId: 'user123' },
  { name: 'Alice', age: 30 }
);

//insertOne + updateOne (2 requests, non-atomic)
const existing = await collection('users').findOne({ userId: 'user123' });
if (existing) {
  await collection('users').updateOne(
    { userId: 'user123' },
    { $set: { name: 'Alice', age: 30 } }
  );
} else {
  await collection('users').insertOne({
    userId: 'user123',
    name: 'Alice',
    age: 30
  });
}
```

---

## Error handling


## Error type

| Error type | Error code | Trigger condition |
|---------|--------|---------|
| **Parameter error** | `INVALID_ARGUMENT` | Invalid filter or update |
| **Unique key conflict** | `DUPLICATE_KEY` | Unique index constraint violation |
| **Timeout Error** | `QUERY_TIMEOUT` | Exceeded maxTimeMS |


## Error handling example

```javascript
try {
  const result = await collection('users').upsertOne(
    { email: 'alice@example.com' },
    { name: 'Alice', age: 30 }
  );

  if (result.upsertedCount > 0) {
    console.log('New user created successfully');
  } else {
    console.log('User information has been updated');
  }
} catch (error) {
  if (error.code === 'DUPLICATE_KEY') {
    console.error('Unique key conflict:', error.message);
  } else if (error.code === 'INVALID_ARGUMENT') {
    console.error('Parameter error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Best Practices


## ✅ Recommended practices

1. **Use unique key as filter**
   ```javascript
   //✅ Use unique identifiers
   await collection('users').upsertOne(
     { userId: 'user123' },
     { name: 'Alice' }
   );
   ```

2. **Explicit insertion and update logic**
   ```javascript
   //✅ Use $setOnInsert to differentiate between inserts and updates
   await collection('stats').upsertOne(
     { articleId: 'article-1' },
     {
       $setOnInsert: { createdAt: new Date() },  //Only when inserting
       $inc: { views: 1 },                        //always execute
       $currentDate: { updatedAt: true }          //always execute
     }
   );
   ```

3. **Check the return value to determine the operation type**
   ```javascript
   //✅ Determine whether to insert or update based on upsertedCount
   const result = await collection('users').upsertOne(
     { userId: 'user123' },
     { name: 'Alice' }
   );

   if (result.upsertedCount > 0) {
     //Insert logic (send welcome email, etc.)
   } else {
     //Update logic (logging, etc.)
   }
   ```


## ❌ Things to avoid

1. **Avoid using non-unique filters**
   ```javascript
   //❌ filter may match multiple documents (but will only update the first one)
   await collection('users').upsertOne(
     { role: 'admin' },  //Not unique
     { permission: 'all' }
   );
   ```

2. **Avoid not controlling in high concurrency scenarios**
   ```javascript
   //❌ High concurrency may lead to unexpected behavior
   //Unique index constraints should be used
   await collection('users').upsertOne(
     { email: 'alice@example.com' },  //Make sure email has a unique index
     { name: 'Alice' }
   );
   ```

---

## Performance Notes


## Performance characteristics

| Dimensions | Performance | Description |
|------|------|------|
| **Operation time** | 10-50ms | Single atomic operation |
| **Index dependency** | High | The filter field should be indexed |
| **Concurrency Safety** | ✅ Security | MongoDB Atomic Operations |


## Performance optimization suggestions

1. **Create an index for the filter field**
   ```javascript
   //Create a unique index for userId
   await collection('users').createIndex(
     { userId: 1 },
     { unique: true }
   );
   ```

2. **Avoid large document upsert**
   ```javascript
   //❌Avoid
   await collection('users').upsertOne(
     { userId: 'user123' },
     { largeArray: Array(10000).fill({}) }  //large document
   );

   //✅ Recommended: Split storage
   await collection('users').upsertOne(
     { userId: 'user123' },
     { dataRef: 'ref-123' }
   );
   await collection('data').insertOne({
     _id: 'ref-123',
     data: Array(10000).fill({})
   });
   ```

---

## FAQ


## Q1: What is the difference between upsertOne and updateOne?

**A**: `upsertOne` is a convenience method for `updateOne({ upsert: true })`:
- ✅ Clearer semantics (method names clearly express intent)
- ✅ Automatic packaging `$set` (no need to add manually)
- ✅ Reduce the amount of code (no need to remember `upsert: true`)


## Q2: How to determine whether to insert or update?

**A**: Judged by the `upsertedCount` field of the return value:
```javascript
const result = await collection('users').upsertOne(...);

if (result.upsertedCount > 0) {
  console.log('New document inserted');
} else {
  console.log('Updated existing documentation');
}
```


## Q3: Can I use the update operator?

**A**: ✅ Yes! All MongoDB update operators are supported:
```javascript
await collection('users').upsertOne(
  { userId: 'user123' },
  {
    $set: { name: 'Alice' },
    $inc: { count: 1 },
    $push: { tags: 'new-tag' }
  }
);
```


## Q4: Are concurrent calls safe?

**A**: ✅ SAFE! `upsertOne` is an atomic operation in MongoDB and will not cause repeated insertions even if called concurrently. But it is recommended:
- Create a unique index for the filter field
- Use unique identifier as filter


## Q5: How is the performance?

**A**: The performance is the same as `updateOne` (the same underlying implementation is used):
- With index: 10-20ms
- No index: 50-100ms (full table scan required)

**Optimization suggestion**: Create an index for the filter field.


## Q6: Does it support caching?

**A**: ✅ Support! After the operation is successful, the relevant cache will be automatically invalidated.


## Q7: How to deal with unique key conflicts?

**A**: Use try-catch to catch `DUPLICATE_KEY` errors:
```javascript
try {
  await collection('users').upsertOne(
    { userId: 'user123' },
    { email: 'alice@example.com' }
  );
} catch (error) {
  if (error.code === 'DUPLICATE_KEY') {
    console.error('Email is already in use');
  }
}
```

---

## See also

- [updateOne()](./update-one.md) - Update a single document
- [insertOne()](./insert-one.md) - Insert a single document
- [findOneAndUpdate()](./find-one-and-update.md) - Find and update (return document)
- [MongoDB official documentation: upsert](https://www.mongodb.com/docs/manual/reference/method/db.collection.updateOne/#upsert-option)

