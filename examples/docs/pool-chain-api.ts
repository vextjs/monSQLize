/**
 * Pool chain API example: pool().collection(), pool().use(), and pool-scoped models.
 * See: docs/pool-chain-api.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/pool-chain-api.js
 */
import MonSQLize from 'monsqlize';
import { setupReplicaSetExample, teardownExample } from '../helpers/bootstrap.js';

interface PoolChainEventDoc {
    kind: string;
    scope: string;
}

MonSQLize.Model.define<PoolChainEventDoc>('pool_chain_events_model', {
    schema: {},
    connection: {
        pool: 'analytics',
        database: 'reporting',
    },
});

async function main() {
    const base = await setupReplicaSetExample('example-pool-chain-base');
    const runtime = new MonSQLize({
        type: 'mongodb',
        databaseName: 'default_db',
        config: { uri: base.uri },
        pools: [
            { name: 'analytics', uri: base.uri, role: 'analytics', tags: ['reporting'] },
            { name: 'primary', uri: base.uri, role: 'primary' },
        ],
        poolStrategy: 'auto',
        maxPoolsCount: 5,
    });

    await base.msq.close();
    await runtime.connect();

    try {
        const defaultEvents = runtime.pool('analytics').collection<PoolChainEventDoc>('pool_chain_events');
        const reportingEvents = runtime.pool('analytics').use('reporting').collection<PoolChainEventDoc>('pool_chain_events');

        await defaultEvents.deleteMany({});
        await reportingEvents.deleteMany({});

        await defaultEvents.insertOne({ kind: 'page_view', scope: 'default_db' });
        await reportingEvents.insertOne({ kind: 'report_ready', scope: 'reporting' });

        const defaultRows = await defaultEvents.find({});
        const reportingRows = await reportingEvents.find({});

        const scoped = runtime.scopedCollection<PoolChainEventDoc>('pool_chain_scoped', {
            pool: 'analytics',
            database: 'reporting',
        });
        await scoped.deleteMany({});
        await scoped.insertOne({ kind: 'scoped_collection', scope: 'reporting' });

        const model = runtime.pool('analytics').use('reporting').model<PoolChainEventDoc>('pool_chain_events_model');
        await model.deleteMany({});
        await model.insertOne({ kind: 'model_insert', scope: 'reporting' });
        const modelRows = await model.find({});

        console.log('Default pool rows:', defaultRows.length);
        console.log('Reporting pool rows:', reportingRows.length);
        console.log('Scoped collection rows:', await scoped.count({}));
        console.log('Model pool:', model.poolName);
        console.log('Model database:', model.dbName);
        console.log('Model rows:', modelRows.length);
        console.log('Pool names:', runtime.getPoolNames().join(', '));
    } finally {
        MonSQLize.Model._clear();
        await runtime.close();
        await base.server.stop();
    }

    console.log('Pool chain API example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
