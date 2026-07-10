# 生产发布：数据迁移与索引同步

在把 monSQLize 服务发布到生产环境，或发布会改变数据结构、同步目标、Model 索引声明、集合索引的版本前，先按这页检查。

monSQLize 为这条路径提供的是数据库运行时能力：

- Change Stream 同步，用于写入到达 MongoDB 之后的异步 CDC。
- `ensureIndexes()` 与 `ensureModelIndexes()`，用于 Model 索引预检。
- `listIndexes()`、`createIndex()`、`createIndexes()`、`dropIndex()` 等集合索引 API。
- `msq.dataTasks` 与 `monsqlize data-task`，用于经过复核的索引同步、筛选数据同步、字段调整、快照与验证。

它不会替代 MongoDB 原生导入导出、完整备份恢复策略或 exactly-once 数据管道。dataTasks 的定位是有边界的发布任务：显式 filter、dry-run、快照、受控执行和结果验证。

## 什么时候看这一页

如果生产发布涉及下面任一动作，就应该先看这一页：

| 发布需求 | 推荐路径 |
|----------|----------|
| 发布包含 Model 索引变更的新版本 | 先做索引 dry-run，解决 conflicts，再在受控窗口创建缺失索引 |
| 回填已有生产数据 | 使用 dataTask，提供明确 filter、业务 `matchBy`、快照与 verify 步骤 |
| 发布后让备份库或投影库持续同步 | 使用 Change Stream sync，并配置持久化 resume token 与 target 幂等 |
| 在数据库、连接池或读路径之间切流 | 切流前核对数据量、同步健康、索引、读路径与回滚点 |

## 生产发布顺序

1. 创建数据库备份或可恢复快照。
2. 生产服务使用 `autoIndex: false` 部署代码。
3. 在目标环境运行索引 dry-run。
4. 先解决索引 conflicts，再创建 missing 索引。
5. 如果发布需要历史数据变化，先执行 `msq.dataTasks.dryRun()` / `monsqlize data-task dry-run`，再带生产确认执行 `run`。
6. 只有在前置条件满足后，再启用 Change Stream sync 承接后续 CDC。
7. 检查数量、抽样记录、同步统计、慢查询和错误日志。
8. 所有发布门禁通过后再切换流量。

## 索引同步

对于 Model 声明的索引，生产环境建议关闭自动建索引，改用显式预检。

自动索引同样会先用 `listIndexes()` 预检，跳过 existing，只创建 missing。生产服务仍建议使用 `autoIndex: false`，因为启动时异步建索引不是发布门禁：你仍需要显式 dry-run、冲突复核、唯一索引重复数据检查、重索引维护窗口，以及运维可见的回滚方案。

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'app',
  config: { uri: process.env.MONGODB_URI },
  autoIndex: false
});

await msq.connect();

const plan = await msq.ensureModelIndexes({
  models: ['users', 'orders'],
  dryRun: true
});

console.log(plan.totals);

if (plan.totals.conflicts === 0) {
  await msq.ensureModelIndexes({
    models: ['users', 'orders'],
    throwOnError: true
  });
}
```

`ensureModelIndexes()` 和 `ModelInstance.ensureIndexes()` 会把 Model 声明索引与数据库现有索引对比。dry-run 只报告 `existing`、`missing`、`conflicts`。执行模式只创建 `missing` 索引，不会 drop、rename 或 rebuild 冲突索引。

非 Model 集合可以直接使用集合索引 API：

```javascript
const users = msq.collection('users');

const existing = await users.listIndexes();
console.log(existing.map(index => index.name));

await users.createIndexes([
  { key: { email: 1 }, unique: true, name: 'users_email_unique' },
  { key: { status: 1, createdAt: -1 }, name: 'users_status_createdAt' }
]);
```

生产索引检查清单：

- 使用 Model 索引时先运行 dry-run。
- 唯一索引变更要先检查线上是否已有重复数据。
- 避免在流量高峰创建重索引。
- 破坏性索引变更前先记录当前索引列表。
- 只有在理解回滚和查询影响后，才使用 `dropIndex()`。
- 切流后重新检查慢查询日志和 `explain()` 输出。

## 数据迁移同步

发布范围内的历史数据变化优先使用 dataTasks。任务应该用 `filter` 限定范围，用稳定业务字段匹配记录，在写入前导出受影响目标文档快照，并在切流前验证结果。

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

const plan = await msq.dataTasks.plan(task);
const dryRun = await msq.dataTasks.dryRun(task);

if (plan.errors.length === 0 && dryRun.errors.length === 0) {
  await msq.dataTasks.run(task, { confirmProduction: true });
  const verify = await msq.dataTasks.verify(task);
  if (!verify.passed) {
    throw new Error('data task verification failed');
  }
}
```

CLI 形式：

```bash
monsqlize data-task plan --task ./tasks/sync-active-users.cjs --json
monsqlize data-task dry-run --task ./tasks/sync-active-users.cjs
monsqlize data-task run --task ./tasks/sync-active-users.cjs --confirm-production
monsqlize data-task verify --task ./tasks/sync-active-users.cjs
```

任务建议：

- 使用稳定 `filter`；只有经过明确复核后才设置 `allowFullCollection: true`。
- 跨端点同步使用业务 `matchBy` 字段。默认禁止用源端 `_id` 匹配。
- 目标写入应保持幂等，重跑时应更新或跳过已同步文档。
- 生产执行前复核快照路径和 checksum。
- 全库复制、备份、恢复或超大批量管道仍应使用 MongoDB 原生工具或应用自有任务。

## 回填后的 Change Stream 同步

Change Stream sync 适合后续 CDC、备份库、投影库、缓存失效回调和其他异步 target 更新。它不能替代第一次历史全量回填。

```javascript
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'app',
  config: {
    uri: process.env.MONGODB_URI,
    replicaSet: 'rs0'
  },
  sync: {
    enabled: true,
    targets: [
      {
        name: 'backup-main',
        uri: process.env.BACKUP_MONGODB_URI,
        collections: ['users', 'orders']
      }
    ],
    resumeToken: {
      storage: 'redis',
      redis,
      strictSave: true,
      strictLoad: true,
      saveRetries: 3
    },
    idempotency: {
      store: durableStore,
      markMode: 'success'
    }
  }
});
```

运行边界：

- MongoDB 必须是 replica set 才能使用 Change Streams。
- 同步语义是 at-least-once，不是 exactly-once。
- 内置 MongoDB target 对 replace/upsert 类写入是幂等的。
- 自定义 `apply` target 应按 change event `_id` 去重。
- 生产监控要覆盖 `getSyncStats().isRunning`、`errorCount`、`lastError`、target error 与 token save error。
- 如果 resume token 丢失，不要假设中间历史缺口已经覆盖；需要执行修复任务或全量比对。

## 切流检查清单

切流前：

- `npm run release:preflight` 已通过包发布准备检查。
- 目标数据库已具备预期集合和索引。
- Model 索引 dry-run 不再报告 conflicts。
- 缺失索引已创建，或有明确的延期理由。
- migration/backfill 数量与预期范围一致。
- sync stats 健康，没有 target 停止。
- 慢查询日志没有新增明显索引缺失。
- 回滚路径和备份恢复点已经明确。

切流后：

- 观察同步统计和应用错误日志。
- 对迁移集合执行源端与目标端数量比对。
- 抽样检查旧读路径和新读路径的关键记录。
- 如果延迟变化，使用 `explain()` 检查代表性查询。
- 发布窗口关闭前保留旧回滚点。

## 相关文档

- [数据任务 dataTasks](./data-tasks.md)
- [Change Stream 同步](./sync-backup.md)
- [分布式部署](./distributed-deployment.md)
- [批量创建索引](./create-indexes.md)
- [列出索引](./list-indexes.md)
- [删除索引](./drop-index.md)
- [Model 概览](./model.md)
- [慢查询日志](./slow-query-log.md)
