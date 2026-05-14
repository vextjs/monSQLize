const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../bootstrap/memory-server');

describe('P2-C MongoDB management-core', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('应恢复 index 管理：create/list/drop', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2c_management_index',
            config: { uri },
        });

        await runtime.connect();
        const users = runtime.collection('users');

        const created = await users.createIndex({ email: 1 }, { unique: true, name: 'email_1' });
        const batchCreated = await users.createIndexes([
            { key: { createdAt: -1 }, name: 'createdAt_desc' },
        ]);
        const indexesAfterCreate = await users.listIndexes();
        const dropped = await users.dropIndex('createdAt_desc');
        const dropAll = await users.dropIndexes();
        const indexesAfterDropAll = await users.listIndexes();

        assert.deepEqual(created, { name: 'email_1' });
        assert.deepEqual(batchCreated, ['createdAt_desc']);
        assert.equal(indexesAfterCreate.some((item) => item.name === 'email_1'), true);
        assert.equal(indexesAfterCreate.some((item) => item.name === 'createdAt_desc'), true);
        assert.equal(dropped.ok, 1);
        assert.equal(dropped.nIndexesWas, 3);
        assert.ok(dropAll);
        assert.deepEqual(indexesAfterDropAll.map((item) => item.name), ['_id_']);

        await assert.rejects(
            () => users.dropIndex('_id_'),
            (error) => error && error.code === 'INVALID_ARGUMENT',
        );

        await runtime.close();
    });

    it('应恢复 bookmark 管理：prewarm/list/clear', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2c_management_bookmark',
            config: { uri },
        });

        await runtime.connect();
        const posts = runtime.collection('posts');

        await posts.insertMany([
            { title: 'A', status: 'published', createdAt: new Date('2026-05-01T00:00:00Z') },
            { title: 'B', status: 'published', createdAt: new Date('2026-05-02T00:00:00Z') },
            { title: 'C', status: 'published', createdAt: new Date('2026-05-03T00:00:00Z') },
        ]);

        const keyDims = {
            query: { status: 'published' },
            sort: { createdAt: 1 },
            limit: 1,
        };

        const prewarmed = await posts.prewarmBookmarks(keyDims, [1, 2]);
        const listed = await posts.listBookmarks(keyDims);
        const cleared = await posts.clearBookmarks(keyDims);
        const listedAfterClear = await posts.listBookmarks(keyDims);

        assert.equal(prewarmed.warmed, 2);
        assert.equal(prewarmed.failed, 0);
        assert.deepEqual(listed.pages, [1, 2]);
        assert.equal(listed.count, 2);
        assert.equal(cleared.cleared, 2);
        assert.equal(cleared.keysBefore, 2);
        assert.equal(listedAfterClear.count, 0);

        await assert.rejects(
            () => posts.prewarmBookmarks(keyDims, []),
            (error) => error && error.code === 'INVALID_PAGES',
        );

        await runtime.close();
    });

    it('应恢复 db.admin() 管理 façade', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2c_management_admin',
            config: { uri },
        });

        await runtime.connect();
        const admin = runtime.db().admin();

        const ping = await admin.ping();
        const buildInfo = await admin.buildInfo();
        const serverStatus = await admin.serverStatus();
        const stats = await admin.stats();

        assert.equal(ping, true);
        assert.equal(typeof buildInfo.version, 'string');
        assert.equal(typeof serverStatus.connections, 'object');
        assert.equal(stats.db, 'p2c_management_admin');

        await runtime.close();
    });
});

