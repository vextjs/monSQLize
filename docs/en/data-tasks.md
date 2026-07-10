# Data Tasks

`msq.dataTasks` runs small, explicit rollout tasks for production index sync, filtered data sync, field transforms, affected-document snapshots, and verification.

It is not a schema migration framework and it does not keep an up/down migration ledger. Use MongoDB native import/export or an application-owned job for full database moves. Use data tasks when a release needs a reviewed, repeatable, bounded operation.

## Task Lifecycle

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

## Supported Steps

| Step | Purpose | Writes |
|------|---------|--------|
| `ensureIndexes` | Compare requested indexes with `listIndexes()` first, report conflicts, create only missing indexes | Index metadata only |
| `syncData` | Copy filtered source documents to the target with `insert`, `upsert`, `merge`, or `replace` | Target documents |
| `transformFields` | Apply an update operator, update pipeline, or transform function to filtered target documents | Target documents |
| `exportAffected` | Export affected target documents to JSONL / extended JSONL | Snapshot file only |
| `verify` | Check counts, required fields, and requested indexes | No |

## Task Configuration

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

### Step options

| Step | Options and defaults |
|------|----------------------|
| `ensureIndexes` | `model` / `models` for Model declarations, or `indexes: [{ key, name?, options? }]`; `conflictPolicy` defaults to `report`, and `throw` rejects on a conflict |
| `syncData` | `strategy` defaults to `upsert`; step-level `matchBy` and `batchSize` override task values; `allowSourceIdMatch` defaults to `false` across endpoints |
| `transformFields` | Exactly one of `update`, `pipeline`, or `transform`; `sampleSize` defaults to `5` for dry-run previews |
| `exportAffected` | Optional step-level `snapshot` override |
| `verify` | `count`, `fields`, `indexes`, and non-negative `sample`; omitted checks are not executed |

### Execution options

| Option | Default | Purpose |
|--------|---------|---------|
| `confirmProduction` | `false` | First production write gate |
| `approvedSnapshotChecksum` | None | Second production data-write gate |
| `continueOnError` | `false` | Continue supported document/step processing while preserving a failed final result |
| `snapshotDir` | Task value or `.monsqlize/data-task-snapshots` | Override snapshot output directory |
| `allowRunWithoutSnapshot` | `false` | Non-production explicit bypass only |
| `onProgress` | None | Receive task, mode, step, processed, total, and batch progress |

## Sync Strategies

| Strategy | Existing business key | Missing business key | Target-only fields |
|----------|-----------------------|----------------------|-------------------|
| `insert` | Skip | Insert | Existing document is unchanged |
| `upsert` | `$set` source fields | Upsert | Preserved unless overwritten by a source field |
| `merge` | Deep-merge target and source, then replace while preserving target `_id` | Insert | Preserved, including nested target-only fields |
| `replace` | Replace with the source document while preserving target `_id` | Insert | Removed |

`upsert` is the default. Use `replace` only when deleting target-only fields is intentional. A business key that matches multiple target documents is a failure, not an arbitrary first match. Duplicate business keys in the source block snapshot approval before writes.

`batchSize` bounds cursor reads; it is not a checkpoint or exactly-once guarantee. `syncData` and callback transforms write documents individually, while operator/pipeline transforms use MongoDB `updateMany()`. Design tasks to be idempotent and safe to rerun after inspecting partial results.

## Safety Rules

- `filter` is required for `syncData`, `transformFields`, and `exportAffected` unless `allowFullCollection: true` is set.
- Cross-endpoint `syncData` requires stable business `matchBy` fields. Source `_id` matching is blocked unless `allowSourceIdMatch: true` is set on the step.
- Every write task must declare one of the supported environment names. Unknown values, including misspelled production names, fail planning. A production process cannot be downgraded by declaring a non-production task environment.
- Production data writes require both `confirmProduction: true` and `approvedSnapshotChecksum`. The CLI equivalents are `--confirm-production` and `--snapshot-checksum`.
- Data write steps create an affected-document snapshot first. Non-production tasks may disable it only with `allowRunWithoutSnapshot: true`; production data writes cannot disable it.
- Index sync always reads `listIndexes()` before creating anything. Conflicts are reported; dataTasks does not drop, rename, or rebuild conflicting indexes.

## Snapshot Review and Local Recovery

For `syncData`, the snapshot follows the actual source `matchBy` values instead of applying the target filter blindly. Each JSONL record is an envelope:

```json
{"match":{"email":"a@example.com"},"before":{"_id":"...","email":"a@example.com","name":"Old name"}}
{"match":{"email":"new@example.com"},"before":null}
```

The manifest records `taskName`, `target`, `filter`, `format`, `count`, `existingCount`, `insertCandidates`, `bytes`, `createdAt`, and the SHA-256 `checksum`. Review both the data file and manifest. If the checksum changes before `run()`, stop and review the new affected set instead of approving it automatically.

Snapshots are preimage evidence, not an automatic rollback engine. For a localized recovery, stop the task and traffic first, verify that no later owner has changed the same records, then restore each non-null `before` document by its original `_id`; remove a `before: null` insert candidate only when it was created by this task and is still safe to delete. Run verification again afterward. Use `mongodump` / `mongorestore` or your managed backup service for full recovery.

## Lock Scope

`lock: true` uses `data-task:<task.name>`. A string or `{ key }` selects an explicit key. The default TTL is 10 seconds; the runner renews the lease automatically, or you can set a positive `renewIntervalMs` smaller than `ttlMs`.

The built-in lock only coordinates tasks inside the current Node.js process (`scope: 'process'`). It does not coordinate separate CLI processes, containers, or application nodes. Run production tasks through a single job executor or provide an external distributed lock when multiple processes could start the same task.

## Results, Failures, and Retry

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

## CLI Task File

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

## Related Example

- [examples/docs/data-tasks.ts](https://github.com/vextjs/monSQLize/blob/main/examples/docs/data-tasks.ts)
- [Production Rollout](./production-rollout.md)
