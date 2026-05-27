import { expectType } from 'tsd';
import MonSQLize, {
    SagaOrchestrator,
    type SagaDefinition,
    type SagaResult,
    type SagaStats,
} from 'monsqlize';

const definition: SagaDefinition = {
    name: 'create-order',
    steps: [
        {
            name: 'step-1',
            execute: async (ctx) => {
                ctx.set('ok', true);
                return 'done';
            },
            compensate: async () => { },
            retries: 1,
            timeout: 1000,
        },
    ],
};

const orchestrator = new SagaOrchestrator();
orchestrator.define(definition);
expectType<Promise<SagaDefinition>>(orchestrator.defineSaga(definition));
expectType<Promise<SagaResult>>(orchestrator.execute('create-order', { id: 1 }));
expectType<Promise<string[]>>(orchestrator.listSagas());
expectType<SagaStats>(orchestrator.getStats());

const cachedOrchestrator = new SagaOrchestrator({
    cache: {
        set() { },
        keys() { return []; },
        publish() { },
    },
});
expectType<SagaOrchestrator>(cachedOrchestrator);

const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'app' });
expectType<Promise<SagaDefinition>>(runtime.defineSaga(definition));
expectType<Promise<SagaResult>>(runtime.executeSaga('create-order', { id: 1 }));
expectType<SagaStats>(runtime.getSagaStats());
expectType<SagaOrchestrator>(runtime.saga());

