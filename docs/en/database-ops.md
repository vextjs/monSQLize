# Database operation API

Database-level management operations, including listing databases, deleting databases, listing collections, etc.

---

## Table of Contents

- [listDatabases()](#listdatabases)
- [Syntax](#syntax)
- [Parameters](#parameters)
- [Return value](#return-value)
- [Example](#example)
- [dropDatabase()](#dropdatabase)
- [Security mechanism](#security-mechanism)
- [Syntax (dropDatabase())](#syntax-dropdatabase)
- [Parameters (dropDatabase())](#parameters-dropdatabase)
- [Return value (dropDatabase())](#return-value-dropdatabase)
- [Example (dropDatabase())](#example-dropdatabase)
  - [❌ Error: No confirmation provided](#error-no-confirmation-provided)
  - [✅ Correct: Provide confirmation](#correct-provide-confirmation)
  - [⚠️ Production environment: additional confirmation required](#production-environment-additional-confirmation-required)
- [Error handling](#error-handling)
- [listCollections()](#listcollections)
- [Syntax (listCollections())](#syntax-listcollections)
- [Parameters (listCollections())](#parameters-listcollections)
- [Return value (listCollections())](#return-value-listcollections)
- [Example (listCollections())](#example-listcollections)
- [runCommand()](#runcommand)
- [Syntax (runCommand())](#syntax-runcommand)
- [Parameters (runCommand())](#parameters-runcommand)
- [Example (runCommand())](#example-runcommand)
- [Related documents](#related-documents)

## listDatabases()

List all databases on the MongoDB server.


## Syntax

```javascript
const databases = await db._adapter.listDatabases([options]);
```


## Parameters

- **options** (Object, optional):
  - `nameOnly` (boolean): only returns the database name, default `false`


## Return value

- **Do not use nameOnly**: `Promise<Array<Object>>`
  - `name` (string): database name
  - `sizeOnDisk` (number): Disk usage (bytes)
  - `empty` (boolean): whether it is empty
- **Use nameOnly**: `Promise<Array<string>>`


## Example

```javascript
//Get details
const databases = await adapter.listDatabases();
console.log(databases);
// [
//   { name: 'admin', sizeOnDisk: 83886080, empty: false },
//   { name: 'mydb', sizeOnDisk: 167772160, empty: false }
// ]

//Get name only
const dbNames = await adapter.listDatabases({ nameOnly: true });
console.log(dbNames); // ['admin', 'config', 'local', 'mydb']
```

---

## dropDatabase()

**⚠️ Dangerous operation**: delete the entire database and cannot recover!


## Security mechanism

1. **Must be explicitly confirmed**: `{ confirm: true }` must be passed in
2. **Production environment protection**: The production environment is prohibited by default and requires additional input of `{ allowProduction: true }`
3. **Audit Log**: All deletion attempts will be logged


## Syntax (dropDatabase())

```javascript
const result = await db._adapter.dropDatabase(databaseName, options);
```


## Parameters (dropDatabase())

- **databaseName** (string, required): database name
- **options** (Object, required):
  - `confirm` (boolean, required): must be `true`
  - `allowProduction` (boolean): Whether to allow execution in the production environment, default `false`
  - `user` (string): operating user (for auditing)


## Return value (dropDatabase())

- **Type**: `Promise<Object>`
- **Properties**:
  - `dropped` (boolean): Whether the deletion was successful
  - `database` (string): deleted database name
  - `timestamp` (Date): deletion time


## Example (dropDatabase())


### ❌ Error: No confirmation provided

```javascript
try {
    await adapter.dropDatabase('test_db');
} catch (error) {
    console.error(error.message);
    // "dropDatabase requires explicit confirmation..."
}
```


### ✅ Correct: Provide confirmation

```javascript
const result = await adapter.dropDatabase('test_db', {
    confirm: true,
    user: 'admin@example.com'
});

console.log('Database dropped:', result.database);
console.log('Timestamp:', result.timestamp);
```


### ⚠️ Production environment: additional confirmation required

```javascript
//In a production environment (NODE_ENV=production)
const result = await adapter.dropDatabase('prod_db', {
    confirm: true,
    allowProduction: true,
    user: 'admin@example.com'
});
```


## Error handling

```javascript
try {
    await adapter.dropDatabase('my_database', {
        confirm: true,
        user: 'admin@example.com'
    });
} catch (error) {
    if (error.code === 'CONFIRMATION_REQUIRED') {
        console.error('❌ Missing confirmation parameters');
    } else if (error.code === 'PRODUCTION_BLOCKED') {
        console.error('❌ Production environment blocked');
    } else {
        console.error('❌ Delete failed:', error.message);
    }
}
```

---

## listCollections()

List all collections in the current database.


## Syntax (listCollections())

```javascript
const collections = await db._adapter.listCollections([options]);
```


## Parameters (listCollections())

- **options** (Object, optional):
  - `nameOnly` (boolean): only returns the collection name, default `false`


## Return value (listCollections())

- **Do not use nameOnly**: `Promise<Array<Object>>`
- **Use nameOnly**: `Promise<Array<string>>`


## Example (listCollections())

```javascript
//Get details
const collections = await adapter.listCollections();
console.log(collections);
// [
//   { name: 'users', type: 'collection', options: {}, info: {...} },
//   { name: 'orders', type: 'collection', options: {}, info: {...} }
// ]

//Get name only
const names = await adapter.listCollections({ nameOnly: true });
console.log(names); // ['users', 'orders', 'products']
```

---

## runCommand()

Execute any MongoDB command.


## Syntax (runCommand())

```javascript
const result = await db._adapter.runCommand(command, [options]);
```


## Parameters (runCommand())

- **command** (Object, required): MongoDB command object
- **options** (Object, optional): command options


## Example (runCommand())

```javascript
//Execute ping command
const ping = await adapter.runCommand({ ping: 1 });
console.log(ping.ok); // 1

//Execute dbStats command
const stats = await adapter.runCommand({ dbStats: 1, scale: 1024 });
console.log('Collections:', stats.collections);
console.log('Data size (KB):', stats.dataSize);

//Execute collStats command
const collStats = await adapter.runCommand({
    collStats: 'users',
    scale: 1048576 // MB
});
console.log('Count:', collStats.count);
console.log('Size (MB):', collStats.size);
```

---

## Related documents

- [Operation and Maintenance Monitoring](./admin.md) - ping, buildInfo, serverStatus, stats
- [Collection Management](./collection-management.md) - Collection level operations
- [Collection Management Example](../../examples/docs/collection-management.ts)

---

**Last updated**: 2025-12-02
**Version**: v0.3.0

