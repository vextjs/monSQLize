# Data Tasks

Use the named `dataTasks` export, or `MonSQLize.dataTasks`, when one release must copy selected documents and declared indexes from source instance A to target instance B. The normal path is deliberately two steps: `preview(job)` and then `apply(job, { approval })`.

This is release-scoped data synchronization, not schema migration, CDC, or a full-database backup tool. Use MongoDB Database Tools or a managed restore point for full database moves and disaster recovery.

## First Successful Job

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

SDK jobs may use two connected monSQLize instances. The caller owns those connections. CLI jobs use two independent `MonSQLizeOptions` objects; dataTasks opens and closes those connections.

## Parameter Reference

| Path | Required | Default | Meaning |
|------|:--------:|---------|---------|
| `name` | Yes | - | Stable release-task name used in approvals and manifests |
| `description` | No | None | Human-readable context; it does not change execution |
| `source` | Yes | - | Read-only source runtime or `MonSQLizeOptions` |
| `target` | Yes | - | Independent target runtime or `MonSQLizeOptions`; all database writes happen here |
| `targetEnvironment` | Yes | - | `development`, `test`, `staging`, `production`, `prod`, or `live`; production aliases enable durable-backup gates |
| `collections` | Yes | - | Non-empty collection task array; each target collection may appear once |
| `collections[].name` | Yes | - | Source collection |
| `collections[].targetName` | No | Same as `name` | Different target collection name |
| `collections[].indexes` | Conditional | `[]` | Exact index specifications to ensure; this array is the release index intent, not “copy all source indexes” |
| `indexes[].key` | Yes | - | Ordered MongoDB index key document |
| `indexes[].name` | No | MongoDB generated | Stable name; recommended for production review and recovery |
| `indexes[].options` | No | `{}` | Driver index options such as `unique`, `sparse`, TTL, partial filter, or collation |
| `collections[].data` | Conditional | Disabled | Source selection and target write rules; omit for index-only tasks |
| `data.filter` / `data.all` | One | - | A non-empty filter, or explicit `all: true`; an empty filter is rejected |
| `data.identity` | With data | - | How one source document maps to one target document |
| `data.strategy` | No | `upsert` | `upsert` updates/inserts; `insert` rejects an existing identity |
| `data.projection` | No | All fields | Source projection; it cannot remove identity fields |
| `data.transform` | No | None | Exactly one `pipeline` or `handler`, run before diff/write |
| `data.batchSize` | No | `500` | Ordered manifest-checkpoint batch, integer `1..10000`; not a bulk-write concurrency setting |
| `data.maxDocuments` | No | `10000` | Maximum selected source documents; preview rejects a larger result before loading it |
| `collections[].verify.mode` | No | `sample` | Field-content verification: `sample` or `full` |
| `verify.fields` | No | Planned fields | Fields compared after apply |
| `verify.sampleSize` | No | `20` | Stable sample size, integer `1..1000` |
| `backup.dir` | Production: yes | OS temp outside production | Durable affected-scope rollback package directory |
| `backup.format` | No | `extended-jsonl` | BSON-preserving data format |
| `backup.compression` | No | `gzip` | `gzip` or `none` |
| `backup.retentionDays` | No | `7` | Retention policy metadata; dataTasks does not silently delete packages |
| `backup.maxBytes` | No | `268435456` | Maximum uncompressed Extended JSONL rollback payload (256 MiB by default) |
| `lock` | No | `false` | `true` or `{ ttlMs, waitTimeoutMs }` enables a target-database lease |
| `lock.ttlMs` | No | `120000` | Lease duration; renewed automatically |
| `lock.waitTimeoutMs` | No | `0` | Wait before reporting another runner owns the lease |

Every collection needs non-empty `indexes`, `data`, or both.

## Identity, Transform, and Verify

`identity: { mode: 'fields', fields: ['code'] }` uses stable business fields. Existing target documents keep their `_id`; new target documents receive a target-generated `_id`. An exact, non-partial unique index for those fields must already exist or be declared in the same collection's `indexes` array.

Use source IDs only when both environments must share the exact same `_id`:

```ts
data: {
  filter: { release: '2026-07' },
  identity: { mode: 'source-id', conflictBy: ['code'] },
  strategy: 'upsert'
}
```

`source-id` inserts the original source `_id` and updates an existing document only when that `_id` already matches. `conflictBy` detects a logical duplicate whose business key matches but `_id` differs; preview blocks instead of deleting/reinserting or changing immutable `_id`.

The transform order is `filter -> projection -> identity capture -> transform -> diff`. A pipeline cannot use `$out` or `$merge`, change cardinality, or change identity. A handler runs twice during preview and must return the same document both times; time, randomness, or external mutable state invalidates approval.

Index definitions, write counts, identity uniqueness, source IDs, backup-data checksums, manifest structure, and applied operations are always verified. `verify.mode` only controls field-content comparison: `sample` checks a stable subset; `full` checks every changed document.

## Preview and Apply

`preview()` performs no database writes. For every target collection it calls `listIndexes()` first, classifies declared indexes as `existing`, `missing`, or `conflict`, counts the selected source documents against `data.maxDocuments`, evaluates transforms, compares target identities, computes the Extended JSONL rollback size against `backup.maxBytes`, and returns insert/update/unchanged counts plus samples. Approval binds the normalized job, transformed source, target preimages, target indexes, and an expiry time.

Use `preview(job, { sampleSize, approvalTtlMs })` to adjust output samples and approval lifetime. `sampleSize` accepts `0..100`; `approvalTtlMs` accepts `1000..86400000` and defaults to 15 minutes.

An approval is a state-bound guard against accidental execution, not an authentication or authorization credential. Process permissions, MongoDB credentials, and the release platform still control who can read the source, modify the target, and run a task.

For an existing ordinary ascending or descending unique index, preview checks only final keys affected by the plan and their target conflicts. A missing unique index requires a full target-image proof; dataTasks scans at most 10,000 target documents, then asks you to validate and create the index separately before previewing again. Unique partial, collation, multikey, or other special key types that cannot be proved exactly also block with `INDEX_CONFLICT`.

`apply()` reruns the same plan. Any job, source, target, or index drift makes the approval stale. A passing execution uses this order:

1. Acquire the optional target-database lease, then recalculate the plan and validate the reviewed approval while the lease is held.
2. Write the affected-scope rollback package and read it back to verify its checksum and entry count.
3. Re-read indexes and create only declared `missing` indexes.
4. Persist the current checkpoint batch as pending, execute its writes in order, then move the complete batch to applied.
5. Verify data, identity, indexes, and manifest records.
6. Mark the run passed and release the lease.

The operation is not a transaction across collections and indexes. Updates compare the complete reviewed before-image in the MongoDB write filter; planned inserts use insert-only semantics. If another writer changes or creates the target after preview, apply fails instead of overwriting that document. A failure stops later work, leaves the package and manifest as `failed` or `partial`, and never starts an automatic restore.

## Restore

Restore has its own preview and approval. It validates the backup checksum and compares every applied document and created index with the recorded post-run state. If a process stops after a database write but before the applied record is persisted, previewRestore compares the pending preimage and planned postimage with current target state to determine whether the write took effect. Ambiguous state or any later owner change blocks restore.

```ts
const restorePreview = await dataTasks.previewRestore(run.backup);
if (!restorePreview.passed || !restorePreview.approval) {
  throw new Error(restorePreview.errors.join('; '));
}

const restored = await dataTasks.restore(run.backup, {
  approval: restorePreview.approval
});
```

Before changing the target, restore writes another restore-safety package. Document replace/delete operations use an exact current-image filter, and restoring a previously deleted document is insert-only. A concurrent target change therefore blocks restore instead of being overwritten. Restore also removes only task-created indexes whose definitions still match, verifies the result, and records the safety package. That safety package can itself use `previewRestore/restore` if the restore must be reversed.

## CLI

The task module exports `job` and uses `MonSQLizeOptions` for `source` and `target`.

```bash
monsqlize data-task preview --task ./tasks/release.cjs --out preview.json --json
monsqlize data-task apply --task ./tasks/release.cjs --approval preview.json --out run.json --json
monsqlize data-task preview-restore --task ./tasks/release.cjs --backup ./.monsqlize/data-tasks/release/run/manifest.json --out restore-preview.json --json
monsqlize data-task restore --task ./tasks/release.cjs --backup ./.monsqlize/data-tasks/release/run/manifest.json --approval restore-preview.json --json
```

The CLI exits with status `1` for invalid configuration, stale approval, lock conflicts, failed/partial execution, checksum errors, or restore drift.

**Stable error codes**

When catching `DataTaskJobError`, inspect `code`, `phase`, and the optional `collection`. Public codes are `INVALID_JOB`, `IDENTITY_CONFLICT`, `INDEX_CONFLICT`, `APPROVAL_STALE`, `BACKUP_FAILED`, `LOCK_NOT_ACQUIRED`, `LOCK_LOST`, `APPLY_PARTIAL`, `RESTORE_DRIFT`, and `RESTORE_FAILED`. Branch on `code`; do not parse the message.

## Boundaries

- `backup` is an affected-scope rollback package, not a full database or point-in-time backup.
- dataTasks does not synchronize Model schema, keep migration directories or up/down ledgers, run CDC, or copy every source index.
- Use `mongodump` / `mongorestore`, Atlas, Cloud Manager, or Ops Manager for full backup and disaster recovery.
- Use Change Stream sync for ongoing changes after a reviewed historical backfill.

<details>
<summary>Advanced legacy DataTaskRunner API</summary>

The instance API `msq.dataTasks` retains the v3 candidate advanced runner for compatibility. It uses endpoint/step definitions and the `plan`, `dryRun`, `exportAffected`, `run`, and `verify` methods. New release jobs should use the facade above.

**Legacy task lifecycle**

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
// Inspect the snapshot and manifest before approving this checksum.

const run = await msq.dataTasks.run(task, {
  confirmProduction: true,
  approvedSnapshotChecksum: reviewedSnapshot.checksum
});
if (!run.passed) throw new Error(run.errors.join('; '));

const verification = await msq.dataTasks.verify(task);
if (!verification.passed) throw new Error(verification.errors.join('; '));
```

`dryRun()` previews writes but defers post-run `verify` steps. `run()` regenerates the affected snapshot while holding the optional task lock and rejects the production write when the current checksum differs from the reviewed checksum.

The same flow is available from the CLI:

```bash
monsqlize data-task plan --task ./tasks/sync-active-users.json --json
monsqlize data-task dry-run --task ./tasks/sync-active-users.cjs
monsqlize data-task snapshot --task ./tasks/sync-active-users.cjs --json
monsqlize data-task run --task ./tasks/sync-active-users.cjs --confirm-production --snapshot-checksum <reviewed-sha256>
monsqlize data-task verify --task ./tasks/sync-active-users.cjs
```

For `dry-run`, `snapshot`, `run`, and `verify`, the task file should export `{ runtime, task }` so the CLI can create a `MonSQLize` instance. `plan` can run without a database connection when the task only needs static validation. Review the snapshot file and manifest emitted by `snapshot` before passing its checksum to `run`.

**Supported legacy steps**

| Step | Purpose | Writes |
|------|---------|--------|
| `ensureIndexes` | Compare requested indexes with `listIndexes()` first, report conflicts, create only missing indexes | Index metadata only |
| `syncData` | Copy filtered source documents to the target with `insert`, `upsert`, `merge`, or `replace` | Target documents |
| `transformFields` | Apply an update operator, update pipeline, or transform function to filtered target documents | Target documents |
| `exportAffected` | Export affected target documents to JSONL / extended JSONL | Snapshot file only |
| `verify` | Check counts, required fields, and requested indexes | No |

**Legacy task configuration**

| Field | Required | Default and behavior |
|------|:--------:|----------------------|
| `name` | Yes | Audit label and snapshot filename prefix |
| `source` | For `syncData` and count/sample verification | `{ collection, database? / db?, pool? }` |
| `target` | Yes | Target endpoint with the same endpoint fields |
| `filter` | For data writes | Required unless `allowFullCollection: true` explicitly accepts a full-collection task |
| `allowFullCollection` | No | `false`; explicit opt-in for an unfiltered full-collection task |
| `projection` | No | Object projection or string array for source reads; snapshots always keep complete target preimages |
| `sort` | No | Defaults to `{ _id: 1 }` for stable iteration |
| `matchBy` | Cross-endpoint sync | Stable business fields such as `['tenantId', 'code']` |
| `batchSize` | No | `500`; controls source and callback-transform read batches |
| `snapshot` | No | Enabled by default; directory `.monsqlize/data-task-snapshots`, format `extended-jsonl` |
| `lock` | No | Disabled by default; process-scope lease when enabled |
| `environment` / `production` | For write tasks | `development`, `test`, `staging`, `production`, `prod`, or `live`; unknown names are rejected. Production aliases, `production: true`, or a production `NODE_ENV` enable production gates |
| `steps` | Yes | Non-empty ordered step list |

`snapshot` accepts `boolean`, a directory string, or `{ enabled, dir, format, allowRunWithoutSnapshot }`. Execution options can override the directory with `snapshotDir`. Production data writes cannot disable snapshots.

**Legacy step options**

| Step | Options and defaults |
|------|----------------------|
| `ensureIndexes` | `model` / `models` for Model declarations, or `indexes: [{ key, name?, options? }]`; `conflictPolicy` defaults to `report`, and `throw` rejects on a conflict |
| `syncData` | `strategy` defaults to `upsert`; step-level `matchBy` and `batchSize` override task values; `allowSourceIdMatch` defaults to `false` across endpoints |
| `transformFields` | Exactly one of `update`, `pipeline`, or `transform`; `sampleSize` defaults to `5` for dry-run previews |
| `exportAffected` | Optional step-level `snapshot` override |
| `verify` | `count`, `fields`, `indexes`, and non-negative `sample`; omitted checks are not executed |

**Legacy execution options**

| Option | Default | Purpose |
|--------|---------|---------|
| `confirmProduction` | `false` | First production write gate |
| `approvedSnapshotChecksum` | None | Second production data-write gate |
| `continueOnError` | `false` | Continue supported document/step processing while preserving a failed final result |
| `snapshotDir` | Task value or `.monsqlize/data-task-snapshots` | Override snapshot output directory |
| `allowRunWithoutSnapshot` | `false` | Non-production explicit bypass only |
| `onProgress` | None | Receive task, mode, step, processed, total, and batch progress |

**Legacy sync strategies**

| Strategy | Existing business key | Missing business key | Target-only fields |
|----------|-----------------------|----------------------|-------------------|
| `insert` | Skip | Insert | Existing document is unchanged |
| `upsert` | `$set` source fields | Upsert | Preserved unless overwritten by a source field |
| `merge` | Deep-merge target and source, then replace while preserving target `_id` | Insert | Preserved, including nested target-only fields |
| `replace` | Replace with the source document while preserving target `_id` | Insert | Removed |

`upsert` is the default. Use `replace` only when deleting target-only fields is intentional. A business key that matches multiple target documents is a failure, not an arbitrary first match. Duplicate business keys in the source block snapshot approval before writes.

`batchSize` bounds cursor reads; it is not a checkpoint or exactly-once guarantee. `syncData` and callback transforms write documents individually, while operator/pipeline transforms use MongoDB `updateMany()`. Design tasks to be idempotent and safe to rerun after inspecting partial results.

**Legacy safety rules**

- `filter` is required for `syncData`, `transformFields`, and `exportAffected` unless `allowFullCollection: true` is set.
- Cross-endpoint `syncData` requires stable business `matchBy` fields. Source `_id` matching is blocked unless `allowSourceIdMatch: true` is set on the step.
- Every write task must declare one of the supported environment names. Unknown values, including misspelled production names, fail planning. A production process cannot be downgraded by declaring a non-production task environment.
- Production data writes require both `confirmProduction: true` and `approvedSnapshotChecksum`. The CLI equivalents are `--confirm-production` and `--snapshot-checksum`.
- Data write steps create an affected-document snapshot first. Non-production tasks may disable it only with `allowRunWithoutSnapshot: true`; production data writes cannot disable it.
- Index sync always reads `listIndexes()` before creating anything. Conflicts are reported; dataTasks does not drop, rename, or rebuild conflicting indexes.

**Legacy snapshot review and local recovery**

For `syncData`, the snapshot follows the actual source `matchBy` values instead of applying the target filter blindly. Each JSONL record is an envelope:

```json
{"match":{"email":"a@example.com"},"before":{"_id":"...","email":"a@example.com","name":"Old name"}}
{"match":{"email":"new@example.com"},"before":null}
```

The manifest records `taskName`, `target`, `filter`, `format`, `count`, `existingCount`, `insertCandidates`, `bytes`, `createdAt`, and the SHA-256 `checksum`. Review both the data file and manifest. If the checksum changes before `run()`, stop and review the new affected set instead of approving it automatically.

Snapshots are preimage evidence, not an automatic rollback engine. For a localized recovery, stop the task and traffic first, verify that no later owner has changed the same records, then restore each non-null `before` document by its original `_id`; remove a `before: null` insert candidate only when it was created by this task and is still safe to delete. Run verification again afterward. Use `mongodump` / `mongorestore` or your managed backup service for full recovery.

**Legacy lock scope**

`lock: true` uses `data-task:<task.name>`. A string or `{ key }` selects an explicit key. The default TTL is 10 seconds; the runner renews the lease automatically, or you can set a positive `renewIntervalMs` smaller than `ttlMs`.

The built-in lock only coordinates tasks inside the current Node.js process (`scope: 'process'`). It does not coordinate separate CLI processes, containers, or application nodes. Run production tasks through a single job executor or provide an external distributed lock when multiple processes could start the same task.

**Legacy results, failures, and retry**

| Result | Important fields |
|--------|------------------|
| Plan | `passed`, `risk`, `willWrite`, required confirmations, per-step warnings/errors |
| Dry-run | `passed`, `results`, `warnings`, `errors`; verify results are marked deferred |
| Snapshot | `path`, `manifestPath`, counts, bytes, format, checksum |
| Run | `passed`, `status`, `snapshot`, per-step results, aggregated errors |
| Verify | `passed`, `checked`, `mismatched`, `checks`, `mismatches`, errors |

The default is fail-fast. `continueOnError: true` allows later documents or steps to be evaluated where supported, but the final result remains failed when any error occurred. Configuration, production approval, and lock acquisition errors reject the operation. Step and per-document failures propagate to top-level `run.errors`; the CLI prints nested failures and exits with status 1.

There is no built-in retry ledger or checkpoint. Before retrying, inspect `run.results`, the snapshot, and the target state. Fix duplicate business keys or transient infrastructure failures, keep the same bounded filter, run plan/dry-run/snapshot review again, and then rerun an idempotent task.

Common failures:

| Message or symptom | Recovery |
|--------------------|----------|
| Explicit environment is required | Set `environment` on every write task |
| `confirmProduction` or snapshot checksum is required | Complete the snapshot review and pass both production gates |
| Approved checksum does not match | The affected set changed; review the newly generated snapshot |
| Business key matches multiple targets | Repair the target uniqueness issue; do not use `continueOnError` to hide it |
| Lock ownership was lost | Confirm no competing writer ran, increase TTL if appropriate, and restart from plan |
| CLI exits 1 | Read stderr plus top-level and nested failures; do not treat JSON output alone as success |

**Legacy CLI task file**

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

Use `.cjs` when the task contains JavaScript functions, such as a `transformFields.transform` callback. Use `.json` for static plan-only checks or simple CLI tasks.

</details>

## Related Example

- [examples/docs/data-tasks.ts](https://github.com/vextjs/monSQLize/blob/main/examples/docs/data-tasks.ts)
- [Production Rollout](./production-rollout.md)
