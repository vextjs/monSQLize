# incrementOne() - Atomic increment/decrement field value

## Table of Contents

- [Method overview](#method-overview)
- [Why is incrementOne needed?](#why-is-incrementone-needed)
- [Core Advantages](#core-advantages)
- [Method signature](#method-signature)
- [Parameter description](#parameter-description)
- [Basic example](#basic-example)
- [Example 1: Increment (default +1)](#example-1-increment-default-1)
- [Example 2: Specify increment](#example-2-specify-increment)
- [Example 3: Decrement (negative number)](#example-3-decrement-negative-number)
- [Example 4: Simultaneous operation of multiple fields](#example-4-simultaneous-operation-of-multiple-fields)
- [Example 5: Return updated document](#example-5-return-updated-document)
- [Real scene example](#real-scene-example)
- [Scenario 1: Statistics of login times](#scenario-1-statistics-of-login-times)
- [Scenario 2: Points System](#scenario-2-points-system)
- [Scenario 3: Article views](#scenario-3-article-views)
- [Scenario 4: Inventory Management](#scenario-4-inventory-management)
- [Scenario 5: Multi-dimensional statistics](#scenario-5-multi-dimensional-statistics)
- [Detailed explanation of option parameters](#detailed-explanation-of-option-parameters)
- [returnDocument - return timing](#returndocument-return-timing)
- [projection - field projection](#projection-field-projection)
- [Performance Notes](#performance-notes)
- [Atomic guarantee](#atomic-guarantee)
- [Performance comparison](#performance-comparison)
- [Error handling](#error-handling)
- [Error type](#error-type)
- [Error handling example](#error-handling-example)
- [Best Practices](#best-practices)
- [✅ Recommended practices](#recommended-practices)
- [❌ Things to avoid](#things-to-avoid)
- [Compare with other methods](#compare-with-other-methods)
- [vs updateOne({ $inc })](#vs-updateone-inc)
- [FAQ](#faq)
- [Q1: What is the difference between incrementOne and updateOne?](#q1-what-is-the-difference-between-incrementone-and-updateone)
- [Q2: Does it support concurrency?](#q2-does-it-support-concurrency)
- [Q3: Can it be reduced?](#q3-can-it-be-reduced)
- [Q4: What happens when the field does not exist?](#q4-what-happens-when-the-field-does-not-exist)
- [Q5: How to operate multiple fields at the same time?](#q5-how-to-operate-multiple-fields-at-the-same-time)
- [See also](#see-also)

## Method overview

`incrementOne` is a convenience method for atomically incrementing or decrementing a field value in a single document, simplifying the use of `updateOne({ $inc })`.


## Why is incrementOne needed?

**Traditional way** (using `updateOne`):
```javascript
//❌ Need to build $inc update object
await collection('users').updateOne(
  { userId: 'user123' },
  { $inc: { loginCount: 1 } }
);
```

**Use incrementOne**:
```javascript
//✅ More concise and intuitive
await collection('users').incrementOne(
  { userId: 'user123' },
  'loginCount'
);
```


## Core Advantages

| Advantages | Description |
|------|------|
| **Atomic operations** | Concurrency safety, no race conditions |
| **Code simplicity** | Reduce boilerplate code by 60% |
| **Intuitive and easy to read** | Clear semantics |
| **return result** | optionally return the document before/after update |

---

## Method signature

```typescript
async incrementOne(
  filter: Object,
  field: string | Object,
  increment?: number,
  options?: {
    returnDocument?: 'before' | 'after',
    projection?: Object,
    maxTimeMS?: number,
    comment?: string
  }
): Promise<IncrementOneResult>

interface IncrementOneResult {
  acknowledged: boolean;
  matchedCount: number;
  modifiedCount: number;
  value: Document | null;  //Document after (or before) update
}
```


## Parameter description

| Parameters | Type | Required | Description |
|------|------|------|------|
| `filter` | Object | ✅ | Query conditions |
| `field` | string \| Object | ✅ | Field name (single field) or field-increment object (multiple fields) |
| `increment` | number | ❌ | Increment (default 1, negative number means decrease) |
| `options` | Object | ❌ | Operation Options |
| `options.returnDocument` | string | ❌ | Return timing ('before' \| 'after', default 'after') |
| `options.projection` | Object | ❌ | Field Projection |
| `options.maxTimeMS` | number | ❌ | Operation timeout (milliseconds) |
| `options.comment` | string | ❌ | Query comments |

---

## Basic example


## Example 1: Increment (default +1)

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  'loginCount'
);
//loginCount increments by 1
```


## Example 2: Specify increment

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  'points',
  50
);
//points increased by 50
```


## Example 3: Decrement (negative number)

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  'credits',
  -30
);
//credits reduced by 30
```


## Example 4: Simultaneous operation of multiple fields

```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  {
    loginCount: 1,    // +1
    points: 20,       // +20
    credits: -10      // -10
  }
);
```


## Example 5: Return updated document

```javascript
const result = await collection('users').incrementOne(
  { userId: 'user123' },
  'points',
  50
);

console.log(result.value.points);  //updated value
```

---

## Real scene example


## Scenario 1: Statistics of login times

```javascript
async function recordLogin(userId) {
  const result = await collection('users').incrementOne(
    { userId },
    'loginCount'
  );

  console.log(`Number of user logins: ${result.value.loginCount}`);
  return result;
}
```


## Scenario 2: Points System

```javascript
//Complete tasks and earn points
async function earnPoints(userId, points) {
  const result = await collection('users').incrementOne(
    { userId },
    'points',
    points
  );

  console.log(`Current points: ${result.value.points}`);
  return result;
}

//Redeem goods and deduct points
async function spendPoints(userId, points) {
  const result = await collection('users').incrementOne(
    { userId },
    'points',
    -points
  );

  if (result.value.points < 0) {
    throw new Error('Not enough points');
  }

  return result;
}
```


## Scenario 3: Article views

```javascript
async function incrementViews(articleId) {
  await collection('articles').incrementOne(
    { articleId },
    'views'
  );
}
```


## Scenario 4: Inventory Management

```javascript
//Restock
async function addStock(productId, quantity) {
  const result = await collection('products').incrementOne(
    { productId },
    'stock',
    quantity
  );

  return result.value.stock;
}

//Ship
async function reduceStock(productId, quantity) {
  const result = await collection('products').incrementOne(
    { productId },
    'stock',
    -quantity,
    { returnDocument: 'before' }
  );

  //Check if there is enough stock
  if (result.value.stock < quantity) {
    throw new Error('Insufficient stock');
  }

  return result;
}
```


## Scenario 5: Multi-dimensional statistics

```javascript
async function recordArticleInteraction(articleId, action) {
  const increments = {};

  if (action === 'view') increments.views = 1;
  if (action === 'like') increments.likes = 1;
  if (action === 'share') increments.shares = 1;

  await collection('articles').incrementOne(
    { articleId },
    increments
  );
}
```

---

## Detailed explanation of option parameters


## returnDocument - return timing

```javascript
//Return updated document (default)
const result = await collection('users').incrementOne(
  { userId: 'user123' },
  'count',
  5,
  { returnDocument: 'after' }
);
console.log(result.value.count);  // 15

//Return to the document before update
const result2 = await collection('users').incrementOne(
  { userId: 'user123' },
  'count',
  5,
  { returnDocument: 'before' }
);
console.log(result2.value.count);  //10 (value before update)
```


## projection - field projection

```javascript
const result = await collection('users').incrementOne(
  { userId: 'user123' },
  'points',
  50,
  { projection: { points: 1, name: 1 } }
);
//Only return _id, points, name fields
```

---

## Performance Notes


## Atomic guarantee

`incrementOne` uses MongoDB’s `$inc` operator to ensure atomicity:
- ✅ Concurrency safety
- ✅ No race conditions
- ✅ No transactions required


## Performance comparison

| Method | Operation steps | Concurrency safety | Performance |
|------|---------|---------|------|
| **incrementOne** | 1 step (atomic) | ✅ | ⭐⭐⭐⭐⭐ |
| **find + update** | 2 steps (non-atomic) | ❌ | ⭐⭐⭐ |

---

## Error handling


## Error type

| Error type | Error code | Trigger condition |
|---------|--------|---------|
| **Parameter error** | `INVALID_ARGUMENT` | filter/field/increment is invalid |
| **Timeout Error** | `QUERY_TIMEOUT` | Exceeded maxTimeMS |


## Error handling example

```javascript
try {
  const result = await collection('users').incrementOne(
    { userId: 'user123' },
    'points',
    50
  );

  if (result.matchedCount === 0) {
    console.log('User does not exist');
  }
} catch (error) {
  if (error.code === 'INVALID_ARGUMENT') {
    console.error('Parameter error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

---

## Best Practices


## ✅ Recommended practices

1. **Use incrementOne instead of find + update**
   ```javascript
   //✅ Recommended: Atomic operations
   await collection('users').incrementOne(
     { userId: 'user123' },
     'count',
     1
   );

   //❌ Avoid: Non-atomic operations (race conditions)
   const user = await collection('users').findOne({ userId: 'user123' });
   await collection('users').updateOne(
     { userId: 'user123' },
     { $set: { count: user.count + 1 } }
   );
   ```

2. **Check return value**
   ```javascript
   const result = await collection('users').incrementOne(
     { userId: 'user123' },
     'points',
     50
   );

   if (result.matchedCount === 0) {
     throw new Error('User does not exist');
   }
   ```


## ❌ Things to avoid

1. **Avoid using in loops**
   ```javascript
   //❌ Avoid: N operations
   for (const userId of userIds) {
     await collection('users').incrementOne({ userId }, 'count');
   }

   //✅ Recommendation: use updateMany
   await collection('users').updateMany(
     { userId: { $in: userIds } },
     { $inc: { count: 1 } }
   );
   ```

---

## Compare with other methods


## vs updateOne({ $inc })

| dimensions | incrementOne | updateOne({ $inc }) |
|------|-------------|---------------------|
| **Lines of code** | 1-2 lines | 2-3 lines |
| **Readability** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Function** | Equivalent | Equivalent |

---

## FAQ


## Q1: What is the difference between incrementOne and updateOne?

**A**: `incrementOne` is a convenience method of `updateOne({ $inc })`, with clearer semantics and simpler code.


## Q2: Does it support concurrency?

**A**: ✅ Yes! `incrementOne` is an atomic operation and is concurrency safe.


## Q3: Can it be reduced?

**A**: ✅ Yes! Just use negative numbers:
```javascript
await collection('users').incrementOne({ userId: 'user123' }, 'credits', -10);
```


## Q4: What happens when the field does not exist?

**A**: MongoDB will automatically create fields, starting from 0 and increasing.


## Q5: How to operate multiple fields at the same time?

**A**: Use object form:
```javascript
await collection('users').incrementOne(
  { userId: 'user123' },
  { count: 1, points: 10 }
);
```

---

## See also

- [updateOne()](./update-one.md) - Update a single document
- [findOneAndUpdate()](./find-one-and-update.md) - Find and update
- [upsertOne()](./upsert-one.md) - Update if it exists, insert if it does not exist
- [MongoDB official documentation: $inc operator](https://www.mongodb.com/docs/manual/reference/operator/update/inc/)

