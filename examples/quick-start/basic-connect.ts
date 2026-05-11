import MonSQLize from 'monsqlize';
import path from 'node:path';

/**
 * 当前仓库内存 MongoDB bootstrap 的最小类型描述。
 */
type MemoryBootstrap = {
    setup(): Promise<{ uri: string; external: boolean; }>;
    teardown(): Promise<boolean>;
    getUri(): string | null;
};

const { createMemoryServerBootstrap } = require(path.resolve(process.cwd(), 'test/bootstrap/memory-server.js')) as {
    createMemoryServerBootstrap(options?: { uri?: string; dbName?: string; }): MemoryBootstrap;
};

/**
 * 运行最小连接与查询示例。
 *
 * @returns {Promise<void>}
 * @since v1.3.0
 */
async function main(): Promise<void> {
    const bootstrap = createMemoryServerBootstrap({ dbName: 'monsqlize_example_quick_start_ts' });
    const context = await bootstrap.setup();
    const runtime = new MonSQLize({
        type: 'mongodb',
        databaseName: 'docs_quick_start_ts',
        config: { uri: context.uri },
    });

    try {
        await runtime.connect();
        const users = runtime.collection<{ username: string; email: string; createdAt: Date; }>('users');

        await users.insertOne({
            username: 'ada',
            email: 'ada@example.com',
            createdAt: new Date('2026-05-10T00:00:00.000Z'),
        });

        const user = await users.findOne({ email: 'ada@example.com' });
        console.log(JSON.stringify({
            ok: true,
            namespace: users.getNamespace(),
            user: user ? {
                username: user.username,
                email: user.email,
            } : null,
        }, null, 2));
    } finally {
        await runtime.close().catch(() => undefined);
        await bootstrap.teardown().catch(() => undefined);
    }
}

if (require.main === module) {
    void main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

export { main };

