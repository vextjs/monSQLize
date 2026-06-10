# Getting Started

## Scope

This page covers the minimal onboarding path that the current TypeScript version of `monSQLize` formally owns:

- Installation
- Initializing `MonSQLize`
- `connect()`
- `collection()`
- Basic writes and queries
- Closing the connection

## Installation

```bash
npm install monsqlize
```

### Current Dependency Boundary

- Runtime dependencies: `mongodb`, `schema-dsl`, `ssh2`, `ioredis`
- Current Node.js baseline: `>=18.0.0`

`ssh2` powers SSH tunnel support, and `ioredis` powers Redis cache and distributed capabilities. Both are installed together with `npm install monsqlize` and are used directly when their corresponding features are enabled.

## Minimal Connection Example

```typescript
import MonSQLize from 'monsqlize';

const msq = new MonSQLize({
    type: 'mongodb',
    databaseName: 'mydb',
    config: { uri: 'mongodb://localhost:27017' },
});

await msq.connect();

const users = msq.collection('users');
await users.insertOne({
    username: 'ada',
    email: 'ada@example.com',
    createdAt: new Date(),
});

const user = await users.findOne({ email: 'ada@example.com' });
console.log(user);

await msq.close();
```

## Runnable Example in This Repository

If you are validating the minimal path inside this repository, run:

```bash
npm run build
npm run test:examples
```

The current official example is `examples/quick-start/basic-connect.ts`. During verification, it is compiled before it runs. The example:

1. Starts an in-memory MongoDB instance.
2. Creates and connects a `MonSQLize` instance.
3. Inserts one user document.
4. Reads the document back and prints the result.
5. Closes the connection and cleans up the temporary database.

## Current Formal Coverage

### Covered

- `connect()` / `close()`
- `collection()` / `db()` / `use()`
- Basic query façade: `find` / `findOne` / `count` / `aggregate` / `distinct` / `findPage` / `watch`
- Basic and convenience writes: `insertOne`, `updateOne`, `deleteOne`, `insertMany`, `updateMany`, `deleteMany`, `replaceOne`, `findOneAnd*`, `upsertOne`
- Batch write extensions: `insertBatch` / `updateBatch` / `deleteBatch` / `incrementOne`

### Related Examples

- `examples/quick-start/basic-connect.ts`
- `examples/docs/find.ts`
- `examples/docs/find-one.ts`
- `examples/docs/find-page.ts`
- [`examples.md`](./examples.md)

## Common Notes

1. Calling `collection()` before `connect()` triggers `NOT_CONNECTED`.
2. Missing `config.uri` triggers `INVALID_CONFIG`.
3. This repository is the TypeScript rewrite. Its public consumption entries are `dist/cjs/index.cjs`, `dist/esm/index.mjs`, and `dist/types/index.d.ts`.
