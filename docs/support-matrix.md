# 正式支持与验证矩阵

> 当前矩阵以 **公开验证链真正跑过的组合** 为准；未实证的版本不写进正式支持范围。  
> 其中 Node.js 需要区分两层：**公共 CI 基线** 与 **默认 server matrix**。

## 公共 CI 基线

| 维度 | 当前范围 | 证据 |
|------|----------|------|
| Node.js | 18.x / 20.x / 22.x | `.github/workflows/test.yml` + `npm test`（smoke + compatibility + unit + integration）+ `npm run verify:fast` |
| Module | CJS / ESM | `test/smoke/root-cjs.test.ts` / `root-esm.test.ts` 编译后的测试产物 |

## 默认 server matrix

| 维度 | 正式支持 | 证据 |
|------|----------|------|
| Node.js | 20.x / 22.x | `test/compatibility/matrix.json` + `npm run test:server-matrix` |
| MongoDB Driver | 6.x / 7.x | `npm run test:server-matrix` |
| MongoDB Server | 6.x / 7.x | `mongodb-memory-server` single + replica set matrix |

## 默认验证方式

- **Default gate**：`npm test`
- **Fast**：`npm run verify:fast`
- **Full functional gate**：`npm run verify:full`
- **Coverage governance**：`npm run test:coverage`
- **Matrix**：`npm run test:server-matrix`
- **Release preflight（公开门禁）**：`npm run release:preflight`
- **Private real env**：`npm run test:real-env:private`

## 公开验证与私有验证边界

- `verify:fast` / `verify:full` / `test:server-matrix` / `release:preflight` 都属于**公开可复现**验证入口；`test:coverage` 是独立覆盖率治理入口。
- `npm test` 现在默认覆盖 smoke / compatibility / unit / integration；已迁移的 TypeScript 测试先编译到 `.generated/test-dist/test/**` 再执行，不再保留独立迁移 runner。
- `test:real-env:private` 与 `verify:release` 属于**显式 opt-in** 的私有真实环境验证，需要操作者自行注入 SSH / Mongo 环境变量。
- GitHub Actions 默认只运行公开门禁，不假设任何私有 SSH / Mongo 资源存在。

## 暂不纳入正式支持

| 项目 | 当前状态 |
|------|----------|
| Node 18.x server matrix | 已进入公共 CI 基线，但未纳入当前 Driver / Server 正式矩阵 |
| MongoDB Driver 4.x / 5.x | 仅保留历史兼容参考，未纳入当前正式矩阵 |
| legacy `lib/**` compat 子路径 | 仅保留迁移期显式回归，不纳入默认门禁与正式支持矩阵 |
| 非 MongoDB 数据库 | 路线图阶段，当前不支持 |
