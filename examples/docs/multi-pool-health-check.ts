/**
 * Multi-pool health check example with a fake client factory.
 * See: docs/multi-pool-health-check.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/multi-pool-health-check.js
 */
import MonSQLize from 'monsqlize';

type ExamplePoolManagerOptions =
    ConstructorParameters<typeof MonSQLize.ConnectionPoolManager>[0] & {
        clientFactory: (config: { name: string }) => Promise<unknown>;
        healthCheckFn: (poolName: string) => Promise<boolean>;
    };

function createFakeClient(name: string) {
    return {
        name,
        connect() {
            return Promise.resolve(this);
        },
        db(databaseName: string) {
            return {
                databaseName,
                collection(collectionName: string) {
                    return { databaseName, collectionName };
                },
            };
        },
        close() {
            return Promise.resolve(true);
        },
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => boolean, message: string, timeoutMs = 3000, intervalMs = 25) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (check()) {
            return;
        }
        await sleep(intervalMs);
    }
    throw new Error(message);
}

async function main() {
    let analyticsHealthy = true;
    const manager = new MonSQLize.ConnectionPoolManager({
        poolStrategy: 'auto',
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'primary',
            retryDelay: 50,
            maxRetries: 1,
        },
        clientFactory: (config) => Promise.resolve(createFakeClient(config.name)),
        healthCheckFn: (poolName) => Promise.resolve(poolName !== 'analytics' || analyticsHealthy),
    } as ExamplePoolManagerOptions);

    try {
        await manager.addPool({
            name: 'primary',
            uri: 'mongodb://primary',
            role: 'primary',
            healthCheck: { interval: 5, retries: 1 },
        });
        await manager.addPool({
            name: 'analytics',
            uri: 'mongodb://analytics',
            role: 'secondary',
            tags: ['analytics'],
            healthCheck: { interval: 5, retries: 1 },
        });

        manager.startHealthCheck();
        await waitFor(
            () => manager.getHealthStatus().analytics?.status === 'up',
            'analytics pool did not start healthy',
        );

        console.log('Initial analytics status:', manager.getHealthStatus().analytics.status);

        analyticsHealthy = false;
        await waitFor(
            () => manager.getHealthStatus().analytics?.status === 'down',
            'analytics pool did not go down',
        );
        console.log('Analytics status after failure:', manager.getHealthStatus().analytics.status);
        console.log('Selected read pool after failure:', manager.selectPool('read').name);

        analyticsHealthy = true;
        await waitFor(
            () => manager.getHealthStatus().analytics?.status === 'up',
            'analytics pool did not recover',
        );
        const recovered = manager.selectPool('read', { pool: 'analytics' });
        const stats = manager.getPoolStats();

        console.log('Analytics status after recovery:', manager.getHealthStatus().analytics.status);
        console.log('Manual analytics selection:', recovered.name);
        console.log('Analytics total requests:', stats.analytics.totalRequests);
        console.log('Pool health check example complete');
    } finally {
        await manager.close();
    }
}

main().catch((err) => {
    console.error('Example failed:', err);
    process.exit(1);
});
