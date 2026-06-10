# listIndexes() - list all indexes

Lists all indexes for a collection, used for index auditing, monitoring, and management.

---

## Table of Contents

- [Overview](#overview)
- [Syntax](#syntax)
- [Parameters](#parameters)
- [Return value](#return-value)
- [Index field description](#index-field-description)
- [Common fields](#common-fields)
- [Option fields](#option-fields)
- [Code Example](#code-example)
- [Example 1: List all indexes](#example-1-list-all-indexes)
- [Example 2: Find a specific index](#example-2-find-a-specific-index)
- [Example 3: Check if the index exists](#example-3-check-if-the-index-exists)
- [Example 4: Filter indexes of specific types](#example-4-filter-indexes-of-specific-types)
- [Example 5: Index information display](#example-5-index-information-display)
- [Example 6: Processing when the collection does not exist](#example-6-processing-when-the-collection-does-not-exist)
- [Example 7: Index statistical analysis](#example-7-index-statistical-analysis)
- [Example 8: Index comparison (deployment verification)](#example-8-index-comparison-deployment-verification)
- [Practical application](#practical-application)
- [1. Index audit](#1-index-audit)
- [2. Index monitoring](#2-index-monitoring)
- [3. Deployment verification](#3-deployment-verification)
- [Error handling](#error-handling)
- [Collection does not exist](#collection-does-not-exist)
- [Permission issue](#permission-issue)
- [Performance recommendations](#performance-recommendations)
- [1. Cache index information](#1-cache-index-information)
- [2. Reduce call frequency](#2-reduce-call-frequency)
- [Best Practices](#best-practices)
- [1. Index documentation](#1-index-documentation)
- [2. Index naming specification check](#2-index-naming-specification-check)
- [3. Regular audits](#3-regular-audits)
- [Related methods](#related-methods)
- [Reference resources](#reference-resources)

## Overview

The `listIndexes()` method returns all index information of the collection, including index names, keys, options and other details.

**Usage Scenario**:
- Index audit and inspection
- Verify that the index exists
- Index monitoring and management
- Deployment verification
- Index documentation

---

## Syntax

```javascript
await collection(collectionName).listIndexes()
```


## Parameters

No parameters.


## Return value

**Type**: `Promise<Array<Object>>`

Returns an array of index information objects.

**Return format**:
```javascript
[
  {
    v: 2,                    //index version
    key: { _id: 1 },         //index key
    name: "_id_"             //Index name
  },
  {
    v: 2,
    key: { email: 1 },
    name: "email_1",
    unique: true             //unique index
  },
  //...more index
]
```

---

## Index field description


## Common fields

| Field | Type | Description |
|------|------|------|
| `v` | Number | Index version (usually 2) |
| `key` | Object | Index key definition |
| `name` | String | Index name |
| `ns` | String | Namespace (database.collection) |


## Option fields

Depending on the index type and options, the following fields may be included:

| Field | Type | Description |
|------|------|------|
| `unique` | Boolean | Is it a unique index |
| `sparse` | Boolean | Whether to use sparse index |
| `expireAfterSeconds` | Number | TTL expiration time (seconds) |
| `partialFilterExpression` | Object | Partial index filter conditions |
| `collation` | Object | Sorting Rules |
| `hidden` | Boolean | Whether to hide (MongoDB 4.4+) |
| `weights` | Object | Text index weight |
| `default_language` | String | Text index default language |
| `language_override` | String | Language coverage field |
| `textIndexVersion` | Number | Text index version |
| `2dsphereIndexVersion` | Number | 2dsphere index version |

---

## Code Example


## Example 1: List all indexes

```javascript
import MonSQLize from 'monsqlize';
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

//List index
const indexes = await collection("users").listIndexes();

console.log(`There are ${indexes.length} indexes in total`);
indexes.forEach(idx => {
  console.log(`- ${idx.name}:`, idx.key);
});

//Output example:
//There are 3 indexes
// - _id_: { _id: 1 }
// - email_1: { email: 1 }
// - age_1: { age: 1 }
```


## Example 2: Find a specific index

```javascript
//Find the index with the specified name
const indexes = await collection("users").listIndexes();
const emailIndex = indexes.find(idx => idx.name === 'email_1');

if (emailIndex) {
  console.log("Find index:", emailIndex);
  console.log("Key:", emailIndex.key);
  console.log("Only:", emailIndex.unique || false);
} else {
  console.log("Index does not exist");
}
```


## Example 3: Check if the index exists

```javascript
//Check if the index exists
async function indexExists(collectionName, indexName) {
  const indexes = await collection(collectionName).listIndexes();
  return indexes.some(idx => idx.name === indexName);
}

//use
if (await indexExists("users", "email_1")) {
  console.log("Mailbox index already exists");
} else {
  //Create index
  await collection("users").createIndex({ email: 1 });
}
```


## Example 4: Filter indexes of specific types

```javascript
const indexes = await collection("users").listIndexes();

//Find unique index
const uniqueIndexes = indexes.filter(idx => idx.unique === true);
console.log("Unique index:", uniqueIndexes.map(idx => idx.name));

//Find TTL index
const ttlIndexes = indexes.filter(idx => idx.expireAfterSeconds !== undefined);
console.log("TTL index:", ttlIndexes.map(idx => ({
  name: idx.name,
  ttl: idx.expireAfterSeconds
})));

//Find composite index
const compoundIndexes = indexes.filter(idx =>
  Object.keys(idx.key).length > 1
);
console.log("Composite index:", compoundIndexes.map(idx => idx.name));
```


## Example 5: Index information display

```javascript
const indexes = await collection("users").listIndexes();

console.log("\nIndex details:");
console.log("=".repeat(70));

indexes.forEach(idx => {
  console.log(`\nIndex name: ${idx.name}`);
  console.log(`Key: ${JSON.stringify(idx.key)}`);

  if (idx.unique) console.log(`Type: unique index`);
  if (idx.sparse) console.log(`Type: sparse index`);
  if (idx.expireAfterSeconds) {
    console.log(`Type: TTL index (${idx.expireAfterSeconds} seconds)`);
  }
  if (idx.partialFilterExpression) {
    console.log(`Type: Partial Index`);
    console.log(`Condition: ${JSON.stringify(idx.partialFilterExpression)}`);
  }
  if (idx.hidden) console.log(`Status: hidden`);
});

//Output example:
//Index details:
// ======================================================================
//
//Index name: _id_
//Key: {"_id":1}
//
//Index name: email_unique
//Key: {"email":1}
//Type: unique index
//
//Index name: age_adult
//Key: {"age":1}
//Type: Partial Index
//Condition: {"age":{"$gte":18}}
```


## Example 6: Processing when the collection does not exist

```javascript
//Returns an empty array if the collection does not exist
const indexes = await collection("nonexistent_collection").listIndexes();

console.log(`Number of indexes: ${indexes.length}`);
//Output: Number of indexes: 0

//security check
if (indexes.length === 0) {
  console.log("Collection does not exist or has no index");
} else {
  console.log("Find index:", indexes.map(idx => idx.name));
}
```


## Example 7: Index statistical analysis

```javascript
const indexes = await collection("users").listIndexes();

//Statistical index type
const stats = {
  total: indexes.length,
  unique: indexes.filter(idx => idx.unique).length,
  sparse: indexes.filter(idx => idx.sparse).length,
  ttl: indexes.filter(idx => idx.expireAfterSeconds).length,
  partial: indexes.filter(idx => idx.partialFilterExpression).length,
  compound: indexes.filter(idx => Object.keys(idx.key).length > 1).length,
  hidden: indexes.filter(idx => idx.hidden).length
};

console.log("Index statistics:");
console.log(`Total: ${stats.total}`);
console.log(`Unique index: ${stats.unique}`);
console.log(`Sparse index: ${stats.sparse}`);
console.log(`TTL index: ${stats.ttl}`);
console.log(`Partial index: ${stats.partial}`);
console.log(`Compound index: ${stats.compound}`);
console.log(`Hidden index: ${stats.hidden}`);
```


## Example 8: Index comparison (deployment verification)

```javascript
//Desired index configuration
const expectedIndexes = [
  { name: "_id_", key: { _id: 1 } },
  { name: "email_unique", key: { email: 1 }, unique: true },
  { name: "created_idx", key: { createdAt: -1 } }
];

//Get actual index
const actualIndexes = await collection("users").listIndexes();

//Contrast
const missing = expectedIndexes.filter(expected =>
  !actualIndexes.some(actual => actual.name === expected.name)
);

if (missing.length > 0) {
  console.log("Missing index:");
  missing.forEach(idx => {
    console.log(`  - ${idx.name}:`, idx.key);
  });

  //Create missing index
  for (const idx of missing) {
    await collection("users").createIndex(idx.key, {
      name: idx.name,
      unique: idx.unique
    });
  }
} else {
  console.log("✓ All indexes have been created");
}
```

---

## Practical application


## 1. Index audit

Periodically check your index configuration to ensure it meets expectations.

```javascript
async function auditIndexes(collectionName) {
  const indexes = await collection(collectionName).listIndexes();

  const report = {
    collection: collectionName,
    totalIndexes: indexes.length,
    indexes: indexes.map(idx => ({
      name: idx.name,
      keys: idx.key,
      unique: idx.unique || false,
      sparse: idx.sparse || false,
      ttl: idx.expireAfterSeconds,
      size: idx.size || 'N/A'
    }))
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

//Audit all collections
await auditIndexes("users");
await auditIndexes("products");
await auditIndexes("orders");
```


## 2. Index monitoring

Monitor index changes and detect problems in time.

```javascript
async function monitorIndexes(collectionName) {
  const currentIndexes = await collection(collectionName).listIndexes();

  //Save baseline (first run)
  const baseline = JSON.parse(localStorage.getItem('indexBaseline')) || {};

  if (!baseline[collectionName]) {
    baseline[collectionName] = currentIndexes;
    localStorage.setItem('indexBaseline', JSON.stringify(baseline));
    console.log(`✓ Baseline saved: ${collectionName}`);
    return;
  }

  //Contrast changes
  const baselineIndexes = baseline[collectionName];
  const currentNames = currentIndexes.map(idx => idx.name);
  const baselineNames = baselineIndexes.map(idx => idx.name);

  const added = currentNames.filter(name => !baselineNames.includes(name));
  const removed = baselineNames.filter(name => !currentNames.includes(name));

  if (added.length > 0) {
    console.log(`⚠️ New index: ${added.join(', ')}`);
  }
  if (removed.length > 0) {
    console.log(`⚠️ Delete index: ${removed.join(', ')}`);
  }
  if (added.length === 0 && removed.length === 0) {
    console.log(`✓ No change: ${collectionName}`);
  }
}
```


## 3. Deployment verification

Verify that the index was created correctly after deployment.

```javascript
async function verifyDeployment() {
  const requirements = {
    users: [
      { name: "email_unique", key: { email: 1 }, unique: true },
      { name: "created_idx", key: { createdAt: -1 } }
    ],
    products: [
      { name: "category_price_idx", key: { category: 1, price: -1 } },
      { name: "sku_unique", key: { sku: 1 }, unique: true }
    ]
  };

  let allValid = true;

  for (const [collName, requiredIndexes] of Object.entries(requirements)) {
    const actualIndexes = await collection(collName).listIndexes();

    for (const required of requiredIndexes) {
      const found = actualIndexes.find(idx => idx.name === required.name);

      if (!found) {
        console.log(`✗ ${collName}: Missing index ${required.name}`);
        allValid = false;
      } else if (required.unique && !found.unique) {
        console.log(`✗ ${collName}: Index ${required.name} should be the only index`);
        allValid = false;
      } else {
        console.log(`✓ ${collName}: index ${required.name} correct`);
      }
    }
  }

  if (allValid) {
    console.log("\n✓ Deployment verification passed");
  } else {
    console.log("\n✗ Deployment verification failed");
    process.exit(1);
  }
}

//Run verification
await verifyDeployment();
```

---

## Error handling


## Collection does not exist

When the collection does not exist, `listIndexes()` returns an empty array and does not throw an error.

```javascript
const indexes = await collection("nonexistent").listIndexes();
console.log(indexes.length);  // 0

//security check
if (indexes.length === 0) {
  console.log("Collection may not exist or have no index");
}
```


## Permission issue

If there is no permission to access the collection, an error may be thrown.

```javascript
try {
  const indexes = await collection("protected_collection").listIndexes();
} catch (err) {
  if (err.message.includes('not authorized')) {
    console.error("Insufficient permissions to list indexes");
  } else {
    console.error("Failed to list index:", err.message);
  }
}
```

---

## Performance recommendations


## 1. Cache index information

```javascript
//Index information changes infrequently and can be cached
const indexCache = new Map();

async function getCachedIndexes(collectionName, ttl = 300000) {
  const cached = indexCache.get(collectionName);

  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.indexes;
  }

  const indexes = await collection(collectionName).listIndexes();
  indexCache.set(collectionName, {
    indexes,
    timestamp: Date.now()
  });

  return indexes;
}

//Use caching
const indexes = await getCachedIndexes("users");
```


## 2. Reduce call frequency

```javascript
//✗ Bad: Frequent calls
for (let i = 0; i < 100; i++) {
  const indexes = await collection("users").listIndexes();
  // ...
}

//✓ Good: call once, reuse
const indexes = await collection("users").listIndexes();
for (let i = 0; i < 100; i++) {
  //Use indexes
}
```

---

## Best Practices


## 1. Index documentation

Export index information as a document.

```javascript
const indexes = await collection("users").listIndexes();

const doc = indexes.map(idx => {
  const lines = [
    `

### ${idx.name}`,
    `- **Key**: \`${JSON.stringify(idx.key)}\``,
  ];

  if (idx.unique) lines.push(`- **Type**: unique index`);
  if (idx.sparse) lines.push(`- **Type**: sparse index`);
  if (idx.expireAfterSeconds) {
    lines.push(`- **Type**: TTL index (${idx.expireAfterSeconds} seconds)`);
  }

  return lines.join('\n');
});

console.log(doc.join('\n\n'));
```


## 2. Index naming specification check

```javascript
const indexes = await collection("users").listIndexes();

//Check naming convention
indexes.forEach(idx => {
  if (idx.name === '_id_') return;  //Skip default index

  //Specification: field name_direction or custom descriptive name
  const hasDescriptiveName = idx.name.includes('idx') ||
                             idx.name.includes('unique') ||
                             idx.name.includes('ttl');

  if (!hasDescriptiveName && idx.name.match(/_[1-]$/)) {
    console.log(`⚠️ ${idx.name}: A more descriptive name is recommended`);
  }
});
```


## 3. Regular audits

```javascript
//Execute regularly (e.g. every day)
async function dailyIndexAudit() {
  const collections = ['users', 'products', 'orders'];

  for (const coll of collections) {
    const indexes = await collection(coll).listIndexes();

    console.log(`\n${coll}: ${indexes.length} indexes`);

    //Check size (requires MongoDB 4.4+)
    if (indexes.some(idx => idx.size && idx.size > 1024 * 1024 * 100)) {
      console.log(`⚠️ Large index found (>100MB)`);
    }

    //Check hidden index
    const hidden = indexes.filter(idx => idx.hidden);
    if (hidden.length > 0) {
      console.log(`⚠️ Found ${hidden.length} hidden indexes`);
    }
  }
}
```

---

## Related methods

- [`createIndex()`](./create-index.md) - Create a single index
- [`createIndexes()`](./create-indexes.md) - Create indexes in batches
- [`dropIndex()`](./drop-index.md) - Delete the specified index
- [`explain()`](./explain.md) - Analyze query execution plan (view index usage)
- [Complete Guide to Index Management](./collection-management.md) - Comprehensive Documentation on Index Management

---

## Reference resources

- [MongoDB listIndexes Documentation](https://www.mongodb.com/docs/manual/reference/method/db.collection.getIndexes/)
- [Index information field](https://www.mongodb.com/docs/manual/reference/command/listIndexes/)

