import { expectAssignable, expectNotAssignable, expectType } from 'tsd';
import MonSQLize, {
    DataTaskRunner,
    type DataTaskCliConfig,
    type DataTaskDefinition,
    type DataTaskDryRunResult,
    type DataTaskExecutionOptions,
    type DataTaskPlanResult,
    type DataTaskRunResult,
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
