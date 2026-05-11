# docs/examples 承接映射

> **目标**: 说明 `monSQLize-v1` 中旧 `docs/examples/test/validation` 资产，在当前 TypeScript 重写仓库中的承接位置。
> **状态**: post-P4-D 收尾阶段；P4-D 最小映射已建立，首批 TS 文档 / 示例入口已由当前仓库正式承接，剩余主题继续分批迁移。

## 1. 映射原则

1. **不回建旧目录**：当前仓库不把 `docs/**` / `examples/**` 整体搬回，只保留当前最小可验证承接面。
2. **README 负责入口说明**：对外入口统一由 `README.md` 承接。
3. **验证资产进入 `test/**`**：compatibility / performance / validation 都在当前仓库的 `test/**` 下落盘。
4. **历史细节继续参考 v1**：在新 TS 文档体系完成前，详细语义仍允许参考 `monSQLize-v1`。

## 2. 资产映射表

| v1 资产 | 当前承接位置 | 状态 | 说明 |
|--------|-------------|------|------|
| `README.md` 中的旧 docs/examples 深链 | `README.md` 的“文档现状 / 文档参考说明 / 兼容性 / 开发”章节 | ✅ 已承接 | 当前 README 不再深链已删除目录，而是改为“README 落地页 + 当前 `docs/**` / `examples/**` 正式入口” |
| `docs/INDEX.md` 与旧“文档首页”能力 | `docs/README.md` | ✅ 首批承接 | 当前 TS 文档入口总览由 `docs/README.md` 承接 |
| 旧“安装 / 连接 / 基础查询”文档主题 | `docs/getting-started.md` | ✅ 首批承接 | 以当前 runtime 与 README 快速开始为准 |
| 旧缓存 / function-cache 相关主题 | `docs/cache-and-function-cache.md` | ✅ 首批承接 | 当前只承接已恢复的最小公开面与回归基线 |
| 旧高级能力综述 / 目录页 | `docs/capability-index.md` | ✅ 首批承接 | 当前先提供能力索引，不一次性展开全部主题 |
| `test/compatibility/README.md` | `test/compatibility/README.md` | ✅ 已承接 | 当前改为“已验证 vs 待补矩阵”模式 |
| `test/compatibility/node-versions.test.js` / `driver-versions.test.js` / `server-versions.test.js` | `test/compatibility/matrix.json` + `test/compatibility/matrix.test.js` | ✅ 最小承接 | 当前先恢复声明式矩阵与当前环境校验；多版本实机回归待后续补齐 |
| `test/performance/function-cache-performance.test.js` | `test/performance/baselines/function-cache.benchmark.js` | ✅ 最小承接 | 当前聚焦 `withCache()` 热路径与并发去重回归守卫 |
| `validation/VERIFICATION-PROGRESS.md` | `test/validation/VERIFICATION-PROGRESS.md` | ✅ 已承接 | 当前明确区分“已验证”与“待验证” |
| `examples/basic-*` / 最小连接示例 | `examples/quick-start/basic-connect.ts` | ✅ 首批承接 | 当前正式示例统一采用 TypeScript，并纳入编译后执行验证 |
| `examples/**` 中的缓存类最小示例 | `examples/cache/with-cache.ts` | ✅ 首批承接 | 当前先承接 `withCache()` / `FunctionCache` 最小路径，并验证 TS 消费面 |
| 其余旧 API 文档集 | 当前仍以 `monSQLize-v1` 为参考 | ⚠️ 待后续重建 | 后续应按主题逐篇从 v1 迁移，而不是整目录回滚 |
| 其余旧 examples 目录 | 当前仍以 `monSQLize-v1` 为参考 | ⚠️ 待后续重建 | 当前只承接 2 个最小正式示例入口 |

## 3. 当前建议的参考顺序

1. `README.md`：查看当前仓库事实、入口说明与兼容声明。
2. `docs/**` / `examples/**`：查看当前 TS 版已正式承接的主题与最小示例入口。
3. `test/compatibility/**` / `test/performance/**` / `test/validation/**`：查看当前已恢复的验证资产与映射状态。
4. `monSQLize-v1/**`：核对当前尚未迁移到 `docs/**` / `examples/**` 的历史实现语义与旧资料。

## 4. 结论

`P4-D` 已把“旧资产如何被当前仓库承接”写成显式映射；当前首批 TS 文档/示例入口也已正式落盘并通过本地验证。后续继续扩展时，应以本文件为迁移依据，按主题逐批把内容从“v1 参考”切换到“当前仓库正式承接”，而不是再次把 v1 目录原样搬回当前仓库。

