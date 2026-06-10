# Update operation details

> **Applicable version**: v1.0.8+
> **Last updated**: 2026-01-15

---

## 📋 Table of Contents

- [1. Overview](#1-overview)
- [2. Traditional update operator](#2-traditional-update-operator)
- [3. Aggregation pipeline update (v1.0.8+)](#3-aggregation-pipeline-update-v108)
- [4. Comparison of usage scenarios](#4-comparison-of-usage-scenarios)
- [5. Best Practices](#5-best-practices)
- [6. Performance considerations](#6-performance-considerations)
- [7. FAQ](#7-faq)

---

## 1. Overview

monSQLize provides three update methods:

| Method | Description | Aggregation pipeline support |
|------|------|-------------|
| `updateOne()` | Update a single matching document | ✅ v1.0.8+ |
| `updateMany()` | Update all matching documents | ✅ v1.0.8+ |
| `updateBatch()` | Update a large number of documents in batches | ✅ v1.0.8+ |

Starting from **v1.0.8**, all update methods support **aggregation pipeline** syntax, providing more powerful field calculation and conversion capabilities.

---

## 2. Traditional update operator


## 2.1 Common operators


### $set - Set field value

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $set: { name: 'Alice', age: 25 } }
);
```


### $unset - delete a field

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $unset: { tempField: '' } }
);
```


### $inc - increase/decrease value

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $inc: { loginCount: 1, balance: -100 } }
);
```


### $push - Add elements to an array

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $push: { tags: 'newTag' } }
);
```


### $pull - remove elements from an array

```javascript
await users.updateOne(
    { userId: 'user1' },
    { $pull: { tags: 'oldTag' } }
);
```


## 2.2 Combination use

```javascript
await users.updateOne(
    { userId: 'user1' },
    {
        $set: { status: 'active' },
        $inc: { loginCount: 1 },
        $push: { loginHistory: new Date() }
    }
);
```

---

## 3. Aggregation pipeline update (v1.0.8+)


## 3.1 Basic concepts

**What is an aggregation pipeline update? **

Aggregation pipeline updates allow you to use aggregate expressions in update operations, supporting:
- ✅ Calculation between fields (referencing other fields)
- ✅ Conditional expressions ($cond, $switch)
- ✅ Array operations ($arrayElemAt, $slice)
- ✅ String operations ($concat, $trim)
- ✅ Date calculation ($add, $subtract)
- ✅ Multi-stage conversion (multiple $set/$unset)

**MongoDB version requirements**: MongoDB 4.2+


## 3.2 Basic syntax

```javascript
await collection.updateOne(
    filter,      //filter(object)
    [            //✨ Aggregation pipeline (array)
        { $set: { field1: expression1 } },
        { $unset: ['field2'] },
        { $addFields: { field3: expression3 } }
    ],
    options      //Optional parameters
);
```


## 3.3 Supported operators

| Operator | Description | Example |
|--------|------|------|
| `$set` | Set field value | `{ $set: { total: { $add: ['$a', '$b'] } } }` |
| `$unset` | Delete field | `{ $unset: ['tempField'] }` |
| `$addFields` | Add field (alias of $set) | `{ $addFields: { computed: '$value' } }` |
| `$project` | Field projection | `{ $project: { name: 1, age: 1 } }` |
| `$replaceRoot` | Replace root document | `{ $replaceRoot: { newRoot: '$nested' } }` |
| `$replaceWith` | Replacement document (alias for $replaceRoot) | `{ $replaceWith: '$newDoc' }` |


## 3.4 Usage scenarios


### Scenario 1: Calculation between fields ⭐

**Demand**: Total order price = unit price × quantity + freight

```javascript
await orders.updateOne(
    { orderId: 'ORDER-123' },
    [
        {
            $set: {
                totalPrice: {
                    $add: [
                        { $multiply: ['$unitPrice', '$quantity'] },
                        '$shippingFee'
                    ]
                },
                updatedAt: new Date()
            }
        }
    ]
);
```

**Why use aggregation pipeline? **
- ✅Complete calculation in one operation
- ✅ Avoid querying first and then calculating
- ✅ Server-side computing, reducing network round-trips


### Scenario 2: Conditional assignment ⭐

**Requirement**: Automatically set membership levels based on points

```javascript
await users.updateOne(
    { userId: 'user1' },
    [
        {
            $set: {
                memberLevel: {
                    $switch: {
                        branches: [
                            { case: { $gte: ['$points', 10000] }, then: 'platinum' },
                            { case: { $gte: ['$points', 5000] }, then: 'gold' },
                            { case: { $gte: ['$points', 1000] }, then: 'silver' }
                        ],
                        default: 'bronze'
                    }
                }
            }
        }
    ]
);
```

**Why use aggregation pipeline? **
- ✅ Complex condition judgment
- ✅ Atomic operations to avoid race conditions
- ✅ Code is more concise


### Scenario 3: Array operation ⭐

**Requirement**: Extract the first element of the array as the default value

```javascript
await products.updateOne(
    { productId: 'p123' },
    [
        {
            $set: {
                defaultImage: { $arrayElemAt: ['$images', 0] },
                totalTags: { $size: '$tags' },
                firstTag: { $arrayElemAt: ['$tags', 0] }
            }
        }
    ]
);
```


### Scenario 4: String concatenation ⭐

**Requirement**: Generate full name field

```javascript
await users.updateOne(
    { userId: 'user1' },
    [
        {
            $set: {
                fullName: {
                    $concat: ['$firstName', ' ', '$lastName']
                },
                displayName: {
                    $cond: [
                        { $ne: ['$nickname', null] },
                        '$nickname',
                        { $concat: ['$firstName', ' ', '$lastName'] }
                    ]
                }
            }
        }
    ]
);
```


### Scenario 5: Date calculation ⭐

**Requirement**: Set expiration time (creation time + 30 days)

```javascript
await subscriptions.updateOne(
    { subscriptionId: 'sub123' },
    [
        {
            $set: {
                expiresAt: {
                    $add: ['$createdAt', 30 * 24 * 60 * 60 * 1000]  //+30 days (milliseconds)
                }
            }
        }
    ]
);
```


### Scenario 6: Multi-stage conversion ⭐

**Requirements**: Data cleaning, calculation, timestamp update

```javascript
await products.updateOne(
    { productId: 'p789' },
    [
        //Phase 1: Data Normalization
        {
            $set: {
                name: { $trim: { input: '$name' } },
                sku: { $toUpper: '$sku' }
            }
        },
        //Phase 2: Calculate derived fields
        {
            $set: {
                discountedPrice: {
                    $multiply: [
                        '$price',
                        { $subtract: [1, '$discountRate'] }
                    ]
                }
            }
        },
        //Phase 3: Update timestamp
        {
            $set: { updatedAt: new Date() }
        }
    ]
);
```


### Scenario 7: Complex business logic ⭐

**Requirement**: Automatic transfer of order status

```javascript
await orders.updateOne(
    { orderId: 'ORDER-456' },
    [
        {
            $set: {
                status: {
                    $cond: [
                        { $eq: ['$paymentStatus', 'paid'] },
                        {
                            $cond: [
                                { $eq: ['$inventoryStatus', 'reserved'] },
                                'processing',
                                'pending-inventory'
                            ]
                        },
                        'pending-payment'
                    ]
                },
                updatedAt: new Date()
            }
        }
    ]
);
```


## 3.5 Comparison with traditional methods

| Requirements | Traditional approach | Aggregation pipeline approach | Advantages |
|------|----------|-------------|------|
| Calculation between fields | ❌ Need to query → calculate → update | ✅ One operation | Reduce network round-trips |
| Conditional assignment | ❌ Requires multiple queries and judgments | ✅ Atomic operations | Avoid race conditions |
| Array operations | ⚠️ Partial support | ✅ Full support | More flexible |
| String concatenation | ❌ Requires client-side processing | ✅ Server-side calculation | Better performance |
| Date calculation | ❌ Client calculation required | ✅ Server calculation | Avoid time zone issues |

---

## 4. Comparison of usage scenarios


## 4.1 When to use traditional operators?

✅ **Applicable scenarios**:
- Simple field assignment (`$set`, `$unset`)
- Value increase or decrease (`$inc`)
- Array element addition/deletion (`$push`, `$pull`)
- No need for calculations between fields

**Example**:
```javascript
//✅ Simple assignment, just use the traditional method
await users.updateOne(
    { userId: 'user1' },
    { $set: { status: 'active' }, $inc: { loginCount: 1 } }
);
```


## 4.2 When to use aggregation pipelines?

✅ **Applicable scenarios**:
- Need to reference other field values
- Requires conditional expression (if/switch)
- Requires complex array/string/date operations
- Requires multi-stage data transformation

**Example**:
```javascript
//✅ For calculations between fields, the aggregation pipeline must be used
await orders.updateOne(
    { orderId: 'ORDER-123' },
    [
        { $set: { total: { $add: ['$price', '$tax'] } } }
    ]
);
```

---

## 5. Best Practices


## 5.1 Choose the appropriate method

```javascript
//❌ Error: Simple assignment uses aggregation pipeline (overly complex)
await users.updateOne({ userId: 'user1' }, [
    { $set: { status: 'active' } }
]);

//✅ Correct: simple assignments use traditional operators
await users.updateOne({ userId: 'user1' }, {
    $set: { status: 'active' }
});

//✅ Correct: calculations between fields use aggregation pipelines
await orders.updateOne({ orderId: 'ORDER-123' }, [
    { $set: { total: { $add: ['$price', '$tax'] } } }
]);
```


## 5.2 Reasonable use of multi-stage

```javascript
//❌ Over-phasing (unnecessary)
await products.updateOne({ productId: 'p1' }, [
    { $set: { field1: value1 } },
    { $set: { field2: value2 } },
    { $set: { field3: value3 } }
]);

//✅ Merged into one stage
await products.updateOne({ productId: 'p1' }, [
    {
        $set: {
            field1: value1,
            field2: value2,
            field3: value3
        }
    }
]);

//✅ Only phase in if there are dependencies
await products.updateOne({ productId: 'p1' }, [
    //Stage 1: Normalize the data first
    { $set: { price: { $toDouble: '$priceString' } } },
    //Stage 2: Calculation based on normalized data
    { $set: { discountedPrice: { $multiply: ['$price', 0.9] } } }
]);
```


## 5.3 Error handling

```javascript
try {
    await users.updateOne(
        { userId: 'user1' },
        [{ $set: { total: { $add: ['$a', '$b'] } } }]
    );
} catch (error) {
    if (error.code === 'UNSUPPORTED_OPERATION') {
        //MongoDB version does not support aggregation pipeline
        console.error('Please upgrade to MongoDB 4.2+');
    } else {
        //Other errors
        console.error('Update failed:', error.message);
    }
}
```


## 5.4 Performance Optimization


### Using index

```javascript
//✅ Make sure filter fields are indexed
await users.createIndex({ userId: 1 });
await users.updateOne({ userId: 'user1' }, [...]);
```


### Avoid overly complex expressions

```javascript
//❌ Overly complex (poor performance)
await users.updateOne({ userId: 'user1' }, [
    {
        $set: {
            result: {
                $cond: [
                    { $and: [
                        { $gte: ['$a', 10] },
                        { $lte: ['$b', 20] },
                        { $ne: ['$c', null] },
                        { $in: ['$d', ['x', 'y', 'z']] }
                    ]},
                    { $multiply: ['$e', { $add: ['$f', '$g'] }] },
                    { $divide: ['$h', { $subtract: ['$i', '$j'] }] }
                ]
            }
        }
    }
]);

//✅ Simplify logic (or split into multiple operations)
await users.updateOne({ userId: 'user1' }, [
    { $set: { temp: { $add: ['$f', '$g'] } } },
    { $set: { result: { $multiply: ['$e', '$temp'] } } },
    { $unset: ['temp'] }
]);
```

---

## 6. Performance considerations


## 6.1 Performance comparison

| Operation Types | Traditional Operators | Aggregation Pipelines | Performance Differences |
|----------|----------|---------|---------|
| Simple assignment | Fast | Slightly slow | ~5-10% |
| Calculation between fields | Not supported | Fast | - |
| Conditional logic | Multiple operations | Completed in one go | 50%+ faster |
| Complex expressions | Not supported | Medium | - |


## 6.2 Performance recommendations

1. **For simple operations, traditional operators are preferred**
   ```javascript
   //✅ Fast
   await users.updateOne({ _id }, { $set: { name: 'Alice' } });
   ```

2. **Only use aggregation pipeline for complex calculations**
   ```javascript
   //✅Suitable
   await orders.updateOne({ _id }, [
       { $set: { total: { $add: ['$price', '$tax'] } } }
   ]);
   ```

3. **Batch update using updateBatch**
   ```javascript
   //✅ Large batch updates (10000+)
   await users.updateBatch(
       { status: 'inactive' },
       [{ $set: { status: 'archived' } }],
       { batchSize: 1000 }
   );
   ```

---

## 7. FAQ


## Q1: Will the aggregation pipeline automatically convert ObjectId?

**A**: No. Strings in the aggregation pipeline remain intact and are not automatically converted to ObjectIds.

```javascript
//❌ No automatic conversion
await users.updateOne({ _id }, [
    { $set: { refId: '507f1f77bcf86cd799439011' } }  //keep string
]);

//✅ Requires manual conversion (if required)
const { ObjectId } = require('mongodb');
await users.updateOne({ _id }, [
    { $set: { refId: new ObjectId('507f1f77bcf86cd799439011') } }
]);
```


## Q2: What expression operators does the aggregation pipeline support?

**A**: Supports most aggregate expression operators, including:

- **Arithmetic**: `$add`, `$subtract`, `$multiply`, `$divide`, `$mod`
- **Conditions**: `$cond`, `$switch`, `$ifNull`
- **Array**: `$arrayElemAt`, `$size`, `$slice`, `$filter`
- **String**: `$concat`, `$substr`, `$trim`, `$toUpper`, `$toLower`
- **Date**: `$dateToString`, `$year`, `$month`, `$dayOfMonth`
- **Type**: `$type`, `$convert`, `$toDouble`, `$toString`

For the complete list, please refer to: [MongoDB Aggregation Expression](https://www.mongodb.com/docs/manual/reference/operator/aggregation/)


## Q3: Will an error be reported for an empty array?

**A**: Yes. An empty array is not a valid aggregation pipeline.

```javascript
//❌ Error: empty array
await users.updateOne({ _id }, []);
//Error: update aggregation pipeline cannot be an empty array

//✅ Correct: Contains at least one stage
await users.updateOne({ _id }, [
    { $set: { updatedAt: new Date() } }
]);
```


## Q4: How to debug aggregation pipeline?

**A**: Use logging and staged testing.

```javascript
//1. Turn on debugging logs
const msq = new MonSQLize({
    config: { uri: '...' },
    logger: console  //Output debug log
});

//2. Phased testing
//Test the first stage first
await users.updateOne({ _id }, [
    { $set: { step1: { $add: ['$a', '$b'] } } }
]);

//Add a second stage
await users.updateOne({ _id }, [
    { $set: { step1: { $add: ['$a', '$b'] } } },
    { $set: { step2: { $multiply: ['$step1', 2] } } }
]);
```


## Q5: Will the cache become invalid after the aggregation pipeline is updated?

**A**: Yes. Like traditional update operations, the relevant cache will be automatically invalidated after the aggregation pipeline is updated.

```javascript
//Query and cache
await users.find({ status: 'active' }, { cache: 5000 });

//Aggregation pipeline updates (cache will be automatically invalidated)
await users.updateOne({ userId: 'user1' }, [
    { $set: { status: 'inactive' } }
]);

//The next query will read from the database again
await users.find({ status: 'active' }, { cache: 5000 });
```

---

## Related documents

- [MongoDB Aggregation Pipeline Documentation](https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/)
- [MongoDB Aggregation Expression](https://www.mongodb.com/docs/manual/reference/operator/aggregation/)
- [monSQLize API Documentation](./api-index.md)

---

**Document version**: v1.0.0
**Applies to**: monSQLize v1.0.8+
**Last updated**: 2026-01-15
