# Unreleased

## Fixed

- Structured user-facing errors across config, cache, SSH, pool, query-chain, management, transaction, cursor, lock, and expression paths with existing messages preserved.
- Localized the Rspress top navigation per English / Simplified Chinese locale and refreshed the home hero layout, logo presentation, feature cards, and mobile action sizing.
- Upgraded the root `cache-hub` direct dependency to `2.2.4`, left the `schema-dsl` transitive dependency owned by `schema-dsl`, and updated cache publish / Redis adapter public types for the new surface.
- Restored `SSHConfig.port` in public declarations and added a tsd guard against accidental `SSHConfig` shape pollution.
- Normalized source, type, test, example, script, config, and package output text to English-only wording.
- Kept `verify:full` as a reproducible full functional gate and left the 90% coverage threshold on the independent `test:coverage` governance command.
- Updated server-matrix runners to execute the compiled `.generated/test-dist` integration tests after the TypeScript test build.
- Restored MongoDB driver 7 type compatibility for query `FindOptions` usage.
- Aligned pool selection with the public health status updated by `startHealthCheck()` so down pools are excluded from automatic routing.
- Forwarded direct pool `tags` preferences into automatic pool selection and let explicit `poolPreference` override default read/write role routing.
- Reused `mongodb-memory-server` binaries and project-local temporary dbPath directories across runtime, tests, examples, and validation scripts to prevent repeated downloads and runaway OS temp files.
- Updated `schema-dsl` to the current npm `latest` TypeScript line `2.0.8` while continuing to exclude deprecated `2.3.x` mistake releases.

## Documentation

- Added `docs/recipes.md` with copy-ready paths for MongoDB connection, memory cache, Redis/distributed invalidation, SSH tunnel, multi-pool, business lock, Model, and error-code handling.
- Linked recipes from the root README and docs index.
- Expanded `docs/error-codes.md` with a user action quick-reference and refreshed the current error-code index.
- Aligned current docs, validation notes, and Profile text with the public `dist/**` package boundary and current verification command split.
- Refreshed documentation consistency for MongoDB driver support, `findOneAnd*` return values, API index coverage, example paths, dependency version wording, and archived changelog links.
- Fixed stale documentation references for lock error imports, ObjectId / ESM verification commands, coverage threshold wording, API index links, Node.js version requirements, and the current docs site version label.
- Fixed Markdown fence corruption, stale chain-method wording, and visible replacement characters in current docs site pages.
- Started the bilingual documentation structure with `docs/en/**` as the default English site and `docs/zh/**` as the Simplified Chinese site; enabled Rspress `locales` and `languageParity`.
- Translated the English entry documentation batch covering the home page, README, getting started, examples, capability index, cache overview, API index, ESM support, connection management, and ObjectId auto conversion.
- Redesigned the shared site favicon / home hero logo with a scalable monSQLize database-query monogram, applied the Mint Graphite docs-site theme, fixed its light/dark theme parity, and tightened mobile home hero wrapping.
- Rewrote repository-relative documentation links to GitHub during the Rspress build, regrouped ObjectId / ID query pages in the sidebar, and fixed static-site links for home actions and generated language switch aliases.
- Added a 97/97 document example verification matrix check, refined the top navigation around API / examples / model / advanced entries, and replaced low-quality visible repository-relative path text in docs entry pages.
- Wired the document example matrix check into local verify scripts, CI, and docs deployment so docs/example drift fails before publishing.
- Added focused runnable examples for index management, aggregation-pipeline updates, and quick upsert flows, raising the examples runner from 43 to 46 scripts.
- Added focused runnable examples for function cache, model hooks, relations, and nested populate flows, raising the examples runner from 46 to 50 scripts.
- Added focused runnable examples for runtime events, CountQueue, pool chain routing, pool health checks, transaction optimization stats, and advanced Saga flows, raising the examples runner from 50 to 56 scripts.
- Strengthened the document/example matrix gate to verify examples README parity, bilingual examples-page parity, doc-check targets, shared-example summaries, and the final 56/19/22 coverage split.
- Excluded `.devcodex/**` runtime artifacts from ESLint commands so generated audit/browser profiles do not cause false lint failures.
