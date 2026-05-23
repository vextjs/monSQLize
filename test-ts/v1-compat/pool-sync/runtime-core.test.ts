import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import MonSQLize from 'monsqlize';

const { createReplSetBootstrap } = require(path.join(process.cwd(), 'test', 'bootstrap', 'replset-server'));

describe('Stage B runtime pool/sync glue TS migration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_stage_b_runtime_pool_sync' });
    const resumeTokenPath = path.join(os.tmpdir(), `monsqlize-stage-b-runtime-${Date.now()}.json`);
    let uri: string;

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
        await fs.rm(resumeTokenPath, { force: true });
    });

    it('应保持 connect/use/pool/model/sync/poolStats 组合路径稳定', async () => {
        const modelName = `stage_b_events_${Date.now()}`;

        MonSQLize.Model.define(modelName, {
            schema: () => ({}),
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
                collections: [modelName],
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
            const defaultUsers = await runtime.collection('users').find({}) as Array<{ name: string; }>;
            assert.equal(defaultUsers.length, 1);
            assert.equal(defaultUsers[0]?.name, 'Ada');

            const tenantUsers = runtime.use('tenant_reporting').collection('users');
            await tenantUsers.deleteMany({});
            await tenantUsers.insertOne({ name: 'Grace' });
            const tenantRows = await runtime.use('tenant_reporting').collection('users').find({}) as Array<{ name: string; }>;
            assert.equal(tenantRows.length, 1);
            assert.equal(tenantRows[0]?.name, 'Grace');

            const pooledEvents = runtime.pool('analytics').use('reporting').collection(modelName);
            await pooledEvents.deleteMany({});
            await pooledEvents.insertOne({ kind: 'report_ready' });

            const model = runtime.model(modelName);
            assert.equal(model.poolName, 'analytics');
            assert.equal(model.dbName, 'reporting');

            const rows = await model.find({}) as unknown as Array<{ kind: string; }>;
            assert.equal(rows.length, 1);
            assert.equal(rows[0]?.kind, 'report_ready');

            const poolStats = runtime.getPoolStats();
            const poolEntries = Object.values(poolStats);
            assert.equal(poolEntries.length >= 2, true);
            assert.equal(poolEntries.every((entry) => typeof entry.totalRequests === 'number'), true);

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
});