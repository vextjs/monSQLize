# Data Tasks

`msq.dataTasks` runs small, explicit rollout tasks for production index sync, filtered data sync, field transforms, affected-document snapshots, and verification.

It is not a schema migration framework and it does not keep an up/down migration ledger. Use MongoDB native import/export or an application-owned job for full database moves. Use data tasks when a release needs a reviewed, repeatable, bounded operation.

## Task Lifecycle

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

The same flow is available from the CLI:

```bash
monsqlize data-task plan --task ./tasks/sync-active-users.json --json
monsqlize data-task dry-run --task ./tasks/sync-active-users.cjs
monsqlize data-task run --task ./tasks/sync-active-users.cjs --confirm-production
monsqlize data-task verify --task ./tasks/sync-active-users.cjs
```

For `dry-run`, `run`, and `verify`, the task file should export `{ runtime, task }` so the CLI can create a `MonSQLize` instance. `plan` can run without a database connection when the task only needs static validation.

## Supported Steps

| Step | Purpose | Writes |
|------|---------|--------|
| `ensureIndexes` | Compare requested indexes with `listIndexes()` first, report conflicts, create only missing indexes | Index metadata only |
| `syncData` | Copy filtered source documents to the target with `insert`, `upsert`, `merge`, or `replace` | Target documents |
| `transformFields` | Apply an update operator, update pipeline, or transform function to filtered target documents | Target documents |
| `exportAffected` | Export affected target documents to JSONL / extended JSONL | Snapshot file only |
| `verify` | Check counts, required fields, and requested indexes | No |

## Safety Rules

- `filter` is required for `syncData`, `transformFields`, and `exportAffected` unless `allowFullCollection: true` is set.
- Cross-endpoint `syncData` requires stable business `matchBy` fields. Source `_id` matching is blocked unless `allowSourceIdMatch: true` is set on the step.
- Production tasks require `confirmProduction: true` before write steps run.
- Data write steps create an affected-document snapshot first. Set `snapshot: false` only with `allowRunWithoutSnapshot: true`.
- Index sync always reads `listIndexes()` before creating anything. Conflicts are reported; dataTasks does not drop, rename, or rebuild conflicting indexes.

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

Use `.cjs` when the task contains JavaScript functions, such as a `transformFields.transform` callback. Use `.json` for static plan-only checks or simple CLI tasks.

## Related Example

- [examples/docs/data-tasks.ts](https://github.com/vextjs/monSQLize/blob/main/examples/docs/data-tasks.ts)
- [Production Rollout](./production-rollout.md)
