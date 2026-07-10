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
    const { msq, server } = await setupExample('example-data-tasks');
    const sourceUsers = msq.collection('sourceUsers');
    const targetUsers = msq.collection('targetUsers');

    await sourceUsers.insertMany([
        { email: 'a@example.com', status: 'active', name: 'Alice' },
        { email: 'b@example.com', status: 'active', name: 'Bob' },
        { email: 'c@example.com', status: 'archived', name: 'Cara' },
    ]);

    const task: DataTaskDefinition = {
        name: 'sync-active-users',
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
            { type: 'verify', count: true, fields: ['schemaVersion'], indexes: true },
        ],
    };

    const plan = await msq.dataTasks.plan(task);
    const dryRun = await msq.dataTasks.dryRun(task);
    const run = await msq.dataTasks.run(task);
    const verify = await msq.dataTasks.verify(task);
    const targetRows = await targetUsers.find({ status: 'active' });

    console.log('plan risk:', plan.risk);
    console.log('dry-run results:', dryRun.results.length);
    console.log('snapshot file:', run.snapshot?.path);
    console.log('verify passed:', verify.passed);
    console.log('target users:', targetRows.map((row) => row.email).join(', '));

    await teardownExample(msq, server);
    await fs.rm(snapshotDir, { recursive: true, force: true });
    console.log('Data tasks example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
