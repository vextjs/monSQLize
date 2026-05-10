const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const MonSQLize = require('../../../lib/index.js');
const { createReplSetBootstrap } = require('../../bootstrap/replset-server');

describe('P4-C sync integration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_p4c_sync' });
    let uri;
    const resumeTokenPath = path.join(os.tmpdir(), `monsqlize-sync-${Date.now()}.json`);

    before(async () => {
        const context = await bootstrap.setup();
        uri = context.uri;
    });

    after(async () => {
        await bootstrap.teardown();
        await fs.rm(resumeTokenPath, { force: true });
    });

    it('应在真实 replica set 上自动启动并停止 sync manager', async () => {
        const runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'primary_app',
            config: { uri },
            sync: {
                enabled: true,
                collections: ['users'],
                resumeToken: {
                    storage: 'file',
                    path: resumeTokenPath,
                },
                targets: [
                    {
                        name: 'audit-target',
                        apply: async () => {},
                    },
                ],
            },
        });

        try {
            await runtime.connect();
            const manager = runtime.getSyncManager();
            assert.notEqual(manager, null);

            const startedStats = runtime.getSyncStats();
            assert.notEqual(startedStats, null);
            assert.equal(startedStats.isRunning, true);

            await runtime.stopSync();
            const stoppedStats = runtime.getSyncStats();
            assert.notEqual(stoppedStats, null);
            assert.equal(stoppedStats.isRunning, false);

            await runtime.startSync();
            const restartedStats = runtime.getSyncStats();
            assert.notEqual(restartedStats, null);
            assert.equal(restartedStats.isRunning, true);
        } finally {
            await runtime.close();
        }
    });
});

