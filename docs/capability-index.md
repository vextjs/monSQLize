# 高级能力索引

本页用于给出当前 TS 版 `monSQLize` 已恢复能力的正式入口索引。

> 原则：
> - 先说明“当前仓库已正式承接什么”
> - 再说明“哪些细节仍参考 `monSQLize-v1`”

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

当前 `docs/**` 仍未单独展开完整 Model 专题，因此：

- **当前正式入口**：以本页索引 + `README.md` 中现有示例为准
- **更细节说明**：继续参考 `monSQLize-v1`

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

更复杂的分布式锁策略和历史细节，当前仍建议参考 `monSQLize-v1`。

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

## 5. 何时继续参考 `monSQLize-v1`

若你需要以下内容，当前仍优先参考 `monSQLize-v1`：

1. 历史完整章节化说明
2. 尚未迁移到当前 `docs/**` 的旧示例
3. 当前仓库尚未独立成文的高级能力细节

## 6. 后续扩展顺序建议

当前更适合的扩展顺序是：

1. Model 专题
2. transaction / lock 专题
3. pool 专题
4. sync / slow-query-log / saga 进阶专题

