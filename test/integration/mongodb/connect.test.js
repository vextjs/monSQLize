const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MonSQLize = require('../../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../bootstrap/memory-server');

describe('P2-A MongoDB connect/common/accessor', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('connect() 应恢复真实 MongoDB 连接与 accessors', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2a_runtime',
            config: { uri },
        });

        const accessors = await runtime.connect();
        const collection = accessors.collection('users');
        const db = accessors.db();
        const scoped = accessors.use('analytics').collection('events');

        assert.equal((await runtime.health()).connected, true);
        assert.equal(accessors.instance, runtime);
        assert.deepEqual(collection.getNamespace(), {
            iid: 'p2a_runtime:users',
            type: 'mongodb',
            db: 'p2a_runtime',
            collection: 'users',
        });
        assert.equal(typeof db.collection, 'function');
        assert.deepEqual(scoped.getNamespace(), {
            iid: 'analytics:events',
            type: 'mongodb',
            db: 'analytics',
            collection: 'events',
        });

        await runtime.close();
        assert.equal((await runtime.health()).connected, false);
    });

    it('collection() 在 connect 前应阻止访问', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2a_guard',
            config: { uri },
        });

        await assert.rejects(
            () => Promise.resolve().then(() => runtime.collection('users')),
            (error) => error && error.code === 'NOT_CONNECTED',
        );
    });

    it('缺少 uri 时应给出 INVALID_CONFIG 错误', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2a_invalid_config',
            config: {},
        });

        await assert.rejects(
            () => runtime.connect(),
            (error) => error && error.code === 'INVALID_CONFIG',
        );
    });
});

