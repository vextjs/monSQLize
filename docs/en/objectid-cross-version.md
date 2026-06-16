# ObjectId cross-version compatibility

## Overview

monSQLize supports ObjectId compatibility across BSON versions starting from **v1.1.1** and can seamlessly handle ObjectId objects from other MongoDB libraries (such as mongoose).

## Problem background

When your project mixes multiple MongoDB libraries, you may encounter BSON version conflicts:

```javascript
//Other services use mongoose (bson@4.x or bson@5.x)
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();

//monSQLize uses mongodb@6.x (bson@6.x)
await msq.collection('orders').insertOne(dataFromMongoose);
//❌ Error: Unsupported BSON version, bson types must be from bson 6.x.x
```

**Root Cause**:
- mongoose depends on `bson@4.x` or `bson@5.x`
- monSQLize uses `mongodb@6.x` internal dependency `bson@6.x`
- The mongodb@6.x driver refuses to accept ObjectId instances other than `bson@6.x`

## Solution

monSQLize has built-in **automatic cross-version ObjectId conversion** function, without manual processing:


## ✅ Automatic conversion (recommended)

```javascript
import MonSQLize from 'monsqlize';

//Get data from mongoose (containing ObjectId of bson@4.x/5.x)
const dataFromMongoose = await MongooseModel.findOne({ ... }).lean();

//Direct insertion, monSQLize automatically converts ObjectId
const result = await msq.collection('orders').insertOne(dataFromMongoose);
//✅ Success: Automatically convert old version ObjectId to bson@6.x version
```


## Working principle

monSQLize's `convertObjectIdStrings` function does:

1. **Detect old version ObjectId**: Identified by `constructor.name === 'ObjectId'`
2. **Safe conversion**: Call `.toString()` to obtain the hexadecimal string, and then construct it into the `bson@6.x` version
3. **Recursive processing**: Automatically handle ObjectId in nested objects and arrays
4. **Error downgrade**: When the conversion fails, the original object is returned and other fields are not affected.

## Supported scenarios


## 1. Single ObjectId

```javascript
//ObjectId of mongoose
const legacyUserId = mongoose.Types.ObjectId('507f1f77bcf86cd799439011');

//automatic conversion
await msq.collection('users').insertOne({
  userId: legacyUserId,  //✅ Automatic conversion
  name: 'Alice'
});
```


## 2. Nested objects

```javascript
const order = {
  _id: mongooseObjectId1,
  userId: mongooseObjectId2,
  items: [
    { productId: mongooseObjectId3, qty: 2 },
    { productId: mongooseObjectId4, qty: 1 }
  ],
  metadata: {
    createdBy: mongooseObjectId5,
    updatedBy: mongooseObjectId6
  }
};

//All ObjectIds automatically converted
await msq.collection('orders').insertOne(order);
```


## 3. ObjectId array

```javascript
const userIds = [
  mongooseObjectId1,
  mongooseObjectId2,
  mongooseObjectId3
];

await msq.collection('groups').insertOne({
  name: 'Group A',
  members: userIds  //✅ All ObjectIds in the array are automatically converted
});
```


## 4. Query conditions

```javascript
//The ObjectId in the query conditions will also be automatically converted
const result = await msq.collection('orders').find({
  userId: mongooseObjectId  //✅ Automatic conversion
});
```

## Performance optimization

- **Zero-copy optimization**: If there is no ObjectId that needs to be converted in the object, return the original object (no cloning)
- **Value-based detection**: Valid ObjectId-looking values can be converted regardless of the field name.
- **Cycle detection**: Circular structures are detected to prevent infinite recursion.

## Compatibility

| BSON version | mongoose version | monSQLize support |
|-----------|--------------|---------------|
| bson@4.x | mongoose@5.x | ✅ Fully supported |
| bson@5.x | mongoose@6.x | ✅ Fully supported |
| bson@6.x | mongoose@7.x | ✅ Native support |

## Manual preprocessing (only when the application layer really needs it)

v2 currently promises **automatic cross-version ObjectId conversion**. During the migration period, the legacy helper subpath is no longer recommended as a formal dependency entry.

If the business really needs to explicitly normalize the data before entering monSQLize, please do the preprocessing at the application layer and then hand the results to monSQLize; do not treat the old helper subpath as a long-term public API.

## Debugging

The current v2 converter does not emit per-value conversion logs. To inspect conversion behavior, use an integration test, MongoDB command monitoring, or a focused unit test around the converter.

## Notes

1. **Field references not converted**: Field references (such as `$userId`) in the MongoDB aggregation pipeline will not be converted
2. **Special operators**: `$expr`, `$function`, `$where`, etc. are not converted internally
3. **Circular Reference Detection**: Automatically detect and prevent infinite recursion caused by circular references
4. **Error downgrade**: When the conversion fails, the original value is returned and no exception is thrown.

## Related links

- [MongoDB official driver version compatibility](https://www.mongodb.com/docs/drivers/node/current/compatibility/)
- [Mongoose version selection guide](https://mongoosejs.com/docs/version-selection.html)
- [BSON Specification](http://bsonspec.org/)

## Update log

- **v1.1.1** (2026-01-27): Added cross-version ObjectId compatibility support
