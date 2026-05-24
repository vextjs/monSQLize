import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function hasErrorCode(error: unknown, code: string): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

describe('P2-A MongoDB connect/common/accessor', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('connect() restores real MongoDB connection and accessors', async () => {
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

    it('collection() blocks access before connect', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2a_guard',
            config: { uri },
        });

        await assert.rejects(
            () => Promise.resolve().then(() => runtime.collection('users')),
            (error: unknown) => hasErrorCode(error, 'NOT_CONNECTED'),
        );
    });

    it('returns INVALID_CONFIG when uri is missing', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p2a_invalid_config',
            config: {},
        });

        await assert.rejects(
            () => runtime.connect(),
            (error: unknown) => hasErrorCode(error, 'INVALID_CONFIG'),
        );
    });
});