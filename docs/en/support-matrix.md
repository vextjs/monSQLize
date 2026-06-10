# Formal support and verification matrix

> The current matrix is based on the **combinations that have actually been run by the public verification chain**; unverified versions are not included in the official support range.
> Node.js needs to distinguish between two layers: **Public CI baseline** and **Default server matrix**.

## Public CI Baseline

| dimensions | current scope | evidence |
|------|----------|------|
| Node.js | 18.x / 20.x / 22.x | `.github/workflows/test.yml` + `npm test`（smoke + compatibility + unit + integration）+ `npm run verify:fast` |
| Module | CJS / ESM | `test/smoke/root-cjs.test.ts` / `root-esm.test.ts` compiled test product |

## Default server matrix

| Dimensions | Formal support | Evidence |
|------|----------|------|
| Node.js | 20.x / 22.x | `test/compatibility/matrix.json` + `npm run test:server-matrix` |
| MongoDB Driver | 6.x / 7.x | `npm run test:server-matrix` |
| MongoDB Server | 6.x / 7.x | `mongodb-memory-server` single + replica set matrix with project-local binary cache and dbPath cleanup |

## Default verification method

- **Default gate**：`npm test`
- **Fast**：`npm run verify:fast`
- **Full functional gate**：`npm run verify:full`
- **Coverage governance**：`npm run test:coverage`
- **Matrix**：`npm run test:server-matrix`
- **Release preflight (public access)**: `npm run release:preflight`
- **Private real env**：`npm run test:real-env:private`

## Public verification and private verification boundaries

- `verify:fast` / `verify:full` / `test:server-matrix` / `release:preflight` are all **publicly reproducible** verification portals; `test:coverage` is an independent coverage management portal.
- `npm test` now covers smoke / compatibility / unit / integration by default; migrated TypeScript tests are first compiled to `.generated/test-dist/test/**` and then executed, and independent migration runners are no longer retained.
- `test:real-env:private` and `verify:release` belong to **explicit opt-in** private real environment verification, which requires the operator to inject SSH/Mongo environment variables by themselves.
- GitHub Actions only runs public access by default and does not assume any private SSH/Mongo resources exist.

## Not included in official support yet

| Project | Current Status |
|------|----------|
| Node 18.x server matrix | Has entered the public CI baseline, but is not included in the current Driver / Server official matrix |
| MongoDB Driver 4.x / 5.x | Only historical compatibility reference is retained and is not included in the current official matrix |
| legacy `lib/**` compat sub-path | Only explicit regressions during the migration period are retained, and are not included in the default access control and formal support matrix |
| Non-MongoDB databases | Roadmap stage, not currently supported |
