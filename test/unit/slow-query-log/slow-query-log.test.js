const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');

describe('P4-C slow-query-log', () => {
    it('应支持 BatchQueue 与内存存储聚合闭环', async () => {
        const manager = new MonSQLize.SlowQueryLogManager({
            enabled: true,
            storage: { type: 'memory' },
            batch: {
                enabled: true,
                size: 2,
                interval: 50,
                maxBufferSize: 10,
            },
        });

        await manager.save({
            database: 'app',
            collection: 'users',
            operation: 'find',
            durationMs: 600,
            query: { status: 'active' },
        });
        await manager.save({
            database: 'app',
            collection: 'users',
            operation: 'find',
            durationMs: 800,
            query: { status: 'active' },
        });
        await manager.close();

        const records = await manager.query({ collection: 'users' }, { limit: 10 });
        assert.equal(records.length, 1);
        assert.equal(records[0].count, 2);
        assert.equal(records[0].totalTimeMs, 1400);
        assert.equal(records[0].avgTimeMs, 700);
        assert.equal(records[0].maxTimeMs, 800);
        assert.equal(records[0].minTimeMs, 600);
    });

    it('应支持 runtime facade 的 recordSlowQuery / getSlowQueryLogs', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'slow_query_memory',
            slowQueryLog: {
                enabled: true,
                storage: { type: 'memory' },
                batch: { enabled: false, size: 1, interval: 50, maxBufferSize: 10 },
            },
        });

        runtime.connect = () => Promise.resolve({
            collection: runtime.collection.bind(runtime),
            db: runtime.db.bind(runtime),
            use: runtime.use.bind(runtime),
            instance: runtime,
        });
        runtime._connected = true;
        runtime._client = {
            close() {
                return Promise.resolve(true);
            },
        };

        await runtime.recordSlowQuery({
            database: 'slow_query_memory',
            collection: 'orders',
            operation: 'aggregate',
            durationMs: 1200,
            query: [{ $match: { status: 'pending' } }],
        });

        const logs = await runtime.getSlowQueryLogs({ collection: 'orders' });
        assert.equal(logs.length, 1);
        assert.equal(logs[0].operation, 'aggregate');
        assert.equal(typeof logs[0].queryHash, 'string');

        await runtime.close();
    });
});


