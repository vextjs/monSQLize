import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('P4-C slow-query-log integration', () => {
    const bootstrap = createMemoryServerBootstrap({ dbName: 'monsqlize_p4c_slow' });
    let uri = '';

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('records and queries slow query logs on a real Mongo connection', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'app_db',
            config: { uri },
            slowQueryLog: {
                enabled: true,
                storage: {
                    type: 'memory',
                },
                batch: {
                    enabled: false,
                    size: 1,
                    interval: 50,
                    maxBufferSize: 10,
                },
            },
        });

        try {
            await runtime.connect();
            await runtime.recordSlowQuery({
                database: 'app_db',
                collection: 'users',
                operation: 'find',
                durationMs: 750,
                query: { email: 'ada@example.com' },
            });
            await runtime.recordSlowQuery({
                database: 'app_db',
                collection: 'users',
                operation: 'find',
                durationMs: 1250,
                query: { email: 'ada@example.com' },
            });

            const logs = await runtime.getSlowQueryLogs({ collection: 'users' }, { limit: 10 });
            assert.equal(logs.length, 1);
            assert.equal(logs[0].count, 2);
            assert.equal(logs[0].totalTimeMs, 2000);
            assert.equal(logs[0].avgTimeMs, 1000);
        } finally {
            await runtime.close();
        }
    });
});