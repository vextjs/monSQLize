# 兼容性验证资产

本目录承接当前 TypeScript 重写阶段的兼容性验证闭环，目标不是一次性复刻 `monSQLize-v1` 的全量多版本矩阵，而是先把**当前仓库可被持续执行的兼容资产**固定下来。

## 当前已恢复资产

```text
test/compatibility/
├── exports/
│   └── exports.test.js          # 根导出基础校验
├── matrix.json                  # 当前声明式兼容矩阵
├── matrix.test.js               # package/导出矩阵实证校验
└── README.md
```

## 验证边界

### 当前已验证
- `package.json` 的 `engines.node` 与当前测试矩阵一致
- Node `20.x` 当前环境（本轮为 `v20.20.2`）已完成 `npm run verify` 与 `npm run test:compatibility`
- Node `22.x` 已可通过 `volta run --node 22` 直接执行；本轮已在 `v22.22.2` 下跑通 `npm run verify`
- `mongodb@^6.21.0` 作为当前依赖基线存在且与矩阵声明一致
- MongoDB Driver `7.x` 已通过临时安装 `mongodb@7.2.0` + `volta run --node 22 npm run verify` 完成扩展验证，验证后已恢复 `6.21.0` 基线
- CommonJS / ESM 根入口均暴露 `P4-A ~ P4-C` 已恢复的高级能力导出面
- `npm run test:compatibility` 可在当前工作区直接执行

### 当前仍待补
- MongoDB 6.x / 7.x 的真实服务端矩阵
- 历史 4.x / 5.x 兼容差异的再验证（当前只保留 v1 参考资料，不在本轮直接宣称已验证）

## 运行命令

```bash
npm run test:compatibility
```

## 设计原则

1. **当前事实优先**：以当前 `package.json`、根导出和可执行测试为准。
2. **验证状态分层**：区分“当前已验证”和“历史目标 / 待补矩阵”，避免过度承诺。
3. **最小可持续闭环**：先保留能持续执行的 manifest + test，再逐步扩展到实机多版本矩阵。

