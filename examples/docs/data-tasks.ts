/**
 * Data task rollout example.
 * See: docs/data-tasks.md and docs/production-rollout.md
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DataTaskDefinition } from 'monsqlize';
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-example-'));
    let resources: Awaited<ReturnType<typeof setupExample>> | undefined;
    try {
        resources = await setupExample('example-data-tasks');
        const { msq } = resources;
        const sourceUsers = msq.collection('sourceUsers');
        const targetUsers = msq.collection('targetUsers');

        await sourceUsers.insertMany([
            { email: 'a@example.com', status: 'active', name: 'Alice' },
            { email: 'b@example.com', status: 'active', name: 'Bob' },
            { email: 'c@example.com', status: 'archived', name: 'Cara' },
        ]);

        const task: DataTaskDefinition = {
            name: 'sync-active-users',
            environment: 'production',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            matchBy: ['email'],
            snapshot: { dir: snapshotDir },
            steps: [
                {
                    type: 'ensureIndexes',
                    indexes: [
                        { key: { email: 1 }, options: { unique: true }, name: 'target_users_email_unique' },
                    ],
                },
                { type: 'syncData', strategy: 'upsert' },
                { type: 'transformFields', update: { $set: { schemaVersion: 2 } } },
                { type: 'verify', count: true, fields: ['schemaVersion'], indexes: true, sample: 2 },
            ],
        };

        const plan = await msq.dataTasks.plan(task);
        if (!plan.passed) throw new Error(`Plan failed: ${plan.errors.join('; ')}`);
        const dryRun = await msq.dataTasks.dryRun(task);
        if (!dryRun.passed) throw new Error(`Dry-run failed: ${dryRun.errors.join('; ')}`);
        const reviewedSnapshot = await msq.dataTasks.exportAffected(task);
        if (!reviewedSnapshot.checksum) throw new Error('Snapshot checksum is missing.');
        const run = await msq.dataTasks.run(task, {
            confirmProduction: true,
            approvedSnapshotChecksum: reviewedSnapshot.checksum,
        });
        if (!run.passed) throw new Error(`Run failed: ${run.errors.join('; ')}`);
        const verify = await msq.dataTasks.verify(task);
        if (!verify.passed) throw new Error(`Verify failed: ${verify.errors.join('; ')}`);
        const targetRows = await targetUsers.find({ status: 'active' });

        console.log('plan risk:', plan.risk);
        console.log('dry-run results:', dryRun.results.length);
        console.log('reviewed snapshot:', reviewedSnapshot.path);
        console.log('run snapshot:', run.snapshot?.path);
        console.log('verify passed:', verify.passed);
        console.log('target users:', targetRows.map((row) => row.email).join(', '));

        console.log('Data tasks example complete');
    } finally {
        if (resources) await teardownExample(resources.msq, resources.server);
        await fs.rm(snapshotDir, { recursive: true, force: true });
    }
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exitCode = 1;
});
