# Verification entry layer description

> Goal: Explain clearly "what should be run during normal code changes, what should be run before release, and which checks depend on the private environment".

## Three-layer verification entrance

| Entry | Command | Default environment | Purpose |
|------|------|----------|------|
| Fast | `npm run verify:fast` | Local/CI | Daily changes, hot spot reconstruction, fast guard before PR |
| Full | `npm run verify:full` | Local/CI | Full functional regression, sample regression, memory-server matrix; not concatenated coverage governance access control |
| Release | `npm run verify:release` | Before local private release | Add opt-in real environment check based on `full` |

## Supplementary entrance

| Command | Description |
|------|------|
| `npm test` | Default unified access control: smoke + compatibility + unit + integration; no longer implicitly run legacy compat runner or migration-specific runner |
| `npm run test:coverage` | Independent coverage management access control: run the default test through `c8`, and the lines / statements / functions / branches of the published CJS runtime are required to be above 90% |
| `npm run test:refactor-guard` | Hot spot reconstruction triple regression: exports + runtime/model + sync |
| `npm run test:server-matrix` | memory-server default matrix (Node/Driver/MongoDB server) |
| `npm run test:real-env:private` | Private real environment check; do not enter regular verify / CI by default |
| `npm run release:preflight` | Access control before public release: check lockfile release status, changelog / support matrix / dependency governance document, and concatenate `verify:fast` + `npm test` + `npm pack --dry-run` |

The memory-server related entries uniformly use `.cache/mongodb-memory-server/binaries` as the binary cache and `.cache/mongodb-memory-server/db` as the temporary data directory within the project; the dbPath automatically created by the project will be cleared when the script exits or runtime close to avoid the accumulation of default system temporary directories.

## Run strategy


## 1. Daily development/small-scale refactoring

```bash
npm run verify:fast
```

Note: Currently `verify:fast` no longer has a dedicated runner for serial migration; it covers lint, type-check, size strict, runtime smoke, compatibility, runtime/model/sync refactor guard and cache refactor guard. The full unit/integration default gate is overridden by `npm test`, and release preflight continues `npm test` after `verify:fast`.

Suitable for:

- Hotspot file splitting
- Internal helper refactoring
- Type and export surface adjustments


## 2. Complete delivery / extensive changes

```bash
npm run verify:full
```

Suitable for:

- Linked updates of documents and examples
- Behavior changes or cross-module refactoring
- Return of the complete repository before release


## 3. Private real environment verification

```bash
npm run test:real-env:private
```

Description:

- Only executed when conditions such as private Mongo/SSH are met
- Not used as default CI stage
- Mainly used to verify the real deployment path that cannot be covered by memory-server

Required environment variables:

- `MONSQLIZE_REAL_SSH_HOST`
- `MONSQLIZE_REAL_SSH_PORT`
- `MONSQLIZE_REAL_SSH_USERNAME`
- `MONSQLIZE_REAL_SSH_PASSWORD`
- `MONSQLIZE_REAL_MONGO_URI`

## Default boundary

- **Default closed loop**: `npm test` / `verify:fast` / `verify:full` / `test:server-matrix`
- **Coverage closed loop**: `npm run test:coverage` is executed independently; P-04 has been completed and retained as an independent coverage gate, and `verify:full` is not blocked
- **Explicit opt-in**: `test:real-env:private`
- **Public release pre-access control**: `release:preflight`
- **Local private pre-release supplement**: `verify:release`

## Why doesn’t CI run `verify:release` directly?

- `verify:release` relies on private SSH/Mongo environment variables, suitable for operators to trigger explicitly locally or in a private runner.
- The default verification chain of public CI and warehouse only promises reproducible assets in memory-server + warehouse.
- So GitHub Actions' `Release Preflight` workflow intentionally only runs `release:preflight`, without assuming a private environment exists.

> The warehouse also provides GitHub Actions `Release Preflight` workflow, which supports manual triggering and reusing the same set of pre-release access control when pushing `v*` tag.

> Note: `test:server-matrix` only retains **stable and repeatable compatibility surfaces** across Driver/Server combinations. Deep assertions like sync target fan-out statistics, which rely more on change-stream timing, continue to be covered by regular integration, `test:refactor-guard` and `release:preflight`.
