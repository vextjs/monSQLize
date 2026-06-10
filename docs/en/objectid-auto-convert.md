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

Starting from v1.3.0, monSQLize supports **automatic ObjectId string conversion**. When you pass ObjectId-like strings in query filters, update documents, or delete filters, monSQLize converts eligible values to MongoDB `ObjectId` instances before the operation is executed.

Key benefits:

- Simplifies application code: no manual `new ObjectId()` calls for common fields.
- Improves developer ergonomics: string IDs can be passed directly.
- Detects valid ObjectId strings automatically.
- Handles nested objects and arrays.
- Keeps conversion controllable through excluded fields and custom field patterns.

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
3. The field name matches an ObjectId field pattern.

### Default Field Patterns

The following field names are converted by default:

- `_id`
- `*Id`, such as `userId`, `postId`, or `categoryId`
- `*_id`, such as `user_id` or `post_id`
- `*Ids`, such as `userIds` or `postIds`
- `*_ids`, such as `user_ids` or `post_ids`

### Examples

```javascript
// Converted.
{
    _id: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439011',
    author_id: '507f1f77bcf86cd799439011',
    postIds: ['507f1f77bcf86cd799439011', '508f1f77bcf86cd799439012'],
    category_ids: ['507f1f77bcf86cd799439013', '508f1f77bcf86cd799439014']
}

// Not converted.
{
    username: 'user123',                       // Regular string.
    email: 'test@example.com',                 // Not an ObjectId string.
    code: '1234567890abcdef12345678'           // Looks valid, but the field name does not match.
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

    // Configure ObjectId auto conversion.
    autoConvertObjectId: {
        enabled: true,

        // Do not convert these fields.
        excludeFields: ['code', 'token'],

        // Additional field-name patterns.
        customFieldPatterns: [
            /^ref/,           // Fields starting with ref.
            /Reference$/      // Fields ending with Reference.
        ],

        // Maximum traversal depth.
        maxDepth: 10
    }
});
```

### Option Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enables automatic conversion. |
| `excludeFields` | string[] | `[]` | Field names that should never be converted. |
| `customFieldPatterns` | RegExp[] | `[]` | Additional field-name patterns to convert. |
| `maxDepth` | number | `10` | Maximum recursive traversal depth. |

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

### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `excludeFields` | string[] | `[]` | Field names that should not be converted. |
| `customFieldPatterns` | RegExp[] | `[]` | Regular expressions for additional convertible field names. |
| `maxDepth` | number | `10` | Maximum recursion depth for conversion. |

### Usage Examples (Advanced Configuration)

#### 1. Excluding Specific Fields

Some fields may look like ObjectId values but are not MongoDB ObjectIds.

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    autoConvertObjectId: {
        enabled: true,
        excludeFields: [
            // Exclude these fields even if they look like ObjectIds.
            'token',
            'code',
            'sessionId',
            'traceId',
            'metadata.externalId',
            'legacyId'
        ]
    }
});

// Usage example.
await collection('sessions').find({
    userId: userId,          // Converted.
    sessionId: sessionId     // Not converted.
});
```

Notes:

- `excludeFields` supports dotted paths such as `metadata.externalId`.
- Exclusions take precedence over default rules and custom patterns.
- List every non-ObjectId `*Id` field explicitly when possible.

#### 2. Custom Field Patterns

Use custom patterns to extend the default matching rules.

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    autoConvertObjectId: {
        enabled: true,
        // Custom field matching patterns.
        customFieldPatterns: [
            /^.*Ref$/,        // userRef, postRef
            /^ref/,           // refUser, refPost
            /Reference$/,     // userReference
            /^parent/,        // parentId, parentNode
            /^child/,         // childId, childNode
            /^related\w+Id$/  // relatedUserId
        ]
    }
});

// Usage example.
await collection('nodes').find({
    userRef: userId,
    refUser: userId,
    userReference: userRefId,
    parentId: parentId,
    childId: childId,
    relatedUserId: relatedId
});
```

Priority order:

1. `excludeFields`: never convert.
2. `customFieldPatterns`: convert fields matched by custom patterns.
3. Default patterns: `_id`, `*Id`, `*Ids`, `*_id`, and `*_ids`.

#### 3. Limiting Recursion Depth

Use `maxDepth` to avoid expensive traversal in deeply nested objects.

```javascript
// Example: deeply nested object.
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    autoConvertObjectId: {
        enabled: true,
        maxDepth: 5
    }
});

await collection('complex').find({
    level1: {
        level2: {
            level3: {
                level4: {
                    level5: {
                        userId: userId  // Converted at depth 5.
                    }
                }
            }
        }
    }
});

await collection('deep').find({
    level1: { level2: { level3: { level4: { level5: { level6: {
        // Nested data deeper than maxDepth is not converted.
        userId: userId  // Not converted beyond maxDepth.
    }}}}}}
});
```

Depth notes:

- The default `maxDepth = 10`, which is enough for most documents.
- Use a smaller value such as `5` for very deep data structures.
- Fields beyond the limit are left unchanged.

### Configuration Verification Example

#### Verifying That the Configuration Takes Effect

```javascript
// Create a test query.
const query = {
    userId: '507f1f77bcf86cd799439011',
    sessionId: '507f1f77bcf86cd799439011',
    metadata: {
        externalId: '507f1f77bcf86cd799439011'
    }
};

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
    logger: console,
    autoConvertObjectId: {
        enabled: true,
        excludeFields: ['sessionId', 'metadata.externalId']
    }
});

// Execute the query with logging enabled.
const result = await collection('users').findOne(query);

// Inspect conversion results.
console.log('userId converted:', result.userId instanceof ObjectId);
console.log('sessionId left as string:', typeof result.sessionId === 'string');
console.log('externalId left as string:', typeof result.metadata.externalId === 'string');
```

### Common Configuration Scenarios

#### Scenario 1: Third-Party Integrations

```javascript
// Third-party system IDs may be 24 hex characters but not MongoDB ObjectIds.
autoConvertObjectId: {
    enabled: true,
    excludeFields: [
        'stripeCustomerId',
        'paypalOrderId',
        'externalSystemId',
        'legacyUserId'
    ]
}
```

#### Scenario 2: Multi-Tenant Systems

```javascript
// Tenant IDs use a custom format.
autoConvertObjectId: {
    enabled: true,
    excludeFields: [
        'tenantId',
        'organizationId'
    ],
    customFieldPatterns: [
        /^.*ResourceId$/
    ]
}
```

#### Scenario 3: Performance-Sensitive Paths

```javascript
// Limit recursion depth to improve performance.
autoConvertObjectId: {
    enabled: true,
    maxDepth: 3,
    excludeFields: [
        'metadata.tracking',
        'debug.traceId'
    ]
}
```

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

2. Use `excludeFields` deliberately.
   - Exclude fields that are clearly not ObjectIds.
   - Reduce unnecessary checks on mixed identifier fields.

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

    autoConvertObjectId: {
        enabled: false
    }
});
```

Changing the instance after construction is possible but not recommended:

```javascript
msq.autoConvertConfig.enabled = false;
```

---

### Q2: How should I handle fields with mixed identifier types?

Some fields can contain either ObjectId values or regular strings.

```javascript
// Option 1: exclude the field.
autoConvertObjectId: {
    excludeFields: ['externalId']
}

// Option 2: decide manually.
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
- If mixed types are unavoidable, prefer `excludeFields` plus explicit conversion.
- Normalize identifier formats at the application boundary.

---

### Q3: What is the priority order for custom field patterns?

Priority from highest to lowest:

1. `excludeFields`: explicitly excluded fields are never converted.
2. `customFieldPatterns`: custom regular expressions.
3. Default patterns: `_id`, `*Id`, `*Ids`, `*_id`, and `*_ids`.

```javascript
// Example: priority demonstration.
autoConvertObjectId: {
    excludeFields: ['sessionId'],
    customFieldPatterns: [/Id$/]
}

await collection('test').find({
    userId: '507f1f77bcf86cd799439011',     // Converted.
    sessionId: '507f1f77bcf86cd799439011',  // Not converted.
    postId: '507f1f77bcf86cd799439011'      // Converted.
});
```

---

### Q4: Does automatic conversion affect query performance?

No meaningful MongoDB query-performance impact is expected. Conversion happens before the query is sent to MongoDB and usually adds only about 0.1-1 ms of local processing.

---

### Q5: How can I confirm that a field was converted?

Enable logging and inspect the conversion messages:

```javascript
const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },

    logger: console,

    autoConvertObjectId: {
        enabled: true
    }
});

// Logs show conversion details when the query is executed.
await collection('users').findOne({ _id: '507f1f77bcf86cd799439011' });
// Example debug output: ObjectId converted: _id
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
