# Unreleased

## Fixed

- Structured user-facing errors across config, cache, SSH, pool, query-chain, management, transaction, cursor, lock, and expression paths with existing messages preserved.
- Restored `SSHConfig.port` in public declarations and added a tsd guard against accidental `SSHConfig` shape pollution.
- Normalized source, type, test, example, script, config, and package output text to English-only wording.
- Kept `verify:full` as a reproducible full functional gate and left the 90% coverage threshold on the independent `test:coverage` governance command.
- Updated server-matrix runners to execute the compiled `.generated/test-dist` integration tests after the TypeScript test build.
- Restored MongoDB driver 7 type compatibility for query `FindOptions` usage.
- Reused `mongodb-memory-server` binaries and project-local temporary dbPath directories across runtime, tests, examples, and validation scripts to prevent repeated downloads and runaway OS temp files.

## Documentation

- Added `docs/recipes.md` with copy-ready paths for MongoDB connection, memory cache, Redis/distributed invalidation, SSH tunnel, multi-pool, business lock, Model, and error-code handling.
- Linked recipes from the root README and docs index.
- Expanded `docs/error-codes.md` with a user action quick-reference and refreshed the current error-code index.
- Aligned current docs, validation notes, and Profile text with the public `dist/**` package boundary and current verification command split.
- Refreshed documentation consistency for MongoDB driver support, `findOneAnd*` return values, API index coverage, example paths, dependency version wording, and archived changelog links.
- Fixed stale documentation references for lock error imports, ObjectId / ESM verification commands, coverage threshold wording, API index links, Node.js version requirements, and the current docs site version label.
- Fixed Markdown fence corruption, stale chain-method wording, and visible replacement characters in current docs site pages.
