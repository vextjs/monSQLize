# monSQLize Documentation

This documentation starts with the common application path: connect to MongoDB, run collection operations, add Model validation when needed, then enable cache, transactions, pools, sync, and operations features deliberately.

## Main Documentation Paths

| Goal | Start here | Notes |
|------|------------|-------|
| Install, connect, and run the first query | [`getting-started.md`](./getting-started.md) | Shortest path for a MongoDB-backed collection |
| Pick a common setup pattern | [`recipes.md`](./recipes.md) | Common scenarios for connection, cache, Redis, SSH, pools, and Model usage |
| Match docs to runnable source | [`examples.md`](./examples.md) | Links each topic to a GitHub example source |
| Add database caching | [`cache.md`](./cache.md) | Collection query cache, Redis L2 cache, and distributed invalidation |
| Control collection-vs-Model writes | [`write-path-policy.md`](./write-path-policy.md) | Optional guard when selected namespaces must go through Model writes |
| Browse the full API surface | [`api-index.md`](./api-index.md) | Reference entry for lower-level and compatibility APIs |
| Check runtime boundaries | [`capability-index.md`](./capability-index.md) | Capability map with links to deeper reference pages |

## Recommended Reading Order

1. Package entry: [repository README](../../README.md)
2. Quick start: [`getting-started.md`](./getting-started.md)
3. Common scenarios: [`recipes.md`](./recipes.md)
4. Cache guide: [`cache.md`](./cache.md)
5. Write path policy: [`write-path-policy.md`](./write-path-policy.md)
6. Examples:
   - [examples/README.md](https://github.com/vextjs/monSQLize/blob/main/examples/README.md)
   - [examples/quick-start/basic-connect.ts](https://github.com/vextjs/monSQLize/blob/main/examples/quick-start/basic-connect.ts)
   - [examples/docs](https://github.com/vextjs/monSQLize/tree/main/examples/docs)
   - [`examples.md`](./examples.md)
7. API and runtime reference:
   - [`api-index.md`](./api-index.md)
   - [`capability-index.md`](./capability-index.md)
   - [`support-matrix.md`](./support-matrix.md)

## Source and Verification

- The website is generated from [`docs/en`](https://github.com/vextjs/monSQLize/tree/main/docs/en) and [`docs/zh`](https://github.com/vextjs/monSQLize/tree/main/docs/zh).
- Runnable examples live in [`examples`](https://github.com/vextjs/monSQLize/tree/main/examples).
- Public package behavior should match the package root exports, public types, and runnable examples.

## Running Examples

Run these commands from the repository root:

```bash
npm run build
npm run test:examples
```

`npm run test:examples` starts temporary MongoDB test servers through the repository example runner, compiles the TypeScript examples, runs them, and cleans up the temporary data directories.
