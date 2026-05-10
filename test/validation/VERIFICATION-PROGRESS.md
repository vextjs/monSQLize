# monSQLize TypeScript 重写验证进度

> **项目**: monSQLize
> **阶段**: P4-D compatibility / performance / validation / docs 收口
> **更新日期**: 2026-05-10
> **当前原则**: 只把“本仓库当前已恢复且可执行”的资产标为 ✅；跨版本 / 实机矩阵未补齐前保持 ⚠️ 待验证。

---

## 1. 当前验证总览

| 维度 | 资产 | 状态 | 说明 |
|------|------|------|------|
| 构建与类型 | `npm run build` / `npm run type-check` | ✅ | 当前 P1~P4-D 根入口、类型入口与 capability 导出链可验证 |
| 运行时回归 | `npm test` / `npm run verify` | ✅ | 默认 smoke / compatibility / unit / integration 链已恢复 |
| 兼容性矩阵 | `test/compatibility/{matrix.json,matrix.test.js}` | ✅ | 已恢复“当前声明式矩阵 + 高级导出校验” |
| 性能基线 | `test/performance/baselines/function-cache.benchmark.js` | ✅ | 已恢复 `withCache()` 热路径与并发去重回归守卫 |
| docs/examples 承接 | `test/validation/DOCS-EXAMPLES-MAPPING.md` | ✅ | 已明确 v1 资产到当前仓库的映射与待补项 |
| 跨版本 Node / Driver / Server 实机矩阵 | v1 历史资产 + 后续实机回归 | ⚠️ | 当前仓库只恢复 manifest / checklist，不在本轮虚标已验证 |

---

## 2. 已恢复资产明细

| 编号 | 资产 | 证据 / 命令 | 状态 | 验证日期 |
|------|------|-------------|------|---------|
| V-01 | 根导出基础矩阵 | `npm run test:compatibility`（含 `exports.test.js`） | ✅ | 2026-05-10 |
| V-02 | P4-A ~ P4-C 高级能力导出矩阵 | `npm run test:compatibility`（含 `matrix.test.js`） | ✅ | 2026-05-10 |
| V-03 | Node / Driver 当前声明式矩阵 | `test/compatibility/matrix.json` + `package.json` 对齐 | ✅ | 2026-05-10 |
| V-04 | `withCache()` 热路径性能基线 | `npm run test:performance` | ✅ | 2026-05-10 |
| V-05 | `withCache()` 并发去重回归守卫 | `npm run test:performance` | ✅ | 2026-05-10 |
| V-06 | docs/examples 承接映射 | `test/validation/DOCS-EXAMPLES-MAPPING.md` | ✅ | 2026-05-10 |
| V-07 | README 当前事实与验证资产入口 | `README.md` | ✅ | 2026-05-10 |

---

## 3. 当前明确待补项

| 编号 | 待补项 | 原因 | 当前状态 |
|------|--------|------|---------|
| P-01 | Node 20.x / 22.x 实机回归 | 当前工作区只执行了单一 Node 环境 | ⚠️ 待验证 |
| P-02 | MongoDB Driver 7.x 扩展验证 | 当前依赖树固定在 `mongodb@^6.21.0` | ⚠️ 待验证 |
| P-03 | MongoDB 6.x / 7.x 真实服务端矩阵 | 当前 integration 主要基于 `mongodb-memory-server` replica set | ⚠️ 待验证 |
| P-04 | 新 TS 文档 / 示例目录重建 | 当前仍采用“README + mapping + v1 参考”承接模式 | ⚠️ 待后续阶段 |

---

## 4. 结论

- `P4-D` 的最小验证闭环已建立：**compatibility manifest + compatibility test + performance baseline + verification ledger + docs/examples mapping**。
- 当前仓库已经不再需要依赖“口头说明 P4-D 还没做”；相应资产已正式落盘。
- 仍未完成的内容是 **跨版本 / 实机矩阵**，这些项在未执行对应命令前保持 `⚠️ 待验证`，不在 README 中夸大为“已完全兼容”。

