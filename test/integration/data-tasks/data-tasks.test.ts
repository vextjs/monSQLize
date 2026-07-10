import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createMemoryServerBootstrap } from '../../bootstrap/memory-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

describe('dataTasks integration', () => {
    const bootstrap = createMemoryServerBootstrap();
    let uri = '';

    before(async () => {
        uri = (await bootstrap.setup()).uri;
    });

    after(async () => {
        await bootstrap.teardown();
    });

    it('runs a reviewed production snapshot in bounded batches and verifies the result', async () => {
        const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-integration-'));
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'data_tasks_batches', config: { uri } });
        try {
            await runtime.connect();
            const source = runtime.collection('sourceUsers');
            const target = runtime.collection('targetUsers');
            const sourceRows = Array.from({ length: 1201 }, (_, index) => ({
                email: `user-${String(index).padStart(4, '0')}@example.com`,
                status: 'active',
                profile: { name: `User ${index}` },
            }));
            await source.insertMany(sourceRows);
            await target.insertOne({
                email: 'user-0000@example.com',
                status: 'legacy',
                profile: { name: 'Old name', role: 'admin' },
                localOnly: true,
            });
            const existingId = (await target.findOne({ email: 'user-0000@example.com' }))._id;
            const task = {
                name: 'integration-production-sync',
                environment: 'production',
                source: { collection: 'sourceUsers' },
                target: { collection: 'targetUsers' },
                filter: { status: 'active' },
                matchBy: ['email'],
                batchSize: 500,
                snapshot: { dir: snapshotDir },
                lock: { ttlMs: 1000, renewIntervalMs: 200, scope: 'process' },
                steps: [
                    { type: 'syncData' as const, strategy: 'merge' as const },
                    { type: 'transformFields' as const, pipeline: [{ $set: { schemaVersion: 3 } }] },
                    { type: 'verify' as const, count: true, fields: ['schemaVersion'], sample: 5 },
                ],
            };

            const reviewed = await runtime.dataTasks.exportAffected(task, undefined, { snapshotDir });
            assert.equal(reviewed.count, 1201);
            assert.equal(reviewed.existingCount, 1);
            assert.equal(reviewed.insertCandidates, 1200);
            const firstSnapshotLine = JSON.parse((await fs.readFile(reviewed.path!, 'utf8')).split('\n')[0]);
            assert.equal(firstSnapshotLine.before.status, 'legacy');
            assert.equal(firstSnapshotLine.before.localOnly, true);

            const run = await runtime.dataTasks.run(task, {
                confirmProduction: true,
                approvedSnapshotChecksum: reviewed.checksum,
                snapshotDir,
            });
            assert.equal(run.passed, true, JSON.stringify(run, null, 2));
            const syncResult = run.results.find((result: { step?: string }) => result.step === 'syncData');
            assert.equal(syncResult.processed, 1201);
            assert.equal(syncResult.batchCount, 3);
            assert.equal(await target.count({ status: 'active' }), 1201);
            const merged = await target.findOne({ email: 'user-0000@example.com' });
            assert.equal(String(merged._id), String(existingId));
            assert.deepEqual(merged.profile, { name: 'User 0', role: 'admin' });
            assert.equal(merged.localOnly, true);
            assert.equal(merged.schemaVersion, 3);

            const verify = await runtime.dataTasks.verify(task);
            assert.equal(verify.passed, true, JSON.stringify(verify.mismatches));
            assert.equal(verify.mismatched, 0);
            assert.ok(verify.checked >= 1206);
        } finally {
            await runtime.close();
            await fs.rm(snapshotDir, { recursive: true, force: true });
        }
    });

    it('keeps upsert, merge, replace, and insert behavior distinct on MongoDB', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'data_tasks_strategies', config: { uri } });
        try {
            await runtime.connect();
            const source = runtime.collection('source');
            const target = runtime.collection('target');
            await source.insertOne({ email: 'ada@example.com', status: 'active', profile: { name: 'Ada' } });
            await target.insertOne({ email: 'ada@example.com', profile: { name: 'Old', role: 'admin' }, localOnly: true });
            const base = {
                name: 'integration-strategies',
                environment: 'test',
                source: { collection: 'source' },
                target: { collection: 'target' },
                filter: { status: 'active' },
                matchBy: ['email'],
            };

            const merge = await runtime.dataTasks.syncData({ ...base, steps: [{ type: 'syncData' as const, strategy: 'merge' as const }] });
            assert.equal(merge.passed, true);
            assert.deepEqual((await target.findOne({ email: 'ada@example.com' })).profile, { name: 'Ada', role: 'admin' });

            await source.updateOne({ email: 'ada@example.com' }, { $set: { profile: { name: 'Grace' } } });
            const upsert = await runtime.dataTasks.syncData({ ...base, steps: [{ type: 'syncData' as const, strategy: 'upsert' as const }] });
            assert.equal(upsert.passed, true);
            assert.deepEqual((await target.findOne({ email: 'ada@example.com' })).profile, { name: 'Grace' });
            assert.equal((await target.findOne({ email: 'ada@example.com' })).localOnly, true);

            const insert = await runtime.dataTasks.syncData({ ...base, steps: [{ type: 'syncData' as const, strategy: 'insert' as const }] });
            assert.equal(insert.skipped, 1);
            assert.equal(await target.count({ email: 'ada@example.com' }), 1);

            const replace = await runtime.dataTasks.syncData({ ...base, steps: [{ type: 'syncData' as const, strategy: 'replace' as const }] });
            assert.equal(replace.replaced, 1);
            assert.equal((await target.findOne({ email: 'ada@example.com' })).localOnly, undefined);
        } finally {
            await runtime.close();
        }
    });

    it('preserves compound index order and compares driver index options', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'data_tasks_indexes', config: { uri } });
        try {
            await runtime.connect();
            const target = runtime.collection('events');
            await target.createIndex({ accountId: 1, createdAt: -1 }, {
                name: 'account_created',
                unique: true,
                partialFilterExpression: { active: true },
            });
            const equivalent = await runtime.dataTasks.syncIndexes({
                name: 'integration-indexes',
                environment: 'test',
                target: { collection: 'events' },
                steps: [{
                    type: 'ensureIndexes',
                    indexes: [{
                        key: { accountId: 1, createdAt: -1 },
                        name: 'account_created',
                        options: { unique: true, partialFilterExpression: { active: true } },
                    }],
                }],
            }, undefined, { dryRun: true });
            assert.equal(equivalent.existing, 1);
            assert.equal(equivalent.conflicts, 0);

            const reversed = await runtime.dataTasks.syncIndexes({
                name: 'integration-indexes-reversed',
                environment: 'test',
                target: { collection: 'events' },
                steps: [{
                    type: 'ensureIndexes',
                    indexes: [{ key: { createdAt: -1, accountId: 1 }, name: 'account_created', options: { unique: true } }],
                }],
            }, undefined, { dryRun: true });
            assert.equal(reversed.passed, false);
            assert.equal(reversed.conflicts, 1);
        } finally {
            await runtime.close();
        }
    });

    it('returns a non-zero CLI exit code for a nested runtime step failure', async () => {
        const runtime = new MonSQLize({ type: 'mongodb', databaseName: 'data_tasks_cli', config: { uri } });
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-cli-integration-'));
        const taskFile = path.join(tempDir, 'task.cjs');
        try {
            await runtime.connect();
            await runtime.collection('users').insertOne({ status: 'active', value: 1 });
            const configSource = `module.exports = {
  runtime: ${JSON.stringify({ type: 'mongodb', databaseName: 'data_tasks_cli', config: { uri } })},
  task: {
    name: 'cli-nested-failure',
    environment: 'test',
    target: { collection: 'users' },
    filter: { status: 'active' },
    steps: [{ type: 'transformFields', transform: async () => { throw new Error('CLI nested failure'); } }]
  }
};\n`;
            await fs.writeFile(taskFile, configSource, 'utf8');
            const snapshotChild = spawnSync(process.execPath, [
                'dist/cjs/cli/data-task.cjs',
                'snapshot',
                '--task', taskFile,
                '--snapshot-dir', tempDir,
                '--json',
            ], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
            assert.equal(snapshotChild.status, 0, snapshotChild.stderr);
            const snapshot = JSON.parse(snapshotChild.stdout);
            assert.equal(snapshot.passed, true);
            assert.match(snapshot.checksum, /^[a-f0-9]{64}$/);
            assert.equal(snapshot.count, 1);

            const child = spawnSync(process.execPath, [
                'dist/cjs/cli/data-task.cjs',
                'run',
                '--task', taskFile,
                '--snapshot-dir', tempDir,
                '--json',
            ], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
            assert.equal(child.status, 1, child.stderr);
            const result = JSON.parse(child.stdout);
            assert.equal(result.passed, false);
            assert.equal(result.status, 'failed');
            assert.match(result.errors.join(' '), /CLI nested failure/);
            assert.equal((await runtime.collection('users').findOne({ status: 'active' })).value, 1);

            const human = spawnSync(process.execPath, [
                'dist/cjs/cli/data-task.cjs',
                'run',
                '--task', taskFile,
                '--snapshot-dir', tempDir,
            ], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
            assert.equal(human.status, 1, human.stderr);
            assert.match(human.stdout, /passed: false/);
            assert.match(human.stdout, /errors: 1/);
            assert.match(human.stdout, /results: 1/);
            assert.match(human.stdout, /nested failures:/);
            assert.match(human.stdout, /CLI nested failure/);
            assert.match(human.stdout, /snapshot: /);
            assert.match(human.stdout, /manifest: /);
            assert.match(human.stdout, /checksum: [a-f0-9]{64}/);
        } finally {
            await runtime.close();
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
});
