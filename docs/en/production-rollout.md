# Production Rollout: Data and Index Sync

Use this guide before moving a monSQLize service into production or before deploying a version that changes data shape, sync targets, Model index declarations, or collection indexes.

monSQLize provides the database runtime building blocks for this path:

- Change Stream sync for asynchronous CDC after writes reach MongoDB.
- Model index preflight through `ensureIndexes()` and `ensureModelIndexes()`.
- Collection index APIs such as `listIndexes()`, `createIndex()`, `createIndexes()`, and `dropIndex()`.
- Release data tasks through the `dataTasks` facade and `monsqlize data-task` for reviewed index sync, filtered data sync, transforms, affected-scope backup, and restore.

It does not replace MongoDB native import/export, a full backup/restore policy, or an exactly-once data pipeline. Treat dataTasks as bounded release tasks: explicit source and target, collection-level intent, preview approval, controlled apply, and optional reviewed restore.

## When to Use This Page

Use this page when you need any of these release steps:

| Release need | Use this path |
|--------------|---------------|
| Deploy a new service version with Model index changes | Run index dry-run, resolve conflicts, then create missing indexes in a controlled window |
| Backfill existing production data | Run a DataTaskJob with an explicit filter, identity policy, declared indexes, durable backup, and verification |
| Keep a backup database or projection in sync after rollout | Enable Change Stream sync with durable resume tokens and target idempotency |
| Move traffic between databases or pools | Verify data counts, sync health, indexes, read paths, and rollback points before switching |

## Production Release Sequence

1. Create a database backup or restore point.
2. Deploy code with `autoIndex: false` for production services.
3. Run the index dry-run against the target environment.
4. Resolve index conflicts before creating missing indexes.
5. If the release changes historical data, run `dataTasks.preview(job)` and review data/index counts, conflicts, samples, backup scope, and approval expiry.
6. Execute `dataTasks.apply(job, { approval })`; stale source, target, index, or job state requires a new preview.
7. Enable Change Stream sync only for ongoing CDC after prerequisites are ready.
8. Check counts, sample records, sync stats, slow queries, and error logs.
9. Switch traffic only after the release gates are green.

## Index Sync

For Model-declared indexes, disable automatic index creation in production and use explicit preflight.

Automatic indexing also preflights with `listIndexes()`, skips existing indexes, and creates only missing indexes. Production services should still prefer `autoIndex: false` because startup-time asynchronous index creation is not a release gate: you still need a deliberate dry-run, conflict review, duplicate-data checks for unique indexes, a maintenance window for heavy builds, and an operator-visible rollback plan.

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

`ensureModelIndexes()` and `ModelInstance.ensureIndexes()` compare declared indexes with existing database indexes. Dry-run mode only reports `existing`, `missing`, and `conflicts`. Execution mode creates missing indexes only. It does not drop, rename, or rebuild conflicting indexes.

For non-Model collections, use collection index APIs directly:

```javascript
const users = msq.collection('users');

const existing = await users.listIndexes();
console.log(existing.map(index => index.name));

await users.createIndexes([
  { key: { email: 1 }, unique: true, name: 'users_email_unique' },
  { key: { status: 1, createdAt: -1 }, name: 'users_status_createdAt' }
]);
```

Production index checklist:

- Run dry-run first when using Model indexes.
- Review unique index changes against existing duplicate data.
- Avoid creating heavy indexes during peak traffic.
- Record the current index list before destructive changes.
- Use `dropIndex()` only when rollback and query impact are understood.
- Recheck slow-query logs and `explain()` output after traffic moves.

## Data Migration Sync

Use a `DataTaskJob` for a specific release request: source instance A, target instance B, and collection objects that directly declare indexes and selected data. The target is always inspected with `listIndexes()` before any index decision.

```ts
import { dataTasks, type DataTaskJob } from 'monsqlize';

const job = {
  name: 'release-2026-07-settings',
  source: development,
  target: production,
  targetEnvironment: 'production',
  collections: [{
    name: 'settings',
    indexes: [{ key: { code: 1 }, name: 'settings_code_unique', options: { unique: true } }],
    data: {
      filter: { release: '2026-07' },
      identity: { mode: 'fields', fields: ['code'] },
      transform: { pipeline: [{ $set: { schemaVersion: 2 } }] },
      maxDocuments: 10_000
    },
    verify: { mode: 'full', fields: ['code', 'value', 'schemaVersion'] }
  }],
  backup: { dir: '/srv/monsqlize-data-tasks', compression: 'gzip', retentionDays: 14, maxBytes: 268435456 },
  lock: true
} satisfies DataTaskJob;

const preview = await dataTasks.preview(job);
if (!preview.passed || !preview.approval) throw new Error(preview.errors.join('; '));
const run = await dataTasks.apply(job, { approval: preview.approval });
```

Apply acquires the optional target-database lease before recalculating the approved plan, writes and reads back the affected-scope rollback package, creates declared missing indexes, and writes ordered checkpoint batches. Document CAS filters reject concurrent target changes instead of overwriting them. It stops on failure and does not automatically restore. If rollback is required, use `previewRestore(run.backup)` and then `restore()` with the independent restore approval. Restore first creates another safety package and applies the same no-overwrite rule.

CLI form:

```bash
monsqlize data-task preview --task ./tasks/release-settings.cjs --out preview.json --json
monsqlize data-task apply --task ./tasks/release-settings.cjs --approval preview.json --out run.json --json
monsqlize data-task preview-restore --task ./tasks/release-settings.cjs --backup <manifest.json> --out restore-preview.json --json
monsqlize data-task restore --task ./tasks/release-settings.cjs --backup <manifest.json> --approval restore-preview.json --json
```

Use `identity.mode: 'source-id'` only when both environments must retain exactly the same `_id`; add `conflictBy` to detect a matching business key with a different ID. For ordinary independent environments, use `fields` plus an exact unique index and let existing target documents keep their IDs.

The dataTasks backup is a release-scoped rollback package. Keep the database backup or managed restore point for full recovery, and use MongoDB native tools for full database copy or very large migrations.

The runtime identity needs read access to the selected source collections. On the target it needs `listIndexes`, declared-index creation, affected-document writes, and read/write/delete access to `_monsqlize_data_task_locks` when locking is enabled. The process must also be able to create, read, and atomically rename rollback-package files under `backup.dir`. Approval binds reviewed state; it does not replace these permission controls.

<details>
<summary>Advanced legacy DataTaskRunner rollout</summary>

Use dataTasks for release-scoped historical data changes. A task should be bounded by `filter`, match records by stable business keys, snapshot affected target documents before writes, and verify the result before traffic moves.

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
const dryRun = await msq.dataTasks.dryRun(task);

if (plan.passed && dryRun.passed) {
  const reviewedSnapshot = await msq.dataTasks.exportAffected(task);
  if (!reviewedSnapshot.checksum) throw new Error('snapshot checksum is missing');
  // Inspect reviewedSnapshot.path and reviewedSnapshot.manifestPath here.

  const run = await msq.dataTasks.run(task, {
    confirmProduction: true,
    approvedSnapshotChecksum: reviewedSnapshot.checksum
  });
  if (!run.passed) throw new Error(run.errors.join('; '));

  const verify = await msq.dataTasks.verify(task);
  if (!verify.passed) {
    throw new Error('data task verification failed');
  }
}
```

CLI form:

```bash
monsqlize data-task plan --task ./tasks/sync-active-users.cjs --json
monsqlize data-task dry-run --task ./tasks/sync-active-users.cjs
monsqlize data-task snapshot --task ./tasks/sync-active-users.cjs --json
monsqlize data-task run --task ./tasks/sync-active-users.cjs --confirm-production --snapshot-checksum <reviewed-sha256>
monsqlize data-task verify --task ./tasks/sync-active-users.cjs
```

Task recommendations:

- Use a stable `filter` and set `allowFullCollection: true` only after an explicit review.
- Use business `matchBy` fields for cross-endpoint sync. Source `_id` matching is blocked by default.
- Keep target writes idempotent; reruns should update or skip already synced documents.
- Review the snapshot path and checksum before continuing a production run.
- Treat the built-in task lock as process-local. Use a single job executor or an external distributed lock when multiple processes or nodes can start the task.
- A snapshot supports reviewed local recovery but is not automatic rollback; keep the database backup or managed restore point until the release window closes.
- Use MongoDB native tooling or an application-owned job for full database copy, backup, restore, or very large batch pipelines.

</details>

## Change Stream Sync After Backfill

Change Stream sync is for ongoing CDC, backup targets, projections, cache invalidation callbacks, and other asynchronous target updates. It is not a substitute for the first full historical backfill.

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

Operational boundaries:

- MongoDB must be a replica set for Change Streams.
- Sync is at-least-once, not exactly-once.
- Built-in MongoDB targets are idempotent for replacement/upsert style writes.
- Custom `apply` targets should deduplicate by change event `_id`.
- Monitor `getSyncStats().isRunning`, `errorCount`, `lastError`, target errors, and token save errors.
- If a token is lost, do not assume the historical gap is covered; run a repair or full comparison job.

## Traffic Switch Checklist

Before switching traffic:

- `npm run release:preflight` has passed for package release readiness.
- Target database has the expected collections and indexes.
- Model index dry-run reports no conflicts.
- Missing indexes have been created or intentionally deferred.
- Migration/backfill counts match the expected scope.
- Sync stats are healthy and no target is stopped.
- Slow-query logs do not show new index misses.
- Rollback path and backup restore point are documented.

After switching traffic:

- Watch sync stats and application error logs.
- Compare source and target counts for migrated collections.
- Sample critical records across old and new read paths.
- Run representative queries with `explain()` when latency changes.
- Keep the old rollback point until the release window closes.

## Related Documents

- [Data Tasks](./data-tasks.md)
- [Change Stream Sync](./sync-backup.md)
- [Distributed Deployment](./distributed-deployment.md)
- [Create indexes in bulk](./create-indexes.md)
- [List indexes](./list-indexes.md)
- [Drop an index](./drop-index.md)
- [Model Overview](./model.md)
- [Slow Query Logging](./slow-query-log.md)
