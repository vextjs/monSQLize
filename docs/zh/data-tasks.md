# 数据任务 dataTasks

当一次发布需要把来源实例 A 中筛选出的数据和明确声明的索引同步到目标实例 B 时，使用命名导出的 `dataTasks`，也可以使用 `MonSQLize.dataTasks`。正常主流程只有两步：`preview(job)`，审核后执行 `apply(job, { approval })`。

它解决的是发布范围内的数据同步，不是 Schema migration、CDC 或全库备份工具。全库迁移、时间点恢复和灾难恢复继续使用 MongoDB Database Tools 或托管备份服务。

## 第一次成功任务

```ts
import { dataTasks, type DataTaskJob } from 'monsqlize';

const job = {
  name: 'release-2026-07-feature-modules',
  source: development,
  target: production,
  targetEnvironment: 'production',
  collections: [{
    name: 'feature_modules',
    indexes: [
      { key: { code: 1 }, name: 'feature_modules_code_unique', options: { unique: true } },
      { key: { release: 1, enabled: 1 }, name: 'feature_modules_release_enabled' }
    ],
    data: {
      filter: { release: '2026-07' },
      identity: { mode: 'fields', fields: ['code'] },
      strategy: 'upsert',
      projection: { code: 1, name: 1, enabled: 1, release: 1 },
      transform: { pipeline: [{ $set: { schemaVersion: 2 } }] },
      batchSize: 500
    },
    verify: {
      mode: 'full',
      fields: ['code', 'name', 'enabled', 'schemaVersion']
    }
  }],
  backup: {
    dir: './.monsqlize/data-tasks',
    format: 'extended-jsonl',
    compression: 'gzip',
    retentionDays: 7
  },
  lock: true
} satisfies DataTaskJob;

const preview = await dataTasks.preview(job);
if (!preview.passed || !preview.approval) throw new Error(preview.errors.join('; '));

const run = await dataTasks.apply(job, { approval: preview.approval });
if (!run.passed) throw new Error(run.errors.join('; '));
```

SDK 可以传入两个已连接的 monSQLize 实例，连接生命周期由调用方管理。CLI 使用两个独立的 `MonSQLizeOptions`，连接由 dataTasks 创建并在完成或失败后关闭。

## 参数参考

| 路径 | 必填 | 默认值 | 作用 |
|------|:----:|--------|------|
| `name` | 是 | - | 稳定任务名，用于 approval 和 manifest |
| `description` | 否 | 无 | 人类可读说明，不改变执行语义 |
| `source` | 是 | - | 只读来源 runtime 或 `MonSQLizeOptions` |
| `target` | 是 | - | 独立目标 runtime 或 `MonSQLizeOptions`；数据库写入只发生在这里 |
| `targetEnvironment` | 是 | - | `development/test/staging/production/prod/live`；生产别名启用持久备份门禁 |
| `collections` | 是 | - | 非空集合任务数组；同一目标集合只能出现一次 |
| `collections[].name` | 是 | - | 来源集合名 |
| `collections[].targetName` | 否 | 与 `name` 相同 | 目标集合名不同时填写 |
| `collections[].indexes` | 条件 | `[]` | 本次需要确保存在的准确索引规格；不会复制来源全部索引 |
| `indexes[].key` | 是 | - | 保留字段顺序的 MongoDB 索引 key |
| `indexes[].name` | 否 | MongoDB 生成 | 生产建议显式命名，便于审核和恢复 |
| `indexes[].options` | 否 | `{}` | `unique`、`sparse`、TTL、partial filter、collation 等 driver 选项 |
| `collections[].data` | 条件 | 关闭 | 来源筛选和目标写入规则；索引-only 任务可省略 |
| `data.filter` / `data.all` | 二选一 | - | 非空 filter，或显式 `all: true`；空对象会被拒绝 |
| `data.identity` | 有 data 时 | - | 来源与目标如何认定为同一文档 |
| `data.strategy` | 否 | `upsert` | `upsert` 更新/插入；`insert` 遇到已有身份即拒绝 |
| `data.projection` | 否 | 全字段 | 来源投影，不能排除身份字段 |
| `data.transform` | 否 | 无 | `pipeline`/`handler` 二选一，在 diff/write 前运行 |
| `data.batchSize` | 否 | `500` | 有序 manifest checkpoint 批次，整数 `1..10000`；不是 bulk 并发参数 |
| `data.maxDocuments` | 否 | `10000` | 来源筛选文档上限；preview 在加载前对超限结果直接阻断 |
| `collections[].verify.mode` | 否 | `sample` | 字段内容验证强度：`sample` 或 `full` |
| `verify.fields` | 否 | 计划写入字段 | apply 后比较的字段 |
| `verify.sampleSize` | 否 | `20` | 稳定抽样数量，整数 `1..1000` |
| `backup.dir` | 生产必填 | 非生产使用系统临时目录 | 受影响范围回滚包持久目录 |
| `backup.format` | 否 | `extended-jsonl` | 保留 BSON 类型的数据格式 |
| `backup.compression` | 否 | `gzip` | `gzip` 或 `none` |
| `backup.retentionDays` | 否 | `7` | 保留策略元数据；dataTasks 不静默删除回滚包 |
| `backup.maxBytes` | 否 | `268435456` | 未压缩 Extended JSONL 回滚数据上限，默认 256 MiB |
| `lock` | 否 | `false` | `true` 或 `{ ttlMs, waitTimeoutMs }` 启用目标数据库租约 |
| `lock.ttlMs` | 否 | `120000` | 租约时长，运行中自动续租 |
| `lock.waitTimeoutMs` | 否 | `0` | 被其他 runner 占用时最多等待多久 |

每个 collection 至少要有非空 `indexes`、`data`，或两者都有。

## identity、transform 与 verify

`identity: { mode: 'fields', fields: ['code'] }` 用稳定业务字段匹配。已有目标文档保留自己的 `_id`，新文档由目标生成 `_id`。目标已有索引或同一 collection 的 `indexes` 中必须存在完全覆盖这些字段的非 partial unique index。

只有两端必须保持完全相同 `_id` 时才使用：

```ts
data: {
  filter: { release: '2026-07' },
  identity: { mode: 'source-id', conflictBy: ['code'] },
  strategy: 'upsert'
}
```

`source-id` 插入时保留来源 `_id`，已有文档只有 `_id` 相同时才更新。`conflictBy` 用来发现业务键相同但 `_id` 不同的逻辑重复；preview 会阻断，不会删除重插或修改 immutable `_id`。

transform 顺序固定为 `filter -> projection -> 读取 identity -> transform -> diff`。pipeline 禁止 `$out/$merge`，不能改变文档数量或 identity。handler 在 preview 中对同一输入执行两次，必须返回相同文档；时间、随机数或外部可变状态会让 approval 失效。

索引定义、写入数量、identity 唯一性、source-id、备份数据 checksum、manifest 结构和实际操作始终全量验证。`verify.mode` 只控制字段内容比较：`sample` 比较稳定样本，`full` 比较所有变更文档。

## preview 与 apply

`preview()` 对数据库零写入。它会先对每个目标集合调用 `listIndexes()`，把声明索引分为 `existing/missing/conflict`，再按 `data.maxDocuments` 统计来源数量、执行 transform、比较目标身份、按 `backup.maxBytes` 计算 Extended JSONL 回滚数据，并返回 insert/update/unchanged 数量和样本。approval 会绑定归一化 job、转换后的来源数据、目标前像、目标索引和过期时间。

`preview(job, { sampleSize, approvalTtlMs })` 可调整输出样本数与 approval 有效期；`sampleSize` 范围为 `0..100`，`approvalTtlMs` 范围为 `1000..86400000`，默认 15 分钟。

approval 是绑定本次审核状态的防误操作令牌，不是用户认证或权限凭据。谁可以读取来源、修改目标和执行任务，仍由进程权限、MongoDB 账号与发布平台授权控制。

对于已存在的普通升降序 unique index，preview 只检查本计划影响的最终键和对应目标冲突。缺失的 unique index 需要证明整个目标最终镜像；dataTasks 最多扫描 10,000 个目标文档，超限时要求先在数据库侧专项核验并建索引，再重新 preview。unique partial、collation、multikey 或其他无法精确证明的特殊键型也会以 `INDEX_CONFLICT` 阻断。

`apply()` 会重新计算同一计划。job、来源、目标或索引发生任何漂移，旧 approval 都会失效。通过后的顺序固定为：

1. 获取可选的目标数据库租约，并在持有租约时重新计算计划、校验已审核 approval。
2. 写入受影响范围回滚包，并回读校验 checksum 和条目数。
3. 再次读取索引，只创建声明的 missing 索引。
4. 先把当前 checkpoint batch 的全部操作写为 pending，再按顺序执行，整批成功后转为 applied。
5. 验证数据、identity、索引和 manifest。
6. 标记 run 通过并释放租约。

该过程不是跨集合和索引的事务。更新会把完整审核前像放入 MongoDB 写过滤器；计划插入只允许新建。其他写入者在 preview 后修改或创建目标时，apply 会失败而不是覆盖该文档。失败会停止后续工作，保留 `failed/partial` 回滚包与 manifest，绝不会自动触发恢复。

## 恢复

恢复有独立 preview 和 approval。它会校验回滚包 checksum，并确认每个实际写入文档和创建索引仍与 run 结束状态一致。进程在数据库写入后、applied 清单落盘前中断时，previewRestore 会用 pending 前像、计划后像和目标现状判断该操作是否实际生效；无法严格判断或存在后续写入时会阻断恢复。

```ts
const restorePreview = await dataTasks.previewRestore(run.backup);
if (!restorePreview.passed || !restorePreview.approval) {
  throw new Error(restorePreview.errors.join('; '));
}

const restored = await dataTasks.restore(run.backup, {
  approval: restorePreview.approval
});
```

restore 写目标前会再创建 restore-safety package。文档替换/删除使用精确当前镜像过滤器，恢复曾删除的文档只允许插入；并发目标变化会阻断恢复，不会被覆盖。restore 还只移除定义未变化的本任务索引并验证结果。这个 safety package 本身也可再次执行 `previewRestore/restore`，用于撤销一次恢复。

## CLI

任务模块导出 `job`，其中 `source/target` 使用 `MonSQLizeOptions`。

```bash
monsqlize data-task preview --task ./tasks/release.cjs --out preview.json --json
monsqlize data-task apply --task ./tasks/release.cjs --approval preview.json --out run.json --json
monsqlize data-task preview-restore --task ./tasks/release.cjs --backup ./.monsqlize/data-tasks/release/run/manifest.json --out restore-preview.json --json
monsqlize data-task restore --task ./tasks/release.cjs --backup ./.monsqlize/data-tasks/release/run/manifest.json --approval restore-preview.json --json
```

配置错误、approval 过期/漂移、锁冲突、failed/partial、checksum 错误或恢复漂移都会让 CLI 以状态码 `1` 退出。

**稳定错误码**

捕获 `DataTaskJobError` 时可读取 `code`、`phase` 和可选的 `collection`。公开错误码为：`INVALID_JOB`、`IDENTITY_CONFLICT`、`INDEX_CONFLICT`、`APPROVAL_STALE`、`BACKUP_FAILED`、`LOCK_NOT_ACQUIRED`、`LOCK_LOST`、`APPLY_PARTIAL`、`RESTORE_DRIFT`、`RESTORE_FAILED`。业务逻辑应按 `code` 分支，不要解析错误消息。

## 能力边界

- `backup` 是本次受影响范围的回滚包，不是全库或时间点备份。
- dataTasks 不同步 Model Schema，不维护迁移目录/up-down ledger，不执行 CDC，也不会复制来源全部索引。
- 全库备份与灾难恢复使用 `mongodump/mongorestore`、Atlas、Cloud Manager 或 Ops Manager。
- 历史数据回填后的持续变更使用 Change Stream sync。

<details>
<summary>高级兼容 DataTaskRunner API</summary>

实例 API `msq.dataTasks` 保留当前 v3 候选的高级 runner，继续使用 endpoint/steps 配置和 `plan`、`dryRun`、`exportAffected`、`run`、`verify`。新发布任务应使用上面的 facade。

**旧任务流程**

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

**旧版支持步骤**

| 步骤 | 用途 | 是否写入 |
|------|------|----------|
| `ensureIndexes` | 先 `listIndexes()`，报告冲突，只创建缺失索引 | 只写索引元数据 |
| `syncData` | 将筛选后的源文档按 `insert`、`upsert`、`merge` 或 `replace` 写入目标集合 | 目标文档 |
| `transformFields` | 对筛选后的目标文档执行更新操作符、更新管道或 transform 函数 | 目标文档 |
| `exportAffected` | 将受影响目标文档导出为 JSONL / extended JSONL | 只写快照文件 |
| `verify` | 验证数量、必需字段和索引状态 | 否 |

**旧版任务配置**

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

**旧版步骤参数**

| 步骤 | 参数与默认行为 |
|------|----------------|
| `ensureIndexes` | 用 `model` / `models` 读取 Model 声明，或传 `indexes: [{ key, name?, options? }]`；`conflictPolicy` 默认 `report`，设为 `throw` 时遇到冲突直接拒绝 |
| `syncData` | `strategy` 默认 `upsert`；步骤级 `matchBy`、`batchSize` 覆盖任务级值；跨端点 `allowSourceIdMatch` 默认 `false` |
| `transformFields` | `update`、`pipeline`、`transform` 必须且只能选一个；dry-run 的 `sampleSize` 默认 `5` |
| `exportAffected` | 可用步骤级 `snapshot` 覆盖任务配置 |
| `verify` | 支持 `count`、`fields`、`indexes` 和非负 `sample`；未声明的检查不会执行 |

**旧版执行参数**

| 参数 | 默认值 | 用途 |
|------|--------|------|
| `confirmProduction` | `false` | 第一层生产写入闸门 |
| `approvedSnapshotChecksum` | 无 | 第二层生产数据写入闸门 |
| `continueOnError` | `false` | 在支持的位置继续文档/步骤处理，但最终结果仍保持失败 |
| `snapshotDir` | 任务配置或 `.monsqlize/data-task-snapshots` | 覆盖快照输出目录 |
| `allowRunWithoutSnapshot` | `false` | 只允许非生产任务显式跳过 |
| `onProgress` | 无 | 接收任务、模式、步骤、已处理数、总数和批次进度 |

**旧版同步策略**

| 策略 | 业务键已存在 | 业务键不存在 | target 独有字段 |
|------|--------------|----------------|------------------|
| `insert` | 跳过 | 插入 | 现有文档不变 |
| `upsert` | 用 `$set` 写入 source 字段 | upsert 插入 | 未被 source 覆盖的字段保留 |
| `merge` | 深度合并 target 与 source，保留 target `_id` 后替换 | 插入 | 保留，包括嵌套的 target 独有字段 |
| `replace` | 用 source 替换并保留 target `_id` | 插入 | 删除 |

默认策略是 `upsert`。只有明确要删除 target 独有字段时才使用 `replace`。一个业务键匹配多个 target 文档时任务失败，不会任意取第一条；source 中重复业务键会在快照审批前阻断写入。

`batchSize` 限制游标读取边界，不是 checkpoint 或 exactly-once 保证。`syncData` 与 callback transform 逐文档写入；operator / pipeline transform 使用 MongoDB `updateMany()`。任务应具备幂等性，便于检查部分结果后安全重跑。

**旧版安全规则**

- `syncData`、`transformFields`、`exportAffected` 必须提供 `filter`，除非显式设置 `allowFullCollection: true`。
- 跨端点 `syncData` 必须使用稳定业务字段 `matchBy`。默认禁止用源端 `_id` 匹配，除非 step 设置 `allowSourceIdMatch: true`。
- 每个写任务都必须声明受支持的环境名称；未知值和生产环境拼写错误会在 plan 阶段失败。运行进程处于生产环境时，不能通过任务里的非生产环境声明降级。
- 生产数据写入必须同时提供 `confirmProduction: true` 和 `approvedSnapshotChecksum`；CLI 对应 `--confirm-production` 与 `--snapshot-checksum`。
- 数据写入步骤会先导出受影响文档快照。非生产任务只有显式 `allowRunWithoutSnapshot: true` 才能跳过；生产数据写入不能禁用快照。
- 索引同步总是先读取 `listIndexes()`。冲突只报告；dataTasks 不会 drop、rename 或 rebuild 冲突索引。

**旧版快照审核与局部恢复**

`syncData` 的快照按 source 实际 `matchBy` 查询 target，而不是盲目套用 target filter。每一行都是前像 envelope：

```json
{"match":{"email":"a@example.com"},"before":{"_id":"...","email":"a@example.com","name":"Old name"}}
{"match":{"email":"new@example.com"},"before":null}
```

manifest 会记录 `taskName`、`target`、`filter`、`format`、`count`、`existingCount`、`insertCandidates`、`bytes`、`createdAt` 和 SHA-256 `checksum`。必须同时审核数据文件与 manifest。如果 `run()` 前 checksum 发生变化，应停止并重新审核新的受影响集合，不能自动批准。

快照是前像证据，不是自动回滚引擎。局部恢复时，先停止任务和相关流量，确认同一批记录没有被后续业务修改；对 `before` 非空的记录按原 `_id` 恢复，对 `before: null` 的新增候选，只有确认它确由本任务创建且删除安全时才移除。恢复后再次执行 verify。完整恢复请使用 `mongodump` / `mongorestore` 或托管备份服务。

**旧版锁作用域**

`lock: true` 使用 `data-task:<task.name>`。字符串或 `{ key }` 可指定 key。默认 TTL 为 10 秒，runner 会自动续租；也可以设置大于 0 且小于 `ttlMs` 的 `renewIntervalMs`。

内置锁只协调当前 Node.js 进程中的任务（`scope: 'process'`），不能协调不同 CLI 进程、容器或应用节点。生产任务应通过单实例作业执行器运行；存在多进程竞争时，需要外部分布式锁或编排保证。

**旧版结果、失败与重试**

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

**旧版 CLI 任务文件**

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

</details>

## 相关示例

- [examples/docs/data-tasks.ts](https://github.com/vextjs/monSQLize/blob/main/examples/docs/data-tasks.ts)
- [生产发布](./production-rollout.md)
