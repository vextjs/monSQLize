# 🧪 Examples Gallery

文档站中的每个核心 API，都应尽量对应到**当前仓库内可直接运行的示例**。

## 运行方式

```bash
npm run build
npm run test:examples
```

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
| `delete-one.md` | `examples/docs/delete.ts` |
| `delete-many.md` | `examples/docs/delete-many.ts` |
| `deleteBatch.md` | `examples/docs/delete.ts` |
| `upsert-one.md` | `examples/docs/upsert-one.ts` |
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
| `collection-management.md` | `examples/docs/collection-management.ts` |
| `bookmarks.md` | `examples/docs/bookmarks.ts` |
| `slow-query-log.md` | `examples/docs/slow-query-log.ts` |
| `transaction.md` | `examples/docs/transaction.ts` |
| `watch.md` | `examples/docs/watch.ts` |

> 说明：部分概念型页面会复用同一个 richer example，而不是为每个标题机械复制一份完全相同的脚本。
