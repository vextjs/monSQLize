# 数据任务 dataTasks

`msq.dataTasks` 用于执行小范围、显式、可复核的发布任务：生产索引同步、筛选数据同步、字段调整、受影响数据快照和结果验证。

它不是 schema migration 框架，也不会维护 up/down 迁移台账。全库搬迁应优先使用 MongoDB 原生导入导出或应用自有任务。发布中需要有边界、可 dry-run、可复跑的操作时，使用 dataTasks。

## 任务流程

```javascript
const task = {
  name: 'sync-active-users',
  source: { collection: 'sourceUsers' },
  target: { collection: 'targetUsers' },
  filter: { status: 'active' },
  matchBy: ['email'],
  snapshot: { dir: '.monsqlize/snapshots' },
  steps: [
    {
      type: 'ensureIndexes',
      indexes: [
        { key: { email: 1 }, options: { unique: true }, name: 'target_users_email_unique' }
      ]
    },
    { type: 'syncData', strategy: 'upsert' },
    { type: 'transformFields', update: { $set: { schemaVersion: 2 } } },
    { type: 'verify', count: true, fields: ['schemaVersion'], indexes: true }
  ]
};

await msq.dataTasks.plan(task);
await msq.dataTasks.dryRun(task);
await msq.dataTasks.run(task, { confirmProduction: true });
await msq.dataTasks.verify(task);
```

CLI 使用同一套流程：

```bash
monsqlize data-task plan --task ./tasks/sync-active-users.json --json
monsqlize data-task dry-run --task ./tasks/sync-active-users.cjs
monsqlize data-task run --task ./tasks/sync-active-users.cjs --confirm-production
monsqlize data-task verify --task ./tasks/sync-active-users.cjs
```

`dry-run`、`run`、`verify` 需要任务文件导出 `{ runtime, task }`，CLI 用 `runtime` 创建 `MonSQLize` 实例。只做静态校验的 `plan` 可以不连接数据库。

## 支持的步骤

| 步骤 | 用途 | 是否写入 |
|------|------|----------|
| `ensureIndexes` | 先 `listIndexes()`，报告冲突，只创建缺失索引 | 只写索引元数据 |
| `syncData` | 将筛选后的源文档按 `insert`、`upsert`、`merge` 或 `replace` 写入目标集合 | 目标文档 |
| `transformFields` | 对筛选后的目标文档执行更新操作符、更新管道或 transform 函数 | 目标文档 |
| `exportAffected` | 将受影响目标文档导出为 JSONL / extended JSONL | 只写快照文件 |
| `verify` | 验证数量、必需字段和索引状态 | 否 |

## 安全规则

- `syncData`、`transformFields`、`exportAffected` 必须提供 `filter`，除非显式设置 `allowFullCollection: true`。
- 跨端点 `syncData` 必须使用稳定业务字段 `matchBy`。默认禁止用源端 `_id` 匹配，除非 step 设置 `allowSourceIdMatch: true`。
- 生产任务在执行写步骤前必须传入 `confirmProduction: true`。
- 数据写入步骤会先导出受影响文档快照。只有同时设置 `snapshot: false` 和 `allowRunWithoutSnapshot: true` 才允许跳过。
- 索引同步总是先读取 `listIndexes()`。冲突只报告；dataTasks 不会 drop、rename 或 rebuild 冲突索引。

## CLI 任务文件

```javascript
module.exports = {
  runtime: {
    type: 'mongodb',
    databaseName: 'app',
    config: { uri: process.env.MONGODB_URI },
    autoIndex: false
  },
  task: {
    name: 'sync-active-users',
    source: { collection: 'sourceUsers' },
    target: { collection: 'targetUsers' },
    filter: { status: 'active' },
    matchBy: ['email'],
    snapshot: { dir: '.monsqlize/snapshots' },
    steps: [
      { type: 'syncData', strategy: 'upsert' },
      { type: 'verify', count: true }
    ]
  }
};
```

如果任务中包含 `transformFields.transform` 这类 JavaScript 函数，用 `.cjs`。静态 plan 或简单任务可用 `.json`。

## 相关示例

- [examples/docs/data-tasks.ts](https://github.com/vextjs/monSQLize/blob/main/examples/docs/data-tasks.ts)
- [生产发布](./production-rollout.md)
