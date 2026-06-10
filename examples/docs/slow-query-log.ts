/**
 * Slow query log configuration and query example.
 * See: docs/slow-query-log.md
 *
 * The slow query log records operations that exceed a configurable threshold.
 * Logs are stored in-memory (for examples) or in a MongoDB collection (production).
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/slow-query-log.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

async function main() {
    const { msq, server } = await setupExample('example-slow-query', {
        slowQueryLog: {
            enabled: true,
            storage: {
                // 'memory' storage for examples keeps the run self-contained.
                type: 'memory',
            },
            batch: {
                enabled: false, // Disable batching so records are available immediately
                size: 1,
                interval: 50,
                maxBufferSize: 100,
            },
            filter: {
                excludeDatabases: [],
                excludeCollections: [],
                excludeOperations: [],
                minExecutionTimeMs: 0, // Capture all queries for this example
            },
        },
    });

    const products = msq.collection('products');

    await products.insertMany(
        Array.from({ length: 20 }, (_, i) => ({
            name: `Product-${i + 1}`,
            price: (i + 1) * 5,
            category: ['tools', 'parts', 'electronics'][i % 3],
        })),
    );

    // Manually record slow queries to simulate slow operations.
    await msq.recordSlowQuery({
        database: 'example-slow-query',
        collection: 'products',
        operation: 'find',
        durationMs: 850,
        query: { category: 'tools' },
    });

    await msq.recordSlowQuery({
        database: 'example-slow-query',
        collection: 'products',
        operation: 'find',
        durationMs: 1200,
        query: { category: 'tools' },
    });

    await msq.recordSlowQuery({
        database: 'example-slow-query',
        collection: 'products',
        operation: 'findOne',
        durationMs: 600,
        query: { name: 'Product-10' },
    });

    // Query the slow log.
    const logs = await msq.getSlowQueryLogs({ collection: 'products' }, { limit: 10 });
    console.log('Slow query log entries:');
    for (const entry of logs) {
        console.log(`  ${entry.collection}.${entry.operation} - count:${entry.count} avg:${entry.avgTimeMs}ms max:${entry.maxTimeMs}ms`);
    }

    // Filter by operation.
    const findLogs = await msq.getSlowQueryLogs({ operation: 'find' }, { limit: 5 });
    console.log('\nOnly "find" entries:', findLogs.length);

    // Get the slow query log manager directly.
    const manager = msq.getSlowQueryLogManager();
    console.log('\nManager available:', manager !== null);

    await teardownExample(msq, server);
    console.log('Slow query log example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
