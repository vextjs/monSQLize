import { expectAssignable, expectNotAssignable, expectType } from 'tsd';
import MonSQLize, {
    DataTaskRunner,
    DataTaskJobError,
    dataTasks,
    type DataTaskCliConfig,
    type DataTaskDefinition,
    type DataTaskDryRunResult,
    type DataTaskExecutionOptions,
    type DataTaskPlanResult,
    type DataTaskRunResult,
    type DataTaskJob,
    type DataTaskJobErrorCode,
    type DataTaskApplyResult,
    type DataTaskApproval,
    type DataTaskBackupRef,
    type DataTaskPreviewResult,
    type DataTaskRestorePreviewResult,
    type DataTaskRestoreResult,
    type DataTaskSnapshotResult,
    type DataTaskVerifyResult,
} from 'monsqlize';

const task: DataTaskDefinition = {
    name: 'release-users',
    environment: 'production',
    source: { collection: 'sourceUsers', database: 'development' },
    target: { collection: 'users', database: 'production' },
    filter: { status: 'active' },
    matchBy: ['email'],
    batchSize: 250,
    lock: { key: 'release-users', ttlMs: 30_000, renewIntervalMs: 10_000, scope: 'process' },
    steps: [
        { type: 'syncData', strategy: 'merge' },
        { type: 'verify', count: true, sample: 10, fields: ['email'] },
    ],
};
expectAssignable<DataTaskDefinition>(task);
expectNotAssignable<DataTaskDefinition>({ ...task, environment: 'prodution' });
expectAssignable<DataTaskCliConfig>({ task });
expectNotAssignable<DataTaskCliConfig>({
    runtime: { type: 'mongodb', databaseName: 'app', config: { uri: 'mongodb://localhost:27017' } },
});

const options: DataTaskExecutionOptions = {
    confirmProduction: true,
    approvedSnapshotChecksum: 'a'.repeat(64),
    continueOnError: false,
};
expectAssignable<DataTaskExecutionOptions>(options);
expectNotAssignable<DataTaskExecutionOptions>({ dryRun: true });

const runner = new DataTaskRunner({});
expectType<Promise<DataTaskPlanResult>>(runner.plan(task));
expectType<Promise<DataTaskDryRunResult>>(runner.dryRun(task));
expectType<Promise<DataTaskRunResult>>(runner.run(task, options));
expectType<Promise<DataTaskVerifyResult>>(runner.verify(task));
expectType<Promise<DataTaskSnapshotResult>>(runner.exportAffected(task));

const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'app', config: { uri: 'mongodb://localhost:27017' } });
expectType<Promise<DataTaskPlanResult>>(runtime.dataTasks.plan(task));
expectType<typeof DataTaskJobError>(MonSQLize.DataTaskJobError);
expectType<DataTaskJobErrorCode>(new DataTaskJobError('INVALID_JOB', 'invalid').code);

const job: DataTaskJob = {
    name: 'release-feature-modules',
    source: runtime,
    target: new MonSQLize({ type: 'mongodb', databaseName: 'production', config: { uri: 'mongodb://localhost:27018' } }),
    targetEnvironment: 'production',
    collections: [{
        name: 'feature_modules',
        indexes: [{ key: { code: 1 }, name: 'feature_modules_code_unique', options: { unique: true } }],
        data: {
            filter: { release: '2026-07' },
            identity: { mode: 'fields', fields: ['code'] },
            transform: { pipeline: [{ $set: { schemaVersion: 2 } }] },
        },
    }],
    backup: { dir: '.monsqlize/data-tasks', compression: 'gzip' },
};
expectType<Promise<DataTaskPreviewResult>>(dataTasks.preview(job));
expectType<Promise<DataTaskPreviewResult>>(MonSQLize.dataTasks.preview(job));
declare const approval: DataTaskApproval;
declare const backup: DataTaskBackupRef;
expectType<Promise<DataTaskApplyResult>>(dataTasks.apply(job, { approval }));
expectType<Promise<DataTaskRestorePreviewResult>>(dataTasks.previewRestore(backup, { target: job.target }));
expectType<Promise<DataTaskRestoreResult>>(dataTasks.restore(backup, { target: job.target, approval }));
expectNotAssignable<DataTaskJob>({ ...job, collections: [{ name: 'invalid', data: { all: true } }] });
expectAssignable<DataTaskJob>({
    ...job,
    collections: [{ name: 'seeds', data: { all: true, identity: { mode: 'source-id', conflictBy: ['code'] } } }],
});
