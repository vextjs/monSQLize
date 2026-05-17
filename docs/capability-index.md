# 高级能力索引

本页用于给出当前 TS 版 `monSQLize` 已恢复能力的正式入口索引。

> 原则：
> - 先说明“当前仓库已正式承接什么”
> - 再给出“当前仓库内对应的文档与示例入口”

## 当前能力总览

| 能力 | 当前正式入口 | 当前状态 | 说明 |
|------|--------------|----------|------|
| Model | `msq.model()` / `MonSQLize.Model` | ✅ 已恢复 | registry / features 最小闭环已建立 |
| transaction / lock | `startSession()` / `withTransaction()` / `withLock()` / `acquireLock()` / `tryAcquireLock()` | ✅ 已恢复 | 当前 runtime / type / unit / integration 已闭环 |
| pool | `pool()` / `ConnectionPoolManager` | ✅ 已恢复 | 当前多连接池最小闭环已建立 |
| sync | `startSync()` / `stopSync()` / `getSyncStats()` | ✅ 已恢复 | 当前 lifecycle / manager 最小闭环已建立 |
| slow-query-log | `recordSlowQuery()` / `getSlowQueryLogs()` | ✅ 已恢复 | 当前 manager / queue / runtime façade 已建立 |
| saga | `defineSaga()` / `executeSaga()` / `getSagaStats()` | ✅ 已恢复 | 当前 orchestrator / runtime façade 已建立 |

## 1. Model

当前仓库已正式恢复：

- `Model.define/get/list/undefine/redefine`
- `msq.model()`
- relations / virtuals / populate
- `findById()` / `findByIds()` / `findAndCount()`

当前 Model 相关入口：

- 文档：`docs/model.md`、`docs/populate.md`、`docs/relations.md`
- 示例：`examples/docs/model.ts`

## 2. transaction / lock

当前仓库已正式恢复：

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

当前仓库已正式恢复：

- `pool()`
- `ConnectionPoolManager`
- `pools` / `poolStrategy` / `poolFallback` / `maxPoolsCount`

当前适合作为：

- 多连接池入口识别
- 配置契约与运行时路由说明

## 4. sync / slow-query-log / saga

当前仓库已正式恢复最小公开面：

- sync：contract / manager / lifecycle
- slow-query-log：manager / queue / runtime façade
- saga：orchestrator / runtime façade

当前 `docs/**` 先只提供能力索引，不在本轮把这三类能力全部展开成独立专题。

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

