# Aggregation Pipeline Update Guide

## Introduction

This page is the deep guide for aggregation pipeline updates in monSQLize update methods. If you only need to choose between traditional update operators and pipeline payloads, start with [Update Methods Overview](./update-operations.md).


## Why do we need an aggregation pipeline?

**Limitations for legacy updates**:

```javascript
//❌ Not achievable: increase price by 10%
await collection.updateOne(
    { _id: id },
    { $set: { price: price * 1.1 } }  //Error: cannot reference field value
);

//❌ Unable to achieve: Calculate total price = unit price * quantity
await collection.updateOne(
    { _id: id },
    { $set: { total: unitPrice * quantity } }  //Error: cannot reference field value
);
```

**Advantages of Aggregation Pipelines**:

```javascript
//✅ Achievable: Increase price by 10%
await collection.updateOne(
    { _id: id },
    [
        { $set: { price: { $multiply: ['$price', 1.1] } } }
    ]
);

//✅ Achievable: Calculate the total price
await collection.updateOne(
    { _id: id },
    [
        { $set: { total: { $multiply: ['$unitPrice', '$quantity'] } } }
    ]
);
```


## Core Competencies

- ✅ **Calculate between fields**: Calculate new values based on existing field values
- ✅ **Conditional assignment**: Set different values based on conditions
- ✅ **Multi-stage conversion**: Complex data conversion process
- ✅ **Fully Compatible**: Consistent with MongoDB 4.2+ native syntax

---

## Quick start


## Basic example

```javascript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' }
});

await msq.connect();
const collection = msq.collection('products');

//Legacy updates (still supported)
await collection.updateOne(
    { _id: productId },
    { $set: { status: 'active' } }
);

//Aggregation pipeline updates (new feature)
await collection.updateOne(
    { _id: productId },
    [
        { $set: {
            totalPrice: { $add: ['$price', '$tax'] }
        }}
    ]
);
```


## Identification rules

monSQLize automatically detects update syntax:

```javascript
//Object → Legacy Update
{ $set: { name: 'John' } }

//array → aggregation pipeline
[ { $set: { total: { $add: ['$price', '$tax'] } } } ]
```

---

## Aggregation pipeline basics


## Basic structure

An aggregation pipeline is an array of stages:

```javascript
[
    { $set: { field1: expression1 } },  //Stage 1
    { $set: { field2: expression2 } },  //Stage 2
    { $unset: 'field3' }                //Stage 3
]
```


## Available stages

The following stages are available in update:

| Stages | Description | Examples |
|------|------|------|
| `$set` | Set field value | `{ $set: { total: { $add: ['$a', '$b'] } } }` |
| `$unset` | Delete field | `{ $unset: ['temp', 'oldField'] }` |
| `$replaceRoot` | Replace root document | `{ $replaceRoot: { newRoot: '$nested' } }` |


## Field reference

Reference fields using the `Reference fields using the  prefix:

```javascript
//Reference a single field
'$price'

//Reference nested fields
'$address.city'

//Reference array element
'$items.0.price'
```

---

## Common operators


## Arithmetic operators


### $add - addition

```javascript
//Calculate total price = unit price + tax
await collection.updateOne(
    { _id: id },
    [
        { $set: { totalPrice: { $add: ['$unitPrice', '$tax'] } } }
    ]
);

//Add multiple fields
{ $add: ['$price', '$tax', '$shipping'] }

//plus fixed value
{ $add: ['$price', 10] }
```


### $subtract - Subtraction

```javascript
//Calculate discount price = original price - discount
await collection.updateOne(
    { _id: id },
    [
        { $set: { finalPrice: { $subtract: ['$originalPrice', '$discount'] } } }
    ]
);
```


### $multiply - Multiplication

```javascript
//Calculate total price = unit price × quantity
await collection.updateOne(
    { _id: id },
    [
        { $set: { total: { $multiply: ['$unitPrice', '$quantity'] } } }
    ]
);

//Price increases by 10%
{ $multiply: ['$price', 1.1] }
```


### $divide - Division

```javascript
//Calculate average price
await collection.updateOne(
    { _id: id },
    [
        { $set: { avgPrice: { $divide: ['$totalPrice', '$quantity'] } } }
    ]
);
```


### $mod - take the modulus

```javascript
//Determine parity
{ $mod: ['$number', 2] }  //0 = even, 1 = odd
```


## Conditional operator


### $cond - conditional expression

```javascript
//Set priority based on amount
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                priority: {
                    $cond: {
                        if: { $gte: ['$amount', 1000] },
                        then: 'high',
                        else: 'normal'
                    }
                }
            }
        }
    ]
);

//multiple conditions
{
    $cond: {
        if: { $gte: ['$score', 90] },
        then: 'A',
        else: {
            $cond: {
                if: { $gte: ['$score', 80] },
                then: 'B',
                else: 'C'
            }
        }
    }
}
```


### $ifNull - Null value handling

```javascript
//Use default value
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                displayName: { $ifNull: ['$nickname', '$username'] }
            }
        }
    ]
);
```


### $switch - Multiple branch selection

```javascript
//Set description based on status code
{
    $set: {
        statusText: {
            $switch: {
                branches: [
                    { case: { $eq: ['$status', 1] }, then: 'Pending' },
                    { case: { $eq: ['$status', 2] }, then: 'Processing' },
                    { case: { $eq: ['$status', 3] }, then: 'Completed' }
                ],
                default: 'unknown'
            }
        }
    }
}
```


## String operators


### $concat - string concatenation

```javascript
//splice full name
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                fullName: { $concat: ['$firstName', ' ', '$lastName'] }
            }
        }
    ]
);
```


### $toLower / $toUpper - Case conversion

```javascript
//Convert email to lowercase
await collection.updateOne(
    { _id: id },
    [
        { $set: { email: { $toLower: '$email' } } }
    ]
);

//Convert username to uppercase letters
{ $set: { username: { $toUpper: '$username' } } }
```


### $substr - substring

```javascript
//Extract first 10 characters
{ $substr: ['$description', 0, 10] }
```


## Comparison operators

```javascript
//$eq - equal to
{ $eq: ['$status', 'active'] }

//$ne - not equal to
{ $ne: ['$status', 'deleted'] }

//$gt - greater than
{ $gt: ['$price', 100] }

//$gte - greater than or equal to
{ $gte: ['$age', 18] }

//$lt - less than
{ $lt: ['$stock', 10] }

//$lte - less than or equal to
{ $lte: ['$discount', 0.5] }
```


## Logical operators

```javascript
//$and - with
{ $and: [
    { $gte: ['$age', 18] },
    { $lte: ['$age', 65] }
]}

//$or - or
{ $or: [
    { $eq: ['$status', 'active'] },
    { $eq: ['$status', 'pending'] }
]}

//$not - not
{ $not: { $eq: ['$status', 'deleted'] } }
```

---

## Usage scenarios


## Scenario 1: Calculation between fields

```javascript
//Order scenario: Calculate total price
await orders.updateOne(
    { _id: orderId },
    [
        {
            $set: {
                //Subtotal = Unit Price × Quantity
                subtotal: { $multiply: ['$unitPrice', '$quantity'] },
                //Taxes = Subtotal × Tax Rate
                tax: { $multiply: [
                    { $multiply: ['$unitPrice', '$quantity'] },
                    '$taxRate'
                ]},
                //Total price = subtotal + tax
                total: { $add: [
                    { $multiply: ['$unitPrice', '$quantity'] },
                    { $multiply: [
                        { $multiply: ['$unitPrice', '$quantity'] },
                        '$taxRate'
                    ]}
                ]}
            }
        }
    ]
);
```


## Scenario 2: Conditional assignment

```javascript
//User scenario: Set levels based on points
await users.updateMany(
    { updatedAt: { $lt: new Date('2026-01-01') } },
    [
        {
            $set: {
                level: {
                    $switch: {
                        branches: [
                            { case: { $gte: ['$points', 10000] }, then: 'vip' },
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


## Scenario 3: Data cleaning

```javascript
//Batch normalized data
await users.updateMany(
    {},
    [
        {
            $set: {
                //Convert email to lowercase
                email: { $toLower: '$email' },
                //Use default nickname
                displayName: { $ifNull: ['$nickname', '$username'] },
                //Calculate age
                age: {
                    $divide: [
                        { $subtract: [new Date(), '$birthDate'] },
                        31536000000  //milliseconds/year
                    ]
                }
            }
        },
        {
            $unset: ['tempField', 'oldField']  //Delete temporary fields
        }
    ]
);
```


## Scenario 4: Multi-stage conversion

```javascript
//Complex data transformation
await products.updateOne(
    { _id: productId },
    [
        //Stage 1: Calculate base fields
        {
            $set: {
                originalTotal: { $multiply: ['$price', '$quantity'] }
            }
        },
        //Stage 2: Apply discount
        {
            $set: {
                discountAmount: { $multiply: ['$originalTotal', '$discountRate'] },
                discountedTotal: { $subtract: [
                    '$originalTotal',
                    { $multiply: ['$originalTotal', '$discountRate'] }
                ]}
            }
        },
        //Stage 3: Add taxes
        {
            $set: {
                tax: { $multiply: ['$discountedTotal', 0.08] },
                finalTotal: { $add: [
                    '$discountedTotal',
                    { $multiply: ['$discountedTotal', 0.08] }
                ]}
            }
        }
    ]
);
```


## Scenario 5: Price adjustment

```javascript
//Adjust price in bulk
await products.updateMany(
    { category: 'electronics' },
    [
        {
            $set: {
                //Price increased by 10%
                newPrice: { $multiply: ['$price', 1.1] },
                //keep old price
                oldPrice: '$price'
            }
        },
        {
            $set: {
                //Update actual price
                price: '$newPrice'
            }
        },
        {
            $unset: 'newPrice'  //Delete temporary fields
        }
    ]
);
```

---

## Best Practices


## 1. Performance first

```javascript
//✅ Recommended: Calculate multiple fields at once
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                total: { $add: ['$price', '$tax'] },
                discount: { $multiply: ['$price', 0.1] },
                final: { $subtract: [
                    { $add: ['$price', '$tax'] },
                    { $multiply: ['$price', 0.1] }
                ]}
            }
        }
    ]
);

//❌ Avoid: Multiple updates
await collection.updateOne({ _id: id }, [
    { $set: { total: { $add: ['$price', '$tax'] } } }
]);
await collection.updateOne({ _id: id }, [
    { $set: { discount: { $multiply: ['$price', 0.1] } } }
]);
```


## 2. Use intermediate variables

```javascript
//✅ Recommended: Use multi-stage to simplify complex calculations
await collection.updateOne(
    { _id: id },
    [
        //Stage 1: Calculate the intermediate value
        {
            $set: {
                subtotal: { $multiply: ['$price', '$quantity'] }
            }
        },
        //Stage 2: Calculate final value based on intermediate values
        {
            $set: {
                total: { $add: ['$subtotal', '$shipping'] }
            }
        }
    ]
);
```


## 3. Defensive Programming

```javascript
//✅ Recommended: Handle null values and exceptions
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                total: {
                    $add: [
                        { $ifNull: ['$price', 0] },
                        { $ifNull: ['$tax', 0] }
                    ]
                },
                //avoid dividing by zero
                avgPrice: {
                    $cond: {
                        if: { $gt: ['$quantity', 0] },
                        then: { $divide: ['$total', '$quantity'] },
                        else: 0
                    }
                }
            }
        }
    ]
);
```


## 4. Keep historical data

```javascript
//✅ Recommendation: Save the original value before modification
await collection.updateOne(
    { _id: id },
    [
        {
            $set: {
                oldPrice: '$price',
                price: { $multiply: ['$price', 1.1] },
                priceUpdatedAt: new Date()
            }
        }
    ]
);
```


## 5. Batch operation

```javascript
//✅ Recommendation: Use updateMany to batch update
const result = await collection.updateMany(
    { status: 'pending', createdAt: { $lt: expiredDate } },
    [
        {
            $set: {
                status: 'expired',
                expiredAt: new Date()
            }
        }
    ]
);

console.log(`Updated ${result.modifiedCount} documents`);
```

---

## Performance optimization


## 1. Reduce pipeline stages

```javascript
//❌ Inefficiency: multiple stages
[
    { $set: { a: { $add: ['$x', 1] } } },
    { $set: { b: { $add: ['$y', 1] } } },
    { $set: { c: { $add: ['$z', 1] } } }
]

//✅ Efficient: merged into one stage
[
    {
        $set: {
            a: { $add: ['$x', 1] },
            b: { $add: ['$y', 1] },
            c: { $add: ['$z', 1] }
        }
    }
]
```


## 2. Use index

```javascript
//Make sure the query conditions are indexed
await collection.createIndex({ status: 1, category: 1 });

//Then batch update
await collection.updateMany(
    { status: 'active', category: 'electronics' },
    [ { $set: { featured: true } } ]
);
```


## 3. Process large amounts of data in batches

```javascript
//Update in batches to avoid timeouts
const batchSize = 1000;
let skip = 0;
let updated = 0;

while (true) {
    const docs = await collection
        .find({ status: 'pending' })
        .skip(skip)
        .limit(batchSize)
        .toArray();

    if (docs.length === 0) break;

    const ids = docs.map(d => d._id);
    const result = await collection.updateMany(
        { _id: { $in: ids } },
        [ { $set: { status: 'processed' } } ]
    );

    updated += result.modifiedCount;
    skip += batchSize;

    console.log(`Processed ${updated} documents...`);
}
```

---

## Notes


## 1. MongoDB version requirements

Aggregation pipeline updates require **MongoDB 4.2+**:

```javascript
//Check MongoDB version
const admin = msq.db().admin();
const serverInfo = await admin.buildInfo();
console.log(`MongoDB version: ${serverInfo.version}`);

//Aggregation pipeline updates are only supported in v4.2+
if (parseFloat(serverInfo.version) < 4.2) {
    console.warn('Aggregation pipeline updates require MongoDB 4.2+');
}
```


## 2. Field reference syntax

```javascript
//✅ Correct: Use $ prefix
{ $add: ['$price', '$tax'] }

//❌ Error: Missing $ prefix
{ $add: ['price', 'tax'] }  //will be treated as a string!
```


## 3. Array vs object

```javascript
//Aggregation pipeline: array
[ { $set: { total: { $add: ['$a', '$b'] } } } ]

//Legacy Update: Object
{ $set: { total: 100 } }

//Don't mix them!
```


## 4. Performance considerations

Aggregation pipeline updates are **slightly slower** than traditional updates (~10-20%), only use when necessary:

```javascript
//✅ Need to calculate between fields → use aggregation pipeline
[ { $set: { total: { $add: ['$price', '$tax'] } } } ]

//✅ Simple assignment → use traditional updates
{ $set: { status: 'active' } }
```


## 5. Transaction support

Aggregation pipeline updates fully support transactions:

```javascript
const session = msq.client.startSession();

try {
    await session.withTransaction(async () => {
        await collection.updateOne(
            { _id: id },
            [ { $set: { total: { $add: ['$price', '$tax'] } } } ],
            { session }
        );
    });
} finally {
    await session.endSession();
}
```

---

## API Reference


## updateOne

```typescript
collection.updateOne(
    filter: object,
    update: object | array,
    options?: {
        upsert?: boolean;
        session?: ClientSession;
        //...other options
    }
): Promise<UpdateResult>
```

**Parameters**:
- `filter`: query conditions
- `update`: Update content (object = traditional update, array = aggregation pipeline)
- `options`: Optional configuration

**Return**:
```typescript
{
    acknowledged: boolean;
    matchedCount: number;
    modifiedCount: number;
    upsertedId?: ObjectId;
}
```


## updateMany

```typescript
collection.updateMany(
    filter: object,
    update: object | array,
    options?: UpdateOptions
): Promise<UpdateResult>
```

Similar to `updateOne`, but can update multiple documents.

---

## Related documents

- [updateOne guide](./update-one.md) - updateOne full document
- [updateMany guide](./update-many.md) - updateMany full document
- [Update Methods Overview](./update-operations.md) - Method selection and traditional operator overview
- [Aggregation pipeline guide](./aggregate.md) - Detailed explanation of aggregation pipeline
