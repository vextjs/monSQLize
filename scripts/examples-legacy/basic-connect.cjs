const MonSQLize = require('../../lib/index.js');
const { createMemoryServerBootstrap } = require('../../test/bootstrap/memory-server');

async function main() {
    const bootstrap = createMemoryServerBootstrap({ dbName: 'monsqlize_example_quick_start' });
    const context = await bootstrap.setup();
    const runtime = new MonSQLize({
        type: 'mongodb',
        databaseName: 'docs_quick_start',
        config: { uri: context.uri },
    });

    try {
        await runtime.connect();
        const users = runtime.collection('users');

        await users.insertOne({
            username: 'ada',
            email: 'ada@example.com',
            createdAt: new Date('2026-05-10T00:00:00.000Z'),
        });

        const user = await users.findOne({ email: 'ada@example.com' });
        console.log(JSON.stringify({
            ok: true,
            namespace: users.getNamespace(),
            user: {
                username: user.username,
                email: user.email,
            },
        }, null, 2));
    } finally {
        await runtime.close().catch(() => undefined);
        await bootstrap.teardown().catch(() => undefined);
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    main,
};

