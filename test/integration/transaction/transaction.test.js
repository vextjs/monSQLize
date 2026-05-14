const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createReplSetBootstrap } = require('../../bootstrap/replset-server');

describe('P4-A transaction integration', () => {
    const bootstrap = createReplSetBootstrap();
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p4a_tx',
            config: { uri },
        });
        await runtime.connect();
        await runtime.collection('accounts').deleteMany({});
        await runtime.close();
    });

    it('应支持 withTransaction 提交与回滚', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p4a_tx',
            config: { uri },
            cache: new MonSQLize.MemoryCache(),
        });
        await runtime.connect();

        await runtime.collection('accounts').insertMany([
            { _id: 'A', balance: 1000 },
            { _id: 'B', balance: 500 },
        ]);

        const committed = await runtime.withTransaction(async (tx) => {
            await runtime.collection('accounts').updateOne(
                { _id: 'A' },
                { $inc: { balance: -100 } },
                { session: tx.session },
            );
            await runtime.collection('accounts').updateOne(
                { _id: 'B' },
                { $inc: { balance: 100 } },
                { session: tx.session },
            );
            return tx.getInfo().status;
        });

        assert.equal(committed, 'active');
        assert.equal((await runtime.collection('accounts').findOne({ _id: 'A' })).balance, 900);
        assert.equal((await runtime.collection('accounts').findOne({ _id: 'B' })).balance, 600);

        await assert.rejects(
            () => runtime.withTransaction(async (tx) => {
                await runtime.collection('accounts').updateOne(
                    { _id: 'A' },
                    { $inc: { balance: -200 } },
                    { session: tx.session },
                );
                throw new Error('rollback');
            }),
            /rollback/,
        );

        assert.equal((await runtime.collection('accounts').findOne({ _id: 'A' })).balance, 900);
        await runtime.close();
    });
});

