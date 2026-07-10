# 数据任务 dataTasks

`msq.dataTasks` 用于执行小范围、显式、可复核的发布任务：生产索引同步、筛选数据同步、字段调整、受影响数据快照和结果验证。

它不是 schema migration 框架，也不会维护 up/down 迁移台账。全库搬迁应优先使用 MongoDB 原生导入导出或应用自有任务。发布中需要有边界、可 dry-run、可复跑的操作时，使用 dataTasks。

## 任务流程

```javascript
const task = {
  name: 'sync-active-users',
  environment: 'production',
  source: { collection: 'sourceUsers' },
  target: { collection: 'targetUsers' },
  filter: { status: 'active' },
  matchBy: ['email'],
  batchSize: 500,
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
if (!plan.passed) throw new Error(plan.errors.join('; '));

const preview = await msq.dataTasks.dryRun(task);
if (!preview.passed) throw new Error(preview.errors.join('; '));

const reviewedSnapshot = await msq.dataTasks.exportAffected(task);
if (!reviewedSnapshot.checksum) throw new Error('Snapshot checksum is missing.');
// 审核快照文件与 manifest 后，再批准这个 checksum。

const run = await msq.dataTasks.run(task, {
  confirmProduction: true,
  approvedSnapshotChecksum: reviewedSnapshot.checksum
});
if (!run.passed) throw new Error(run.errors.join('; '));

const verification = await msq.dataTasks.verify(task);
if (!verification.passed) throw new Error(verification.errors.join('; '));
```

`dryRun()` 只预览写入，执行后校验步骤会明确延后。`run()` 会在持有可选任务锁时重新生成受影响快照；如果当前 checksum 与人工审核过的 checksum 不一致，生产写入会被拒绝。

CLI 使用同一套流程：

```bash
monsqlize data-task plan --task ./tasks/sync-active-users.json --json
monsqlize data-task dry-run --task ./tasks/sync-active-users.cjs
monsqlize data-task snapshot --task ./tasks/sync-active-users.cjs --json
monsqlize data-task run --task ./tasks/sync-active-users.cjs --confirm-production --snapshot-checksum <reviewed-sha256>
monsqlize data-task verify --task ./tasks/sync-active-users.cjs
```

`dry-run`、`snapshot`、`run`、`verify` 需要任务文件导出 `{ runtime, task }`，CLI 用 `runtime` 创建 `MonSQLize` 实例。只做静态校验的 `plan` 可以不连接数据库。把 `snapshot` 输出的快照文件和 manifest 审核通过后，才能把 checksum 传给 `run`。

## 支持的步骤

| 步骤 | 用途 | 是否写入 |
|------|------|----------|
| `ensureIndexes` | 先 `listIndexes()`，报告冲突，只创建缺失索引 | 只写索引元数据 |
| `syncData` | 将筛选后的源文档按 `insert`、`upsert`、`merge` 或 `replace` 写入目标集合 | 目标文档 |
| `transformFields` | 对筛选后的目标文档执行更新操作符、更新管道或 transform 函数 | 目标文档 |
| `exportAffected` | 将受影响目标文档导出为 JSONL / extended JSONL | 只写快照文件 |
| `verify` | 验证数量、必需字段和索引状态 | 否 |

## 任务配置

| 字段 | 是否必需 | 默认值与行为 |
|------|:--------:|--------------|
| `name` | 是 | 审计标签与快照文件名前缀 |
| `source` | `syncData`、数量/样本校验需要 | `{ collection, database? / db?, pool? }` |
| `target` | 是 | 目标端点，字段与 source 相同 |
| `filter` | 数据写入需要 | 默认必需；只有显式 `allowFullCollection: true` 才接受全集合任务 |
| `allowFullCollection` | 否 | 默认 `false`；全集合无筛选任务必须显式开启 |
| `projection` | 否 | source 读取投影，可用对象或字符串数组；快照始终保留完整 target 前像 |
| `sort` | 否 | 默认 `{ _id: 1 }`，保证稳定遍历 |
| `matchBy` | 跨端点同步需要 | 稳定业务字段，例如 `['tenantId', 'code']` |
| `batchSize` | 否 | 默认 `500`；控制 source 与 callback transform 的读取批次 |
| `snapshot` | 否 | 默认启用；目录 `.monsqlize/data-task-snapshots`，格式 `extended-jsonl` |
| `lock` | 否 | 默认关闭；启用后只提供当前进程内租约 |
| `environment` / `production` | 写任务必需 | 只接受 `development`、`test`、`staging`、`production`、`prod`、`live`，未知名称直接拒绝；生产别名、`production: true` 或生产 `NODE_ENV` 会启用生产保护 |
| `steps` | 是 | 非空、有顺序的步骤列表 |

`snapshot` 可传布尔值、目录字符串，或 `{ enabled, dir, format, allowRunWithoutSnapshot }`。执行参数中的 `snapshotDir` 可以覆盖目录。生产数据写入不能禁用快照。

### 步骤参数

| 步骤 | 参数与默认行为 |
|------|----------------|
| `ensureIndexes` | 用 `model` / `models` 读取 Model 声明，或传 `indexes: [{ key, name?, options? }]`；`conflictPolicy` 默认 `report`，设为 `throw` 时遇到冲突直接拒绝 |
| `syncData` | `strategy` 默认 `upsert`；步骤级 `matchBy`、`batchSize` 覆盖任务级值；跨端点 `allowSourceIdMatch` 默认 `false` |
| `transformFields` | `update`、`pipeline`、`transform` 必须且只能选一个；dry-run 的 `sampleSize` 默认 `5` |
| `exportAffected` | 可用步骤级 `snapshot` 覆盖任务配置 |
| `verify` | 支持 `count`、`fields`、`indexes` 和非负 `sample`；未声明的检查不会执行 |

### 执行参数

| 参数 | 默认值 | 用途 |
|------|--------|------|
| `confirmProduction` | `false` | 第一层生产写入闸门 |
| `approvedSnapshotChecksum` | 无 | 第二层生产数据写入闸门 |
| `continueOnError` | `false` | 在支持的位置继续文档/步骤处理，但最终结果仍保持失败 |
| `snapshotDir` | 任务配置或 `.monsqlize/data-task-snapshots` | 覆盖快照输出目录 |
| `allowRunWithoutSnapshot` | `false` | 只允许非生产任务显式跳过 |
| `onProgress` | 无 | 接收任务、模式、步骤、已处理数、总数和批次进度 |

## 同步策略

| 策略 | 业务键已存在 | 业务键不存在 | target 独有字段 |
|------|--------------|----------------|------------------|
| `insert` | 跳过 | 插入 | 现有文档不变 |
| `upsert` | 用 `$set` 写入 source 字段 | upsert 插入 | 未被 source 覆盖的字段保留 |
| `merge` | 深度合并 target 与 source，保留 target `_id` 后替换 | 插入 | 保留，包括嵌套的 target 独有字段 |
| `replace` | 用 source 替换并保留 target `_id` | 插入 | 删除 |

默认策略是 `upsert`。只有明确要删除 target 独有字段时才使用 `replace`。一个业务键匹配多个 target 文档时任务失败，不会任意取第一条；source 中重复业务键会在快照审批前阻断写入。

`batchSize` 限制游标读取边界，不是 checkpoint 或 exactly-once 保证。`syncData` 与 callback transform 逐文档写入；operator / pipeline transform 使用 MongoDB `updateMany()`。任务应具备幂等性，便于检查部分结果后安全重跑。

## 安全规则

- `syncData`、`transformFields`、`exportAffected` 必须提供 `filter`，除非显式设置 `allowFullCollection: true`。
- 跨端点 `syncData` 必须使用稳定业务字段 `matchBy`。默认禁止用源端 `_id` 匹配，除非 step 设置 `allowSourceIdMatch: true`。
- 每个写任务都必须声明受支持的环境名称；未知值和生产环境拼写错误会在 plan 阶段失败。运行进程处于生产环境时，不能通过任务里的非生产环境声明降级。
- 生产数据写入必须同时提供 `confirmProduction: true` 和 `approvedSnapshotChecksum`；CLI 对应 `--confirm-production` 与 `--snapshot-checksum`。
- 数据写入步骤会先导出受影响文档快照。非生产任务只有显式 `allowRunWithoutSnapshot: true` 才能跳过；生产数据写入不能禁用快照。
- 索引同步总是先读取 `listIndexes()`。冲突只报告；dataTasks 不会 drop、rename 或 rebuild 冲突索引。

## 快照审核与局部恢复

`syncData` 的快照按 source 实际 `matchBy` 查询 target，而不是盲目套用 target filter。每一行都是前像 envelope：

```json
{"match":{"email":"a@example.com"},"before":{"_id":"...","email":"a@example.com","name":"Old name"}}
{"match":{"email":"new@example.com"},"before":null}
```

manifest 会记录 `taskName`、`target`、`filter`、`format`、`count`、`existingCount`、`insertCandidates`、`bytes`、`createdAt` 和 SHA-256 `checksum`。必须同时审核数据文件与 manifest。如果 `run()` 前 checksum 发生变化，应停止并重新审核新的受影响集合，不能自动批准。

快照是前像证据，不是自动回滚引擎。局部恢复时，先停止任务和相关流量，确认同一批记录没有被后续业务修改；对 `before` 非空的记录按原 `_id` 恢复，对 `before: null` 的新增候选，只有确认它确由本任务创建且删除安全时才移除。恢复后再次执行 verify。完整恢复请使用 `mongodump` / `mongorestore` 或托管备份服务。

## 锁的作用域

`lock: true` 使用 `data-task:<task.name>`。字符串或 `{ key }` 可指定 key。默认 TTL 为 10 秒，runner 会自动续租；也可以设置大于 0 且小于 `ttlMs` 的 `renewIntervalMs`。

内置锁只协调当前 Node.js 进程中的任务（`scope: 'process'`），不能协调不同 CLI 进程、容器或应用节点。生产任务应通过单实例作业执行器运行；存在多进程竞争时，需要外部分布式锁或编排保证。

## 结果、失败与重试

| 结果 | 关键字段 |
|------|----------|
| Plan | `passed`、`risk`、`willWrite`、所需确认、逐步骤 warnings/errors |
| Dry-run | `passed`、`results`、`warnings`、`errors`；verify 结果标记为 deferred |
| Snapshot | `path`、`manifestPath`、数量、bytes、format、checksum |
| Run | `passed`、`status`、`snapshot`、逐步骤结果、聚合后的 errors |
| Verify | `passed`、`checked`、`mismatched`、`checks`、`mismatches`、errors |

默认采用 fail-fast。`continueOnError: true` 会在支持的位置继续检查后续文档或步骤，但只要出现错误，最终结果仍是失败。配置错误、生产审批错误和锁获取错误会直接拒绝操作；步骤或单文档失败会传播到顶层 `run.errors`。CLI 会打印嵌套失败并以状态码 1 退出。

系统没有内置重试账本或 checkpoint。重试前应检查 `run.results`、快照和 target 当前状态，修复重复业务键或临时基础设施故障，保持相同的有界 filter，重新执行 plan、dry-run 和快照审核，再运行幂等任务。

常见故障：

| 提示或现象 | 处理方式 |
|------------|----------|
| 要求显式环境 | 为每个写任务设置 `environment` |
| 缺少 `confirmProduction` 或快照 checksum | 完成快照审核并传入两个生产闸门参数 |
| 审批 checksum 不匹配 | 受影响集合已变化，重新审核新快照 |
| 业务键匹配多个 target | 修复 target 唯一性，不能用 `continueOnError` 隐藏 |
| 锁所有权丢失 | 确认没有竞争写入，必要时调整 TTL，再从 plan 开始 |
| CLI 状态码为 1 | 同时阅读 stderr、顶层错误和嵌套失败，不能只看有 JSON 输出就判成功 |

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
    environment: 'production',
    source: { collection: 'sourceUsers' },
    target: { collection: 'targetUsers' },
    filter: { status: 'active' },
    matchBy: ['email'],
    batchSize: 500,
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
