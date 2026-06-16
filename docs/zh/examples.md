# 🧪 Examples Gallery

文档站中的每个核心 API，都应尽量对应到**当前仓库内可直接运行的示例**。

> 当前完整示例源列表见 [官方示例总览](https://github.com/vextjs/monSQLize/blob/main/examples/README.md)，其中 `npm run test:examples` 会统一编译并执行当前 **56 个** TypeScript 示例；`examples/helpers/bootstrap.ts` 是辅助模块，不单独执行。

## 运行方式

```bash
npm run build
npm run test:examples
```

`npm run test:examples` 会在父进程中启动共享 `mongodb-memory-server` standalone + replica set，并在示例之间做健康检查，再把 URI 传给所有示例子进程；二进制缓存固定在 `.cache/mongodb-memory-server/binaries`，临时数据目录固定在 `.cache/mongodb-memory-server/db` 并在退出时清理。

也可以单独执行任意示例：

```bash
tsc -p tsconfig.examples.json
node .generated/examples-dist/examples/docs/find.js
```

## 快速开始

| 文档 | 示例 |
|------|------|
| `getting-started.md` | `examples/quick-start/basic-connect.ts` |
| `cache-and-function-cache.md` | `examples/cache/with-cache.ts` |
| `function-cache.md` | `examples/docs/function-cache.ts` |

## 查询操作

| 文档 | 示例 |
|------|------|
| `find.md` | `examples/docs/find.ts` |
| `findOne.md` | `examples/docs/find-one.ts` |
| `find-one-by-id.md` | `examples/docs/find-one-by-id.ts` |
| `find-by-ids.md` | `examples/docs/find-by-ids.ts` |
| `findPage.md` | `examples/docs/find-page.ts` |
| `find-and-count.md` | `examples/docs/find-and-count.ts` |
| `count.md` | `examples/docs/count.ts` |
| `count-queue.md` | `examples/docs/count-queue.ts` |
| `distinct.md` | `examples/docs/distinct.ts` |
| `aggregate.md` | `examples/docs/aggregate.ts` |
| `explain.md` | `examples/docs/explain.ts` |
| `chaining-api.md` | `examples/docs/chaining-api.ts` |

## 写入操作

| 文档 | 示例 |
|------|------|
| `insert-one.md` | `examples/docs/insert.ts` |
| `insert-many.md` | `examples/docs/insert-many.ts` |
| `insertBatch.md` | `examples/docs/insert.ts` |
| `update-one.md` | `examples/docs/update-one.ts` |
| `update-many.md` | `examples/docs/update.ts` |
| `updateBatch.md` | `examples/docs/update.ts` |
| `update-aggregation.md` | `examples/docs/update-aggregation.ts` |
| `delete-one.md` | `examples/docs/delete.ts` |
| `delete-many.md` | `examples/docs/delete-many.ts` |
| `deleteBatch.md` | `examples/docs/delete.ts` |
| `upsert-one.md` | `examples/docs/upsert-one.ts` |
| `quick-upsert.md` | `examples/docs/quick-upsert.ts` |
| `replace-one.md` | `examples/docs/upsert.ts` |
| `find-one-and-update.md` | `examples/docs/upsert.ts` |
| `find-one-and-replace.md` | `examples/docs/upsert.ts` |
| `find-one-and-delete.md` | `examples/docs/delete.ts` |
| `increment-one.md` | `examples/docs/update.ts` |

## 高级能力

| 文档 | 示例 |
|------|------|
| `expression-functions.md` | `examples/docs/expression-functions.ts` |
| `model.md` | `examples/docs/model.ts` |
| `hooks.md` | `examples/docs/hooks.ts` |
| `collection-management.md` | `examples/docs/collection-management.ts` |
| `create-index.md` | `examples/docs/index-management.ts` |
| `create-indexes.md` | `examples/docs/index-management.ts` |
| `list-indexes.md` | `examples/docs/index-management.ts` |
| `drop-index.md` | `examples/docs/index-management.ts` |
| `bookmarks.md` | `examples/docs/bookmarks.ts` |
| `slow-query-log.md` | `examples/docs/slow-query-log.ts` |
| `transaction.md` | `examples/docs/transaction.ts` |
| `transaction-optimizations.md` | `examples/docs/transaction-optimizations.ts` |
| `events.md` | `examples/docs/events.ts` |
| `watch.md` | `examples/docs/watch.ts` |
| `aggregate.md` | `examples/docs/aggregate-advanced.ts` |
| `write-operations.md` | `examples/docs/batch-operations.ts` |
| `model.md` | `examples/docs/soft-delete.ts` |
| `cache.md` | `examples/docs/cache-multilevel.ts` |
| `objectid-auto-convert.md` | `examples/docs/objectid.ts` |
| `multi-pool.md` | `examples/docs/pool.ts` |
| `pool-chain-api.md` | `examples/docs/pool-chain-api.ts` |
| `failure-recovery-examples.md` | `examples/docs/pool-fallback.ts` |
| `multi-pool-health-check.md` | `examples/docs/multi-pool-health-check.ts` |
| `sync-backup.md` | `examples/docs/sync.ts` |
| `failure-recovery-examples.md` | `examples/docs/sync-target-failure.ts` |
| `failure-recovery-examples.md` | `examples/docs/transaction-rollback.ts` |
| `populate.md` | `examples/docs/populate-relations.ts` |
| `relations.md` | `examples/docs/relations.ts` |
| `model/nested-populate.md` | `examples/docs/nested-populate.ts` |

> 说明：部分概念型页面会复用同一个 richer example，而不是为每个标题机械复制一份完全相同的脚本；完整列表以 [官方示例总览](https://github.com/vextjs/monSQLize/blob/main/examples/README.md) 为准。
