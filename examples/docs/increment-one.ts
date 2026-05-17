/**
 * incrementOne — atomic field increment/decrement with result.
 * See: docs/increment-one.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/increment-one.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface CounterDoc { name: string; value: number; total?: number; }

async function main() {
    const { msq, server } = await setupExample('example-increment-one');
    const counters = msq.collection<CounterDoc>('counters');

    // ── Seed ───────────────────────────────────────────────────────────────
    await counters.insertMany([
        { name: 'page-views', value: 1000, total: 5000 },
        { name: 'likes', value: 42 },
        { name: 'downloads', value: 250 },
    ]);

    // ── Basic increment ────────────────────────────────────────────────────
    console.log('=== Basic increment ===');
    const r1 = await counters.incrementOne({ name: 'page-views' }, 'value', 1);
    console.log(`  page-views: ${r1.value?.value} (matched: ${r1.matchedCount}, modified: ${r1.modifiedCount})`);

    // ── Increment by N ────────────────────────────────────────────────────
    console.log('\n=== Increment by 10 ===');
    const r2 = await counters.incrementOne({ name: 'likes' }, 'value', 10);
    console.log(`  likes: ${r2.value?.value} (expected 52)`);

    // ── Decrement (negative increment) ────────────────────────────────────
    console.log('\n=== Decrement ===');
    const r3 = await counters.incrementOne({ name: 'downloads' }, 'value', -5);
    console.log(`  downloads: ${r3.value?.value} (expected 245)`);

    // ── Increment multiple fields at once ─────────────────────────────────
    console.log('\n=== Increment multiple fields ===');
    const r4 = await counters.incrementOne(
        { name: 'page-views' },
        { value: 1, total: 1 },  // increment both fields simultaneously
    );
    console.log(`  value: ${r4.value?.value}, total: ${r4.value?.total}`);

    // ── returnDocument: 'before' — get value BEFORE increment ─────────────
    console.log('\n=== returnDocument: before ===');
    const before = await counters.incrementOne(
        { name: 'likes' },
        'value',
        1,
        { returnDocument: 'before' },
    );
    console.log(`  value before increment: ${before.value?.value} (same as current - 1)`);

    // ── Not found — value is null ──────────────────────────────────────────
    console.log('\n=== No match ===');
    const notFound = await counters.incrementOne({ name: 'nonexistent' }, 'value', 1);
    console.log(`  acknowledged: ${notFound.acknowledged} | matched: ${notFound.matchedCount} | value: ${notFound.value}`);

    // ── With $set options — update other fields during increment ──────────
    console.log('\n=== increment + $set ===');
    const withSet = await counters.incrementOne(
        { name: 'downloads' },
        'value',
        100,
        { $set: { updatedAt: new Date().toISOString() } },
    );
    console.log(`  downloads after bulk bump: ${withSet.value?.value}`);
    console.log(`  updatedAt set: ${!!(withSet.value as Record<string, unknown> | null)?.updatedAt}`);

    await teardownExample(msq, server);
    console.log('\n✅ incrementOne example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
