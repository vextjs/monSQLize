import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type DocumentRecord = Record<string, unknown>;

function findChain(documents: DocumentRecord[]) {
    let result = [...documents];
    return {
        sort(sort: DocumentRecord) {
            const entries = Object.entries(sort);
            result.sort((left, right) => {
                for (const [field, direction] of entries) {
                    const comparison = String(left[field]).localeCompare(String(right[field]));
                    if (comparison !== 0) return comparison * Number(direction);
                }
                return 0;
            });
            return this;
        },
        limit(limit: number) {
            result = result.slice(0, limit);
            return this;
        },
        toArray() {
            return Promise.resolve(result);
        },
        batchSize() {
            return this;
        },
    };
}

function matches(document: DocumentRecord, filter: DocumentRecord): boolean {
    return Object.entries(filter).every(([key, value]) => document[key] === value);
}

function createCollection(documents: DocumentRecord[] = [], calls: string[] = []) {
    return {
        find(filter: DocumentRecord = {}) {
            return findChain(documents.filter((document) => matches(document, filter)));
        },
        count(filter: DocumentRecord = {}) {
            return Promise.resolve(documents.filter((document) => matches(document, filter)).length);
        },
        findOne(filter: DocumentRecord) {
            return Promise.resolve(documents.find((document) => matches(document, filter)) ?? null);
        },
        stream(filter: DocumentRecord = {}, options: DocumentRecord = {}) {
            calls.push(`stream:${String(options.batchSize ?? '')}`);
            const selected = documents.filter((document) => matches(document, filter));
            return {
                async *[Symbol.asyncIterator]() {
                    for (const document of selected) yield document;
                },
                destroy() {},
            };
        },
        async aggregate(pipeline: DocumentRecord[] = []) {
            let selected = documents.map((document) => ({ ...document }));
            for (const stage of pipeline) {
                if (stage.$match) selected = selected.filter((document) => matches(document, stage.$match as DocumentRecord));
                if (stage.$sort) selected = await findChain(selected).sort(stage.$sort as DocumentRecord).toArray();
                if (typeof stage.$limit === 'number') selected = selected.slice(0, stage.$limit);
                if (stage.$set) selected = selected.map((document) => ({ ...document, ...(stage.$set as DocumentRecord) }));
                if (stage.$unset) {
                    const fields = Array.isArray(stage.$unset) ? stage.$unset : [stage.$unset];
                    selected = selected.map((document) => {
                        const next = { ...document };
                        for (const field of fields) delete next[String(field)];
                        return next;
                    });
                }
            }
            return selected;
        },
        async insertOne(document: DocumentRecord) {
            documents.push({ ...document });
            return { insertedId: document._id ?? documents.length };
        },
        async updateOne(filter: DocumentRecord, update: DocumentRecord) {
            const target = documents.find((document) => matches(document, filter));
            if (!target) {
                documents.push({ ...filter, ...(update.$setOnInsert as DocumentRecord), ...(update.$set as DocumentRecord) });
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            if ((update.$set as DocumentRecord | undefined)?._id !== undefined) {
                throw new Error('immutable _id update');
            }
            Object.assign(target, update.$set);
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        },
        async updateMany(filter: DocumentRecord, update: DocumentRecord) {
            const matched = documents.filter((document) => matches(document, filter));
            for (const document of matched) {
                Object.assign(document, update.$set ?? update);
            }
            return { matchedCount: matched.length, modifiedCount: matched.length };
        },
        async replaceOne(filter: DocumentRecord, replacement: DocumentRecord) {
            const index = documents.findIndex((document) => matches(document, filter));
            if (index === -1) {
                documents.push({ ...replacement });
                return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
            }
            if (replacement._id !== undefined && replacement._id !== documents[index]._id) {
                throw new Error('immutable _id replace');
            }
            documents[index] = { ...replacement };
            return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        },
        async upsertOne(filter: DocumentRecord, update: DocumentRecord) {
            return this.updateOne(filter, update);
        },
        async listIndexes(): Promise<DocumentRecord[]> {
            calls.push('listIndexes');
            return [];
        },
        async createIndex() {
            calls.push('createIndex');
            return 'email_1';
        },
    };
}

function createHost(
    collections: Record<string, ReturnType<typeof createCollection>>,
    lockFactory?: () => DocumentRecord,
) {
    return {
        collection(name: string) {
            return collections[name];
        },
        db() {
            return {
                collection(name: string) {
                    return collections[name];
                },
            };
        },
        scopedCollection(name: string) {
            return collections[name];
        },
        ensureModelIndexes() {
            return Promise.resolve({
                dryRun: true,
                models: [],
                totals: { declared: 0, existing: 0, missing: 0, created: 0, conflicts: 0, failed: 0, skipped: 0 },
            });
        },
        tryAcquireLock() {
            return Promise.resolve(lockFactory?.() ?? null);
        },
    };
}

describe('dataTasks', () => {
    it('plans safety gates for production, filters, snapshots, and cross-endpoint matchBy', async () => {
        const runner = new MonSQLize.DataTaskRunner({});
        const plan = await runner.plan({
            name: 'production-users-sync',
            environment: 'production',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            matchBy: ['email'],
            steps: [{ type: 'syncData' }],
        });

        assert.equal(plan.requiresProductionConfirmation, true);
        assert.equal(plan.requiresSnapshot, true);
        assert.equal(plan.requiresSnapshotApproval, true);
        assert.equal(plan.isProduction, true);
        assert.equal(plan.passed, true);
        assert.equal(plan.errors.length, 0);

        const noFilter = await runner.plan({
            name: 'missing-filter',
            environment: 'test',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            matchBy: ['email'],
            steps: [{ type: 'syncData' }],
        });
        assert.match(noFilter.errors.join(' '), /requires filter/);

        const missingBusinessKey = await runner.plan({
            name: 'missing-business-key',
            environment: 'test',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            steps: [{ type: 'syncData' }],
        });
        assert.match(missingBusinessKey.errors.join(' '), /requires business matchBy/);
    });

    it('keeps helper methods behind the same safety gates', async () => {
        const source = createCollection([{ _id: 1, email: 'a@example.com', status: 'active' }]);
        const target = createCollection([]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ sourceUsers: source, targetUsers: target }));

        await assert.rejects(
            () => runner.syncData({
                name: 'helper-without-filter',
                environment: 'test',
                source: { collection: 'sourceUsers' },
                target: { collection: 'targetUsers' },
                matchBy: ['email'],
                steps: [{ type: 'syncData' }],
            }),
            /requires filter/,
        );

        const dryRun = await runner.syncData({
            name: 'helper-dry-run',
            environment: 'test',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            matchBy: ['email'],
            snapshot: false,
            steps: [{ type: 'syncData' }],
        }, undefined, { dryRun: true });

        assert.equal(dryRun.inserted, 1);
        assert.equal(await target.count({}), 0);
    });

    it('lists indexes before creating missing explicit indexes', async () => {
        const calls: string[] = [];
        const target = createCollection([], calls);
        const runner = new MonSQLize.DataTaskRunner(createHost({ users: target }));
        const task = {
            name: 'users-indexes',
            environment: 'test',
            target: { collection: 'users' },
            steps: [
                {
                    type: 'ensureIndexes' as const,
                    indexes: [{ key: { email: 1 }, options: { unique: true }, name: 'email_1' }],
                },
            ],
        };

        const dryRun = await runner.syncIndexes(task, undefined, { dryRun: true });
        assert.deepEqual(calls, ['listIndexes']);
        assert.equal(dryRun.missing, 1);
        assert.equal(dryRun.created, 0);
        assert.equal(dryRun.operations[0]?.status, 'dry-run');

        const run = await runner.syncIndexes(task);
        assert.deepEqual(calls, ['listIndexes', 'listIndexes', 'createIndex']);
        assert.equal(run.created, 1);
    });

    it('exports affected target documents before data writes', async () => {
        const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-'));
        const target = createCollection([{ _id: 1, status: 'active', email: 'a@example.com' }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ users: target }));

        const snapshot = await runner.exportAffected({
            name: 'snapshot-users',
            target: { collection: 'users' },
            filter: { status: 'active' },
            steps: [{ type: 'exportAffected' }],
        }, undefined, { snapshotDir });

        assert.equal(snapshot.enabled, true);
        assert.equal(snapshot.passed, true);
        assert.equal(snapshot.count, 1);
        assert.equal(snapshot.existingCount, 1);
        assert.equal(snapshot.insertCandidates, 0);
        assert.ok(snapshot.path);
        assert.ok(snapshot.manifestPath);
        assert.match(snapshot.checksum ?? '', /^[a-f0-9]{64}$/);
        const content = await fs.readFile(snapshot.path!, 'utf8');
        assert.match(content, /a@example.com/);
        const manifest = JSON.parse(await fs.readFile(snapshot.manifestPath!, 'utf8'));
        assert.equal(manifest.checksum, snapshot.checksum);
        await fs.rm(snapshotDir, { recursive: true, force: true });
    });

    it('does not mutate target _id when syncing by a business key', async () => {
        const source = createCollection([
            { _id: 'source-a', email: 'a@example.com', status: 'active', name: 'Ada' },
            { _id: 'source-b', email: 'b@example.com', status: 'active', name: 'Bob' },
        ]);
        const target = createCollection([{ _id: 'target-a', email: 'a@example.com', status: 'active', name: 'Old Ada' }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ sourceUsers: source, targetUsers: target }));
        const task = {
            name: 'business-key-sync',
            environment: 'test',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            matchBy: ['email'],
            steps: [{ type: 'syncData' as const, allowSourceIdMatch: true }],
        };

        const result = await runner.syncData(task);

        assert.equal(result.updated, 1);
        assert.equal(result.inserted, 1);
        const existing = await target.findOne({ email: 'a@example.com' });
        const inserted = await target.findOne({ email: 'b@example.com' });
        assert.equal(existing?._id, 'target-a');
        assert.equal(inserted?._id, 'source-b');
    });

    it('requires an explicit write environment and never downgrades a production process', async () => {
        const runner = new MonSQLize.DataTaskRunner({});
        const missingEnvironment = await runner.plan({
            name: 'missing-environment',
            target: { collection: 'users' },
            steps: [{ type: 'ensureIndexes', indexes: [{ key: { email: 1 } }] }],
        });
        assert.equal(missingEnvironment.passed, false);
        assert.match(missingEnvironment.errors.join(' '), /explicit environment/);

        const previous = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            const production = await runner.plan({
                name: 'cannot-downgrade',
                environment: 'development',
                target: { collection: 'users' },
                steps: [{ type: 'ensureIndexes', indexes: [{ key: { email: 1 } }] }],
            });
            assert.equal(production.isProduction, true);
            assert.equal(production.requiresProductionConfirmation, true);
        } finally {
            if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
        }

        await assert.rejects(() => runner.run({
            name: 'use-dry-run-method',
            environment: 'test',
            target: { collection: 'users' },
            steps: [{ type: 'ensureIndexes', indexes: [{ key: { email: 1 } }] }],
        }, { dryRun: true }), /call dryRun\(\) instead/);
    });

    it('compares compound index order and extended index options', async () => {
        const target = createCollection([]);
        target.listIndexes = async () => [{
            name: 'account_created',
            key: { accountId: 1, createdAt: -1 },
            unique: true,
            wildcardProjection: { internal: 0 },
        }];
        const runner = new MonSQLize.DataTaskRunner(createHost({ users: target }));
        const equivalent = await runner.syncIndexes({
            name: 'index-order',
            environment: 'test',
            target: { collection: 'users' },
            steps: [{
                type: 'ensureIndexes',
                indexes: [{
                    key: { accountId: 1, createdAt: -1 },
                    name: 'account_created',
                    options: { unique: true, wildcardProjection: { internal: 0 } },
                }],
            }],
        }, undefined, { dryRun: true });
        assert.equal(equivalent.existing, 1);
        assert.equal(equivalent.conflicts, 0);

        const reversed = await runner.syncIndexes({
            name: 'index-order-reversed',
            environment: 'test',
            target: { collection: 'users' },
            steps: [{
                type: 'ensureIndexes',
                indexes: [{ key: { createdAt: -1, accountId: 1 }, name: 'account_created', options: { unique: true } }],
            }],
        }, undefined, { dryRun: true });
        assert.equal(reversed.passed, false);
        assert.equal(reversed.conflicts, 1);
    });

    it('snapshots actual matchBy targets and records insert candidates', async () => {
        const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-match-'));
        const source = createCollection([
            { _id: 'source-a', email: 'a@example.com', status: 'active', name: 'New Ada' },
            { _id: 'source-b', email: 'b@example.com', status: 'active', name: 'Bob' },
        ]);
        const target = createCollection([{ _id: 'target-a', email: 'a@example.com', status: 'legacy', name: 'Old Ada' }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ sourceUsers: source, targetUsers: target }));
        try {
            const snapshot = await runner.exportAffected({
                name: 'match-by-snapshot',
                environment: 'production',
                source: { collection: 'sourceUsers' },
                target: { collection: 'targetUsers' },
                filter: { status: 'active' },
                matchBy: ['email'],
                steps: [{ type: 'syncData' }],
            }, undefined, { snapshotDir });
            const entries = (await fs.readFile(snapshot.path!, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
            assert.equal(snapshot.existingCount, 1);
            assert.equal(snapshot.insertCandidates, 1);
            assert.equal(entries[0].before._id, 'target-a');
            assert.equal(entries[0].before.name, 'Old Ada');
            assert.equal(entries[1].before, null);
            assert.deepEqual(entries[1].match, { email: 'b@example.com' });
        } finally {
            await fs.rm(snapshotDir, { recursive: true, force: true });
        }
    });

    it('requires the reviewed production snapshot checksum before writing', async () => {
        const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-approval-'));
        const source = createCollection([{ _id: 1, email: 'a@example.com', status: 'active', name: 'Ada' }]);
        const target = createCollection([]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ sourceUsers: source, targetUsers: target }));
        const task = {
            name: 'production-approval',
            environment: 'production',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            matchBy: ['email'],
            steps: [{ type: 'syncData' as const }],
        };
        try {
            const reviewed = await runner.exportAffected(task, undefined, { snapshotDir });
            await assert.rejects(
                () => runner.run(task, { confirmProduction: true, approvedSnapshotChecksum: '0'.repeat(64), snapshotDir }),
                /checksum does not match/,
            );
            assert.equal(await target.count({}), 0);

            const run = await runner.run(task, {
                confirmProduction: true,
                approvedSnapshotChecksum: reviewed.checksum,
                snapshotDir,
            });
            assert.equal(run.passed, true);
            assert.equal(run.status, 'passed');
            assert.equal(await target.count({ email: 'a@example.com' }), 1);
        } finally {
            await fs.rm(snapshotDir, { recursive: true, force: true });
        }
    });

    it('uses batchSize for bounded source iteration', async () => {
        const calls: string[] = [];
        const source = createCollection(Array.from({ length: 5 }, (_, index) => ({
            _id: index + 1,
            email: `user-${index}@example.com`,
            status: 'active',
        })), calls);
        const target = createCollection([]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ sourceUsers: source, targetUsers: target }));
        const result = await runner.syncData({
            name: 'bounded-batches',
            environment: 'test',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            filter: { status: 'active' },
            matchBy: ['email'],
            batchSize: 2,
            steps: [{ type: 'syncData' }],
        });
        assert.equal(result.passed, true);
        assert.equal(result.processed, 5);
        assert.equal(result.batchCount, 3);
        assert.ok(calls.includes('stream:2'));
    });

    it('propagates callback failures to the top-level run result', async () => {
        const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-failure-'));
        const target = createCollection([{ _id: 1, status: 'active' }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ users: target }));
        try {
            const run = await runner.run({
                name: 'callback-failure',
                environment: 'test',
                target: { collection: 'users' },
                filter: { status: 'active' },
                steps: [{ type: 'transformFields', transform: () => Promise.reject(new Error('transform failed')) }],
            }, { snapshotDir });
            assert.equal(run.passed, false);
            assert.equal(run.status, 'failed');
            assert.match(run.errors.join(' '), /transform failed/);
        } finally {
            await fs.rm(snapshotDir, { recursive: true, force: true });
        }
    });

    it('keeps merge, upsert, and replace strategies distinct', async () => {
        const source = createCollection([{ _id: 'source', email: 'a@example.com', profile: { name: 'Ada' }, status: 'active' }]);
        const mergeTarget = createCollection([{ _id: 'target', email: 'a@example.com', profile: { name: 'Old', role: 'admin' }, local: true }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ source, mergeTarget }));
        const baseTask = {
            name: 'strategy-semantics',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'mergeTarget' },
            filter: { status: 'active' },
            matchBy: ['email'],
        };
        const merged = await runner.syncData({ ...baseTask, steps: [{ type: 'syncData' as const, strategy: 'merge' as const }] });
        assert.equal(merged.updated, 1);
        assert.deepEqual((await mergeTarget.findOne({ email: 'a@example.com' }))?.profile, { name: 'Ada', role: 'admin' });
        assert.equal((await mergeTarget.findOne({ email: 'a@example.com' }))?.local, true);

        const replaced = await runner.syncData({ ...baseTask, steps: [{ type: 'syncData' as const, strategy: 'replace' as const }] });
        const replacement = await mergeTarget.findOne({ email: 'a@example.com' });
        assert.equal(replaced.replaced, 1);
        assert.equal(replacement?._id, 'target');
        assert.equal(replacement?.local, undefined);
    });

    it('produces before and after samples for operator, pipeline, and callback dry-runs', async () => {
        const target = createCollection([{ _id: 1, status: 'active', score: 1, name: 'Ada' }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ users: target }));
        const base = {
            name: 'transform-preview',
            environment: 'test',
            target: { collection: 'users' },
            filter: { status: 'active' },
        };
        const operator = await runner.transformFields({ ...base, steps: [{ type: 'transformFields' as const, update: { $inc: { score: 2 } } }] }, undefined, { dryRun: true });
        assert.equal(operator.sampled[0].after.score, 3);
        const pipeline = await runner.transformFields({ ...base, steps: [{ type: 'transformFields' as const, pipeline: [{ $set: { name: 'Grace' } }] }] }, undefined, { dryRun: true });
        assert.equal(pipeline.sampled[0].after.name, 'Grace');
        const callback = await runner.transformFields({ ...base, steps: [{ type: 'transformFields' as const, transform: () => ({ name: 'Lin' }) }] }, undefined, { dryRun: true });
        assert.equal(callback.sampled[0].after.name, 'Lin');
    });

    it('uses verify.sample and reports business-key mismatches', async () => {
        const source = createCollection([{ _id: 'source', email: 'a@example.com', status: 'active', name: 'Ada' }]);
        const target = createCollection([{ _id: 'target', email: 'a@example.com', status: 'active', name: 'Wrong' }]);
        const runner = new MonSQLize.DataTaskRunner(createHost({ source, target }));
        const result = await runner.verify({
            name: 'verify-sample',
            environment: 'test',
            source: { collection: 'source' },
            target: { collection: 'target' },
            filter: { status: 'active' },
            matchBy: ['email'],
            steps: [{ type: 'verify', sample: 1 }],
        });
        assert.equal(result.passed, false);
        assert.equal(result.checked, 1);
        assert.equal(result.mismatched, 1);
        assert.match(result.mismatches[0].reason, /sample fields differ/);
    });

    it('renews task locks and blocks writes after ownership is lost', async () => {
        const snapshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'monsqlize-data-task-lock-'));
        const target = createCollection([{ _id: 1, status: 'active', value: 1 }]);
        let releaseCount = 0;
        const runner = new MonSQLize.DataTaskRunner(createHost({ users: target }, () => ({
            released: false,
            renew: () => Promise.resolve(false),
            release() {
                this.released = true;
                releaseCount += 1;
                return Promise.resolve(true);
            },
        })));
        try {
            const run = await runner.run({
                name: 'lost-lock',
                environment: 'test',
                target: { collection: 'users' },
                filter: { status: 'active' },
                lock: { ttlMs: 30, renewIntervalMs: 5, scope: 'process' },
                steps: [{
                    type: 'transformFields',
                    async transform() {
                        await wait(20);
                        return { value: 2 };
                    },
                }],
            }, { snapshotDir });
            assert.equal(run.passed, false);
            assert.match(run.errors.join(' '), /lock ownership was lost/);
            assert.equal((await target.findOne({ _id: 1 }))?.value, 1);
            assert.equal(releaseCount, 1);
        } finally {
            await fs.rm(snapshotDir, { recursive: true, force: true });
        }
    });
});
