# createIndexes() - Create indexes in batches

Create multiple indexes at once to improve deployment efficiency.

---

## Table of Contents

- [Overview](#overview)
- [Syntax](#syntax)
- [Parameters](#parameters)
  - [indexSpecs (required)](#indexspecs-required)
- [Return value](#return-value)
- [Comparison with createIndex](#comparison-with-createindex)
- [Code Example](#code-example)
- [Example 1: Basic batch creation](#example-1-basic-batch-creation)
- [Example 2: Mixed index types](#example-2-mixed-index-types)
- [Example 3: Application initialization](#example-3-application-initialization)
- [Example 4: Deployment script](#example-4-deployment-script)
- [Example 5: Error handling](#example-5-error-handling)
- [Partial failure handling](#partial-failure-handling)
- [Behavior description](#behavior-description)
- [Recommended practices](#recommended-practices)
- [Performance optimization](#performance-optimization)
- [1. Batch vs single](#1-batch-vs-single)
- [2. Background creation](#2-background-creation)
- [Best Practices](#best-practices)
- [1. Configuration management](#1-configuration-management)
- [2. Environmental distinction](#2-environmental-distinction)
- [3. Version control](#3-version-control)
- [Related methods](#related-methods)
- [Reference resources](#reference-resources)

## Overview

The `createIndexes()` method is used to create multiple indexes in batches. Compared with calling `createIndex()` multiple times, batch creation is more efficient and is especially suitable for initial deployment and index maintenance.

**Usage Scenario**:
- Application initial deployment
- Database migration
- Index batch maintenance
- Quickly build a test environment

---

## Syntax

```javascript
await collection(collectionName).createIndexes(indexSpecs)
```


## Parameters


### indexSpecs (required)

Index specification array, defining an index for each element.

**Type**: `Array<Object>`

**Format**:
```javascript
[
  {
    key: { field1: 1 },      //Index key (required)
    name: "index_name",       //Index name (optional)
    unique: true,             //Unique index (optional)
    //...other indexing options
  },
  //...more index
]
```

**Index specification fields**:

| Field | Type | Required | Description |
|------|------|------|------|
| `key` | Object | ✅ | Index key definition |
| `name` | String | ❌ | Index name (automatically generated if not specified) |
| `unique` | Boolean | ❌ | Whether the index is unique |
| `sparse` | Boolean | ❌ | Whether to use sparse index |
| `expireAfterSeconds` | Number | ❌ | TTL expiration time |
| `partialFilterExpression` | Object | ❌ | Partial index filter conditions |
| `collation` | Object | ❌ | Sorting Rules |
| Other options | - | ❌ | See [createIndex](./create-index.md) |


## Return value

**Type**: `Promise<Array<String>>`

Returns the created array of index names.

**Format**:
```javascript
["email_1", "age_1", "city_1_age_-1"]
```

---

## Comparison with createIndex

| Properties | createIndex | createIndexes |
|------|-------------|---------------|
| **Create Quantity** | Single | Multiple |
| **Network round trip** | Once at a time | Once |
| **Performance** | Slower | Faster |
| **Applicable scenarios** | Single index | Batch creation |
| **Atomicity** | Single atom | Batch of atoms |

**Performance comparison example**:
```javascript
//Method 1: Create one by one (3 network round-trips)
await collection("users").createIndex({ email: 1 });
await collection("users").createIndex({ age: 1 });
await collection("users").createIndex({ city: 1 });

//Method 2: Batch creation (1 network round trip) ✓ Faster
await collection("users").createIndexes([
  { key: { email: 1 } },
  { key: { age: 1 } },
  { key: { city: 1 } }
]);
```

---

## Code Example


## Example 1: Basic batch creation

```javascript
import MonSQLize from 'monsqlize';
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

//Create indexes in batches
const result = await collection("users").createIndexes([
  { key: { email: 1 } },
  { key: { age: 1 } },
  { key: { createdAt: -1 } }
]);

console.log("Index created:", result);
// ["email_1", "age_1", "createdAt_-1"]
```


## Example 2: Mixed index types

```javascript
//Create different types of indexes
await collection("users").createIndexes([
  //unique index
  {
    key: { email: 1 },
    unique: true,
    name: "email_unique"
  },
  //composite index
  {
    key: { city: 1, age: -1 },
    name: "city_age_idx"
  },
  //TTL index
  {
    key: { createdAt: 1 },
    expireAfterSeconds: 86400,  //24 hours
    name: "session_ttl"
  },
  //sparse index
  {
    key: { phone: 1 },
    sparse: true
  }
]);
```


## Example 3: Application initialization

```javascript
//Initialize index when application starts
async function initializeIndexes() {
  console.log("Initialize database index...");

  //Users collection
  await collection("users").createIndexes([
    { key: { email: 1 }, unique: true, name: "email_unique" },
    { key: { username: 1 }, unique: true, name: "username_unique" },
    { key: { status: 1 }, name: "status_idx" },
    { key: { createdAt: -1 }, name: "created_idx" }
  ]);
  console.log("✓ Users index has been created");

  //Products collection
  await collection("products").createIndexes([
    { key: { sku: 1 }, unique: true },
    { key: { category: 1, price: -1 } },
    { key: { name: "text" } }
  ]);
  console.log("✓ Products index has been created");

  //Orders collection
  await collection("orders").createIndexes([
    { key: { userId: 1, status: 1 } },
    { key: { orderNumber: 1 }, unique: true },
    { key: { createdAt: -1 } }
  ]);
  console.log("✓ Orders index has been created");

  console.log("✓ All index initialization completed");
}

//Called when the application starts
await initializeIndexes();
```


## Example 4: Deployment script

```javascript
//Deployment script: Create or update index
async function deployIndexes() {
  const indexDefinitions = {
    users: [
      { key: { email: 1 }, unique: true, name: "email_unique" },
      { key: { "profile.city": 1, "profile.age": 1 } }
    ],
    products: [
      { key: { category: 1, price: -1 } },
      { key: { tags: 1 } }
    ]
  };

  for (const [collName, indexes] of Object.entries(indexDefinitions)) {
    try {
      //Get existing index
      const existing = await collection(collName).listIndexes();
      const existingNames = existing.map(idx => idx.name);

      //Filter out the indexes that need to be created
      const toCreate = indexes.filter(idx => {
        const name = idx.name || Object.keys(idx.key).join('_');
        return !existingNames.includes(name);
      });

      if (toCreate.length > 0) {
        await collection(collName).createIndexes(toCreate);
        console.log(`✓ ${collName}: ${toCreate.length} indexes created`);
      } else {
        console.log(`✓ ${collName}: all indexes already exist`);
      }
    } catch (err) {
      console.error(`✗ ${collName}: ${err.message}`);
    }
  }
}

await deployIndexes();
```


## Example 5: Error handling

```javascript
try {
  const result = await collection("users").createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { age: 1 } }
  ]);

  console.log("✓ Index creation successful:", result);
} catch (err) {
  if (err.code === 'MONGODB_ERROR') {
    if (err.message.includes('Index already exists')) {
      console.log("Part of the index already exists");
    } else if (err.message.includes('duplicate key')) {
      console.error("There are duplicate values in the data and a unique index cannot be created");
    } else {
      console.error("Creation failed:", err.message);
    }
  }
}
```

---

## Partial failure handling


## Behavior description

MongoDB's `createIndexes` operation has the following characteristics:

**Atomicity**:
- Batch operations are executed as a single command
- If an index fails, the entire operation fails
- Indexes created will be retained (will not be rolled back)

**Failure Scenario**:
```javascript
//Assume email_1 index already exists
await collection("users").createIndexes([
  { key: { email: 1 } },      //failed (already exists)
  { key: { age: 1 } },         //will not be executed
  { key: { city: 1 } }         //will not be executed
]);
//The entire operation fails, the age and city indexes are not created
```


## Recommended practices

```javascript
//Check and create one by one
async function safeCreateIndexes(collectionName, indexSpecs) {
  const results = {
    created: [],
    skipped: [],
    failed: []
  };

  //Get existing index
  const existing = await collection(collectionName).listIndexes();
  const existingNames = existing.map(idx => idx.name);

  for (const spec of indexSpecs) {
    const indexName = spec.name || generateIndexName(spec.key);

    //Skip existing indexes
    if (existingNames.includes(indexName)) {
      results.skipped.push(indexName);
      continue;
    }

    //try to create
    try {
      await collection(collectionName).createIndex(spec.key, spec);
      results.created.push(indexName);
    } catch (err) {
      results.failed.push({ indexName, error: err.message });
    }
  }

  return results;
}

//use
const results = await safeCreateIndexes("users", [
  { key: { email: 1 }, unique: true },
  { key: { age: 1 } },
  { key: { city: 1 } }
]);

console.log("Create:", results.created);
console.log("Skip:", results.skipped);
console.log("Failure:", results.failed);
```

---

## Performance optimization


## 1. Batch vs single

**Test comparison** (create 10 indexes):
```javascript
const indexes = [
  { key: { field1: 1 } },
  { key: { field2: 1 } },
  //... 8 more
];

//Method 1: Create one by one
console.time('Create one by one');
for (const idx of indexes) {
  await collection("test").createIndex(idx.key);
}
console.timeEnd('Create one by one');
//Create one by one: ~2000ms

//Method 2: Create in batches
console.time('Create in batches');
await collection("test").createIndexes(indexes);
console.timeEnd('Create in batches');
//Batch creation: ~500ms
```

**Conclusion**: Batch creation is **4 times faster**


## 2. Background creation

```javascript
//Big data collections are created in the background (without blocking)
await collection("large_collection").createIndexes([
  {
    key: { field1: 1 },
    background: true  //Background creation
  },
  {
    key: { field2: 1 },
    background: true
  }
]);
```

**Note**: The `background` option is deprecated in MongoDB 4.2+, but remains compatible.

---

## Best Practices


## 1. Configuration management

```javascript
// config/indexes.js
module.exports = {
  users: [
    { key: { email: 1 }, unique: true, name: "email_unique" },
    { key: { username: 1 }, unique: true },
    { key: { status: 1, createdAt: -1 } }
  ],
  products: [
    { key: { sku: 1 }, unique: true },
    { key: { category: 1, price: -1 } }
  ]
};

//use
const indexConfig = require('./config/indexes');

async function applyIndexes() {
  for (const [collName, indexes] of Object.entries(indexConfig)) {
    await collection(collName).createIndexes(indexes);
    console.log(`✓ ${collName} index has been created`);
  }
}
```


## 2. Environmental distinction

```javascript
//Use different indexes in different environments
const indexConfig = {
  development: {
    users: [
      { key: { email: 1 } }  //Simplified development environment
    ]
  },
  production: {
    users: [
      { key: { email: 1 }, unique: true },
      { key: { status: 1, createdAt: -1 } },
      { key: { "profile.city": 1 } }
    ]
  }
};

const env = process.env.NODE_ENV || 'development';
await collection("users").createIndexes(indexConfig[env].users);
```


## 3. Version control

```javascript
// migrations/001_create_indexes.js
module.exports = {
  version: 1,
  up: async (db) => {
    await db.collection("users").createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { createdAt: -1 } }
    ]);
  },
  down: async (db) => {
    await db.collection("users").dropIndex("email_1");
    await db.collection("users").dropIndex("createdAt_-1");
  }
};
```

---

## Related methods

- [`createIndex()`](./create-index.md) - Create a single index
- [`listIndexes()`](./list-indexes.md) - list all indexes
- [`dropIndex()`](./drop-index.md) - delete index
- [Complete Guide to Index Management](./collection-management.md) - Comprehensive Documentation on Index Management

---

## Reference resources

- [MongoDB createIndexes documentation](https://www.mongodb.com/docs/manual/reference/method/db.collection.createIndexes/)
- [Batch Operation Best Practices](https://www.mongodb.com/docs/manual/core/bulk-write-operations/)

