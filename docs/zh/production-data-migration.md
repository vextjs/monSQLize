# 生产数据迁移同步

这页回答一个具体问题：开发或预发布实例 A 中，本次需求需要的少量业务数据、索引和局部字段调整，如何安全同步到生产实例 B。

## 先选择正确工具

| 需求 | 推荐工具 |
|------|----------|
| 按条件同步本次发布数据和明确索引 | `dataTasks` |
| 少数字段改名、赋固定值或移除 | `data.rename/set/unset` |
| 整库复制、超大规模导入导出 | `mongodump/mongorestore` 或托管迁移工具 |
| 数据库灾难恢复、时间点恢复 | Atlas/Cloud Manager/Ops Manager 或既有备份系统 |
| 首次回填后的持续增量同步 | Change Stream sync |
| Model Schema 演进 | 应用层兼容发布；索引另走索引预检 |

dataTasks 不把 Model Schema 写入数据库，也不要求迁移目录、版本文件或 up/down 脚本。任务名只是本次发布的稳定标识，不是全局迁移版本号。

## 推荐发布路径

1. 确认 source、target、集合和本次需求的数据筛选条件。
2. 只声明本次生产需要的索引，不复制 source 的全部索引。
3. 为每个数据集合选择稳定 identity。
4. 需要时仅配置少数字段的 `rename/set/unset`。
5. 生产任务配置持久化 `backup.dir`，先做数据库级恢复点。
6. 执行 preview，人工审核数量、样本、索引状态和备份估算。
7. 使用本次 preview 的 approval 执行 apply。
8. 校验生产读路径；失败时先 previewRestore，再经审核 restore。

## 场景一：业务键匹配

两端 `_id` 不需要一致时，用业务键：

```ts
const job: DataTaskJob = {
  name: 'release-2026-07-feature-modules',
  source: development,
  target: production,
  targetEnvironment: 'production',
  collections: [{
    name: 'feature_modules',
    indexes: [
      { key: { code: 1 }, options: { unique: true } },
      { key: { release: 1, enabled: 1 } }
    ],
    data: {
      filter: { release: '2026-07' },
      identity: { mode: 'fields', fields: ['code'] },
      rename: { legacyName: 'name' },
      set: { schemaVersion: 2 },
      unset: ['developmentOnly'],
      maxDocuments: 5000
    },
    verify: { mode: 'full', fields: ['code', 'name', 'schemaVersion'] }
  }],
  backup: { dir: './.monsqlize/data-tasks/releases/2026-07' },
  lock: true
};
```

已有目标文档保留目标 `_id`，新文档由目标生成 `_id`。`code` 必须由目标已有或任务声明的 exact unique index 保护。

## 场景二：`_id` 必须一致

种子数据、权限资源或跨环境引用要求 `_id` 完全一致时：

```ts
data: {
  filter: { release: '2026-07' },
  identity: {
    mode: 'source-id',
    conflictBy: ['tenantId', 'code']
  }
}
```

新文档保留来源 `_id`。如果目标已存在相同 `tenantId + code`、但 `_id` 不同的文档，preview 会阻断，避免制造逻辑重复。

## 场景三：只同步索引

不需要数据回填时省略 `data`：

```ts
collections: [{
  name: 'orders',
  indexes: [
    { key: { tenantId: 1, orderNo: 1 }, options: { unique: true } },
    { key: { status: 1, createdAt: -1 } }
  ]
}]
```

`indexes[].name` 可选。preview 总是先读取目标索引；apply 只创建 missing。冲突索引需要人工决策，不会自动删除或重建。

## 场景四：只同步数据

目标已经有 identity unique index 时可以省略 `indexes`：

```ts
collections: [{
  name: 'settings',
  data: {
    all: true,
    identity: { mode: 'source-id', conflictBy: ['code'] }
  }
}]
```

`all: true` 是显式全集合授权。普通任务优先使用窄 filter，并用 `maxDocuments` 再加一层数量上限。

## Preview 要审核什么

```ts
const preview = await dataTasks.preview(job, { sampleSize: 20 });
```

至少检查：

- `passed` 为 true，且没有 index conflict 或 identity conflict。
- 每个 collection 的 source/insert/update/unchanged 与需求预期一致。
- `samples[].before/after` 中只有预期字段发生变化。
- missing index 正是本次希望创建的索引。
- `backupDocuments`、`backupBytes` 在发布窗口可接受范围内。
- production 的 backup 目录是持久盘，不是临时目录。

preview 不写数据库。任何 Job、source、target 或索引变化都会让旧 approval 失效，因此不能复用历史 approval。

## Apply 后检查

```ts
const applied = await dataTasks.apply(job, { approval: preview.approval! });
```

只有 `passed: true` 且 `status: 'passed'` 才能进入后续切流。`partial` 表示已有部分写入或索引创建，必须保留 `backup.manifestPath`，检查错误后决定恢复或修复，不能直接重跑并假设没有副作用。

## 恢复演练

```ts
const restorePlan = await dataTasks.previewRestore(applied.backup);
const restored = await dataTasks.restore(applied.backup, {
  approval: restorePlan.approval!
});
```

恢复也需要新的 approval。目标在 apply 后发生业务写入时，恢复会因 drift 阻断，避免覆盖后续生产数据。restore 还会生成 safety backup，因此一次恢复也可以被撤销。

## CLI 发布

CLI 文件直接导出同一份 Job，配置内容与 SDK 完全一致。区别只在于 `source/target` 使用连接选项：

```bash
monsqlize data-task preview --task ./tasks/release.cjs --out preview.json --json
monsqlize data-task apply --task ./tasks/release.cjs --approval preview.json --out result.json --json
```

需要恢复时使用 `result.json` 中的 backup manifest 路径执行 preview-restore 和 restore。完整命令与参数见[数据任务 API 参考](./data-tasks.md#cli)。

## 常见错误

- 把空 `{}` 当 filter：会被拒绝；全集合必须写 `all: true`。
- 用会变化的字段做 identity：approval 容易漂移，也可能匹配错误记录。
- 未为 fields identity 准备 unique index：preview 无法证明一对一匹配。
- 试图用 dataTasks 做整库备份：它只备份本次受影响范围。
- 在 `set` 中放函数或 MongoDB 表达式：只支持确定性 BSON 字面量。
- production 使用临时 backup 目录：进程结束后可能失去恢复材料。
- apply 失败后直接重跑：先查看 status、manifest 和恢复预览。

## 相关文档

- [数据任务 API 参考](./data-tasks.md)
- [生产发布与迁移](./production-rollout.md)
- [Change Stream 同步](./sync-backup.md)
