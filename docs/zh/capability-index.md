# 高级能力索引

本页用于给出当前 TS 版 `monSQLize` 的稳定能力入口索引。

monSQLize 是数据库原生的生产数据运行时增强层。当前稳定适配器是 MongoDB；MySQL 与 PostgreSQL 是后续计划中的 adapter，不属于当前 npm runtime。

> 原则：
> - 先说明“用户可以从哪些 API 入口开始”
> - 再给出对应的文档与示例入口

## 当前能力总览

| 层级 | 当前状态 | 范围 |
|------|----------|------|
| 共享运行时 | 当前 runtime 已暴露能力稳定 | Cache、Function Cache、锁、连接池、Saga、模型约束、慢查询日志与运行时诊断 |
| MongoDB adapter | Stable | `collection()`、`db()`、`use()`、`pool()`、查询/写入增强、聚合、索引、事务、Change Streams |
| MySQL adapter | Planned / in development | 后续数据库原生 adapter，当前暂无公开 runtime API |
| PostgreSQL adapter | Planned / in development | 后续数据库原生 adapter，当前暂无公开 runtime API |

| 能力 | 推荐入口 | 说明 |
|------|--------------|------|
| Model | `msq.model()` / `MonSQLize.Model` | 支持 Model 注册、关系、虚拟字段、populate 与常用查询入口 |
| transaction / lock | `startSession()` / `withTransaction()` / `withLock()` / `acquireLock()` / `tryAcquireLock()` | 支持事务封装、本地业务锁和分布式锁入口 |
| pool | `pool()` / `ConnectionPoolManager` | 支持多连接池配置、选择策略、fallback 与状态查看 |
| sync | `startSync()` / `stopSync()` / `getSyncStats()` | 支持 Change Stream 同步启动、停止和状态查询 |
| slow-query-log | `recordSlowQuery()` / `getSlowQueryLogs()` | 支持慢查询记录、查询和运行时管理 |
| saga | `defineSaga()` / `executeSaga()` / `getSagaStats()` | 支持 Saga 定义、执行、补偿和统计查询 |

## 1. Model

可用入口：

- `Model.define/get/list/undefine/redefine`
- `msq.model()`
- relations / virtuals / populate
- `findOneById()` / `findByIds()` / `findAndCount()`

Model 相关文档与示例：

- 文档：`docs/model.md`、`docs/populate.md`、`docs/relations.md`
- 示例：`examples/docs/model.ts`

## 2. transaction / lock

可用入口：

- `startSession()`
- `withTransaction()`
- `withLock()`
- `acquireLock()`
- `tryAcquireLock()`

适合先用于：

- 事务封装入口识别
- 业务锁基本接入

更复杂的分布式锁策略会继续在当前文档站补充；现阶段以当前 API 与测试通过行为为准。

## 3. pool

可用入口：

- `pool()`
- `ConnectionPoolManager`
- `pools` / `poolStrategy` / `poolFallback` / `maxPoolsCount`

当前适合作为：

- 多连接池入口识别
- 配置契约与运行时路由说明

## 4. sync / slow-query-log / saga

可用入口：

- sync：contract / manager / lifecycle
- slow-query-log：manager / queue / runtime façade
- saga：orchestrator / runtime façade

这些能力已提供专题文档与可执行示例：

- sync：`docs/sync-backup.md`，示例 `examples/docs/sync.ts`、`examples/docs/sync-target-failure.ts`
- slow-query-log：`docs/slow-query-log.md`，示例 `examples/docs/slow-query-log.ts`
- saga：`docs/saga-transaction.md`、`docs/saga-advanced.md`，示例 `examples/docs/saga.ts`

后续文档会继续补充运行时故障注入、真实部署拓扑与性能边界。

## 5. 当前仓库内的推荐入口

1. 文档站首页：`docs/index.md`
2. API 索引：`docs/api-index.md`
3. 示例索引：`docs/examples.md`
4. 可执行示例目录：`examples/docs/*.ts`

## 6. 后续扩展顺序建议

当前更适合的扩展顺序是：

1. Model 专题
2. transaction / lock 专题
3. pool 专题
4. sync / slow-query-log / saga 进阶专题

