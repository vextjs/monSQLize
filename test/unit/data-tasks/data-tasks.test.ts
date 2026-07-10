import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MonSQLize = require('../../../dist/cjs/index.cjs');

type DocumentRecord = Record<string, unknown>;

function findChain(documents: DocumentRecord[]) {
    let result = [...documents];
    return {
        sort() {
            return this;
        },
        limit(limit: number) {
            result = result.slice(0, limit);
            return this;
        },
        toArray() {
            return Promise.resolve(result);
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
        async listIndexes() {
            calls.push('listIndexes');
            return [];
        },
        async createIndex() {
            calls.push('createIndex');
            return 'email_1';
        },
    };
}

function createHost(collections: Record<string, ReturnType<typeof createCollection>>) {
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
            return Promise.resolve(null);
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
        assert.equal(plan.errors.length, 0);

        const noFilter = await runner.plan({
            name: 'missing-filter',
            source: { collection: 'sourceUsers' },
            target: { collection: 'targetUsers' },
            matchBy: ['email'],
            steps: [{ type: 'syncData' }],
        });
        assert.match(noFilter.errors.join(' '), /requires filter/);

        const missingBusinessKey = await runner.plan({
            name: 'missing-business-key',
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
                source: { collection: 'sourceUsers' },
                target: { collection: 'targetUsers' },
                matchBy: ['email'],
                steps: [{ type: 'syncData' }],
            }),
            /requires filter/,
        );

        const dryRun = await runner.syncData({
            name: 'helper-dry-run',
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
        assert.equal(snapshot.count, 1);
        assert.ok(snapshot.path);
        assert.match(snapshot.checksum ?? '', /^[a-f0-9]{64}$/);
        const content = await fs.readFile(snapshot.path!, 'utf8');
        assert.match(content, /a@example.com/);
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
});
