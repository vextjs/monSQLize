const { after, before, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const MonSQLize = require(path.join(__dirname, '..', '..', '..', 'lib', 'index.js'));
const { createReplSetBootstrap } = require('../../bootstrap/replset-server');

describe('P5 runtime-core regression', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_p5_runtime_core' });
    const resumeTokenPath = path.join(os.tmpdir(), `monsqlize-runtime-core-${Date.now()}.json`);
    let uri;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        MonSQLize.Model._clear();
        await bootstrap.teardown();
        await fs.rm(resumeTokenPath, { force: true });
    });

    beforeEach(() => {
        MonSQLize.Model._clear();
    });

    it('应保持 connect/use/pool/model/sync/poolStats 组合路径稳定', async () => {
        MonSQLize.Model.define('events', {
            schema: {},
            connection: {
                pool: 'analytics',
                database: 'reporting',
            },
        });

        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'primary_app',
            config: { uri },
            pools: [
                { name: 'primary', uri, role: 'primary' },
                { name: 'analytics', uri, role: 'analytics', tags: ['reporting'] },
            ],
            poolStrategy: 'auto',
            sync: {
                enabled: true,
                collections: ['events'],
                resumeToken: {
                    storage: 'file',
                    path: resumeTokenPath,
                },
                targets: [
                    {
                        name: 'noop-target',
                        apply: async () => {},
                    },
                ],
            },
        });

        try {
            const accessors = await runtime.connect();
            assert.strictEqual(accessors.instance, runtime);
            assert.equal(typeof accessors.collection, 'function');
            assert.equal(typeof accessors.db, 'function');
            assert.equal(typeof accessors.use, 'function');

            await accessors.collection('users').deleteMany({});
            await accessors.collection('users').insertOne({ name: 'Ada' });
            const defaultUsers = await runtime.collection('users').find({});
            assert.equal(defaultUsers.length, 1);
            assert.equal(defaultUsers[0].name, 'Ada');

            const reportingUsers = runtime.use('tenant_reporting').collection('users');
            await reportingUsers.deleteMany({});
            await reportingUsers.insertOne({ name: 'Grace' });
            const tenantRows = await runtime.use('tenant_reporting').collection('users').find({});
            assert.equal(tenantRows.length, 1);
            assert.equal(tenantRows[0].name, 'Grace');

            const pooledEvents = runtime.pool('analytics').use('reporting').collection('events');
            await pooledEvents.deleteMany({});
            await pooledEvents.insertOne({ kind: 'report_ready' });
            const model = runtime.model('events');
            assert.equal(model.poolName, 'analytics');
            assert.equal(model.dbName, 'reporting');
            const rows = await model.find({});
            assert.equal(rows.length, 1);
            assert.equal(rows[0].kind, 'report_ready');

            const poolStats = runtime.getPoolStats();
            assert.equal(poolStats.length >= 2, true);
            assert.equal(poolStats.every((entry) => typeof entry.totalRequests === 'number'), true);

            const syncManager = runtime.getSyncManager();
            assert.notEqual(syncManager, null);
            assert.equal(runtime.getSyncStats()?.isRunning, true);
            await runtime.stopSync();
            assert.equal(runtime.getSyncStats()?.isRunning, false);
            await runtime.startSync();
            assert.equal(runtime.getSyncStats()?.isRunning, true);
        } finally {
            await runtime.close();
        }
    });

    it('应保持 admin facade 与 runtime 委托入口稳定', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'p5_runtime_admin_facade',
            config: { uri },
            pools: [
                { name: 'primary', uri, role: 'primary' },
                { name: 'analytics', uri, role: 'analytics' },
            ],
        });

        try {
            await runtime.connect();

            const adapter = runtime._adapter;
            assert.notEqual(adapter, null);
            assert.equal(typeof adapter.ping, 'function');
            assert.equal(await adapter.ping(), true);

            const pingResult = await runtime.runCommand({ ping: 1 });
            assert.equal(pingResult.ok, 1);

            const databases = await runtime.listDatabases({ nameOnly: true });
            assert.equal(Array.isArray(databases), true);

            const collections = await runtime.listCollections({}, {});
            assert.equal(Array.isArray(collections), true);
            assert.deepEqual(runtime.getPoolNames().sort(), ['analytics', 'primary']);
        } finally {
            await runtime.close();
        }
    });
});
