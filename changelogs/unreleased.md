# Unreleased

## Fixed

- Structured user-facing errors across config, cache, SSH, pool, query-chain, management, transaction, cursor, lock, and expression paths with existing messages preserved.
- Restored `SSHConfig.port` in public declarations and added a tsd guard against accidental `SSHConfig` shape pollution.
- Normalized source, type, test, example, script, config, and package output text to English-only wording.

## Documentation

- Added `docs/recipes.md` with copy-ready paths for MongoDB connection, memory cache, Redis/distributed invalidation, SSH tunnel, multi-pool, business lock, Model, and error-code handling.
- Linked recipes from the root README and docs index.
- Expanded `docs/error-codes.md` with a user action quick-reference and refreshed the current error-code index.
