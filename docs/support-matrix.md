# 正式支持矩阵

> 当前矩阵以 **默认验证链真正跑过的组合** 为准；未实证的版本不写进正式支持范围。

## Runtime / Driver / Server

| 维度 | 正式支持 | 证据 |
|------|----------|------|
| Node.js | 20.x / 22.x | `test/compatibility/matrix.json` + `npm run test:server-matrix` |
| MongoDB Driver | 6.x / 7.x | `npm run test:server-matrix` |
| MongoDB Server | 6.x / 7.x | `mongodb-memory-server` single + replica set matrix |
| Module | CJS / ESM | `test/smoke/root-cjs.test.js` / `root-esm.test.js` |

## 默认验证方式

- **Fast**：`npm run verify:fast`
- **Full**：`npm run verify:full`
- **Matrix**：`npm run test:server-matrix`
- **Private real env**：`npm run test:real-env:private`

## 暂不纳入正式支持

| 项目 | 当前状态 |
|------|----------|
| Node 18.x | 仅声明兼容，未纳入当前正式实证矩阵 |
| MongoDB Driver 4.x / 5.x | 仅保留历史兼容参考，未纳入当前正式矩阵 |
| 非 MongoDB 数据库 | 路线图阶段，当前不支持 |
