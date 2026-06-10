# dropIndex() - delete the specified index

Safely deletes the specified index of the collection.

---

## Table of Contents

- [Overview](#overview)
- [Syntax](#syntax)
- [Parameters](#parameters)
  - [indexName (required)](#indexname-required)
- [Return value](#return-value)
- [Code Example](#code-example)
- [Example 1: Delete a single index](#example-1-delete-a-single-index)
- [Example 2: Delete after checking](#example-2-delete-after-checking)
- [Example 3: Error handling](#example-3-error-handling)
- [Example 4: Batch deletion process](#example-4-batch-deletion-process)
- [Example 5: Safe delete mode](#example-5-safe-delete-mode)
- [Error handling](#error-handling)
- [1. Index does not exist](#1-index-does-not-exist)
- [2. Disable deletion of _id index](#2-disable-deletion-of-id-index)
- [3. Insufficient permissions](#3-insufficient-permissions)
- [Security Advice](#security-advice)
- [1. Backup before deletion](#1-backup-before-deletion)
- [2. Precautions for production environment](#2-precautions-for-production-environment)
- [3. Rollback plan](#3-rollback-plan)
- [Related methods](#related-methods)
- [dropIndexes() - drop all indexes](#dropindexes-drop-all-indexes)
- [Syntax (dropIndexes() - drop all indexes)](#syntax-dropindexes-drop-all-indexes)
- [Parameters (dropIndexes() - drop all indexes)](#parameters-dropindexes-drop-all-indexes)
- [Return value (dropIndexes() - delete all indexes)](#return-value-dropindexes-delete-all-indexes)
- [Code example (dropIndexes() - drop all indexes)](#code-example-dropindexes-drop-all-indexes)
  - [Example 1: Delete all indexes](#example-1-delete-all-indexes)
  - [Example 2: Rebuild all indexes](#example-2-rebuild-all-indexes)
  - [Example 3: Processing when the collection does not exist](#example-3-processing-when-the-collection-does-not-exist)
- [Security advice (dropIndexes() - drop all indexes)](#security-advice-dropindexes-drop-all-indexes)
- [Best Practices](#best-practices)
- [1. Index life cycle management](#1-index-life-cycle-management)
- [2. Index maintenance window](#2-index-maintenance-window)
- [3. A/B testing index](#3-a-b-testing-index)
- [Reference resources](#reference-resources)

## Overview

The `dropIndex()` method is used to delete the specified index of the collection. Support security check and prohibit deletion of `_id` index.

**Usage Scenario**:
- Delete indexes that are no longer used
- Optimize index structure
- Cleanup before index rebuild
- Test and development environment cleanup

---

## Syntax

```javascript
await collection(collectionName).dropIndex(indexName)
```


## Parameters


### indexName (required)

The name of the index to delete.

**Type**: `String`

**Example**:
- `"email_1"` - single field index
- `"email_unique"` - Index of custom name
- `"user_status_idx"` - compound index

**Restrictions**:
- ❌ Cannot delete `_id_` index (MongoDB enforced restriction)
- ❌ cannot be an empty string


## Return value

**Type**: `Promise<Object>`

**Format**:
```javascript
{
  ok: 1,
  nIndexesWas: 3  //Number of indexes before deletion
}
```

---

## Code Example


## Example 1: Delete a single index

```javascript
import MonSQLize from 'monsqlize';
const msq = new MonSQLize({ ... });
const { collection } = await msq.connect();

//Delete index
const result = await collection("users").dropIndex("email_1");
console.log(result);
// { ok: 1, nIndexesWas: 3 }

console.log("✓ Index deleted");
```


## Example 2: Delete after checking

```javascript
//First check if the index exists
const indexes = await collection("users").listIndexes();
const exists = indexes.some(idx => idx.name === "old_index");

if (exists) {
  await collection("users").dropIndex("old_index");
  console.log("✓ Index deleted");
} else {
  console.log("Index does not exist, no need to delete");
}
```


## Example 3: Error handling

```javascript
try {
  await collection("users").dropIndex("email_1");
  console.log("✓ Deletion successful");
} catch (err) {
  if (err.code === 'MONGODB_ERROR') {
    if (err.message.includes('Index does not exist')) {
      console.log("Index does not exist");
    } else if (err.message.includes('Dropping of _id index is not allowed')) {
      console.log("Cannot drop _id index");
    } else {
      console.error("Delete failed:", err.message);
    }
  }
}
```


## Example 4: Batch deletion process

```javascript
//Delete multiple indexes
const indexesToDrop = ["old_idx_1", "old_idx_2", "old_idx_3"];

for (const indexName of indexesToDrop) {
  try {
    await collection("users").dropIndex(indexName);
    console.log(`✓ Deleted: ${indexName}`);
  } catch (err) {
    console.log(`✗ Deletion failed: ${indexName} - ${err.message}`);
  }
}
```


## Example 5: Safe delete mode

```javascript
async function safeDropIndex(collectionName, indexName) {
  //1. Check if the index exists
  const indexes = await collection(collectionName).listIndexes();
  const index = indexes.find(idx => idx.name === indexName);

  if (!index) {
    console.log(`Index ${indexName} does not exist`);
    return false;
  }

  //2. Deletion of _id index is not allowed
  if (indexName === '_id_') {
    console.log('Dropping of _id index is not allowed');
    return false;
  }

  //3. Record index information (for rollback)
  console.log('Prepare to delete the index:', {
    name: index.name,
    key: index.key,
    unique: index.unique || false
  });

  //4. Perform deletion
  try {
    await collection(collectionName).dropIndex(indexName);
    console.log(`✓ Index ${indexName} deleted`);
    return true;
  } catch (err) {
    console.error(`✗ Delete failed:`, err.message);
    return false;
  }
}

//use
await safeDropIndex("users", "old_email_idx");
```

---

## Error handling


## 1. Index does not exist

**Error code**: `MONGODB_ERROR`
**Message**: "Index does not exist: {indexName}"

**Solution**:
```javascript
//List the index first
const indexes = await collection("users").listIndexes();
console.log("Existing index:", indexes.map(idx => idx.name));

//Confirm the index name before deleting it
```


## 2. Disable deletion of _id index

**Error code**: `INVALID_ARGUMENT`
**Message**: "Deletion of _id index is not allowed"

**Reason**: MongoDB enforces that each collection must have an _id index

**Solution**:
```javascript
//Check index name
if (indexName !== '_id_') {
  await collection("users").dropIndex(indexName);
}
```


## 3. Insufficient permissions

**Error code**: MongoDB error
**Message**: "not authorized"

**Solution**: Make sure the database user has `dropIndex` permissions

---

## Security Advice


## 1. Backup before deletion

```javascript
//1. Record index information
const indexes = await collection("users").listIndexes();
const indexToDelete = indexes.find(idx => idx.name === "email_1");

console.log("Index information (for recovery):");
console.log(JSON.stringify(indexToDelete, null, 2));

//2. Delete index
await collection("users").dropIndex("email_1");

//3. If recovery is needed
// await collection("users").createIndex(indexToDelete.key, {
//   name: indexToDelete.name,
//   unique: indexToDelete.unique
// });
```


## 2. Precautions for production environment

```javascript
//Checklist before deleting indexes in production environment
async function productionDropIndex(collectionName, indexName) {
  //1. Confirm the environment
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️ WARNING: Delete indexes in production environment');

    //2. Confirm that the index is not in use
    const stats = await collection(collectionName)
      .find({})
      .explain('executionStats');

    //3. Record the current index status
    const indexes = await collection(collectionName).listIndexes();
    const backup = JSON.stringify(indexes, null, 2);

    //save to file
    require('fs').writeFileSync(
      `./backups/indexes-${Date.now()}.json`,
      backup
    );

    console.log('✓ Index backup saved');
  }

  //4. Perform deletion
  await collection(collectionName).dropIndex(indexName);
}
```


## 3. Rollback plan

```javascript
//Save index definition before deleting
const indexes = await collection("users").listIndexes();
const targetIndex = indexes.find(idx => idx.name === "email_1");

const rollback = {
  keys: targetIndex.key,
  options: {
    name: targetIndex.name,
    unique: targetIndex.unique,
    sparse: targetIndex.sparse,
    expireAfterSeconds: targetIndex.expireAfterSeconds
  }
};

//Delete index
await collection("users").dropIndex("email_1");

//If something goes wrong, restore the index
try {
  //... test the application ...
} catch (err) {
  console.log("Rollback: Recreate the index");
  await collection("users").createIndex(rollback.keys, rollback.options);
}
```

---

## Related methods

- [`dropIndexes()`](#dropindexes-drop-all-indexes) - delete all indexes
- [`createIndex()`](./create-index.md) - Create index
- [`listIndexes()`](./list-indexes.md) - list all indexes
- [Complete Guide to Index Management](./collection-management.md) - Comprehensive Documentation on Index Management

---

## dropIndexes() - drop all indexes

Delete all indexes of the collection (except the `_id` index).


## Syntax (dropIndexes() - drop all indexes)

```javascript
await collection(collectionName).dropIndexes()
```


## Parameters (dropIndexes() - drop all indexes)

No parameters.


## Return value (dropIndexes() - delete all indexes)

**Type**: `Promise<Object>`

**Format**:
```javascript
{
  ok: 1,
  nIndexesWas: 5  //Number of indexes before deletion
}
```


## Code example (dropIndexes() - drop all indexes)


### Example 1: Delete all indexes

```javascript
//Delete all indexes (except _id)
const result = await collection("users").dropIndexes();
console.log(result);
// { ok: 1, nIndexesWas: 5 }

//Verify
const indexes = await collection("users").listIndexes();
console.log("Remaining indexes:", indexes.length);  //1 (_id index)
```


### Example 2: Rebuild all indexes

```javascript
//1. Backup index definition
const oldIndexes = await collection("users").listIndexes();
const backup = oldIndexes
  .filter(idx => idx.name !== '_id_')
  .map(idx => ({
    key: idx.key,
    name: idx.name,
    unique: idx.unique,
    sparse: idx.sparse
  }));

//2. Delete all indexes
await collection("users").dropIndexes();

//3. Re-create the index
for (const idx of backup) {
  await collection("users").createIndex(idx.key, {
    name: idx.name,
    unique: idx.unique,
    sparse: idx.sparse
  });
}

console.log("✓ Index reconstruction completed");
```


### Example 3: Processing when the collection does not exist

```javascript
try {
  const result = await collection("nonexistent").dropIndexes();
  console.log(result);
  // { ok: 1, msg: 'The collection does not exist and there is no index to delete.', nIndexesWas: 0 }
} catch (err) {
  console.error(err.message);
}
```


## Security advice (dropIndexes() - drop all indexes)

**IMPORTANT WARNING**:
- ⚠️ This operation will delete all custom indexes
- ⚠️ May seriously affect query performance
- ⚠️ Use with caution in production environment

**Recommended Practice**:
```javascript
//Confirm before use in production environment
if (process.env.NODE_ENV === 'production') {
  console.log('⚠️ WARNING: All indexes will be deleted soon');

  //Requires manual confirmation
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise(resolve => {
    readline.question('Are you sure to delete all indexes? (yes/no):', resolve);
  });

  if (answer !== 'yes') {
    console.log('Operation canceled');
    return;
  }

  readline.close();
}

await collection("users").dropIndexes();
```

---

## Best Practices


## 1. Index life cycle management

```javascript
//Clean unused indexes regularly
async function cleanupUnusedIndexes(collectionName) {
  const indexes = await collection(collectionName).listIndexes();

  //Analyze index usage (requires MongoDB 4.2+)
  const stats = await db.admin().command({
    aggregate: collectionName,
    pipeline: [{ $indexStats: {} }],
    cursor: {}
  });

  //Find unused indexes
  const unused = indexes.filter(idx => {
    if (idx.name === '_id_') return false;
    const usage = stats.cursor.firstBatch.find(s => s.name === idx.name);
    return usage && usage.accesses.ops === 0;
  });

  //Delete unused indexes
  for (const idx of unused) {
    console.log(`Delete unused index: ${idx.name}`);
    await collection(collectionName).dropIndex(idx.name);
  }
}
```


## 2. Index maintenance window

```javascript
//Rebuild indexes during maintenance windows
async function maintenanceWindow(collectionName) {
  console.log('Enter maintenance mode...');

  //1. Back up index
  const indexes = await collection(collectionName).listIndexes();
  const backup = indexes.filter(idx => idx.name !== '_id_');

  //2. Delete all indexes
  await collection(collectionName).dropIndexes();
  console.log('✓ The old index has been deleted');

  //3. Recreate the optimized index
  await collection(collectionName).createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { status: 1, createdAt: -1 } },
    { key: { city: 1, age: 1 } }
  ]);
  console.log('✓ New index has been created');

  console.log('Exit maintenance mode');
}
```


## 3. A/B testing index

```javascript
//Test the impact of deleting an index
async function testIndexRemoval(collectionName, indexName) {
  //1. Record current performance
  const before = await measureQueryPerformance(collectionName);

  //2. Hide index (MongoDB 4.4+) instead of delete
  // await collection(collectionName).hideIndex(indexName);

  //Remove if hideIndex is not supported
  await collection(collectionName).dropIndex(indexName);

  //3. Test performance
  const after = await measureQueryPerformance(collectionName);

  //4. Compare results
  console.log('Performance comparison:');
  console.log('Before deletion:', before.avgTime, 'ms');
  console.log('After deletion:', after.avgTime, 'ms');

  if (after.avgTime > before.avgTime * 1.5) {
    console.log('⚠️ Performance drops by more than 50%, it is recommended to retain the index');
  }
}
```

---

## Reference resources

- [MongoDB dropIndex documentation](https://www.mongodb.com/docs/manual/reference/method/db.collection.dropIndex/)
- [MongoDB dropIndexes documentation](https://www.mongodb.com/docs/manual/reference/method/db.collection.dropIndexes/)
- [Best Practices for Index Management](https://www.mongodb.com/docs/manual/indexes/#index-maintenance)
