const {
    configureMemoryServerEnv,
    createMemoryServerDbPath,
    resolveMemoryServerLaunchTimeoutMs,
    seedMemoryServerBinaryCache,
    stopMemoryServerWithCleanup,
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
    let serverDbPath = null;
    let replDbPath = null;

    try {
        serverDbPath = createMemoryServerDbPath('probe-single', 'monsqlize_matrix_probe');
        server = await MongoMemoryServer.create({
            binary: { version },
            instance: {
                dbName: 'monsqlize_matrix_probe',
                dbPath: serverDbPath,
                ...(launchTimeout ? { launchTimeout } : {}),
            },
        });
        await stopMemoryServerWithCleanup(server, serverDbPath);
        server = null;

        replDbPath = createMemoryServerDbPath('probe-replset', 'monsqlize_matrix_probe');
        repl = await MongoMemoryReplSet.create({
            binary: { version },
            instanceOpts: [
                {
                    dbPath: replDbPath,
                    ...(launchTimeout ? { launchTimeout } : {}),
                },
            ],
            replSet: { count: 1, dbName: 'monsqlize_matrix_probe' },
        });
        await stopMemoryServerWithCleanup(repl, replDbPath);
        repl = null;
    } finally {
        if (repl) {
            await stopMemoryServerWithCleanup(repl, replDbPath).catch(() => undefined);
        }
        if (server) {
            await stopMemoryServerWithCleanup(server, serverDbPath).catch(() => undefined);
        }
    }

    console.log(`OK ${version}`);
})().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
