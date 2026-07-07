# 运行时一致性与边界

monSQLize 是数据库原生运行时增强层。它负责协调 MongoDB 访问、Model 校验、缓存、事务、连接池、同步与可观测性，但不会把这些能力变成一个全局强一致系统。

本页用于帮助你判断该使用哪个入口，以及哪些场景仍需要在应用层补充一致性设计。

## 运行时分层

```text
MonSQLizeRuntime (src/entry/runtime-core.ts)
├── entry helpers / compat accessors
│   ├── runtime-helpers.ts
│   └── runtime-compat-accessors.ts
├── capabilities
│   ├── database query cache
│   ├── model
│   ├── pool
│   ├── sync
│   ├── slow-query-log
│   ├── transaction
│   └── count-queue
├── adapters
│   └── mongodb/common + writes
└── core
    ├── expression
    └── errors / logger / utils
```

## 运行时一致性契约

monSQLize 提供运行时协同辅助能力，不提供全局强一致内核。当前保证如下：

| 区域 | 契约 | 边界 |
|------|------|------|
| MongoDB 事务 | MongoDB session 范围内的 ACID 语义 | 缓存失效在 commit 后刷新，属于 best-effort；commit 后缓存失效失败不会回滚数据库事务。 |
| 查询缓存 | 读穿缓存 + 写入触发失效 | Redis/L2 与 Pub/Sub 失效提供共享缓存状态和跨实例最终收敛，不提供缓存/数据库原子提交。 |
| 事务缓存锁 | 事务期间的进程内缓存写入抑制 | `transaction.distributedLock` 在 v2 中仅作为兼容配置占位保留，并未接入事务缓存锁。 |
| Change Stream sync | 默认 strict resume token 的 at-least-once 投递 | target apply 成功但 token 保存前崩溃时可能重放事件；自定义 target 需要按 change event `_id` 做幂等。 |
| Batch / CountQueue | 协作式并发与超时控制 | 超时会 abort 传入的 signal，但 JavaScript 不能强制终止忽略 signal 的任务。 |

如果业务流程需要跨实例强一致，请在应用/框架层使用显式的 `DistributedCacheLockManager` 业务锁、幂等键、fencing token、durable outbox/journal，或对关键路径绕过缓存。

## 如何选择入口

| 需求 | 推荐入口 |
|------|----------|
| 常规集合访问 | `const { collection } = await msq.connect()` |
| Model schema 校验与 hooks | `msq.model()` 或 `MonSQLize.Model` |
| 指定命名空间必须走 Model 写入 | `writePathPolicy` |
| 查询缓存 | 查询 `cache` 选项与 `msq.cache` 失效/统计 API |
| 多连接池路由 | 构造函数 `pools: PoolConfig[]`，然后使用 `msq.pool()` |
| 事务 | `startSession()` 与 `withTransaction()` |
| Change Stream fanout | `startSync()`、`stopSync()` 与 `getSyncStats()` |
| 严格业务锁 | `DistributedCacheLockManager`，并配合业务幂等/fencing 设计 |

## 什么时候需要应用层保证

当一个流程同时要求以下能力时，请在应用层补充显式保证：

1. 数据库写入成功与缓存可见性必须原子绑定。
2. 同步 target 不能接受事件重放。
3. 锁必须保护多个 Node.js 进程或多个区域。
4. 批量操作必须完全等价于逐文档业务操作序列。

这些路径通常需要 durable outbox、幂等键、应用层 retry，或对关键读取路径绕过缓存。
