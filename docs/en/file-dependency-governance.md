# Dependence on release boundary management

The current root package adopts the **precise version dependency strategy**:

| Dependencies | Strategy | Reasons |
|------|------|------|
| `cache-hub` | Exact version `2.2.4` | The npm latest release has passed compatibility verification; the root direct dependency is fixed to 2.2.4, while the `schema-dsl` transitive dependency is still owned by the current `schema-dsl` version |
| `schema-dsl` | Accurate version `2.0.8` | npm `latest` points to 2.0.8, and this version is the current official TypeScript line; monSQLize only relies on `dsl` / `validate` capabilities, and uses 2.0.8 for type-check, model test, integration and examples verification |

> `schema-dsl@2.0.8` is consistent with the current version of workspace sibling `../schema-dsl`; the higher-looking `2.3.x` line exists on npm but has been marked as misreleased/deprecated and must not be followed by upgrades.

## Current Risk

1. **Upstream version drift**: `cache-hub` / `schema-dsl` have been fixed to the exact version, and upgrades must undergo explicit version adjustment.
2. **Risk of incorrectly released version**: npm `2.3.x` of `schema-dsl` has been marked as incorrectly released and must not be upgraded.
3. **Linked regression blind spot**: After upgrading any upstream dependency, the key regression surface must be re-covered.

## Current governance rules


## Development status

- The root direct `cache-hub` dependency is fixed to `2.2.4`; the `schema-dsl@2.0.8` transitive `cache-hub` dependency is not overridden and will be handled when `schema-dsl` is upgraded.
- `schema-dsl` is fixed to `2.0.8`.
- Local sibling `../schema-dsl` is only used for debugging the upstream library itself and is no longer a prerequisite for monSQLize root package installation.


## Release status

- The root package release state must not depend on the workspace `file:` / `workspace:` path.
- The current dependency strategy has met the basic premise of "resolvable external installation"; subsequent releases still need to pass the standard verification chain.

```bash
npm run release:preflight
```

## schema-dsl 2.x upgrade closed loop

The dependency governance baseline has upgraded and fixed `schema-dsl` from the historical `^1.2.5` to `2.0.8`. The closed-loop standard is as follows:

1. The upstream released the **non-deprecated** 2.x latest version on npm: `2.0.8`.
2. `npm install schema-dsl@2.0.8 --save-exact` followed by `npm run type-check`.
3. All model-related unit tests/integration tests passed (covered with `npm run test:unit` and `npm run test:integration`).
4. `npm run test:examples` all passed.
5. `npm run release:preflight` still needs to be used as the final access control before release.
6. This file, Profile, CHANGELOG and lockfile must be synchronized to `2.0.8`.

## cache-hub 2.2.4 upgrade closed loop

The dependency governance baseline has upgraded and fixed `cache-hub` from `1.0.0` to `2.2.4`. The closed-loop standard is as follows:

1. The upstream npm `latest` is `2.2.4`, and the Node.js engine requirement remains `>=18`, matching the current monSQLize baseline.
2. The root direct dependency resolves to `2.2.4`; the `schema-dsl` transitive dependency temporarily stays on the version declared by `schema-dsl@2.0.8`.
3. `npm run type-check`, targeted cache / function-cache tests, website build, and memory probe must pass.
4. This file, Profile, CHANGELOG, package manifest, and lockfile must be synchronized with the root direct dependency `2.2.4` baseline.

## Linkage verification suggestions

| Scenario | Must do verification |
|------|----------|
| Adjust `cache-hub` related capabilities | `npm run type-check` + `test/unit/cache/cache.test.ts` + exports / smoke |
| Adjust `schema-dsl` related capabilities | `npm run type-check` + model related single test/integration test + `npm run test:examples` |
| Preparing for release | `npm run release:preflight` |

## Long-term direction

1. `schema-dsl` will not automatically follow npm `latest`; the upgrade must explicitly confirm the target version and continue to exclude deprecated mistakenly released versions.
2. The release state maintains zero dependence on the workspace path; all upstream dependencies must be resolvable by the public semver.
