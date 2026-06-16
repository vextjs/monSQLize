# createIndex() - Create a single index

Create a single index, supporting all MongoDB indexing options.

---

## Table of Contents

- [Overview](#overview)
- [Syntax](#syntax)
- [Parameters](#parameters)
  - [keys (required)](#keys-required)
  - [options (optional)](#options-optional)
- [Return value](#return-value)
- [Detailed explanation of index options](#detailed-explanation-of-index-options)
- [unique - unique index](#unique-unique-index)
- [sparse - sparse index](#sparse-sparse-index)
- [expireAfterSeconds - TTL index](#expireafterseconds-ttl-index)
- [partialFilterExpression - partial index](#partialfilterexpression-partial-index)
- [collation - collation](#collation-collation)
- [hidden - hidden index](#hidden-hidden-index)
- [wildcardProjection - wildcard projection](#wildcardprojection-wildcard-projection)
- [weights - text index weights](#weights-text-index-weights)
- [Code Example](#code-example)
- [Example 1: Create a basic index](#example-1-create-a-basic-index)
- [Example 2: Create a unique index](#example-2-create-a-unique-index)
- [Example 3: Creating a composite index](#example-3-creating-a-composite-index)
- [Example 4: Create a TTL index](#example-4-create-a-ttl-index)
- [Example 5: Create partial index](#example-5-create-partial-index)
- [Example 6: Create a sparse index](#example-6-create-a-sparse-index)
- [Example 7: Creating a text index](#example-7-creating-a-text-index)
- [Example 8: Creating a hidden index](#example-8-creating-a-hidden-index)
- [Example 9: Creating a wildcard index](#example-9-creating-a-wildcard-index)
- [Example 10: Error handling](#example-10-error-handling)
- [Error handling](#error-handling)
- [Common mistakes](#common-mistakes)
  - [1. The index already exists](#1-the-index-already-exists)
  - [2. The index key is invalid](#2-the-index-key-is-invalid)
  - [3. Unique index conflict](#3-unique-index-conflict)
  - [4. Unsupported index type](#4-unsupported-index-type)
- [Performance recommendations](#performance-recommendations)
- [When to create an index](#when-to-create-an-index)
- [Index overhead](#index-overhead)
- [ESR Principles](#esr-principles)
- [Best Practices](#best-practices)
- [1. Index naming convention](#1-index-naming-convention)
- [2. Index order is important](#2-index-order-is-important)
- [3. Avoid excessive indexing](#3-avoid-excessive-indexing)
- [4. Index coverage query](#4-index-coverage-query)
- [5. Precautions for production environment](#5-precautions-for-production-environment)
- [Related methods](#related-methods)
- [Reference resources](#reference-resources)

## Overview

The `createIndex()` method is used to create a single index on a collection. Indexes can significantly improve query performance and support a variety of types and options.

**Usage Scenario**:
- Optimize query performance
- Implement uniqueness constraints
- Automatically delete expired documents (TTL)
- Support full text search
- Implement partial index and sparse index

---

## Syntax

```javascript
await collection(collectionName).createIndex(keys, options)
```


## Parameters


### keys (required)

An index key definition object specifies the fields to be indexed and their sorting direction.

**Type**: `Object`

**Format**:
```javascript
{
  field1: 1,    //Ascending order
  field2: -1,   //descending order
  field3: "text" //Text index
}
```

**Allowed values**:
- `1` - ascending index
- `-1` - Descending index
- `"text"` - text index
- `"2d"` - 2D geospatial index
- `"2dsphere"` - 2D spherical geospatial index
- `"hashed"` - Hash index
- `"columnstore"` - columnstore index (MongoDB 6.0+)


### options (optional)

Index configuration options object.

**Type**: `Object`

**Option list**:

| Options | Type | Default | Description |
|------|------|--------|------|
| `name` | String | Automatically generated | Index name |
| `unique` | Boolean | false | Whether it is a unique index |
| `sparse` | Boolean | false | Whether it is a sparse index |
| `expireAfterSeconds` | Number | - | TTL index expiration time (seconds) |
| `partialFilterExpression` | Object | - | Partial index filter expression |
| `collation` | Object | - | Sorting Rules |
| `hidden` | Boolean | false | Whether to hide the index (MongoDB 4.4+) |
| `background` | Boolean | - | Background creation (deprecated but retained for compatibility) |
| `wildcardProjection` | Object | - | Wildcard projection |
| `weights` | Object | - | Text index weight |
| `default_language` | String | "english" | Text index default language |
| `language_override` | String | "language" | Text index language coverage field |


## Return value

**Type**: `Promise<Object>`

**Format**:
```javascript
{
  name: "index_name"  //Created index name
}
```

---

## Detailed explanation of index options


## unique - unique index

Ensure that the indexed field's value is unique in the collection.

```javascript
await collection("users").createIndex(
  { email: 1 },
  { unique: true }
);
```

**Features**:
- Prevent duplicate values from being inserted
- Automatically reject duplicate data (throws error code 11000)
- Suitable for unique identifiers such as email, user name, order number, etc.

**Note**:
- If the field already has duplicate values, creating a unique index will fail.
- null values are also considered unique (there can only be one null)


## sparse - sparse index

Only documents containing the field are indexed, documents with missing fields are ignored.

```javascript
await collection("users").createIndex(
  { phone: 1 },
  { sparse: true }
);
```

**Features**:
- Save storage space
- Works with optional fields
- Only documents containing this field are included in the query

**Comparison**:
- Normal index: index all documents (missing fields are treated as null)
- Sparse index: only index documents containing fields


## expireAfterSeconds - TTL index

Automatically delete expired documents, suitable for sessions, logs, and temporary data.

```javascript
await collection("sessions").createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 3600 }  //Expires in 1 hour
);
```

**Features**:
- MongoDB background thread automatically cleans up
- Cleaning cycle is about 60 seconds
- Applies only to Date type fields

**Note**:
- Documents may be deleted with a delay of up to 60 seconds after expiration
- cannot be used with _id field
- Cannot conflict with other index types (such as unique indexes)


## partialFilterExpression - partial index

Only index documents that meet the criteria, reducing index size.

```javascript
await collection("users").createIndex(
  { age: 1 },
  {
    partialFilterExpression: {
      age: { $gte: 18 }
    }
  }
);
```

**Features**:
- Save storage space
- Improve index maintenance efficiency
- Only valid for queries that meet the conditions

**Supported Operators**:
- `$eq`, `$gt`, `$gte`, `$lt`, `$lte`
- `$exists`, `$type`
- `$and`, `$or`


## collation - collation

Specify string comparison and sorting rules, support multiple languages.

```javascript
await collection("products").createIndex(
  { name: 1 },
  {
    collation: {
      locale: "zh",  //Chinese
      strength: 2    //Ignore case and accents
    }
  }
);
```

**Commonly used locales**:
- `"en"` - English
- `"zh"` - Chinese
- `"es"` - Spanish
- `"fr"` - French

**strength level**:
- `1` - Compares base characters only
- `2` - compare base characters and accents (default)
- `3` - compare case


## hidden - hidden index

The index exists but is not used by queries, used to test the impact of index deletion.

```javascript
await collection("users").createIndex(
  { email: 1 },
  { hidden: true }
);
```

**Use**:
- Test the impact of deleting indexes
- Temporarily disable indexing without deleting
- A/B testing index performance

**Note**:
- MongoDB 4.4+ support
- Indexes are still maintained (updated on writes)
- Can be unhidden via `unhideIndex()`


## wildcardProjection - wildcard projection

Use with wildcard indexes to specify fields to include or exclude.

```javascript
await collection("products").createIndex(
  { "attributes.$**": 1 },
  {
    wildcardProjection: {
      "attributes.color": 1,
      "attributes.size": 1
    }
  }
);
```

**Features**:
- Works with dynamic fields
- Flexible indexing of nested documents
- Control index field range


## weights - text index weights

Specifies the weight of each field in the text index, affecting the search relevance score.

```javascript
await collection("articles").createIndex(
  {
    title: "text",
    content: "text"
  },
  {
    weights: {
      title: 10,    //Titles carry more weight
      content: 1
    }
  }
);
```

**Default weight**: 1

**Impact**:
- The higher the weight, the higher the score when matching
- Influence the ranking of search results

---

## Code Example


## Example 1: Create a basic index

```javascript
import MonSQLize from 'monsqlize';
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

//Ascending index
const result = await collection("users").createIndex({ email: 1 });
console.log(result);
// { name: "email_1" }

//Descending index
await collection("posts").createIndex({ publishedAt: -1 });
```


## Example 2: Create a unique index

```javascript
//Unique mailbox index
await collection("users").createIndex(
  { email: 1 },
  { unique: true, name: "email_unique" }
);

//Attempts to insert duplicate mailboxes will fail
try {
  await collection("users").insertOne({ email: "test@example.com" });
  await collection("users").insertOne({ email: "test@example.com" });
} catch (err) {
  console.error("Duplicate key error:", err.message);
  // Error: E11000 duplicate key error
}
```


## Example 3: Creating a composite index

```javascript
//Composite index (multiple fields)
await collection("orders").createIndex({
  userId: 1,
  status: 1
});

//Optimize query
const orders = await collection("orders").find({
  userId: "user123",
  status: "pending"
});
```

**Prefix principle of composite index**:
```javascript
//Index: { a: 1, b: 1, c: 1 }

//✓ Use index
find({ a: 1 })
find({ a: 1, b: 1 })
find({ a: 1, b: 1, c: 1 })

//✗ Do not use indexes
find({ b: 1 })
find({ c: 1 })
find({ b: 1, c: 1 })
```


## Example 4: Create a TTL index

```javascript
//Session automatically expires (1 hour)
await collection("sessions").createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 3600 }
);

//Insert session
await collection("sessions").insertOne({
  sessionId: "abc123",
  userId: "user1",
  createdAt: new Date()  //Automatically delete after 1 hour
});
```


## Example 5: Create partial index

```javascript
//Index only adult users
await collection("users").createIndex(
  { age: 1 },
  {
    partialFilterExpression: { age: { $gte: 18 } },
    name: "age_adult_only"
  }
);

//Query adult users (using index)
const adults = await collection("users").find({ age: { $gte: 18 } });

//Query for underage users (without using index)
const minors = await collection("users").find({ age: { $lt: 18 } });
```


## Example 6: Create a sparse index

```javascript
//Only index users with phone numbers
await collection("users").createIndex(
  { phone: 1 },
  { sparse: true }
);

//Insert data
await collection("users").insertMany([
  { name: "Alice", phone: "1234567890" },  //indexed
  { name: "Bob" },                          //Not indexed (no phone)
  { name: "Charlie", phone: "0987654321" }  //indexed
]);
```


## Example 7: Creating a text index

```javascript
//Full text search index
await collection("articles").createIndex({
  title: "text",
  content: "text"
}, {
  weights: {
    title: 10,
    content: 1
  },
  default_language: "english"
});

//Use text search
const results = await collection("articles").find({
  $text: { $search: "mongodb indexing" }
});
```


## Example 8: Creating a hidden index

```javascript
//Create hidden index (for testing)
await collection("users").createIndex(
  { email: 1 },
  { hidden: true, name: "email_hidden" }
);

//The query will not use this index
const users = await collection("users").find({ email: "test@example.com" });
```


## Example 9: Creating a wildcard index

```javascript
//Index all nested fields
await collection("products").createIndex({ "$**": 1 });

//Index all fields under a specific path
await collection("products").createIndex(
  { "attributes.$**": 1 },
  {
    wildcardProjection: {
      "attributes.color": 1,
      "attributes.size": 1
    }
  }
);
```


## Example 10: Error handling

```javascript
try {
  await collection("users").createIndex(
    { email: 1 },
    { unique: true, name: "email_unique" }
  );
} catch (err) {
  if (err.code === 'INVALID_ARGUMENT') {
    console.error("Invalid index specification:", err.message);
  } else if (err.codeName === 'IndexOptionsConflict' || err.codeName === 'IndexKeySpecsConflict') {
    console.error("Index definition conflicts with an existing index:", err.message);
  } else {
    throw err;
  }
}
```

---

## Error handling


## Common mistakes


### 1. The index already exists

**Error code**: MongoDB driver/server error code when there is a name or option conflict. Creating the exact same index definition is usually idempotent and may simply return the existing index name.
**Message**: Driver/server dependent, such as an index option or key-spec conflict.

**Cause**: Attempting to create an index that conflicts with an existing index name, key, or options.

**Solution**:
```javascript
//First check existing indexes and compare the key/options you care about.
const indexes = await collection("users").listIndexes();
const exists = indexes.some(idx => idx.name === 'email_1');

if (!exists) {
  await collection("users").createIndex({ email: 1 });
}

//If you intentionally rely on driver errors, inspect the driver code/codeName.
try {
  await collection("users").createIndex({ email: 1 });
} catch (err) {
  if (err.codeName === 'IndexOptionsConflict' || err.codeName === 'IndexKeySpecsConflict') {
    console.error("Resolve the existing index conflict before retrying");
  } else {
    throw err;
  }
}
```


### 2. The index key is invalid

**Error code**: `INVALID_ARGUMENT`
**Message**: "Invalid value for index key"

**Cause**: Unsupported index value (such as 2, 0, etc.) was used

**Solution**:
```javascript
//✗ Error
await collection("users").createIndex({ email: 2 });

//✓ Correct
await collection("users").createIndex({ email: 1 });   //Ascending order
await collection("users").createIndex({ email: -1 });  //descending order
```


### 3. Unique index conflict

**Error code**: MongoDB 11000
**Message**: "E11000 duplicate key error"

**Cause**: When creating a unique index, there are already duplicate values in the collection

**Solution**:
```javascript
//1. Clean up duplicate data first
const pipeline = [
  { $group: { _id: "$email", count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } }
];
const duplicates = await collection("users").aggregate(pipeline);

//2. Handle duplicate data
for (const dup of duplicates) {
  //Keep one, delete others
  const docs = await collection("users").find({ email: dup._id });
  for (let i = 1; i < docs.length; i++) {
    await collection("users").deleteOne({ _id: docs[i]._id });
  }
}

//3. Create a unique index
await collection("users").createIndex({ email: 1 }, { unique: true });
```


### 4. Unsupported index type

**Error code**: MongoDB driver/server error code.
**Message**: Driver/server dependent, such as an unsupported index type or option.

**Reason**: The MongoDB version does not support this index type

**Solution**:
- Check MongoDB version
- Upgrade MongoDB to a supported version
- Use alternative index types

---

## Performance recommendations


## When to create an index

**Index should be created**:
- ✅ Frequently queried fields
- ✅ Sorting field (ORDER BY)
- ✅Group field (GROUP BY)
- ✅ Join fields (JOIN)
- ✅ Unique constraint field

**Index should not be created**:
- ❌ Fields that are rarely queried
- ❌ Frequently updated fields
- ❌ Low cardinality fields (e.g. gender, boolean)
- ❌ Small table (<1000 records)


## Index overhead

**Storage Overhead**:
- Each index takes up additional storage space
- Compound indexes take up more space than single-field indexes
- Text indexes take up the most space

**Write Overhead**:
- Each write requires updating all relevant indexes
- The more indexes, the slower the write
- Balance query performance and write performance

**Maintenance Recommendations**:
```javascript
//1. Regularly check index usage
const stats = await collection("users").find({ email: "test@example.com" })
  .explain('executionStats');

console.log("Index usage:", stats.executionStats.totalKeysExamined);
console.log("Document scanning:", stats.executionStats.totalDocsExamined);

//2. Delete unused indexes
const indexes = await collection("users").listIndexes();
//Delete unnecessary indexes after analysis
await collection("users").dropIndex("unused_index");
```


## ESR Principles

Follow **ESR principles** when designing composite indexes:

1. **Equality**: put the equal value query field first
2. **Sort**: The sorting field is placed in the middle
3. **Range**: The range query field is placed at the end

```javascript
//Query: { status: "active", age: { $gte: 18 } } Sort: { createdAt: -1 }

//✓ Optimal index design
await collection("users").createIndex({
  status: 1,      // Equality
  createdAt: -1,  // Sort
  age: 1          // Range
});

//✗ Sub-optimal index design
await collection("users").createIndex({
  age: 1,         //Range first (not recommended)
  status: 1,
  createdAt: -1
});
```

---

## Best Practices


## 1. Index naming convention

```javascript
//✓ Good naming
await collection("users").createIndex(
  { email: 1 },
  { name: "email_unique", unique: true }
);

await collection("orders").createIndex(
  { userId: 1, status: 1 },
  { name: "user_status_idx" }
);

//✗ Bad naming (using auto-generated names)
await collection("users").createIndex({ email: 1 });
//Generate: email_1 (not descriptive enough)
```


## 2. Index order is important

```javascript
//Index A: { userId: 1, createdAt: -1 }
//Index B: { createdAt: -1, userId: 1 }
//These are two different indexes!

//The choice depends on the query mode
//If the query is usually: find({ userId: "xxx" }).sort({ createdAt: -1 })
//Use index A

//If the query is usually: find({}).sort({ createdAt: -1 })
//Use index B
```


## 3. Avoid excessive indexing

```javascript
//✗ Bad: Creating too many indexes
await collection("users").createIndex({ email: 1 });
await collection("users").createIndex({ name: 1 });
await collection("users").createIndex({ age: 1 });
await collection("users").createIndex({ city: 1 });
//... 10+ indexes

//✓ Good: Create necessary indexes
await collection("users").createIndex({ email: 1 }, { unique: true });
await collection("users").createIndex({ city: 1, age: -1 });  //composite index
```


## 4. Index coverage query

```javascript
//Create covering index
await collection("users").createIndex({ name: 1, email: 1, age: 1 });

//Covered query (only accesses the index, not the document)
const users = await collection("users").find(
  { name: "Alice" },
  { projection: { name: 1, email: 1, age: 1, _id: 0 } }
);
//Best performance: only reads the index, not the document
```


## 5. Precautions for production environment

```javascript
//Preflight before creating indexes in production.
const indexes = await collection("users").listIndexes();
const hasEmailIndex = indexes.some((idx) => idx.name === "email_unique");

if (!hasEmailIndex) {
  //Run this during a maintenance or low-traffic window.
  await collection("users").createIndex(
    { email: 1 },
    {
      unique: true,
      name: "email_unique"
    }
  );
}
```

Do not rely on `background: true` as the production safety control. Modern MongoDB index builds still consume memory, temporary disk, and locks at specific phases. For large collections, pre-check existing indexes, clean conflicting data first, run during a low-traffic window, and monitor the database while the build is running.

```javascript
//Monitor index creation progress
const operations = await db.admin().command({
  currentOp: true,
  "command.createIndexes": { $exists: true }
});
```

For Model-declared indexes, prefer the Model ensure API:

```javascript
// Production services should usually set autoIndex: false in the MonSQLize
// or model configuration, then run explicit preflight/ensure during deployment.
const plan = await User.ensureIndexes({ dryRun: true });

if (plan.conflicts.length === 0) {
  await User.ensureIndexes({ throwOnError: true });
}
```

---

## Related methods

- [`createIndexes()`](./create-indexes.md) - Create multiple indexes in batches
- [`listIndexes()`](./list-indexes.md) - List all indexes of the collection
- [`dropIndex()`](./drop-index.md) - Delete the specified index
- [`dropIndexes()`](./drop-index.md#dropindexes-drop-all-indexes) - delete all indexes
- [Complete Guide to Index Management](./collection-management.md) - Comprehensive Documentation on Index Management

---

## Reference resources

- [MongoDB Index Document](https://www.mongodb.com/docs/manual/indexes/)
- [Index type](https://www.mongodb.com/docs/manual/indexes/#index-types)
- [Index Attribute](https://www.mongodb.com/docs/manual/indexes/#index-properties)
- [ESR Principle](https://www.mongodb.com/docs/manual/tutorial/equality-sort-range-rule/)
