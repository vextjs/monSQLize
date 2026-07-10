import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { ObjectId } from 'mongodb';
import { DataTaskRunner } from '../../../src/capabilities/data-tasks/runner';
import type { DataTaskDefinition, DataTaskExecutionOptions } from '../../../types/data-tasks';

type Row = Record<string, unknown>;

// Direct step tests simulate the runner's internal dry-run dispatch.
const internalDryRunOptions = { dryRun: true } as unknown as DataTaskExecutionOptions;

function matches(row: Row, filter: Row): boolean {
    return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function collection(rows: Row[] = [], indexes: Row[] = []) {
    return {
        find(filter: Row = {}) {
            let selected = rows.filter((row) => matches(row, filter));
            return {
                sort() { return this; },
                limit(value: number) { selected = selected.slice(0, value); return this; },
                batchSize() { return this; },
                toArray: () => Promise.resolve(selected),
            };
        },
        count: (filter: Row = {}) => Promise.resolve(rows.filter((row) => matches(row, filter)).length),
        findOne: (filter: Row) => Promise.resolve(rows.find((row) => matches(row, filter)) ?? null),
        async insertOne(row: Row) { rows.push({ ...row }); return { insertedId: rows.length }; },
        async updateOne(filter: Row, update: Row) {
            const row = rows.find((item) => matches(item, filter));
            if (!row) {
                rows.push({ ...filter, ...(update.$setOnInsert as Row), ...(update.$set as Row) });
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            Object.assign(row, update.$set);
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        },
        async updateMany(filter: Row, update: Row) {
            const selected = rows.filter((row) => matches(row, filter));
            selected.forEach((row) => Object.assign(row, update.$set ?? update));
            return { matchedCount: selected.length, modifiedCount: selected.length };
        },
        async replaceOne(filter: Row, replacement: Row) {
            const index = rows.findIndex((row) => matches(row, filter));
            if (index < 0) rows.push({ ...replacement }); else rows[index] = { ...replacement };
            return { matchedCount: index < 0 ? 0 : 1, modifiedCount: index < 0 ? 0 : 1, upsertedCount: index < 0 ? 1 : 0 };
        },
        async upsertOne(filter: Row, update: Row) { return this.updateOne(filter, update); },
        async createIndex(_key: Row, options: Row = {}) { return options.returnObject ? { name: 'created' } : 'created'; },
        async listIndexes() { return indexes; },
        async aggregate(pipeline: Row[]) {
            const limit = pipeline.find((stage) => typeof stage.$limit === 'number')?.$limit as number | undefined;
            return rows.slice(0, limit ?? rows.length).map((row) => ({ ...row }));
        },
    };
}

function host(collections: Record<string, ReturnType<typeof collection>>, overrides: Row = {}) {
    return {
        collection: (name: string) => collections[name],
        db: () => ({ collection: (name: string) => collections[name] }),
        scopedCollection: (name: string) => collections[name],
        ensureModelIndexes: () => Promise.resolve({
            dryRun: true,
            models: [],
            totals: { declared: 0, existing: 0, missing: 0, created: 0, conflicts: 0, failed: 0, skipped: 0 },
        }),
        tryAcquireLock: () => Promise.resolve(null),
        ...overrides,
    };
}

describe('DataTaskRunner branch behavior', () => {
    it('rejects duplicate snapshot keys and unsafe snapshot documents', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'data-task-snapshot-branches-'));
        try {
            const duplicateSource = collection([
                { _id: 1, email: 'same@example.com', active: true },
                { _id: 2, email: 'same@example.com', active: true },
            ]);
            const runner = new DataTaskRunner(host({ source: duplicateSource, target: collection([]) }));
            const task: DataTaskDefinition = {
                name: 'duplicate-source',
                environment: 'test',
                source: { collection: 'source' },
                target: { collection: 'target' },
                filter: { active: true },
                matchBy: ['email'],
                steps: [{ type: 'syncData' as const }],
            };
            await assert.rejects(() => runner.exportAffected(task, undefined, { snapshotDir: dir }), /duplicate business key/);
            assert.deepEqual(await fs.readdir(dir), []);

            const duplicateTarget = collection([
                { _id: 1, email: 'same@example.com' },
                { _id: 2, email: 'same@example.com' },
            ]);
            const targetRunner = new DataTaskRunner(host({ source: collection([{ _id: 3, email: 'same@example.com', active: true }]), target: duplicateTarget }));
            await assert.rejects(() => targetRunner.exportAffected(task, undefined, { snapshotDir: dir }), /multiple target documents/);
            assert.deepEqual(await fs.readdir(dir), []);

            const unsafe = new DataTaskRunner(host({ target: collection([{ value: 1 }]) }));
            await assert.rejects(() => unsafe.exportAffected({
                name: 'unsafe',
                target: { collection: 'target' },
                filter: { value: 1 },
                steps: [{ type: 'exportAffected' }],
            }, undefined, { snapshotDir: dir }), /require target documents with _id/);
            assert.deepEqual(await fs.readdir(dir), []);
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('handles disabled snapshots and explicit JSONL snapshots', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'data-task-snapshot-config-'));
        const runner = new DataTaskRunner(host({ target: collection([{ _id: 1, active: true }]) }));
        const task: DataTaskDefinition = {
            name: 'snapshot-config',
            target: { collection: 'target' },
            filter: { active: true },
            snapshot: false as const,
            steps: [{ type: 'exportAffected' as const }],
        };
        try {
            await assert.rejects(() => runner.exportAffected(task, undefined, { snapshotDir: dir }), /require snapshot/);
            const skipped = await runner.exportAffected(task, undefined, { snapshotDir: dir, allowRunWithoutSnapshot: true });
            assert.equal(skipped.enabled, false);
            const jsonl = await runner.exportAffected({ ...task, snapshot: { format: 'jsonl' as const } }, undefined, { snapshotDir: dir });
            assert.equal(jsonl.format, 'jsonl');
            assert.match(await fs.readFile(jsonl.path!, 'utf8'), /"before"/);
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('reports count, field, sample, duplicate, and index verification failures', async () => {
        const source = collection([{ _id: 1, email: 'a@example.com', active: true, required: true }]);
        const target = collection([]);
        const runner = new DataTaskRunner(host({ source, target }));
        const invalid = await runner.verify({
            name: 'verify-invalid-plan',
            target: { collection: 'target' },
            steps: [],
        });
        assert.equal(invalid.passed, false);
        assert.match(invalid.errors.join(' '), /steps must be a non-empty array/);

        const missing = await runner.verify({
            name: 'verify-missing',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            steps: [{ type: 'verify', count: true, fields: ['required'], sample: 1 }],
        });
        assert.equal(missing.passed, false);
        assert.equal(missing.checks.find((check) => check.name === 'count')?.passed, false);
        assert.match(missing.mismatches[0].reason, /missing/);

        const duplicateTarget = collection([{ _id: 1, email: 'a@example.com' }, { _id: 2, email: 'a@example.com' }]);
        const duplicate = await new DataTaskRunner(host({ source, target: duplicateTarget })).verify({
            name: 'verify-duplicate',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            steps: [{ type: 'verify', sample: 1 }],
        });
        assert.match(duplicate.mismatches[0].reason, /multiple/);

        const fields = await new DataTaskRunner(host({ target: collection([{ _id: 1, active: true }]) })).verify({
            name: 'verify-fields',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'verify', fields: ['required'] }],
        });
        assert.equal(fields.mismatched, 1);

        const indexRunner = new DataTaskRunner(host({ target: collection([]) }));
        const indexes = await indexRunner.verify({
            name: 'verify-indexes',
            environment: 'test',
            target: { collection: 'target' },
            steps: [
                { type: 'ensureIndexes', indexes: [{ key: { email: 1 } }] },
                { type: 'verify', indexes: true },
            ],
        });
        assert.equal(indexes.passed, false);
        assert.equal(indexes.checks[0].name, 'indexes');
    });

    it('compares merge samples without decomposing BSON, dates, or buffers', async () => {
        const id = new ObjectId();
        const source = collection([{
            _id: 1,
            email: 'merge@example.com',
            active: true,
            scalar: 'value',
            nested: { value: 1 },
            wrongShape: { value: 1 },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            payload: Buffer.from('sample'),
            reference: id,
        }]);
        const target = collection([{
            _id: 2,
            email: 'merge@example.com',
            active: true,
            scalar: 'value',
            nested: { value: 1, targetOnly: true },
            wrongShape: 'not-an-object',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            payload: Buffer.from('sample'),
            reference: new ObjectId(id.toHexString()),
        }]);
        const result = await new DataTaskRunner(host({ source, target })).verify({
            name: 'merge-value-types',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            steps: [
                { type: 'syncData', strategy: 'merge' },
                { type: 'verify', sample: 1 },
            ],
        });
        assert.equal(result.passed, false);
        assert.equal(result.mismatched, 1);
        assert.match(result.mismatches[0].reason, /wrongShape/);
    });

    it('handles dry-run continuation and transform preview failures', async () => {
        const target = collection([{ _id: 1, active: true, value: 1 }]);
        const runner = new DataTaskRunner(host({ target }));
        const dryRun = await runner.dryRun({
            name: 'continue-dry-run',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [
                { type: 'transformFields', transform: () => { throw new Error('first preview failed'); } },
                { type: 'transformFields', transform: () => ({ value: 2 }) },
                { type: 'exportAffected' },
                { type: 'verify', fields: ['value'] },
            ],
        }, { continueOnError: true });
        assert.equal(dryRun.passed, false);
        assert.match(dryRun.errors.join(' '), /first preview failed/);
        assert.ok(dryRun.results.length >= 3);

        const noAggregate = collection([{ _id: 1, active: true }]);
        delete (noAggregate as Partial<typeof noAggregate>).aggregate;
        await assert.rejects(() => new DataTaskRunner(host({ target: noAggregate })).transformFields({
            name: 'no-aggregate',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'transformFields', pipeline: [{ $set: { value: 1 } }] }],
        }, undefined, internalDryRunOptions), /requires collection.aggregate/);

        const cardinality = collection([{ _id: 1, active: true }]);
        cardinality.aggregate = async () => [];
        await assert.rejects(() => new DataTaskRunner(host({ target: cardinality })).transformFields({
            name: 'cardinality',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'transformFields', pipeline: [{ $set: { value: 1 } }] }],
        }, undefined, internalDryRunOptions), /changed the sample cardinality/);

        const missingId = await new DataTaskRunner(host({ target: collection([{ active: true }]) })).transformFields({
            name: 'missing-id',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'transformFields', transform: () => ({ value: 2 }) }],
        });
        assert.equal(missingId.passed, false);
        assert.match(missingId.errors[0], /with _id/);
    });

    it('routes every top-level dry-run and run step and enforces production gates', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'data-task-routing-branches-'));
        const source = collection([{ _id: 1, email: 'a@example.com', active: true }]);
        const target = collection([]);
        const runner = new DataTaskRunner(host({ source, target }));
        const task: DataTaskDefinition = {
            name: 'all-routes',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            steps: [
                { type: 'ensureIndexes' as const, indexes: [{ key: { email: 1 } }] },
                { type: 'syncData' as const },
                { type: 'transformFields' as const, update: { $set: { migrated: true } } },
                { type: 'exportAffected' as const },
                { type: 'verify' as const, count: true, fields: ['migrated'] },
            ],
        };
        try {
            const dryRun = await runner.dryRun(task, { continueOnError: true, snapshotDir: dir });
            assert.equal(dryRun.results.length, 5);
            const stepNames = dryRun.results.slice(0, 4).map((result) => 'step' in result ? result.step : undefined);
            assert.deepEqual(stepNames, ['ensureIndexes', 'syncData', 'transformFields', 'exportAffected']);
            const deferredVerify = dryRun.results[4];
            assert.ok('mode' in deferredVerify);
            assert.equal(deferredVerify.mode, 'verify');
            assert.equal(deferredVerify.passed, true);
            assert.match(dryRun.warnings.join(' '), /verify steps are deferred/);

            const run = await runner.run(task, { snapshotDir: dir });
            assert.equal(run.passed, true, JSON.stringify(run));
            assert.equal(run.results.length, 5);
            assert.equal(run.status, 'passed');

            await assert.rejects(() => runner.run({ ...task, environment: undefined }), /explicit environment/);
            await assert.rejects(() => runner.run({ ...task, environment: 'production' }), /confirmProduction/);
            await assert.rejects(
                () => runner.run({ ...task, environment: 'production' }, { confirmProduction: true }),
                /approvedSnapshotChecksum/,
            );
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });

    it('continues per-document sync and transform failures only when requested', async () => {
        const source = collection([
            { _id: 1, email: 'duplicate@example.com', active: true },
            { _id: 2, email: 'new@example.com', active: true },
        ]);
        const target = collection([
            { _id: 10, email: 'duplicate@example.com' },
            { _id: 11, email: 'duplicate@example.com' },
        ]);
        const runner = new DataTaskRunner(host({ source, target }));
        const sync = await runner.syncData({
            name: 'continue-sync',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { active: true },
            matchBy: ['email'],
            steps: [{ type: 'syncData' }],
        }, undefined, { continueOnError: true });
        assert.equal(sync.passed, false);
        assert.equal(sync.failed, 1);
        assert.equal(sync.processed, 2);
        assert.equal(sync.inserted, 1);

        const transformTarget = collection([{ active: true }, { _id: 2, active: true }]);
        const transformed = await new DataTaskRunner(host({ target: transformTarget })).transformFields({
            name: 'continue-transform',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'transformFields', transform: () => ({ migrated: true }) }],
        }, undefined, { continueOnError: true });
        assert.equal(transformed.failed, 1);
        assert.equal(transformed.modified, 1);

        const noPatch = await new DataTaskRunner(host({ target: collection([{ _id: 1, active: true }]) })).transformFields({
            name: 'no-patch',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'transformFields', transform: () => null }],
        });
        assert.equal(noPatch.modified, 0);
        const idOnly = await new DataTaskRunner(host({ target: collection([{ _id: 1, active: true }]) })).transformFields({
            name: 'id-only',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            steps: [{ type: 'transformFields', transform: () => ({ _id: 2 }) }],
        });
        assert.equal(idOnly.modified, 0);
    });

    it('summarizes model indexes and honors index conflict policies', async () => {
        const summary = {
            dryRun: false,
            models: [{
                result: {
                    existing: [{ declared: { key: { a: 1 }, options: { name: 'a_1' } } }],
                    missing: [{ key: { b: 1 }, options: { name: 'b_1' } }],
                    created: [{ name: 'c_1', declared: { key: { c: 1 } } }],
                    conflicts: [{ declared: { key: { d: 1 }, options: { name: 'd_1' } }, reason: 'different' }],
                },
            }],
            totals: { declared: 4, existing: 1, missing: 1, created: 1, conflicts: 1, failed: 1, skipped: 0 },
        };
        const runner = new DataTaskRunner(host({ target: collection([]) }, { ensureModelIndexes: () => Promise.resolve(summary) }));
        const modelResult = await runner.syncIndexes({
            name: 'model-indexes',
            environment: 'test',
            target: { collection: 'target' },
            steps: [{ type: 'ensureIndexes', model: 'User' }],
        });
        assert.equal(modelResult.passed, false);
        assert.equal(modelResult.operations.length, 4);
        assert.match(modelResult.errors[0], /operations failed/);

        const drySummary = {
            dryRun: true,
            models: [{
                result: {
                    existing: [],
                    missing: [{ key: { pending: 1 }, options: { name: 'pending_1' } }],
                    created: [],
                    conflicts: [],
                },
            }],
            totals: { declared: 1, existing: 0, missing: 1, created: 0, conflicts: 0, failed: 0, skipped: 0 },
        };
        const dryModelResult = await new DataTaskRunner(
            host({ target: collection([]) }, { ensureModelIndexes: () => Promise.resolve(drySummary) }),
        ).syncIndexes({
            name: 'model-indexes-dry-run',
            environment: 'test',
            target: { collection: 'target' },
            steps: [{ type: 'ensureIndexes', models: ['User'] }],
        }, undefined, internalDryRunOptions);
        assert.equal(dryModelResult.passed, true);
        assert.equal(dryModelResult.operations[0].status, 'dry-run');
        assert.deepEqual(dryModelResult.errors, []);

        const conflictCollection = collection([], [{ name: 'same', key: { a: 1 }, unique: false }]);
        const conflictRunner = new DataTaskRunner(host({ target: conflictCollection }));
        await assert.rejects(() => conflictRunner.syncIndexes({
            name: 'throw-conflict',
            environment: 'test',
            target: { collection: 'target' },
            steps: [{ type: 'ensureIndexes', conflictPolicy: 'throw', indexes: [{ key: { b: 1 }, name: 'same' }] }],
        }, undefined, internalDryRunOptions), /index conflict/);
    });

    it('fails lock acquisition and lock renewal errors without writing', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'data-task-lock-branches-'));
        const target = collection([{ _id: 1, active: true, value: 1 }]);
        const task: DataTaskDefinition = {
            name: 'lock-failure',
            environment: 'test',
            target: { collection: 'target' },
            filter: { active: true },
            lock: 'task-lock',
            steps: [{ type: 'transformFields' as const, async transform() { await wait(20); return { value: 2 }; } }],
        };
        try {
            await assert.rejects(() => new DataTaskRunner(host({ target })).run(task, { snapshotDir: dir }), /lock is already held/);

            const lock = {
                released: false,
                renew: () => Promise.reject(new Error('renew transport failed')),
                async release() { this.released = true; return true; },
            };
            const renewing = new DataTaskRunner(host({ target }, { tryAcquireLock: () => Promise.resolve(lock) }));
            const result = await renewing.run(
                { ...task, lock: { ttlMs: 30, renewIntervalMs: 5, scope: 'process' } },
                { snapshotDir: dir },
            );
            assert.equal(result.passed, false);
            assert.match(result.errors.join(' '), /lock renewal failed/);
            assert.equal((await target.findOne({ _id: 1 }))?.value, 1);

            const releasedLock = {
                released: true,
                renew: () => Promise.resolve(true),
                release: () => Promise.resolve(true),
            };
            const released = await new DataTaskRunner(
                host({ target }, { tryAcquireLock: () => Promise.resolve(releasedLock) }),
            ).run({
                    name: 'released-lock',
                    environment: 'test',
                    target: { collection: 'target' },
                    lock: true,
                    steps: [{ type: 'ensureIndexes', indexes: [{ key: { value: 1 } }] }],
                });
            assert.equal(released.passed, false);
            assert.match(released.errors.join(' '), /released before task completion/);

            let renewCount = 0;
            const healthyLock = {
                released: false,
                renew: () => { renewCount += 1; return Promise.resolve(true); },
                async release() { this.released = true; return true; },
            };
            const healthyRunner = new DataTaskRunner(host({ target }, { tryAcquireLock: () => Promise.resolve(healthyLock) }));
            const healthy = await healthyRunner.run({
                name: 'healthy-lock',
                environment: 'test',
                target: { collection: 'target' },
                filter: { active: true },
                lock: { ttlMs: 30, renewIntervalMs: 5 },
                steps: [{ type: 'transformFields', async transform() { await wait(12); return {}; } }],
            }, { snapshotDir: dir });
            assert.equal(healthy.passed, true);
            assert.ok(renewCount >= 1);
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
