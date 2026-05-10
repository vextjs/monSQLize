import { expectAssignable, expectType } from 'tsd';
import MonSQLize, {
    ChangeStreamSyncManager,
    ResumeTokenStore,
    validateSyncConfig,
    type SyncConfig,
    type SyncStats,
    type SyncTargetConfig,
} from 'monsqlize';

const target: SyncTargetConfig = {
    name: 'backup',
    uri: 'mongodb://backup:27017/app',
    collections: ['users'],
};

const config: SyncConfig = {
    enabled: true,
    targets: [target],
    collections: ['users'],
};

validateSyncConfig(config);
expectAssignable<SyncConfig>(config);

const store = new ResumeTokenStore({ storage: 'file', path: './.tmp/resume-token.json' });
expectType<Promise<unknown | null>>(store.load());

const manager = new ChangeStreamSyncManager({
    db: {} as unknown,
    config,
});
expectType<Promise<void>>(manager.start());
expectType<SyncStats>(manager.getStats());

const runtime = new MonSQLize({
    type: 'mongodb',
    databaseName: 'app',
    sync: config,
});
expectType<ChangeStreamSyncManager | null>(runtime.getSyncManager());
expectType<Promise<void>>(runtime.startSync());
expectType<Promise<void>>(runtime.stopSync());
expectType<SyncStats | null>(runtime.getSyncStats());

