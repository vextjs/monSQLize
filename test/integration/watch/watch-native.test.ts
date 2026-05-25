import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { createReplSetBootstrap } from '../../bootstrap/replset-server';

const MonSQLize = require('../../../dist/cjs/index.cjs');

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEvent<T>(
    emitter: NodeJS.EventEmitter,
    event: string,
    timeoutMs = 5000,
): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Timed out waiting for event '${event}' after ${timeoutMs}ms`));
        }, timeoutMs);
        emitter.once(event, (data: T) => {
            clearTimeout(timer);
            resolve(data);
        });
        emitter.once('error', (err: Error) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

describe('watch-native integration', () => {
    const bootstrap = createReplSetBootstrap({ dbName: 'monsqlize_watch' });
    let uri = '';
    let runtime: any = null;
    let client: MongoClient | null = null;

    before(async () => {
        const ctx = await bootstrap.setup();
        uri = ctx.uri;
    });

    after(async () => {
        if (client) {
            await client.close().catch(() => {});
            client = null;
        }
        if (runtime) {
            await runtime.close().catch(() => {});
            runtime = null;
        }
        await bootstrap.teardown();
    });

    beforeEach(async () => {
        if (runtime) {
            await runtime.close().catch(() => {});
        }
        runtime = new MonSQLize({
            type: 'mongodb',
            databaseName: 'watch_test_db',
            config: { uri },
        });
        await runtime.connect();
        await runtime.collection('watch_docs').deleteMany({});
    });

    // ── basic change stream ────────────────────────────────────────────────────

    describe('basic watch()', () => {
        it('watch() returns a ChangeStream that emits change events on insert', async () => {
            const col = runtime.collection('watch_docs');
            const stream = col.watch();
            const changePromise = waitForEvent<any>(stream, 'change');

            await sleep(50);
            await col.insertOne({ kind: 'test-insert', val: 1 });

            const change = await changePromise;
            await stream.close();

            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument?.kind, 'test-insert');
            assert.equal(change.fullDocument?.val, 1);
        });

        it('watch() emits change event on updateOne', async () => {
            const col = runtime.collection('watch_docs');
            await col.insertOne({ kind: 'upd-seed', counter: 0 });

            const stream = col.watch([], { fullDocument: 'updateLookup' });
            const changePromise = waitForEvent<any>(stream, 'change');

            await sleep(50);
            await col.updateOne({ kind: 'upd-seed' }, { $set: { counter: 99 } });

            const change = await changePromise;
            await stream.close();

            assert.equal(change.operationType, 'update');
            assert.equal(change.fullDocument?.counter, 99);
        });

        it('watch() emits change event on deleteOne', async () => {
            const col = runtime.collection('watch_docs');
            await col.insertOne({ kind: 'del-seed' });

            const stream = col.watch();
            const changePromise = waitForEvent<any>(stream, 'change');

            await sleep(50);
            await col.deleteOne({ kind: 'del-seed' });

            const change = await changePromise;
            await stream.close();

            assert.equal(change.operationType, 'delete');
            assert.ok(change.documentKey?._id);
        });
    });

    // ── pipeline filtering ──────────────────────────────────────────────────────

    describe('watch() with pipeline', () => {
        it('pipeline filter restricts events to matching documents', async () => {
            const col = runtime.collection('watch_docs');
            const stream = col.watch([
                { $match: { 'fullDocument.tag': 'important' } },
            ]);

            const received: any[] = [];
            stream.on('change', (c: any) => received.push(c));

            await sleep(50);
            await col.insertOne({ tag: 'noise', val: 1 });
            await col.insertOne({ tag: 'important', val: 2 });
            await sleep(200);

            await stream.close();

            assert.equal(received.length, 1);
            assert.equal(received[0].fullDocument?.tag, 'important');
        });

        it('empty pipeline receives all insert/update/delete changes', async () => {
            const col = runtime.collection('watch_docs');
            const stream = col.watch([]);

            const received: any[] = [];
            stream.on('change', (c: any) => received.push(c));

            await sleep(50);
            await col.insertOne({ order: 1 });
            await col.insertOne({ order: 2 });
            await sleep(200);

            await stream.close();

            assert.equal(received.length >= 2, true);
            const ops = received.map((c) => c.operationType);
            assert.ok(ops.every((op: string) => op === 'insert'));
        });
    });

    // ── stream lifecycle ───────────────────────────────────────────────────────

    describe('ChangeStream lifecycle', () => {
        it('close() stops the stream from receiving further events', async () => {
            const col = runtime.collection('watch_docs');
            const stream = col.watch();

            const received: any[] = [];
            stream.on('change', (c: any) => received.push(c));

            await sleep(50);
            await col.insertOne({ step: 1 });
            await sleep(100);
            await stream.close();

            const countAfterClose = received.length;
            await col.insertOne({ step: 2 });
            await sleep(100);

            assert.equal(received.length, countAfterClose);
        });

        it('collects two sequential insert events from the stream', async () => {
            const col = runtime.collection('watch_docs');
            const stream = col.watch();

            const received: any[] = [];
            const twoEvents = new Promise<void>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Timed out waiting for 2 events')), 5000);
                stream.on('change', (c: any) => {
                    received.push(c);
                    if (received.length >= 2) { clearTimeout(timer); resolve(); }
                });
                stream.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
            });

            await sleep(50);
            await col.insertOne({ seq: 1 });
            await col.insertOne({ seq: 2 });

            await twoEvents;
            await stream.close();

            assert.equal(received.length, 2);
            assert.equal(received[0].operationType, 'insert');
            assert.equal(received[1].operationType, 'insert');
            const seqs = received.map((c) => c.fullDocument?.seq).sort();
            assert.deepEqual(seqs, [1, 2]);
        });
    });

    // ── model watch() ──────────────────────────────────────────────────────────

    describe('model.watch()', () => {
        it('model instance watch() is equivalent to collection watch()', async () => {
            MonSQLize.Model.define('watch_items', {
                schema: (dsl: any) => dsl({}),
            });
            const model = runtime.model('watch_items');
            await model.deleteMany({});

            const stream = model.watch();
            const changePromise = waitForEvent<any>(stream, 'change');

            await sleep(50);
            await model.insertOne({ name: 'alpha' });

            const change = await changePromise;
            await stream.close();
            MonSQLize.Model._clear();

            assert.equal(change.operationType, 'insert');
            assert.equal(change.fullDocument?.name, 'alpha');
        });
    });
});
