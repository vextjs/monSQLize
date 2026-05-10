const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../bootstrap/memory-server');

describe('P4-B pool integration', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        MonSQLize.Model._clear();
        await bootstrap.teardown();
    });

    beforeEach(() => {
        MonSQLize.Model._clear();
    });

    it('应支持 pool() collection/use/model 路由到指定连接池语义', async () => {
        MonSQLize.Model.define('events', {
            connection: {
                pool: 'analytics',
                database: 'reporting',
            },
        });

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'default_db',
            config: { uri },
            pools: [
                { name: 'analytics', uri, role: 'analytics', tags: ['reporting'] },
                { name: 'primary', uri, role: 'primary' },
            ],
            poolStrategy: 'auto',
            maxPoolsCount: 5,
        });

        await runtime.connect();

        await runtime.pool('analytics').use('reporting').collection('events').deleteMany({});
        await runtime.pool('analytics').collection('events').insertOne({ kind: 'page_view', scope: 'default_db' });
        await runtime.pool('analytics').use('reporting').collection('events').insertOne({ kind: 'report_ready' });

        const defaultEvents = await runtime.pool('analytics').collection('events').find({});
        const reportingEvents = await runtime.pool('analytics').use('reporting').collection('events').find({});
        assert.equal(defaultEvents.length, 1);
        assert.equal(reportingEvents.length, 1);
        assert.equal(reportingEvents[0].kind, 'report_ready');

        const model = runtime.pool('analytics').use('reporting').model('events');
        assert.equal(model.poolName, 'analytics');
        assert.equal(model.dbName, 'reporting');
        await model.insertOne({ kind: 'from_model' });
        const rows = await model.find({});
        assert.equal(rows.length >= 2, true);

        await runtime.close();
    });
});

