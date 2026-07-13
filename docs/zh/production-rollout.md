# 生产发布与迁移

这是一份发布 runbook，用于把代码、索引、一次性历史数据和后续增量同步按正确顺序送入生产。具体 Job 配置见[生产数据迁移同步](./production-data-migration.md)，全部参数见[数据任务 API 参考](./data-tasks.md)。

## 能力边界

monSQLize 提供：

- `ensureIndexes()`、`ensureModelIndexes()` 和 collection 索引 API。
- `dataTasks`，用于有边界的一次性数据和索引发布。
- Change Stream sync，用于首次回填后的异步 CDC。

它不替代整库导入导出、数据库级备份恢复或 exactly-once 数据管道。生产发布仍应先建立数据库恢复点。

## 发布顺序

1. 创建数据库备份或托管恢复点。
2. 生产服务使用 `autoIndex: false` 部署代码。
3. 对 Model 索引执行 dry-run，解决 conflicts 后创建 missing。
4. 如果本次发布需要业务数据或非 Model 索引，执行 `dataTasks.preview(job)`。
5. 审核数量、样本、索引状态、备份估算和 approval 有效期。
6. 使用同一次 preview 的 approval 执行 `dataTasks.apply()`。
7. 校验生产读路径；只有 passed 结果才能继续。
8. 需要持续增量同步时，再启动 Change Stream sync。
9. 检查同步状态、慢查询、错误日志和代表性数据。
10. 所有门禁通过后切换流量。

## 索引发布与 autoIndex

`autoIndex: true` 会在运行时连接后读取现有索引，跳过 existing，并创建 missing。它不是生产发布门禁：启动路径无法替代显式 dry-run、冲突审核、唯一索引重复检查、重索引维护窗口和回滚决策。

因此生产常驻服务建议关闭自动建索引：

```js
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

if (plan.totals.conflicts === 0) {
  await msq.ensureModelIndexes({
    models: ['users', 'orders'],
    throwOnError: true
  });
}
```

`ensureModelIndexes()` 和 `ModelInstance.ensureIndexes()` 都先与 `listIndexes()` 结果比较。执行模式只创建 missing，不会自动 drop、rename 或 rebuild conflicts。

非 Model 集合可以使用 dataTasks 声明本次需要的索引，或直接使用 collection API：

```js
const users = msq.collection('users');
const existing = await users.listIndexes();

await users.createIndexes([
  { key: { email: 1 }, unique: true, name: 'users_email_unique' },
  { key: { status: 1, createdAt: -1 }, name: 'users_status_createdAt' }
]);
```

生产索引门禁：

- unique index 创建前检查线上重复数据。
- 大集合索引安排受控维护窗口。
- 破坏性索引操作前记录当前索引列表和查询影响。
- 切流后重新检查慢查询和代表性 `explain()`。

## 一次性数据迁移同步

一次性发布只使用同一份 `DataTaskJob`：

```ts
const preview = await dataTasks.preview(job);
if (!preview.passed || !preview.approval) {
  throw new Error(preview.errors.join('; '));
}

const result = await dataTasks.apply(job, {
  approval: preview.approval
});
```

生产值守人员应保存 preview 输出、apply 结果和 `backup.manifestPath`。source、target、index 或 Job 变化后必须重新 preview，不能复用 approval。

apply 返回 partial/failed 时：

1. 停止后续切流，不要假设零副作用。
2. 保存错误、manifest 和当前目标状态。
3. 执行 `previewRestore()` 判断是否可安全恢复。
4. 审核恢复动作后再调用 `restore()`；禁止跳过恢复预览。

完整场景和配置见[生产数据迁移同步](./production-data-migration.md)。

## 回填后的 Change Stream

Change Stream sync 用于后续 CDC、备份库、投影库、缓存失效回调等异步更新，不替代第一次历史回填。

```js
const msq = new MonSQLize({
  type: 'mongodb',
  databaseName: 'app',
  config: {
    uri: process.env.MONGODB_URI,
    replicaSet: 'rs0'
  },
  sync: {
    enabled: true,
    targets: [{
      name: 'backup-main',
      uri: process.env.BACKUP_MONGODB_URI,
      collections: ['users', 'orders']
    }],
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

- MongoDB 必须是 replica set。
- 同步语义是 at-least-once，不是 exactly-once。
- 自定义 target 应按 change event `_id` 去重。
- 监控 `getSyncStats().isRunning`、`errorCount`、`lastError`、target error 和 token save error。
- resume token 丢失时应执行缺口修复或全量比对。

## 切流检查清单

切流前：

- `npm run release:preflight` 已通过。
- 数据库恢复点和 dataTasks 受影响范围备份都可访问。
- Model 索引 dry-run 无 conflicts，missing 已处理或有明确延期依据。
- dataTasks 结果为 passed，数量和样本符合需求。
- 目标生产查询使用的索引已就绪。
- 需要 CDC 时 sync stats 健康且 resume token 可持久化。
- 慢查询和应用错误没有新增阻断项。
- 回滚负责人、命令、manifest 和停止条件已明确。

切流后：

- 对关键集合做源端/目标端数量和样本比对。
- 检查旧、新读路径的关键记录。
- 观察同步延迟、错误日志和慢查询。
- 延迟变化时用 `explain()` 检查代表性查询。
- 发布窗口关闭前保留旧恢复点和 dataTasks manifest。

## 相关文档

- [生产数据迁移同步](./production-data-migration.md)
- [数据任务 API 参考](./data-tasks.md)
- [Change Stream 同步](./sync-backup.md)
- [批量创建索引](./create-indexes.md)
- [列出索引](./list-indexes.md)
- [删除索引](./drop-index.md)
- [慢查询日志](./slow-query-log.md)
