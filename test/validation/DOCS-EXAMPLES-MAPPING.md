# docs/examples 承接映射

> **目标**: 说明 `monSQLize-v1` 中旧 `docs/examples/test/validation` 资产，在当前 TypeScript 重写仓库中的承接位置。
> **状态**: post-P4-D 收尾阶段；当前 `docs/**` / `examples/**` 已从”最小承接”升级为”正式入口 + 56 个可执行 TS 示例 + 1 个 helper 模块”。

## 1. 映射原则

1. **不回建旧目录**：当前仓库不把 `docs/**` / `examples/**` 原样回滚，而是以当前 TS 版正式入口重建。
2. **README 负责入口说明**：对外入口统一由 `README.md` 承接。
3. **验证资产进入 `test/**`**：compatibility / performance / validation 都在当前仓库的 `test/**` 下落盘。
4. **历史细节继续参考 v1**：在新 TS 文档体系完成前，详细语义仍允许参考 `monSQLize-v1`。

## 2. 资产映射表

| v1 资产 | 当前承接位置 | 状态 | 说明 |
|--------|-------------|------|------|
| `README.md` 中的旧 docs/examples 深链 | `README.md` 的“文档现状 / 兼容性 / 开发”章节 + `docs/README.md` + `examples/README.md` | ✅ 已承接 | 当前 README 不再深链失效目录，而是指向当前 TS 版正式入口 |
| `docs/INDEX.md` 与旧“文档首页”能力 | `docs/README.md` | ✅ 已承接 | 当前 TS 文档入口总览由 `docs/README.md` 承接 |
| 旧“安装 / 连接 / 基础查询”文档主题 | `docs/getting-started.md` + `docs/examples.md` | ✅ 已承接 | 文档入口与示例映射已打通 |
| 旧缓存 / function-cache 相关主题 | `docs/cache-and-function-cache.md` + `examples/cache/with-cache.ts` + `examples/docs/cache-multilevel.ts` | ✅ 已承接 | 同时覆盖最小缓存路径与多级缓存组合场景 |
| 旧高级能力综述 / 目录页 | `docs/capability-index.md` + `docs/examples.md` | ✅ 已承接 | 当前既有能力索引，也有文档到示例的 Gallery 映射 |
| `test/compatibility/README.md` | `test/compatibility/README.md` | ✅ 已承接 | 当前改为“声明式矩阵 + 内存服务端矩阵”模式 |
| `test/compatibility/node-versions.test.js` / `driver-versions.test.js` / `server-versions.test.js` | `test/compatibility/matrix.json` + `test/compatibility/matrix.test.js` + `npm run test:server-matrix` | ✅ 已承接 | 必需矩阵覆盖 Node 20/22、Driver 6/7、MongoDB 7/8；缺失组合严格失败 |
| `test/performance/function-cache-performance.test.js` | `test/performance/baselines/function-cache.benchmark.js` | ✅ 已承接 | 当前聚焦 `withCache()` 热路径与并发去重回归守卫；v1 的 `test:performance` 另指向 `transaction-benchmark.js`，两者职责不同，不做原始数值横比 |
| `validation/VERIFICATION-PROGRESS.md` | `test/validation/VERIFICATION-PROGRESS.md` | ✅ 已承接 | 当前明确区分“已验证”与“待补项” |
| `examples/basic-*` / 最小连接示例 | `examples/quick-start/basic-connect.ts` | ✅ 已承接 | 当前正式示例统一采用 TypeScript，并纳入编译后执行验证 |
| 旧 CRUD / Query examples | `examples/docs/*.ts` + `examples/README.md` | ✅ 已承接 | 当前 query / write / pagination / chaining / explain / aggregate 等核心 API 已全部有官方 TS 示例 |
| 旧高级 / 组合场景 examples | `examples/docs/{aggregate-advanced,batch-operations,soft-delete,cache-multilevel,objectid,pool,sync,lock,saga,populate-relations}.ts` | ✅ 已承接 | 当前高阶能力与 richer examples 已纳入 `npm run test:examples` |
| 其余旧 API 文档细节 | 当前仍可参考 `monSQLize-v1`，但以当前仓库正式入口为准 | ⚠️ 逐步深化 | 剩余工作主要是把长文档主题继续细化，而不是补缺核心入口 |

## 3. 当前建议的参考顺序

1. `README.md`：查看当前仓库事实、入口说明与兼容声明。
2. `docs/**` / `examples/**`：查看当前 TS 版已正式承接的主题与完整示例入口。
3. `test/compatibility/**` / `test/performance/**` / `test/validation/**`：查看当前已恢复的验证资产与映射状态。
4. `monSQLize-v1/**`：核对当前尚未迁移到 `docs/**` / `examples/**` 的历史实现语义与旧资料。

## 4. 结论

`P4-D` 已把“旧资产如何被当前仓库承接”写成显式映射；当前 `docs/**` / `examples/**` 也已从最小入口升级为正式入口，并通过本地验证。后续继续扩展时，应以本文件为迁移依据，按主题逐批把内容从“v1 参考”切换到“当前仓库正式承接”，而不是再次把 v1 目录原样搬回当前仓库。

