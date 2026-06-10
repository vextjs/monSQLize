# 失败与恢复路径示例

> 这组示例专门覆盖“成功路径之外”的常见恢复场景，避免用户只能看到 happy path。

## 示例总表

| 场景 | 示例 | 关注点 |
|------|------|--------|
| 事务回滚 | `examples/docs/transaction-rollback.ts` | 事务中途抛错后，数据应保持回滚后的稳定状态 |
| Sync target 失败恢复 | `examples/docs/sync-target-failure.ts` | `errorCount`、`syncedCount`、target stats 应准确反映失败与恢复 |
| 锁竞争 / 超时 | `examples/docs/lock-timeout.ts` | `tryAcquireLock()` 空返回、`acquireLock()` 超时错误、释放后的恢复 |
| Pool fallback / recovery | `examples/docs/pool-fallback.ts` | analytics 池降级后自动回退到 primary，恢复后重新接管读流量 |

## 如何执行

```bash
npm run test:examples
```

或单独执行：

```bash
node .generated/examples-dist/examples/docs/transaction-rollback.js
node .generated/examples-dist/examples/docs/sync-target-failure.js
node .generated/examples-dist/examples/docs/lock-timeout.js
node .generated/examples-dist/examples/docs/pool-fallback.js
```

## 设计原则

- **默认闭环优先**：全部示例都使用本地内存环境或 fake client，可直接运行。
- **恢复信号可观察**：日志输出要明确展示失败点、恢复点、恢复后的状态。
- **与正式验证链对齐**：这些示例同时归入 `npm run test:examples`，不是只写不跑的演示稿。
