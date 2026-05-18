/**
 * Pool fallback / recovery example.
 * See: docs/failure-recovery-examples.md
 *
 * Run:
 *   npm run build && tsc -p tsconfig.examples.json
 *   node .generated/examples-dist/examples/docs/pool-fallback.js
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
    let analyticsDown = false;
    const manager = new MonSQLize.ConnectionPoolManager({
        poolStrategy: 'auto',
        poolFallback: {
            enabled: true,
            fallbackStrategy: 'primary',
            retryDelay: 50,
            maxRetries: 1,
        },
        clientFactory: (config) => Promise.resolve(createFakeClient(config.name)),
        healthCheckFn: (poolName) => Promise.resolve(!(analyticsDown && poolName === 'analytics')),
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
            role: 'analytics',
            healthCheck: { interval: 5, retries: 1 },
        });

        manager.startHealthCheck();

        console.log('=== Pool fallback / recovery ===');
        console.log(`  Initial read pool: ${manager.selectPool('read').name}`);

        analyticsDown = true;
        await waitFor(
            () => ['degraded', 'down'].includes(manager.getHealthStatus().analytics?.status),
            'analytics pool did not become unhealthy in time',
        );
        console.log(`  Read pool after analytics degraded: ${manager.selectPool('read').name}`);

        analyticsDown = false;
        await waitFor(
            () => manager.getHealthStatus().analytics?.status === 'up',
            'analytics pool did not recover in time',
        );
        console.log(`  Read pool after recovery: ${manager.selectPool('read').name}`);
        console.log('✅ Pool fallback example complete');
    } finally {
        await manager.close();
    }
}

main().catch((error) => {
    console.error('❌ Example failed:', error);
    process.exit(1);
});
