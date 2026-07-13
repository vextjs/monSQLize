import { expectAssignable, expectNotAssignable, expectType } from 'tsd';
import MonSQLize, {
    DataTaskJobError,
    dataTasks,
    type DataTaskJob,
    type DataTaskJobErrorCode,
    type DataTaskApplyResult,
    type DataTaskApproval,
    type DataTaskBackupRef,
    type DataTaskPreviewResult,
    type DataTaskRestorePreviewResult,
    type DataTaskRestoreResult,
} from 'monsqlize';

const source = new MonSQLize({ type: 'mongodb', databaseName: 'development', config: { uri: 'mongodb://localhost:27017' } });
const target = new MonSQLize({ type: 'mongodb', databaseName: 'production', config: { uri: 'mongodb://localhost:27018' } });
const job: DataTaskJob = {
    name: 'release-feature-modules',
    source,
    target,
    targetEnvironment: 'production',
    collections: [{
        name: 'feature_modules',
        indexes: [
            { key: { code: 1 }, options: { unique: true } },
            { key: { release: 1, enabled: 1 } },
        ],
        data: {
            filter: { release: '2026-07' },
            projection: { _id: 1, code: 1, legacyName: 1, developmentOnly: 1 },
            identity: { mode: 'fields', fields: ['code'] },
            rename: { legacyName: 'name' },
            set: { schemaVersion: 2 },
            unset: ['developmentOnly'],
        },
    }],
    backup: { dir: '.monsqlize/data-tasks', compression: 'gzip' },
};

expectAssignable<DataTaskJob>(job);
expectType<Promise<DataTaskPreviewResult>>(dataTasks.preview(job));
declare const approval: DataTaskApproval;
declare const backup: DataTaskBackupRef;
expectType<Promise<DataTaskApplyResult>>(dataTasks.apply(job, { approval }));
expectType<Promise<DataTaskRestorePreviewResult>>(dataTasks.previewRestore(backup, { target }));
expectType<Promise<DataTaskRestoreResult>>(dataTasks.restore(backup, { target, approval }));
expectType<typeof DataTaskJobError>(MonSQLize.DataTaskJobError);
expectType<DataTaskJobErrorCode>(new DataTaskJobError('INVALID_JOB', 'invalid').code);

expectNotAssignable<DataTaskJob>({ ...job, collections: [{ name: 'invalid', data: { all: true } }] });
expectAssignable<DataTaskJob>({
    ...job,
    collections: [{ name: 'seeds', data: { all: true, identity: { mode: 'source-id', conflictBy: ['code'] } } }],
});
