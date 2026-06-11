/**
 * Runtime events example: on(), once(), off(), emit(), and slow-query events.
 * See: docs/events.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/events.js
 */
import { setupExample, teardownExample } from '../helpers/bootstrap.js';

type EventPayload = Record<string, unknown>;

function asPayload(payload: unknown): EventPayload {
    return (payload && typeof payload === 'object') ? payload as EventPayload : {};
}

async function main() {
    const { msq, server } = await setupExample('example-events', {
        slowQueryLog: {
            enabled: true,
            storage: { type: 'memory' },
            batch: { enabled: false, size: 1, interval: 50, maxBufferSize: 100 },
            filter: {
                excludeDatabases: [],
                excludeCollections: [],
                excludeOperations: [],
                minExecutionTimeMs: 0,
            },
        },
    });

    const slowQueries: EventPayload[] = [];
    const queryEvents: EventPayload[] = [];
    const customEvents: EventPayload[] = [];
    const errorEvents: EventPayload[] = [];
    const closedEvents: EventPayload[] = [];

    const slowQueryHandler = (payload: unknown) => slowQueries.push(asPayload(payload));
    const customHandler = (payload: unknown) => customEvents.push(asPayload(payload));
    const errorHandler = (payload: unknown) => errorEvents.push(asPayload(payload));
    const closedHandler = (payload: unknown) => closedEvents.push(asPayload(payload));

    const onceQuery = new Promise<void>((resolve) => {
        msq.once('query', (payload) => {
            queryEvents.push(asPayload(payload));
            resolve();
        });
    });

    msq.on('slow-query', slowQueryHandler);
    msq.on('example:custom', customHandler);
    msq.on('error', errorHandler);
    msq.on('closed', closedHandler);

    try {
        await msq.recordSlowQuery({
            database: 'example-events',
            collection: 'event_users',
            operation: 'find',
            durationMs: 42,
            query: { status: 'active' },
        });
        await onceQuery;

        msq.emit('example:custom', { requestId: 'req-1', stage: 'before-off' });
        msq.off('example:custom', customHandler);
        msq.emit('example:custom', { requestId: 'req-2', stage: 'after-off' });

        msq.emit('error', {
            type: 'example',
            db: 'example-events',
            error: 'manual diagnostic event',
        });
        msq.off('slow-query', slowQueryHandler);
        msq.off('error', errorHandler);
    } finally {
        await teardownExample(msq, server);
    }

    const firstSlowQuery = slowQueries[0];
    const firstQuery = queryEvents[0];
    const closedPayload = closedEvents[0];

    console.log('slow-query events:', slowQueries.length);
    console.log('query once events:', queryEvents.length);
    console.log('custom events after off:', customEvents.length);
    console.log('error events:', errorEvents.length);
    console.log('closed events:', closedEvents.length);
    console.log('slow-query collection:', firstSlowQuery?.collection);
    console.log('query operation:', firstQuery?.operation);
    console.log('closed db:', closedPayload?.db);
    console.log('Events example complete');
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
