# 缓存与函数缓存

## 当前正式承接范围

本页覆盖当前 TS 版 `monSQLize` 已正式承接的缓存相关能力：

- `MemoryCache`
- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`
- `withCache()`
- `FunctionCache`

## 1. `MemoryCache`

`MemoryCache` 是当前最小可直接使用的本地缓存入口，适合：

- 单进程开发环境
- 本地函数缓存
- 无 Redis 依赖的快速接入

```javascript
const MonSQLize = require('monsqlize');

const cache = new MonSQLize.MemoryCache();
await cache.set('user:1', { id: 1, name: 'Ada' }, 1000);
const value = await cache.get('user:1');
console.log(value);
```

## 2. `withCache()`

`withCache()` 用于把任意异步函数包装成带缓存与并发去重能力的版本。

```javascript
const MonSQLize = require('monsqlize');

const cached = MonSQLize.withCache(async (userId) => {
    return { userId, from: 'origin' };
}, {
    namespace: 'docs-user',
    ttl: 1000,
});

const first = await cached('u1');
const second = await cached('u1');
console.log(first, second);
```

### 当前行为边界

- 支持 `namespace`、`ttl`
- 支持自定义 `cache`
- 支持 `keyBuilder`
- 支持 `condition`
- 支持并发请求去重
- 支持 `invalidate()` 与统计信息读取

## 3. `FunctionCache`

`FunctionCache` 适合把一组具名函数集中注册、执行与清理。

```javascript
const MonSQLize = require('monsqlize');

const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'function_cache_docs' });
const functionCache = new MonSQLize.FunctionCache(runtime, {
    namespace: 'svc',
    defaultTTL: 1000,
});

functionCache.register('getUser', async (userId) => ({ userId }));
const result = await functionCache.execute('getUser', 'u1');
console.log(result);
```

## 4. 仓库内可执行示例

```bash
npm run build
npm run test:examples
```

该示例会演示：

当前官方示例文件是 `examples/cache/with-cache.ts`，验证时会先编译再执行。该示例会演示：

1. `withCache()` 在相同参数下只计算一次
2. `FunctionCache` 的 `register()` / `execute()` / `list()` / `clear()` 最小路径

## 5. Redis 与分布式能力说明

当前仓库已恢复：

- `createRedisCacheAdapter`
- `DistributedCacheInvalidator`

但本轮首批示例**不依赖 Redis**，原因是：

1. 首批目标是建立最小可执行示例闭环
2. Redis 依赖属于 optional dependency
3. 不应把“当前正式文档入口建立”与“分布式缓存环境搭建”强耦合

更完整的 Redis / 多级缓存部署细节，在当前 `docs/**` 尚未展开前，继续参考 `monSQLize-v1` 的历史说明。

## 6. 性能说明边界

当前仓库的性能相关正式证据来自：

- `test/performance/baselines/function-cache.benchmark.js`

它的用途是：

- 回归守卫
- 热路径与并发去重行为验证

它**不是**：

- 对外营销数字的唯一来源
- 跨版本 / 跨机器的完整性能结论

