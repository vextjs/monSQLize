# Production Rollout

This runbook orders code, indexes, one-time historical data, and ongoing synchronization for production. See [Production Data Migration](./production-data-migration.md) for Job scenarios and [Data Tasks API Reference](./data-tasks.md) for every parameter.

## Capability Boundaries

monSQLize provides:

- `ensureIndexes()`, `ensureModelIndexes()`, and collection index APIs.
- `dataTasks` for bounded one-time data and index releases.
- Change Stream sync for asynchronous CDC after the initial backfill.

It does not replace full database import/export, database-level recovery, or an exactly-once data pipeline. Establish a database restore point before the release.

## Release Sequence

1. Create a database backup or managed restore point.
2. Deploy the production service with `autoIndex: false`.
3. Dry-run Model indexes, resolve conflicts, then create missing indexes.
4. Run `dataTasks.preview(job)` when the release needs business data or non-Model indexes.
5. Review counts, samples, index states, backup estimates, and approval expiry.
6. Run `dataTasks.apply()` with the approval from that preview.
7. Validate production read paths; continue only for a passed result.
8. Start Change Stream sync only when ongoing updates are required.
9. Review sync status, slow queries, errors, and representative data.
10. Switch traffic after every gate is green.

## Index Rollout and autoIndex

`autoIndex: true` reads existing indexes after runtime connection, skips existing definitions, and creates missing indexes. It is not a production release gate. Startup cannot replace explicit dry-run, conflict review, unique-index duplicate checks, a maintenance window for heavy builds, or rollback decisions.

Keep automatic index creation disabled in a long-running production service:

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

`ensureModelIndexes()` and `ModelInstance.ensureIndexes()` compare declarations with `listIndexes()` results first. Execution creates only missing indexes and never drops, renames, or rebuilds conflicts automatically.

For non-Model collections, declare release indexes in dataTasks or use collection APIs directly:

```js
const users = msq.collection('users');
const existing = await users.listIndexes();

await users.createIndexes([
  { key: { email: 1 }, unique: true, name: 'users_email_unique' },
  { key: { status: 1, createdAt: -1 }, name: 'users_status_createdAt' }
]);
```

Index gates:

- Check production duplicates before creating a unique index.
- Schedule large index builds in a controlled maintenance window.
- Record current indexes and query impact before destructive index work.
- Recheck slow queries and representative `explain()` output after traffic moves.

## One-Time Data Migration

Use the same `DataTaskJob` for the complete one-time release:

```ts
const preview = await dataTasks.preview(job);
if (!preview.passed || !preview.approval) {
  throw new Error(preview.errors.join('; '));
}

const result = await dataTasks.apply(job, {
  approval: preview.approval
});
```

Operators should preserve the preview output, apply result, and `backup.manifestPath`. Any change to source, target, indexes, or Job requires a fresh preview and approval.

When apply returns partial or failed:

1. Stop traffic rollout and assume side effects may exist.
2. Preserve errors, manifest, and current target state.
3. Run `previewRestore()` to determine whether strict recovery is safe.
4. Review restore actions before `restore()`; never skip restore preview.

See [Production Data Migration](./production-data-migration.md) for complete scenarios.

## Change Stream After Backfill

Change Stream sync handles ongoing CDC, backup databases, projections, cache invalidation, and other asynchronous targets. It does not replace the initial historical backfill.

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

Operational boundaries:

- MongoDB must be a replica set.
- Delivery is at-least-once, not exactly-once.
- Custom targets should deduplicate by change event `_id`.
- Monitor `getSyncStats().isRunning`, `errorCount`, `lastError`, target errors, and token save errors.
- Repair or fully compare the gap when a resume token is lost.

## Traffic Switch Checklist

Before traffic moves:

- `npm run release:preflight` has passed.
- The database restore point and affected-scope backup are accessible.
- Model index dry-run has no conflicts; missing indexes are handled or explicitly deferred.
- dataTasks passed, and counts and samples match the requirement.
- Indexes required by production queries are ready.
- When CDC is needed, sync stats are healthy and resume tokens are durable.
- Slow-query and application logs contain no new blocker.
- Rollback owner, commands, manifest, and stop conditions are explicit.

After traffic moves:

- Compare source and target counts and samples for critical collections.
- Verify critical records through old and new read paths.
- Watch synchronization delay, errors, and slow queries.
- Use `explain()` on representative queries when latency changes.
- Preserve the old restore point and dataTasks manifest until the release window closes.

## Related Documents

- [Production Data Migration](./production-data-migration.md)
- [Data Tasks API Reference](./data-tasks.md)
- [Change Stream Sync](./sync-backup.md)
- [Create indexes in bulk](./create-indexes.md)
- [List indexes](./list-indexes.md)
- [Drop an index](./drop-index.md)
- [Slow Query Logging](./slow-query-log.md)
