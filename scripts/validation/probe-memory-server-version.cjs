const {
    configureMemoryServerEnv,
    createMemoryServerDbPath,
    memoryServerCleanupOptions,
    resolveMemoryServerLaunchTimeoutMs,
    seedMemoryServerBinaryCache,
} = require('./memory-server-policy.cjs');

const version = process.argv[2];

if (!version) {
    console.error('Usage: node probe-memory-server-version.cjs <mongodb-version>');
    process.exit(1);
}

(async () => {
    configureMemoryServerEnv(version);
    await seedMemoryServerBinaryCache(version);
    const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server');
    const launchTimeout = resolveMemoryServerLaunchTimeoutMs();

    let server = null;
    let repl = null;

    try {
        server = await MongoMemoryServer.create({
            binary: { version },
            instance: {
                dbName: 'monsqlize_matrix_probe',
                dbPath: createMemoryServerDbPath('probe-single', 'monsqlize_matrix_probe'),
                ...(launchTimeout ? { launchTimeout } : {}),
            },
        });
        await server.stop(memoryServerCleanupOptions());
        server = null;

        repl = await MongoMemoryReplSet.create({
            binary: { version },
            instanceOpts: [
                {
                    dbPath: createMemoryServerDbPath('probe-replset', 'monsqlize_matrix_probe'),
                    ...(launchTimeout ? { launchTimeout } : {}),
                },
            ],
            replSet: { count: 1, dbName: 'monsqlize_matrix_probe' },
        });
        await repl.stop(memoryServerCleanupOptions());
        repl = null;
    } finally {
        if (repl) {
            await repl.stop(memoryServerCleanupOptions()).catch(() => undefined);
        }
        if (server) {
            await server.stop(memoryServerCleanupOptions()).catch(() => undefined);
        }
    }

    console.log(`OK ${version}`);
})().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
