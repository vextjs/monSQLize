# 缓存 API 概览

## 当前正式承接范围

本页覆盖当前 TS 版 `monSQLize` 面向数据库运行时正式承接的缓存相关能力：

- `MemoryCache`
- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`

`withCache()` 和 `FunctionCache` 仍作为 legacy 兼容导出保留，但非数据库函数缓存不再作为 monSQLize 当前维护的能力方向，也不再出现在当前文档站导航中。通用函数级缓存建议直接使用 `cache-hub`，或放在应用自己的缓存层处理。

> 若你正在从旧的 monSQLize 缓存包装 API 迁移，请先阅读 [`cache-hub 直调迁移说明`](./cache-hub-migration.md)。

## 1. `MemoryCache`

`MemoryCache` 是当前最小可直接使用的本地缓存入口，适合：

- 单进程开发环境
- 本地查询缓存实验
- 无 Redis 依赖的快速接入

```typescript
import MonSQLize from 'monsqlize';

const cache = new MonSQLize.MemoryCache();
await cache.set('user:1', { id: 1, name: 'Ada' }, 1000);
const value = await cache.get('user:1');
console.log(value);
```

## 2. 仓库内可执行示例

```bash
npm run build
npm run test:examples
```

当前数据库缓存相关示例会先编译再执行。建议从这些入口开始：

- `examples/docs/cache-multilevel.ts`
- `examples/docs/slow-query-log.ts`

## 3. Redis 与分布式能力说明

当前可用入口：

- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`

但本轮首批示例**不依赖 Redis**，原因是：

1. 首批目标是提供最小可执行示例路径
2. Redis 相关能力需要运行时显式配置；启用这些路径时，请提供 Redis URL 或已有 Redis-like 客户端。
3. 不应把“当前正式文档入口建立”与“分布式缓存环境搭建”强耦合

Redis / 多级缓存的进阶部署建议会继续在当前文档站内补齐；当前仓库已提供可执行起点：

- `examples/docs/slow-query-log.ts`
- `examples/docs/cache-multilevel.ts`

## 4. Legacy 函数缓存边界

仓库仍保留 `withCache()` / `FunctionCache` 的兼容测试与性能守卫，方便既有消费方平滑升级。这些验证属于兼容证据，不再代表当前推荐的新非数据库缓存使用路径。

相关兼容证据：

- `test/unit/function-cache/function-cache.test.ts`
- `test/unit/function-cache/function-cache-behavior.test.ts`
- `test/performance/baselines/function-cache.benchmark.js`

