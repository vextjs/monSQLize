const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../bootstrap/memory-server');

describe('P4-C slow-query-log integration', () => {
    const bootstrap = createMemoryServerBootstrap({ dbName: 'monsqlize_p4c_slow' });
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('应支持在真实 Mongo 连接上记录并查询慢查询日志', async () => {
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

