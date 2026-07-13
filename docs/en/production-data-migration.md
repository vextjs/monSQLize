# Production Data Migration

This page covers one release task: copy the selected business data, explicit indexes, and a few deterministic field edits from development or staging instance A to production instance B.

## Choose the Right Tool

| Need | Recommended tool |
|------|------------------|
| Copy release-scoped filtered data and explicit indexes | `dataTasks` |
| Rename, set, or remove a few fields | `data.rename/set/unset` |
| Full database copy or very large import/export | `mongodump/mongorestore` or a managed migration tool |
| Disaster recovery or point-in-time restore | Atlas, Cloud Manager, Ops Manager, or your backup platform |
| Ongoing changes after the initial backfill | Change Stream sync |
| Model schema evolution | Application-level compatible rollout, with separate index preflight |

dataTasks does not store Model schema in MongoDB and does not require migration directories, versions, or up/down scripts. The job name identifies this release operation; it is not a global migration version.

## Recommended Release Path

1. Confirm source, target, collections, and the exact release filter.
2. Declare only indexes required by production; do not copy every source index.
3. Choose a stable identity policy for each data collection.
4. Configure only the required `rename/set/unset` field edits.
5. Configure durable `backup.dir` for production and create a database restore point first.
6. Run preview and review counts, samples, index states, and backup estimates.
7. Apply with the approval returned by that preview.
8. Validate production read paths; on failure, preview restore before an approved restore.

## Scenario 1: Business-Key Matching

Use fields identity when `_id` does not need to match:

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

Existing target documents keep their target `_id`; new documents receive a target-generated `_id`. An exact unique index must protect `code`.

## Scenario 2: `_id` Must Match

Use source ID for seed data or cross-environment references that require identical IDs:

```ts
data: {
  filter: { release: '2026-07' },
  identity: {
    mode: 'source-id',
    conflictBy: ['tenantId', 'code']
  }
}
```

Inserts preserve source `_id`. Preview blocks when the target has the same `tenantId + code` under another `_id`.

## Scenario 3: Indexes Only

Omit `data` when no backfill is required:

```ts
collections: [{
  name: 'orders',
  indexes: [
    { key: { tenantId: 1, orderNo: 1 }, options: { unique: true } },
    { key: { status: 1, createdAt: -1 } }
  ]
}]
```

`indexes[].name` is optional. Preview always reads target indexes first, and apply creates only missing indexes. Conflicts require an explicit operator decision.

## Scenario 4: Data Only

Omit `indexes` when the target already has the identity index:

```ts
collections: [{
  name: 'settings',
  data: {
    all: true,
    identity: { mode: 'source-id', conflictBy: ['code'] }
  }
}]
```

`all: true` explicitly authorizes the full collection. Prefer a narrow filter and a defensive `maxDocuments` limit for ordinary release tasks.

## What to Review in Preview

```ts
const preview = await dataTasks.preview(job, { sampleSize: 20 });
```

Review at least:

- `passed` is true and there are no index or identity conflicts.
- Source, insert, update, and unchanged counts match the release expectation.
- Every sample before/after image changes only intended fields.
- Missing indexes are exactly those intended for this release.
- Backup document and byte estimates fit the release window.
- Production backup uses durable storage, not a temporary directory.

Preview performs no writes. Any change to the Job, source, target, or indexes invalidates the approval.

## After Apply

```ts
const applied = await dataTasks.apply(job, { approval: preview.approval! });
```

Continue to traffic rollout only when `passed` is true and `status` is `passed`. A `partial` result means some writes or index creation may already exist. Preserve the manifest and decide whether to restore or repair before rerunning.

## Restore Drill

```ts
const restorePlan = await dataTasks.previewRestore(applied.backup);
const restored = await dataTasks.restore(applied.backup, {
  approval: restorePlan.approval!
});
```

Restore requires a new approval. Later production writes cause restore drift and block recovery instead of being overwritten. Restore also creates a safety backup so the restore itself can be reversed.

## CLI Release

The CLI file directly exports the same Job. Only `source` and `target` change to connection options:

```bash
monsqlize data-task preview --task ./tasks/release.cjs --out preview.json --json
monsqlize data-task apply --task ./tasks/release.cjs --approval preview.json --out result.json --json
```

Use the backup manifest path from `result.json` for preview-restore and restore. See [Data Tasks API Reference](./data-tasks.md#cli) for the complete commands.

## Common Mistakes

- Using `{}` as a filter: use a non-empty filter or explicit `all: true`.
- Choosing a mutable identity field: it creates drift and matching risk.
- Omitting the unique index for fields identity: preview cannot prove one-to-one matching.
- Treating the affected-scope package as a full backup.
- Putting functions or update expressions in `set`: only deterministic BSON literals are accepted.
- Using a temporary production backup directory.
- Rerunning after apply failure without checking status, manifest, and restore preview.

## Related Documents

- [Data Tasks API Reference](./data-tasks.md)
- [Production Rollout](./production-rollout.md)
- [Change Stream Sync](./sync-backup.md)
