# monSQLize TS 文档入口

> 当前文档面向 **TypeScript 重写后的 monSQLize（v2）**，已与 v1 公开 API 100% 兼容。

## 当前文档覆盖范围

| 主题 | 当前入口 | 状态 | 说明 |
|------|----------|------|------|
| 快速开始 / 安装 / 连接 / 基础查询 | [`getting-started.md`](./getting-started.md) | ✅ | 对齐当前 runtime，TypeScript 完整类型 |
| 缓存 / 函数缓存 | [`cache-and-function-cache.md`](./cache-and-function-cache.md) | ✅ | `MemoryCache` / `withCache()` / `FunctionCache` |
| 高级能力索引 | [高级能力索引页](./capability-index.md) | ✅ | 完整能力入口索引 |

## 推荐阅读顺序

1. 根入口说明：[`../README.md`](../README.md)
2. 上手路径：[`getting-started.md`](./getting-started.md)
3. 缓存专题：[`cache-and-function-cache.md`](./cache-and-function-cache.md)
4. 能力索引：[高级能力索引页](./capability-index.md)
5. 可执行示例：
   - `examples/quick-start/basic-connect.ts`
   - `examples/cache/with-cache.ts`

## 当前文档边界

- 这里记录的是 **当前仓库已恢复并可说明的正式入口**。
- v2 已与 v1 公开 API 100% 兼容，文档以 v2 TypeScript 版本为准。

## 示例运行方式

在仓库根目录执行：

```bash
npm run build
npm run test:examples
```

> 说明：
> - `basic-connect.ts` 会通过仓库内的内存 MongoDB helper 启动本地临时环境，并同时验证 TypeScript 消费路径。
> - `with-cache.ts` 不依赖 MongoDB 或 Redis，可直接演示当前缓存 API 的最小用法与类型签名。