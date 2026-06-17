# ObjectId Auto Conversion

> **Availability**: v1.3.0+  
> **Type**: Feature  
> **Category**: Data type handling

---

## Table of Contents

- [Overview](#overview)
- [Why Automatic Conversion Helps](#why-automatic-conversion-helps)
- [Conversion Rules](#conversion-rules)
- [Configuration Options](#configuration-options)
- [Usage Examples](#usage-examples)
- [Supported Methods](#supported-methods)
- [Advanced Configuration](#advanced-configuration)
- [Performance Notes](#performance-notes)
- [FAQ](#faq)

---

## Overview

Starting from v1.3.0, monSQLize supports **automatic ObjectId string conversion**. When you pass valid 24-character hexadecimal strings in MongoDB operations, monSQLize can convert those values to MongoDB `ObjectId` instances before the operation is executed.

Key benefits:

- Simplifies application code: no manual `new ObjectId()` calls for common fields.
- Improves developer ergonomics: string IDs can be passed directly.
- Detects valid ObjectId strings automatically.
- Handles nested objects and arrays.
- Preserves legacy behavior where ObjectId-looking values are normalized automatically.

---

## Why Automatic Conversion Helps

### Traditional Usage Before v1.3.0

```javascript
const { ObjectId } = require('mongodb');

// Manual conversion is required.
const user = await collection('users').findOne({
    _id: new ObjectId('507f1f77bcf86cd799439011')
});

// More fields mean more manual conversions.
const posts = await collection('posts').find({
    authorId: new ObjectId(userId),
    categoryId: new ObjectId(categoryId),
    status: 'published'
});

// Nested updates are even more verbose.
const result = await collection('orders').updateOne(
    { _id: new ObjectId(orderId) },
    {
        $set: {
            'customer.userId': new ObjectId(customerId),
            'items.0.productId': new ObjectId(productId)
        }
    }
);
```

### Automatic Conversion in v1.3.0+

```javascript
// Converted automatically.
const user = await collection('users').findOne({
    _id: '507f1f77bcf86cd799439011'
});

// Application code stays compact.
const posts = await collection('posts').find({
    authorId: userId,        // Converted automatically.
    categoryId: categoryId,  // Converted automatically.
    status: 'published'
});

// Nested fields are converted too.
const result = await collection('orders').updateOne(
    { _id: orderId },  // Converted automatically.
    {
        $set: {
            'customer.userId': customerId,     // Converted automatically.
            'items.0.productId': productId     // Converted automatically.
        }
    }
);
```

---

## Conversion Rules

### Automatic Detection Conditions

monSQLize converts a string to `ObjectId` only when it satisfies all of these conditions:

1. It is exactly 24 characters long.
2. It contains only hexadecimal characters (`0-9`, `a-f`, `A-F`).
3. MongoDB accepts it as a valid `ObjectId`.
4. It is not a MongoDB field reference such as `"$userId"`.

Current stable behavior is value-based, not field-whitelist based. Internal helper patterns such as `_id` and `*Id` exist for compatibility with nested object handling, but they do not restrict conversion of valid bare string values. If traversal reaches a valid ObjectId-looking string, it can be converted regardless of the field name.

The converter also skips MongoDB expression operators such as `$expr`, `$function`, `$where`, and `$accumulator` to avoid changing executable expressions.

### Examples

```javascript
// Converted.
{
    _id: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439011',
    author_id: '507f1f77bcf86cd799439011',
    code: '1234567890abcdef12345678',
    postIds: ['507f1f77bcf86cd799439011', '508f1f77bcf86cd799439012'],
    category_ids: ['507f1f77bcf86cd799439013', '508f1f77bcf86cd799439014']
}

// Not converted.
{
    username: 'user123',                       // Regular string.
    email: 'test@example.com',                 // Not an ObjectId string.
    ref: '$userId'                             // MongoDB field reference.
}
```

---

## Configuration Options

### Enable or Disable Automatic Conversion

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    // Enable ObjectId auto conversion. This is the default for MongoDB.
    autoConvertObjectId: true
});
```

### Option Reference

| Value | Description |
|--------|-------------|
| `true` | Enables automatic conversion. This is the default for MongoDB. |
| `false` | Disables automatic conversion for the instance. |
| `{ enabled: true }` | Enables automatic conversion explicitly. |
| `{ enabled: false }` | Disables automatic conversion explicitly. |
| `{ excludeFields: ['token'] }` | Keeps matching field names or paths as strings. |
| `{ token: false }` | Keeps a specific field name or path as a string while preserving conversion elsewhere. |
| `{ maxDepth: 3 }` | Stops recursive conversion beyond the configured depth; values deeper than the limit are left unchanged. |

`maxDepth` is a traversal safety cap. If a very deep `$and` / `$or` tree or nested document contains ObjectId-looking strings beyond that depth, monSQLize leaves those strings as-is. Increase `maxDepth` for intentionally deep query shapes that still need automatic conversion.

---

## Usage Examples

### Basic Queries

```javascript
// findOne
const user = await collection('users').findOne({
    _id: '507f1f77bcf86cd799439011'
});

// find
const posts = await collection('posts').find({
    authorId: userId,
    categoryId: categoryId
});

// findOneById convenience method
const product = await collection('products').findOneById(
    '507f1f77bcf86cd799439011'
);
```

### Complex Filters

```javascript
// $in operator
const users = await collection('users').find({
    _id: {
        $in: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012',
            '507f1f77bcf86cd799439013'
        ]
    }
});

// $or operator
const docs = await collection('documents').find({
    $or: [
        { authorId: userId1 },
        { editorId: userId2 }
    ]
});

// Nested fields
const orders = await collection('orders').find({
    'customer.userId': customerId,
    'items.productId': productId
});
```

### Update Operations

```javascript
// updateOne
await collection('posts').updateOne(
    { _id: postId },
    {
        $set: {
            authorId: newAuthorId,
            'meta.createdBy': creatorId
        }
    }
);

// updateMany
await collection('comments').updateMany(
    { postId: postId },
    {
        $set: {
            postId: newPostId
        }
    }
);
```

### Delete Operations

```javascript
// deleteOne
await collection('users').deleteOne({
    _id: userId
});

// deleteMany
await collection('posts').deleteMany({
    authorId: authorId
});
```

---

## Supported Methods

ObjectId auto conversion is applied by these methods.

### Query Methods

- `find(query)`
- `findOne(query)`
- `findOneById(id)`
- `findByIds(ids)`
- `findPage(options)`
- `findAndCount(query)`
- `count(query)`
- `distinct(field, query)`

### Write Methods

- `insertOne(doc)`
- `insertMany(docs)`
- `updateOne(query, update)`
- `updateMany(query, update)`
- `replaceOne(query, doc)`
- `upsertOne(query, update)`
- `deleteOne(query)`
- `deleteMany(query)`

### Batch Methods

- `insertBatch(docs)`
- `updateBatch(query, update)`
- `deleteBatch(query)`

### Other Methods

- `aggregate(pipeline)`, including stages such as `$match` and `$lookup`
- `findOneAndUpdate(query, update)`
- `findOneAndDelete(query)`
- `findOneAndReplace(query, doc)`

---

## Advanced Configuration

### Current Stable Controls

The default behavior is value-based conversion: any valid 24-character hex string can be converted when traversal reaches it. You can keep the default and add escape hatches for fields that must remain strings:

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    autoConvertObjectId: {
        enabled: true,
        excludeFields: ['token', 'paymentHash', 'metadata.signature'],
        externalOrderId: false,
        maxDepth: 10
    }
});
```

Use `autoConvertObjectId: false` or `{ enabled: false }` for collections or code paths that must preserve every 24-character hex string. Use `excludeFields` or `{ fieldName: false }` when only specific business fields such as transaction hashes, idempotency keys, signatures, or external payment numbers must stay as strings.

### Handling Mixed String and ObjectId Identifiers

When a schema mixes ObjectId fields and business strings that can look like ObjectIds, prefer one of these approaches:

- Store those business values in a MongoDB type that cannot be confused with ObjectId values.
- Disable automatic conversion for that monSQLize instance, or exclude only the business fields that must remain strings.
- Use the underlying MongoDB collection directly for specialized paths that must preserve every string exactly.

### Scope Notes

Automatic conversion applies to query filters, insert documents, replace documents, common update operator payloads, delete filters, and aggregation pipelines. Update pipelines are left unchanged.

---

## Performance Notes

ObjectId auto conversion has a very small overhead:

### Performance Impact

- Query filter conversion: usually less than 1 ms per query.
- Single document conversion: usually less than 1 ms.
- Batch operation conversion: about 0.1 ms per document.

### Optimization Tips

Optimization tips:

1. Avoid very deep nesting.
   - Keep common query/update structures at five levels or fewer.
   - Consider flattening data that requires deeper traversal.

2. Disable automatic conversion for workloads that must preserve arbitrary 24-character hex strings.
   - Convert true ObjectId fields manually in those paths.
   - Keep mixed identifier fields out of automatic conversion paths.

3. Prefer batch methods when appropriate.
   - Use `insertBatch` instead of repeated `insertOne` calls.
   - Batch conversion is more efficient than repeated single-operation setup.

---

## FAQ

### Q1: How do I disable automatic conversion?

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    autoConvertObjectId: false
});
```

You can also use `{ enabled: false }`. Configure this at instance creation time. This setting now applies consistently across query filters, insert/replace documents, common update operator payloads, delete filters, and aggregation pipelines.

---

### Q2: How should I handle fields with mixed identifier types?

Some fields can contain either ObjectId values or regular strings.

```javascript
// Disable auto conversion for this instance.
autoConvertObjectId: false

// Decide manually.
const { ObjectId } = require('mongodb');

function isValidObjectIdString(str) {
    return typeof str === 'string' && /^[0-9a-fA-F]{24}$/.test(str);
}

const query = {
    externalId: isValidObjectIdString(externalId)
        ? new ObjectId(externalId)
        : externalId
};

// Option 3: normalize before querying.
function normalizeId(id) {
    if (isValidObjectIdString(id)) {
        return new ObjectId(id);
    }
    return id;
}

await collection('external').find({
    externalId: normalizeId(externalId)
});
```

Best practice:

- Avoid mixed identifier types in the data model when possible.
- If mixed types are unavoidable, disable automatic conversion for that instance or exclude the string-only fields with `excludeFields` / `{ field: false }`.
- Normalize identifier formats at the application boundary.

---

### Q3: Are `excludeFields` or field-map escape hatches supported?

Yes. Conversion remains value-based by default, but `excludeFields`, `{ fieldName: false }`, and `maxDepth` are supported escape hatches for string-only business fields.

---

### Q4: Does automatic conversion affect query performance?

No meaningful MongoDB query-performance impact is expected. Conversion happens before the query is sent to MongoDB and usually adds only about 0.1-1 ms of local processing.

---

### Q5: How can I confirm that a field was converted?

Use integration tests or MongoDB command monitoring to inspect the value that reaches the driver. The current converter does not emit per-field conversion logs.

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    autoConvertObjectId: true
});

const result = await collection('users').findOne({
    _id: '507f1f77bcf86cd799439011'
});
```

---

### Q6: Are ObjectId strings inside arrays converted?

Yes. This includes arrays used by operators such as `$in` and `$nin`.

```javascript
await collection('users').find({
    _id: {
        $in: [
            '507f1f77bcf86cd799439011',
            '507f1f77bcf86cd799439012'
        ]
        // Every array element is converted.
    }
});

await collection('posts').insertOne({
    authorId: '507f1f77bcf86cd799439011',
    tags: ['tag1', 'tag2'],
    // Array fields in documents are also converted.
    relatedIds: [
        '507f1f77bcf86cd799439012',
        '507f1f77bcf86cd799439013'
    ]
});
```

---

## Related Documents

- [find](./find.md)
- [findOne](./findOne.md)
- [updateOne](./update-one.md)
- [deleteOne](./delete-one.md)
- [Connection options](./connection.md)

---

**Last updated**: 2026-01-08  
**Feature availability**: v1.3.0+
