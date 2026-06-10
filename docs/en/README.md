# monSQLize TS Documentation

> This documentation targets the **TypeScript rewrite of monSQLize (v2)** and is aligned with the v1-compatible public API surface.

## Current Documentation Coverage

| Topic | Current entry | Status | Notes |
|------|---------------|--------|-------|
| Quick start / installation / connection / basic queries | [`getting-started.md`](./getting-started.md) | ✅ | Aligned with the current runtime and full TypeScript types |
| Common recipes | [`recipes.md`](./recipes.md) | ✅ | Copy-ready paths for basic connection, cache, Redis, SSH, pools, locks, and Model usage |
| Cache / function cache | [`cache-and-function-cache.md`](./cache-and-function-cache.md) | ✅ | `MemoryCache` / `withCache()` / `FunctionCache` |
| Examples mapping / gallery | [`examples.md`](./examples.md) | ✅ | Maps documentation topics to official examples |
| Advanced capability index | [Capability index](./capability-index.md) | ✅ | Index of the current advanced capability surface |
| Verification / architecture / engineering governance | [`verification-entrypoints.md`](./verification-entrypoints.md) / [`runtime-architecture.md`](./runtime-architecture.md) / [`support-matrix.md`](./support-matrix.md) / [`release-preflight.md`](./release-preflight.md) | ✅ | Unified entry points for verification, private real-env boundaries, runtime structure, and release constraints |

## Recommended Reading Order

1. Package entry: [`../../README.md`](../../README.md)
2. Quick start: [`getting-started.md`](./getting-started.md)
3. Recipes: [`recipes.md`](./recipes.md)
4. Cache guide: [`cache-and-function-cache.md`](./cache-and-function-cache.md)
5. Capability index: [Capability index](./capability-index.md)
6. Engineering and boundaries:
   - [`verification-entrypoints.md`](./verification-entrypoints.md)
   - [`support-matrix.md`](./support-matrix.md)
   - [`release-preflight.md`](./release-preflight.md)
   - [`roadmap-boundaries.md`](./roadmap-boundaries.md)
7. Runnable examples:
   - `examples/README.md`
   - `examples/quick-start/basic-connect.ts`
   - `examples/cache/with-cache.ts`
   - `examples/docs/*.ts`
   - [`examples.md`](./examples.md)

## Documentation Boundary

- This directory records the **formal entries that are fully owned and continuously verified in the current repository**.
- Documentation, examples, types, and tests use the current TypeScript version as the source of truth and no longer depend on the legacy external repository.

## Running Examples

Run these commands from the repository root:

```bash
npm run build
npm run test:examples
```

Notes:

- `basic-connect.ts` starts a temporary local MongoDB environment through the repository's in-memory MongoDB helper and validates the TypeScript consumption path.
- `with-cache.ts` does not require MongoDB or Redis. It demonstrates the minimal current cache API usage and type signatures.
