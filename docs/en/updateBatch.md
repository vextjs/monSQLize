# updateBatch - Update documents in batches

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Applicable scenarios](#applicable-scenarios)
- [API parameter description](#api-parameter-description)
- [Method signature](#method-signature)
- [Detailed explanation of parameters](#detailed-explanation-of-parameters)
- [Return value](#return-value)
- [Progress callback parameters](#progress-callback-parameters)
- [Usage example](#usage-example)
- [1. Basic usage - batch modification status](#1-basic-usage-batch-modification-status)
- [2. With progress monitoring - data migration](#2-with-progress-monitoring-data-migration)
- [3. $set - Set field value](#3-set-set-field-value)
- [4. $inc - increase or decrease the value](#4-inc-increase-or-decrease-the-value)
- [5. $push - add array elements](#5-push-add-array-elements)
- [6. $pull - delete array elements](#6-pull-delete-array-elements)
- [7. $mul - multiplication operation](#7-mul-multiplication-operation)
- [8. Multiple operator combinations](#8-multiple-operator-combinations)
- [9. Using arrayFilters - Update specific elements in an array](#9-using-arrayfilters-update-specific-elements-in-an-array)
- [10. Error handling - retry strategy (recommended)](#10-error-handling-retry-strategy-recommended)
- [11. upsert - insert if not present](#11-upsert-insert-if-not-present)
- [12. Complex query conditions](#12-complex-query-conditions)
- [Performance optimization suggestions](#performance-optimization-suggestions)
- [1. Batch size selection](#1-batch-size-selection)
- [2. Index optimization](#2-index-optimization)
- [3. Avoid full table scan](#3-avoid-full-table-scan)
- [4. Update operation optimization](#4-update-operation-optimization)
- [FAQ](#faq)
- [Q1: What is the difference between updateBatch and updateMany?](#q1-what-is-the-difference-between-updatebatch-and-updatemany)
- [Q2: Will updateBatch cause data inconsistency?](#q2-will-updatebatch-cause-data-inconsistency)
- [Q3: Why must we use the update operator?](#q3-why-must-we-use-the-update-operator)
- [Q4: How to update _id in batches?](#q4-how-to-update-id-in-batches)
- [Q5: What update operators does updateBatch support?](#q5-what-update-operators-does-updatebatch-support)
- [Q6: How to estimate the update time?](#q6-how-to-estimate-the-update-time)
- [Q7: Can it be used in transactions?](#q7-can-it-be-used-in-transactions)
- [References](#references)

## Overview

The `updateBatch` method updates a large number of documents in batches through streaming queries. It is suitable for scenarios where thousands or even millions of data need to be updated to avoid memory pressure and performance problems caused by one-time updates.


## Features

- ✅ **Streaming Query** - Streaming API based on `find()`, constant memory usage
- ✅ **Progress Monitoring** - View update progress and percentage in real time
- ✅ **Error Handling** - Supports four strategies of stop/skip/collect/retry
- ✅ **Auto Retry** - Automatically retry failed batches when the network is unstable
- ✅ **Cache Invalidation** - Automatically invalidate related collection cache
- ✅ **FULL OPERATORS** - Supports all MongoDB update operators


## Applicable scenarios

| Scenario | Data volume | Recommended method | Reason |
|------|--------|---------|------|
| Batch price adjustment | > 100,000 | **updateBatch** | Avoid too many updates at one time |
| Data migration | > 10,000 | **updateBatch** | Can monitor progress |
| Batch status modification | > 100,000 | **updateBatch** | Progress monitoring required |
| Update a small amount of data | < 1000 | updateMany | updateMany is simpler |

---

## API parameter description


## Method signature

```typescript
collection(name: string).updateBatch(
  filter: object,
  update: object,
  options?: UpdateBatchOptions
): Promise<UpdateBatchResult>
```


## Detailed explanation of parameters

**First parameter: filter** (required)
- Type: `object`
- Description: Update conditions, same as `updateMany`

**Second parameter: update** (required)
- Type: `object`
- Description: For update operations, **must use update operator** (`$set`, `$inc`, `$push`, etc.)
- ❌ Error: `{ name: 'new' }`
- ✅ Correct: `{ $set: { name: 'new' } }`

**Third parameter: options** (optional)

| Parameters | Type | Default value | Description |
|------|------|--------|------|
| **batchSize** | `number` | `1000` | Number of documents updated in each batch |
| **estimateProgress** | `boolean` | `true` | Whether to pre-count the total number (for progress percentage) |
| **onProgress** | `Function` | - | Progress callback function `(progress) => {}` |
| **onError** | `string` | `'stop'` | Error handling strategy: `'stop'`/`'skip'`/`'collect'`/`'retry'` |
| **retryAttempts** | `number` | `3` | The maximum number of retries for a failed batch (when onError='retry') |
| **retryDelay** | `number` | `1000` | Retry delay time (milliseconds) |
| **onRetry** | `Function` | - | Retry callback function `(retryInfo) => {}` |
| **writeConcern** | `object` | `{ w: 1 }` | Write confirmation level |
| **upsert** | `boolean` | `false` | Whether to insert when there is no match |
| **arrayFilters** | `Array` | - | Array filters |
| **comment** | `string` | - | Operation comments (for log tracking) |


## Return value

```typescript
{
  acknowledged: boolean,      //Is it confirmed
  totalCount: number | null,  //Total number of documents (valid when estimateProgress=true)
  matchedCount: number,       //Number of matching documents
  modifiedCount: number,      //Number of successful updates
  upsertedCount: number,      //Number of insertions (when upsert=true)
  batchCount: number,         //Total number of batches
  errors: Array<Object>,      //error list
  retries: Array<Object>      //Retry record list
}
```


## Progress callback parameters

```typescript
{
  currentBatch: number,    //Current batch number (starting from 1)
  totalBatches: number,    //Total number of batches
  modified: number,        //Quantity updated
  total: number | null,    //Total quantity (valid when estimateProgress=true)
  percentage: number | null, //Complete percentage (0-100, has value when estimateProgress=true)
  errors: number,          //number of errors
  retries: number          //Number of retries
}
```

---

## Usage example


## 1. Basic usage - batch modification status

```javascript
//Mark all pending orders as processed
const result = await collection('orders').updateBatch(
    { status: 'pending' },
    { $set: { status: 'processed', processedAt: new Date() } },
    { batchSize: 5000 }
);

console.log(`Update ${result.modifiedCount} orders`);
```


## 2. With progress monitoring - data migration

```javascript
const result = await collection('users').updateBatch(
    { oldField: { $exists: true } },
    {
        $set: { newField: 'value' },
        $unset: { oldField: '' }
    },
    {
        batchSize: 5000,
        estimateProgress: true,
        onProgress: (progress) => {
            console.log(`Migration progress: ${progress.percentage}% (${progress.modified}/${progress.total} items)`);
        }
    }
);
```

**Example output**:
```text
Migration progress: 20% (100000/500000 items)
Migration progress: 40% (200000/500000 items)
Migration progress: 60% (300000/500000 items)
Migration progress: 80% (400000/500000 items)
Migration progress: 100% (500000/500000 items)
```


## 3. $set - Set field value

```javascript
//Set user membership levels in batches
await collection('users').updateBatch(
    { registeredDays: { $gte: 365 } },
    {
        $set: {
            vipLevel: 'gold',
            vipStartAt: new Date()
        }
    },
    { batchSize: 5000 }
);
```


## 4. $inc - increase or decrease the value

```javascript
//Increase product inventory in batches
await collection('products').updateBatch(
    { category: 'electronics' },
    {
        $inc: {
            stock: 100,        //Inventory +100
            version: 1         //version number +1
        }
    },
    { batchSize: 3000 }
);
```


## 5. $push - add array elements

```javascript
//Add tags to users in batches
await collection('users').updateBatch(
    { isActive: true },
    {
        $push: {
            tags: 'promoted',
            notifications: {
                type: 'promo',
                createdAt: new Date()
            }
        }
    },
    { batchSize: 5000 }
);
```


## 6. $pull - delete array elements

```javascript
//Delete expired notifications in batches
await collection('users').updateBatch(
    { 'notifications.0': { $exists: true } },
    {
        $pull: {
            notifications: {
                expiresAt: { $lt: new Date() }
            }
        }
    },
    { batchSize: 5000 }
);
```


## 7. $mul - multiplication operation

```javascript
//Bulk price adjustment (all prices increased by 10%)
await collection('products').updateBatch(
    { price: { $gt: 0 } },
    {
        $mul: { price: 1.1 },
        $set: { updatedAt: new Date() }
    },
    {
        batchSize: 5000,
        estimateProgress: true,
        onProgress: (p) => console.log(`Price adjustment progress: ${p.percentage}%`)
    }
);
```


## 8. Multiple operator combinations

```javascript
//Complex batch update: price adjustment + inventory increase + label addition
await collection('products').updateBatch(
    { category: 'sale' },
    {
        $mul: { price: 0.8 },              //20% off price
        $inc: { stock: 50 },               //Inventory +50
        $push: { tags: 'discount' },       //Add discount tag
        $set: {
            onSale: true,
            saleStartAt: new Date()
        }
    },
    { batchSize: 3000 }
);
```


## 9. Using arrayFilters - Update specific elements in an array

```javascript
//Batch update the status of specific items in an order
await collection('orders').updateBatch(
    { 'items.status': 'pending' },
    {
        $set: {
            'items.$[elem].status': 'shipped',
            'items.$[elem].shippedAt': new Date()
        }
    },
    {
        batchSize: 3000,
        arrayFilters: [{ 'elem.status': 'pending' }]
    }
);
```


## 10. Error handling - retry strategy (recommended)

```javascript
const result = await collection('users').updateBatch(
    { lastActive: { $lt: new Date('2024-01-01') } },
    { $set: { status: 'inactive' } },
    {
        batchSize: 5000,
        onError: 'retry',
        retryAttempts: 3,
        retryDelay: 1000,
        onRetry: (info) => {
            console.log(`Batch ${info.batchIndex + 1} retry ${info.attempt}`);
        }
    }
);

console.log(`Update completed, retry ${result.retries.length} times`);
```


## 11. upsert - insert if not present

```javascript
//Initialize user configuration in batches (create if it does not exist)
await collection('user_settings').updateBatch(
    { userId: { $in: userIds } },
    {
        $setOnInsert: {
            theme: 'light',
            language: 'zh-CN',
            createdAt: new Date()
        },
        $set: {
            updatedAt: new Date()
        }
    },
    {
        batchSize: 1000,
        upsert: true
    }
);
```


## 12. Complex query conditions

```javascript
//Batch update documents that meet multiple conditions
await collection('orders').updateBatch(
    {
        status: 'pending',
        createdAt: { $lt: new Date('2024-01-01') },
        $or: [
            { paymentStatus: 'paid' },
            { amount: 0 }
        ]
    },
    {
        $set: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelReason: 'Automatically cancel after timeout'
        }
    },
    {
        batchSize: 5000,
        estimateProgress: true,
        onProgress: (p) => console.log(`Cancellation progress: ${p.percentage}%`)
    }
);
```

---

## Performance optimization suggestions


## 1. Batch size selection

| Data volume | Recommended batchSize | Reason |
|--------|---------------|------|
| < 100,000 | 1000-2000 | Small batch, quick response |
| 100,000-1 million | 3000-5000 | Balance performance and memory |
| > 1 million | 5000-10000 | Large batches, reducing network overhead |

```javascript
//Dynamically adjust batch size
const totalCount = await collection('users').count({ status: 'inactive' });
const batchSize = totalCount > 1000000 ? 10000 : 5000;

await collection('users').updateBatch(
    { status: 'inactive' },
    { $set: { status: 'archived' } },
    { batchSize }
);
```


## 2. Index optimization

```javascript
//Make sure there is an index before updating
await collection('orders').createIndex({ status: 1, createdAt: 1 });

//and then update
await collection('orders').updateBatch(
    { status: 'pending', createdAt: { $lt: expireDate } },
    { $set: { status: 'expired' } },
    { batchSize: 5000 }
);
```


## 3. Avoid full table scan

```javascript
//❌ Bad: Unindexed fields
await collection('users').updateBatch(
    { customField: 'value' },  //If customField does not have an index, the entire table will be scanned.
    { $set: { status: 'updated' } }
);

//✅ Good: Use indexed fields
await collection('users').updateBatch(
    { _id: { $in: userIds } },  //_id has a default index
    { $set: { status: 'updated' } }
);
```


## 4. Update operation optimization

```javascript
//❌ Inefficiency: updating the same batch of data multiple times
await collection('users').updateBatch(filter, { $set: { field1: 'a' } });
await collection('users').updateBatch(filter, { $set: { field2: 'b' } });

//✅ Efficient: update multiple fields at once
await collection('users').updateBatch(filter, {
    $set: {
        field1: 'a',
        field2: 'b'
    }
});
```

---

## FAQ


## Q1: What is the difference between updateBatch and updateMany?

| Compare items | updateBatch | updateMany |
|--------|-------------|------------|
| **Applicable data volume** | > 10000 items | < 10000 items |
| **Memory usage** | Constant (streaming) | Linear growth |
| **Progress Monitoring** | ✅ Supported | ❌ Not Supported |
| **Error Handling** | ✅ 4 Strategies | ❌ Only Fail All |
| **Auto Retry** | ✅ Supported | ❌ Not Supported |
| **Performance** | Better for large data volumes | Faster for small data volumes |

**Suggestions**:
- Data volume < 10000 items → use `updateMany`
- Data volume ≥ 10000 → use `updateBatch`


## Q2: Will updateBatch cause data inconsistency?

**Answer**: No. `updateBatch` uses MongoDB's cursor snapshot isolation to ensure data consistency.

```javascript
//✅ Security: Even if other operations insert new data at the same time, it will not be accidentally updated.
await collection('users').updateBatch(
    { status: 'inactive' },
    { $set: { status: 'archived' } },
    { batchSize: 5000 }
);
```


## Q3: Why must we use the update operator?

**Answer**: This is a MongoDB requirement, as is `updateMany`.

```javascript
//❌ Error: direct assignment
await collection('users').updateBatch(
    { status: 'old' },
    { status: 'new' }  //will throw an error
);

//✅ Correct: use $set
await collection('users').updateBatch(
    { status: 'old' },
    { $set: { status: 'new' } }
);
```


## Q4: How to update _id in batches?

**Answer**: Updating _id is not recommended. If necessary, use `replaceOne` or reinsert.

```javascript
//❌ Not supported: update _id
await collection('users').updateBatch(
    { oldId: { $exists: true } },
    { $set: { _id: newId } }  //will fail
);

//✅ Recommendation: Keep the old ID and add new fields
await collection('users').updateBatch(
    { oldId: { $exists: true } },
    {
        $set: { newId: generateNewId() },
        $unset: { oldId: '' }
    }
);
```


## Q5: What update operators does updateBatch support?

**A**: All MongoDB update operators are supported.

**Field operators**:
- `$set` - Set field value
- `$unset` - Delete field
- `$rename` - Rename fields
- `$setOnInsert` - Set when upsert (only when inserting)

**Numeric operators**:
- `$inc` - increase or decrease
- `$mul` - Multiplication
- `$min` - take the minimum value
- `$max` - take the maximum value

**Array Operator**:
- `$push` - Add element
- `$pop` - delete the first/last elements
- `$pull` - Remove matching elements
- `$pullAll` - delete multiple elements
- `$addToSet` - Add unique element

**Other operators**:
- `$currentDate` - Set current date


## Q6: How to estimate the update time?

```javascript
//Performance Reference (In-Memory Database)
//Update speed: about 30000-40000 items/second

const totalCount = 1000000;
const estimatedTime = totalCount / 35000;  //about 29 seconds

console.log(`Estimated time: ${Math.ceil(estimatedTime)} seconds`);
```


## Q7: Can it be used in transactions?

**Answer**: Yes.

```javascript
const session = await msq.startSession();

try {
    await session.withTransaction(async () => {
        await collection('orders').updateBatch(
            { status: 'pending' },
            { $set: { status: 'processing' } },
            { batchSize: 1000 }
        );

        await collection('inventory').updateBatch(
            { productId: { $in: productIds } },
            { $inc: { reserved: -1 } },
            { batchSize: 1000 }
        );
    });
} finally {
    await session.endSession();
}
```

---

## References

- [deleteBatch - delete documents in batches](./deleteBatch.md)
- [insertBatch - Insert documents in batches](./insertBatch.md)
- [find - streaming query](./find.md)
- [updateMany - batch update (small data volume)](./update-many.md)
- [MongoDB update operator](https://www.mongodb.com/docs/manual/reference/operator/update/)
- [Usage Example](../../examples/docs/batch-operations.ts)
- [Batch write test](../../test/unit/writes/batch.test.ts)

---

**Updated date**: 2025-12-30
**Version**: v1.0

