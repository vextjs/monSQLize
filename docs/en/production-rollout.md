# Production Rollout: Data and Index Sync

Use this guide before moving a monSQLize service into production or before deploying a version that changes data shape, sync targets, Model index declarations, or collection indexes.

monSQLize provides the database runtime building blocks for this path:

- Change Stream sync for asynchronous CDC after writes reach MongoDB.
- Model index preflight through `ensureIndexes()` and `ensureModelIndexes()`.
- Collection index APIs such as `listIndexes()`, `createIndex()`, `createIndexes()`, and `dropIndex()`.
- Batching helpers such as `insertBatch()`, `updateBatch()`, and `deleteBatch()` when your own migration job needs controlled write batches.

It does not replace your application migration runner, backup policy, or exactly-once data pipeline. Treat data migration scripts as application-owned jobs and keep them idempotent.

## When to Use This Page

Use this page when you need any of these release steps:

| Release need | Use this path |
|--------------|---------------|
| Deploy a new service version with Model index changes | Run index dry-run, resolve conflicts, then create missing indexes in a controlled window |
| Backfill existing production data | Run an application migration/backfill job with idempotent batches |
| Keep a backup database or projection in sync after rollout | Enable Change Stream sync with durable resume tokens and target idempotency |
| Move traffic between databases or pools | Verify data counts, sync health, indexes, read paths, and rollback points before switching |

## Production Release Sequence

1. Create a database backup or restore point.
2. Deploy code with `autoIndex: false` for production services.
3. Run the index dry-run against the target environment.
4. Resolve index conflicts before creating missing indexes.
5. Run data backfill or migration jobs if the release needs historical data changes.
6. Enable Change Stream sync only for ongoing CDC after prerequisites are ready.
7. Check counts, sample records, sync stats, slow queries, and error logs.
8. Switch traffic only after the release gates are green.

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

Use an application migration job for historical data changes. The job should be idempotent, resumable, and safe to rerun.

```javascript
const users = msq.collection('users');

let processed = 0;
const batchSize = 1000;

while (true) {
  const rows = await users.find(
    { migratedAt: { $exists: false } },
    {
      limit: batchSize,
      sort: { _id: 1 },
      projection: { _id: 1 }
    }
  );

  if (rows.length === 0) {
    break;
  }

  for (const row of rows) {
    await users.updateOne(
      { _id: row._id, migratedAt: { $exists: false } },
      {
        $set: {
          migratedAt: new Date(),
          schemaVersion: 2
        }
      }
    );
  }

  processed += rows.length;
  console.log({ processed });
}
```

Backfill recommendations:

- Use a stable filter and idempotent marker such as `schemaVersion` or `migratedAt`.
- Keep batch size small enough for your write latency and replication lag.
- Prefer ordered checkpoints over unbounded scans for large collections.
- Keep writes compatible with retry; a rerun should skip already migrated documents.
- Verify counts and representative records before switching read paths.

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

- [Change Stream Sync](./sync-backup.md)
- [Distributed Deployment](./distributed-deployment.md)
- [Create indexes in bulk](./create-indexes.md)
- [List indexes](./list-indexes.md)
- [Drop an index](./drop-index.md)
- [Model Overview](./model.md)
- [Slow Query Logging](./slow-query-log.md)
