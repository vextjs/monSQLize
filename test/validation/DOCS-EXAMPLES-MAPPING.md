# docs/examples 承接映射

> **目标**: 说明 `monSQLize-v1` 中旧 `docs/examples/test/validation` 资产，在当前 TypeScript 重写仓库中的承接位置。
> **状态**: P4-D 最小映射已建立；新 TS 文档 / 示例目录仍待后续阶段正式重建。

## 1. 映射原则

1. **不回建旧目录**：当前仓库不把 `docs/**` / `examples/**` 整体搬回，只保留当前最小可验证承接面。
2. **README 负责入口说明**：对外入口统一由 `README.md` 承接。
3. **验证资产进入 `test/**`**：compatibility / performance / validation 都在当前仓库的 `test/**` 下落盘。
4. **历史细节继续参考 v1**：在新 TS 文档体系完成前，详细语义仍允许参考 `monSQLize-v1`。

## 2. 资产映射表

| v1 资产 | 当前承接位置 | 状态 | 说明 |
|--------|-------------|------|------|
| `README.md` 中的旧 docs/examples 深链 | `README.md` 的“文档现状 / 文档参考说明 / 兼容性 / 开发”章节 | ✅ 已承接 | 当前 README 不再深链已删除目录，而是改为说明式入口 |
| `test/compatibility/README.md` | `test/compatibility/README.md` | ✅ 已承接 | 当前改为“已验证 vs 待补矩阵”模式 |
| `test/compatibility/node-versions.test.js` / `driver-versions.test.js` / `server-versions.test.js` | `test/compatibility/matrix.json` + `test/compatibility/matrix.test.js` | ✅ 最小承接 | 当前先恢复声明式矩阵与当前环境校验；多版本实机回归待后续补齐 |
| `test/performance/function-cache-performance.test.js` | `test/performance/baselines/function-cache.benchmark.js` | ✅ 最小承接 | 当前聚焦 `withCache()` 热路径与并发去重回归守卫 |
| `validation/VERIFICATION-PROGRESS.md` | `test/validation/VERIFICATION-PROGRESS.md` | ✅ 已承接 | 当前明确区分“已验证”与“待验证” |
| `docs/INDEX.md` 与旧 API 文档集 | 当前无本地对等目录；入口由 `README.md` 承接，详细历史语义继续参考 `monSQLize-v1` | ⚠️ 待后续重建 | 本轮不回滚旧 docs 目录 |
| `examples/**` | 当前无本地对等目录；示例语义暂由 `README.md` 快速开始 + `monSQLize-v1` 参考承接 | ⚠️ 待后续重建 | 本轮不回滚旧 examples 目录 |

## 3. 当前建议的参考顺序

1. `README.md`：查看当前仓库事实、验证入口与兼容声明。
2. `test/compatibility/**` / `test/performance/**` / `test/validation/**`：查看当前已恢复的验证资产。
3. `monSQLize-v1/**`：核对历史实现语义、旧文档细节与多版本参考资料。

## 4. 结论

`P4-D` 已把“旧资产如何被当前仓库承接”写成显式映射；因此后续若继续重建新 TS 文档或示例，应以本文件为迁移依据，而不是再次把 v1 目录原样搬回当前仓库。

