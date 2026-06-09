# monSQLize TS 文档入口

> 当前文档面向 **TypeScript 重写后的 monSQLize（v2）**，已与 v1 公开 API 100% 兼容。

## 当前文档覆盖范围

| 主题 | 当前入口 | 状态 | 说明 |
|------|----------|------|------|
| 快速开始 / 安装 / 连接 / 基础查询 | [`getting-started.md`](./getting-started.md) | ✅ | 对齐当前 runtime，TypeScript 完整类型 |
| 常见场景配方 | [`recipes.md`](./recipes.md) | ✅ | 最小连接、缓存、Redis、SSH、连接池、锁、Model 的复制即用路径 |
| 缓存 / 函数缓存 | [`cache-and-function-cache.md`](./cache-and-function-cache.md) | ✅ | `MemoryCache` / `withCache()` / `FunctionCache` |
| 示例映射 / Gallery | [`examples.md`](./examples.md) | ✅ | 文档主题到官方示例的映射页 |
| 高级能力索引 | [高级能力索引页](./capability-index.md) | ✅ | 完整能力入口索引 |
| 验证 / 架构 / 工程治理 | [`verification-entrypoints.md`](./verification-entrypoints.md) / [`runtime-architecture.md`](./runtime-architecture.md) / [`support-matrix.md`](./support-matrix.md) / [`release-preflight.md`](./release-preflight.md) | ✅ | 统一查看公开验证入口、私有 real-env 边界、运行时结构与发布约束 |

## 推荐阅读顺序

1. 根入口说明：[`../README.md`](../README.md)
2. 上手路径：[`getting-started.md`](./getting-started.md)
3. 场景配方：[`recipes.md`](./recipes.md)
4. 缓存专题：[`cache-and-function-cache.md`](./cache-and-function-cache.md)
5. 能力索引：[高级能力索引页](./capability-index.md)
6. 工程与边界：
   - [`verification-entrypoints.md`](./verification-entrypoints.md)
   - [`support-matrix.md`](./support-matrix.md)
   - [`release-preflight.md`](./release-preflight.md)
   - [`roadmap-boundaries.md`](./roadmap-boundaries.md)
7. 可执行示例：
   - `examples/README.md`
   - `examples/quick-start/basic-connect.ts`
   - `examples/cache/with-cache.ts`
   - `examples/docs/*.ts`
   - [`examples.md`](./examples.md)

## 当前文档边界

- 这里记录的是 **当前仓库内已经完整承接并持续验证的正式入口**。
- 文档、示例、类型与测试口径统一以当前 TypeScript 版本为准，不依赖外部旧仓库。

## 示例运行方式

在仓库根目录执行：

```bash
npm run build
npm run test:examples
```

> 说明：
> - `basic-connect.ts` 会通过仓库内的内存 MongoDB helper 启动本地临时环境，并同时验证 TypeScript 消费路径。
> - `with-cache.ts` 不依赖 MongoDB 或 Redis，可直接演示当前缓存 API 的最小用法与类型签名。
