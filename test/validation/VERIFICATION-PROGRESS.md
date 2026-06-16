# monSQLize TypeScript 重写验证进度

> **项目**: monSQLize
> **阶段**: TypeScript 全量重写完成后的持续治理阶段（历史 compat 主链已收口，当前进入 `withCache()` 性能基线与 v1 对比口径收口）
> **更新日期**: 2026-06-16
> **当前原则**: 只把“本仓库当前已恢复且可执行”的资产标为 ✅；跨版本 / 实机矩阵未补齐前保持 ⚠️ 待验证。

---

## 1. 当前验证总览

| 维度 | 资产 | 状态 | 说明 |
|------|------|------|------|
| 构建与类型 | `npm run build` / `npm run type-check` | ✅ | 当前 P1~P4-D 根入口、类型入口与 capability 导出链可验证 |
| 运行时回归 | `npm test` / `npm run verify` | ✅ | 默认 smoke / compatibility / unit / integration 链已恢复；当前默认 runner 已迁移到 `test/run-tests.cjs` |
| 兼容性矩阵 | `test/compatibility/{matrix.json,matrix.test.js}` | ✅ | 已恢复“当前声明式矩阵 + 高级导出校验” |
| 性能基线 | `test/performance/baselines/function-cache.benchmark.js` | ✅ | 已恢复 `withCache()` 热路径与并发去重回归守卫 |
| docs/examples 承接 | `test/validation/DOCS-EXAMPLES-MAPPING.md` + `docs/**` + `examples/**` | ✅ | 已明确映射关系，且正式 TS 文档/示例入口已落盘 |
| 跨版本 Node / Driver / Server 实机矩阵 | `npm run test:server-matrix` | ✅ | 已实跑 Node 20/22 × Driver 6/7 × MongoDB 6/7（内存版 single + replica set） |

---

## 2. 已恢复资产明细

| 编号 | 资产 | 证据 / 命令 | 状态 | 验证日期 |
|------|------|-------------|------|---------|
| V-01 | 根导出基础矩阵 | `npm run test:compatibility`（含 `exports.test.js`） | ✅ | 2026-05-10 |
| V-02 | P4-A ~ P4-C 高级能力导出矩阵 | `npm run test:compatibility`（含 `matrix.test.js`） | ✅ | 2026-05-10 |
| V-03 | Node / Driver 当前声明式矩阵 | `test/compatibility/matrix.json` + `package.json` 对齐 | ✅ | 2026-05-11 |
| V-04 | `withCache()` 热路径性能基线 | `npm run test:performance` | ✅ | 2026-05-28 |
| V-05 | `withCache()` 并发去重回归守卫 | `npm run test:performance` | ✅ | 2026-05-28 |
| V-06 | docs/examples 承接映射 | `test/validation/DOCS-EXAMPLES-MAPPING.md` | ✅ | 2026-05-10 |
| V-07 | README 当前事实与验证资产入口 | `README.md` | ✅ | 2026-05-10 |
| V-08 | TS 文档入口 | `docs/README.md`、`docs/getting-started.md`、`docs/cache-and-function-cache.md`、`docs/capability-index.md`、`docs/examples.md` | ✅ | 2026-05-17 |
| V-09 | 官方示例入口（TypeScript） | `examples/README.md` + `npm run test:examples`（覆盖 quick-start / cache / docs 全量示例） | ✅ | 2026-05-18 |
| V-10 | Node 20.x 当前环境实机回归 | `node -p "process.version"` + `npm run verify` | ✅ | 2026-05-11 |
| V-11 | Node 22.x（Volta）实机回归 | `volta run --node 22 node -p "process.version"` + `volta run --node 22 npm run verify` | ✅ | 2026-05-11 |
| V-12 | MongoDB Driver 7.x 扩展验证 | `npm install mongodb@7 --no-save --package-lock=false` + `npm run test:compatibility` + `npm run test:server-matrix` + `npm install mongodb@6.21.0 --no-save --package-lock=false`；状态仅允许 `verified` / `environment-unavailable` / `contract-regression` | ✅ | 2026-05-24 |
| V-13 | 内存服务端矩阵探测与执行入口 | `npm run probe:server-matrix` + `npm run test:server-matrix`（Node 20/22 × Driver 6/7 × MongoDB 6/7） | ✅ | 2026-05-17 |
| V-14 | v1 ↔ TS 完整功能兼容性对照表（历史批次基线）| `.devcodex/requirements/TypeScript全量重写兼容现有/FEATURE-PARITY.md`（历史批次记录 237 项 API 覆盖）| ✅ | 2026-05-17 |
| V-15 | v1 compat 全量断言套件（历史批次基线） | `npm run test` → 历史批次记录 2543/2543 v1 compat assertions pass（含 objectid-conversion 61 项） | ✅ | 2026-05-17 |
| V-16 | TS 文档示例套件（56 个）| `npm run test:examples` → 当前 56 个可执行 TypeScript 示例全部编译并执行；runner 复用 shared standalone + replica set，并复用项目内 memory-server 缓存 / dbPath 策略；`examples/helpers/bootstrap.ts` 是辅助模块，不单独执行 | ✅ | 2026-06-16 |
| V-17 | 当前 v1 parity 差异台账 | `test/regression/v1-parity-issues.md`（当前保留 9 条历史修复记录 + 2 条撤销误记，用于追溯，不再表示存在主链待修复差异） | ✅ | 2026-05-28 |
| V-18 | 当前 coverage 补测主链 | `npm run test:coverage` → 2387 passed / 0 failed；published CJS runtime 覆盖率为 statements 90.59%、branches 90.01%、functions 95.21%、lines 90.59%，已达 90% 门禁 | ✅ | 2026-06-10 |

---

## 3. 当前明确待补项

| 编号 | 待补项 | 原因 | 当前状态 |
|------|--------|------|---------|
| P-01 | 历史 4.x / 5.x 差异回归 | 当前默认矩阵已覆盖 Node 20/22、Driver 6/7、MongoDB 6/7；更早历史版本仍仅保留 v1 参考资料 | ⚠️ 待验证 |
| P-02 | 文档主题继续细化 | 当前正式入口已齐，但仍可继续把 API 主题文档从“索引 + 示例”深化为更细粒度专题 | ⚠️ 进行中 |
| P-03 | `withCache()` 性能收口口径 | 当前行为兼容已补齐；仍需持续保持“v1 事务 benchmark”与“v2 `withCache()` baseline”不做原始数值横比的文档口径一致性 | ⚠️ 进行中 |
| P-04 | coverage 90% 门禁 | `test:coverage` 已对 published CJS runtime 执行 90% 四项覆盖率门禁；该入口继续作为独立治理入口保留，不串联 `verify:full` | ✅ 已完成 |

---

## 4. 结论

- `P4-D` 的最小验证闭环已建立，并已进入 post-P4-D 收尾阶段：历史 compat 主链、发布出口治理和测试入口治理均已落地。
- 当前仓库已不再只有“README + mapping + v1 参考”三层承接；正式 TS 文档入口与官方示例入口已经落盘并完成本地验证。
- 当前仓库已经不再需要依赖“口头说明 P4-D 还没做”；相应资产已正式落盘。
- 当前 Node 20.x、Node 22.x、MongoDB Driver 6.x / 7.x 与 MongoDB Server 6.x / 7.x 的默认内存矩阵都已入账；`npm run test:server-matrix` 已可作为日常可复用验证入口。
- 历史 `FEATURE-PARITY.md` 与 2543/2543 compat 断言仍可作为“上一轮迁移批次已收口”的基线证据，但它们不再等同于“当前仓库所有验证资产都无需持续治理”。
- 截至 `2026-05-28`，当前 v1 parity 台账主要承担历史修复追溯用途：此前记录的主链差异已完成修复或撤销误记，当前未发现新的 v1 运行时/类型兼容阻断；本轮继续收口的是 `withCache()` 性能验证口径，而不是重新打开新的 API parity 修复批次。
- 当前 coverage 补测已把 `npm run test:coverage` 收敛到 2387 passed / 0 failed，并对 published CJS runtime 达成 statements 90.59%、branches 90.01%、functions 95.21%、lines 90.59%；`verify:full` 聚焦完整功能回归，coverage 继续由 `npm run test:coverage` 独立治理。

