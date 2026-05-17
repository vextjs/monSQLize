/**
 * upsertOne() example.
 * See: docs/upsert-one.md
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

interface CounterDoc {
    key: string;
    value: number;
}

async function main() {
    const { msq, server } = await setupExample('example-upsert-one');
    const counters = msq.collection<CounterDoc>('counters');

    const insertResult = await counters.upsertOne(
        { key: 'page_views' },
        { $inc: { value: 1 } },
        { $setOnInsert: { key: 'page_views', value: 1 } },
    );
    const updateResult = await counters.upsertOne(
        { key: 'page_views' },
        { $inc: { value: 1 } },
        { $setOnInsert: { key: 'page_views', value: 1 } },
    );

    const finalDoc = await counters.findOne({ key: 'page_views' });

    console.log('First call inserted:', Boolean(insertResult.upsertedId));
    console.log('Second call modified:', updateResult.modifiedCount);
    console.log('Final counter:', finalDoc?.value);

    await teardownExample(msq, server);
    console.log('✅ upsertOne example complete');
}

main().catch((err) => {
    console.error('❌ Example failed:', err);
    process.exit(1);
});
