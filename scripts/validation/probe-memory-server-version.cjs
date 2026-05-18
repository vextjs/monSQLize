const { MongoMemoryServer, MongoMemoryReplSet } = require('mongodb-memory-server');

const version = process.argv[2];

if (!version) {
    console.error('Usage: node probe-memory-server-version.cjs <mongodb-version>');
    process.exit(1);
}

(async () => {
    const server = await MongoMemoryServer.create({ binary: { version } });
    await server.stop();

    const repl = await MongoMemoryReplSet.create({
        binary: { version },
        replSet: { count: 1, dbName: 'monsqlize_matrix_probe' },
    });
    await repl.stop();

    console.log(`OK ${version}`);
})().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});
