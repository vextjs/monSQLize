# monSQLize Examples

Runnable TypeScript examples for every major monSQLize API.
Each file uses an in-memory MongoDB server (`mongodb-memory-server`) — no real database needed.

## Prerequisites

```bash
npm install       # install all deps
npm run build     # build the library
```

## Quick Start

```bash
# Compile all examples
tsc -p tsconfig.examples.json

# Run a single example
node .generated/examples-dist/examples/quick-start/basic-connect.js
```

## Run All Examples

```bash
npm run test:examples
```

## Example Index

### Quick Start

| File | Description |
|------|-------------|
| [`quick-start/basic-connect.ts`](quick-start/basic-connect.ts) | Connect, CRUD lifecycle, disconnect |

### Cache

| File | Description |
|------|-------------|
| [`cache/with-cache.ts`](cache/with-cache.ts) | Per-collection cache TTL, hit/miss, `invalidate()` |

### Docs — CRUD

| File | Description |
|------|-------------|
| [`docs/insert.ts`](docs/insert.ts) | `insertOne`, `insertMany`, `insertBatch` |
| [`docs/update.ts`](docs/update.ts) | `updateOne`, `updateMany`, `updateBatch`, `incrementOne` |
| [`docs/delete.ts`](docs/delete.ts) | `deleteOne`, `deleteMany`, `deleteBatch` |
| [`docs/upsert.ts`](docs/upsert.ts) | `upsertOne`, `findOneAndUpdate`, `findOneAndReplace`, `replaceOne` |

### Docs — Query

| File | Description |
|------|-------------|
| [`docs/find.ts`](docs/find.ts) | `find` with sort, limit, skip, project |
| [`docs/find-one.ts`](docs/find-one.ts) | `findOne`, `findOneById`, `findByIds` |
| [`docs/find-page.ts`](docs/find-page.ts) | `findPage` — cursor and offset pagination |
| [`docs/find-and-count.ts`](docs/find-and-count.ts) | `findAndCount` — returns `{ data, total }` |
| [`docs/aggregate.ts`](docs/aggregate.ts) | Aggregation pipeline stages |
| [`docs/chaining-api.ts`](docs/chaining-api.ts) | `FindChain` and `AggregateChain` fluent builders |

### Docs — Advanced

| File | Description |
|------|-------------|
| [`docs/expression-functions.ts`](docs/expression-functions.ts) | `MonSQLize.expr()` for reusable pipeline expressions |
| [`docs/model.ts`](docs/model.ts) | Model schema + lifecycle hooks (pre/post) |
| [`docs/transaction.ts`](docs/transaction.ts) | `withTransaction()` — requires replica-set, see file for setup |
| [`docs/slow-query-log.ts`](docs/slow-query-log.ts) | Slow query log configuration |

## Running Individual Examples

```bash
# After building:
tsc -p tsconfig.examples.json

node .generated/examples-dist/examples/docs/insert.js
node .generated/examples-dist/examples/docs/update.js
node .generated/examples-dist/examples/docs/delete.js
node .generated/examples-dist/examples/docs/upsert.js
node .generated/examples-dist/examples/docs/find.js
node .generated/examples-dist/examples/docs/find-one.js
node .generated/examples-dist/examples/docs/find-page.js
node .generated/examples-dist/examples/docs/find-and-count.js
node .generated/examples-dist/examples/docs/aggregate.js
node .generated/examples-dist/examples/docs/chaining-api.js
node .generated/examples-dist/examples/docs/expression-functions.js
node .generated/examples-dist/examples/docs/model.js
node .generated/examples-dist/examples/docs/slow-query-log.js
```

## Transaction Example

Requires a local MongoDB replica-set:

```bash
# Start a local replica-set, then:
MONGO_RS_URI=mongodb://127.0.0.1:27017/?replicaSet=rs0 \
  node .generated/examples-dist/examples/docs/transaction.js
```
