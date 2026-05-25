import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('P4-B pool integration', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';

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

    it('supports pool() collection/use/model routing to the selected pool semantics', async () => {
        MonSQLize.Model.define('events', {
            schema: {},
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

        // Cover createPoolScope.model() direct (FN:144, no .use() wrapper)
        const modelDirect = runtime.pool('analytics').model('events');
        assert.ok(modelDirect !== null);
        assert.ok(typeof modelDirect.find === 'function');

        await runtime.close();
    });
});