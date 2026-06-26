# 核心运行时结构说明

> 目标：给后续维护者一张“从入口到能力层”的结构图，避免继续把逻辑堆回 `runtime-core.ts`。

## 模块分层

```text
MonSQLizeRuntime (src/entry/runtime-core.ts)
├── entry helpers / compat accessors
│   ├── runtime-helpers.ts
│   └── runtime-compat-accessors.ts
├── capabilities
│   ├── cache / function-cache
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

## 维护边界

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

### `runtime-core.ts`

只负责：

- runtime 主类公开 API
- 能力装配
- connect / close / collection / db / model 等入口委托

不应该继续堆：

- 复杂写入编排
- expression 解析细节
- sync 记录/存储细节
- compat-only 的类型清洗逻辑

### `runtime-helpers.ts` / `runtime-compat-accessors.ts`

负责：

- runtime 与 model/accessor 的装配细节
- v1 兼容路径的 getter / cache / dbInstance 桥接

### capability / adapter 层

负责：

- 真正的行为语义
- 对应模块的内部 helper、队列、存储、编排

## 当前热点治理结果

| 热点 | 当前策略 |
|------|----------|
| `slow-query-log` | 已拆为 config / queue / records / storage / manager |
| `writes` | 已拆为 utils / basic / batch |
| `expression` | 已抽离 compiler，入口只保留公开 API 与 traversal |
| `collection-accessor` | 写路径已移到 helper，主文件回归 façade |
| `ModelInstance` | mutation orchestration 已迁出主文件 |

## 后续维护规则

1. 新能力优先进入 `capabilities/` 或 `adapters/`，不要先改 `runtime-core.ts`。
2. 涉及 compat-only 逻辑时，优先进入 `runtime-compat-accessors.ts`。
3. 热点重构后，至少补 `test:refactor-guard` + 对应 capability 层回归。
