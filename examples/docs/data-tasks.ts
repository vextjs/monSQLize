/**
 * Data task rollout example.
 * See: docs/data-tasks.md and docs/production-rollout.md
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import MonSQLize, { dataTasks, type DataTaskJob } from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-example-'));
    let resources: Awaited<ReturnType<typeof setupExample>> | undefined;
    let target: MonSQLize | undefined;
    try {
        resources = await setupExample('example-data-tasks');
        const { msq, uri } = resources;
        target = new MonSQLize({ type: 'mongodb', databaseName: 'example-data-tasks-target', config: { uri } });
        await target.connect();
        const sourceUsers = msq.collection('sourceUsers');
        const targetUsers = target.collection('targetUsers');

        await sourceUsers.insertMany([
            { email: 'a@example.com', status: 'active', name: 'Alice' },
            { email: 'b@example.com', status: 'active', name: 'Bob' },
            { email: 'c@example.com', status: 'archived', name: 'Cara' },
        ]);

        const task: DataTaskJob = {
            name: 'sync-active-users',
            source: msq,
            target,
            targetEnvironment: 'production',
            collections: [{
                name: 'sourceUsers',
                targetName: 'targetUsers',
                indexes: [{ key: { email: 1 }, options: { unique: true }, name: 'target_users_email_unique' }],
                data: {
                    filter: { status: 'active' },
                    identity: { mode: 'fields', fields: ['email'] },
                    transform: { pipeline: [{ $set: { schemaVersion: 2 } }] },
                    maxDocuments: 10_000,
                },
                verify: { mode: 'full', fields: ['email', 'name', 'schemaVersion'] },
            }],
            backup: { dir: snapshotDir, maxBytes: 256 * 1024 * 1024 },
        };

        const plan = await dataTasks.preview(task);
        if (!plan.passed || !plan.approval) throw new Error(`Preview failed: ${plan.errors.join('; ')}`);
        const run = await dataTasks.apply(task, { approval: plan.approval });
        if (!run.passed) throw new Error(`Run failed: ${run.errors.join('; ')}`);
        const restorePreview = await dataTasks.previewRestore(run.backup);
        const targetRows = await targetUsers.find({ status: 'active' });

        console.log('planned collections:', plan.collections.length);
        console.log('backup manifest:', run.backup.manifestPath);
        console.log('restore preview passed:', restorePreview.passed);
        console.log('target users:', targetRows.map((row) => row.email).join(', '));

        console.log('Data tasks example complete');
    } finally {
        await target?.close();
        if (resources) await teardownExample(resources.msq, resources.server);
        await fs.rm(snapshotDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exitCode = 1;
});
